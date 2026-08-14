import { NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      room: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
        ...((overrides.room as object) ?? {}),
      },
    } as never;
  }

  it('creates a room by passing the dto straight through', () => {
    const create = jest.fn().mockResolvedValue({ id: 'room-1' });
    const prisma = makePrismaMock({ room: { create } });
    const service = new RoomsService(prisma);
    const dto = { name: 'Suite 1', basePrice: 100, capacity: 4, location: 'Floor 2' };

    service.create(dto);

    expect(create).toHaveBeenCalledWith({ data: dto });
  });

  it('lists all rooms', async () => {
    const rooms = [{ id: 'room-1' }, { id: 'room-2' }];
    const prisma = makePrismaMock({ room: { findMany: jest.fn().mockResolvedValue(rooms) } });
    const service = new RoomsService(prisma);

    await expect(service.findAll()).resolves.toBe(rooms);
  });

  describe('findOne', () => {
    it('throws NotFoundException when the room does not exist', async () => {
      const prisma = makePrismaMock();
      const service = new RoomsService(prisma);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the room when found', async () => {
      const room = { id: 'room-1' };
      const prisma = makePrismaMock({ room: { findUnique: jest.fn().mockResolvedValue(room) } });
      const service = new RoomsService(prisma);

      await expect(service.findOne('room-1')).resolves.toBe(room);
    });
  });

  describe('update', () => {
    it('throws NotFoundException instead of updating a non-existent room', async () => {
      const update = jest.fn();
      const prisma = makePrismaMock({ room: { update } });
      const service = new RoomsService(prisma);

      await expect(service.update('missing', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it('updates an existing room', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'room-1', name: 'Updated' });
      const prisma = makePrismaMock({
        room: {
          findUnique: jest.fn().mockResolvedValue({ id: 'room-1', name: 'Old' }),
          update,
        },
      });
      const service = new RoomsService(prisma);

      const result = await service.update('room-1', { name: 'Updated' });

      expect(update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { name: 'Updated' } });
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of deleting a non-existent room', async () => {
      const del = jest.fn();
      const prisma = makePrismaMock({ room: { delete: del } });
      const service = new RoomsService(prisma);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(del).not.toHaveBeenCalled();
    });

    it('deletes an existing room', async () => {
      const del = jest.fn().mockResolvedValue({ id: 'room-1' });
      const prisma = makePrismaMock({
        room: {
          findUnique: jest.fn().mockResolvedValue({ id: 'room-1' }),
          delete: del,
        },
      });
      const service = new RoomsService(prisma);

      await service.remove('room-1');
      expect(del).toHaveBeenCalledWith({ where: { id: 'room-1' } });
    });
  });
});
