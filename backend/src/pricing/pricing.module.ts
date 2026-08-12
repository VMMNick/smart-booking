import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingRulesService } from './pricing-rules.service';
import { PricingRulesController } from './pricing-rules.controller';

@Module({
  providers: [PricingService, PricingRulesService],
  controllers: [PricingRulesController],
  exports: [PricingService],
})
export class PricingModule {}
