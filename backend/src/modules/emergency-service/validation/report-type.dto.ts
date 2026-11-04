import { EmergencyType } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** What is happening, as the elder or somebody helping says. */
export class ReportTypeDto {
  @IsEnum(EmergencyType, {
    message: `type must be one of: ${Object.values(EmergencyType).join(', ')}`,
  })
  type: EmergencyType;
}
