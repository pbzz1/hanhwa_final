import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import type maplibregl from 'maplibre-gl'
import type { RiskGeoJsonBundle } from '../../hooks/useRiskGeoJson'

const RISK_ZONE_SOURCE_ID = 'risk-e2e-zone-source'
const RISK_TRACK_SOURCE_ID = 'risk-e2e-track-source'

const RISK_ZONE_FILL_LAYER_ID = 'risk-e2e-zone-fill-layer'
const RISK_ZONE_LINE_LAYER_ID = 'risk-e2e-zone-line-layer'
const RISK_TRACK_LAYER_ID = 'risk-e2e-track-layer'

type RiskOverlayLayerProps = {
  mapRef: MutableRefObject<maplibregl.Map | null>
  mapReady: boolean
  geoJson: RiskGeoJsonBundle
  showRiskZones: boolean
  showRiskTracks: boolean
  onSelectCandidate: (id: string) => void
}

function setLayerVisibility(map: maplibregl.Map, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
}

export function RiskOverlayLayer({
  mapRef,
  mapReady,
  geoJson,
  showRiskZones,
  showRiskTracks,
  onSelectCandidate,
}: RiskOverlayLayerProps) {
  const onSelectRef = useRef(onSelectCandidate)
  onSelectRef.current = onSelectCandidate

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (!map.getSource(RISK_ZONE_SOURCE_ID)) {
      map.addSource(RISK_ZONE_SOURCE_ID, { type: 'geojson', data: geoJson.zones })
    }
    if (!map.getSource(RISK_TRACK_SOURCE_ID)) {
      map.addSource(RISK_TRACK_SOURCE_ID, { type: 'geojson', data: geoJson.tracks })
    }

    if (!map.getLayer(RISK_ZONE_FILL_LAYER_ID)) {
      map.addLayer({
        id: RISK_ZONE_FILL_LAYER_ID,
        type: 'fill',
        source: RISK_ZONE_SOURCE_ID,
        paint: {
          'fill-color': [
            'match',
            ['get', 'riskLabel'],
            'high',
            'rgba(239,68,68,0.28)',
            'medium',
            'rgba(249,115,22,0.24)',
            'rgba(250,204,21,0.2)',
          ],
          'fill-opacity': [
            'case',
            ['>=', ['to-number', ['coalesce', ['get', 'finalRiskScore'], 0]], 0.82],
            0.42,
            ['>=', ['to-number', ['coalesce', ['get', 'finalRiskScore'], 0]], 0.56],
            0.28,
            0.2,
          ],
        },
      })
    }
    if (!map.getLayer(RISK_ZONE_LINE_LAYER_ID)) {
      map.addLayer({
        id: RISK_ZONE_LINE_LAYER_ID,
        type: 'line',
        source: RISK_ZONE_SOURCE_ID,
        paint: {
          'line-color': [
            'match',
            ['get', 'riskLabel'],
            'high',
            '#ef4444',
            'medium',
            '#f97316',
            '#facc15',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['to-number', ['coalesce', ['get', 'finalRiskScore'], 0]],
            0.4,
            1.1,
            0.7,
            1.8,
            0.9,
            2.4,
          ],
          'line-opacity': 0.92,
        },
      })
    }
    if (!map.getLayer(RISK_TRACK_LAYER_ID)) {
      map.addLayer({
        id: RISK_TRACK_LAYER_ID,
        type: 'line',
        source: RISK_TRACK_SOURCE_ID,
        paint: {
          'line-color': [
            'match',
            ['get', 'riskLabel'],
            'high',
            '#f87171',
            'medium',
            '#fb923c',
            '#fde047',
          ],
          'line-width': 2.2,
          'line-opacity': 0.9,
          'line-dasharray': [1.2, 1.2],
        },
      })
    }

    const clickableLayers = [RISK_ZONE_FILL_LAYER_ID, RISK_ZONE_LINE_LAYER_ID] as const

    const onRiskClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) return
      const props = (feature.properties ?? {}) as Record<string, unknown>
      const id = String(props.id ?? '')
      if (!id) return
      onSelectRef.current(id)
    }
    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
    }

    for (const layerId of clickableLayers) {
      if (!map.getLayer(layerId)) continue
      map.on('click', layerId, onRiskClick)
      map.on('mouseenter', layerId, onMouseEnter)
      map.on('mouseleave', layerId, onMouseLeave)
    }

    return () => {
      for (const layerId of clickableLayers) {
        if (!map.getLayer(layerId)) continue
        map.off('click', layerId, onRiskClick)
        map.off('mouseenter', layerId, onMouseEnter)
        map.off('mouseleave', layerId, onMouseLeave)
      }
      map.getCanvas().style.cursor = ''
    }
  }, [mapReady, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const zoneSource = map.getSource(RISK_ZONE_SOURCE_ID)
    if (zoneSource && 'setData' in zoneSource) {
      ;(zoneSource as GeoJSONSource).setData(geoJson.zones as Parameters<GeoJSONSource['setData']>[0])
    }
    const trackSource = map.getSource(RISK_TRACK_SOURCE_ID)
    if (trackSource && 'setData' in trackSource) {
      ;(trackSource as GeoJSONSource).setData(geoJson.tracks as Parameters<GeoJSONSource['setData']>[0])
    }
  }, [geoJson, mapReady, mapRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    setLayerVisibility(map, RISK_ZONE_FILL_LAYER_ID, showRiskZones)
    setLayerVisibility(map, RISK_ZONE_LINE_LAYER_ID, showRiskZones)
    setLayerVisibility(map, RISK_TRACK_LAYER_ID, showRiskTracks)
  }, [mapReady, mapRef, showRiskTracks, showRiskZones])

  return null
}
