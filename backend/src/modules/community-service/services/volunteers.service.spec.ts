import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VolunteerStatus, VolunteerTraining } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { VolunteersService } from './volunteers.service';

const APPLICATION = {
  training: [VolunteerTraining.FIRST_AID],
  area: { label: 'Kileleshwa, Nairobi', latitude: -1.2833, longitude: 36.7833 },
  radiusKm: 1,
};

function build(profile: Record<string, unknown> | null = null) {
  const user = {
    id: 'vol-1',
    name: 'Joseph Kamau',
    phone: '+254711000001',
    email: null,
    deactivatedAt: null,
    coverageAreaName: 'Kileleshwa, Nairobi',
    coverageLatitude: -1.2833,
    coverageLongitude: 36.7833,
    coverageRadiusKm: 1,
    volunteerProfile: profile
      ? {
          training: [VolunteerTraining.FIRST_AID],
          note: null,
          available: false,
          appliedAt: new Date('2026-10-20T09:00:00Z'),
          reviewedAt: null,
          reviewNote: null,
          reviewedBy: null,
          ...profile,
        }
      : null,
  };
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      findMany: jest.fn().mockResolvedValue([user]),
      update: jest.fn().mockReturnValue('user-update'),
    },
    volunteerProfile: {
      findUnique: jest.fn().mockResolvedValue(
        profile
          ? {
              userId: 'vol-1',
              ...user.volunteerProfile,
              user: { name: user.name, phone: user.phone },
            }
          : null,
      ),
      upsert: jest.fn().mockReturnValue('profile-upsert'),
      update: jest.fn().mockResolvedValue({}),
    },
    volunteerCall: { groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const service = new VolunteersService(
    prisma as unknown as PrismaService,
    sms as unknown as DirectSmsService,
  );
  return { service, prisma, sms };
}

describe('VolunteersService', () => {
  describe('applying', () => {
    it('a first application goes into the queue, with the area as their coverage', async () => {
      const t = build();
      await t.service.apply('vol-1', APPLICATION);

      expect(t.prisma.user.update.mock.calls[0][0].data).toMatchObject({
        coverageAreaName: 'Kileleshwa, Nairobi',
        coverageRadiusKm: 1,
      });
      expect(t.prisma.volunteerProfile.upsert.mock.calls[0][0].create).toMatchObject({
        userId: 'vol-1',
        training: [VolunteerTraining.FIRST_AID],
      });
    });

    it('applying again after a rejection goes back into the queue, switched off', async () => {
      const t = build({ status: VolunteerStatus.REJECTED });
      await t.service.apply('vol-1', APPLICATION);
      expect(t.prisma.volunteerProfile.upsert.mock.calls[0][0].update).toMatchObject({
        status: VolunteerStatus.PENDING,
        available: false,
        reviewNote: null,
      });
    });

    it('moving an approved volunteer’s area keeps the approval', async () => {
      const t = build({ status: VolunteerStatus.APPROVED });
      await t.service.apply('vol-1', APPLICATION);
      expect(t.prisma.volunteerProfile.upsert.mock.calls[0][0].update).not.toHaveProperty('status');
    });

    it('"other" training needs saying what it is', async () => {
      await expect(
        build().service.apply('vol-1', { ...APPLICATION, training: [VolunteerTraining.OTHER] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('somebody who has not applied reads as not applied', async () => {
      await expect(build().service.me('vol-1')).resolves.toMatchObject({
        status: 'NOT_APPLIED',
        available: false,
      });
    });
  });

  describe('being available', () => {
    it('only once approved', async () => {
      await expect(
        build({ status: VolunteerStatus.PENDING }).service.setAvailable('vol-1', true),
      ).rejects.toThrow(ConflictException);
      await expect(build().service.setAvailable('vol-1', true)).rejects.toThrow(ConflictException);
    });

    it('an approved volunteer switches on, and anybody can switch off', async () => {
      const t = build({ status: VolunteerStatus.APPROVED });
      await t.service.setAvailable('vol-1', true);
      expect(t.prisma.volunteerProfile.update.mock.calls[0][0].data.available).toBe(true);

      const suspended = build({ status: VolunteerStatus.SUSPENDED, available: true });
      await suspended.service.setAvailable('vol-1', false);
      expect(suspended.prisma.volunteerProfile.update.mock.calls[0][0].data.available).toBe(false);
    });
  });

  describe('vetting', () => {
    it('approving does not switch them on, and tells them by text', async () => {
      const t = build({ status: VolunteerStatus.PENDING });
      await t.service.review('vol-1', 'admin-1', { decision: 'approve' });

      const data = t.prisma.volunteerProfile.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: VolunteerStatus.APPROVED, reviewedById: 'admin-1' });
      expect(data).not.toHaveProperty('available');
      expect(t.sms.send.mock.calls[0][1]).toContain('approved');
    });

    it('rejecting or suspending needs a reason, which they are sent', async () => {
      const t = build({ status: VolunteerStatus.APPROVED, available: true });
      await expect(t.service.review('vol-1', 'admin-1', { decision: 'suspend' })).rejects.toThrow(
        BadRequestException,
      );

      await t.service.review('vol-1', 'admin-1', { decision: 'suspend', note: 'Training lapsed' });
      expect(t.prisma.volunteerProfile.update.mock.calls[0][0].data).toMatchObject({
        status: VolunteerStatus.SUSPENDED,
        available: false,
      });
      expect(t.sms.send.mock.calls[0][1]).toContain('Training lapsed');
    });

    it('only an approved volunteer can be suspended', async () => {
      await expect(
        build({ status: VolunteerStatus.PENDING }).service.review('vol-1', 'admin-1', {
          decision: 'suspend',
          note: 'x',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('an unknown application is a 404', async () => {
      await expect(
        build().service.review('vol-9', 'admin-1', { decision: 'approve' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('the queue puts the oldest waiting application first', async () => {
      const t = build();
      const row = (id: string, status: VolunteerStatus, appliedAt: string) => ({
        id,
        name: id,
        phone: '+254711000000',
        email: null,
        deactivatedAt: null,
        coverageAreaName: null,
        coverageLatitude: null,
        coverageLongitude: null,
        coverageRadiusKm: null,
        volunteerProfile: {
          status,
          training: [],
          note: null,
          available: false,
          appliedAt: new Date(appliedAt),
          reviewedAt: null,
          reviewNote: null,
          reviewedBy: null,
        },
      });
      t.prisma.user.findMany.mockResolvedValue([
        row('approved', VolunteerStatus.APPROVED, '2026-10-01'),
        row('newer', VolunteerStatus.PENDING, '2026-10-21'),
        row('older', VolunteerStatus.PENDING, '2026-10-20'),
      ]);

      const list = await t.service.list();
      expect(list.map((application) => application.id)).toEqual(['older', 'newer', 'approved']);
    });
  });
});
