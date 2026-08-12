import { IsEnum, IsNumber, IsObject, IsUUID, Min } from 'class-validator';
import { ConditionType } from '@prisma/client';

export class CreatePricingRuleDto {
  @IsUUID()
  roomId: string;

  @IsEnum(ConditionType)
  conditionType: ConditionType;

  @IsObject()
  condition: Record<string, unknown>;

  @IsNumber()
  @Min(0)
  multiplier: number;
}
