import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../shared/decorators/public.decorator';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../../../shared/config/policy';
import { DashboardService } from '../services/dashboard.service';
import type { LegalFacts } from '../views/dashboard.types';

/**
 * The parts of the privacy notice and the terms that depend on how this server is set
 * up, for the app's legal screens and the console's privacy panel.
 *
 * Public, because the notice has to be readable before anybody signs up. Nothing here
 * is about a person: the versions, the retention windows and who to ask.
 */
@Controller('legal')
export class LegalController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  facts(): LegalFacts {
    const name = this.config.get<string>('DATA_CONTACT_NAME');
    const email = this.config.get<string>('DATA_CONTACT_EMAIL');
    const address = this.config.get<string>('DATA_CONTACT_ADDRESS');
    return {
      privacyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
      retention: this.dashboard.policy().retention,
      contact:
        name || email || address
          ? { name: name ?? null, email: email ?? null, address: address ?? null }
          : null,
    };
  }
}
