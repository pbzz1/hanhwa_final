import { useEffect, useRef } from 'react'

const W = 440
const H = 300
const CX = W / 2
const CY = H / 2 + 8

function polar(bearingDeg: number, r: number): { x: number; y: number } {
  const rad = (bearingDeg * Math.PI) / 180
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) }
}

/**
 * 펄스 레이더 인트로용 모의 PPI — 회전 스윕·부채꼴·점 탐지(데모)
 */
export function PulseRadarMockViz() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const R = Math.min(W, H) * 0.38
    const heading = 38
    const fov = 70
    let sweep = 0
    let raf = 0

    const blips = [
      { brg: 22, r: 0.62, label: 'P1' },
      { brg: 48, r: 0.78, label: 'P2' },
      { brg: -18, r: 0.45, label: 'P3' },
    ]

    const tick = () => {
      sweep = (sweep + 2.2) % 360
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, W, H)

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
      ctx.lineWidth = 1
      for (const f of [0.33, 0.66, 1]) {
        ctx.beginPath()
        ctx.arc(CX, CY, R * f, 0, Math.PI * 2)
        ctx.stroke()
      }

      const h0 = heading - fov / 2
      const h1 = heading + fov / 2
      const p0 = polar(h0, R)
      ctx.fillStyle = 'rgba(167, 139, 250, 0.12)'
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(p0.x, p0.y)
      ctx.arc(CX, CY, R, (-h1 * Math.PI) / 180 + Math.PI / 2, (-h0 * Math.PI) / 180 + Math.PI / 2, false)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)'
      ctx.lineWidth = 1.2
      ctx.stroke()

      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)'
      ctx.lineWidth = 1.5
      const bore = polar(heading, R)
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(bore.x, bore.y)
      ctx.stroke()

      const sw = polar(sweep, R * 1.02)
      const grad = ctx.createLinearGradient(CX, CY, sw.x, sw.y)
      grad.addColorStop(0, 'rgba(192, 132, 252, 0.35)')
      grad.addColorStop(1, 'rgba(192, 132, 252, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      const a0 = ((sweep - 14) * Math.PI) / 180
      const a1 = ((sweep + 14) * Math.PI) / 180
      ctx.arc(CX, CY, R * 1.02, -a0 - Math.PI / 2, -a1 - Math.PI / 2, true)
      ctx.closePath()
      ctx.fill()

      for (const b of blips) {
        const p = polar(heading + b.brg, R * b.r)
        ctx.fillStyle = '#c4b5fd'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(b.label, p.x + 6, p.y + 3)
      }

      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText('모의 펄스 PPI · 주시·스윕·점 탐지', 12, 18)
      ctx.fillText(`주시 ${heading}° · 시야 ${fov}° (데모)`, 12, 34)

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pulse-radar-mock">
      <canvas ref={canvasRef} width={W} height={H} className="pulse-radar-mock__canvas" aria-hidden />
      <p className="muted pulse-radar-mock__caption">
        실제 체인과 달리 단순화된 <strong>시각 모형</strong>입니다. 출력은 보통 <strong>range, azimuth, SNR,
        점 리스트</strong> 형태입니다.
      </p>
    </div>
  )
}
