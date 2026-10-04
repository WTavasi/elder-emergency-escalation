import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Declining is allowed to be wordless.
 *
 * Somebody saying they cannot come is doing the system a favour by saying so quickly,
 * and requiring an explanation first would slow down the one action whose whole point
 * is speed. The reason is recorded when given, because "I am three hours away" is
 * worth knowing afterwards, and omitted without complaint when it is not.
 */
export class DeclineDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
