import { Controller, Get, Query } from '@nestjs/common';
import { MapService } from './map.service';
import { MapRoutingService } from './map-routing.service';

@Controller('map')
export class MapController {
  constructor(
    private readonly mapService: MapService,
    private readonly mapRoutingService: MapRoutingService,
  ) {}

  @Get('units')
  getUnits() {
    return this.mapService.getUnits();
  }

  @Get('infiltrations')
  getInfiltrations() {
    return this.mapService.getInfiltrationPoints();
  }

  /** FMCW 근거리 레이더 탐지 스냅샷 (R/Az/El/Doppler + 지도 투영) */
  @Get('radar/snapshot')
  getRadarSnapshot() {
    return this.mapService.getRadarSnapshot();
  }

  /**
   * 도로 따라 이동 시뮬용 — OSRM driving geometry (위도/경도 배열).
   * 쿼리: fromLat, fromLng, toLat, toLng
   */
  @Get('route/driving')
  async getDrivingRoute(
    @Query('fromLat') fromLat: string,
    @Query('fromLng') fromLng: string,
    @Query('toLat') toLat: string,
    @Query('toLng') toLng: string,
  ) {
    const a = Number(fromLat);
    const b = Number(fromLng);
    const c = Number(toLat);
    const d = Number(toLng);
    const coordinates = await this.mapRoutingService.getDrivingRoute(a, b, c, d);
    return { coordinates };
  }
}
