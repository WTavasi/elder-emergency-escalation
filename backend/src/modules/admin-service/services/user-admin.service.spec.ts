import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { PasswordService } from '../../auth-service/services/password.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import type { AccessRevocationService } from '../../auth-service/services/access-revocation.service';
import type { RealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import { UserAdminService } from './user-admin.service';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const CAREGIVER = '00000000-0000-4000-8000-000000000020';
const OTHER_ADMIN = '00000000-0000-4000-8000-000000000002';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: CAREGIVER,
  name: 'Mary Otieno',
  phone: '+254700000020',
  email: null,
  role: Role.CAREGIVER,
  createdAt: new Date('2026-09-01T08:00:00Z'),
  deactivatedAt: null,
  coverageAreaName: null,
  coverageLatitude: null,
  coverageLongitude: null,
  coverageRadiusKm: null,
  _count: { assignmentsAsCarer: 2 },
  ...overrides,
});

function build() {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue(row()),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...args.data, id: 'new', _count: { assignmentsAsCarer: 0 } })),
      ),
      update: jest.fn().mockResolvedValue(row()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    emergencyEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const passwords = { hash: jest.fn((plain: string) => `hashed:${plain}`) };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const revocations = {
    revoke: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { emergencyUpdated: jest.fn(), disconnectUsers: jest.fn() };
  const service = new UserAdminService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    sms as unknown as DirectSmsService,
    revocations as unknown as AccessRevocationService,
    realtime as unknown as RealtimePublisher,
  );
  return { service, prisma, sms, revocations, realtime };
}

const responder = {
  name: 'Kevin Mutua',
  phone: '+254711000111',
  role: Role.EMERGENCY_RESPONDER,
  password: 'Temporary!2026',
  coverage: { areaName: 'Kilimani', latitude: -1.29, longitude: 36.78, radiusKm: 5 },
} as const;

describe('UserAdminService', () => {
  describe('listing', () => {
    it('pages, and counts with the same filter', async () => {
      const { service, prisma } = build();
      prisma.user.count.mockResolvedValue(1240);

      const page = await service.list({ page: 3, pageSize: 10, role: Role.CAREGIVER });

      expect(page.total).toBe(1240);
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.skip).toBe(20);
      expect(args.take).toBe(10);
      expect(prisma.user.count.mock.calls[0][0].where).toEqual(args.where);
    });

    it('searches names, phone numbers and emails', async () => {
      const { service, prisma } = build();
      await service.list({ q: 'mary' });
      const where = prisma.user.findMany.mock.calls[0][0].where as { OR: unknown[] };
      expect(where.OR).toHaveLength(3);
    });

    it('never returns a password hash or a token', async () => {
      const { service, prisma } = build();
      await service.list({});
      const select = prisma.user.findMany.mock.calls[0][0].select as Record<string, unknown>;
      expect(select).not.toHaveProperty('passwordHash');
      expect(select).not.toHaveProperty('refreshTokenHash');
      expect(select).not.toHaveProperty('pushToken');
    });
  });

  describe('creating', () => {
    it('makes a responder with an area, hashes the password, and tells them by SMS', async () => {
      const { service, prisma, sms } = build();

      const created = await service.create({ ...responder }, ADMIN);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).toBe('hashed:Temporary!2026');
      expect(data.coverageAreaName).toBe('Kilimani');
      expect(created.coverage?.radiusKm).toBe(5);
      // The SMS says the account exists and nothing more: never the password.
      const message = sms.send.mock.calls[0][1] as string;
      expect(message).toContain('emergency responder');
      expect(message).not.toContain('Temporary');
      expect(message.length).toBeLessThanOrEqual(160);
    });

    it('refuses a responder with no area', async () => {
      const { service } = build();
      await expect(service.create({ ...responder, coverage: undefined }, ADMIN)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('names a phone number that is already taken', async () => {
      const { service, prisma } = build();
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('taken', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['phone'] },
        }),
      );
      await expect(service.create({ ...responder }, ADMIN)).rejects.toThrow(
        'Another account already uses that phone number',
      );
    });
  });

  describe('deactivating', () => {
    it('ends every session straight away: tokens revoked, live connections closed', async () => {
      const { service, revocations, realtime } = build();

      await service.deactivate([CAREGIVER], ADMIN);

      expect(revocations.revoke).toHaveBeenCalledWith([CAREGIVER]);
      expect(realtime.disconnectUsers).toHaveBeenCalledWith([CAREGIVER]);
    });

    it('revokes nothing when it refuses', async () => {
      const { service, revocations } = build();
      await expect(service.deactivate([ADMIN], ADMIN)).rejects.toThrow();
      expect(revocations.revoke).not.toHaveBeenCalled();
    });

    it('stops the account signing in and being sent anything', async () => {
      const { service, prisma } = build();

      await service.deactivate([CAREGIVER], ADMIN);

      const update = prisma.user.updateMany.mock.calls[0][0];
      expect(update.data.deactivatedAt).toBeInstanceOf(Date);
      expect(update.data.refreshTokenHash).toBeNull();
      expect(update.data.pushToken).toBeNull();
    });

    it("refuses the administrator's own account", async () => {
      const { service } = build();
      await expect(service.deactivate([ADMIN], ADMIN)).rejects.toThrow(
        'You cannot deactivate your own account',
      );
    });

    it('refuses somebody handling an open emergency, naming them', async () => {
      const { service, prisma } = build();
      prisma.emergencyEvent.findMany.mockResolvedValue([{ owner: { name: 'Mary Otieno' } }]);
      await expect(service.deactivate([CAREGIVER], ADMIN)).rejects.toThrow(
        'Mary Otieno is handling an open emergency',
      );
    });

    it('refuses to leave no active administrator', async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([
        { id: OTHER_ADMIN, name: 'Ops', role: Role.ADMINISTRATOR, deactivatedAt: null },
      ]);
      prisma.user.count.mockResolvedValue(1);
      await expect(service.deactivate([OTHER_ADMIN], ADMIN)).rejects.toThrow(ConflictException);
    });

    it('brings an account back, and lifts the revocation at once', async () => {
      const { service, prisma, revocations } = build();
      await service.reactivate([CAREGIVER], ADMIN);
      expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ deactivatedAt: null });
      expect(revocations.restore).toHaveBeenCalledWith([CAREGIVER]);
    });
  });

  describe('editing', () => {
    it('refuses an area for anybody but a responder', async () => {
      const { service } = build();
      await expect(service.update(CAREGIVER, { coverage: responder.coverage })).rejects.toThrow(
        'Only an emergency responder has an area',
      );
    });

    it('lower-cases an email and removes one given null', async () => {
      const { service, prisma } = build();
      await service.update(CAREGIVER, { email: 'Mary@Example.com' });
      expect(prisma.user.update.mock.calls[0][0].data.email).toBe('mary@example.com');
      await service.update(CAREGIVER, { email: null });
      expect(prisma.user.update.mock.calls[1][0].data.email).toBeNull();
    });
  });
});
