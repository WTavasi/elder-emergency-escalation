import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { PasswordService } from '../../auth-service/services/password.service';
import type { PhoneVerificationService } from '../../auth-service/services/phone-verification.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { ChainService } from './chain.service';

const ELDER = { id: 'elder-1', name: 'Grace Wanjiru', role: Role.ELDER };

function build() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Mary Otieno' }),
      create: jest.fn(),
    },
    careAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    chainInvitation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    consentRecord: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
    escalationRule: {
      findFirst: jest.fn((args: { where: { responderRole: Role } }) =>
        Promise.resolve({ tierOrder: args.where.responderRole === Role.CAREGIVER ? 1 : 2 }),
      ),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => unknown) => work(prisma));

  const verification = { consume: jest.fn().mockResolvedValue(undefined) };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const passwords = { hash: jest.fn().mockReturnValue('hashed') };

  const service = new ChainService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    verification as unknown as PhoneVerificationService,
    sms as unknown as DirectSmsService,
  );
  return { service, prisma, verification, sms };
}

/** The caller is in the elder's chain; the family rank is empty unless a test says so. */
function inChain(prisma: ReturnType<typeof build>['prisma']) {
  prisma.user.findUnique.mockImplementation((args: { where: { id?: string; phone?: string } }) =>
    Promise.resolve(args.where.id === ELDER.id ? ELDER : null),
  );
  prisma.careAssignment.findFirst.mockImplementation(
    (args: { where: { responderId?: string; priorityOrder?: number } }) =>
      Promise.resolve(args.where.responderId ? { id: 'assignment-1' } : null),
  );
}

describe('ChainService', () => {
  describe('createElder', () => {
    const dto = {
      name: 'Grace Wanjiru',
      phone: '+254712345678',
      code: '123456',
      password: 'Grace!2026',
      home: { latitude: -1.29, longitude: 36.78, label: 'Kilimani, Nairobi' },
      relationship: 'daughter',
      consentConfirmed: true,
    } as const;

    it('checks the elder phone code before writing anything', async () => {
      const { service, prisma, verification } = build();
      verification.consume.mockRejectedValue(new Error('wrong code'));

      await expect(service.createElder('carer-1', { ...dto })).rejects.toThrow('wrong code');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('records three consents given by the caregiver, and puts them first in the chain', async () => {
      const { service, prisma } = build();
      prisma.user.create.mockResolvedValue({
        id: 'elder-9',
        name: dto.name,
        phone: dto.phone,
        homeAddressLabel: dto.home.label,
      });

      const summary = await service.createElder('carer-1', { ...dto });

      const consents = prisma.consentRecord.createMany.mock.calls[0][0].data as {
        grantedById: string;
        grantorRelationship: string;
        type: string;
      }[];
      expect(consents.map((c) => c.type).sort()).toEqual([
        'CONTACT_SHARING',
        'DATA_PROCESSING',
        'LOCATION_SHARING',
      ]);
      expect(consents.every((c) => c.grantedById === 'carer-1')).toBe(true);
      expect(consents.every((c) => c.grantorRelationship === 'daughter')).toBe(true);
      expect(prisma.careAssignment.create).toHaveBeenCalledWith({
        data: { elderlyId: 'elder-9', responderId: 'carer-1', priorityOrder: 1 },
      });
      expect(summary).toMatchObject({ id: 'elder-9', myTier: 1, canEditChain: true });
    });
  });

  describe('addMember', () => {
    it('adds somebody who already has an account, and tells them by SMS', async () => {
      const { service, prisma, sms } = build();
      inChain(prisma);
      prisma.user.findUnique.mockImplementation(
        (args: { where: { id?: string; phone?: string } }) =>
          Promise.resolve(
            args.where.id === ELDER.id
              ? ELDER
              : args.where.phone
                ? { id: 'family-1', role: Role.FAMILY_MEMBER }
                : null,
          ),
      );

      await service.addMember(ELDER.id, 'carer-1', Role.CAREGIVER, { phone: '+254700000030' });

      expect(prisma.careAssignment.create).toHaveBeenCalledWith({
        data: { elderlyId: ELDER.id, responderId: 'family-1', priorityOrder: 2 },
      });
      expect(prisma.chainInvitation.create).not.toHaveBeenCalled();
      expect(sms.send.mock.calls[0][1]).toContain("Grace Wanjiru's MzaziCare emergency contacts");
    });

    it('holds the place for a number with no account yet', async () => {
      const { service, prisma, sms } = build();
      inChain(prisma);

      await service.addMember(ELDER.id, 'carer-1', Role.CAREGIVER, {
        phone: '+254700000099',
        name: 'Peter',
      });

      expect(prisma.chainInvitation.create).toHaveBeenCalledWith({
        data: {
          elderlyId: ELDER.id,
          phone: '+254700000099',
          name: 'Peter',
          priorityOrder: 2,
          invitedById: 'carer-1',
        },
      });
      expect(sms.send.mock.calls[0][1]).toContain('sign up');
    });

    it('refuses when the family place is already taken', async () => {
      const { service, prisma } = build();
      inChain(prisma);
      prisma.careAssignment.findFirst.mockImplementation(
        (args: { where: { responderId?: string; priorityOrder?: number } }) =>
          Promise.resolve(
            args.where.responderId
              ? { id: 'assignment-1' }
              : { responder: { name: 'Aisha Otieno' } },
          ),
      );

      await expect(
        service.addMember(ELDER.id, 'carer-1', Role.CAREGIVER, { phone: '+254700000099' }),
      ).rejects.toThrow(ConflictException);
    });

    it('lets only a caregiver change the chain', async () => {
      const { service, prisma } = build();
      inChain(prisma);

      await expect(
        service.addMember(ELDER.id, 'family-1', Role.FAMILY_MEMBER, { phone: '+254700000099' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses somebody outside the chain', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(ELDER);
      prisma.careAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.addMember(ELDER.id, 'stranger', Role.CAREGIVER, { phone: '+254700000099' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
