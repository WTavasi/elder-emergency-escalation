import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** One person's place: the chain entry and the rank they are asked at. */
export class ChainPlaceDto {
  @IsUUID('4', { message: 'Each place needs the id of an entry in the circle.' })
  id: string;

  @IsInt({ message: 'Each place needs a rank.' })
  @Min(1)
  @Max(10)
  tier: number;
}

/** The whole order at once, so it is never half changed. */
export class ReorderChainDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Send everybody in the circle.' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChainPlaceDto)
  entries: ChainPlaceDto[];
}
