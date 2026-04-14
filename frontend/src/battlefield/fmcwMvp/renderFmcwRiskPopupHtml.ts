import type { FmcwMvpBundle } from './fmcwMockData'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderFmcwRiskPopupHtml(bundle: FmcwMvpBundle): string {
  const strikeOk = bundle.engagements.filter((e) => e.strikeCapable).length
  const strikeNo = bundle.engagements.length - strikeOk
  return `
    <div class="service-asset-popup fmcw-risk-popup">
      <h4 class="service-asset-popup__title">FMCW 위험 구역</h4>
      <p class="fmcw-risk-popup__zone">${escapeHtml(bundle.zoneLabel)}</p>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>탐지 거리</dt><dd>${bundle.detectionRangeKm.toFixed(1)} km</dd></div>
        <div class="service-asset-popup__row"><dt>접근 속도</dt><dd>${bundle.approachSpeedMps.toFixed(1)} m/s</dd></div>
        <div class="service-asset-popup__row"><dt>진입 경로</dt><dd>${escapeHtml(bundle.ingressSummary)}</dd></div>
        <div class="service-asset-popup__row"><dt>아군 타격</dt><dd>가능 <strong>${strikeOk}</strong> / 불가 <strong>${strikeNo}</strong></dd></div>
      </dl>
      <p class="muted fmcw-risk-popup__foot">우측 패널에 부대별 상세가 표시됩니다.</p>
    </div>
  `
}
