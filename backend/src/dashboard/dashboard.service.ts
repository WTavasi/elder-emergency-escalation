import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventState, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChannelReliability,
  DashboardOverview,
  EscalationProfile,
  LiveCounts,
  ResponseTimes,
} from './dashboard.types';

/** States in which an emergency is still live. */
const OPEN_STATES: EventState[] = [
  EventState.TRIGGERED,
  EventState.NOTIFIED,
  EventState.ACKNOWLEDGED,
  EventState.ESCALATED,
];

/** States an emergency can finish in. */
const CLOSED_STATES: EventState[] = [EventState.RESOLVED, EventState.CANCELLED];

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
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [live, responseTimes, escalation, channels] = await Promise.all([
      this.liveCounts(),
      this.responseTimes(since),
      this.escalationProfile(since),
      this.channelReliability(since),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      live,
      responseTimes,
      escalation,
      channels,
    };
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

  private async responseTimes(since: Date): Promise<ResponseTimes> {
    const targetSeconds = this.config.get<number>('RESPONSE_TARGET_SECONDS', 300);

    const rows = await this.prisma.emergencyEvent.findMany({
      where: { triggeredAt: { gte: since }, acknowledgedAt: { not: null } },
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

    const middle = Math.floor(seconds.length / 2);
    const median =
      seconds.length % 2 === 0 ? (seconds[middle - 1] + seconds[middle]) / 2 : seconds[middle];

    const withinTarget = seconds.filter((value) => value <= targetSeconds).length;

    return {
      sampleSize: seconds.length,
      medianSeconds: Math.round(median),
      meanSeconds: Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length),
      withinTargetPercent: Math.round((withinTarget / seconds.length) * 1000) / 10,
      targetSeconds,
    };
  }

  private async escalationProfile(since: Date): Promise<EscalationProfile> {
    // The tier an emergency was answered at is the tier it was sitting on when it was
    // acknowledged, which is the column itself: acknowledgement stops the chain, so it
    // is never advanced afterwards.
    const [answered, total, escalatedCount] = await Promise.all([
      this.prisma.emergencyEvent.groupBy({
        by: ['currentTier'],
        where: { triggeredAt: { gte: since }, acknowledgedAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.emergencyEvent.count({
        where: { triggeredAt: { gte: since }, state: { in: CLOSED_STATES } },
      }),
      // An emergency counts as escalated if it ever left tier one, which the audit
      // trail records even when it was afterwards acknowledged and resolved.
      this.prisma.auditLog
        .findMany({
          where: { action: 'ESCALATED', occurredAt: { gte: since } },
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
