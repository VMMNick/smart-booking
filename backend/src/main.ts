import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser disabled globally so we can mount raw-body parsing just for
  // the Stripe webhook route below — Stripe signature verification requires
  // the exact, unparsed request bytes.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use('/payments/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`backend listening on :${port}`);
}
bootstrap();
