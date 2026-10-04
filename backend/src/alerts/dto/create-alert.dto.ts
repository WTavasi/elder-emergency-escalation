import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * The body of a panic request, and it is almost empty on purpose.
 *
 * Where an emergency is happening is resolved by the server from the elder's own
 * record, not taken from the caller. Two reasons. The app never reads the device's
 * location, so there is no location trail to protect or to explain to a participant;
 * and a client that could name its own coordinates could name coordinates that raise
 * its own severity score, which is an input to a safety decision and does not belong
 * in the caller's hands.
 *
 * The coordinates below therefore exist for one case only: an account whose home was
 * never recorded, which registration does not yet require. Once it does, these fields
 * come out.
 */
export class CreateAlertDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'latitude must be a number' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'longitude must be a number' })
  @Min(-180)
  @Max(180)
  longitude?: number;

  /** Human-readable place, shown to responders so they are not reading coordinates. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLabel?: string;
}
