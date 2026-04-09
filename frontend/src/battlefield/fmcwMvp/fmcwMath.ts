export type LatLng = { lat: number; lng: number }

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la = (a.lat * Math.PI) / 180
  const lb = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** GeoJSON 링 [lng, lat][] — 닫힌 링(첫점=끝점) */
export function ringCentroid(ring: [number, number][]): LatLng {
  const n = Math.max(1, ring.length - 1)
  let sumLng = 0
  let sumLat = 0
  for (let i = 0; i < n; i++) {
    sumLng += ring[i]![0]
    sumLat += ring[i]![1]
  }
  return { lng: sumLng / n, lat: sumLat / n }
}

export function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]
    const yi = ring[i]![1]
    const xj = ring[j]![0]
    const yj = ring[j]![1]
    const denom = yj - yi + 1e-14
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / denom + xi
    if (intersect) inside = !inside
  }
  return inside
}
