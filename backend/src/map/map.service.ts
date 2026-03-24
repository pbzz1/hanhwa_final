import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  polarToLatLng,
  type RadarSnapshotDto,
} from './radar-snapshot';

@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FMCW 근거리 레이더 데모 스냅샷 — DB의 아군·적 위치를 참고해 센서 위치·주시 방향·탐지점을 합성
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

    const rangeMaxM = 8200;
    const fovDeg = 118;
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

    const seeds: Array<{
      rangeM: number;
      azOff: number;
      elevationDeg: number;
      dopplerMps: number;
      confidence: number;
    }> = [
      { rangeM: 1650, azOff: -28, elevationDeg: 0.9, dopplerMps: -6.4, confidence: 0.86 },
      { rangeM: 2840, azOff: -11, elevationDeg: 1.5, dopplerMps: -11.2, confidence: 0.91 },
      { rangeM: 4100, azOff: 3, elevationDeg: 2.0, dopplerMps: -15.8, confidence: 0.79 },
      { rangeM: 5320, azOff: 18, elevationDeg: 2.4, dopplerMps: -9.1, confidence: 0.84 },
      { rangeM: 6780, azOff: 31, elevationDeg: 3.1, dopplerMps: -4.2, confidence: 0.72 },
      { rangeM: 2400, azOff: 22, elevationDeg: 1.1, dopplerMps: 2.8, confidence: 0.68 },
    ];

    const detections = seeds.map((s, i) => {
      const azimuthDeg = headingDeg + s.azOff;
      const { lat, lng } = polarToLatLng(radarLat, radarLng, s.rangeM, azimuthDeg);
      return {
        id: `det-${i + 1}`,
        lat,
        lng,
        rangeM: s.rangeM,
        azimuthDeg: Math.round(azimuthDeg * 10) / 10,
        elevationDeg: s.elevationDeg,
        dopplerMps: Math.round(s.dopplerMps * 10) / 10,
        confidence: s.confidence,
      };
    });

    return {
      radar: {
        id: 'radar-demo-1',
        label: 'FMCW 근거리 레이더 (데모)',
        lat: radarLat,
        lng: radarLng,
        rangeMaxM,
        fovDeg,
        headingDeg: Math.round(headingDeg * 10) / 10,
        elevationBeamDeg: 12,
      },
      meta: {
        sensor: 'FMCW',
        representationNote:
          '탐지마다 거리·방위각·고도(빔 내) · 도플러(경속)를 반환합니다. 웹 표시는 지도상 위경도로 투영한 결과입니다.',
        vodReferenceNote:
          'View-of-Delft(VoD) 데이터셋은 동일 계열 3+1D 레이더를 포인트 클라우드(또는 누적 스캔)로 제공합니다. 본 화면은 그 물리량을 전술 지도에 올린 데모입니다.',
        methodology: {
          scenarioNote:
            '시연에서는 군용 표적 기호 대신 일반 도로 위 차량(승용·상용)을 전제로 합니다. 지도 핀·궤적은 “레이더가 관심 있는 이동체”를 가리키며, 동일한 FMCW 물리량(거리·방위·도플러)으로 상황을 설명합니다.',
          poseAndDistanceNote:
            '거리(range)는 FMCW 채널에서 왕복 지연(비트 주파수와 대응)으로 추정하고, 방위·고도는 배열/빔스캔에 따른 각 스펙트럼에서 피크를 고릅니다. 도플러는 레이더–표적 연선 방향의 상대속도(접근/이탈)에 비례합니다. “어디를 보고 있는지”는 본 데모에서 레이더 주시 방위(빔 중심)로 표시하고, 기준 표적 쪽을 향하도록 맞춥니다. 차량의 주행 방향은 지도상 OSRM 도로 궤적·핀 이동 방향으로 가시화할 수 있으며, 완전한 자세 추정은 카메라·IMU·추적 필터와 결합하는 것이 일반적입니다.',
          preprocessingNote:
            'ADC 동기화 후 창 함수를 적용하고, 거리 FFT·도플러 FFT로 Range–Doppler 맵을 만듭니다. 제로 거리·위상·안테나 기하 보정을 거친 뒤 CFAR 등으로 임계값을 넘는 셀을 탐지하고, 클러스터링으로 포인트 그룹을 만듭니다. VoD류 3+1D 포인트 표현으로 넘길 때는 프레임 간 정합·누적 정책을 둡니다.',
          trainingNote:
            '공개 데이터(View-of-Delft 등)에서 RD 맵 또는 3+1D 포인트와 라벨(거리·방위·도플러/반사 강도)을 쌍으로 구성합니다. RD 기반이면 U-Net/ResNet류로 피크·경계 회귀, 포인트 기반이면 PointNet/센서 특화 네트워크로 분할·회귀를 학습하고, 손실은 거리·각·도플러 오차에 추적 연속성 보조 항을 더하는 식으로 설계할 수 있습니다.',
          demoImplementationNote:
            '현재 백엔드 스냅샷은 UX 시연용으로, DB의 첫 표적 방향으로 주시 방위를 잡고 미리 정의한 시드로 탐지를 합성합니다. 지도 투영은 극좌표(거리·북 기준 방위)→위경도 변환입니다. 딥러닝 추론 엔진은 이 엔드포인트에 연결되어 있지 않습니다.',
        },
      },
      detections,
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
