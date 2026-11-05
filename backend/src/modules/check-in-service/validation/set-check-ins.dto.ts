import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDivisibleBy,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Setting up, changing or turning off an elder's daily check-in. */
export class SetCheckInsDto {
  @IsBoolean()
  enabled: boolean;

  /**
   * Times of day in the elder's own time zone, "09:00". Up to three a day chosen one by
   * one. Ignored when [every] is given, which works the times out instead.
   */
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { each: true, message: 'Enter times like 09:00.' })
  times: string[];

  /**
   * Every this many minutes from [from] to [until] instead: "every hour from 08:00 to
   * 20:00", for somebody who should be heard from through the day. Half an hour to six
   * hours, in half hours.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(360)
  @IsDivisibleBy(30, { message: 'Choose a time in half hours.' })
  every?: number;

  @ValidateIf((dto: SetCheckInsDto) => dto.every !== undefined)
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { message: 'Enter a time like 08:00.' })
  from?: string;

  @ValidateIf((dto: SetCheckInsDto) => dto.every !== undefined)
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { message: 'Enter a time like 20:00.' })
  until?: string;

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
