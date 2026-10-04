import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenAlertDto {
  /**
   * Why the cancellation was not accepted, for example "called twice, no answer".
   * Stored in the audit log, which is what makes a reopened alert explainable later.
   */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}
