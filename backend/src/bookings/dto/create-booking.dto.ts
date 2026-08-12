import { IsDateString, IsUUID } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  roomId: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;
}
