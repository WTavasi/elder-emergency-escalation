import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Where an elder is staying, when it is not home.
 *
 * The label is optional but strongly wanted: a responder reading "Staying with her
 * daughter, South B" acts faster than one reading a pair of decimals, and the whole
 * reason this is a human record rather than a device reading is that a human can say
 * something useful about the place.
 */
export class SetPlaceDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
