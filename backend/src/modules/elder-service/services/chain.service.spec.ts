import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
      delete: jest.fn().mockResolvedValue({}),
    },
    chainInvitation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    emergencyEvent: { count: jest.fn().mockResolvedValue(0) },
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

  describe('removeEntry', () => {
    /** The caller is in the chain; the entry being removed is found by its id. */
    function withEntry(
      prisma: ReturnType<typeof build>['prisma'],
      entry: { id: string; responder: { id: string; phone: string; role: Role } } | null,
    ) {
      prisma.user.findUnique.mockResolvedValue(ELDER);
      prisma.careAssignment.findFirst.mockImplementation(
        (args: { where: { id?: string; responderId?: string } }) =>
          Promise.resolve(args.where.id ? entry : { id: 'assignment-1' }),
      );
    }

    it('takes a family member out and tells them by SMS', async () => {
      const { service, prisma, sms } = build();
      withEntry(prisma, {
        id: 'assignment-2',
        responder: { id: 'family-1', phone: '+254700000030', role: Role.FAMILY_MEMBER },
      });

      await service.removeEntry(ELDER.id, 'assignment-2', 'carer-1', Role.CAREGIVER);

      expect(prisma.careAssignment.delete).toHaveBeenCalledWith({ where: { id: 'assignment-2' } });
      expect(sms.send.mock.calls[0][0]).toBe('+254700000030');
      expect(sms.send.mock.calls[0][1]).toContain('removed you from');
    });

    it('withdraws a held place without sending anything', async () => {
      const { service, prisma, sms } = build();
      withEntry(prisma, null);
      prisma.chainInvitation.findFirst.mockResolvedValue({ id: 'invitation-1' });

      await service.removeEntry(ELDER.id, 'invitation-1', 'carer-1', Role.CAREGIVER);

      expect(prisma.chainInvitation.delete).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
      });
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('waits while the elder has an emergency open', async () => {
      const { service, prisma } = build();
      withEntry(prisma, null);
      prisma.emergencyEvent.count.mockResolvedValue(1);

      await expect(
        service.removeEntry(ELDER.id, 'assignment-2', 'carer-1', Role.CAREGIVER),
      ).rejects.toThrow(ConflictException);
      expect(prisma.careAssignment.delete).not.toHaveBeenCalled();
    });

    it('will not let a caregiver remove themselves', async () => {
      const { service, prisma } = build();
      withEntry(prisma, {
        id: 'assignment-1',
        responder: { id: 'carer-1', phone: '+254700000020', role: Role.CAREGIVER },
      });

      await expect(
        service.removeEntry(ELDER.id, 'assignment-1', 'carer-1', Role.CAREGIVER),
      ).rejects.toThrow(BadRequestException);
    });

    it('leaves emergency responders to an administrator', async () => {
      const { service, prisma } = build();
      withEntry(prisma, {
        id: 'assignment-3',
        responder: { id: 'resp-1', phone: '+254700000040', role: Role.EMERGENCY_RESPONDER },
      });

      await expect(
        service.removeEntry(ELDER.id, 'assignment-3', 'carer-1', Role.CAREGIVER),
      ).rejects.toThrow(BadRequestException);
    });

    it('says when the entry is not in this chain', async () => {
      const { service, prisma } = build();
      withEntry(prisma, null);

      await expect(
        service.removeEntry(ELDER.id, 'nope', 'carer-1', Role.CAREGIVER),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets only a caregiver remove', async () => {
      const { service, prisma } = build();
      withEntry(prisma, null);

      await expect(
        service.removeEntry(ELDER.id, 'x', 'family-1', Role.FAMILY_MEMBER),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
