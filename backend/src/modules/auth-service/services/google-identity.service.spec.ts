import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { GOOGLE_CERTS_URL, GoogleIdentityService } from './google-identity.service';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
const jwt = new JwtService({});

/** A token shaped like Google's, signed with the test key, overridable claim by claim. */
const token = (claims: Record<string, unknown> = {}, kid = 'key-1'): string =>
  jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      email: 'Admin@Example.com',
      email_verified: true,
      ...claims,
    },
    { privateKey, algorithm: 'RS256', keyid: kid, expiresIn: '5m' },
  );

const build = (clientId: string = CLIENT_ID) =>
  new GoogleIdentityService(
    { get: (key: string) => (key === 'GOOGLE_CLIENT_ID' ? clientId : undefined) } as ConfigService,
    jwt,
  );

describe('GoogleIdentityService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'cache-control': 'public, max-age=3600' },
      }),
    );
  });
  afterEach(() => fetchMock.mockRestore());

  it('returns the verified email, lower-cased', async () => {
    await expect(build().verify(token())).resolves.toBe('admin@example.com');
    expect(fetchMock).toHaveBeenCalledWith(GOOGLE_CERTS_URL, expect.anything());
  });

  it('fetches the keys once and reuses them while they are fresh', async () => {
    const service = build();
    await service.verify(token());
    await service.verify(token());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a token for another client', async () => {
    await expect(build().verify(token({ aud: 'someone-else' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a token from another issuer', async () => {
    await expect(build().verify(token({ iss: 'https://evil.example' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses an address Google has not verified', async () => {
    await expect(build().verify(token({ email_verified: false }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a token signed with a key Google did not publish', async () => {
    await expect(build().verify(token({}, 'unknown-key'))).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a token whose signature does not match', async () => {
    const [header, payload] = token().split('.');
    const forged = `${header}.${payload}.${Buffer.from('not a signature').toString('base64url')}`;
    await expect(build().verify(forged)).rejects.toThrow(UnauthorizedException);
  });

  it('is not found when no client ID is configured', async () => {
    await expect(build('').verify(token())).rejects.toThrow(NotFoundException);
  });
});
