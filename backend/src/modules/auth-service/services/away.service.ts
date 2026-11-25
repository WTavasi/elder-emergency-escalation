import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { isAway } from '../../../shared/utils/away';

/** Whether somebody is away, and until when. */
export interface AwayStatus {
  away: boolean;
  /** When they went away. Null while they are not. */
  since: string | null;
  /** When they will be back. Null while away means until they turn it off. */
  until: string | null;
  /**
   * The elders who, with this person away, have nobody left in their circle who is not
   * away, so an alert goes straight to the emergency services. Only on going away.
   */
  nobodyElseFor?: string[];
}

/** Who can say they are away: the people in a circle. Elders and stations cannot. */
const CAN_BE_AWAY: Role[] = [Role.CAREGIVER, Role.FAMILY_MEMBER];

/** The longest anybody can be away in one go, so a forgotten switch ends by itself. */
export const MAX_AWAY_DAYS = 30;

/**
 * Away for a while: a caregiver or family member who cannot help for now.
 *
 * Nobody is left out by it. An alert still reaches them, saying they are marked away, and
 * they can still take it on. What changes is that nobody waits for their answer: when
 * everybody asked at a step is away, the next step is asked at once. The emergency
 * services, the last step, are never skipped.
 */
@Injectable()
export class AwayService {
  private readonly logger = new Logger(AwayService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<AwayStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { awaySince: true, awayUntil: true },
    });
    return status(user);
  }

  /** Away from now, until [until], or until they turn it off when that is null. */
  async set(userId: string, role: Role, until: Date | null): Promise<AwayStatus> {
    if (!CAN_BE_AWAY.includes(role)) {
      throw new ForbiddenException('Only caregivers and family can mark themselves away.');
    }
    const now = new Date();
    if (until) {
      if (until.getTime() <= now.getTime()) {
        throw new BadRequestException('Choose a time that is still to come.');
      }
      if (until.getTime() - now.getTime() > MAX_AWAY_DAYS * 24 * 3600 * 1000) {
        throw new BadRequestException(`You can be away for up to ${MAX_AWAY_DAYS} days at a time.`);
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { awaySince: now, awayUntil: until },
      select: { awaySince: true, awayUntil: true },
    });
    this.logger.log(`A ${role.toLowerCase()} is away ${until ? 'until a set time' : 'for now'}`);
    return { ...status(user), nobodyElseFor: await this.nobodyElseFor(userId, now) };
  }

  async clear(userId: string): Promise<AwayStatus> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { awaySince: null, awayUntil: null },
      select: { awaySince: true, awayUntil: true },
    });
    return status(user);
  }

  /** The elders this person helps whose whole circle is now away, or empty apart from them. */
  private async nobodyElseFor(userId: string, now: Date): Promise<string[]> {
    const mine = await this.prisma.careAssignment.findMany({
      where: { responderId: userId },
      select: {
        elder: {
          select: {
            name: true,
            assignmentsAsElder: {
              where: {
                responderId: { not: userId },
                responder: { deactivatedAt: null, role: { in: CAN_BE_AWAY } },
              },
              select: { responder: { select: { awaySince: true, awayUntil: true } } },
            },
          },
        },
      },
    });
    return mine
      .filter(({ elder }) => elder.assignmentsAsElder.every((a) => isAway(a.responder, now)))
      .map(({ elder }) => elder.name);
  }
}

function status(user: { awaySince: Date | null; awayUntil: Date | null }): AwayStatus {
  const away = isAway(user);
  return {
    away,
    since: away ? user.awaySince!.toISOString() : null,
    until: away && user.awayUntil ? user.awayUntil.toISOString() : null,
  };
}
