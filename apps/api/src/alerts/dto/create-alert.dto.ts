import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateAlertDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'latitude must be a number' })
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'longitude must be a number' })
  @Min(-180)
  @Max(180)
  longitude: number;

  /** Human-readable place, shown to responders so they are not reading coordinates. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLabel?: string;
}
