import { NotFoundException } from '@nestjs/common';
import { PricingRulesService } from './pricing-rules.service';
import { ConditionType } from '@prisma/client';

describe('PricingRulesService', () => {
  function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      pricingRule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
        ...((overrides.pricingRule as object) ?? {}),
      },
    } as never;
  }

  it('creates a pricing rule from the dto fields', () => {
    const create = jest.fn().mockResolvedValue({ id: 'rule-1' });
    const prisma = makePrismaMock({ pricingRule: { create } });
    const service = new PricingRulesService(prisma);
    const dto = {
      roomId: 'room-1',
      conditionType: ConditionType.time_of_day,
      condition: { from: '18:00', to: '22:00' },
      multiplier: 1.5,
    };

    service.create(dto);

    expect(create).toHaveBeenCalledWith({
      data: {
        roomId: 'room-1',
        conditionType: ConditionType.time_of_day,
        condition: { from: '18:00', to: '22:00' },
        multiplier: 1.5,
      },
    });
  });

  describe('findAll', () => {
    it('filters by roomId when provided', () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = makePrismaMock({ pricingRule: { findMany } });
      const service = new PricingRulesService(prisma);

      service.findAll('room-1');

      expect(findMany).toHaveBeenCalledWith({ where: { roomId: 'room-1' } });
    });

    it('returns all rules when no roomId is provided', () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = makePrismaMock({ pricingRule: { findMany } });
      const service = new PricingRulesService(prisma);

      service.findAll();

      expect(findMany).toHaveBeenCalledWith({ where: undefined });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown rule id', async () => {
      const prisma = makePrismaMock();
      const service = new PricingRulesService(prisma);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException instead of updating a non-existent rule', async () => {
      const update = jest.fn();
      const prisma = makePrismaMock({ pricingRule: { update } });
      const service = new PricingRulesService(prisma);

      await expect(service.update('missing', { multiplier: 2 })).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of deleting a non-existent rule', async () => {
      const del = jest.fn();
      const prisma = makePrismaMock({ pricingRule: { delete: del } });
      const service = new PricingRulesService(prisma);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(del).not.toHaveBeenCalled();
    });
  });
});
