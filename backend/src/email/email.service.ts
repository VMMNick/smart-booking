import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface BookingConfirmationPayload {
  to: string;
  userName: string;
  roomName: string;
  startTime: Date;
  endTime: Date;
  finalPrice: number;
}

/**
 * Week 7: booking confirmation email via Resend. Falls back to logging
 * instead of throwing if RESEND_API_KEY isn't configured, so local dev /
 * this sandbox doesn't need real credentials to exercise the booking flow.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.get<string>('EMAIL_FROM', 'Booking <no-reply@example.com>');
  }

  async sendBookingConfirmation(payload: BookingConfirmationPayload) {
    const subject = `Бронювання підтверджено: ${payload.roomName}`;
    const html = `
      <p>Привіт, ${payload.userName}!</p>
      <p>Ваше бронювання підтверджено:</p>
      <ul>
        <li>Кімната: ${payload.roomName}</li>
        <li>З: ${payload.startTime.toLocaleString('uk-UA')}</li>
        <li>До: ${payload.endTime.toLocaleString('uk-UA')}</li>
        <li>Сума: ${payload.finalPrice} грн</li>
      </ul>
    `;

    if (!this.resend) {
      this.logger.log(`[email disabled, no RESEND_API_KEY] Would send to ${payload.to}: ${subject}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.from,
        to: payload.to,
        subject,
        html,
      });
    } catch (err) {
      // Email failures must never roll back a confirmed booking/payment.
      this.logger.error(`Failed to send confirmation email to ${payload.to}`, err as Error);
    }
  }
}
