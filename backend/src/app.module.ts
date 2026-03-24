import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';
import { MapModule } from './map/map.module';

@Module({
  imports: [AuthModule, PrismaModule, AiModule, MapModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
