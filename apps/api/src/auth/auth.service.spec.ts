import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, type User } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { PrismaService } from '../prisma/prisma.service';

const secrets: Record<string, string | number> = {
  JWT_ACCESS_SECRET: 'access-secret-that-is-long-enough-for-tests',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-long-enough-for-tests',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  SCRYPT_N: 2048,
};

const config = {
  getOrThrow: (key: string) => secrets[key],
  get: (key: string, fallback: unknown) => secrets[key] ?? fallback,
} as unknown as ConfigService;

const passwords = new PasswordService(config);
const tokens = new TokenService(new JwtService({}), config);

const fingerprint = (token: string): string => createHash('sha256').update(token).digest('base64');

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    name: 'Mary Otieno',
    phone: '+254700000020',
    email: 'mary@example.com',
    role: Role.CAREGIVER,
    passwordHash: passwords.hash('Dev!2026'),
    refreshTokenHash: null,
    refreshTokenUpdatedAt: null,
    ...overrides,
  }) as unknown as User;

interface PrismaMock {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
}

const buildPrisma = (): PrismaMock => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  },
});

const buildService = (prisma: PrismaMock): AuthService =>
  new AuthService(prisma as unknown as PrismaService, passwords, tokens);

describe('AuthService', () => {
  describe('register', () => {
    it('stores a hash rather than the password, and returns both tokens', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockImplementation((args: { data: { passwordHash: string } }) =>
        Promise.resolve(buildUser({ passwordHash: args.data.passwordHash })),
      );

      const result = await buildService(prisma).register({
        name: 'Mary Otieno',
        phone: '+254700000020',
        password: 'Dev!2026',
        role: Role.CAREGIVER,
      });

      const stored = prisma.user.create.mock.calls[0][0].data.passwordHash as string;
      expect(stored).not.toContain('Dev!2026');
      expect(passwords.verify('Dev!2026', stored)).toBe(true);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('stores only a fingerprint of the refresh token', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockResolvedValue(buildUser());

      const result = await buildService(prisma).register({
        name: 'Mary Otieno',
        phone: '+254700000020',
        password: 'Dev!2026',
        role: Role.CAREGIVER,
      });

      const saved = prisma.user.update.mock.calls[0][0].data.refreshTokenHash as string;
      expect(saved).toBe(fingerprint(result.refreshToken));
      expect(saved).not.toBe(result.refreshToken);
    });

    it('turns a unique constraint violation into a conflict, naming the field', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['phone'] },
        }),
      );

      await expect(
        buildService(prisma).register({
          name: 'Mary Otieno',
          phone: '+254700000020',
          password: 'Dev!2026',
          role: Role.CAREGIVER,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('issues tokens for correct credentials', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await buildService(prisma).login({
        phone: '+254700000020',
        password: 'Dev!2026',
      });
      expect(result.user.role).toBe(Role.CAREGIVER);
      expect(result.accessToken).toBeTruthy();
    });

    it('gives the same answer for an unknown account and a wrong password', async () => {
      const unknownPrisma = buildPrisma();
      unknownPrisma.user.findUnique.mockResolvedValue(null);

      const wrongPrisma = buildPrisma();
      wrongPrisma.user.findUnique.mockResolvedValue(buildUser());

      const attempt = (prisma: PrismaMock, password: string): Promise<unknown> =>
        buildService(prisma).login({ phone: '+254700000020', password });

      await expect(attempt(unknownPrisma, 'Dev!2026')).rejects.toThrow(
        'Phone number or password is incorrect',
      );
      await expect(attempt(wrongPrisma, 'wrong-password')).rejects.toThrow(
        'Phone number or password is incorrect',
      );
    });

    it('upgrades a hash that used weaker parameters', async () => {
      const prisma = buildPrisma();
      // Only N is lowered; r and p must keep their real values or scrypt runs out of memory.
      const weak = new PasswordService({
        get: (key: string, fallback: number) => (key === 'SCRYPT_N' ? 1024 : fallback),
      } as unknown as ConfigService).hash('Dev!2026');
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash: weak }));

      await buildService(prisma).login({ phone: '+254700000020', password: 'Dev!2026' });

      const rehash = prisma.user.update.mock.calls.find(
        (call: [{ data: Record<string, unknown> }]) => 'passwordHash' in call[0].data,
      );
      expect(rehash).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('rotates the stored fingerprint on every use', async () => {
      const prisma = buildPrisma();
      const service = buildService(prisma);
      const { token } = await tokens.signRefresh('user-1');
      prisma.user.findUnique.mockResolvedValue(buildUser({ refreshTokenHash: fingerprint(token) }));

      const result = await service.refresh(token);
      expect(result.refreshToken).not.toBe(token);

      const saved = prisma.user.update.mock.calls.at(-1)?.[0].data.refreshTokenHash as string;
      expect(saved).toBe(fingerprint(result.refreshToken));
    });

    it('revokes every session when a token is replayed', async () => {
      const prisma = buildPrisma();
      const { token } = await tokens.signRefresh('user-1');
      // A different token is on file, meaning this one was already spent.
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ refreshTokenHash: fingerprint('some-older-token') }),
      );

      await expect(buildService(prisma).refresh(token)).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ refreshTokenHash: null }) }),
      );
    });

    it('refuses when the user has already signed out', async () => {
      const prisma = buildPrisma();
      const { token } = await tokens.signRefresh('user-1');
      prisma.user.findUnique.mockResolvedValue(buildUser({ refreshTokenHash: null }));

      await expect(buildService(prisma).refresh(token)).rejects.toThrow(
        'Session has ended. Please sign in again.',
      );
    });

    it('refuses an access token used as a refresh token', async () => {
      const prisma = buildPrisma();
      const access = await tokens.signAccess('user-1', Role.CAREGIVER);
      await expect(buildService(prisma).refresh(access)).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears the stored fingerprint', async () => {
      const prisma = buildPrisma();
      await buildService(prisma).logout('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ refreshTokenHash: null }),
      });
    });
  });

  describe('me', () => {
    it('never returns the password hash or the refresh fingerprint', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser({ refreshTokenHash: 'abc' }));

      const summary = await buildService(prisma).me('user-1');
      expect(Object.keys(summary).sort()).toEqual(['email', 'home', 'id', 'name', 'phone', 'role']);
      expect(JSON.stringify(summary)).not.toContain('scrypt');
    });

    it('gives an elder their own registered home, which the app needs to raise an alert', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          role: Role.ELDER,
          homeLatitude: new Prisma.Decimal('-1.286389'),
          homeLongitude: new Prisma.Decimal('36.817223'),
          homeAddressLabel: 'Kilimani, Nairobi',
        }),
      );

      const summary = await buildService(prisma).me('user-1');

      // Numbers rather than Decimals, because this crosses the wire to a client that
      // has no such type.
      expect(summary.home).toEqual({
        latitude: -1.286389,
        longitude: 36.817223,
        addressLabel: 'Kilimani, Nairobi',
      });
    });

    it('gives a caregiver no home at all', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({
          role: Role.CAREGIVER,
          homeLatitude: new Prisma.Decimal('-1.286389'),
          homeLongitude: new Prisma.Decimal('36.817223'),
        }),
      );

      // A caregiver learns where an emergency happened from the emergency itself, not
      // from a standing copy of somebody's address.
      expect((await buildService(prisma).me('user-1')).home).toBeNull();
    });

    it('gives an elder with no registered home null rather than a half location', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ role: Role.ELDER, homeLatitude: null, homeLongitude: null }),
      );

      expect((await buildService(prisma).me('user-1')).home).toBeNull();
    });
  });
});
