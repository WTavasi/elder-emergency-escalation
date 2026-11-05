import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  BLOOD_TYPES,
  MEDICAL_FLAGS,
  type BloodType,
  type MedicalFlag,
} from '../services/medical-details';

/** Trimmed, and an empty answer stored as no answer. */
const blankToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * The whole set of medical details, replacing what was there. Every part may be left
 * empty: a blood type alone is worth having. The lengths are the room a responder
 * reads in a glance, not a medical record.
 */
export class MedicalProfileDto {
  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.dateOfBirth !== null)
  @Matches(/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'Date of birth must look like 1948-03-15',
  })
  dateOfBirth?: string | null;

  @IsOptional()
  @ValidateIf((dto: MedicalProfileDto) => dto.bloodType !== null)
  @IsIn(BLOOD_TYPES)
  bloodType?: BloodType | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MEDICAL_FLAGS.length)
  @IsIn(MEDICAL_FLAGS, { each: true })
  flags?: MedicalFlag[];

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.conditions !== null)
  @IsString()
  @MaxLength(500)
  conditions?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.medications !== null)
  @IsString()
  @MaxLength(500)
  medications?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.allergies !== null)
  @IsString()
  @MaxLength(300)
  allergies?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.languages !== null)
  @IsString()
  @MaxLength(80)
  languages?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.doctorName !== null)
  @IsString()
  @MaxLength(120)
  doctorName?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.doctorPhone !== null)
  @Matches(/^\+?[\d\s-]{6,20}$/, { message: "The doctor's number can have digits, spaces and a +" })
  doctorPhone?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.hospital !== null)
  @IsString()
  @MaxLength(120)
  hospital?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((dto: MedicalProfileDto) => dto.notes !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
