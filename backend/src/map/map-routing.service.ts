import { Injectable, BadRequestException } from '@nestjs/common';

type LngLat = [number, number];

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    geometry: {
      type: string;
      coordinates: LngLat[];
    };
  }>;
};

/**
 * 공개 OSRM 데모 서버 (한국 포함 전역 도로 근사).
 * 운영 시 자체 OSRM/GraphHopper/카카오 길찾기 API로 교체 권장.
 */
const DEFAULT_OSRM = 'https://router.project-osrm.org';

@Injectable()
export class MapRoutingService {
  private readonly baseUrl =
    process.env.OSRM_BASE_URL?.replace(/\/$/, '') ?? DEFAULT_OSRM;

  /**
   * 자동차 도로 기준 최단 경로 (GeoJSON 좌표열, [lng, lat]).
   */
  async getDrivingRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<{ lat: number; lng: number }[]> {
    if (
      [fromLat, fromLng, toLat, toLng].some(
        (n) => typeof n !== 'number' || Number.isNaN(n),
      )
    ) {
      throw new BadRequestException('좌표가 올바르지 않습니다.');
    }

    const url = `${this.baseUrl}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}`);
    }

    const data = (await res.json()) as OsrmRouteResponse;
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
      throw new Error(`OSRM 응답 없음: ${data.code ?? 'unknown'}`);
    }

    const coords = data.routes[0].geometry.coordinates;
    return coords.map(([lng, lat]) => ({ lat, lng }));
  }
}
