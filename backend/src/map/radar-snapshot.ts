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
    };
    detections: RadarDetectionDto[];
    /** 주 표적에 대한 예측 궤적·방위(없으면 null) */
    track: FmcwTrackDto | null;
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
