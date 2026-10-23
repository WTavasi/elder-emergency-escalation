import { Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import { ProfileService } from './profile.service';

const at = (iso: string) => new Date(iso);

function build(role: Role) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'u1', role, createdAt: at('2026-09-01T08:00:00Z') }),
    },
    careAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    emergencyEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new ProfileService(prisma as unknown as PrismaService) };
}

describe('ProfileService', () => {
  it('gives a responder their places in each circle and their record', async () => {
    const { prisma, service } = build(Role.CAREGIVER);
    prisma.careAssignment.findMany.mockResolvedValue([
      { priorityOrder: 1, elder: { id: 'e1', name: 'Grace Wanjiku' } },
    ]);
    prisma.emergencyEvent.findMany
      // Taken on: 60 s and 180 s after the alert.
      .mockResolvedValueOnce([
        { triggeredAt: at('2026-10-01T10:00:00Z'), acknowledgedAt: at('2026-10-01T10:01:00Z') },
        { triggeredAt: at('2026-10-05T10:00:00Z'), acknowledgedAt: at('2026-10-05T10:03:00Z') },
      ])
      // Went to as a volunteer: 120 s.
      .mockResolvedValueOnce([
        {
          triggeredAt: at('2026-10-09T10:00:00Z'),
          volunteerAcceptedAt: at('2026-10-09T10:02:00Z'),
        },
      ]);

    const profile = await service.get('u1');

    expect(profile.circles).toEqual([{ elderId: 'e1', elderName: 'Grace Wanjiku', place: 1 }]);
    expect(profile.record).toEqual({
      answered: 3,
      medianResponseSeconds: 120,
      lastAnsweredAt: '2026-10-09T10:02:00.000Z',
    });
    expect(profile.carers).toEqual([]);
  });

  it('says nothing was answered rather than inventing a time', async () => {
    const { service } = build(Role.FAMILY_MEMBER);
    const profile = await service.get('u1');
    expect(profile.record).toEqual({
      answered: 0,
      medianResponseSeconds: null,
      lastAnsweredAt: null,
    });
  });

  it('gives an elder their carers in the order they are asked, and no record', async () => {
    const { prisma, service } = build(Role.ELDER);
    prisma.careAssignment.findMany.mockResolvedValue([
      {
        priorityOrder: 1,
        responder: { name: 'Mary Otieno', role: Role.CAREGIVER, phone: '+254700000020' },
      },
    ]);

    const profile = await service.get('u1');

    expect(profile.record).toBeNull();
    expect(profile.circles).toEqual([]);
    expect(profile.carers).toEqual([
      { name: 'Mary Otieno', role: Role.CAREGIVER, place: 1, phone: '+254700000020' },
    ]);
    const query = prisma.careAssignment.findMany.mock.calls[0][0] as { where: unknown };
    expect(query.where).toEqual({ elderlyId: 'u1', responder: { deactivatedAt: null } });
  });

  it('takes the middle of an even list as the mean of the two middle values', () => {
    expect(ProfileService.median([10, 20, 40, 90])).toBe(30);
    expect(ProfileService.median([])).toBeNull();
  });
});
