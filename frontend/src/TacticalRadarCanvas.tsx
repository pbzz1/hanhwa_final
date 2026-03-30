import { useEffect, useRef } from 'react'

type Props = {
  /** C2에서 적까지 방위 (북 0°, 시계방향) */
  bearingToEnemyDeg: number
  rangeKm: number | null
  /** 표시 최대 거리(km) — 링 스케일 */
  maxRangeKm: number
  pulseInRange: boolean
  fmcwInRange: boolean
  /** 레이더 주시 방위(북 기준) */
  radarHeadingDeg: number
  radarFovDeg: number
}

const W = 420
const H = 420
const CX = W / 2
const CY = H / 2

function polarToCanvas(bearingClockwiseFromNorth: number, rPx: number): { x: number; y: number } {
  const rad = (bearingClockwiseFromNorth * Math.PI) / 180
  return {
    x: CX + rPx * Math.sin(rad),
    y: CY - rPx * Math.cos(rad),
  }
}

/**
 * HTML Canvas 2D — 평면 위치표시기(PPI) 스타일 (타일 지도 없음)
 */
export function TacticalRadarCanvas({
  bearingToEnemyDeg,
  rangeKm,
  maxRangeKm,
  pulseInRange,
  fmcwInRange,
  radarHeadingDeg,
  radarFovDeg,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sweepRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const R = Math.min(W, H) * 0.42
    const fmcwDeg = Math.min(radarFovDeg, 110)
    let raf = 0

    const draw = () => {
      sweepRef.current = (sweepRef.current + 2.8) % 360
      const sweep = sweepRef.current

      ctx.fillStyle = '#0b1220'
      ctx.fillRect(0, 0, W, H)

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
      ctx.lineWidth = 1
      for (const frac of [0.33, 0.66, 1]) {
        ctx.beginPath()
        ctx.arc(CX, CY, R * frac, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
      for (let a = 0; a < 360; a += 30) {
        const p = polarToCanvas(a, R)
        ctx.beginPath()
        ctx.moveTo(CX, CY)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }

      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)'
      ctx.lineWidth = 1.5
      const bore = polarToCanvas(radarHeadingDeg, R)
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(bore.x, bore.y)
      ctx.stroke()

      if (fmcwInRange) {
        const rF = R * Math.min(15 / maxRangeKm, 1)
        const p1 = polarToCanvas(radarHeadingDeg - fmcwDeg / 2, rF)
        const p2 = polarToCanvas(radarHeadingDeg + fmcwDeg / 2, rF)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)'
        ctx.beginPath()
        ctx.moveTo(CX, CY)
        ctx.lineTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }

      if (pulseInRange) {
        const r40 = R * Math.min(40 / maxRangeKm, 1)
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)'
        ctx.lineWidth = 1.2
        ctx.setLineDash([6, 5])
        ctx.beginPath()
        ctx.arc(CX, CY, r40, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        const swOuter = polarToCanvas(sweep, R * 1.02)
        const grad = ctx.createLinearGradient(CX, CY, swOuter.x, swOuter.y)
        grad.addColorStop(0, 'rgba(125, 211, 252, 0.4)')
        grad.addColorStop(1, 'rgba(125, 211, 252, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(CX, CY)
        const a0 = ((sweep - 12) * Math.PI) / 180
        const a1 = ((sweep + 12) * Math.PI) / 180
        ctx.arc(CX, CY, R * 1.02, -a0 - Math.PI / 2, -a1 - Math.PI / 2, true)
        ctx.closePath()
        ctx.fill()
      }

      const rk = rangeKm ?? 0
      const clamped = Math.min(Math.max(rk, 0), maxRangeKm)
      const rPx = (clamped / maxRangeKm) * R
      const blip = polarToCanvas(bearingToEnemyDeg, rPx)
      ctx.fillStyle = '#f87171'
      ctx.beginPath()
      ctx.arc(blip.x, blip.y, fmcwInRange ? 7 : 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = 'rgba(226, 232, 240, 0.88)'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(`북 0° · 최대 ${maxRangeKm} km`, 12, 18)
      ctx.fillText(`주시 ${radarHeadingDeg.toFixed(0)}° / 시야 ${radarFovDeg}°`, 12, 34)
      ctx.fillText(`표적 방위 ${bearingToEnemyDeg.toFixed(0)}° · 거리 ${rk.toFixed(1)} km`, 12, 50)

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [bearingToEnemyDeg, rangeKm, maxRangeKm, pulseInRange, fmcwInRange, radarHeadingDeg, radarFovDeg])

  return (
    <div className="tactical-radar-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="tactical-radar-canvas"
        aria-label="Canvas PPI 스코프"
      />
      <p className="muted tactical-radar-canvas__note">
        HTML Canvas 2D — 타일 지도 없이 방위·거리 링만 표시합니다. 카카오맵과 동일한 시뮬 수치를 사용합니다.
      </p>
    </div>
  )
}
