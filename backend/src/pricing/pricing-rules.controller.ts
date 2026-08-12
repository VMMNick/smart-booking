import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PricingRulesService } from './pricing-rules.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('pricing-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PricingRulesController {
  constructor(private readonly pricingRulesService: PricingRulesService) {}

  @Post()
  create(@Body() dto: CreatePricingRuleDto) {
    return this.pricingRulesService.create(dto);
  }

  @Get()
  findAll(@Query('roomId') roomId?: string) {
    return this.pricingRulesService.findAll(roomId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto) {
    return this.pricingRulesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pricingRulesService.remove(id);
  }
}
