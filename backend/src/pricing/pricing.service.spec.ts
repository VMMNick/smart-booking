import { PricingService } from './pricing.service';
import { ConditionType } from '@prisma/client';

describe('PricingService', () => {
  function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      room: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'room-1', basePrice: 100 }),
      },
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    } as never;
  }

  it('returns base price when there are no pricing rules', async () => {
    const prisma = makePrismaMock();
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T12:00:00.000Z'),
      new Date('2030-01-01T13:00:00.000Z'),
    );
    expect(price).toBe(100);
  });

  it('applies a time_of_day multiplier when the slot falls inside the window', async () => {
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            conditionType: ConditionType.time_of_day,
            condition: { from: '18:00', to: '22:00' },
            multiplier: 1.5,
          },
        ]),
      },
    });
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T19:00:00.000Z'),
      new Date('2030-01-01T20:00:00.000Z'),
    );
    expect(price).toBe(150);
  });

  it('does not apply a time_of_day multiplier outside the window', async () => {
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            conditionType: ConditionType.time_of_day,
            condition: { from: '18:00', to: '22:00' },
            multiplier: 1.5,
          },
        ]),
      },
    });
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T09:00:00.000Z'),
      new Date('2030-01-01T10:00:00.000Z'),
    );
    expect(price).toBe(100);
  });

  it('scales the demand multiplier linearly with occupancy', async () => {
    const dayStart = new Date('2030-01-01T00:00:00.000Z');
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          { conditionType: ConditionType.demand, condition: null, multiplier: 2 },
        ]),
      },
      booking: {
        // 12 of 24 hours booked -> 50% occupancy -> multiplier halfway to 2x -> 1.5x
        findMany: jest.fn().mockResolvedValue([
          {
            startTime: dayStart,
            endTime: new Date(dayStart.getTime() + 12 * 60 * 60 * 1000),
          },
        ]),
      },
    });
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T15:00:00.000Z'),
      new Date('2030-01-01T16:00:00.000Z'),
    );
    expect(price).toBe(150);
  });

  it('applies a day_of_week multiplier when the slot falls on a matching day', async () => {
    // 2030-01-01 is a Tuesday (UTC)
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            conditionType: ConditionType.day_of_week,
            condition: { days: ['tuesday', 'wednesday'] },
            multiplier: 1.2,
          },
        ]),
      },
    });
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T12:00:00.000Z'),
      new Date('2030-01-01T13:00:00.000Z'),
    );
    expect(price).toBe(120);
  });

  it('does not apply a day_of_week multiplier on a non-matching day', async () => {
    // 2030-01-01 is a Tuesday (UTC)
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            conditionType: ConditionType.day_of_week,
            condition: { days: ['friday'] },
            multiplier: 1.2,
          },
        ]),
      },
    });
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T12:00:00.000Z'),
      new Date('2030-01-01T13:00:00.000Z'),
    );
    expect(price).toBe(100);
  });

  it('compounds time_of_day, day_of_week and demand multipliers together', async () => {
    const dayStart = new Date('2030-01-01T00:00:00.000Z'); // Tuesday
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            conditionType: ConditionType.time_of_day,
            condition: { from: '18:00', to: '22:00' },
            multiplier: 1.5,
          },
          {
            conditionType: ConditionType.day_of_week,
            condition: { days: ['tuesday'] },
            multiplier: 1.2,
          },
          { conditionType: ConditionType.demand, condition: null, multiplier: 2 },
        ]),
      },
      booking: {
        // full-day occupancy -> demand multiplier at its ceiling (2x)
        findMany: jest.fn().mockResolvedValue([{ startTime: dayStart, endTime: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) }]),
      },
    });
    const service = new PricingService(prisma);
    const price = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T19:00:00.000Z'),
      new Date('2030-01-01T20:00:00.000Z'),
    );
    // 100 * 1.5 * 1.2 * 2 = 360
    expect(price).toBe(360);
  });

  it('handles a time_of_day window that wraps past midnight', async () => {
    const prisma = makePrismaMock({
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            conditionType: ConditionType.time_of_day,
            condition: { from: '22:00', to: '02:00' },
            multiplier: 1.3,
          },
        ]),
      },
    });
    const service = new PricingService(prisma);

    const insideWrap = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T23:30:00.000Z'),
      new Date('2030-01-02T00:30:00.000Z'),
    );
    expect(insideWrap).toBe(130);

    const outsideWrap = await service.calculatePrice(
      'room-1',
      new Date('2030-01-01T12:00:00.000Z'),
      new Date('2030-01-01T13:00:00.000Z'),
    );
    expect(outsideWrap).toBe(100);
  });
});
