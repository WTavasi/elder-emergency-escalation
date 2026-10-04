import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareLevel, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distanceInMetres } from '../common/geo';
import { isInsideCoverWindow, isNight, localParts } from '../common/time';
import type { FactorOutcome, SeverityAssessment, SeverityContext } from './severity.types';

/**
 * Severity as a transparent weighted policy.
 *
 * The system has one input, a panic button, so severity cannot come from what happened.
 * It comes from who the person is and the circumstances of the press. Weights live in
 * the severity_factors table rather than in this file, so an administrator can change
 * the policy without a deployment and the policy can be printed as a table.
 *
 * Deliberately not a learned model: there is no labelled data, and a score that cannot
 * be explained to the person it escalated is not worth having.
 */
@Injectable()
export class SeverityService {
  private readonly logger = new Logger(SeverityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async evaluate(context: SeverityContext): Promise<SeverityAssessment> {
    const factors = await this.prisma.severityFactor.findMany({
      where: { enabled: true },
      orderBy: { weight: 'desc' },
    });

    const outcomes: FactorOutcome[] = [];

    for (const factor of factors) {
      const measured = this.measure(factor.key, context);
      if (!measured) {
        // A weight exists for something this build does not know how to measure.
        // Scoring it as zero silently would understate severity, so say so.
        this.logger.warn(`No implementation for severity factor "${factor.key}"; scored as 0`);
        outcomes.push({
          key: factor.key,
          label: factor.label,
          weight: factor.weight,
          value: 0,
          contribution: 0,
          detail: 'not implemented in this build',
        });
        continue;
      }

      outcomes.push({
        key: factor.key,
        label: factor.label,
        weight: factor.weight,
        value: measured.value,
        contribution: Math.round(factor.weight * measured.value),
        detail: measured.detail,
      });
    }

    const score = outcomes.reduce((total, outcome) => total + outcome.contribution, 0);
    return { score, band: this.band(score), factors: outcomes };
  }

  /**
   * Severity may rise but never fall. Re-evaluation happens once, when the cancel
   * window passes untouched, and that can only add evidence that the person is in
   * trouble. Letting a band drop would mean an alert quietly de-escalating itself.
   */
  highestOf(first: Severity, second: Severity): Severity {
    const order: Severity[] = [Severity.STANDARD, Severity.ELEVATED, Severity.CRITICAL];
    return order.indexOf(first) >= order.indexOf(second) ? first : second;
  }

  private band(score: number): Severity {
    if (score >= this.config.get<number>('SEVERITY_CRITICAL_FROM', 60)) return Severity.CRITICAL;
    if (score >= this.config.get<number>('SEVERITY_ELEVATED_FROM', 35)) return Severity.ELEVATED;
    return Severity.STANDARD;
  }

  private measure(key: string, context: SeverityContext): { value: number; detail: string } | null {
    switch (key) {
      case 'care_level':
        return this.careLevel(context);
      case 'no_cancel_in_grace_window':
        return {
          value: context.cancelWindowElapsed ? 1 : 0,
          detail: context.cancelWindowElapsed
            ? 'cancel window passed without a response'
            : 'cancel window still open',
        };
      case 'time_of_day':
        return this.timeOfDay(context);
      case 'caregiver_outside_cover':
        return this.caregiverCover(context);
      case 'away_from_home':
        return this.awayFromHome(context);
      case 'recent_activity':
        return {
          value: context.recentEventCount > 0 ? 1 : 0,
          detail: `${context.recentEventCount} recent or open prior alert(s)`,
        };
      default:
        return null;
    }
  }

  private careLevel(context: SeverityContext): { value: number; detail: string } {
    switch (context.careLevel) {
      case CareLevel.HIGH_DEPENDENCY:
        return { value: 1, detail: 'high dependency' };
      case CareLevel.ASSISTED:
        return { value: 0.5, detail: 'assisted' };
      case CareLevel.INDEPENDENT:
        return { value: 0, detail: 'independent' };
      default:
        // An unset care level is treated as the middle, not as zero. Absence of
        // information is not evidence that the person is fine.
        return { value: 0.5, detail: 'care level not recorded, treated as assisted' };
    }
  }

  private timeOfDay(context: SeverityContext): { value: number; detail: string } {
    const startHour = this.config.get<number>('NIGHT_START_HOUR', 22);
    const endHour = this.config.get<number>('NIGHT_END_HOUR', 6);
    const local = localParts(context.at, context.timezone);
    const night = isNight(local.hour, startHour, endHour);

    return {
      value: night ? 1 : 0,
      detail: `${String(local.hour).padStart(2, '0')}:${String(local.minutesOfDay % 60).padStart(2, '0')} local, ${night ? 'night' : 'daytime'}`,
    };
  }

  private caregiverCover(context: SeverityContext): { value: number; detail: string } {
    if (context.coverWindows.length === 0) {
      return { value: 1, detail: 'no cover declared by any caregiver' };
    }

    const local = localParts(context.at, context.timezone);
    const covered = context.coverWindows.some((window) => isInsideCoverWindow(window, local));

    return {
      value: covered ? 0 : 1,
      detail: covered ? 'inside a declared cover window' : 'outside every declared cover window',
    };
  }

  private awayFromHome(context: SeverityContext): { value: number; detail: string } {
    if (!context.homeLocation) {
      // No registered home means the question cannot be answered, and guessing
      // "away" would inflate severity for every elder whose address is missing.
      return { value: 0, detail: 'no registered home address' };
    }

    const threshold = this.config.get<number>('AWAY_FROM_HOME_METRES', 250);
    const metres = distanceInMetres(context.homeLocation, context.alertLocation);

    return {
      value: metres > threshold ? 1 : 0,
      detail: `${metres} m from the registered home`,
    };
  }
}
