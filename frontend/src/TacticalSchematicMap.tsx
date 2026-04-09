import { bearingDeg } from './radarGeo'
import { DMZ_PARALLEL_38_N } from './scenarioBattalion'

export type SchematicBounds = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

type Props = {
  bounds: SchematicBounds
  c2: { lat: number; lng: number }
  /** null — 전술 제압 등으로 표적 미표시 */
  enemy: { lat: number; lng: number } | null
  enemyDistanceKm: number | null
  fmcwInRange: boolean
  c2Name: string
  enemyName: string
}

const VB_W = 520
const VB_H = 380
const PAD = 36

function project(
  lat: number,
  lng: number,
  b: SchematicBounds,
  w: number,
  h: number,
  pad: number,
): { x: number; y: number } {
  const iw = w - 2 * pad
  const ih = h - 2 * pad
  const dLat = b.maxLat - b.minLat || 1e-6
  const dLng = b.maxLng - b.minLng || 1e-6
  const x = pad + ((lng - b.minLng) / dLng) * iw
  const y = pad + (1 - (lat - b.minLat) / dLat) * ih
  return { x, y }
}

/**
 * 카카오 타일 없이 위·경도만 투영한 초간소 전술 도식 (잡음 최소화)
 */
export function TacticalSchematicMap({
  bounds,
  c2,
  enemy,
  enemyDistanceKm,
  fmcwInRange,
  c2Name,
  enemyName,
}: Props) {
  const hasEnemy = enemy != null
  const pc = project(c2.lat, c2.lng, bounds, VB_W, VB_H, PAD)
  const pe = hasEnemy ? project(enemy.lat, enemy.lng, bounds, VB_W, VB_H, PAD) : pc
  const pDmzLeft = project(DMZ_PARALLEL_38_N, bounds.minLng, bounds, VB_W, VB_H, PAD)
  const pDmzRight = project(DMZ_PARALLEL_38_N, bounds.maxLng, bounds, VB_W, VB_H, PAD)

  const brg = hasEnemy ? bearingDeg(c2.lat, c2.lng, enemy.lat, enemy.lng) : 0
  const rMax = Math.min(VB_W, VB_H) * 0.42
  const rFmcw = rMax * 0.34

  const wedge = (r: number, openDeg: number) => {
    const rad = ((brg - 90) * Math.PI) / 180
    const half = ((openDeg / 2) * Math.PI) / 180
    const x1 = pc.x + r * Math.cos(rad - half)
    const y1 = pc.y + r * Math.sin(rad - half)
    const x2 = pc.x + r * Math.cos(rad + half)
    const y2 = pc.y + r * Math.sin(rad + half)
    return `M ${pc.x} ${pc.y} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`
  }

  const distHudW = 128
  const distHudH = 44
  const distHudX = VB_W - 10 - distHudW
  const distHudY = 10
  const distText = enemyDistanceKm == null ? '—' : `${enemyDistanceKm.toFixed(1)} km`

  return (
    <div className="tactical-schematic">
      <svg
        className="tactical-schematic__svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="간소화된 남북 교전 축 도식"
      >
        <defs>
          <pattern id="schematic-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={VB_W} height={VB_H} fill="url(#schematic-grid)" opacity={0.55} />
        <rect width={VB_W} height={VB_H} fill="#f8fafc" opacity={0.88} />

        <line
          x1={pDmzLeft.x}
          y1={pDmzLeft.y}
          x2={pDmzRight.x}
          y2={pDmzRight.y}
          stroke="#f97316"
          strokeWidth="2"
          strokeDasharray="10 7"
          opacity={0.9}
        />
        <text
          x={(pDmzLeft.x + pDmzRight.x) / 2 + 8}
          y={(pDmzLeft.y + pDmzRight.y) / 2 - 6}
          fill="#c2410c"
          fontSize="11"
          fontWeight="700"
        >
          휴전선(북위 38° 근사)
        </text>

        {fmcwInRange && hasEnemy && (
          <path
            d={wedge(rFmcw, 48)}
            fill="rgba(56, 189, 248, 0.14)"
            stroke="rgba(14, 165, 233, 0.55)"
            strokeWidth="1.4"
          />
        )}

        {hasEnemy && (
          <line
            x1={pc.x}
            y1={pc.y}
            x2={pe.x}
            y2={pe.y}
            stroke="#eab308"
            strokeWidth="2.2"
            strokeOpacity={0.85}
          />
        )}

        <circle cx={pc.x} cy={pc.y} r="11" fill="#facc15" stroke="#854d0e" strokeWidth="2" />
        {hasEnemy && (
          <circle cx={pe.x} cy={pe.y} r="10" fill="#b91c1c" stroke="#fff" strokeWidth="2" />
        )}

        <text x={pc.x} y={pc.y + 26} textAnchor="middle" fill="#713f12" fontSize="10" fontWeight="800">
          C2
        </text>
        {hasEnemy ? (
          <text x={pe.x} y={pe.y - 16} textAnchor="middle" fill="#7f1d1d" fontSize="10" fontWeight="800">
            적
          </text>
        ) : (
          <text x={VB_W / 2} y={PAD + 48} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">
            표적 없음 (제압·미식별)
          </text>
        )}

        <text x={PAD} y={22} fill="#334155" fontSize="11" fontWeight="800">
          북 ↑
        </text>

        <g
          className="tactical-schematic__dist-hud"
          role="group"
          aria-label={`C2와 적 사이 거리 ${distText}`}
        >
          <rect
            x={distHudX}
            y={distHudY}
            width={distHudW}
            height={distHudH}
            rx={8}
            ry={8}
            fill="rgba(255, 255, 255, 0.94)"
            stroke="#cbd5e1"
            strokeWidth="1.2"
          />
          <text
            x={distHudX + distHudW / 2}
            y={distHudY + 17}
            textAnchor="middle"
            fill="#64748b"
            fontSize="10"
            fontWeight="700"
          >
            C2 ↔ 적 거리
          </text>
          <text
            x={distHudX + distHudW / 2}
            y={distHudY + 36}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="14"
            fontWeight="800"
          >
            {distText}
          </text>
        </g>
      </svg>

      <dl className="tactical-schematic__legend">
        <div>
          <dt>방위(C2→적)</dt>
          <dd>{brg.toFixed(0)}° (북 기준)</dd>
        </div>
        <div>
          <dt>C2</dt>
          <dd>{c2Name}</dd>
        </div>
        <div>
          <dt>표적</dt>
          <dd>{enemyName}</dd>
        </div>
      </dl>
    </div>
  )
}

export function computeSchematicBounds(
  c2: { lat: number; lng: number },
  enemyPath: { lat: number; lng: number }[],
): SchematicBounds {
  const pts = [c2, ...enemyPath]
  let minLat = Math.min(...pts.map((p) => p.lat))
  let maxLat = Math.max(...pts.map((p) => p.lat))
  let minLng = Math.min(...pts.map((p) => p.lng))
  let maxLng = Math.max(...pts.map((p) => p.lng))
  minLat = Math.min(minLat, DMZ_PARALLEL_38_N - 0.04)
  maxLat = Math.max(maxLat, DMZ_PARALLEL_38_N + 0.04)
  const padLat = (maxLat - minLat) * 0.12 || 0.06
  const padLng = (maxLng - minLng) * 0.12 || 0.06
  return {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
  }
}
