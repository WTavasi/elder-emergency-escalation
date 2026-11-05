import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Seals medical details before they reach the database, and opens them after.
 *
 * AES-256-GCM with a key the database never holds, so a copy of the database, or a
 * backup of it, carries no readable health data. GCM also proves the value was not
 * changed: a tampered or truncated value fails to open rather than opening wrong.
 */
@Injectable()
export class MedicalSealService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('MEDICAL_DATA_KEY');
    this.key = raw ? Buffer.from(raw, 'base64') : null;
  }

  /** Whether medical details can be kept at all on this server. */
  get enabled(): boolean {
    return this.key !== null;
  }

  seal(value: unknown): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
  }

  open<T>(sealed: string): T {
    const key = this.requireKey();
    const [version, payload] = sealed.split(':', 2);
    if (version !== VERSION || !payload) throw new Error('Unknown medical seal version');

    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    return JSON.parse(text) as T;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException("Medical details aren't available yet.");
    }
    return this.key;
  }
}
