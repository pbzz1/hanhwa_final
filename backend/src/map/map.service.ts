import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  polarToLatLng,
  type FmcwTrackDto,
  type RadarDetectionDto,
  type RadarInsightsDto,
  type RadarSnapshotDto,
} from './radar-snapshot';
import {
  buildTrajectoryCorridorPolygon,
  buildVodLiveEnrichment,
} from './vod-label-enrichment';

/** 펄스: 약 40km / FMCW: 약 10~15km (데모 고정값) */
const PULSE_RANGE_MAX_M = 40_000;
const FMCW_RANGE_MAX_M = 12_500;

const TACTIC_PROFILE_TABLE = 'tactical_recommendation_profiles';
const TACTIC_DECISION_TABLE = 'tactical_decisions';

type TacticProfileRow = {
  unit_name: string;
  suitability_pct: number;
  rationale: string | null;
  payload_json: unknown;
};

type SaveTacticDecisionInput = {
  scenarioKey: string;
  selectedUnitName: string;
  suitabilityPct: number;
  note: string;
  source: string;
  rawPayload: unknown;
};

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
): FmcwTrackDto {
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

/** 레이더→탐지 시선에 도플러 부호로 단기 외삽(접근 시 기지 쪽으로 이동) */
function trackWithDopplerExtrapolation(
  radarLat: number,
  radarLng: number,
  primary: RadarDetectionDto,
): FmcwTrackDto {
  const base = trackTowardPrimary(radarLat, radarLng, primary);
  const path = [...base.predictedPath];
  const dop = primary.dopplerMps;
  const speed = Math.max(1.2, Math.min(28, Math.abs(dop) + 2));
  const dt = 0.45;
  const nExtra = 12;
  let curLat = primary.lat;
  let curLng = primary.lng;
  const towardRadar = dop <= 0;
  for (let i = 0; i < nExtra; i += 1) {
    const dN = (radarLat - curLat) * 111320;
    const dE =
      (radarLng - curLng) * 111320 * Math.cos((curLat * Math.PI) / 180);
    const len = Math.hypot(dN, dE);
    if (len < 8) break;
    const un = dN / len;
    const ue = dE / len;
    const sign = towardRadar ? 1 : -1;
    const stepM = speed * dt * sign;
    curLat += (un * stepM) / 111320;
    curLng +=
      (ue * stepM) / (111320 * Math.cos((curLat * Math.PI) / 180));
    path.push({ lat: curLat, lng: curLng });
  }

  const n = path.length;
  const pEnd = path[n - 1]!;
  const pPrev = path[Math.max(0, n - 2)]!;
  const dN2 = (pEnd.lat - pPrev.lat) * 111320;
  const dE2 =
    (pEnd.lng - pPrev.lng) * 111320 * Math.cos((pPrev.lat * Math.PI) / 180);
  let bearingDeg = (Math.atan2(dE2, dN2) * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;

  return {
    bearingDeg: Math.round(bearingDeg * 10) / 10,
    phaseRefDeg: Math.round((Math.abs(dop) * 7 + primary.confidence * 40) % 360),
    predictedPath: path,
  };
}

/** VoD ego (동일 투영 규칙) x,y,z m → 지도 좌표 — 수평 거리·방위만 사용 */
function egoXyzToLatLng(
  radarLat: number,
  radarLng: number,
  x: number,
  y: number,
  _z: number,
): { lat: number; lng: number } {
  const rangeM = Math.hypot(x, y);
  const bearingDeg = bearingFromEnuMeters(x, y);
  return polarToLatLng(radarLat, radarLng, rangeM, bearingDeg);
}

function futureEgoSamplesToLatLngPath(
  radarLat: number,
  radarLng: number,
  raw: unknown,
): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const x = Number(row[0]);
    const y = Number(row[1]);
    const z = row.length >= 3 ? Number(row[2]) : 0;
    if (![x, y, z].every((n) => Number.isFinite(n))) continue;
    out.push(egoXyzToLatLng(radarLat, radarLng, x, y, z));
  }
  return out;
}

function trackFromLatLngPath(path: Array<{ lat: number; lng: number }>): FmcwTrackDto | null {
  if (path.length < 2) return null;
  const pEnd = path[path.length - 1]!;
  const pPrev = path[path.length - 2]!;
  const dN = (pEnd.lat - pPrev.lat) * 111320;
  const dE =
    (pEnd.lng - pPrev.lng) * 111320 * Math.cos((pPrev.lat * Math.PI) / 180);
  let bearingDeg = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;
  return {
    bearingDeg: Math.round(bearingDeg * 10) / 10,
    phaseRefDeg: Math.round((path.length * 13) % 360),
    predictedPath: path,
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

  let lidarCrossChecks: RadarInsightsDto['lidarCrossChecks'];
  const rawCross = ai.lidarCrossChecks;
  if (Array.isArray(rawCross) && rawCross.length > 0) {
    lidarCrossChecks = [];
    for (const row of rawCross) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const clusterId = typeof o.clusterId === 'string' ? o.clusterId : '?';
      const rank = Number(o.rank);
      lidarCrossChecks.push({
        rank: Number.isFinite(rank) ? rank : lidarCrossChecks.length + 1,
        clusterId,
        matched: typeof o.matched === 'boolean' ? o.matched : undefined,
        pointsInRoi: typeof o.pointsInRoi === 'number' ? o.pointsInRoi : undefined,
        verdict: typeof o.verdict === 'string' ? o.verdict : undefined,
        deltaRangeM:
          o.deltaRangeM === null
            ? null
            : typeof o.deltaRangeM === 'number'
              ? o.deltaRangeM
              : undefined,
        deltaBearingDeg:
          o.deltaBearingDeg === null
            ? null
            : typeof o.deltaBearingDeg === 'number'
              ? o.deltaBearingDeg
              : undefined,
      });
    }
  }

  let motionAnalysis: RadarInsightsDto['motionAnalysis'];
  const rawMot = ai.motionAnalysis;
  if (rawMot && typeof rawMot === 'object') {
    const m = rawMot as Record<string, unknown>;
    motionAnalysis = {
      frameDeltaS:
        typeof m.frameDeltaS === 'number' ? m.frameDeltaS : undefined,
      trackGateM: typeof m.trackGateM === 'number' ? m.trackGateM : undefined,
      associations: typeof m.associations === 'number' ? m.associations : undefined,
      prevClusterCount:
        typeof m.prevClusterCount === 'number' ? m.prevClusterCount : undefined,
      note: typeof m.note === 'string' ? m.note : undefined,
    };
    const assoc = motionAnalysis.associations;
    const dt = motionAnalysis.frameDeltaS;
    if (assoc !== undefined && dt !== undefined) {
      const tail = motionAnalysis.note ? ` · ${motionAnalysis.note}` : '';
      conclusionBullets.push(
        `연속 프레임(레이더) 연관: ${assoc}개 후보 · Δt ${dt}s 가정${tail}`,
      );
    } else if (motionAnalysis.note) {
      conclusionBullets.push(`연속 프레임(레이더): ${motionAnalysis.note}`);
    }
  }

  let ruleBasedRiskPrimary: RadarInsightsDto['ruleBasedRiskPrimary'];
  const rawRisk = ai.ruleBasedRiskPrimary;
  if (rawRisk && typeof rawRisk === 'object') {
    const r = rawRisk as Record<string, unknown>;
    const factorsRaw = r.factors;
    let factors: Record<string, number> | undefined;
    if (factorsRaw && typeof factorsRaw === 'object') {
      factors = {};
      for (const [k, v] of Object.entries(factorsRaw as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) factors[k] = v;
      }
    }
    ruleBasedRiskPrimary = {
      score: typeof r.score === 'number' ? r.score : undefined,
      level: typeof r.level === 'string' ? r.level : undefined,
      factors,
    };
    if (
      ruleBasedRiskPrimary.score !== undefined &&
      ruleBasedRiskPrimary.level
    ) {
      conclusionBullets.push(
        `규칙 기반 위험도(1위 후보): ${ruleBasedRiskPrimary.level} · 점수 ${ruleBasedRiskPrimary.score.toFixed(3)} (거리·도플러·속도·기지 접근 성분)`,
      );
    }
  }

  let riskModel: RadarInsightsDto['riskModel'];
  const rawRm = ai.riskModel;
  if (rawRm && typeof rawRm === 'object') {
    const rm = rawRm as Record<string, unknown>;
    riskModel = {
      mode: typeof rm.mode === 'string' ? rm.mode : undefined,
      note: typeof rm.note === 'string' ? rm.note : undefined,
    };
  }

  if (primaryRadar && primaryRadar.motionMatched === true) {
    const spd = Number(primaryRadar.speedMps);
    const hdg = Number(primaryRadar.headingDegMotion);
    conclusionBullets.push(
      `1위 후보 연속 프레임 속도: 수평 약 ${Number.isFinite(spd) ? spd.toFixed(2) : '—'} m/s, 헤딩(수평) 약 ${Number.isFinite(hdg) ? hdg.toFixed(1) : '—'}°`,
    );
  }

  let lidarReviewParagraph: string;
  if (lidarValidation && (lidarValidation.pointsInRoi ?? 0) > 0) {
    lidarReviewParagraph = `동기 LiDAR에서 레이더 1위 클러스터 중심을 기준으로 ROI를 설정하고, 점 수·레이더 대비 거리 차(Δ${lidarValidation.deltaRangeM ?? '—'}m)·방위 차(Δ${lidarValidation.deltaBearingDeg ?? '—'}°)·BEV proxy(${lidarValidation.iouBevProxy ?? '—'})를 검토했습니다. 판정: ${lidarValidation.verdict ?? '—'}.`;
  } else {
    lidarReviewParagraph =
      '동기 LiDAR(.bin)이 없거나 ROI 내 유효 점이 부족해 이번 프레임에서는 기하 검증을 수행하지 않았습니다. VoD KITTI 레이아웃에서 image_2·radar·lidar velodyne의 stem을 맞추면 자동으로 LiDAR 검증이 붙습니다.';
  }
  if (lidarCrossChecks && lidarCrossChecks.length > 1) {
    const parts = lidarCrossChecks
      .filter((c) => c.rank > 1)
      .map(
        (c) =>
          `#${c.rank} ${c.clusterId}: ${c.verdict ?? '—'} (ROI 점 ${c.pointsInRoi ?? '—'})`,
      );
    if (parts.length > 0) {
      lidarReviewParagraph += ` 상위 ${lidarCrossChecks.length}개 레이더 후보에 대해 동일 LiDAR로 교차 검증: ${parts.join('; ')}.`;
    }
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
    lidarCrossChecks,
    motionAnalysis,
    ruleBasedRiskPrimary,
    riskModel,
    conclusionBullets,
    lidarReviewParagraph,
    syncedViewNote,
  };
}

@Injectable()
export class MapService {
  private tacticsTableReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  private async ensureTacticsTables() {
    if (this.tacticsTableReady) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${TACTIC_PROFILE_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        scenario_key VARCHAR(96) NOT NULL,
        unit_name VARCHAR(128) NOT NULL,
        suitability_pct DECIMAL(5,2) NOT NULL,
        rationale TEXT NULL,
        payload_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_scenario_key (scenario_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${TACTIC_DECISION_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        scenario_key VARCHAR(96) NOT NULL,
        selected_unit_name VARCHAR(128) NOT NULL,
        suitability_pct DECIMAL(5,2) NOT NULL,
        note TEXT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'web-ui',
        raw_payload_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_scenario_key (scenario_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    this.tacticsTableReady = true;
  }

  private async seedTacticProfilesIfEmpty(scenarioKey: string) {
    const countRows = await this.prisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(
      `SELECT COUNT(*) as cnt FROM ${TACTIC_PROFILE_TABLE} WHERE scenario_key = ?`,
      scenarioKey,
    );
    const cntRaw = countRows[0]?.cnt ?? 0;
    const cnt = typeof cntRaw === 'bigint' ? Number(cntRaw) : Number(cntRaw);
    if (Number.isFinite(cnt) && cnt > 0) return;

    const seed = [
      {
        unitName: '부대1 (기갑대대 신속대응중대)',
        suitabilityPct: 60,
        rationale:
          'FMCW 접촉 구간(10~15km)에서 기동타격·차단선을 가장 빠르게 형성 가능. 야간 EO/IR 연동 숙련.',
        payload: {
          readiness: '최고',
          etaMin: 7,
          antiArmor: 0.84,
          collateralRisk: 0.31,
          uavLinkQuality: 'A',
        },
      },
      {
        unitName: '부대2 (기계화보병 예비대)',
        suitabilityPct: 34,
        rationale:
          '점령·차단 유지에 강점이 있으나 초기 접촉 대응 속도는 부대1 대비 느림.',
        payload: {
          readiness: '경계',
          etaMin: 12,
          antiArmor: 0.58,
          collateralRisk: 0.24,
          uavLinkQuality: 'B+',
        },
      },
      {
        unitName: '부대3 (포병 화력지원대)',
        suitabilityPct: 6,
        rationale:
          '직접 식별·근접 요격보다 후방 화력차단에 적합. 현 시점(근접 식별 단계) 우선순위 낮음.',
        payload: {
          readiness: '양호',
          etaMin: 15,
          antiArmor: 0.42,
          collateralRisk: 0.47,
          uavLinkQuality: 'B',
        },
      },
    ] as const;

    for (const row of seed) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO ${TACTIC_PROFILE_TABLE}
          (scenario_key, unit_name, suitability_pct, rationale, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        scenarioKey,
        row.unitName,
        row.suitabilityPct,
        row.rationale,
        JSON.stringify(row.payload),
      );
    }
  }

  async getTacticRecommendations(scenarioKey: string) {
    await this.ensureTacticsTables();
    await this.seedTacticProfilesIfEmpty(scenarioKey);
    const rows = await this.prisma.$queryRawUnsafe<TacticProfileRow[]>(
      `SELECT unit_name, suitability_pct, rationale, payload_json
       FROM ${TACTIC_PROFILE_TABLE}
       WHERE scenario_key = ?
       ORDER BY suitability_pct DESC, unit_name ASC`,
      scenarioKey,
    );
    return {
      scenarioKey,
      recommendations: rows.map((r) => ({
        unitName: r.unit_name,
        suitabilityPct: Number(r.suitability_pct),
        rationale: r.rationale ?? '',
        payload: r.payload_json ?? null,
      })),
    };
  }

  async saveTacticDecision(input: SaveTacticDecisionInput) {
    await this.ensureTacticsTables();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO ${TACTIC_DECISION_TABLE}
        (scenario_key, selected_unit_name, suitability_pct, note, source, raw_payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.scenarioKey,
      input.selectedUnitName,
      input.suitabilityPct,
      input.note,
      input.source,
      JSON.stringify(input.rawPayload ?? null),
    );
    const idRows = await this.prisma.$queryRawUnsafe<Array<{ id: bigint | number }>>(
      `SELECT id FROM ${TACTIC_DECISION_TABLE} ORDER BY id DESC LIMIT 1`,
    );
    const idRaw = idRows[0]?.id ?? 0;
    const id = typeof idRaw === 'bigint' ? Number(idRaw) : Number(idRaw);
    return {
      ok: true,
      id,
      savedAt: new Date().toISOString(),
    };
  }

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
        prevFrameId:
          typeof ai.autoPrevFrameId === 'string' ? ai.autoPrevFrameId : undefined,
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

      const futureLatLng = futureEgoSamplesToLatLngPath(
        radarLat,
        radarLng,
        ai.futureTrajectoryEgoM,
      );
      const motionTrack =
        futureLatLng.length >= 2 ? trackFromLatLngPath(futureLatLng) : null;
      snapshot.fmcw.track =
        motionTrack ??
        trackWithDopplerExtrapolation(radarLat, radarLng, mapped[0]!);

      snapshot.fmcw.meta.liveRun = { ok: true, ...liveRunBase };
      const insightsBase = buildInsightsFromAi(ai);
      const rootHint =
        typeof ai.autoDatasetRoot === 'string' ? ai.autoDatasetRoot : '';
      const fid = typeof ai.autoFrameId === 'string' ? ai.autoFrameId : '';

      const motionCorridorZones =
        futureLatLng.length > 0
          ? (() => {
              const poly = buildTrajectoryCorridorPolygon(
                radarLat,
                radarLng,
                futureLatLng,
                28,
              );
              if (poly.length < 3) return [];
              const lvl = insightsBase.ruleBasedRiskPrimary?.level ?? '—';
              return [
                {
                  id: 'risk-motion-corridor',
                  label: '속도 외삽 진행 복도 (1위 레이더 후보)',
                  rationale: `직전 프레임과의 DBSCAN 중심 연관으로 추정한 속도를 일정 시간 외삽한 도달 가능 구역(폭 약 56m). 규칙 기반 위험 등급: ${lvl}.`,
                  polygon: poly,
                },
              ];
            })()
          : [];

      let mergedInsights: RadarInsightsDto = {
        ...insightsBase,
        futureTrajectoryLatLng:
          futureLatLng.length > 0 ? futureLatLng : undefined,
      };

      if (rootHint && fid) {
        const raw0 = rawList[0] as Record<string, unknown>;
        const cmRaw = raw0?.centroidM;
        const cm = Array.isArray(cmRaw)
          ? cmRaw.map((x) => Number(x))
          : [];
        const centroidOk = cm.length >= 2 && cm.every((n) => Number.isFinite(n));
        try {
          const enrich = await buildVodLiveEnrichment({
            root: rootHint,
            frameId: fid,
            syncedFrameCount:
              typeof ai.autoSyncedFrameCount === 'number'
                ? ai.autoSyncedFrameCount
                : undefined,
            primaryCentroidM: centroidOk ? cm : undefined,
            radarLat,
            radarLng,
            primaryDetLat: mapped[0]!.lat,
            primaryDetLng: mapped[0]!.lng,
            primaryRangeM: mapped[0]!.rangeM,
            dopplerMps: mapped[0]!.dopplerMps,
          });
          const storyExtra =
            motionCorridorZones.length > 0
              ? ' 지도의 추가 복도형 영역은 연속 레이더 프레임 속도 외삽 경로입니다.'
              : '';
          mergedInsights = {
            ...mergedInsights,
            vodProvenance: {
              ...enrich.vodProvenance,
              pipelineLine:
                'VoD 동기 프레임 → DBSCAN + (가능 시) 직전 프레임과 중심 매칭으로 속도·헤딩 + YOLO(카메라) + LiDAR 상위 후보 ROI 교차검증 + 규칙 기반 위험도.',
            },
            vodMatchedTarget: enrich.vodMatchedTarget,
            vodRiskZones: [...enrich.vodRiskZones, ...motionCorridorZones],
            vodStoryParagraph: enrich.vodStoryParagraph + storyExtra,
          };
          if (enrich.vodMatchedTarget?.className) {
            mergedInsights.conclusionBullets = [
              ...(mergedInsights.conclusionBullets ?? []),
              `3D 라벨 정합: "${enrich.vodMatchedTarget.className}" · 박스 헤딩(ego XY) 약 ${enrich.vodMatchedTarget.headingDegEgoXY ?? '—'}°`,
            ];
          }
        } catch {
          mergedInsights = {
            ...mergedInsights,
            vodRiskZones: motionCorridorZones,
          };
        }
      } else if (motionCorridorZones.length > 0) {
        mergedInsights = {
          ...mergedInsights,
          vodRiskZones: motionCorridorZones,
        };
      }
      snapshot.fmcw.insights = mergedInsights;
      snapshot.fmcw.meta.methodology = {
        ...snapshot.fmcw.meta.methodology,
        demoImplementationNote:
          'FMCW 탐지는 Nest → FastAPI VoD 융합 파이프라인입니다: DBSCAN, 동일 프레임 YOLO·LiDAR 교차검증, (동기 목록에서) 직전 프레임 레이더와의 연관으로 속도·진행 복도·규칙 위험도를 산출합니다.',
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
