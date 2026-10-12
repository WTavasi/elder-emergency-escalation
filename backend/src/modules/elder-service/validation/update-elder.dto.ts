import { Type } from 'class-transformer';
import { IsEnum, IsOptional, ValidateIf, ValidateNested } from 'class-validator';
import { CareLevel } from '@prisma/client';
import { HomeDto } from './create-elder.dto';

/** What a caregiver may change about an elder after registering them. */
export class UpdateElderDto {
  /** A level to set, or null for "not sure", which is scored as assisted. */
  @IsOptional()
  @ValidateIf((dto: UpdateElderDto) => dto.careLevel !== null)
  @IsEnum(CareLevel)
  careLevel?: CareLevel | null;

  /** The registered home, as chosen from an address search. */
  @IsOptional()
  @ValidateNested()
  @Type(() => HomeDto)
  home?: HomeDto;
}
