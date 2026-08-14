import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';

describe('UsersService', () => {
  function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        ...((overrides.user as object) ?? {}),
      },
    } as never;
  }

  describe('create', () => {
    it('rejects registration when the email is already taken', async () => {
      const prisma = makePrismaMock({
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
      });
      const service = new UsersService(prisma);

      await expect(service.create('taken@example.com', 'password123', 'Name')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('hashes the password and never returns it from create()', async () => {
      const created = {
        id: 'user-1',
        email: 'new@example.com',
        name: 'New User',
        role: Role.USER,
        passwordHash: 'hashed-value',
      };
      const create = jest.fn().mockResolvedValue(created);
      const prisma = makePrismaMock({ user: { create } });
      const service = new UsersService(prisma);

      const result = await service.create('new@example.com', 'password123', 'New User');

      const [[callArg]] = create.mock.calls;
      expect(callArg.data.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', callArg.data.passwordHash)).toBe(true);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toMatchObject({ id: 'user-1', email: 'new@example.com' });
    });
  });

  describe('validateCredentials', () => {
    it('returns null when no user exists for the email', async () => {
      const prisma = makePrismaMock();
      const service = new UsersService(prisma);

      await expect(service.validateCredentials('nobody@example.com', 'whatever')).resolves.toBeNull();
    });

    it('returns null when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      const prisma = makePrismaMock({
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', passwordHash }) },
      });
      const service = new UsersService(prisma);

      await expect(service.validateCredentials('user@example.com', 'wrong-password')).resolves.toBeNull();
    });

    it('returns the user when the password matches', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      const user = { id: 'user-1', email: 'user@example.com', passwordHash };
      const prisma = makePrismaMock({
        user: { findUnique: jest.fn().mockResolvedValue(user) },
      });
      const service = new UsersService(prisma);

      await expect(service.validateCredentials('user@example.com', 'correct-password')).resolves.toBe(user);
    });
  });

  describe('findById', () => {
    it('returns null when the user does not exist', async () => {
      const prisma = makePrismaMock();
      const service = new UsersService(prisma);

      await expect(service.findById('missing')).resolves.toBeNull();
    });

    it('strips passwordHash from the returned user', async () => {
      const prisma = makePrismaMock({
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash: 'secret' }),
        },
      });
      const service = new UsersService(prisma);

      const result = await service.findById('user-1');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});
