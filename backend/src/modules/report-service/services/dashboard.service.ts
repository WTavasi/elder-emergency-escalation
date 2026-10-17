import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import { CLOSED_STATES, OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { PrismaService } from '../../../db/prisma.service';
import type {
  ChannelReliability,
  DailyPoint,
  DashboardOverview,
  DataPolicy,
  EscalationProfile,
  LiveCounts,
  ResponseTimes,
} from '../views/dashboard.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days are counted in the deployment's own time zone, so an emergency at 01:00 in
 * Nairobi falls on the day a caregiver would say it happened, not the UTC day before.
 */
const REPORT_TIME_ZONE = 'Africa/Nairobi';
const dayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The numbers behind the administrator's overview, and behind Chapter 5.
 *
 * Every figure is derived from the audit trail and the notification table rather than
 * from a counter maintained alongside them. A counter can drift from the events it
 * claims to describe, and a figure that cannot be recomputed from the record is a
 * figure that cannot be defended.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async overview(windowDays = 30): Promise<DashboardOverview> {
    const now = Date.now();
    const since = new Date(now - windowDays * DAY_MS);
    // The window before this one, the same length, ending where this one starts.
    const before = new Date(now - 2 * windowDays * DAY_MS);

    const [
      live,
      responseTimes,
      escalation,
      channels,
      raised,
      daily,
      previousTimes,
      previousEscalation,
      previousRaised,
    ] = await Promise.all([
      this.liveCounts(),
      this.responseTimes(since),
      this.escalationProfile(since),
      this.channelReliability(since),
      this.raisedBetween(since),
      this.daily(since, windowDays),
      this.responseTimes(before, since),
      this.escalationProfile(before, since),
      this.raisedBetween(before, since),
    ]);

    return {
      generatedAt: new Date(now).toISOString(),
      windowDays,
      live,
      responseTimes,
      escalation,
      channels,
      raised,
      previous: {
        raised: previousRaised,
        responseTimes: previousTimes,
        escalationRatePercent: previousEscalation.escalationRatePercent,
      },
      daily,
    };
  }

  /** The retention settings the sweep runs with, read from the same configuration. */
  policy(): DataPolicy {
    return {
      retention: {
        enabled: this.config.get<boolean>('RETENTION_ENABLED', true),
        closedEmergencyDays: this.config.get<number>('RETENTION_RESOLVED_EVENT_DAYS', 365),
        auditLogDays: this.config.get<number>('RETENTION_AUDIT_LOG_DAYS', 365),
      },
    };
  }

  private raisedBetween(from: Date, until?: Date): Promise<number> {
    return this.prisma.emergencyEvent.count({
      where: { triggeredAt: { gte: from, ...(until ? { lt: until } : {}) } },
    });
  }

  /**
   * One point per day of the window, including the days nothing happened, which is most
   * of them and is the point: a chart that skips empty days draws a busy system.
   */
  private async daily(since: Date, windowDays: number): Promise<DailyPoint[]> {
    const rows = await this.prisma.emergencyEvent.findMany({
      where: { triggeredAt: { gte: since } },
      select: { triggeredAt: true, acknowledgedAt: true },
    });

    const days = new Map<string, { raised: number; waits: number[] }>();
    for (let offset = windowDays - 1; offset >= 0; offset--) {
      days.set(dayKey.format(new Date(Date.now() - offset * DAY_MS)), { raised: 0, waits: [] });
    }

    for (const row of rows) {
      const day = days.get(dayKey.format(row.triggeredAt));
      if (!day) continue;
      day.raised += 1;
      if (row.acknowledgedAt) {
        day.waits.push((row.acknowledgedAt.getTime() - row.triggeredAt.getTime()) / 1000);
      }
    }

    return [...days.entries()].map(([date, day]) => {
      const median = medianOf(day.waits.sort((a, b) => a - b));
      return {
        date,
        raised: day.raised,
        acknowledged: day.waits.length,
        medianSeconds: median === null ? null : Math.round(median),
      };
    });
  }

  private async liveCounts(): Promise<LiveCounts> {
    const [byState, bySeverity, unacknowledged] = await Promise.all([
      this.prisma.emergencyEvent.groupBy({
        by: ['state'],
        where: { state: { in: OPEN_STATES } },
        _count: { _all: true },
      }),
      this.prisma.emergencyEvent.groupBy({
        by: ['severity'],
        where: { state: { in: OPEN_STATES } },
        _count: { _all: true },
      }),
      this.prisma.emergencyEvent.count({
        where: { state: { in: OPEN_STATES }, acknowledgedBy: null },
      }),
    ]);

    const states = Object.fromEntries(byState.map((row) => [row.state, row._count._all]));

    return {
      open: byState.reduce((total, row) => total + row._count._all, 0),
      unacknowledged,
      byState: states,
      bySeverity: Object.fromEntries(bySeverity.map((row) => [row.severity, row._count._all])),
    };
  }

  private async responseTimes(since: Date, until?: Date): Promise<ResponseTimes> {
    const targetSeconds = this.config.get<number>('RESPONSE_TARGET_SECONDS', 300);

    const rows = await this.prisma.emergencyEvent.findMany({
      where: {
        triggeredAt: { gte: since, ...(until ? { lt: until } : {}) },
        acknowledgedAt: { not: null },
      },
      select: { triggeredAt: true, acknowledgedAt: true },
    });

    if (rows.length === 0) {
      return {
        sampleSize: 0,
        medianSeconds: null,
        meanSeconds: null,
        withinTargetPercent: null,
        targetSeconds,
      };
    }

    const seconds = rows
      .map((row) => (row.acknowledgedAt!.getTime() - row.triggeredAt.getTime()) / 1000)
      .sort((a, b) => a - b);

    const median = medianOf(seconds) ?? 0;

    const withinTarget = seconds.filter((value) => value <= targetSeconds).length;

    return {
      sampleSize: seconds.length,
      medianSeconds: Math.round(median),
      meanSeconds: Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length),
      withinTargetPercent: Math.round((withinTarget / seconds.length) * 1000) / 10,
      targetSeconds,
    };
  }

  private async escalationProfile(since: Date, until?: Date): Promise<EscalationProfile> {
    const range = { gte: since, ...(until ? { lt: until } : {}) };
    // The tier an emergency was answered at is the tier it was sitting on when it was
    // acknowledged, which is the column itself: acknowledgement stops the chain, so it
    // is never advanced afterwards.
    const [answered, total, escalatedCount] = await Promise.all([
      this.prisma.emergencyEvent.groupBy({
        by: ['currentTier'],
        where: { triggeredAt: range, acknowledgedAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.emergencyEvent.count({
        where: { triggeredAt: range, state: { in: CLOSED_STATES } },
      }),
      // An emergency counts as escalated if it ever left tier one, which the audit
      // trail records even when it was afterwards acknowledged and resolved.
      this.prisma.auditLog
        .findMany({
          where: { action: 'ESCALATED', occurredAt: range },
          select: { eventId: true },
          distinct: ['eventId'],
        })
        .then((rows) => rows.length),
    ]);

    return {
      total,
      answeredAtTier: Object.fromEntries(
        answered.map((row) => [String(row.currentTier), row._count._all]),
      ),
      escalatedCount,
      escalationRatePercent: total === 0 ? null : Math.round((escalatedCount / total) * 1000) / 10,
    };
  }

  private async channelReliability(since: Date): Promise<ChannelReliability[]> {
    const rows = await this.prisma.notification.groupBy({
      by: ['channel', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    const byChannel = new Map<string, ChannelReliability>();

    for (const row of rows) {
      const entry = byChannel.get(row.channel) ?? {
        channel: row.channel,
        attempted: 0,
        delivered: 0,
        failed: 0,
        successRatePercent: null,
      };

      entry.attempted += row._count._all;

      // ACKNOWLEDGED implies the message arrived, so it counts as delivered. Counting
      // only the DELIVERED status would understate every channel that worked.
      if (
        row.status === NotificationStatus.DELIVERED ||
        row.status === NotificationStatus.ACKNOWLEDGED
      ) {
        entry.delivered += row._count._all;
      }
      if (row.status === NotificationStatus.FAILED) {
        entry.failed += row._count._all;
      }

      byChannel.set(row.channel, entry);
    }

    return [...byChannel.values()].map((entry) => ({
      ...entry,
      successRatePercent:
        entry.attempted === 0 ? null : Math.round((entry.delivered / entry.attempted) * 1000) / 10,
    }));
  }
}
