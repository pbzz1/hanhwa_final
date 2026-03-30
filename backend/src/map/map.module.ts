import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';
import { MapRoutingService } from './map-routing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [MapController],
  providers: [MapService, MapRoutingService],
})
export class MapModule {}
