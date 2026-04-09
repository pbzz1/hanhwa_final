import type { FmcwMockTrack } from './fmcwMockData'

type Props = {
  tracks: FmcwMockTrack[]
  bearingDeg: number
}

/** 근거리 레이더 BEV(탑뷰) mock — 자산·격자는 스타일만 */
export function FmcwBevPanel({ tracks, bearingDeg }: Props) {
  const blips = tracks.map((t, i) => {
    const angle = ((t.bearingDeg - bearingDeg + 180) % 360) - 180
    const rad = (angle * Math.PI) / 180
    const r = 28 + (i % 3) * 14
    const cx = 100 + Math.sin(rad) * r * 0.85
    const cy = 100 - Math.cos(rad) * r * 0.85
    return { t, cx, cy, i }
  })

  return (
    <div className="fmcw-bev-panel" aria-label="FMCW BEV mock">
      <div className="fmcw-bev-panel__chrome">
        <span className="fmcw-bev-panel__tag">BEV</span>
        <span className="fmcw-bev-panel__sub">Range–Azimuth (mock)</span>
      </div>
      <svg className="fmcw-bev-panel__svg" viewBox="0 0 200 200" role="img" aria-hidden>
        <defs>
          <radialGradient id="fmcw-bev-radar" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="rgba(249, 115, 22, 0.14)" />
            <stop offset="70%" stopColor="rgba(15, 23, 42, 0.35)" />
            <stop offset="100%" stopColor="rgba(2, 6, 23, 0.92)" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill="url(#fmcw-bev-radar)" rx="8" />
        {[0, 1, 2, 3].map((i) => (
          <ellipse
            key={i}
            cx="100"
            cy="110"
            rx={35 + i * 22}
            ry={30 + i * 20}
            fill="none"
            stroke="rgba(251, 191, 36, 0.12)"
            strokeWidth="1"
          />
        ))}
        <line x1="100" y1="110" x2="100" y2="24" stroke="rgba(251, 146, 60, 0.35)" strokeWidth="1" />
        <line
          x1="100"
          y1="110"
          x2={100 + 72 * Math.sin((bearingDeg * Math.PI) / 180)}
          y2={110 - 72 * Math.cos((bearingDeg * Math.PI) / 180)}
          stroke="rgba(251, 113, 133, 0.55)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M 100 110 L 168 52 L 155 48 Z"
          fill="rgba(249, 115, 22, 0.08)"
          stroke="rgba(249, 115, 22, 0.25)"
          strokeWidth="1"
        />
        {blips.map(({ t, cx, cy, i }) => (
          <g key={t.trackId}>
            <circle cx={cx} cy={cy} r={5 + (i % 2)} fill="#fb923c" opacity={0.92} />
            <circle cx={cx} cy={cy} r={9} fill="none" stroke="rgba(251, 113, 133, 0.45)" strokeWidth="1" />
          </g>
        ))}
        <circle cx="100" cy="110" r="3" fill="#fde68a" opacity={0.9} />
      </svg>
      <ul className="fmcw-bev-panel__legend">
        {tracks.map((t) => (
          <li key={t.trackId}>
            <span className="fmcw-bev-panel__dot" />
            {t.trackId} · {t.classLabel}
          </li>
        ))}
      </ul>
    </div>
  )
}
