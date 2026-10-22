import type { ConfigService } from '@nestjs/config';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../../../shared/config/policy';
import type { DashboardService } from '../services/dashboard.service';
import { LegalController } from './legal.controller';

const retention = { enabled: true, closedEmergencyDays: 365, auditLogDays: 365 };
const dashboard = { policy: () => ({ retention }) } as unknown as DashboardService;
const configWith = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('LegalController', () => {
  it('gives the versions, the retention windows and the contact', () => {
    const facts = new LegalController(
      dashboard,
      configWith({
        DATA_CONTACT_NAME: 'MzaziCare data contact',
        DATA_CONTACT_EMAIL: 'data@example.org',
      }),
    ).facts();

    expect(facts).toEqual({
      privacyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
      retention,
      contact: { name: 'MzaziCare data contact', email: 'data@example.org', address: null },
    });
  });

  it('gives no contact rather than a made-up one when none is set', () => {
    expect(new LegalController(dashboard, configWith({})).facts().contact).toBeNull();
  });
});
