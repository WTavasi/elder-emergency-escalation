import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { HELP_WORD } from '../../notification-service/services/notification-content';

/** Where this person sits in one elder's chain. Place 1 is asked first. */
export interface CirclePlace {
  elderId: string;
  elderName: string;
  place: number;
}

/** What this person has done when asked. Their own record, never a ranking. */
export interface ResponseRecord {
  /** Emergencies they took on, or went to as a volunteer. */
  answered: number;
  /** From the alert to their answer, the middle value. Null with nothing answered. */
  medianResponseSeconds: number | null;
  lastAnsweredAt: string | null;
}

/** One of the elder's own carers, in the order they are asked. */
export interface Carer {
  name: string;
  role: Role;
  place: number;
  phone: string;
}

/** Where an elder texts to ask for help when the app cannot reach the server. */
export interface HelpByText {
  /** The shortcode the gateway reads texts from. */
  number: string;
  /** The word to send. */
  word: string;
}

export interface Profile {
  memberSince: string;
  /** Every chain this person is in. Empty for an elder. */
  circles: CirclePlace[];
  /** Null for an elder, who is the one asking. */
  record: ResponseRecord | null;
  /** The elder's own chain, for their card. Empty for everyone else. */
  carers: Carer[];
  /**
   * For an elder, where to text HELP, which the app keeps on the phone for when there is
   * no data. Null for everyone else, and whenever this server cannot read texts.
   */
  helpByText: HelpByText | null;
}

/**
 * The account page's view of a person: where they stand, what they have done, and for
 * an elder, who comes.
 *
 * Read from what already exists. Nothing new is stored to make it: the record is the
 * emergencies themselves, so it cannot drift from what happened.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    if (user.role === Role.ELDER) {
      return {
        memberSince: user.createdAt.toISOString(),
        circles: [],
        record: null,
        carers: await this.carers(user.id),
        helpByText: this.helpByText(),
      };
    }

    const [circles, record] = await Promise.all([this.circles(user.id), this.record(user.id)]);
    return {
      memberSince: user.createdAt.toISOString(),
      circles,
      record,
      carers: [],
      helpByText: null,
    };
  }

  /**
   * Offered only when a text would be read: a shortcode to send it to, and the inbound
   * callback switched on. Telling an elder to text a number nothing is listening on would
   * be worse than not offering it, because they would wait for an answer that never comes.
   */
  private helpByText(): HelpByText | null {
    const number = this.config.get<string>('AT_SHORTCODE');
    const listening = this.config.get<string>('SMS_INBOUND_TOKEN');
    return number && listening ? { number, word: HELP_WORD } : null;
  }

  private async circles(userId: string): Promise<CirclePlace[]> {
    const rows = await this.prisma.careAssignment.findMany({
      where: { responderId: userId },
      orderBy: { priorityOrder: 'asc' },
      select: { priorityOrder: true, elder: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      elderId: row.elder.id,
      elderName: row.elder.name,
      place: row.priorityOrder,
    }));
  }

  /**
   * The elder sees their carers' numbers on purpose: a card with names but no way to
   * ring them would be a list, not help. Deactivated accounts are left off, as they
   * are never asked.
   */
  private async carers(elderId: string): Promise<Carer[]> {
    const rows = await this.prisma.careAssignment.findMany({
      where: { elderlyId: elderId, responder: { deactivatedAt: null } },
      orderBy: [{ priorityOrder: 'asc' }, { assignedAt: 'asc' }],
      select: {
        priorityOrder: true,
        responder: { select: { name: true, role: true, phone: true } },
      },
    });
    return rows.map((row) => ({
      name: row.responder.name,
      role: row.responder.role,
      place: row.priorityOrder,
      phone: row.responder.phone,
    }));
  }

  private async record(userId: string): Promise<ResponseRecord> {
    const [owned, volunteered] = await Promise.all([
      this.prisma.emergencyEvent.findMany({
        where: { acknowledgedBy: userId, acknowledgedAt: { not: null } },
        select: { triggeredAt: true, acknowledgedAt: true },
      }),
      this.prisma.emergencyEvent.findMany({
        where: { volunteerId: userId, volunteerAcceptedAt: { not: null } },
        select: { triggeredAt: true, volunteerAcceptedAt: true },
      }),
    ]);

    const answers = [
      ...owned.map((e) => ({ from: e.triggeredAt, at: e.acknowledgedAt! })),
      ...volunteered.map((e) => ({ from: e.triggeredAt, at: e.volunteerAcceptedAt! })),
    ];
    const seconds = answers
      .map((a) => Math.max(0, Math.round((a.at.getTime() - a.from.getTime()) / 1000)))
      .sort((a, b) => a - b);
    const last = answers.reduce<Date | null>(
      (latest, a) => (!latest || a.at > latest ? a.at : latest),
      null,
    );

    return {
      answered: answers.length,
      medianResponseSeconds: ProfileService.median(seconds),
      lastAnsweredAt: last?.toISOString() ?? null,
    };
  }

  /** The middle of a sorted list, or the mean of the middle two. */
  static median(sorted: number[]): number | null {
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
}
