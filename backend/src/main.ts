import 'dotenv/config';
import * as os from 'node:os';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

function devHttpUrlsForPort(port: number): string[] {
  const uniq = new Set<string>();
  uniq.add(`http://127.0.0.1:${port}`);
  uniq.add(`http://localhost:${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        uniq.add(`http://${a.address}:${port}`);
      }
    }
  }
  return [...uniq];
}

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
  try {
    await app.listen(port, host);
    const log = new Logger('Bootstrap');
    log.log(`Nest API (백엔드) — 바인딩 ${host}:${port}`);
    for (const u of devHttpUrlsForPort(port)) {
      log.log(`  · ${u}`);
    }
    log.log(
      '같은 망 다른 기기: 브라우저에서 위 LAN 주소로 API를 직접 호출할 수 있습니다. 프론트는 해당 IP로 Vite에 접속하면 자동으로 같은 IP의 API를 씁니다.',
    );
    if (!isProd) {
      try {
        const prisma = app.get(PrismaService);
        const infiltrationN = await prisma.infiltrationPoint.count();
        if (infiltrationN < 10) {
          log.warn(
            `InfiltrationPoint가 DB에 ${infiltrationN}건뿐입니다. 표적 일람표(적)는 이 테이블을 그대로 씁니다. 데모는 시드 후 15건이 일반적이므로, backend에서 \`npm run prisma:seed\` 또는 \`npx prisma db seed\`로 시드를 반영한 뒤 서버를 다시 띄우세요.`,
          );
        }
      } catch {
        /* Prisma 미기동 등은 무시 */
      }
    }
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as NodeJS.ErrnoException).code)
        : '';
    if (code === 'EADDRINUSE') {
      Logger.error(
        `포트 ${port}이(가) 이미 사용 중입니다. 다른 터미널의 백엔드를 종료하거나 작업 관리자에서 해당 node 프로세스를 끄고, 필요하면 backend/.env 의 PORT를 다른 값(예: 3309)으로 바꾸세요.`,
        undefined,
        'Bootstrap',
      );
    }
    throw err;
  }
}
void bootstrap();
