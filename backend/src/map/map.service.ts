import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  polarToLatLng,
  type RadarDetectionDto,
  type RadarInsightsDto,
  type RadarSnapshotDto,
} from './radar-snapshot';

/** 펄스: 약 40km / FMCW: 약 10~15km (데모 고정값) */
const PULSE_RANGE_MAX_M = 40_000;
const FMCW_RANGE_MAX_M = 12_500;

function bearingFromEnuMeters(eastM: number, northM: number): number {
  let deg = (Math.atan2(eastM, northM) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function mapAiItemToRadarDetection(
  d: Record<string, unknown>,
  radarLat: number,
  radarLng: number,
): RadarDetectionDto | null {
  const rangeM = Number(d.rangeM);
  if (!Number.isFinite(rangeM) || rangeM <= 0) return null;
  const azimuthDeg = Number(d.azimuthDeg);
  const elevationDeg = Number(d.elevationDeg);
  const dopplerMps = Number(d.dopplerMps);
  const confidence = Number(d.confidence);
  const id = typeof d.id === 'string' ? d.id : 'cluster-unknown';

  let bearingDeg: number;
  const cm = d.centroidM;
  if (Array.isArray(cm) && cm.length >= 2) {
    const ex = Number(cm[0]);
    const ny = Number(cm[1]);
    if (Number.isFinite(ex) && Number.isFinite(ny)) {
      bearingDeg = bearingFromEnuMeters(ex, ny);
    } else {
      bearingDeg = Number.isFinite(azimuthDeg) ? azimuthDeg : 0;
    }
  } else {
    bearingDeg = Number.isFinite(azimuthDeg) ? azimuthDeg : 0;
  }

  const { lat, lng } = polarToLatLng(radarLat, radarLng, rangeM, bearingDeg);

  const phaseDeg =
    Math.round(
      (Math.abs(rangeM * 0.017 + dopplerMps * 3 + confidence * 40) % 360) * 10,
    ) / 10;

  return {
    id,
    lat,
    lng,
    rangeM: Math.round(rangeM * 100) / 100,
    azimuthDeg: Number.isFinite(azimuthDeg) ? Math.round(azimuthDeg * 10) / 10 : 0,
    elevationDeg: Number.isFinite(elevationDeg) ? Math.round(elevationDeg * 10) / 10 : 0,
    dopplerMps: Number.isFinite(dopplerMps) ? Math.round(dopplerMps * 100) / 100 : 0,
    confidence: Number.isFinite(confidence)
      ? Math.min(0.999, Math.max(0, confidence))
      : 0,
    phaseDeg,
  };
}

function trackTowardPrimary(
  radarLat: number,
  radarLng: number,
  primary: RadarDetectionDto,
): RadarSnapshotDto['fmcw']['track'] {
  const steps = 6;
  const predictedPath: Array<{ lat: number; lng: number }> = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    predictedPath.push({
      lat: radarLat + (primary.lat - radarLat) * t,
      lng: radarLng + (primary.lng - radarLng) * t,
    });
  }
  const p0 = predictedPath[0]!;
  const p1 = predictedPath[1]!;
  const dN = (p1.lat - p0.lat) * 111320;
  const dE =
    (p1.lng - p0.lng) * 111320 * Math.cos((p0.lat * Math.PI) / 180);
  let bearingDeg = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;
  return {
    bearingDeg: Math.round(bearingDeg * 10) / 10,
    phaseRefDeg: 0,
    predictedPath,
  };
}

function buildInsightsFromAi(ai: Record<string, unknown>): RadarInsightsDto {
  const frameId = typeof ai.autoFrameId === 'string' ? ai.autoFrameId : undefined;
  const yoloModel = typeof ai.yoloModel === 'string' ? ai.yoloModel : undefined;
  const annotatedImageBase64 =
    typeof ai.annotatedImageBase64 === 'string' && ai.annotatedImageBase64.length > 0
      ? ai.annotatedImageBase64
      : null;

  const yoloDetections: NonNullable<RadarInsightsDto['yoloDetections']> = [];
  const rawY = ai.yoloDetections;
  if (Array.isArray(rawY)) {
    for (const y of rawY) {
      if (!y || typeof y !== 'object') continue;
      const o = y as Record<string, unknown>;
      const label = typeof o.label === 'string' ? o.label : '?';
      const confidence = Number(o.confidence);
      const bbox = Array.isArray(o.bbox) ? o.bbox.map((x) => Number(x)) : [];
      if (!Number.isFinite(confidence)) continue;
      yoloDetections.push({ label, confidence, bbox });
    }
  }

  let primaryObject: RadarInsightsDto['primaryObject'] = null;
  if (yoloDetections.length > 0) {
    const bboxArea = (b: number[]) =>
      b.length >= 4
        ? Math.max(0, b[2]! - b[0]!) * Math.max(0, b[3]! - b[1]!)
        : 0;
    const best = yoloDetections.reduce((a, d) =>
      bboxArea(d.bbox) > bboxArea(a.bbox) ? d : a,
    );
    primaryObject = { label: best.label, confidence: best.confidence };
  }

  let lidarValidation: RadarInsightsDto['lidarValidation'] = null;
  const rawLv = ai.lidarValidation;
  if (rawLv && typeof rawLv === 'object') {
    const lv = rawLv as Record<string, unknown>;
    lidarValidation = {
      matched: typeof lv.matched === 'boolean' ? lv.matched : undefined,
      pointsInRoi: typeof lv.pointsInRoi === 'number' ? lv.pointsInRoi : undefined,
      deltaRangeM:
        lv.deltaRangeM === null
          ? null
          : typeof lv.deltaRangeM === 'number'
            ? lv.deltaRangeM
            : undefined,
      deltaBearingDeg:
        lv.deltaBearingDeg === null
          ? null
          : typeof lv.deltaBearingDeg === 'number'
            ? lv.deltaBearingDeg
            : undefined,
      verdict: typeof lv.verdict === 'string' ? lv.verdict : undefined,
      lidarClusterRangeM:
        lv.lidarClusterRangeM === null
          ? null
          : typeof lv.lidarClusterRangeM === 'number'
            ? lv.lidarClusterRangeM
            : undefined,
      radarRangeM:
        lv.radarRangeM === null
          ? null
          : typeof lv.radarRangeM === 'number'
            ? lv.radarRangeM
            : undefined,
      iouBevProxy:
        typeof lv.iouBevProxy === 'number' ? lv.iouBevProxy : undefined,
      meanDistanceM:
        lv.meanDistanceM === null
          ? null
          : typeof lv.meanDistanceM === 'number'
            ? lv.meanDistanceM
            : undefined,
    };
  }

  const radarList = Array.isArray(ai.radarDetections) ? ai.radarDetections : [];
  const primaryRadar =
    radarList[0] && typeof radarList[0] === 'object'
      ? (radarList[0] as Record<string, unknown>)
      : null;

  const conclusionBullets: string[] = [];
  if (primaryRadar) {
    const rm = Number(primaryRadar.rangeM);
    const az = Number(primaryRadar.azimuthDeg);
    const el = Number(primaryRadar.elevationDeg);
    const cf = Number(primaryRadar.confidence);
    conclusionBullets.push(
      `레이더(DBSCAN) 1위 후보: 거리 ${Number.isFinite(rm) ? rm : '—'}m, 방위 ${Number.isFinite(az) ? az : '—'}°, 고도 ${Number.isFinite(el) ? el : '—'}°, 클러스터 신뢰 ${Number.isFinite(cf) ? cf.toFixed(2) : '—'}`,
    );
  }
  if (primaryObject) {
    conclusionBullets.push(
      `카메라(YOLO${yoloModel ? ` · ${yoloModel}` : ''}): 주요 객체 "${primaryObject.label}" 신뢰도 ${(primaryObject.confidence * 100).toFixed(1)}%`,
    );
  }
  const rpc = typeof ai.radarPointCount === 'number' ? ai.radarPointCount : undefined;
  const ims = typeof ai.inferMs === 'number' ? ai.inferMs : undefined;
  conclusionBullets.push(
    `동기 프레임 ${frameId ?? '—'} · 레이더 원시 포인트 ${rpc ?? '—'}개 · 서버 처리 ${ims ?? '—'}ms`,
  );

  let lidarReviewParagraph: string;
  if (lidarValidation && (lidarValidation.pointsInRoi ?? 0) > 0) {
    lidarReviewParagraph = `동기 LiDAR에서 레이더 1위 클러스터 중심을 기준으로 ROI를 설정하고, 점 수·레이더 대비 거리 차(Δ${lidarValidation.deltaRangeM ?? '—'}m)·방위 차(Δ${lidarValidation.deltaBearingDeg ?? '—'}°)·BEV proxy(${lidarValidation.iouBevProxy ?? '—'})를 검토했습니다. 판정: ${lidarValidation.verdict ?? '—'}.`;
  } else {
    lidarReviewParagraph =
      '동기 LiDAR(.bin)이 없거나 ROI 내 유효 점이 부족해 이번 프레임에서는 기하 검증을 수행하지 않았습니다. VoD KITTI 레이아웃에서 image_2·radar·lidar velodyne의 stem을 맞추면 자동으로 LiDAR 검증이 붙습니다.';
  }

  const syncedViewNote = primaryRadar
    ? `카메라 이미지와 3D 레이더 산점도는 동일 프레임(${frameId ?? '—'})입니다. 3D 뷰는 차량(ego) 후방·소고도에서 전방 주시(레이더 1위 방위 약 ${Number(primaryRadar.azimuthDeg)}°, 고도 약 ${Number(primaryRadar.elevationDeg)}°)를 바라보도록 배치하여, 2D 검출이 담는 전방 시야와 같은 관측 축에 맞춥니다.`
    : `카메라와 레이더 시각화는 동일 VoD 프레임(${frameId ?? '—'})에서 얻은 결과를 병치한 것입니다.`;

  return {
    frameId,
    yoloModel,
    annotatedImageBase64,
    yoloDetections: yoloDetections.length > 0 ? yoloDetections : undefined,
    primaryObject,
    lidarValidation,
    conclusionBullets,
    lidarReviewParagraph,
    syncedViewNote,
  };
}

@Injectable()
export class MapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * 펄스(광역·점) + FMCW(근거리·위상·예측 궤적) 합성 스냅샷
   * @param options.live true면 VoD 동기 프레임으로 Python DBSCAN(+YOLO/LiDAR) 실행 후 FMCW 탐지를 덮어씀
   */
  async getRadarSnapshot(options?: {
    live?: boolean;
    seed?: number;
  }): Promise<RadarSnapshotDto> {
    const snapshot = await this.buildSyntheticRadarSnapshot();
    snapshot.fmcw.meta.liveRun = null;
    snapshot.fmcw.insights = null;

    if (!options?.live) {
      return snapshot;
    }

    try {
      const ai = (await this.aiService.inferVodRadarFusionAuto(
        options.seed,
      )) as Record<string, unknown>;
      const rawList = ai.radarDetections;
      const radarLat = snapshot.fmcw.radar.lat;
      const radarLng = snapshot.fmcw.radar.lng;

      const liveRunBase = {
        frameId: typeof ai.autoFrameId === 'string' ? ai.autoFrameId : undefined,
        inferMs: typeof ai.inferMs === 'number' ? ai.inferMs : undefined,
        radarPipeline:
          typeof ai.radarPipeline === 'string' ? ai.radarPipeline : undefined,
        radarPointCount:
          typeof ai.radarPointCount === 'number' ? ai.radarPointCount : undefined,
      };

      if (!Array.isArray(rawList) || rawList.length === 0) {
        snapshot.fmcw.insights = null;
        snapshot.fmcw.meta.liveRun = {
          ok: false,
          error: 'AI 응답에 탐지가 없습니다.',
          ...liveRunBase,
        };
        return snapshot;
      }

      const mapped: RadarDetectionDto[] = [];
      for (const item of rawList) {
        if (!item || typeof item !== 'object') continue;
        const det = mapAiItemToRadarDetection(
          item as Record<string, unknown>,
          radarLat,
          radarLng,
        );
        if (det) mapped.push(det);
      }

      if (mapped.length === 0) {
        snapshot.fmcw.insights = null;
        snapshot.fmcw.meta.liveRun = {
          ok: false,
          error: '탐지 좌표 변환 실패',
          ...liveRunBase,
        };
        return snapshot;
      }

      snapshot.fmcw.detections = mapped;
      snapshot.fmcw.track = trackTowardPrimary(radarLat, radarLng, mapped[0]!);
      snapshot.fmcw.meta.liveRun = { ok: true, ...liveRunBase };
      snapshot.fmcw.insights = buildInsightsFromAi(ai);
      snapshot.fmcw.meta.methodology = {
        ...snapshot.fmcw.meta.methodology,
        demoImplementationNote:
          'FMCW 탐지 목록은 Nest → FastAPI `POST /infer/vod/radar-fusion/auto`(VoD 동기 프레임) DBSCAN 결과입니다. 위경도는 시드 DB의 레이더 위치를 원점으로 한 수평면 투영입니다.',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      snapshot.fmcw.insights = null;
      snapshot.fmcw.meta.liveRun = { ok: false, error: msg };
      snapshot.fmcw.meta.methodology = {
        ...snapshot.fmcw.meta.methodology,
        demoImplementationNote: `${snapshot.fmcw.meta.methodology.demoImplementationNote} [live 연동 실패: ${msg}]`,
      };
    }

    return snapshot;
  }

  private async buildSyntheticRadarSnapshot(): Promise<RadarSnapshotDto> {
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
        '스냅샷은 UX 시연용으로, 펄스(약 40km)는 광역 다점을 점으로만 표시하고, FMCW(약 10~15km)는 위상·방위·예측 경로를 합성합니다. `?source=live` 시에만 Nest가 AI 서버를 호출해 VoD 프레임 기반 탐지로 FMCW 목록을 교체합니다.',
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
        insights: null,
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
