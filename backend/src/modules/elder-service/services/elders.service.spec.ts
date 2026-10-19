import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConsentType, Role } from '@prisma/client';
import { EldersService } from './elders.service';
import type { PrismaService } from '../../../db/prisma.service';

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
  consentRecord: { findMany: jest.Mock };
  emergencyEvent: { count: jest.Mock };
}

const buildPrisma = (): PrismaMock => ({
  user: {
    findUnique: jest.fn().mockResolvedValue(elderAtHome),
    update: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...elderAtHome, ...args.data }),
    ),
  },
  careAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }) },
  // No consent recorded and no emergency open, unless a test says otherwise.
  consentRecord: { findMany: jest.fn().mockResolvedValue([]) },
  emergencyEvent: { count: jest.fn().mockResolvedValue(0) },
});

const withdrawn = (type: ConsentType) => ({ type, withdrawnAt: new Date() });

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

describe('EldersService, details and editing', () => {
  const elder = {
    ...elderAtHome,
    name: 'Grace Wanjiru',
    phone: '+254700000010',
    careLevel: null,
    homeLatitude: -1.2833,
    homeLongitude: 36.7833,
    homeAddressLabel: 'Kilimani, Nairobi',
  };

  const prismaWith = () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue(elder);
    prisma.user.update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...elder, ...args.data }),
    );
    return prisma;
  };

  it('shows the home and lets a caregiver edit, but not a family member', async () => {
    const service = build(prismaWith());

    const forCaregiver = await service.detail('elder-1', 'caregiver-1', Role.CAREGIVER);
    expect(forCaregiver.home).toEqual({
      latitude: -1.2833,
      longitude: 36.7833,
      label: 'Kilimani, Nairobi',
    });
    expect(forCaregiver.place.isAtHome).toBe(true);
    expect(forCaregiver.canEdit).toBe(true);

    const forFamily = await service.detail('elder-1', 'family-1', Role.FAMILY_MEMBER);
    expect(forFamily.canEdit).toBe(false);
  });

  it('moves the registered home and changes the care level', async () => {
    const prisma = prismaWith();
    const detail = await build(prisma).update('elder-1', 'caregiver-1', Role.CAREGIVER, {
      careLevel: 'HIGH_DEPENDENCY',
      home: { latitude: -1.3, longitude: 36.8, label: 'South B, Nairobi' },
    });

    expect(detail.careLevel).toBe('HIGH_DEPENDENCY');
    expect(detail.home?.label).toBe('South B, Nairobi');
    expect(Number(prisma.user.update.mock.calls[0][0].data.homeLatitude)).toBe(-1.3);
  });

  it('clears the care level back to not sure with null', async () => {
    const prisma = prismaWith();
    await build(prisma).update('elder-1', 'caregiver-1', Role.CAREGIVER, { careLevel: null });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ careLevel: null });
  });

  it('refuses edits from a family member', async () => {
    await expect(
      build(prismaWith()).update('elder-1', 'family-1', Role.FAMILY_MEMBER, { careLevel: null }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('EldersService, after a consent is withdrawn', () => {
  const elder = {
    id: 'elder-1',
    role: Role.ELDER,
    name: 'Grace',
    phone: '+254700000010',
    careLevel: null,
    homeLatitude: -1.2833,
    homeLongitude: 36.7833,
    homeAddressLabel: 'Kileleshwa',
    currentLatitude: -1.3,
    currentLongitude: 36.8,
    currentPlaceLabel: 'Her daughter, Karen',
    currentPlaceSetAt: new Date(),
  };

  it('hides the number once contact sharing is withdrawn, and says so', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue(elder);
    prisma.consentRecord.findMany.mockResolvedValue([withdrawn(ConsentType.CONTACT_SHARING)]);

    const detail = await build(prisma).detail('elder-1', 'caregiver-1', Role.CAREGIVER);

    expect(detail.phone).toBeNull();
    expect(detail.home?.label).toBe('Kileleshwa');
    expect(detail.withheld).toEqual(['phone']);
  });

  it('hides the home and any stay, even whether she is at home, once location sharing is', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue(elder);
    prisma.consentRecord.findMany.mockResolvedValue([withdrawn(ConsentType.LOCATION_SHARING)]);

    const detail = await build(prisma).detail('elder-1', 'caregiver-1', Role.CAREGIVER);

    expect(detail.home).toBeNull();
    expect(detail.place).toMatchObject({ withheld: true, label: null, latitude: null });
    expect(detail.phone).toBe('+254700000010');
  });

  it('shows everything while an emergency is open, whatever was withdrawn', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue(elder);
    prisma.consentRecord.findMany.mockResolvedValue([
      withdrawn(ConsentType.LOCATION_SHARING),
      withdrawn(ConsentType.CONTACT_SHARING),
    ]);
    prisma.emergencyEvent.count.mockResolvedValue(1);

    const detail = await build(prisma).detail('elder-1', 'caregiver-1', Role.CAREGIVER);

    expect(detail.phone).toBe('+254700000010');
    expect(detail.place.label).toBe('Her daughter, Karen');
    expect(detail.withheld).toEqual([]);
  });

  it('still shows everything when only an earlier record was withdrawn and a later one stands', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue(elder);
    prisma.consentRecord.findMany.mockResolvedValue([
      withdrawn(ConsentType.CONTACT_SHARING),
      { type: ConsentType.CONTACT_SHARING, withdrawnAt: null },
    ]);

    const detail = await build(prisma).detail('elder-1', 'caregiver-1', Role.CAREGIVER);
    expect(detail.phone).toBe('+254700000010');
  });
});
