import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { PhoneVerificationService } from '../../auth-service/services/phone-verification.service';
import { ElderSignInService } from './elder-sign-in.service';

const elder = { id: 'e1', phone: '+254700000010', role: Role.ELDER, deactivatedAt: null };

function build(assigned = true) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(elder) },
    careAssignment: { findFirst: jest.fn().mockResolvedValue(assigned ? { id: 'a1' } : null) },
  };
  const verification = {
    issuePairing: jest.fn().mockResolvedValue({ code: '123456', expiresInSeconds: 600 }),
  };
  const service = new ElderSignInService(
    prisma as unknown as PrismaService,
    verification as unknown as PhoneVerificationService,
  );
  return { prisma, verification, service };
}

describe('ElderSignInService', () => {
  it("makes a code for the elder's own number, for their caregiver", async () => {
    const { verification, service } = build();
    await expect(service.pairingCode('e1', 'c1', Role.CAREGIVER)).resolves.toEqual({
      code: '123456',
      expiresInSeconds: 600,
    });
    expect(verification.issuePairing).toHaveBeenCalledWith('+254700000010');
  });

  it('refuses a caregiver from another circle, and every other role', async () => {
    await expect(build(false).service.pairingCode('e1', 'c2', Role.CAREGIVER)).rejects.toThrow(
      ForbiddenException,
    );
    const family = build(true);
    await expect(family.service.pairingCode('e1', 'f1', Role.FAMILY_MEMBER)).rejects.toThrow(
      ForbiddenException,
    );
    expect(family.verification.issuePairing).not.toHaveBeenCalled();
  });

  it('refuses a closed account and somebody who is not an elder', async () => {
    const closed = build();
    closed.prisma.user.findUnique.mockResolvedValue({ ...elder, deactivatedAt: new Date() });
    await expect(closed.service.pairingCode('e1', 'c1', Role.CAREGIVER)).rejects.toThrow(
      ForbiddenException,
    );

    const notElder = build();
    notElder.prisma.user.findUnique.mockResolvedValue({ ...elder, role: Role.CAREGIVER });
    await expect(notElder.service.pairingCode('e1', 'c1', Role.CAREGIVER)).rejects.toThrow(
      NotFoundException,
    );
  });
});
