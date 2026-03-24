/**
 * 근거리 FMCW 레이더 스냅샷 (데모)
 * — VoD는 3+1D 레이더를 포인트 클라우드 등으로 제공; 여기서는 동일 물리량(R, Az, El, Doppler)을 API로 노출
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

export type RadarDetectionDto = {
  id: string;
  lat: number;
  lng: number;
  rangeM: number;
  azimuthDeg: number;
  elevationDeg: number;
  dopplerMps: number;
  confidence: number;
};

/** 발표·시연용 — 민간 차량 시나리오, 예측 파이프라인, 전처리·학습 개요 */
export type RadarMethodologyDto = {
  scenarioNote: string;
  poseAndDistanceNote: string;
  preprocessingNote: string;
  trainingNote: string;
  demoImplementationNote: string;
};

export type RadarSnapshotDto = {
  radar: RadarSiteDto;
  meta: {
    sensor: 'FMCW';
    representationNote: string;
    vodReferenceNote: string;
    methodology: RadarMethodologyDto;
  };
  detections: RadarDetectionDto[];
};

/** 방위각(북 기준 시계방향, 도)과 거리(m)로 위경도 오프셋 */
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
