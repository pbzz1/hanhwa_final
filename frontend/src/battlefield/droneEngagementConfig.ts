/**
 * 드론 EO/IR 표적 판별 거리 정책 — 사거리·룰 변경 시 이 파일만 수정하면 됩니다.
 *
 * - 전장 서비스(MapLibre): 드론 현재 위치 ↔ 가장 가까운 적 MBT 가상 표적 간 거리 기준
 * - 대대 시뮬(카카오): C2~주 적 거리가 이 값 이하일 때 드론 출동·촬영 단계로 표현(SCENARIO_RANGES_KM)
 */
export const DRONE_ENEMY_IDENTIFICATION_RANGE_KM = 50
