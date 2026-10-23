import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VolunteerStatus, VolunteerTraining } from '@prisma/client';

/** Where a volunteer can help from: a place found by address search. */
export class VolunteerAreaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;
}

/** Applying, or changing an application. */
export class ApplyDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'say what you can do: at least one kind of training' })
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(VolunteerTraining, { each: true })
  training: VolunteerTraining[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsDefined({ message: 'choose the area you can help in' })
  @ValidateNested()
  @Type(() => VolunteerAreaDto)
  area: VolunteerAreaDto;

  /**
   * How far from the centre of the area they will go. Half a kilometre to five: a
   * volunteer is useful because they are close, and a few minutes on foot is the point.
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(5)
  radiusKm: number;
}

export class AvailabilityDto {
  @IsBoolean()
  available: boolean;
}

/** An administrator's decision on an application. */
export class ReviewDto {
  @IsIn(['approve', 'reject', 'suspend'])
  decision: 'approve' | 'reject' | 'suspend';

  /** Shown to the volunteer. Needed to reject or suspend, so they know why. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListVolunteersDto {
  @IsOptional()
  @IsEnum(VolunteerStatus)
  status?: VolunteerStatus;
}
