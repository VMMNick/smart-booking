import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.pending, BookingStatus.confirmed];

/**
 * Week 4: the hard part — preventing double-booking of the same room/time slot
 * under concurrent requests.
 *
 * Strategy (defense in depth, two layers):
 *
 * 1. Application-level pessimistic lock inside a DB transaction:
 *    `SELECT ... FOR UPDATE` on the target room row serializes concurrent
 *    booking attempts for that room — the second transaction blocks until the
 *    first commits or rolls back, then re-checks for overlaps with fresh data.
 *    This is what actually prevents the race in the common case.
 *
 * 2. DB-level exclusion constraint (see prisma/migrations/.../fix_overlap.sql)
 *    using btree_gist as a last-resort guarantee even if the app-level lock is
 *    ever bypassed (e.g. a second app instance forgets to lock, or a manual
 *    SQL update). If both bookings somehow reach INSERT, Postgres itself
 *    rejects the overlapping row with a constraint violation, which we
 *    translate into a 409 below.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  async create(userId: string, dto: CreateBookingDto) {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // 1. Lock the room row so concurrent requests for the same room
          //    serialize here instead of racing past the overlap check.
          const lockedRooms = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM rooms WHERE id = ${dto.roomId}::uuid FOR UPDATE
          `;
          if (lockedRooms.length === 0) {
            throw new NotFoundException('Room not found');
          }

          // 2. Now that we hold the lock, re-check for overlapping active
          //    bookings with fully fresh data — no other transaction can
          //    insert/modify a booking for this room until we commit.
          const overlapping = await tx.booking.findFirst({
            where: {
              roomId: dto.roomId,
              status: { in: ACTIVE_STATUSES },
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          });
          if (overlapping) {
            throw new ConflictException('This room is already booked for the requested time range');
          }

          // 3. Compute price while still holding the lock, so pricing reflects
          //    the occupancy state at the moment of booking, not a stale read.
          const finalPrice = await this.pricingService.calculatePrice(
            dto.roomId,
            startTime,
            endTime,
          );

          return tx.booking.create({
            data: {
              roomId: dto.roomId,
              userId,
              startTime,
              endTime,
              finalPrice,
              status: BookingStatus.pending,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (err) {
      if (err instanceof ConflictException || err instanceof NotFoundException) {
        throw err;
      }
      // Fallback safety net: Postgres exclusion constraint violation (SQLSTATE
      // 23P01, see prisma/migrations/.../fix_overlap.sql) surfaces as an
      // unrecognized-by-Prisma DB error. If our app-level lock is ever bypassed,
      // this still turns the race into a clean 409 instead of a 500.
      const message = err instanceof Error ? err.message : '';
      if (message.includes('23P01') || message.includes('overlapping_bookings')) {
        throw new ConflictException('This room is already booked for the requested time range');
      }
      throw err;
    }
  }

  findAllForUser(userId: string) {
    return this.prisma.booking.findMany({ where: { userId }, include: { room: true } });
  }

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { room: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * Week 6 admin chart: booked minutes per day (last `days` days, including
   * today) for a room, expressed as a 0-1 occupancy ratio over a 06:00-23:00
   * operating window. Used to render a Chart.js bar/line chart.
   */
  async occupancyByDay(roomId: string, days = 14) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rangeStart = new Date(today);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (days - 1));
    const rangeEnd = new Date(today);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId,
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
    });

    const OPERATING_MINUTES = 17 * 60; // 06:00-23:00
    const result: { date: string; occupancy: number }[] = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(rangeStart);
      dayStart.setUTCDate(dayStart.getUTCDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const bookedMinutes = bookings.reduce((sum: number, b: { startTime: Date; endTime: Date }) => {
        const s = Math.max(b.startTime.getTime(), dayStart.getTime());
        const e = Math.min(b.endTime.getTime(), dayEnd.getTime());
        return sum + Math.max(0, e - s) / 60000;
      }, 0);

      result.push({
        date: dayStart.toISOString().slice(0, 10),
        occupancy: Math.min(1, bookedMinutes / OPERATING_MINUTES),
      });
    }

    return result;
  }

  async cancel(id: string, userId: string) {
    const booking = await this.findOne(id);
    if (booking.userId !== userId) {
      throw new BadRequestException('Cannot cancel a booking that is not yours');
    }
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.cancelled },
    });
  }
}
