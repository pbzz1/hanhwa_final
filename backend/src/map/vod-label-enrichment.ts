import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';

import { polarToLatLng } from './radar-snapshot';
import type {
  VodMatchedTargetDto,
  VodProvenanceDto,
  VodRiskZoneDto,
} from './radar-snapshot';

type Quat = { x: number; y: number; z: number; w: number };

function quatRotateUnitX(q: Quat): { vx: number; vy: number; vz: number } {
  const { x, y, z, w } = q;
  const vx = 1 - 2 * (y * y + z * z);
  const vy = 2 * (x * y + w * z);
  const vz = 2 * (x * z - w * y);
  return { vx, vy, vz };
}

/** VoD/KITTI velodyne: +x 전방, +y 좌측 — 수평면에서 길이축 방향 (deg) */
function headingDegEgoFromQuat(q: Quat): number {
  const { vx, vy } = quatRotateUnitX(q);
  const rad = Math.atan2(vy, vx);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Math.round(deg * 10) / 10;
}

function parseQuat(o: unknown): Quat | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  const z = Number(r.z);
  const w = Number(r.w);
  if ([x, y, z, w].some((n) => !Number.isFinite(n))) return null;
  return { x, y, z, w };
}

export type ParsedVodRadarLabel = {
  className: string;
  center: { x: number; y: number; z: number };
  length: number;
  width: number;
  height: number;
  headingDegEgoXY: number;
};

function parseLabelRecord(raw: unknown): ParsedVodRadarLabel | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const className = typeof o.className === 'string' ? o.className : 'object';
  const geom = o.geometry;
  if (!geom || typeof geom !== 'object') return null;
  const g = geom as Record<string, unknown>;
  const center = g.center;
  const quat = g.quaternion;
  const size = g.size;
  if (!center || typeof center !== 'object') return null;
  const c = center as Record<string, unknown>;
  const cx = Number(c.x);
  const cy = Number(c.y);
  const cz = Number(c.z);
  if (![cx, cy, cz].every((n) => Number.isFinite(n))) return null;
  let length = 4;
  let width = 2;
  let height = 1.5;
  if (size && typeof size === 'object') {
    const s = size as Record<string, unknown>;
    if (Number.isFinite(Number(s.length))) length = Number(s.length);
    if (Number.isFinite(Number(s.width))) width = Number(s.width);
    if (Number.isFinite(Number(s.height))) height = Number(s.height);
  }
  const q = parseQuat(quat);
  if (!q) return null;
  return {
    className,
    center: { x: cx, y: cy, z: cz },
    length,
    width,
    height,
    headingDegEgoXY: headingDegEgoFromQuat(q),
  };
}

export async function readVodRadarTrainingLabels(
  root: string,
  frameId: string,
): Promise<ParsedVodRadarLabel[]> {
  const p = path.join(root, 'radar', 'training', 'label_2', `${frameId}.json`);
  if (!existsSync(p)) return [];
  const text = await readFile(p, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ParsedVodRadarLabel[] = [];
  for (const row of data) {
    const one = parseLabelRecord(row);
    if (one) out.push(one);
  }
  return out;
}

export function matchLabelToClusterCentroid(
  labels: ParsedVodRadarLabel[],
  centroidM: number[],
  maxMatchM = 22,
): ParsedVodRadarLabel | null {
  if (!labels.length || centroidM.length < 2) return null;
  const cx = centroidM[0]!;
  const cy = centroidM[1]!;
  let best: ParsedVodRadarLabel | null = null;
  let bestD = Infinity;
  for (const L of labels) {
    const dx = L.center.x - cx;
    const dy = L.center.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = L;
    }
  }
  if (!best || bestD > maxMatchM) return null;
  return best;
}

function bearingGeographicDeg(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const dN = (toLat - fromLat) * 111320;
  const dE =
    (toLng - fromLng) * 111320 * Math.cos((fromLat * Math.PI) / 180);
  let deg = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** 레이더 기지 → 1위 탐지 방향으로 펼친 위험 부채꼴 (지도 폴리곤) */
export function buildRiskFanPolygonLatLng(
  radarLat: number,
  radarLng: number,
  bearingToTargetDeg: number,
  depthM: number,
  halfSpreadDeg = 14,
  arcSteps = 6,
): Array<{ lat: number; lng: number }> {
  const depth = Math.max(80, Math.min(depthM, 12_000));
  const pts: Array<{ lat: number; lng: number }> = [
    { lat: radarLat, lng: radarLng },
  ];
  const start = bearingToTargetDeg - halfSpreadDeg;
  const end = bearingToTargetDeg + halfSpreadDeg;
  for (let i = 0; i <= arcSteps; i += 1) {
    const t = i / arcSteps;
    const brg = start + (end - start) * t;
    pts.push(polarToLatLng(radarLat, radarLng, depth, brg));
  }
  return pts;
}

function offsetPerpendicularFromLatLng(
  lat: number,
  lng: number,
  segmentBearingDeg: number,
  distM: number,
  side: 1 | -1,
): { lat: number; lng: number } {
  const perp = segmentBearingDeg + 90 * side;
  return polarToLatLng(lat, lng, distM, perp);
}

/** 레이더 기지—속도 외삽 궤적에 폭을 준 진행 복도(위험·가능 영역) 폴리곤 */
export function buildTrajectoryCorridorPolygon(
  radarLat: number,
  radarLng: number,
  pathLatLng: Array<{ lat: number; lng: number }>,
  halfWidthM: number,
): Array<{ lat: number; lng: number }> {
  if (pathLatLng.length === 0) return [];
  const chain = [{ lat: radarLat, lng: radarLng }, ...pathLatLng];
  const w = Math.max(6, Math.min(halfWidthM, 220));
  const left: Array<{ lat: number; lng: number }> = [];
  const right: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const a = chain[i]!;
    const b = chain[i + 1]!;
    const brg = bearingGeographicDeg(a.lat, a.lng, b.lat, b.lng);
    left.push(offsetPerpendicularFromLatLng(a.lat, a.lng, brg, w, 1));
    right.push(offsetPerpendicularFromLatLng(a.lat, a.lng, brg, w, -1));
  }
  const last = chain[chain.length - 1]!;
  const prev = chain[chain.length - 2]!;
  const brgLast = bearingGeographicDeg(prev.lat, prev.lng, last.lat, last.lng);
  left.push(offsetPerpendicularFromLatLng(last.lat, last.lng, brgLast, w, 1));
  right.push(offsetPerpendicularFromLatLng(last.lat, last.lng, brgLast, w, -1));
  return [...left, ...[...right].reverse()];
}

export async function buildVodLiveEnrichment(args: {
  root: string;
  frameId: string;
  syncedFrameCount?: number;
  primaryCentroidM?: number[];
  radarLat: number;
  radarLng: number;
  primaryDetLat: number;
  primaryDetLng: number;
  primaryRangeM: number;
  dopplerMps: number;
}): Promise<{
  vodProvenance: VodProvenanceDto;
  vodMatchedTarget: VodMatchedTargetDto | null;
  vodRiskZones: VodRiskZoneDto[];
  vodStoryParagraph: string;
}> {
  const {
    root,
    frameId,
    syncedFrameCount,
    primaryCentroidM,
    radarLat,
    radarLng,
    primaryDetLat,
    primaryDetLng,
    primaryRangeM,
    dopplerMps,
  } = args;

  const labels = await readVodRadarTrainingLabels(root, frameId);
  const matched =
    primaryCentroidM && primaryCentroidM.length >= 2
      ? matchLabelToClusterCentroid(labels, primaryCentroidM)
      : null;

  const brgToDet = bearingGeographicDeg(
    radarLat,
    radarLng,
    primaryDetLat,
    primaryDetLng,
  );

  const depthRisk = Math.min(
    9000,
    Math.max(220, primaryRangeM * 1.35 + Math.abs(dopplerMps) * 40),
  );
  const riskPoly = buildRiskFanPolygonLatLng(
    radarLat,
    radarLng,
    brgToDet,
    depthRisk,
    16,
    8,
  );

  const vodRiskZones: VodRiskZoneDto[] = [
    {
      id: 'risk-fan-primary',
      label: '접근·교전 위험 부채꼴 (1위 레이더 후보 방향)',
      rationale: `레이더 기지에서 1위 클러스터 방위(약 ${brgToDet.toFixed(1)}°) 기준 ±16°, 최대 ${Math.round(depthRisk)}m 깊이. 도플러 ${dopplerMps.toFixed(2)}m/s 를 반영해 깊이를 가늠했습니다.`,
      polygon: riskPoly,
    },
  ];

  const dataSources = [
    `radar/training/velodyne/${frameId}.bin (VoD 3+1D, N×7)`,
    `lidar/training/image_2/${frameId}.jpg`,
    `lidar/training/velodyne/${frameId}.bin (동기 시 LiDAR)`,
  ];
  if (labels.length > 0) {
    dataSources.push(`radar/training/label_2/${frameId}.json (3D 라벨 ${labels.length}개)`);
  }

  const vodProvenance: VodProvenanceDto = {
    datasetRootHint: root,
    syncedFrameCount,
    dataSources,
    pipelineLine:
      'VoD 동기 프레임 → Python DBSCAN(기하 클러스터) + YOLO(카메라) + LiDAR ROI 검증. 신경망 검출 가중치는 YOLO만 해당하며, 레이더 1위 후보는 기하 기반입니다.',
  };

  let vodMatchedTarget: VodMatchedTargetDto | null = null;
  if (matched) {
    const dx = matched.center.x - (primaryCentroidM?.[0] ?? matched.center.x);
    const dy = matched.center.y - (primaryCentroidM?.[1] ?? matched.center.y);
    const matchDistanceM = Math.round(Math.hypot(dx, dy) * 100) / 100;
    vodMatchedTarget = {
      className: matched.className,
      matchDistanceM,
      centerM: [matched.center.x, matched.center.y, matched.center.z],
      headingDegEgoXY: matched.headingDegEgoXY,
      headingNote:
        'LiDAR 좌표계 기준 3D 박스 쿼터니언에서 길이축(+x)을 수평면에 투영한 방향(°). 전방=0°, 좌측=90° 근사.',
      lengthM: Math.round(matched.length * 100) / 100,
      widthM: Math.round(matched.width * 100) / 100,
    };
  }

  const dopNote =
    dopplerMps <= 0
      ? '도플러 음(·접근) — 레이더에 가까워지는 성분이 우세할 수 있음'
      : '도플러 양(·이탈) — 멀어지는 성분이 우세할 수 있음';

  const matchNote = vodMatchedTarget
    ? `라벨 "${vodMatchedTarget.className}" 이(가) 1위 클러스터와 BEV에서 약 ${vodMatchedTarget.matchDistanceM}m 떨어진 박스로 정합되었고, 수평 헤딩(ego XY) 약 ${vodMatchedTarget.headingDegEgoXY}° 입니다.`
    : '동일 stem의 label_2 가 없거나 BEV 거리가 커서 3D 박스 정합은 생략되었습니다.';

  const vodStoryParagraph =
    `이번 응답은 View-of-Delft KITTI 트리에서 **프레임 ${frameId}** 을 골라, ` +
    `레이더·카메라·(가능 시) LiDAR·JSON 라벨을 **같은 파일명(stem)** 으로 묶어 사용했습니다. ` +
    `${matchNote} ` +
    `지도의 주황 점선은 레이더 기지에서 1위 탐지까지의 시선·단기 외삽이며, 붉은 반투명 영역은 그 방향으로 펼친 **위험 부채꼴**입니다. ${dopNote}.`;

  return {
    vodProvenance,
    vodMatchedTarget,
    vodRiskZones,
    vodStoryParagraph,
  };
}
