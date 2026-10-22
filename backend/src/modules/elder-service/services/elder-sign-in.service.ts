import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { PhoneVerificationService } from '../../auth-service/services/phone-verification.service';

export interface PairingCode {
  code: string;
  expiresInSeconds: number;
}

/**
 * A caregiver signing an elder's phone in for them.
 *
 * The caregiver is usually the one who set the elder up, and is often in the room. A
 * six-digit code they read off their own screen and type into the elder's phone, with
 * the elder's number, signs the elder in with no password and no text message. It is
 * the same proof as the one the caregiver already gave at registration: they are the
 * person the elder trusted with this.
 */
@Injectable()
export class ElderSignInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: PhoneVerificationService,
  ) {}

  /**
   * A caregiver in the elder's chain only. Family members and administrators can see an
   * elder but not sign in as one, which is what this amounts to.
   */
  async pairingCode(elderId: string, actorId: string, actorRole: Role): Promise<PairingCode> {
    const elder = await this.prisma.user.findUnique({
      where: { id: elderId },
      select: { id: true, phone: true, role: true, deactivatedAt: true },
    });
    if (!elder || elder.role !== Role.ELDER) throw new NotFoundException('No such elder');

    const assignment =
      actorRole === Role.CAREGIVER
        ? await this.prisma.careAssignment.findFirst({
            where: { elderlyId: elderId, responderId: actorId },
            select: { id: true },
          })
        : null;
    if (!assignment) {
      throw new ForbiddenException("Only the elder's caregiver can sign their phone in");
    }
    if (elder.deactivatedAt) {
      throw new ForbiddenException('This account is closed, so its phone cannot be signed in');
    }

    return this.verification.issuePairing(elder.phone);
  }
}
