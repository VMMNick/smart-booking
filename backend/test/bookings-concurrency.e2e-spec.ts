import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * This is the test the whole "avoid double-booking" requirement lives or
 * dies by: fire N concurrent requests for the exact same room + time slot
 * and assert that exactly one succeeds.
 *
 * Requires a real Postgres reachable via DATABASE_URL (see docker-compose.yml
 * / .env). Run with: npm run test:e2e
 */
describe('Bookings concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let roomId: string;
  let token: string;

  const CONCURRENT_REQUESTS = 10;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const email = `concurrency-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123', name: 'Concurrency Test' });
    token = registerRes.body.accessToken;

    const room = await prisma.room.create({
      data: {
        name: `Test Room ${Date.now()}`,
        basePrice: 100,
        capacity: 4,
        location: 'Test Wing',
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.delete({ where: { id: roomId } });
    await app.close();
  });

  it('allows exactly one booking to win when N requests race for the same slot', async () => {
    const startTime = new Date('2030-01-01T10:00:00.000Z').toISOString();
    const endTime = new Date('2030-01-01T11:00:00.000Z').toISOString();

    const requests = Array.from({ length: CONCURRENT_REQUESTS }, () =>
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ roomId, startTime, endTime }),
    );

    const responses = await Promise.all(requests);

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);

    expect(succeeded.length).toBe(1);
    expect(conflicted.length).toBe(CONCURRENT_REQUESTS - 1);

    const activeBookings = await prisma.booking.findMany({
      where: { roomId, status: { in: ['pending', 'confirmed'] } },
    });
    expect(activeBookings.length).toBe(1);
  }, 30000);
});
