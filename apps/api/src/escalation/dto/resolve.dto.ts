import { EventOutcome } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ResolveDto {
  @IsEnum(EventOutcome, {
    message: `outcome must be one of: ${Object.values(EventOutcome).join(', ')}`,
  })
  outcome: EventOutcome;

  /**
   * What happened, in the closer's own words.
   *
   * Required when the outcome is OTHER and optional otherwise. Choosing OTHER and saying
   * nothing would be worse than choosing the nearest wrong option, because at least a
   * wrong option is countable; an empty OTHER is a closed emergency nobody can account
   * for afterwards, which is the one thing the audit trail exists to prevent.
   */
  @ValidateIf((dto: ResolveDto) => dto.outcome === EventOutcome.OTHER)
  @IsString()
  @IsNotEmpty({ message: 'Say briefly what happened when the outcome is OTHER' })
  @ValidateIf((dto: ResolveDto) => dto.note !== undefined)
  @MaxLength(300)
  note?: string;
}
