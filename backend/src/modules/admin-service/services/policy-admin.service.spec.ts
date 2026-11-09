import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DispatchMode, Role, Severity } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import { PolicyAdminService } from './policy-admin.service';

const at = new Date('2026-11-10T08:00:00Z');

const rule = (severity: Severity, tierOrder: number, timeoutSeconds: number | null) => ({
  id: `${severity}-${tierOrder}`,
  severity,
  tierOrder,
  responderRole: [Role.CAREGIVER, Role.FAMILY_MEMBER, Role.EMERGENCY_RESPONDER][tierOrder - 1],
  timeoutSeconds,
  dispatchMode: DispatchMode.SEQUENTIAL,
  smsFallbackImmediate: false,
  updatedAt: at,
});

const factor = (key: string, weight: number) => ({
  key,
  label: key,
  description: null,
  weight,
  enabled: true,
  updatedAt: at,
});

function build(settings: { key: string; value: number }[] = []) {
  const rules = [
    rule(Severity.CRITICAL, 1, 60),
    rule(Severity.CRITICAL, 2, 60),
    rule(Severity.CRITICAL, 3, null),
    rule(Severity.STANDARD, 1, 120),
    rule(Severity.STANDARD, 2, 180),
    rule(Severity.STANDARD, 3, null),
  ];
  const factors = [
    factor('care_level', 30),
    factor('no_cancel_in_grace_window', 30),
    factor('time_of_day', 20),
    factor('away_from_home', 15),
    factor('recent_activity', 5),
  ];
  const prisma = {
    escalationRule: {
      findMany: jest.fn(({ where }: { where?: { severity?: Severity } } = {}) =>
        Promise.resolve(
          where?.severity ? rules.filter((r) => r.severity === where.severity) : rules,
        ),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    severityFactor: {
      findMany: jest.fn().mockResolvedValue(factors),
      update: jest.fn().mockResolvedValue({}),
    },
    policySetting: {
      findMany: jest.fn().mockResolvedValue(
        settings.map((s) => ({
          ...s,
          updatedAt: at,
          updatedBy: { id: 'admin-1', name: 'Asha' },
        })),
      ),
      upsert: jest.fn().mockResolvedValue({}),
    },
    policyChange: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((work: Promise<unknown>[]) => Promise.all(work)),
  };
  const config = {
    get: (key: string, fallback: number) =>
      ({ SEVERITY_ELEVATED_FROM: 35, SEVERITY_CRITICAL_FROM: 60 })[key] ?? fallback,
  } as unknown as ConfigService;
  const service = new PolicyAdminService(prisma as unknown as PrismaService, config);
  return { service, prisma };
}

describe('PolicyAdminService', () => {
  it('shows the rules in order, marks each last tier, and the configured bands', async () => {
    const view = await build().service.view();

    expect(view.escalationRules.map((r) => `${r.severity} ${r.tier}`)).toEqual([
      'STANDARD 1',
      'STANDARD 2',
      'STANDARD 3',
      'CRITICAL 1',
      'CRITICAL 2',
      'CRITICAL 3',
    ]);
    expect(view.escalationRules.filter((r) => r.last).map((r) => r.tier)).toEqual([3, 3]);
    expect(view.bands).toMatchObject({
      elevatedFrom: 35,
      criticalFrom: 60,
      fromConfiguration: true,
    });
    expect(view.maxScore).toBe(100);
  });

  describe('escalation rules', () => {
    it('saves a new time limit and records who changed it from what', async () => {
      const { service, prisma } = build();
      await service.updateRule(Severity.CRITICAL, 1, { timeoutSeconds: 45 }, 'admin-1');

      expect(prisma.escalationRule.update).toHaveBeenCalledWith({
        where: { id: 'CRITICAL-1' },
        data: { timeoutSeconds: 45, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
      });
      expect(prisma.policyChange.create).toHaveBeenCalledWith({
        data: {
          changedById: 'admin-1',
          area: 'escalation_rule',
          target: 'CRITICAL tier 1',
          before: { timeoutSeconds: 60, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
          after: { timeoutSeconds: 45, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
        },
      });
    });

    it('keeps the last tier without a time limit and every other tier with one', async () => {
      const { service, prisma } = build();
      await expect(
        service.updateRule(Severity.STANDARD, 3, { timeoutSeconds: 300 }, 'admin-1'),
      ).rejects.toThrow('The last tier is the end of the chain');
      await expect(
        service.updateRule(Severity.STANDARD, 2, { timeoutSeconds: null }, 'admin-1'),
      ).rejects.toThrow('would stop climbing');
      expect(prisma.escalationRule.update).not.toHaveBeenCalled();
    });

    it('never asks tier 1 alongside a tier before it', async () => {
      await expect(
        build().service.updateRule(
          Severity.STANDARD,
          1,
          { dispatchMode: DispatchMode.PARALLEL },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('says when there is no such tier', async () => {
      await expect(
        build().service.updateRule(Severity.STANDARD, 7, { timeoutSeconds: 60 }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('records nothing when nothing changed', async () => {
      const { service, prisma } = build();
      await service.updateRule(Severity.STANDARD, 1, { timeoutSeconds: 120 }, 'admin-1');
      expect(prisma.escalationRule.update).not.toHaveBeenCalled();
      expect(prisma.policyChange.create).not.toHaveBeenCalled();
    });
  });

  describe('severity weights', () => {
    it('saves a new weight and records the change', async () => {
      const { service, prisma } = build();
      await service.updateFactor('time_of_day', { weight: 25 }, 'admin-1');

      expect(prisma.severityFactor.update).toHaveBeenCalledWith({
        where: { key: 'time_of_day' },
        data: { weight: 25, enabled: true },
      });
      expect(prisma.policyChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          area: 'severity_factor',
          target: 'time_of_day',
          before: { weight: 20, enabled: true },
          after: { weight: 25, enabled: true },
        }),
      });
    });

    it('refuses a change that would leave CRITICAL out of reach', async () => {
      const { service, prisma } = build();
      // With one 30 already off, care level at 10 leaves 50, below CRITICAL's 60.
      prisma.severityFactor.findMany.mockResolvedValue([
        factor('care_level', 30),
        { ...factor('no_cancel_in_grace_window', 30), enabled: false },
        factor('time_of_day', 20),
        factor('away_from_home', 15),
        factor('recent_activity', 5),
      ]);
      await expect(service.updateFactor('care_level', { weight: 10 }, 'admin-1')).rejects.toThrow(
        'no alert could reach it',
      );
      expect(prisma.severityFactor.update).not.toHaveBeenCalled();
    });

    it('refuses a factor this version cannot measure, or one that does not exist', async () => {
      const { service, prisma } = build();
      prisma.severityFactor.findMany.mockResolvedValue([factor('phase_of_the_moon', 10)]);
      await expect(
        service.updateFactor('phase_of_the_moon', { weight: 5 }, 'admin-1'),
      ).rejects.toThrow('cannot measure');
      await expect(service.updateFactor('nothing', { weight: 5 }, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bands', () => {
    it('saves both thresholds and records the change from the configured values', async () => {
      const { service, prisma } = build();
      await service.updateBands({ elevatedFrom: 30, criticalFrom: 55 }, 'admin-1');

      expect(prisma.policySetting.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.policyChange.create).toHaveBeenCalledWith({
        data: {
          changedById: 'admin-1',
          area: 'severity_band',
          target: 'bands',
          before: { elevatedFrom: 35, criticalFrom: 60 },
          after: { elevatedFrom: 30, criticalFrom: 55 },
        },
      });
    });

    it('shows the thresholds an administrator set, and who set them', async () => {
      const view = await build([
        { key: 'severity_elevated_from', value: 30 },
        { key: 'severity_critical_from', value: 55 },
      ]).service.view();
      expect(view.bands).toEqual({
        elevatedFrom: 30,
        criticalFrom: 55,
        fromConfiguration: false,
        setAt: at.toISOString(),
        setBy: { id: 'admin-1', name: 'Asha' },
      });
    });

    it('keeps ELEVATED below CRITICAL, and CRITICAL within reach', async () => {
      const { service, prisma } = build();
      await expect(
        service.updateBands({ elevatedFrom: 60, criticalFrom: 60 }, 'admin-1'),
      ).rejects.toThrow('High must start below Critical');
      prisma.severityFactor.findMany.mockResolvedValue([factor('care_level', 30)]);
      await expect(
        service.updateBands({ elevatedFrom: 20, criticalFrom: 40 }, 'admin-1'),
      ).rejects.toThrow('add up to 30');
      expect(prisma.policySetting.upsert).not.toHaveBeenCalled();
    });
  });
});
