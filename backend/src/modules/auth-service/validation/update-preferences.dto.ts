import { IsBoolean, IsOptional } from 'class-validator';

/** Every field optional: a request changes only what it names. */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  shareWayThere?: boolean;
}
