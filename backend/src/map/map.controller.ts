import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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

  /**
   * FMCW 근거리 레이더 탐지 스냅샷 (R/Az/El/Doppler + 지도 투영)
   * @query source `live` — VoD 동기 프레임으로 AI 파이프라인(DBSCAN 등) 실행 후 FMCW 탐지 병합
   * @query seed 정수 — 동기 프레임 풀에서 결정적 선택
   */
  @Get('radar/snapshot')
  getRadarSnapshot(
    @Query('source') source?: string,
    @Query('seed') seed?: string,
  ) {
    const live =
      source === 'live' || source === '1' || source === 'true';
    const seedNum = seed !== undefined ? Number.parseInt(seed, 10) : undefined;
    return this.mapService.getRadarSnapshot({
      live,
      seed: Number.isFinite(seedNum) ? seedNum : undefined,
    });
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

  @Get('tactics/recommendations')
  getTacticRecommendations(@Query('scenarioKey') scenarioKey?: string) {
    return this.mapService.getTacticRecommendations(
      scenarioKey && scenarioKey.trim().length > 0
        ? scenarioKey.trim()
        : 'battalion-reconstructed-v1',
    );
  }

  @Post('tactics/decision')
  saveTacticDecision(
    @Body()
    body: {
      scenarioKey?: string;
      selectedUnitName?: string;
      suitabilityPct?: number;
      note?: string;
      source?: string;
      rawPayload?: unknown;
    },
  ) {
    return this.mapService.saveTacticDecision({
      scenarioKey:
        body.scenarioKey && body.scenarioKey.trim().length > 0
          ? body.scenarioKey.trim()
          : 'battalion-reconstructed-v1',
      selectedUnitName:
        body.selectedUnitName && body.selectedUnitName.trim().length > 0
          ? body.selectedUnitName.trim()
          : '미지정',
      suitabilityPct:
        typeof body.suitabilityPct === 'number' && Number.isFinite(body.suitabilityPct)
          ? body.suitabilityPct
          : 0,
      note: typeof body.note === 'string' ? body.note : '',
      source: typeof body.source === 'string' ? body.source : 'web-ui',
      rawPayload: body.rawPayload ?? null,
    });
  }
}
