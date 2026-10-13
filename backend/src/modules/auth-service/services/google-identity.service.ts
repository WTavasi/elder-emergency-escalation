import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey, type JsonWebKey } from 'node:crypto';

/** Where Google publishes the keys its ID tokens are signed with. */
export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS: [string, string] = ['accounts.google.com', 'https://accounts.google.com'];
const REFUSED = 'Google could not confirm that account. Try again.';
/** Used when Google's answer carries no lifetime, which it always has so far. */
const DEFAULT_KEY_LIFETIME_MS = 60 * 60 * 1000;

interface GoogleClaims {
  email?: unknown;
  email_verified?: unknown;
}

interface KeySet {
  pemByKid: Map<string, string>;
  expiresAt: number;
}

/**
 * Checks an ID token from Google's sign-in button, and says which email it proves.
 *
 * The token is a JWT signed by Google. It is verified here against Google's published
 * keys, for this deployment's client ID, from Google's issuer, and unexpired, before a
 * single claim in it is believed. No Google library is involved: the keys are public
 * JSON, Node turns them into public keys itself, and the JWT library already in the API
 * checks the signature, so verifying a Google token adds no dependency.
 *
 * Keys are cached for as long as Google's own Cache-Control says, and fetched again
 * once when a token names a key the cache has not seen, which is what a key rotation
 * looks like from here.
 */
@Injectable()
export class GoogleIdentityService {
  private readonly logger = new Logger(GoogleIdentityService.name);
  private keys: KeySet | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /** The OAuth client ID, or null when Google sign-in is not set up here. */
  get clientId(): string | null {
    return this.config.get<string>('GOOGLE_CLIENT_ID') || null;
  }

  /** The verified, lower-cased email address the token proves. */
  async verify(idToken: string): Promise<string> {
    const clientId = this.clientId;
    if (!clientId) throw new NotFoundException('Google sign-in is not set up on this server');

    const kid = GoogleIdentityService.keyId(idToken);
    const pem = kid ? await this.keyFor(kid) : null;
    if (!pem) throw new UnauthorizedException(REFUSED);

    let claims: GoogleClaims;
    try {
      claims = await this.jwt.verifyAsync<GoogleClaims & object>(idToken, {
        publicKey: pem,
        algorithms: ['RS256'],
        audience: clientId,
        issuer: GOOGLE_ISSUERS,
      });
    } catch {
      throw new UnauthorizedException(REFUSED);
    }

    // An unverified address proves nothing about who holds it.
    if (claims.email_verified !== true || typeof claims.email !== 'string') {
      throw new UnauthorizedException(REFUSED);
    }
    return claims.email.trim().toLowerCase();
  }

  private async keyFor(kid: string): Promise<string | null> {
    const cached = this.keys && this.keys.expiresAt > Date.now() ? this.keys : null;
    const hit = cached?.pemByKid.get(kid);
    if (hit) return hit;

    this.keys = await this.fetchKeys();
    return this.keys?.pemByKid.get(kid) ?? null;
  }

  private async fetchKeys(): Promise<KeySet | null> {
    try {
      const response = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };

      const pemByKid = new Map<string, string>();
      for (const jwk of body.keys ?? []) {
        if (!jwk.kid) continue;
        const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({
          type: 'spki',
          format: 'pem',
        });
        pemByKid.set(jwk.kid, pem.toString());
      }

      const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
      const lifetime = maxAge ? Number(maxAge) * 1000 : DEFAULT_KEY_LIFETIME_MS;
      return { pemByKid, expiresAt: Date.now() + lifetime };
    } catch (error) {
      this.logger.warn(`Could not fetch Google's signing keys: ${(error as Error).message}`);
      return null;
    }
  }

  /** The key ID from the token's header, read without trusting anything else in it. */
  private static keyId(token: string): string | null {
    try {
      const header = JSON.parse(
        Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'),
      ) as { kid?: unknown };
      return typeof header.kid === 'string' ? header.kid : null;
    } catch {
      return null;
    }
  }
}
