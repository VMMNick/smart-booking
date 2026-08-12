import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY', 'sk_test_placeholder'), {
      apiVersion: '2024-06-20',
    });
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
  }

  async createCheckoutSession(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) throw new ForbiddenException('Not your booking');
    if (booking.status !== BookingStatus.pending) {
      throw new BadRequestException('Only pending bookings can be paid for');
    }

    const amountInCents = Math.round(Number(booking.finalPrice) * 100);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'uah',
            unit_amount: amountInCents,
            product_data: {
              name: `Бронювання: ${booking.room.name}`,
              description: `${booking.startTime.toISOString()} — ${booking.endTime.toISOString()}`,
            },
          },
          quantity: 1,
        },
      ],
      // bookingId in metadata is how the webhook maps the Stripe event back
      // to our booking row without trusting anything else from the client.
      metadata: { bookingId: booking.id },
      success_url: `${this.frontendUrl}/?payment=success`,
      cancel_url: `${this.frontendUrl}/?payment=cancelled`,
    });

    return { url: session.url };
  }

  /**
   * Verifies the Stripe signature against the raw request body (see main.ts,
   * which mounts express.raw() only for this route) before trusting the
   * event at all — this is what stops someone from POSTing a fake
   * "payment succeeded" event straight to the endpoint.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.markConfirmed(session.metadata?.bookingId, session.payment_intent as string);
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.markCancelled(session.metadata?.bookingId);
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async markConfirmed(bookingId: string | undefined, paymentIntentId: string | undefined) {
    if (!bookingId) return;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: true, user: true },
    });
    if (!booking || booking.status === BookingStatus.confirmed) return;

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.confirmed, stripePaymentId: paymentIntentId ?? null },
    });

    await this.emailService.sendBookingConfirmation({
      to: booking.user.email,
      userName: booking.user.name,
      roomName: booking.room.name,
      startTime: booking.startTime,
      endTime: booking.endTime,
      finalPrice: Number(booking.finalPrice),
    });
  }

  private async markCancelled(bookingId: string | undefined) {
    if (!bookingId) return;
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status !== BookingStatus.pending) return;
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.cancelled },
    });
  }
}
