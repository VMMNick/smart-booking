import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingStatus } from '@prisma/client';

describe('BookingsService', () => {
  function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'room-1' }]),
      booking: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'booking-1', ...(data as object) })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'booking-1', ...(data as object) })),
      },
    };
    return {
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)),
      booking: tx.booking,
      _tx: tx,
      ...overrides,
    } as never;
  }

  function makePricingMock(price = 100) {
    return { calculatePrice: jest.fn().mockResolvedValue(price) };
  }

  const dto = {
    roomId: 'room-1',
    startTime: '2030-01-01T10:00:00.000Z',
    endTime: '2030-01-01T11:00:00.000Z',
  };

  it('rejects a booking where endTime is not after startTime', async () => {
    const prisma = makePrismaMock();
    const pricing = makePricingMock();
    const service = new BookingsService(prisma, pricing as never);

    await expect(
      service.create('user-1', {
        roomId: 'room-1',
        startTime: '2030-01-01T11:00:00.000Z',
        endTime: '2030-01-01T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a booking with the price computed by PricingService while holding the lock', async () => {
    const prisma = makePrismaMock();
    const pricing = makePricingMock(150);
    const service = new BookingsService(prisma, pricing as never);

    const booking = await service.create('user-1', dto);

    expect(pricing.calculatePrice).toHaveBeenCalledWith(
      'room-1',
      new Date(dto.startTime),
      new Date(dto.endTime),
    );
    expect(booking).toMatchObject({
      roomId: 'room-1',
      userId: 'user-1',
      finalPrice: 150,
      status: BookingStatus.pending,
    });
  });

  it('throws NotFoundException when the room row cannot be locked (does not exist)', async () => {
    const prisma = makePrismaMock();
    (prisma as { _tx: { $queryRaw: jest.Mock } })._tx.$queryRaw.mockResolvedValue([]);
    const pricing = makePricingMock();
    const service = new BookingsService(prisma, pricing as never);

    await expect(service.create('user-1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when an overlapping active booking already exists', async () => {
    const prisma = makePrismaMock();
    (prisma as { _tx: { booking: { findFirst: jest.Mock } } })._tx.booking.findFirst.mockResolvedValue({
      id: 'existing',
    });
    const pricing = makePricingMock();
    const service = new BookingsService(prisma, pricing as never);

    await expect(service.create('user-1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('translates a Postgres exclusion-constraint violation into a ConflictException', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('overlapping_bookings constraint violated (23P01)')),
    } as never;
    const pricing = makePricingMock();
    const service = new BookingsService(prisma, pricing as never);

    await expect(service.create('user-1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows unrelated errors from the transaction unchanged', async () => {
    const boom = new Error('totally unrelated failure');
    const prisma = { $transaction: jest.fn().mockRejectedValue(boom) } as never;
    const pricing = makePricingMock();
    const service = new BookingsService(prisma, pricing as never);

    await expect(service.create('user-1', dto)).rejects.toBe(boom);
  });

  describe('findOne', () => {
    it('throws NotFoundException when the booking does not exist', async () => {
      const prisma = makePrismaMock();
      const pricing = makePricingMock();
      const service = new BookingsService(prisma, pricing as never);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the booking with its room when found', async () => {
      const found = { id: 'booking-1', userId: 'user-1', room: { id: 'room-1' } };
      const prisma = makePrismaMock({
        booking: { findUnique: jest.fn().mockResolvedValue(found) },
      });
      const pricing = makePricingMock();
      const service = new BookingsService(prisma, pricing as never);

      await expect(service.findOne('booking-1')).resolves.toBe(found);
    });
  });

  describe('cancel', () => {
    it('refuses to cancel a booking belonging to another user', async () => {
      const prisma = makePrismaMock({
        booking: { findUnique: jest.fn().mockResolvedValue({ id: 'booking-1', userId: 'someone-else' }) },
      });
      const pricing = makePricingMock();
      const service = new BookingsService(prisma, pricing as never);

      await expect(service.cancel('booking-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancels a booking owned by the requesting user', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'booking-1', status: BookingStatus.cancelled });
      const prisma = makePrismaMock({
        booking: {
          findUnique: jest.fn().mockResolvedValue({ id: 'booking-1', userId: 'user-1' }),
          update,
        },
      });
      const pricing = makePricingMock();
      const service = new BookingsService(prisma, pricing as never);

      const result = await service.cancel('booking-1', 'user-1');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: { status: BookingStatus.cancelled },
      });
      expect(result.status).toBe(BookingStatus.cancelled);
    });
  });

  describe('occupancyByDay', () => {
    it('returns one entry per day with occupancy clamped to [0, 1]', async () => {
      const prisma = makePrismaMock({
        booking: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const pricing = makePricingMock();
      const service = new BookingsService(prisma, pricing as never);

      const result = await service.occupancyByDay('room-1', 3);

      expect(result).toHaveLength(3);
      for (const entry of result) {
        expect(entry.occupancy).toBeGreaterThanOrEqual(0);
        expect(entry.occupancy).toBeLessThanOrEqual(1);
      }
    });

    it('computes non-zero occupancy for a day with a booking inside the operating window', async () => {
      const today = new Date();
      today.setUTCHours(10, 0, 0, 0);
      const inTwoHours = new Date(today.getTime() + 2 * 60 * 60 * 1000);
      const prisma = makePrismaMock({
        booking: {
          findMany: jest.fn().mockResolvedValue([{ startTime: today, endTime: inTwoHours }]),
        },
      });
      const pricing = makePricingMock();
      const service = new BookingsService(prisma, pricing as never);

      const result = await service.occupancyByDay('room-1', 1);

      expect(result[0].occupancy).toBeGreaterThan(0);
    });
  });
});
