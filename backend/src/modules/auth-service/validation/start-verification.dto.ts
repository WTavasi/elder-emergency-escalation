import { Matches } from 'class-validator';
import { E164, E164_MESSAGE } from './phone';

export class StartVerificationDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;
}
