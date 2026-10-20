import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Where the person on their way is, as the phone reports it. Rounded to six decimal
 * places on arrival (about ten centimetres), which is all the database ever keeps
 * anywhere, rather than refusing the many decimals a phone produces.
 */
export class PositionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  /** The phone's own estimate of its error, in metres. A loose fix never counts as arrival. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  accuracyMetres?: number;
}
