import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePricingRuleDto) {
    return this.prisma.pricingRule.create({
      data: {
        roomId: dto.roomId,
        conditionType: dto.conditionType,
        condition: dto.condition,
        multiplier: dto.multiplier,
      },
    });
  }

  findAll(roomId?: string) {
    return this.prisma.pricingRule.findMany({ where: roomId ? { roomId } : undefined });
  }

  async findOne(id: string) {
    const rule = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    return rule;
  }

  async update(id: string, dto: UpdatePricingRuleDto) {
    await this.findOne(id);
    return this.prisma.pricingRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.pricingRule.delete({ where: { id } });
  }
}
