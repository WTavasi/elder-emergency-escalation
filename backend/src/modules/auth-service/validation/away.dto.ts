import { IsISO8601, IsOptional, ValidateIf } from 'class-validator';

/** Going away. No `until`, or null, means until the person turns it off. */
export class SetAwayDto {
  @IsOptional()
  @ValidateIf((_dto: SetAwayDto, value: unknown) => value !== null)
  @IsISO8601(
    { strict: true },
    { message: 'until must be a date and time, such as 2026-11-25T18:00:00Z' },
  )
  until?: string | null;
}
