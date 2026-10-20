import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The device token Firebase Cloud Messaging gave this phone. Opaque to the server,
 * around 160 characters today; capped at the column's 255.
 */
export class PushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(255)
  token: string;
}
