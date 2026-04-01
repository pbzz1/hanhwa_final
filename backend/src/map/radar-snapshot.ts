/**
 * 데모용 이중 레이더 스냅샷 — 펄스(광역·점 표시) + FMCW(근거리·위상·방향·예측 궤적)
 */

export type RadarSiteDto = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  rangeMaxM: number;
  fovDeg: number;
  headingDeg: number;
  elevationBeamDeg: number;
};

/** 펄스 레이더 탐지 — 지도에는 점만 */
export type PulseDetectionDto = {
  id: string;
  lat: number;
  lng: number;
};

export type RadarDetectionDto = {
  id: string;
  lat: number;
  lng: number;
  rangeM: number;
  azimuthDeg: number;
  elevationDeg: number;
  dopplerMps: number;
  confidence: number;
  /** FMCW 위상(도) — 근거리 고해상도 */
  phaseDeg: number;
};

export type FmcwTrackDto = {
  /** 표적 예측 진행 방위(북 기준) */
  bearingDeg: number;
  /** 위상 기준선 대비(도) — 데모 각도 */
  phaseRefDeg: number;
  /** 예측 이동 경로(지도 폴리라인) */
  predictedPath: Array<{ lat: number; lng: number }>;
};

export type RadarMethodologyDto = {
  scenarioNote: string;
  poseAndDistanceNote: string;
  preprocessingNote: string;
  trainingNote: string;
  demoImplementationNote: string;
};

/** `source=live` 병합 시 Python DBSCAN·YOLO 파이프라인 실행 요약 */
export type FmcwLiveRunDto = {
  ok: boolean;
  frameId?: string;
  /** 연속 프레임 속도 추정에 사용한 직전 stem (있을 때) */
  prevFrameId?: string;
  inferMs?: number;
  radarPipeline?: string;
  radarPointCount?: number;
  error?: string;
};

export type VodProvenanceDto = {
  /** 로컬 절대 경로(민감하면 UI에서 잘라 표시 가능) */
  datasetRootHint?: string;
  syncedFrameCount?: number;
  dataSources: string[];
  pipelineLine: string;
};

export type VodMatchedTargetDto = {
  className?: string;
  matchDistanceM?: number;
  centerM?: [number, number, number];
  /** ego/LiDAR: +x 전방 기준 수평면 헤딩 근사(°) */
  headingDegEgoXY?: number;
  headingNote?: string;
  lengthM?: number;
  widthM?: number;
};

export type VodRiskZoneDto = {
  id: string;
  label: string;
  rationale: string;
  polygon: Array<{ lat: number; lng: number }>;
};

/** live 파이프라인에서 카메라·YOLO·LiDAR 검증까지 묶어 UI에 전달 */
export type RadarInsightsDto = {
  frameId?: string;
  yoloModel?: string;
  /** YOLO 오버레이 JPEG base64 (data URL 없이 raw) */
  annotatedImageBase64?: string | null;
  yoloDetections?: Array<{
    label: string;
    confidence: number;
    bbox: number[];
  }>;
  /** 면적 최대 박스 기준 주요 객체 */
  primaryObject?: { label: string; confidence: number } | null;
  lidarValidation?: {
    matched?: boolean;
    pointsInRoi?: number;
    deltaRangeM?: number | null;
    deltaBearingDeg?: number | null;
    verdict?: string;
    lidarClusterRangeM?: number | null;
    radarRangeM?: number | null;
    iouBevProxy?: number;
    meanDistanceM?: number | null;
  } | null;
  /** 획득 정보 요약 (불릿) */
  conclusionBullets?: string[];
  /** LiDAR 기하 검증 설명 (문장) */
  lidarReviewParagraph?: string;
  /** 카메라·3D 동기 시점 안내 */
  syncedViewNote?: string;
  /** VoD 루트·입력 파일·파이프라인 한 줄 */
  vodProvenance?: VodProvenanceDto;
  /** 레이더 1위 클러스터와 BEV 정합된 3D 라벨(있을 때) */
  vodMatchedTarget?: VodMatchedTargetDto | null;
  /** 지도 폴리곤(위험 부채꼴 등) */
  vodRiskZones?: VodRiskZoneDto[];
  /** 발표용 통합 내러티브 */
  vodStoryParagraph?: string;
  /** 상위 레이더 후보별 동일 프레임 LiDAR ROI 교차검증 */
  lidarCrossChecks?: Array<{
    rank: number;
    clusterId: string;
    matched?: boolean;
    pointsInRoi?: number;
    verdict?: string;
    deltaRangeM?: number | null;
    deltaBearingDeg?: number | null;
  }>;
  /** 연속 프레임(선택) 매칭·Δt 요약 */
  motionAnalysis?: {
    frameDeltaS?: number;
    trackGateM?: number;
    associations?: number;
    prevClusterCount?: number;
    note?: string;
  };
  /** 1위 후보 규칙 기반 위험도 */
  ruleBasedRiskPrimary?: {
    score?: number;
    level?: string;
    factors?: Record<string, number>;
  };
  /** 규칙 vs 향후 AI(weak label·의사 GT) 확장 메타 */
  riskModel?: { mode?: string; note?: string };
  /** ego m 단위 외삽 궤적을 지도 좌표로 투영한 폴리라인 */
  futureTrajectoryLatLng?: Array<{ lat: number; lng: number }>;
};

export type RadarSnapshotDto = {
  pulse: {
    radar: RadarSiteDto;
    detections: PulseDetectionDto[];
  };
  fmcw: {
    radar: RadarSiteDto;
    meta: {
      sensor: 'FMCW';
      representationNote: string;
      vodReferenceNote: string;
      methodology: RadarMethodologyDto;
      liveRun?: FmcwLiveRunDto | null;
    };
    detections: RadarDetectionDto[];
    /** 주 표적에 대한 예측 궤적·방위(없으면 null) */
    track: FmcwTrackDto | null;
    insights?: RadarInsightsDto | null;
  };
};

export function polarToLatLng(
  originLat: number,
  originLng: number,
  rangeM: number,
  azimuthDegFromNorth: number,
): { lat: number; lng: number } {
  const rad = (azimuthDegFromNorth * Math.PI) / 180;
  const dN = rangeM * Math.cos(rad);
  const dE = rangeM * Math.sin(rad);
  const lat = originLat + dN / 111320;
  const lng = originLng + dE / (111320 * Math.cos((originLat * Math.PI) / 180));
  return { lat, lng };
}
