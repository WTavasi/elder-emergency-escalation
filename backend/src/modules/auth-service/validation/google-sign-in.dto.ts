import { IsString, MaxLength, MinLength } from 'class-validator';

/** The ID token Google's sign-in button hands the console, passed on unchanged. */
export class GoogleSignInDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  idToken: string;
}
