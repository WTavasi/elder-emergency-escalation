import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EldersService } from './elders.service';
import type { PrismaService } from '../prisma/prisma.service';

const elderAtHome = {
  id: 'elder-1',
  role: Role.ELDER,
  currentLatitude: null,
  currentLongitude: null,
  currentPlaceLabel: null,
  currentPlaceSetAt: null,
};

interface PrismaMock {
  user: { findUnique: jest.Mock; update: jest.Mock };
  careAssignment: { findFirst: jest.Mock };
}

const buildPrisma = (): PrismaMock => ({
  user: {
    findUnique: jest.fn().mockResolvedValue(elderAtHome),
    update: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...elderAtHome, ...args.data }),
    ),
  },
  careAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }) },
});

const build = (prisma: PrismaMock) => new EldersService(prisma as unknown as PrismaService);

describe('EldersService', () => {
  describe('reading where an elder is', () => {
    it('reports at home when no stay is recorded', async () => {
      const view = await build(buildPrisma()).place('elder-1', 'caregiver-1', Role.CAREGIVER);

      expect(view.isAtHome).toBe(true);
      expect(view.latitude).toBeNull();
      expect(view.label).toBeNull();
    });

    it('reports the place when a stay is recorded', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue({
        ...elderAtHome,
        currentLatitude: -1.31,
        currentLongitude: 36.83,
        currentPlaceLabel: 'Staying with her daughter, South B',
        currentPlaceSetAt: new Date('2026-09-29T08:00:00.000Z'),
      });

      const view = await build(prisma).place('elder-1', 'caregiver-1', Role.CAREGIVER);

      expect(view.isAtHome).toBe(false);
      expect(view.latitude).toBe(-1.31);
      expect(view.label).toBe('Staying with her daughter, South B');
      expect(view.setAt).toBe('2026-09-29T08:00:00.000Z');
    });
  });

  describe('recording a stay', () => {
    it('stores the place and who recorded it', async () => {
      const prisma = buildPrisma();

      await build(prisma).setPlace('elder-1', 'caregiver-1', Role.CAREGIVER, {
        latitude: -1.31,
        longitude: 36.83,
        label: 'Staying with her daughter, South B',
      });

      const args = prisma.user.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(Number(args.data.currentLatitude)).toBe(-1.31);
      expect(args.data.currentPlaceLabel).toBe('Staying with her daughter, South B');
      expect(args.data.currentPlaceSetById).toBe('caregiver-1');
    });

    it('clearing it puts the elder back at their registered home', async () => {
      const prisma = buildPrisma();

      const view = await build(prisma).clearPlace('elder-1', 'caregiver-1', Role.CAREGIVER);

      const args = prisma.user.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(args.data.currentLatitude).toBeNull();
      expect(args.data.currentPlaceLabel).toBeNull();
      // The timestamp is still written, so the record says when they came back rather
      // than losing that a stay ever happened.
      expect(args.data.currentPlaceSetAt).toBeInstanceOf(Date);
      expect(view.isAtHome).toBe(true);
    });
  });

  describe('who may do it', () => {
    it('refuses a caregiver who does not look after this person', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findFirst.mockResolvedValue(null);

      await expect(
        build(prisma).setPlace('elder-1', 'stranger-1', Role.CAREGIVER, {
          latitude: -1.31,
          longitude: 36.83,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lets an administrator through without a care assignment', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findFirst.mockResolvedValue(null);

      await build(prisma).setPlace('elder-1', 'admin-1', Role.ADMINISTRATOR, {
        latitude: -1.31,
        longitude: 36.83,
      });

      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.careAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('refuses an account that is not an elder', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue({ ...elderAtHome, role: Role.CAREGIVER });

      await expect(
        build(prisma).place('caregiver-2', 'admin-1', Role.ADMINISTRATOR),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
