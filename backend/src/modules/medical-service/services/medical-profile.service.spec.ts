import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EmergencyType, EventState, ResponderService, Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { MedicalProfileService } from './medical-profile.service';
import { MedicalSealService } from './medical-seal.service';

const KEY = Buffer.alloc(32, 3).toString('base64');
const elder = { id: 'elder-1', name: 'Grace Wanjiru', phone: '+254700000010', role: Role.ELDER };

interface Options {
  consent?: {
    grantedById: string;
    grantorRelationship?: string;
    grantedAt?: Date;
    grantedBy?: unknown;
  }[];
  stored?: Record<string, unknown> | null;
  chain?: string[];
  asked?: string[];
  state?: EventState;
  key?: string | undefined;
}

function build(options: Options = {}) {
  const key = 'key' in options ? options.key : KEY;
  const seal = new MedicalSealService({ get: () => key } as unknown as ConfigService);
  const stored =
    options.stored === undefined
      ? {
          flags: ['BLOOD_THINNERS', 'HARD_OF_HEARING'],
          allergies: 'Penicillin',
          dateOfBirth: '1948-03-15',
        }
      : options.stored;
  const sealed = stored && key ? seal.seal({ ...stored }) : null;
  const chain = options.chain ?? ['caregiver-1', 'family-1'];
  const asked = options.asked ?? ['family-1'];

  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'elder-1'
            ? elder
            : { id: where.id, name: 'Mary Otieno', role: Role.CAREGIVER },
        ),
      ),
    },
    careAssignment: {
      findFirst: jest.fn(({ where }: { where: { responderId: string; responder?: unknown } }) => {
        const inChain = chain.includes(where.responderId);
        // The caregiver-only lookup asks for the caregiver role.
        if (where.responder)
          return Promise.resolve(where.responderId === 'caregiver-1' ? { id: 'a' } : null);
        return Promise.resolve(inChain ? { id: 'a' } : null);
      }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { responder: { id: 'caregiver-1', phone: '+254700000020' } },
          { responder: { id: 'caregiver-2', phone: '+254700000021' } },
        ]),
    },
    consentRecord: {
      findMany: jest.fn().mockResolvedValue(options.consent ?? [{ grantedById: 'elder-1' }]),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    medicalProfile: {
      findUnique: jest.fn().mockResolvedValue(
        sealed
          ? {
              elderlyId: 'elder-1',
              sealed,
              updatedById: 'caregiver-1',
              updatedAt: new Date('2026-11-01T08:00:00Z'),
            }
          : null,
      ),
      count: jest.fn().mockResolvedValue(sealed ? 1 : 0),
      upsert: jest.fn().mockResolvedValue({}),
    },
    medicalProfileChange: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    medicalProfileView: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    emergencyEvent: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'event-1',
        elderlyId: 'elder-1',
        state: options.state ?? EventState.ESCALATED,
        reportedType: EmergencyType.FALL,
        confirmedType: null,
      }),
    },
    notification: {
      findFirst: jest.fn(({ where }: { where: { recipientId: string } }) =>
        Promise.resolve(asked.includes(where.recipientId) ? { id: 'n' } : null),
      ),
    },
    $transaction: jest.fn((work: Promise<unknown>[]) => Promise.all(work)),
  };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const service = new MedicalProfileService(
    prisma as unknown as PrismaService,
    seal,
    sms as unknown as DirectSmsService,
  );
  return { service, prisma, sms, seal };
}

const CAREGIVER_GRANT = { grantedById: 'caregiver-1', grantorRelationship: 'caregiver' };
const GUARDIAN_GRANT = {
  grantedById: 'caregiver-1',
  grantorRelationship: 'guardian',
  grantedAt: new Date('2026-11-02T09:00:00Z'),
  grantedBy: { id: 'caregiver-1', name: 'Mary Otieno', role: Role.CAREGIVER },
};

describe('MedicalProfileService', () => {
  describe('a caregiver deciding for an elder who cannot', () => {
    it('is recorded with who and when, and texted to the elder and the other caregivers', async () => {
      const { service, prisma, sms } = build({ consent: [CAREGIVER_GRANT] });
      await service.declareGuardian('elder-1', 'caregiver-1');

      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subjectId: 'elder-1',
          grantedById: 'caregiver-1',
          type: 'MEDICAL_PROFILE',
          grantorRelationship: 'guardian',
        }),
      });
      const phones = sms.send.mock.calls.map(([phone]: [string]) => phone);
      expect(phones).toEqual([elder.phone, '+254700000021']);
      const texts = sms.send.mock.calls.map(([, text]: [string, string]) => text).join(' ');
      expect(texts).not.toMatch(/Penicillin|blood/i);
      expect(sms.send.mock.calls[0][1]).toBe(
        'Mary now decides for you about your medical details in MzaziCare. They will be shown to people asked to help in an emergency. You can stop this.',
      );
    });

    it('shows on the page who said it and when', async () => {
      const { service } = build({ consent: [CAREGIVER_GRANT, GUARDIAN_GRANT] });
      const page = await service.forElder('elder-1', 'elder-1');
      expect(page.consent).toEqual({
        active: true,
        byElder: false,
        guardian: {
          by: GUARDIAN_GRANT.grantedBy,
          at: '2026-11-02T09:00:00.000Z',
        },
      });
    });

    it('is only for a caregiver, once details may be kept, and not when the elder agreed', async () => {
      await expect(
        build({ consent: [CAREGIVER_GRANT] }).service.declareGuardian('elder-1', 'family-1'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({ consent: [] }).service.declareGuardian('elder-1', 'caregiver-1'),
      ).rejects.toThrow(ConflictException);
      await expect(build().service.declareGuardian('elder-1', 'caregiver-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('records nothing twice', async () => {
      const { service, prisma, sms } = build({ consent: [CAREGIVER_GRANT, GUARDIAN_GRANT] });
      await service.declareGuardian('elder-1', 'caregiver-1');
      expect(prisma.consentRecord.create).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('can be withdrawn by the elder, keeping the details, and the caregivers are told', async () => {
      const { service, prisma, sms } = build({ consent: [CAREGIVER_GRANT, GUARDIAN_GRANT] });
      await service.endGuardian('elder-1', 'elder-1');

      expect(prisma.consentRecord.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ grantorRelationship: 'guardian', withdrawnAt: null }),
        data: { withdrawnAt: expect.any(Date) },
      });
      expect(prisma.medicalProfile.upsert).not.toHaveBeenCalled();
      const phones = sms.send.mock.calls.map(([phone]: [string]) => phone);
      expect(phones).toEqual(['+254700000020', '+254700000021']);
    });

    it('tells the elder when a caregiver withdraws it, but not the caregiver who did', async () => {
      const { service, sms } = build({ consent: [CAREGIVER_GRANT, GUARDIAN_GRANT] });
      await service.endGuardian('elder-1', 'caregiver-1');
      const phones = sms.send.mock.calls.map(([phone]: [string]) => phone);
      expect(phones).toEqual(['+254700000021', elder.phone]);
    });

    it('tells the console on whose word the details are shared, never the details', async () => {
      const { service } = build({ consent: [CAREGIVER_GRANT, GUARDIAN_GRANT] });
      const result = await service.viewsForAlert('event-1');
      expect(result.sharing).toEqual({
        byElder: false,
        guardian: { by: GUARDIAN_GRANT.grantedBy, at: '2026-11-02T09:00:00.000Z' },
      });
      expect(JSON.stringify(result)).not.toContain('Penicillin');
    });
  });

  describe('for the elder and their caregivers', () => {
    it('shows the elder their details without recording a look', async () => {
      const { service, prisma } = build();
      const page = await service.forElder('elder-1', 'elder-1');

      expect(page.details?.allergies).toBe('Penicillin');
      expect(page.consent).toEqual({ active: true, byElder: true, guardian: null });
      expect(page.canEdit).toBe(true);
      expect(page.options.flags[0]).toEqual({ flag: 'HEART', label: 'Heart condition' });
      expect(prisma.medicalProfileView.create).not.toHaveBeenCalled();
    });

    it("records a caregiver's look", async () => {
      const { service, prisma } = build();
      await service.forElder('elder-1', 'caregiver-1');

      expect(prisma.medicalProfileView.create).toHaveBeenCalledWith({
        data: { elderlyId: 'elder-1', viewerId: 'caregiver-1', eventId: null },
      });
    });

    it('keeps family out outside an alert', async () => {
      await expect(build().service.forElder('elder-1', 'family-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('saves only with the consent given', async () => {
      const { service } = build({ consent: [] });
      await expect(service.save('elder-1', 'caregiver-1', { bloodType: 'O+' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('records which parts a caregiver changed and texts the elder, with no health data', async () => {
      const { service, prisma, sms } = build({ stored: null });
      await service.save('elder-1', 'caregiver-1', {
        bloodType: 'O+',
        flags: ['INSULIN', 'HEART'],
        medications: 'Insulin morning and night',
      });

      const upsert = prisma.medicalProfile.upsert.mock.calls[0][0] as {
        create: { sealed: string };
      };
      expect(upsert.create.sealed).not.toContain('Insulin');
      expect(prisma.medicalProfileChange.create).toHaveBeenCalledWith({
        data: {
          elderlyId: 'elder-1',
          changedById: 'caregiver-1',
          fields: ['bloodType', 'flags', 'medications'],
        },
      });
      const [phone, text] = sms.send.mock.calls[0] as [string, string];
      expect(phone).toBe('+254700000010');
      expect(text).toContain('Mary has changed your medical details');
      expect(text).not.toMatch(/insulin|O\+/i);
    });

    it('records nothing and texts nobody when nothing changed', async () => {
      const { service, prisma, sms } = build({ stored: { bloodType: 'O+' } });
      await service.save('elder-1', 'caregiver-1', { bloodType: 'O+' });

      expect(prisma.medicalProfile.upsert).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('does not text the elder about their own change', async () => {
      const { service, sms } = build({ stored: null });
      await service.save('elder-1', 'elder-1', { allergies: 'Peanuts' });
      expect(sms.send).not.toHaveBeenCalled();
    });
  });

  describe('on an alert', () => {
    it('shows a family member who was asked, read against the emergency, and records it', async () => {
      const { service, prisma } = build();
      const medical = await service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER);

      expect(medical.status).toBe('shown');
      expect(medical.serious).toBe(true);
      expect(medical.askFor).toBe(ResponderService.AMBULANCE);
      expect(medical.highlights[0]).toMatchObject({ flag: 'BLOOD_THINNERS', serious: true });
      expect(medical.age).toBeGreaterThan(70);
      expect(prisma.medicalProfileView.create).toHaveBeenCalledWith({
        data: { elderlyId: 'elder-1', viewerId: 'family-1', eventId: 'event-1' },
      });
    });

    it('waits until a family member is asked', async () => {
      const { service, prisma } = build({ asked: [] });
      const medical = await service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER);

      expect(medical.status).toBe('not-asked');
      expect(medical.details).toBeNull();
      expect(prisma.medicalProfileView.create).not.toHaveBeenCalled();
    });

    it('stops once the alert is over, for all but the caregivers', async () => {
      const closed = build({ state: EventState.RESOLVED });
      await expect(
        closed.service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER),
      ).resolves.toMatchObject({ status: 'closed', details: null });
      await expect(
        closed.service.forAlert('event-1', 'caregiver-1', Role.CAREGIVER),
      ).resolves.toMatchObject({ status: 'shown' });
    });

    it('shows a responder who was asked, outside the chain', async () => {
      const { service } = build({ asked: ['station-1'] });
      await expect(
        service.forAlert('event-1', 'station-1', Role.EMERGENCY_RESPONDER),
      ).resolves.toMatchObject({ status: 'shown' });
    });

    it('is not shared beyond the caregivers until the elder agrees for themselves', async () => {
      const { service } = build({ consent: [{ grantedById: 'caregiver-1' }] });
      await expect(
        service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER),
      ).resolves.toMatchObject({ status: 'not-shared', details: null });
      await expect(
        service.forAlert('event-1', 'caregiver-1', Role.CAREGIVER),
      ).resolves.toMatchObject({ status: 'shown' });
    });

    it('is shared once a caregiver says they decide for an elder who cannot', async () => {
      const { service, prisma } = build({ consent: [CAREGIVER_GRANT, GUARDIAN_GRANT] });
      await expect(
        service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER),
      ).resolves.toMatchObject({ status: 'shown' });
      expect(prisma.medicalProfileView.create).toHaveBeenCalledWith({
        data: { elderlyId: 'elder-1', viewerId: 'family-1', eventId: 'event-1' },
      });
    });

    it('never shows volunteers or administrators', async () => {
      const { service } = build({ asked: ['volunteer-1'] });
      await expect(
        service.forAlert('event-1', 'volunteer-1', Role.COMMUNITY_RESPONDER),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.forAlert('event-1', 'admin-1', Role.ADMINISTRATOR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('hides the alert itself from somebody never part of it', async () => {
      const { service } = build({ asked: [] });
      await expect(
        service.forAlert('event-1', 'stranger', Role.EMERGENCY_RESPONDER),
      ).rejects.toThrow(NotFoundException);
    });

    it('says when nothing is saved, and when the server keeps none', async () => {
      await expect(
        build({ stored: null }).service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER),
      ).resolves.toMatchObject({ status: 'none' });
      await expect(
        build({ key: undefined }).service.forAlert('event-1', 'family-1', Role.FAMILY_MEMBER),
      ).resolves.toMatchObject({ status: 'off' });
    });
  });
});
