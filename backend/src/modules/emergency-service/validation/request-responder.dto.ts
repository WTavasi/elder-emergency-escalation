import { ResponderService } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/** Which service to ask for. Left out, the one the emergency needs. */
export class RequestResponderDto {
  @IsOptional()
  @IsEnum(ResponderService, {
    message: 'Choose an ambulance, the police, the fire service or a responder.',
  })
  service?: ResponderService;
}
