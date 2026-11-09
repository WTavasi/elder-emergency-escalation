import { DispatchMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/** How long a tier may wait at least and at most, in seconds. */
export const TIMEOUT_LIMITS = { min: 15, max: 3600 } as const;

/** What a severity weight may be. */
export const WEIGHT_LIMITS = { min: 0, max: 100 } as const;

/** What a band threshold may be. */
export const THRESHOLD_LIMITS = { min: 1, max: 100 } as const;

/** A change to one tier of one severity's escalation rules. Every part is optional. */
export class UpdateEscalationRuleDto {
  /** Seconds before the next tier is asked. Null only on the last tier, which has no next. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: 'The time limit must be a whole number of seconds.' })
  @Min(TIMEOUT_LIMITS.min, {
    message: `The time limit must be at least ${TIMEOUT_LIMITS.min} seconds.`,
  })
  @Max(TIMEOUT_LIMITS.max, {
    message: `The time limit must be at most ${TIMEOUT_LIMITS.max} seconds (an hour).`,
  })
  timeoutSeconds?: number | null;

  @IsOptional()
  @IsEnum(DispatchMode, { message: 'dispatchMode must be SEQUENTIAL or PARALLEL.' })
  dispatchMode?: DispatchMode;

  @IsOptional()
  @IsBoolean({ message: 'smsFallbackImmediate must be true or false.' })
  smsFallbackImmediate?: boolean;
}

/** A change to one severity factor. */
export class UpdateSeverityFactorDto {
  @IsOptional()
  @IsInt({ message: 'The weight must be a whole number.' })
  @Min(WEIGHT_LIMITS.min, { message: `The weight must be at least ${WEIGHT_LIMITS.min}.` })
  @Max(WEIGHT_LIMITS.max, { message: `The weight must be at most ${WEIGHT_LIMITS.max}.` })
  weight?: number;

  @IsOptional()
  @IsBoolean({ message: 'enabled must be true or false.' })
  enabled?: boolean;
}

/** The scores at which ELEVATED and CRITICAL start. */
export class UpdateBandsDto {
  @IsInt({ message: 'High must start at a whole number.' })
  @Min(THRESHOLD_LIMITS.min, {
    message: `High must start at ${THRESHOLD_LIMITS.min} or more.`,
  })
  @Max(THRESHOLD_LIMITS.max, {
    message: `High must start at ${THRESHOLD_LIMITS.max} or less.`,
  })
  elevatedFrom: number;

  @IsInt({ message: 'Critical must start at a whole number.' })
  @Min(THRESHOLD_LIMITS.min, {
    message: `Critical must start at ${THRESHOLD_LIMITS.min} or more.`,
  })
  @Max(THRESHOLD_LIMITS.max, {
    message: `Critical must start at ${THRESHOLD_LIMITS.max} or less.`,
  })
  criticalFrom: number;
}
