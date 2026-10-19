import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConsentType, Role } from '@prisma/client';
import { ConsentService } from './consent.service';
import type { PrismaService } from '../../../db/prisma.service';
import type { AccessRevocationService } from '../../auth-service/services/access-revocation.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';

const elder = { id: 'elder-1', name: 'Grace Wanjiru', phone: '+254700000010', role: Role.ELDER };
const given = new Date('2026-10-01T09:00:00Z');

/** What a caregiver records when registering an elder: all three, on her behalf. */
const onHerBehalf = Object.values(ConsentType).map((type) => ({
  type,
  subjectId: 'elder-1',
  grantedById: 'caregiver-1',
  grantorRelationship: 'daughter',
  grantedAt: given,
  withdrawnAt: null as Date | null,
  grantedBy: { name: 'Mary Otieno' },
}));

const buildPrisma = (rows = onHerBehalf) => {
  const mock = {
    user: {
      findUnique: jest.fn((args: { where: { id: string } }) =>
        Promise.resolve(args.where.id === 'elder-1' ? elder : { name: 'Mary Otieno' }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    careAssignment: {
      findFirst: jest.fn((args: { where: { responderId: string } }) =>
        Promise.resolve(
          ['caregiver-1', 'family-1'].includes(args.where.responderId) ? { id: 'a' } : null,
        ),
      ),
      findMany: jest
        .fn()
        .mockResolvedValue([{ responder: { id: 'caregiver-1', phone: '+254700000020' } }]),
    },
    consentRecord: {
      findMany: jest.fn().mockResolvedValue(rows),
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    emergencyEvent: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((fn: (tx: typeof mock) => unknown) => fn(mock));
  return mock;
};

const buildSms = () =>
  ({ send: jest.fn().mockResolvedValue(true) }) as unknown as DirectSmsService & {
    send: jest.Mock;
  };
const buildRevocations = () =>
  ({ revoke: jest.fn().mockResolvedValue(undefined) }) as unknown as AccessRevocationService & {
    revoke: jest.Mock;
  };

const build = (prisma = buildPrisma(), sms = buildSms(), revocations = buildRevocations()) =>
  new ConsentService(prisma as unknown as PrismaService, sms, revocations);

describe('ConsentService', () => {
  describe('view', () => {
    it('shows who agreed on her behalf, and asks her to confirm until she has', async () => {
      const view = await build().view('elder-1', 'elder-1', Role.ELDER);

      expect(view.needsConfirmation).toBe(true);
      expect(view.canWithdraw).toBe(true);
      expect(view.items).toHaveLength(3);
      expect(view.items[0]).toMatchObject({
        active: true,
        givenBy: { name: 'Mary Otieno', relationship: 'daughter' },
        confirmedAt: null,
      });
    });

    it('lets a family member look but not withdraw, and keeps strangers out', async () => {
      const service = build();
      expect((await service.view('elder-1', 'family-1', Role.FAMILY_MEMBER)).canWithdraw).toBe(
        false,
      );
      await expect(service.view('elder-1', 'stranger', Role.CAREGIVER)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('confirm', () => {
    it("records her own agreement beside the caregiver's, for every active consent", async () => {
      const prisma = buildPrisma();
      await build(prisma).confirm('elder-1', 'elder-1');

      const created = prisma.consentRecord.createMany.mock.calls[0][0].data as Array<{
        grantedById: string;
        grantorRelationship: string;
      }>;
      expect(created).toHaveLength(3);
      expect(created.every((row) => row.grantedById === 'elder-1')).toBe(true);
      expect(created.every((row) => row.grantorRelationship === 'self')).toBe(true);
      // The caregiver's records stay as they were.
      expect(prisma.consentRecord.updateMany).not.toHaveBeenCalled();
    });

    it('does not quietly give back a consent that was withdrawn', async () => {
      const prisma = buildPrisma();
      // Only the active ones come back from the query confirm makes.
      prisma.consentRecord.findMany.mockResolvedValueOnce(
        onHerBehalf.filter((row) => row.type !== ConsentType.LOCATION_SHARING),
      );
      await build(prisma).confirm('elder-1', 'elder-1');

      const created = prisma.consentRecord.createMany.mock.calls[0][0].data as Array<{
        type: ConsentType;
      }>;
      expect(created.map((row) => row.type)).not.toContain(ConsentType.LOCATION_SHARING);
    });

    it('is only for the elder herself', async () => {
      await expect(build().confirm('elder-1', 'caregiver-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('withdraw', () => {
    it('records the withdrawal and tells her caregiver', async () => {
      const prisma = buildPrisma();
      const sms = buildSms();
      await build(prisma, sms).withdraw(
        'elder-1',
        'elder-1',
        Role.ELDER,
        ConsentType.LOCATION_SHARING,
        false,
      );

      const update = prisma.consentRecord.updateMany.mock.calls[0][0];
      expect(update.where.type).toEqual({ in: [ConsentType.LOCATION_SHARING] });
      expect(update.data.withdrawnAt).toBeInstanceOf(Date);
      expect(sms.send).toHaveBeenCalledWith(
        '+254700000020',
        expect.stringContaining('withdrawn consent to location sharing'),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lets her caregiver withdraw for her, and tells her', async () => {
      const sms = buildSms();
      await build(buildPrisma(), sms).withdraw(
        'elder-1',
        'caregiver-1',
        Role.CAREGIVER,
        ConsentType.CONTACT_SHARING,
        false,
      );

      // Not the caregiver who did it, but the elder.
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledWith('+254700000010', expect.stringContaining("Grace's"));
    });

    it('refuses anybody but the elder or a caregiver in her chain', async () => {
      await expect(
        build().withdraw(
          'elder-1',
          'family-1',
          Role.FAMILY_MEMBER,
          ConsentType.CONTACT_SHARING,
          false,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('says nothing to anybody when it was already withdrawn', async () => {
      const prisma = buildPrisma();
      const sms = buildSms();
      prisma.consentRecord.updateMany.mockResolvedValue({ count: 0 });
      await build(prisma, sms).withdraw(
        'elder-1',
        'elder-1',
        Role.ELDER,
        ConsentType.CONTACT_SHARING,
        false,
      );
      expect(sms.send).not.toHaveBeenCalled();
    });

    describe('processing itself', () => {
      it('needs an explicit confirmation', async () => {
        await expect(
          build().withdraw('elder-1', 'elder-1', Role.ELDER, ConsentType.DATA_PROCESSING, false),
        ).rejects.toThrow(BadRequestException);
      });

      it('is refused while an emergency is open', async () => {
        const prisma = buildPrisma();
        prisma.emergencyEvent.count.mockResolvedValue(1);
        await expect(
          build(prisma).withdraw(
            'elder-1',
            'elder-1',
            Role.ELDER,
            ConsentType.DATA_PROCESSING,
            true,
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('withdraws everything, deactivates the account and ends its sessions at once', async () => {
        const prisma = buildPrisma();
        const revocations = buildRevocations();
        const sms = buildSms();
        await build(prisma, sms, revocations).withdraw(
          'elder-1',
          'elder-1',
          Role.ELDER,
          ConsentType.DATA_PROCESSING,
          true,
        );

        expect(prisma.consentRecord.updateMany.mock.calls[0][0].where.type).toEqual({
          in: Object.values(ConsentType),
        });
        expect(prisma.user.update.mock.calls[0][0].data.deactivatedAt).toBeInstanceOf(Date);
        expect(revocations.revoke).toHaveBeenCalledWith(['elder-1']);
        expect(sms.send).toHaveBeenCalledWith(
          '+254700000020',
          expect.stringContaining('can no longer raise an alert'),
        );
      });
    });
  });
});
