import { useEffect, useRef } from 'react'
import { BATTALION_SCENARIO } from './scenarioBattalion'

type KakaoMap = { setBounds: (b: unknown, ...p: number[]) => void; setZoomable: (z: boolean) => void }
type KakaoMapsApi = {
  load: (cb: () => void) => void
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown
  Map: new (el: HTMLElement, o: { center: unknown; level: number }) => KakaoMap
  Circle: new (o: {
    center: unknown
    radius: number
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
    zIndex?: number
  }) => { setMap: (m: KakaoMap | null) => void }
  Polygon: new (o: {
    path: unknown[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
    zIndex?: number
  }) => { setMap: (m: KakaoMap | null) => void }
  CustomOverlay: new (o: {
    map: KakaoMap
    position: unknown
    yAnchor: number
    xAnchor: number
    content: HTMLElement
    zIndex?: number
  }) => void
}

const SAR_LEVEL = 11

type Props = {
  onContinue?: () => void
  /** SensorPageLayout 안에 넣을 때 헤더·바깥 여백 축소 */
  embedded?: boolean
  embeddedTitle?: string
  showContinueButton?: boolean
}

/**
 * SAR 전·후 2장 — 정지 관측 vs 변화(전차 신호 소실 구역 박스)
 */
export function SarComparePhase({
  onContinue = () => {},
  embedded = false,
  embeddedTitle = '전·후 SAR 타일 비교 (데모)',
  showContinueButton = true,
}: Props) {
  const beforeRef = useRef<HTMLDivElement | null>(null)
  const afterRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY
    if (!beforeRef.current || !afterRef.current || !appKey) return

    let alive = true
    const b = BATTALION_SCENARIO.sarCompareBounds
    const zone = BATTALION_SCENARIO.sarTankLossZones[0]
    if (!zone) return

    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-maps-sdk="true"]')

    const buildMaps = () => {
      const kakaoMaps = (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps
      if (!alive || !kakaoMaps || !beforeRef.current || !afterRef.current) return

      kakaoMaps.load(() => {
        if (!alive || !beforeRef.current || !afterRef.current) return
        beforeRef.current.innerHTML = ''
        afterRef.current.innerHTML = ''

        const sw = new kakaoMaps.LatLng(b.sw.lat, b.sw.lng)
        const ne = new kakaoMaps.LatLng(b.ne.lat, b.ne.lng)
        const center = new kakaoMaps.LatLng((b.sw.lat + b.ne.lat) / 2, (b.sw.lng + b.ne.lng) / 2)

        const mkMap = (el: HTMLElement) => {
          const m = new kakaoMaps.Map(el, { center, level: SAR_LEVEL }) as KakaoMap
          m.setBounds(new kakaoMaps.LatLngBounds(sw, ne), 24, 24, 24, 24)
          m.setZoomable(false)
          return m
        }

        const mapBefore = mkMap(beforeRef.current)
        const mapAfter = mkMap(afterRef.current)

        const zc = new kakaoMaps.LatLng(zone.lat, zone.lng)

        const tankBefore = new kakaoMaps.Circle({
          center: zc,
          radius: 650,
          strokeWeight: 2,
          strokeColor: '#22c55e',
          strokeOpacity: 0.85,
          fillColor: '#86efac',
          fillOpacity: 0.35,
          zIndex: 3,
        })
        tankBefore.setMap(mapBefore)

        const lblB = document.createElement('div')
        lblB.className = 'sar-compare-chip sar-compare-chip--before'
        lblB.textContent = '전차 (정지·관측)'
        new kakaoMaps.CustomOverlay({
          map: mapBefore,
          position: zc,
          yAnchor: 2.1,
          xAnchor: 0.5,
          content: lblB,
          zIndex: 8,
        })

        const dLat = 0.022
        const dLng = 0.026
        const rectPath = [
          new kakaoMaps.LatLng(zone.lat - dLat, zone.lng - dLng),
          new kakaoMaps.LatLng(zone.lat - dLat, zone.lng + dLng),
          new kakaoMaps.LatLng(zone.lat + dLat, zone.lng + dLng),
          new kakaoMaps.LatLng(zone.lat + dLat, zone.lng - dLng),
        ]
        const lossBox = new kakaoMaps.Polygon({
          path: rectPath,
          strokeWeight: 3,
          strokeColor: '#dc2626',
          strokeOpacity: 0.95,
          fillColor: '#fecaca',
          fillOpacity: 0.22,
          zIndex: 2,
        })
        lossBox.setMap(mapAfter)

        const lblA = document.createElement('div')
        lblA.className = 'sar-compare-chip sar-compare-chip--after'
        lblA.textContent = '전차 신호 소실 (변화분석)'
        new kakaoMaps.CustomOverlay({
          map: mapAfter,
          position: zc,
          yAnchor: 2.35,
          xAnchor: 0.5,
          content: lblA,
          zIndex: 8,
        })
      })
    }

    if (existing && (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps) {
      buildMaps()
    } else {
      const script = document.createElement('script')
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
      script.async = true
      script.dataset.kakaoMapsSdk = 'true'
      script.onload = buildMaps
      document.head.appendChild(script)
    }

    return () => {
      alive = false
      if (beforeRef.current) beforeRef.current.innerHTML = ''
      if (afterRef.current) afterRef.current.innerHTML = ''
    }
  }, [])

  return (
    <div className={`sar-compare-phase${embedded ? ' sar-compare-phase--embedded' : ''}`}>
      {!embedded && (
        <div className="sar-compare-phase__head">
          <h2 className="sar-compare-phase__title">1단계 · SAR 변화분석 (북측 전차)</h2>
          <p className="muted sar-compare-phase__lead">
            좌측은 <strong>관측 전</strong> 정지 SAR, 우측은 <strong>관측 후</strong> 동일 지역에서 전차급 신호가 사라진 구역을{' '}
            <strong>빨간 박스</strong>로 표시합니다.
          </p>
        </div>
      )}
      {embedded && (
        <h3 className="sar-compare-phase__embed-title">{embeddedTitle}</h3>
      )}
      <div className="sar-compare-grid">
        <div className="sar-compare-col">
          <h3 className="sar-compare-col__title">관측 전 (기준)</h3>
          <div ref={beforeRef} className="maplibre-container sar-compare-map" />
        </div>
        <div className="sar-compare-col">
          <h3 className="sar-compare-col__title">관측 후 (변화)</h3>
          <div ref={afterRef} className="maplibre-container sar-compare-map" />
        </div>
      </div>
      {showContinueButton && (
        <div className="sar-compare-actions">
          <button type="button" className="btn-primary" onClick={onContinue}>
            다음: 무인기(UAV) SAR 추적
          </button>
        </div>
      )}
    </div>
  )
}
