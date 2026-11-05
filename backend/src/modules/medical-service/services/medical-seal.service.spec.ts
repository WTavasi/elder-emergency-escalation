import type { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { MedicalSealService } from './medical-seal.service';

const KEY = Buffer.alloc(32, 7).toString('base64');
const config = (key?: string) => ({ get: () => key }) as unknown as ConfigService;

describe('MedicalSealService', () => {
  it('opens what it sealed, and the sealed value reads as nothing', () => {
    const seal = new MedicalSealService(config(KEY));
    const sealed = seal.seal({ allergies: 'Penicillin' });

    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed).not.toContain('Penicillin');
    expect(seal.open(sealed)).toEqual({ allergies: 'Penicillin' });
  });

  it('seals the same details differently each time', () => {
    const seal = new MedicalSealService(config(KEY));
    expect(seal.seal({ a: 1 })).not.toBe(seal.seal({ a: 1 }));
  });

  it('refuses a value that was changed', () => {
    const seal = new MedicalSealService(config(KEY));
    const sealed = seal.seal({ bloodType: 'O+' });
    const raw = Buffer.from(sealed.slice(3), 'base64');
    raw[raw.length - 1] ^= 1;

    expect(() => seal.open(`v1:${raw.toString('base64')}`)).toThrow();
  });

  it('refuses a value sealed with another key', () => {
    const sealed = new MedicalSealService(config(KEY)).seal({ a: 1 });
    const other = new MedicalSealService(config(Buffer.alloc(32, 9).toString('base64')));

    expect(() => other.open(sealed)).toThrow();
  });

  it('is off without a key, and says so', () => {
    const seal = new MedicalSealService(config(undefined));

    expect(seal.enabled).toBe(false);
    expect(() => seal.seal({})).toThrow(ServiceUnavailableException);
  });
});
