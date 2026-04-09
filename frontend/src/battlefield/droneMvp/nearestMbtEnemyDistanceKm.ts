import { haversineKm, type LatLng } from '../fmcwMvp/fmcwMath'

export type MbtEnemyLike = { lat: number; lng: number; relation: string; kind: string }

/** 드론 위치에서 가장 가까운 적 MBT 표적까지의 거리(km). 없으면 null */
export function nearestMbtEnemyDistanceKm(
  drone: LatLng,
  entities: ReadonlyArray<MbtEnemyLike>,
): number | null {
  const targets = entities.filter((e) => e.relation === 'ENEMY' && e.kind === 'MBT')
  if (targets.length === 0) return null
  return Math.min(...targets.map((e) => haversineKm(drone, e)))
}
