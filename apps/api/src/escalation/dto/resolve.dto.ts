import { EventOutcome } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ResolveDto {
  @IsEnum(EventOutcome, {
    message: `outcome must be one of: ${Object.values(EventOutcome).join(', ')}`,
  })
  outcome: EventOutcome;
}
