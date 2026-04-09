import { useEffect, useRef, useState } from 'react'

type KakaoMap = {
  setBounds: (
    bounds: unknown,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number,
  ) => void
}

type KakaoPolygonInstance = {
  setMap: (map: KakaoMap | null) => void
}

type KakaoCustomOverlayInstance = {
  setMap: (map: KakaoMap | null) => void
}

type KakaoMapsApi = {
  load: (callback: () => void) => void
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (southWest: unknown, northEast: unknown) => unknown
  Map: new (
    container: HTMLElement,
    options: {
      center: unknown
      level: number
    },
  ) => KakaoMap
  Polygon: new (options: {
    path: unknown[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
  }) => KakaoPolygonInstance
  CustomOverlay: new (options: {
    position: unknown
    content: HTMLElement
    yAnchor?: number
    xAnchor?: number
    zIndex?: number
  }) => KakaoCustomOverlayInstance
}

type EventLogItem = {
  id: string
  at: string
  level: '경고' | '주의' | '정보'
  text: string
}

/** 시연용 단순 폐곡선 (강서구 대략 경계) */
const GANGSEO_GU_PATH: { lat: number; lng: number }[] = [
  { lat: 37.598, lng: 126.72 },
  { lat: 37.598, lng: 126.87 },
  { lat: 37.518, lng: 126.87 },
  { lat: 37.518, lng: 126.72 },
]

const MOCK_EVENTS: EventLogItem[] = [
  {
    id: 'e1',
    at: '2026-03-24 14:32:11',
    level: '경고',
    text: '강서구 일대 SAR 기반 이동 흔적 다발 — 경보 구역 자동 설정',
  },
  {
    id: 'e2',
    at: '2026-03-24 14:32:18',
    level: '경고',
    text: '대규모 차량 열 이동 추정 (도로망 상관)',
  },
  {
    id: 'e3',
    at: '2026-03-24 14:33:02',
    level: '주의',
    text: 'UAV SAR 임무 큐에 강서 권역 감시 태스크 삽입 (우선순위 상향)',
  },
  {
    id: 'e4',
    at: '2026-03-24 14:33:40',
    level: '정보',
    text: '인접 레이다 커버리지와 트랙 융합 대기',
  },
]

export function AlertZonePage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY
    if (!mapContainerRef.current || !appKey) {
      setMapError('VITE_KAKAO_MAP_APP_KEY 가 설정되지 않았습니다.')
      return undefined
    }

    let alive = true
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-kakao-maps-sdk="true"]',
    )

    const mountMap = () => {
      const kakaoMaps = (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps
      if (!kakaoMaps || !mapContainerRef.current) return

      kakaoMaps.load(() => {
        if (!alive || !mapContainerRef.current) return
        mapContainerRef.current.innerHTML = ''

        const path = GANGSEO_GU_PATH.map((p) => new kakaoMaps.LatLng(p.lat, p.lng))
        const sw = new kakaoMaps.LatLng(37.518, 126.72)
        const ne = new kakaoMaps.LatLng(37.598, 126.87)
        const bounds = new kakaoMaps.LatLngBounds(sw, ne)

        const center = new kakaoMaps.LatLng(37.555, 126.825)
        const map = new kakaoMaps.Map(mapContainerRef.current, {
          center,
          level: 7,
        })
        map.setBounds(bounds, 48, 48, 48, 48)

        const polygon = new kakaoMaps.Polygon({
          path,
          strokeWeight: 2,
          strokeColor: '#dc2626',
          strokeOpacity: 0.95,
          fillColor: '#ef4444',
          fillOpacity: 0.22,
        })
        polygon.setMap(map)

        const label = document.createElement('div')
        label.className = 'alert-zone-map-label'
        label.innerHTML =
          '<strong>경보 구역</strong><span>서울 강서구 (단순화 경계)</span>'

        const labelOverlay = new kakaoMaps.CustomOverlay({
          position: center,
          content: label,
          yAnchor: 1.15,
          xAnchor: 0.5,
          zIndex: 10,
        })
        labelOverlay.setMap(map)
      })
    }

    if (existingScript && (window as Window & { kakao?: { maps?: KakaoMapsApi } }).kakao?.maps) {
      mountMap()
      return () => {
        alive = false
        if (mapContainerRef.current) mapContainerRef.current.innerHTML = ''
      }
    }

    const script = document.createElement('script')
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
    script.async = true
    script.dataset.kakaoMapsSdk = 'true'
    script.onload = mountMap
    document.head.appendChild(script)

    return () => {
      alive = false
      if (mapContainerRef.current) mapContainerRef.current.innerHTML = ''
    }
  }, [])

  return (
    <section className="page alert-zone-page">
      <h1>경보 구역 (강서구)</h1>
      <p className="muted">
        전차·대규모 차량 이동 또는 뚜렷한 이동 흔적이 탐지되면 해당 권역을 <strong>경보 구역</strong>으로 설정하고
        지도에 연한 적색으로 강조합니다. 이벤트 로그가 생성되고 후속 감시 자산 투입이 가능하도록 큐에 올리는 흐름을
        위험 권역·경로 표시.
      </p>

      <div className="alert-zone-layout">
        <aside className="alert-zone-log" aria-label="경보 이벤트 로그">
          <h2 className="alert-zone-log-title">이벤트 로그</h2>
          <ul className="alert-zone-log-list">
            {MOCK_EVENTS.map((ev) => (
              <li key={ev.id} className={`alert-zone-log-item alert-zone-log-item--${ev.level}`}>
                <time dateTime={ev.at.replace(' ', 'T')}>{ev.at}</time>
                <span className="alert-zone-log-badge">{ev.level}</span>
                <p>{ev.text}</p>
              </li>
            ))}
          </ul>
        </aside>
        <div className="alert-zone-map-wrap">
          {mapError && <p className="error">{mapError}</p>}
          <div ref={mapContainerRef} className="maplibre-container alert-zone-map-canvas" />
          <p className="muted alert-zone-map-note">
            빨간 영역: 강서구 경계 단순화 폴리곤 · 카카오맵 <code>Polygon</code> fill (투명도 약 22%)
          </p>
        </div>
      </div>
    </section>
  )
}
