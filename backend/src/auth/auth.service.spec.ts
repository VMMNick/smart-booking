import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  function makeUsersServiceMock(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      create: jest.fn(),
      validateCredentials: jest.fn(),
      ...overrides,
    } as never;
  }

  function makeJwtServiceMock() {
    return { sign: jest.fn().mockReturnValue('signed-jwt-token') };
  }

  describe('register', () => {
    it('creates the user and returns an access token with a sanitized user', async () => {
      const usersService = makeUsersServiceMock({
        create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: Role.USER }),
      });
      const jwtService = makeJwtServiceMock();
      const service = new AuthService(usersService, jwtService as never);

      const result = await service.register('a@b.com', 'password123', 'Name');

      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1', email: 'a@b.com', role: Role.USER });
      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        user: { id: 'user-1', email: 'a@b.com', role: Role.USER },
      });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for invalid credentials', async () => {
      const usersService = makeUsersServiceMock({
        validateCredentials: jest.fn().mockResolvedValue(null),
      });
      const jwtService = makeJwtServiceMock();
      const service = new AuthService(usersService, jwtService as never);

      await expect(service.login('a@b.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('returns an access token for valid credentials', async () => {
      const usersService = makeUsersServiceMock({
        validateCredentials: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: Role.ADMIN }),
      });
      const jwtService = makeJwtServiceMock();
      const service = new AuthService(usersService, jwtService as never);

      const result = await service.login('a@b.com', 'correct');

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result.user).toEqual({ id: 'user-1', email: 'a@b.com', role: Role.ADMIN });
    });
  });
});
