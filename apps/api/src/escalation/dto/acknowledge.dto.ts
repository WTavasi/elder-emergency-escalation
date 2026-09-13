import { Type } from 'class-transformer';
import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

/**
 * A single location capture at the moment of acknowledgement. Optional, because a
 * responder may have location services off, and refusing an acknowledgement over a
 * missing coordinate would be the wrong trade in an emergency.
 *
 * The paired ValidateIf rules mean either both coordinates arrive or neither does:
 * half a location is worse than none, because it looks like data.
 */
export class AcknowledgeDto {
  @ValidateIf((dto: AcknowledgeDto) => dto.longitude !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((dto: AcknowledgeDto) => dto.latitude !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;
}
