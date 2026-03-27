import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  polarToLatLng,
  type RadarSnapshotDto,
} from './radar-snapshot';

/** 펄스: 약 40km / FMCW: 약 10~15km (데모 고정값) */
const PULSE_RANGE_MAX_M = 40_000;
const FMCW_RANGE_MAX_M = 12_500;

@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 펄스(광역·점) + FMCW(근거리·위상·예측 궤적) 합성 스냅샷
   */
  async getRadarSnapshot(): Promise<RadarSnapshotDto> {
    const [firstUnit, firstEnemy] = await Promise.all([
      this.prisma.unit.findFirst({ orderBy: { id: 'asc' } }),
      this.prisma.infiltrationPoint.findFirst({ orderBy: { id: 'asc' } }),
    ]);

    const baseLat = firstUnit?.lat ?? 36.5;
    const baseLng = firstUnit?.lng ?? 127.8;
    const radarLat = baseLat - 0.055;
    const radarLng = baseLng - 0.038;

    let headingDeg = 52;
    if (firstEnemy) {
      const dN = (firstEnemy.lat - radarLat) * 111320;
      const dE =
        (firstEnemy.lng - radarLng) *
        111320 *
        Math.cos((radarLat * Math.PI) / 180);
      headingDeg = (Math.atan2(dE, dN) * 180) / Math.PI;
      if (headingDeg < 0) headingDeg += 360;
    }

    const pulseFovDeg = 105;
    const fmcwFovDeg = 92;

    /** 펄스: 부채꼴 내 장거리 다점 — 지도에는 점만 */
    const pulseRangesM = [
      16_000, 19_500, 23_000, 27_000, 31_000, 34_000, 37_500, 22_000, 29_000,
      33_000,
    ];
    const pulseAzOff = [-38, -25, -12, 0, 12, 22, 35, 8, -5, 18];
    const pulseDetections = pulseRangesM.map((rangeM, i) => {
      const azimuthDeg = headingDeg + (pulseAzOff[i] ?? 0);
      const { lat, lng } = polarToLatLng(radarLat, radarLng, rangeM, azimuthDeg);
      return {
        id: `pulse-${i + 1}`,
        lat,
        lng,
      };
    });

    const fmcwSeeds: Array<{
      rangeM: number;
      azOff: number;
      elevationDeg: number;
      dopplerMps: number;
      confidence: number;
      phaseDeg: number;
    }> = [
      { rangeM: 2100, azOff: -22, elevationDeg: 0.9, dopplerMps: -6.4, confidence: 0.86, phaseDeg: 42 },
      { rangeM: 3800, azOff: -9, elevationDeg: 1.4, dopplerMps: -10.1, confidence: 0.91, phaseDeg: 118 },
      { rangeM: 5400, azOff: 4, elevationDeg: 1.9, dopplerMps: -14.2, confidence: 0.79, phaseDeg: 205 },
      { rangeM: 7200, azOff: 16, elevationDeg: 2.3, dopplerMps: -8.5, confidence: 0.84, phaseDeg: 301 },
      { rangeM: 9200, azOff: 28, elevationDeg: 2.8, dopplerMps: -5.1, confidence: 0.72, phaseDeg: 355 },
      { rangeM: 3100, azOff: 19, elevationDeg: 1.0, dopplerMps: 2.4, confidence: 0.68, phaseDeg: 88 },
    ];

    const fmcwDetections = fmcwSeeds.map((s, i) => {
      const azimuthDeg = headingDeg + s.azOff;
      const { lat, lng } = polarToLatLng(radarLat, radarLng, s.rangeM, azimuthDeg);
      return {
        id: `fmcw-${i + 1}`,
        lat,
        lng,
        rangeM: s.rangeM,
        azimuthDeg: Math.round(azimuthDeg * 10) / 10,
        elevationDeg: s.elevationDeg,
        dopplerMps: Math.round(s.dopplerMps * 10) / 10,
        confidence: s.confidence,
        phaseDeg: s.phaseDeg,
      };
    });

    let track: RadarSnapshotDto['fmcw']['track'] = null;
    if (firstEnemy) {
      const predictedPath: Array<{ lat: number; lng: number }> = [];
      for (let k = 0; k < 7; k += 1) {
        predictedPath.push({
          lat: firstEnemy.lat - k * 0.028,
          lng: firstEnemy.lng + k * 0.0035,
        });
      }
      const p0 = predictedPath[0]!;
      const p1 = predictedPath[1]!;
      const dN = (p1.lat - p0.lat) * 111320;
      const dE =
        (p1.lng - p0.lng) * 111320 * Math.cos((p0.lat * Math.PI) / 180);
      let bearingDeg = (Math.atan2(dE, dN) * 180) / Math.PI;
      if (bearingDeg < 0) bearingDeg += 360;

      track = {
        bearingDeg: Math.round(bearingDeg * 10) / 10,
        phaseRefDeg: 22.5,
        predictedPath,
      };
    }

    const methodology = {
      scenarioNote:
        '본 데모는 단일 대대(지휘통제실) 작전구역에 압축된 시나리오입니다. 시연에서는 군용 표적 기호와 함께 일반 도로 위 차량(승용·상용)을 전제로 한 설명도 병행합니다. 지도 핀·궤적은 “레이더가 관심 있는 이동체”를 가리키며, 동일한 FMCW 물리량(거리·방위·도플러)으로 상황을 설명합니다.',
      poseAndDistanceNote:
        '거리(range)는 FMCW 채널에서 왕복 지연(비트 주파수와 대응)으로 추정하고, 방위·고도는 배열/빔스캔에 따른 각 스펙트럼에서 피크를 고릅니다. 도플러는 레이더–표적 연선 방향의 상대속도(접근/이탈)에 비례합니다. “어디를 보고 있는지”는 본 데모에서 레이더 주시 방위(빔 중심)로 표시하고, 기준 표적 쪽을 향하도록 맞춥니다. 차량의 주행 방향은 지도상 OSRM 도로 궤적·핀 이동 방향으로 가시화할 수 있으며, 완전한 자세 추정은 카메라·IMU·추적 필터와 결합하는 것이 일반적입니다.',
      preprocessingNote:
        'ADC 동기화 후 창 함수를 적용하고, 거리 FFT·도플러 FFT로 Range–Doppler 맵을 만듭니다. 제로 거리·위상·안테나 기하 보정을 거친 뒤 CFAR 등으로 임계값을 넘는 셀을 탐지하고, 클러스터링으로 포인트 그룹을 만듭니다. VoD류 3+1D 포인트 표현으로 넘길 때는 프레임 간 정합·누적 정책을 둡니다.',
      trainingNote:
        '공개 데이터(View-of-Delft 등)에서 RD 맵 또는 3+1D 포인트와 라벨(거리·방위·도플러/반사 강도)을 쌍으로 구성합니다. RD 기반이면 U-Net/ResNet류로 피크·경계 회귀, 포인트 기반이면 PointNet/센서 특화 네트워크로 분할·회귀를 학습하고, 손실은 거리·각·도플러 오차에 추적 연속성 보조 항을 더하는 식으로 설계할 수 있습니다.',
      demoImplementationNote:
        '스냅샷은 UX 시연용으로, 펄스(약 40km)는 광역 다점을 점으로만 표시하고, FMCW(약 10~15km)는 위상·방위·예측 경로를 합성합니다. 딥러닝 추론 엔진은 연결되어 있지 않습니다.',
    };

    return {
      pulse: {
        radar: {
          id: 'pulse-demo-1',
          label: '펄스 탐지 레이더 (광역)',
          lat: radarLat,
          lng: radarLng,
          rangeMaxM: PULSE_RANGE_MAX_M,
          fovDeg: pulseFovDeg,
          headingDeg: Math.round(headingDeg * 10) / 10,
          elevationBeamDeg: 8,
        },
        detections: pulseDetections,
      },
      fmcw: {
        radar: {
          id: 'fmcw-demo-1',
          label: 'FMCW 근거리 레이더',
          lat: radarLat,
          lng: radarLng,
          rangeMaxM: FMCW_RANGE_MAX_M,
          fovDeg: fmcwFovDeg,
          headingDeg: Math.round(headingDeg * 10) / 10,
          elevationBeamDeg: 12,
        },
        meta: {
          sensor: 'FMCW',
          representationNote:
            'FMCW는 근거리에서 거리·방위·위상·도플러를 고해상도로 얻어 표적 방향과 예측 궤적에 활용합니다. 웹 표시는 지도상 위경도로 투영한 결과입니다.',
          vodReferenceNote:
            'View-of-Delft(VoD) 등은 동일 계열 레이더를 포인트 클라우드로 제공합니다. 본 화면은 그 물리량을 전술 지도에 올린 데모입니다.',
          methodology,
        },
        detections: fmcwDetections,
        track,
      },
    };
  }

  async getUnits() {
    return this.prisma.unit.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async getInfiltrationPoints() {
    const points = await this.prisma.infiltrationPoint.findMany({
      orderBy: { id: 'asc' },
    });
    return points.map((p) => ({
      ...p,
      observedAt: p.observedAt.toISOString().replace('T', ' ').slice(0, 16),
    }));
  }
}
