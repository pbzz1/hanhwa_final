import { useMemo } from 'react'
import type { RiskCandidateE2E } from '../types/risk'

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id?: string
    properties: Record<string, unknown>
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] }
      | { type: 'Polygon'; coordinates: [Array<[number, number]>] }
  }>
}

export type RiskGeoJsonBundle = {
  zones: GeoJsonFeatureCollection
  tracks: GeoJsonFeatureCollection
  tops: GeoJsonFeatureCollection
  selected: GeoJsonFeatureCollection
}

function metersToLat(radiusM: number): number {
  return radiusM / 111_320
}

function metersToLng(radiusM: number, latDeg: number): number {
  const cos = Math.max(0.25, Math.cos((latDeg * Math.PI) / 180))
  return radiusM / (111_320 * cos)
}

function buildCirclePolygon(lat: number, lng: number, radiusM: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const ringPoints = 28
  for (let i = 0; i <= ringPoints; i += 1) {
    const angle = (Math.PI * 2 * i) / ringPoints
    const dLat = metersToLat(radiusM) * Math.sin(angle)
    const dLng = metersToLng(radiusM, lat) * Math.cos(angle)
    points.push([lng + dLng, lat + dLat])
  }
  return points
}

export function useRiskGeoJson(
  candidates: RiskCandidateE2E[],
  topCandidates: RiskCandidateE2E[],
  selectedCandidateId: string | null,
  showSuppressionStage: boolean,
): RiskGeoJsonBundle {
  return useMemo(() => {
    const zoneFeatures: RiskGeoJsonBundle['zones']['features'] = candidates.map((row) => ({
      type: 'Feature',
      id: row.id,
      properties: {
        id: row.id,
        trackId: row.trackId,
        rankGlobal: row.rankGlobal,
        topTag: row.topTag ?? '',
        riskLabel: row.riskLabelFinal,
        finalRiskScore: row.finalRiskScore,
        pipelineMode: row.pipelineMode,
        suppressionStage: showSuppressionStage ? row.suppressionStage : '',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [buildCirclePolygon(row.lat, row.lng, row.radiusM)],
      },
    }))

    const tracksById = new Map<string, RiskCandidateE2E[]>()
    for (const row of candidates) {
      const bucket = tracksById.get(row.trackId)
      if (bucket) bucket.push(row)
      else tracksById.set(row.trackId, [row])
    }
    const trackFeatures: RiskGeoJsonBundle['tracks']['features'] = Array.from(tracksById.entries())
      .map(([trackId, rows]) => {
        const sorted = [...rows].sort((a, b) => a.frameOrder - b.frameOrder)
        if (sorted.length < 2) return null
        const tail = sorted[sorted.length - 1]!
        return {
          type: 'Feature' as const,
          id: `track-${trackId}`,
          properties: {
            id: `track-${trackId}`,
            trackId,
            riskLabel: tail.riskLabelFinal,
            rankGlobal: tail.rankGlobal,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: sorted.map((row) => [row.lng, row.lat] as [number, number]),
          },
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    const topFeatures: RiskGeoJsonBundle['tops']['features'] = topCandidates.map((row, idx) => ({
      type: 'Feature',
      id: `top-${row.id}`,
      properties: {
        id: row.id,
        rankLabel: String(idx + 1),
        rankGlobal: row.rankGlobal,
        topTag: row.topTag ?? '',
        riskLabel: row.riskLabelFinal,
        finalRiskScore: row.finalRiskScore,
      },
      geometry: {
        type: 'Point',
        coordinates: [row.lng, row.lat],
      },
    }))

    const selectedCandidate = selectedCandidateId
      ? candidates.find((row) => row.id === selectedCandidateId) ?? null
      : null
    const selectedFeatures: RiskGeoJsonBundle['selected']['features'] = selectedCandidate
      ? [
          {
            type: 'Feature',
            id: `selected-${selectedCandidate.id}`,
            properties: {
              id: selectedCandidate.id,
              riskLabel: selectedCandidate.riskLabelFinal,
            },
            geometry: {
              type: 'Point',
              coordinates: [selectedCandidate.lng, selectedCandidate.lat],
            },
          },
        ]
      : []

    return {
      zones: { type: 'FeatureCollection', features: zoneFeatures },
      tracks: { type: 'FeatureCollection', features: trackFeatures },
      tops: { type: 'FeatureCollection', features: topFeatures },
      selected: { type: 'FeatureCollection', features: selectedFeatures },
    }
  }, [candidates, selectedCandidateId, showSuppressionStage, topCandidates])
}
