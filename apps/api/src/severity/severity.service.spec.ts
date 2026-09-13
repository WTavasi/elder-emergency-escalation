import { CareLevel, Severity } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { SeverityService } from './severity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SeverityContext } from './severity.types';

const POLICY = [
  { key: 'care_level', label: 'Care level', weight: 30 },
  { key: 'no_cancel_in_grace_window', label: 'No cancel', weight: 30 },
  { key: 'time_of_day', label: 'Night', weight: 15 },
  { key: 'caregiver_outside_cover', label: 'No cover', weight: 10 },
  { key: 'away_from_home', label: 'Away from home', weight: 10 },
  { key: 'recent_activity', label: 'Recent activity', weight: 5 },
];

const settings: Record<string, number> = {
  SEVERITY_ELEVATED_FROM: 35,
  SEVERITY_CRITICAL_FROM: 60,
  NIGHT_START_HOUR: 22,
  NIGHT_END_HOUR: 6,
  AWAY_FROM_HOME_METRES: 250,
};

const config = {
  get: (key: string, fallback: number) => settings[key] ?? fallback,
} as unknown as ConfigService;

const home = { latitude: -1.2833, longitude: 36.7833 };

const buildService = (
  factors: Array<{ key: string; label: string; weight: number }> = POLICY,
): { service: SeverityService; findMany: jest.Mock } => {
  const findMany = jest.fn().mockResolvedValue(factors);
  const prisma = { severityFactor: { findMany } } as unknown as PrismaService;
  return { service: new SeverityService(prisma, config), findMany };
};

/** Calm baseline: independent elder, at home, weekday afternoon, covered, no history. */
const calm = (overrides: Partial<SeverityContext> = {}): SeverityContext => ({
  careLevel: CareLevel.INDEPENDENT,
  alertLocation: home,
  homeLocation: home,
  timezone: 'Africa/Nairobi',
  // 11:00 UTC is 14:00 in Nairobi, a Monday.
  at: new Date('2026-09-14T11:00:00Z'),
  coverWindows: [{ daysOfWeek: [1, 2, 3, 4, 5], startMinute: 8 * 60, endMinute: 17 * 60 }],
  recentEventCount: 0,
  cancelWindowElapsed: false,
  ...overrides,
});

const contributionOf = (
  assessment: { factors: Array<{ key: string; contribution: number }> },
  key: string,
): number => assessment.factors.find((factor) => factor.key === key)?.contribution ?? -1;

describe('SeverityService', () => {
  it('scores a calm situation at zero and lands in the standard band', async () => {
    const { service } = buildService();
    const assessment = await service.evaluate(calm());

    expect(assessment.score).toBe(0);
    expect(assessment.band).toBe(Severity.STANDARD);
    expect(assessment.factors).toHaveLength(6);
  });

  it('scores the worst case at 100 and lands in the critical band', async () => {
    const { service } = buildService();
    const assessment = await service.evaluate(
      calm({
        careLevel: CareLevel.HIGH_DEPENDENCY,
        cancelWindowElapsed: true,
        // 23:30 UTC is 02:30 in Nairobi.
        at: new Date('2026-09-14T23:30:00Z'),
        coverWindows: [],
        alertLocation: { latitude: -1.268, longitude: 36.811 },
        recentEventCount: 2,
      }),
    );

    expect(assessment.score).toBe(100);
    expect(assessment.band).toBe(Severity.CRITICAL);
  });

  it('reads only enabled factors, ordered by weight', async () => {
    const { service, findMany } = buildService();
    await service.evaluate(calm());
    expect(findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      orderBy: { weight: 'desc' },
    });
  });

  describe('care level', () => {
    it('scores independent at nothing, assisted at half, high dependency in full', async () => {
      const { service } = buildService();
      const score = async (careLevel: CareLevel | null): Promise<number> =>
        contributionOf(await service.evaluate(calm({ careLevel })), 'care_level');

      expect(await score(CareLevel.INDEPENDENT)).toBe(0);
      expect(await score(CareLevel.ASSISTED)).toBe(15);
      expect(await score(CareLevel.HIGH_DEPENDENCY)).toBe(30);
    });

    it('treats an unrecorded care level as assisted rather than as nothing', async () => {
      const { service } = buildService();
      const assessment = await service.evaluate(calm({ careLevel: null }));
      expect(contributionOf(assessment, 'care_level')).toBe(15);
      expect(assessment.factors.find((f) => f.key === 'care_level')?.detail).toMatch(
        /not recorded/,
      );
    });
  });

  describe('time of day', () => {
    it('scores night in the elder timezone, not in UTC', async () => {
      const { service } = buildService();
      // 20:00 UTC is 23:00 in Nairobi: night locally, daytime in UTC.
      const night = await service.evaluate(calm({ at: new Date('2026-09-14T20:00:00Z') }));
      expect(contributionOf(night, 'time_of_day')).toBe(15);

      const day = await service.evaluate(calm({ at: new Date('2026-09-14T06:00:00Z') }));
      expect(contributionOf(day, 'time_of_day')).toBe(0);
    });
  });

  describe('caregiver cover', () => {
    it('scores nothing while a caregiver has declared cover', async () => {
      const { service } = buildService();
      expect(contributionOf(await service.evaluate(calm()), 'caregiver_outside_cover')).toBe(0);
    });

    it('scores in full outside every declared window, and when none is declared', async () => {
      const { service } = buildService();
      const sunday = await service.evaluate(calm({ at: new Date('2026-09-13T11:00:00Z') }));
      expect(contributionOf(sunday, 'caregiver_outside_cover')).toBe(10);

      const noWindows = await service.evaluate(calm({ coverWindows: [] }));
      expect(contributionOf(noWindows, 'caregiver_outside_cover')).toBe(10);
    });
  });

  describe('away from home', () => {
    it('scores nothing within the threshold and in full beyond it', async () => {
      const { service } = buildService();
      const nearby = { latitude: home.latitude + 0.0005, longitude: home.longitude };
      expect(
        contributionOf(await service.evaluate(calm({ alertLocation: nearby })), 'away_from_home'),
      ).toBe(0);

      const far = { latitude: -1.268, longitude: 36.811 };
      expect(
        contributionOf(await service.evaluate(calm({ alertLocation: far })), 'away_from_home'),
      ).toBe(10);
    });

    it('scores nothing when no home address is on file, rather than assuming the worst', async () => {
      const { service } = buildService();
      const assessment = await service.evaluate(calm({ homeLocation: null }));
      expect(contributionOf(assessment, 'away_from_home')).toBe(0);
      expect(assessment.factors.find((f) => f.key === 'away_from_home')?.detail).toMatch(
        /no registered home/,
      );
    });
  });

  describe('bands', () => {
    it('places a score on the correct side of each threshold', async () => {
      const band = async (weight: number): Promise<Severity> => {
        const { service } = buildService([{ key: 'care_level', label: 'Care level', weight }]);
        const assessment = await service.evaluate(calm({ careLevel: CareLevel.HIGH_DEPENDENCY }));
        return assessment.band;
      };

      expect(await band(34)).toBe(Severity.STANDARD);
      expect(await band(35)).toBe(Severity.ELEVATED);
      expect(await band(59)).toBe(Severity.ELEVATED);
      expect(await band(60)).toBe(Severity.CRITICAL);
    });
  });

  it('scores an unknown factor as zero and says so rather than failing', async () => {
    const { service } = buildService([{ key: 'phase_of_the_moon', label: 'Moon', weight: 40 }]);
    const assessment = await service.evaluate(calm());

    expect(assessment.score).toBe(0);
    expect(assessment.factors[0].detail).toBe('not implemented in this build');
  });

  it('records the reasoning behind every factor, so an escalation can be explained', async () => {
    const { service } = buildService();
    const assessment = await service.evaluate(calm({ careLevel: CareLevel.HIGH_DEPENDENCY }));

    for (const factor of assessment.factors) {
      expect(factor.detail.length).toBeGreaterThan(0);
      expect(factor.contribution).toBe(Math.round(factor.weight * factor.value));
    }
  });

  describe('highestOf', () => {
    it('promotes but never demotes', () => {
      const { service } = buildService();
      expect(service.highestOf(Severity.STANDARD, Severity.CRITICAL)).toBe(Severity.CRITICAL);
      expect(service.highestOf(Severity.CRITICAL, Severity.STANDARD)).toBe(Severity.CRITICAL);
      expect(service.highestOf(Severity.ELEVATED, Severity.STANDARD)).toBe(Severity.ELEVATED);
      expect(service.highestOf(Severity.ELEVATED, Severity.ELEVATED)).toBe(Severity.ELEVATED);
    });
  });
});
