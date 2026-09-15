import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { EventState, Severity } from '@prisma/client';

/** Splits `?state=NOTIFIED,ESCALATED` into an array, and tolerates a repeated key. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').filter(Boolean);
  return value;
};

/**
 * Query string for the history view.
 *
 * Validated rather than read straight off the request because these values reach a
 * database query. An unrecognised state is rejected here with a 400 that names the
 * field, instead of reaching Prisma and surfacing as a 500 that tells the caller
 * something about the schema.
 */
export class ListAlertsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  open?: boolean;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(EventState, { each: true })
  state?: EventState[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(Severity, { each: true })
  severity?: Severity[];

  @IsOptional()
  @IsUUID()
  elderId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Id of the last row of the previous page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
