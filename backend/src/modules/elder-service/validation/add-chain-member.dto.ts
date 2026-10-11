import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { E164, E164_MESSAGE } from '../../auth-service/validation/phone';

/** Somebody to add to an elder's chain, by the phone number they will sign in with. */
export class AddChainMemberDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  /** Shown in the chain until they sign up and their own name replaces it. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}
