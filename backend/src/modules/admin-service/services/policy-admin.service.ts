import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DispatchMode,
  Prisma,
  Role,
  Severity,
  type EscalationRule,
  type SeverityFactor,
} from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { BAND_SETTINGS, MEASURED_FACTORS } from '../../../shared/config/policy-keys';
import type {
  UpdateBandsDto,
  UpdateEscalationRuleDto,
  UpdateSeverityFactorDto,
} from '../validation/policy.dto';
import { THRESHOLD_LIMITS, TIMEOUT_LIMITS, WEIGHT_LIMITS } from '../validation/policy.dto';

type Person = { id: string; name: string } | null;

export interface RuleRow {
  severity: Severity;
  tier: number;
  responderRole: Role;
  timeoutSeconds: number | null;
  dispatchMode: DispatchMode;
  smsFallbackImmediate: boolean;
  /** The end of this severity's chain: no time limit, nowhere further to go. */
  last: boolean;
  updatedAt: string;
}

export interface FactorRow {
  key: string;
  label: string;
  description: string | null;
  weight: number;
  enabled: boolean;
  /** Whether this build knows how to measure it. One it cannot is scored as zero. */
  measured: boolean;
  updatedAt: string;
}

export interface PolicyChangeRow {
  id: string;
  area: string;
  target: string;
  before: unknown;
  after: unknown;
  at: string;
  by: Person;
}

/** The whole escalation policy as an administrator reads and edits it. */
export interface PolicyView {
  escalationRules: RuleRow[];
  severityFactors: FactorRow[];
  bands: {
    elevatedFrom: number;
    criticalFrom: number;
    /** Still the configured values: no administrator has set them. */
    fromConfiguration: boolean;
    setAt: string | null;
    setBy: Person;
  };
  /** The highest score an alert can reach: the sum of the enabled weights. */
  maxScore: number;
  limits: {
    timeoutSeconds: { min: number; max: number };
    weight: { min: number; max: number };
    threshold: { min: number; max: number };
  };
  /** Who changed what, newest first. */
  changes: PolicyChangeRow[];
}

const SEVERITY_ORDER: Severity[] = [Severity.STANDARD, Severity.ELEVATED, Severity.CRITICAL];

/** The bands as administrators see them: ELEVATED is called High everywhere a person reads it. */
const BAND_WORD: Record<Severity, string> = {
  [Severity.STANDARD]: 'Standard',
  [Severity.ELEVATED]: 'High',
  [Severity.CRITICAL]: 'Critical',
};

/**
 * The escalation policy editor: the rules each severity escalates by, the weights behind
 * a severity score, and the scores at which each band starts.
 *
 * Every change is checked against what would keep the system working (a chain that can
 * still climb, a CRITICAL band an alert can still reach), saved with a record of who
 * made it and what it was before, and read by the escalation and scoring processes from
 * the next alert or tier on. An alert's current deadline is never moved.
 */
@Injectable()
export class PolicyAdminService {
  private readonly logger = new Logger(PolicyAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async view(): Promise<PolicyView> {
    const [rules, factors, settings, changes] = await Promise.all([
      this.prisma.escalationRule.findMany(),
      this.prisma.severityFactor.findMany({ orderBy: { weight: 'desc' } }),
      this.prisma.policySetting.findMany({
        where: { key: { in: [BAND_SETTINGS.elevatedFrom.key, BAND_SETTINGS.criticalFrom.key] } },
        include: { updatedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.policyChange.findMany({
        orderBy: { changedAt: 'desc' },
        take: 50,
        include: { changedBy: { select: { id: true, name: true } } },
      }),
    ]);

    const lastTier = new Map<Severity, number>();
    for (const rule of rules) {
      lastTier.set(rule.severity, Math.max(lastTier.get(rule.severity) ?? 0, rule.tierOrder));
    }
    const sortedRules = [...rules].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        a.tierOrder - b.tierOrder,
    );

    const elevated = settings.find((s) => s.key === BAND_SETTINGS.elevatedFrom.key);
    const critical = settings.find((s) => s.key === BAND_SETTINGS.criticalFrom.key);
    const latest = [elevated, critical]
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

    return {
      escalationRules: sortedRules.map((rule) => ({
        severity: rule.severity,
        tier: rule.tierOrder,
        responderRole: rule.responderRole,
        timeoutSeconds: rule.timeoutSeconds,
        dispatchMode: rule.dispatchMode,
        smsFallbackImmediate: rule.smsFallbackImmediate,
        last: rule.tierOrder === lastTier.get(rule.severity),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      severityFactors: factors.map((factor) => ({
        key: factor.key,
        label: factor.label,
        description: factor.description,
        weight: factor.weight,
        enabled: factor.enabled,
        measured: (MEASURED_FACTORS as readonly string[]).includes(factor.key),
        updatedAt: factor.updatedAt.toISOString(),
      })),
      bands: {
        elevatedFrom: elevated?.value ?? this.configured('elevatedFrom'),
        criticalFrom: critical?.value ?? this.configured('criticalFrom'),
        fromConfiguration: !elevated && !critical,
        setAt: latest?.updatedAt.toISOString() ?? null,
        setBy: latest?.updatedBy ?? null,
      },
      maxScore: PolicyAdminService.maxScore(factors),
      limits: {
        timeoutSeconds: { ...TIMEOUT_LIMITS },
        weight: { ...WEIGHT_LIMITS },
        threshold: { ...THRESHOLD_LIMITS },
      },
      changes: changes.map((change) => ({
        id: change.id,
        area: change.area,
        target: change.target,
        before: change.before,
        after: change.after,
        at: change.changedAt.toISOString(),
        by: change.changedBy,
      })),
    };
  }

  /** One tier of one severity: its time limit, how it is asked, and whether texts go at once. */
  async updateRule(
    severity: Severity,
    tier: number,
    dto: UpdateEscalationRuleDto,
    actorId: string,
  ): Promise<PolicyView> {
    const rules = await this.prisma.escalationRule.findMany({ where: { severity } });
    const rule = rules.find((r) => r.tierOrder === tier);
    if (!rule)
      throw new NotFoundException(`There is no tier ${tier} for ${BAND_WORD[severity]} alerts.`);
    const last = rule.tierOrder === Math.max(...rules.map((r) => r.tierOrder));

    const next = {
      timeoutSeconds: dto.timeoutSeconds === undefined ? rule.timeoutSeconds : dto.timeoutSeconds,
      dispatchMode: dto.dispatchMode ?? rule.dispatchMode,
      smsFallbackImmediate: dto.smsFallbackImmediate ?? rule.smsFallbackImmediate,
    };

    if (last && next.timeoutSeconds !== null) {
      throw new BadRequestException(
        'The last tier is the end of the chain, so it has no time limit.',
      );
    }
    if (!last && next.timeoutSeconds === null) {
      throw new BadRequestException(
        'Every tier but the last needs a time limit, or the alert would stop climbing.',
      );
    }
    if (tier === 1 && next.dispatchMode === DispatchMode.PARALLEL) {
      throw new BadRequestException(
        'Tier 1 is asked first, so it cannot be asked alongside a tier before it.',
      );
    }

    const before = PolicyAdminService.ruleValues(rule);
    if (JSON.stringify(before) === JSON.stringify(next)) return this.view();

    await this.prisma.$transaction([
      this.prisma.escalationRule.update({ where: { id: rule.id }, data: next }),
      this.prisma.policyChange.create({
        data: {
          changedById: actorId,
          area: 'escalation_rule',
          target: `${severity} tier ${tier}`,
          before,
          after: next,
        },
      }),
    ]);
    this.logger.log(`Escalation rule ${severity} tier ${tier} changed by ${actorId}`);
    return this.view();
  }

  /** One severity factor's weight, or whether it counts at all. */
  async updateFactor(
    key: string,
    dto: UpdateSeverityFactorDto,
    actorId: string,
  ): Promise<PolicyView> {
    const factors = await this.prisma.severityFactor.findMany();
    const factor = factors.find((f) => f.key === key);
    if (!factor) throw new NotFoundException(`There is no severity factor called "${key}".`);
    if (!(MEASURED_FACTORS as readonly string[]).includes(key)) {
      throw new BadRequestException(
        `This version cannot measure "${key}", so changing its weight would have no effect.`,
      );
    }

    const next = { weight: dto.weight ?? factor.weight, enabled: dto.enabled ?? factor.enabled };
    const before = { weight: factor.weight, enabled: factor.enabled };
    if (before.weight === next.weight && before.enabled === next.enabled) return this.view();

    const maxScore = PolicyAdminService.maxScore(
      factors.map((f) => (f.key === key ? { ...f, ...next } : f)),
    );
    const { criticalFrom } = await this.bands();
    if (maxScore < criticalFrom) {
      throw new BadRequestException(
        `Critical starts at ${criticalFrom}, but the weights in use would add up to only ` +
          `${maxScore}, so no alert could reach it. Lower where Critical starts first.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.severityFactor.update({ where: { key }, data: next }),
      this.prisma.policyChange.create({
        data: { changedById: actorId, area: 'severity_factor', target: key, before, after: next },
      }),
    ]);
    this.logger.log(`Severity factor ${key} changed by ${actorId}`);
    return this.view();
  }

  /** The scores at which ELEVATED and CRITICAL start. */
  async updateBands(dto: UpdateBandsDto, actorId: string): Promise<PolicyView> {
    if (dto.elevatedFrom >= dto.criticalFrom) {
      throw new BadRequestException('High must start below Critical.');
    }
    const factors = await this.prisma.severityFactor.findMany();
    const maxScore = PolicyAdminService.maxScore(factors);
    if (dto.criticalFrom > maxScore) {
      throw new BadRequestException(
        `The weights in use add up to ${maxScore}, so Critical cannot start above that.`,
      );
    }

    const before = await this.bands();
    const next = { elevatedFrom: dto.elevatedFrom, criticalFrom: dto.criticalFrom };
    if (before.elevatedFrom === next.elevatedFrom && before.criticalFrom === next.criticalFrom) {
      return this.view();
    }

    const upsert = (key: string, value: number) =>
      this.prisma.policySetting.upsert({
        where: { key },
        create: { key, value, updatedById: actorId },
        update: { value, updatedById: actorId },
      });
    await this.prisma.$transaction([
      upsert(BAND_SETTINGS.elevatedFrom.key, next.elevatedFrom),
      upsert(BAND_SETTINGS.criticalFrom.key, next.criticalFrom),
      this.prisma.policyChange.create({
        data: { changedById: actorId, area: 'severity_band', target: 'bands', before, after: next },
      }),
    ]);
    this.logger.log(`Severity bands changed by ${actorId}`);
    return this.view();
  }

  private async bands(): Promise<{ elevatedFrom: number; criticalFrom: number }> {
    const rows = await this.prisma.policySetting.findMany({
      where: { key: { in: [BAND_SETTINGS.elevatedFrom.key, BAND_SETTINGS.criticalFrom.key] } },
    });
    return {
      elevatedFrom:
        rows.find((r) => r.key === BAND_SETTINGS.elevatedFrom.key)?.value ??
        this.configured('elevatedFrom'),
      criticalFrom:
        rows.find((r) => r.key === BAND_SETTINGS.criticalFrom.key)?.value ??
        this.configured('criticalFrom'),
    };
  }

  private configured(which: keyof typeof BAND_SETTINGS): number {
    const setting = BAND_SETTINGS[which];
    return this.config.get<number>(setting.env, setting.fallback);
  }

  private static ruleValues(rule: EscalationRule): Prisma.JsonObject {
    return {
      timeoutSeconds: rule.timeoutSeconds,
      dispatchMode: rule.dispatchMode,
      smsFallbackImmediate: rule.smsFallbackImmediate,
    };
  }

  private static maxScore(factors: Pick<SeverityFactor, 'weight' | 'enabled' | 'key'>[]): number {
    return factors
      .filter((f) => f.enabled && (MEASURED_FACTORS as readonly string[]).includes(f.key))
      .reduce((total, f) => total + f.weight, 0);
  }
}
