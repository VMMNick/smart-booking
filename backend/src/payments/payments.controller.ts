import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout-session')
  @UseGuards(JwtAuthGuard)
  createCheckoutSession(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.paymentsService.createCheckoutSession(user.userId, dto.bookingId);
  }

  // No JwtAuthGuard here — Stripe calls this directly, not an authenticated
  // user. Trust is established solely via the signature check below, using
  // the raw body express.raw() attaches for this exact path (see main.ts).
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    const event = this.paymentsService.constructEvent(req.body as Buffer, signature);
    await this.paymentsService.handleEvent(event);
    return { received: true };
  }
}
