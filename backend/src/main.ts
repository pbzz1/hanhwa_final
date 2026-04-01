import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: isProd
      ? (process.env.FRONTEND_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ??
        ['http://localhost:5173'])
      : true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = Number(process.env.PORT) || 3308;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
