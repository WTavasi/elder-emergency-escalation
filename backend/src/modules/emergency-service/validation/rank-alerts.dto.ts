import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/**
 * Where this phone is, if the person chose to say, so times to each emergency can be
 * measured from here. Both or neither. Used for one answer and never kept.
 */
export class RankAlertsDto {
  @ValidateIf((dto: RankAlertsDto) => dto.longitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((dto: RankAlertsDto) => dto.latitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  /** Not read; accepted so a phone can send what it has without trimming it. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracyMetres?: number;
}
