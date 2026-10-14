import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, type User } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import type { GoogleIdentityService } from './google-identity.service';
import { WRONG_CODE, type PhoneVerificationService } from './phone-verification.service';
import { TokenService } from './token.service';
import type { PrismaService } from '../../../db/prisma.service';

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
  consentRecord: { create: jest.Mock };
  chainInvitation: { findMany: jest.Mock; deleteMany: jest.Mock };
  careAssignment: { createMany: jest.Mock };
  escalationRule: { findFirst: jest.Mock };
  $transaction: jest.Mock;
}

const buildPrisma = (): PrismaMock => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    consentRecord: { create: jest.fn().mockResolvedValue(undefined) },
    chainInvitation: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    careAssignment: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    escalationRule: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  } as PrismaMock;
  // The transaction runs its callback against the same mock, which is what a real
  // interactive transaction looks like from inside.
  prisma.$transaction.mockImplementation((work: (tx: PrismaMock) => unknown) => work(prisma));
  return prisma;
};

const buildVerification = () => ({
  consume: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
});

const buildGoogle = (
  email = 'admin@example.com',
  clientId: string | null = 'id.apps.googleusercontent.com',
) => ({
  verify: jest.fn().mockResolvedValue(email),
  clientId,
});

const buildService = (
  prisma: PrismaMock,
  verification = buildVerification(),
  google = buildGoogle(),
): AuthService =>
  new AuthService(
    prisma as unknown as PrismaService,
    passwords,
    tokens,
    verification as unknown as PhoneVerificationService,
    google as unknown as GoogleIdentityService,
  );

const signUp = {
  name: 'Mary Otieno',
  phone: '+254700000020',
  code: '123456',
  password: 'Dev!2026',
  role: Role.CAREGIVER,
  acceptedPrivacyNotice: true,
} as const;

describe('AuthService', () => {
  describe('register', () => {
    it('stores a hash rather than the password, and returns both tokens', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockImplementation((args: { data: { passwordHash: string } }) =>
        Promise.resolve(buildUser({ passwordHash: args.data.passwordHash })),
      );

      const result = await buildService(prisma).register({ ...signUp });

      const stored = prisma.user.create.mock.calls[0][0].data.passwordHash as string;
      expect(stored).not.toContain('Dev!2026');
      expect(passwords.verify('Dev!2026', stored)).toBe(true);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('stores only a fingerprint of the refresh token', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockResolvedValue(buildUser());

      const result = await buildService(prisma).register({ ...signUp });

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

      await expect(buildService(prisma).register({ ...signUp })).rejects.toThrow(ConflictException);
    });
  });

  describe('register, with a phone code', () => {
    it('writes nothing when the code is wrong', async () => {
      const prisma = buildPrisma();
      const verification = buildVerification();
      verification.consume.mockRejectedValue(new BadRequestException('wrong'));

      await expect(buildService(prisma, verification).register({ ...signUp })).rejects.toThrow(
        BadRequestException,
      );
      expect(verification.consume).toHaveBeenCalledWith('+254700000020', '123456');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('records the privacy consent as given by the person themselves', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockResolvedValue(buildUser());

      await buildService(prisma).register({ ...signUp });

      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subjectId: 'user-1',
          grantedById: 'user-1',
          type: 'DATA_PROCESSING',
          grantorRelationship: 'self',
        }) as unknown,
      });
    });

    it('takes any chain places held for the number, at the rank they were held at', async () => {
      const prisma = buildPrisma();
      prisma.user.create.mockResolvedValue(buildUser());
      prisma.chainInvitation.findMany.mockResolvedValue([
        { elderlyId: 'elder-1', phone: '+254700000020', priorityOrder: 2 },
      ]);
      prisma.careAssignment.createMany.mockResolvedValue({ count: 1 });

      await buildService(prisma).register({ ...signUp });

      expect(prisma.careAssignment.createMany).toHaveBeenCalledWith({
        data: [{ elderlyId: 'elder-1', responderId: 'user-1', priorityOrder: 2 }],
        skipDuplicates: true,
      });
      expect(prisma.chainInvitation.deleteMany).toHaveBeenCalledWith({
        where: { phone: '+254700000020' },
      });
    });
  });

  describe('profile', () => {
    it('changes the name and lower-cases the email', async () => {
      const prisma = buildPrisma();
      prisma.user.update.mockImplementation((args: { data: Partial<User> }) =>
        Promise.resolve(buildUser(args.data)),
      );

      const summary = await buildService(prisma).updateProfile('user-1', {
        name: ' Mary W. Otieno ',
        email: 'Mary@Example.com',
      });

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        name: 'Mary W. Otieno',
        email: 'mary@example.com',
      });
      expect(summary.name).toBe('Mary W. Otieno');
    });

    it('removes the email when given null', async () => {
      const prisma = buildPrisma();
      prisma.user.update.mockResolvedValue(buildUser({ email: null }));

      await buildService(prisma).updateProfile('user-1', { email: null });

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ email: null });
    });

    it('says when another account has the email', async () => {
      const prisma = buildPrisma();
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        }),
      );

      await expect(
        buildService(prisma).updateProfile('user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('refuses a wrong current password with a 400, not a 401', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        buildService(prisma).changePassword('user-1', {
          currentPassword: 'wrong',
          newPassword: 'Another!2026',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores the new password and issues fresh tokens, ending other sessions', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockImplementation((args: { data: Partial<User> }) =>
        Promise.resolve(buildUser(args.data)),
      );

      const result = await buildService(prisma).changePassword('user-1', {
        currentPassword: 'Dev!2026',
        newPassword: 'Another!2026',
      });

      const stored = prisma.user.update.mock.calls[0][0].data.passwordHash as string;
      expect(passwords.verify('Another!2026', stored)).toBe(true);
      // The second update replaces the refresh-token fingerprint, which is what signs
      // every other device out at its next refresh.
      const saved = prisma.user.update.mock.calls[1][0].data.refreshTokenHash as string;
      expect(saved).toBe(fingerprint(result.refreshToken));
    });

    it('refuses the same password again', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        buildService(prisma).changePassword('user-1', {
          currentPassword: 'Dev!2026',
          newPassword: 'Dev!2026',
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('finds the account by email, in any case, when no phone is given', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await buildService(prisma).login({ email: ' Mary@Example.com ', password: 'Dev!2026' });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'mary@example.com' },
      });
    });

    it('gives one answer for an unknown email and a wrong password', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        buildService(prisma).login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow('Email or password is incorrect');
    });

    it('uses the phone when given both, so two handles cannot widen a guess', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser());
      await buildService(prisma).login({
        phone: '+254700000020',
        email: 'other@example.com',
        password: 'Dev!2026',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '+254700000020' } });
    });

    it('refuses a deactivated account, but only once the password is right', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser({ deactivatedAt: new Date() }));

      await expect(
        buildService(prisma).login({ phone: '+254700000020', password: 'wrong-password' }),
      ).rejects.toThrow('Phone number or password is incorrect');
      await expect(
        buildService(prisma).login({ phone: '+254700000020', password: 'Dev!2026' }),
      ).rejects.toThrow('This account has been deactivated');
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

  describe('forgotten password', () => {
    it('asks for a reset code rather than a sign-up code', async () => {
      const verification = buildVerification();
      await buildService(buildPrisma(), verification).forgotPassword('+254700000020');
      expect(verification.start).toHaveBeenCalledWith('+254700000020', 'reset');
    });

    it('checks the code as a reset code, stores the new password and signs in', async () => {
      const prisma = buildPrisma();
      const verification = buildVerification();
      prisma.user.findUnique.mockResolvedValue(buildUser());
      prisma.user.update.mockImplementation((args: { data: Partial<User> }) =>
        Promise.resolve(buildUser(args.data)),
      );

      const result = await buildService(prisma, verification).resetPassword({
        phone: '+254700000020',
        code: '123456',
        newPassword: 'Brand-new-2026',
      });

      expect(verification.consume).toHaveBeenCalledWith('+254700000020', '123456', 'reset');
      const stored = prisma.user.update.mock.calls[0][0].data.passwordHash as string;
      expect(passwords.verify('Brand-new-2026', stored)).toBe(true);
      // A new refresh fingerprint is what ends the sessions held with the old password.
      const rotated = prisma.user.update.mock.calls.find(
        (call: [{ data: Record<string, unknown> }]) => 'refreshTokenHash' in call[0].data,
      );
      expect(rotated?.[0].data.refreshTokenHash).toBe(fingerprint(result.refreshToken));
    });

    it('changes nothing when the code is wrong', async () => {
      const prisma = buildPrisma();
      const verification = buildVerification();
      verification.consume.mockRejectedValue(new BadRequestException(WRONG_CODE));

      await expect(
        buildService(prisma, verification).resetPassword({
          phone: '+254700000020',
          code: '000000',
          newPassword: 'Brand-new-2026',
        }),
      ).rejects.toThrow(WRONG_CODE);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('Google, for administrators', () => {
    it('signs in an administrator whose account has the address', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ role: Role.ADMINISTRATOR, email: 'admin@example.com' }),
      );

      const result = await buildService(prisma).signInWithGoogle('token');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
      });
      expect(result.user.role).toBe(Role.ADMINISTRATOR);
    });

    it('refuses an address that is on no account, and creates none', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(buildService(prisma).signInWithGoogle('token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses a deactivated administrator', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ role: Role.ADMINISTRATOR, deactivatedAt: new Date() }),
      );
      await expect(buildService(prisma).signInWithGoogle('token')).rejects.toThrow(
        'This account has been deactivated',
      );
    });

    it('refuses an account that is not an administrator', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(buildUser({ email: 'admin@example.com' }));
      await expect(buildService(prisma).signInWithGoogle('token')).rejects.toThrow(
        'No administrator account uses this Google address',
      );
    });

    it('tells the console whether to show the button', () => {
      expect(buildService(buildPrisma()).providers()).toEqual({
        google: { clientId: 'id.apps.googleusercontent.com' },
      });
      expect(
        buildService(buildPrisma(), buildVerification(), buildGoogle('a@b.c', null)).providers(),
      ).toEqual({ google: null });
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
