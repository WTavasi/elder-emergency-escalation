import { Type } from 'class-transformer';
import { EmergencyType } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RAISED_FROM, type RaisedFrom } from '../services/escalation.service';

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

  /**
   * What is happening, when it was said in the same breath as asking: "Hey Siri,
   * MzaziCare help fire". Reported straight after the alert is raised, exactly as if the
   * elder had tapped it, so the service follows after the usual short wait.
   */
  @IsOptional()
  @IsEnum(EmergencyType)
  type?: EmergencyType;

  /** Raised from Siri, the Assistant, the widget or the quick-settings tile. */
  @IsOptional()
  @IsIn(RAISED_FROM)
  from?: RaisedFrom;
}
