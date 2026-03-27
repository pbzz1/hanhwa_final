import { useEffect, useRef, useCallback } from 'react'

export type RadarDetectionPoint = {
  id: string
  rangeM: number
  azimuthDeg: number
  elevationDeg: number
  dopplerMps: number
  confidence: number
  /** FMCW 위상(도) — 차트에는 미표시 가능 */
  phaseDeg?: number
}

function dopplerToColor(d: number): string {
  if (d <= -4) return '#1d4ed8'
  if (d >= 4) return '#dc2626'
  return '#64748b'
}

/**
 * VoD 스타일 2D: (1) Range–Azimuth 산점도 (2) 수평면 x–y (동·북, m)
 */
export function RadarCharts2D({ detections }: { detections: RadarDetectionPoint[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRaRef = useRef<HTMLCanvasElement | null>(null)
  const canvasXyRef = useRef<HTMLCanvasElement | null>(null)

  const redraw = useCallback(() => {
    if (detections.length === 0) return

    const drawScatter = (
      canvas: HTMLCanvasElement,
      mode: 'ra' | 'xy',
    ) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cssW = Math.max(canvas.clientWidth || canvas.offsetWidth || 320, 260)
      const cssH = 200
      canvas.style.width = '100%'
      canvas.style.height = `${cssH}px`
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      const W = cssW
      const H = cssH
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      const pad = { l: 44, r: 14, t: 14, b: 36 }

      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity
      const pts: Array<{ x: number; y: number; c: string; id: string }> = []

      for (const d of detections) {
        if (mode === 'ra') {
          pts.push({
            x: d.azimuthDeg,
            y: d.rangeM,
            c: dopplerToColor(d.dopplerMps),
            id: d.id,
          })
        } else {
          const rad = (d.azimuthDeg * Math.PI) / 180
          const x = d.rangeM * Math.sin(rad)
          const y = d.rangeM * Math.cos(rad)
          pts.push({ x, y, c: dopplerToColor(d.dopplerMps), id: d.id })
        }
      }
      for (const p of pts) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
      const dx = maxX - minX || 1
      const dy = maxY - minY || 1
      minX -= dx * 0.08
      maxX += dx * 0.08
      minY -= dy * 0.06
      maxY += dy * 0.06

      const sx = (x: number) => pad.l + ((x - minX) / (maxX - minX)) * (W - pad.l - pad.r)
      const sy = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY)) * (H - pad.t - pad.b)

      ctx.strokeStyle = '#94a3b8'
      ctx.strokeRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b)

      for (const p of pts) {
        ctx.beginPath()
        ctx.fillStyle = p.c
        ctx.arc(sx(p.x), sy(p.y), 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      ctx.fillStyle = '#475569'
      ctx.font = '11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      if (mode === 'ra') {
        ctx.fillText('azimuth (deg)', W / 2, H - 10)
        ctx.save()
        ctx.translate(14, H / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText('range (m)', 0, 0)
        ctx.restore()
      } else {
        ctx.fillText('x east (m)', W / 2, H - 10)
        ctx.save()
        ctx.translate(14, H / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText('y north (m)', 0, 0)
        ctx.restore()
      }
    }

    if (canvasRaRef.current) drawScatter(canvasRaRef.current, 'ra')
    if (canvasXyRef.current) drawScatter(canvasXyRef.current, 'xy')
  }, [detections])

  useEffect(() => {
    if (detections.length === 0) return
    const run = () => requestAnimationFrame(() => redraw())
    run()
    const ro = new ResizeObserver(run)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [detections, redraw])

  if (detections.length === 0) {
    return <p className="muted">탐지 데이터가 없습니다.</p>
  }

  return (
    <div className="radar-charts-2d" ref={wrapRef}>
      <div className="radar-charts-2d__plot">
        <p className="radar-charts-2d__caption">Range vs azimuth (radar axes)</p>
        <canvas ref={canvasRaRef} className="radar-charts-2d__canvas" />
      </div>
      <div className="radar-charts-2d__plot">
        <p className="radar-charts-2d__caption">Ground plane x–y (m), color = Doppler</p>
        <canvas ref={canvasXyRef} className="radar-charts-2d__canvas" />
      </div>
    </div>
  )
}
