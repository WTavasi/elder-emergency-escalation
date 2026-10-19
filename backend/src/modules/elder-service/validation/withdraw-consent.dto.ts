import { ConsentType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/**
 * Withdrawing one consent about an elder.
 *
 * `confirm` is required for DATA_PROCESSING, which ends the service for that elder. The
 * app asks the person first; the API asks again, so no client can end somebody's alerts
 * with a single mistaken request.
 */
export class WithdrawConsentDto {
  @IsEnum(ConsentType)
  type: ConsentType;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
