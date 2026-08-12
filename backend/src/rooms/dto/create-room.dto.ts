import { IsInt, IsNumber, IsPositive, IsString, Min } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsPositive()
  basePrice: number;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsString()
  location: string;
}
