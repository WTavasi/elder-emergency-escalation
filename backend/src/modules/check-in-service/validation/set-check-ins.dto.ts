import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Setting up, changing or turning off an elder's daily check-in. */
export class SetCheckInsDto {
  @IsBoolean()
  enabled: boolean;

  /**
   * Times of day in the elder's own time zone, "09:00". Up to three a day: more than that
   * stops being a check-in and starts being supervision.
   */
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { each: true, message: 'each time must look like 09:00' })
  times: string[];

  /** How long the elder has to answer before their circle is told. Ten minutes to two hours. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(120)
  graceMinutes?: number;
}

/** The elder's answer to a check-in somebody else set up for them. */
export class ConfirmCheckInsDto {
  @IsBoolean()
  agree: boolean;
}
