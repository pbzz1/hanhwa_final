/**
 * 작전 지역 이름 검색 → 지도 fitBounds / flyTo
 * 외부 지오코딩 API 없이 데모용 고정 목록(한반도·주요 도시·접경 등)
 */

export type OpsRegionSearchHit =
  | {
      kind: 'fitBounds'
      label: string
      west: number
      south: number
      east: number
      north: number
      maxZoom?: number
    }
  | {
      kind: 'center'
      label: string
      lng: number
      lat: number
      zoom: number
    }

type CatalogRow = { aliases: string[]; hit: OpsRegionSearchHit }

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·•.,]/g, '')
}

/** 점수 높을수록 우선(정확 일치 > 부분 일치) */
function scoreMatch(queryNorm: string, aliasNorm: string): number {
  if (!queryNorm || !aliasNorm) return 0
  if (queryNorm === aliasNorm) return 10000 + aliasNorm.length
  if (aliasNorm.startsWith(queryNorm)) return 5000 + aliasNorm.length
  if (queryNorm.startsWith(aliasNorm)) return 4000 + aliasNorm.length
  if (queryNorm.includes(aliasNorm)) return 2000 + aliasNorm.length
  if (aliasNorm.includes(queryNorm)) return 1000 + queryNorm.length
  return 0
}

const ROWS: CatalogRow[] = [
  {
    aliases: [
      '한반도',
      '대한민국',
      '남한',
      '한국',
      '작전구역',
      '작전권역',
      '한반도작전구역',
      '한반도작전권역',
      'korea',
      'rok',
      'southkorea',
    ],
    hit: {
      kind: 'fitBounds',
      label: '한반도 작전권역',
      west: 124.5,
      south: 33.9,
      east: 131.5,
      north: 38.9,
      maxZoom: 8.2,
    },
  },
  {
    aliases: ['38선', '휴전선', 'dmz', '군사분계선', '비무장지대', '접경'],
    hit: {
      kind: 'fitBounds',
      label: '군사분계선(MDL) 일대',
      west: 126.55,
      south: 37.72,
      east: 127.45,
      north: 38.42,
      maxZoom: 10.5,
    },
  },
  {
    aliases: ['동해안', '강원동해', '동해'],
    hit: {
      kind: 'fitBounds',
      label: '동해안',
      west: 128.35,
      south: 35.95,
      east: 130.05,
      north: 38.75,
      maxZoom: 8.4,
    },
  },
  {
    aliases: ['서해안', '서해'],
    hit: {
      kind: 'fitBounds',
      label: '서해안',
      west: 124.85,
      south: 33.95,
      east: 127.05,
      north: 37.95,
      maxZoom: 8.2,
    },
  },
  {
    aliases: ['서울', '서울특별시', '수도'],
    hit: { kind: 'center', label: '서울', lng: 126.978, lat: 37.5665, zoom: 11.2 },
  },
  {
    aliases: ['부산', '부산광역시'],
    hit: { kind: 'center', label: '부산', lng: 129.0756, lat: 35.1796, zoom: 11 },
  },
  {
    aliases: ['대구', '대구광역시'],
    hit: { kind: 'center', label: '대구', lng: 128.6014, lat: 35.8714, zoom: 11 },
  },
  {
    aliases: ['인천', '인천광역시'],
    hit: { kind: 'center', label: '인천', lng: 126.7052, lat: 37.4563, zoom: 11 },
  },
  {
    aliases: ['광주', '광주광역시'],
    hit: { kind: 'center', label: '광주', lng: 126.8526, lat: 35.1595, zoom: 11 },
  },
  {
    aliases: ['대전'],
    hit: { kind: 'center', label: '대전', lng: 127.3845, lat: 36.3504, zoom: 11 },
  },
  {
    aliases: ['울산'],
    hit: { kind: 'center', label: '울산', lng: 129.3114, lat: 35.5384, zoom: 11 },
  },
  {
    aliases: ['수원', '경기도청', '용인'],
    hit: { kind: 'center', label: '수원·경기 남부', lng: 127.0286, lat: 37.2636, zoom: 10.6 },
  },
  {
    aliases: ['강릉', '동해시', '삼척'],
    hit: { kind: 'center', label: '강릉·동해', lng: 128.8761, lat: 37.7519, zoom: 10.4 },
  },
  {
    aliases: ['전주'],
    hit: { kind: 'center', label: '전주', lng: 127.148, lat: 35.8242, zoom: 11 },
  },
  {
    aliases: ['제주', '제주도'],
    hit: { kind: 'center', label: '제주', lng: 126.5312, lat: 33.4996, zoom: 10.2 },
  },
  {
    aliases: ['창원', '경남'],
    hit: { kind: 'center', label: '창원', lng: 128.6819, lat: 35.2279, zoom: 10.8 },
  },
  {
    aliases: ['포항', '경북'],
    hit: { kind: 'center', label: '포항', lng: 129.3435, lat: 36.019, zoom: 10.8 },
  },
  {
    aliases: ['군산', '전북'],
    hit: { kind: 'center', label: '군산', lng: 126.7369, lat: 35.9679, zoom: 10.8 },
  },
  {
    aliases: ['춘천', '강원'],
    hit: { kind: 'center', label: '춘천', lng: 127.7348, lat: 37.8813, zoom: 10.4 },
  },
  {
    aliases: ['청주', '충북'],
    hit: { kind: 'center', label: '청주', lng: 127.4892, lat: 36.6424, zoom: 10.8 },
  },
  {
    aliases: ['평택', '오산', '미군'],
    hit: { kind: 'center', label: '평택·오산', lng: 127.1147, lat: 36.9901, zoom: 10.6 },
  },
  {
    aliases: ['평양'],
    hit: { kind: 'center', label: '평양', lng: 125.7625, lat: 39.0392, zoom: 10.5 },
  },
  {
    aliases: ['원산'],
    hit: { kind: 'center', label: '원산', lng: 127.4433, lat: 39.1526, zoom: 10.4 },
  },
  {
    aliases: ['함흥'],
    hit: { kind: 'center', label: '함흥', lng: 127.5064, lat: 39.7017, zoom: 10.4 },
  },
  {
    aliases: ['신의주', '의주'],
    hit: { kind: 'center', label: '신의주', lng: 124.3981, lat: 40.1006, zoom: 10.2 },
  },
  {
    aliases: ['남포', '남포시'],
    hit: { kind: 'center', label: '남포', lng: 125.4037, lat: 38.7315, zoom: 10.4 },
  },
  {
    aliases: ['혜산'],
    hit: { kind: 'center', label: '혜산', lng: 128.1775, lat: 41.4017, zoom: 10.2 },
  },
  {
    aliases: ['청진'],
    hit: { kind: 'center', label: '청진', lng: 129.775, lat: 41.7953, zoom: 10.2 },
  },
  {
    aliases: ['라진', '나진'],
    hit: { kind: 'center', label: '라진', lng: 130.3809, lat: 42.3469, zoom: 10 },
  },
]

export function resolveOpsRegionSearch(rawQuery: string): OpsRegionSearchHit | null {
  const queryNorm = norm(rawQuery)
  if (!queryNorm) return null

  let best: { score: number; hit: OpsRegionSearchHit } | null = null
  for (const row of ROWS) {
    for (const alias of row.aliases) {
      const s = scoreMatch(queryNorm, norm(alias))
      if (s > 0 && (!best || s > best.score)) {
        best = { score: s, hit: row.hit }
      }
    }
  }
  return best?.hit ?? null
}

export function opsRegionSearchHints(): string[] {
  const set = new Set<string>()
  for (const row of ROWS) {
    for (const a of row.aliases) {
      if (a.length <= 12) set.add(a)
    }
  }
  return [...set].slice(0, 24)
}
