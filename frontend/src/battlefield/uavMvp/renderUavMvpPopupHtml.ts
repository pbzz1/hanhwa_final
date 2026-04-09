import type { UavMvpSnapshot } from './uavMockData'
import { uavOpsStatusLabelKo } from './uavMockData'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 팝업용 — 미디어 URL은 고정 자산만 사용 */
export function renderUavMvpPopupHtml(s: UavMvpSnapshot): string {
  const mediaBlock =
    s.mediaKind === 'video'
      ? `<div class="uav-mvp-popup__media"><video src="${escapeHtml(s.mediaUrl)}" controls playsinline muted loop class="uav-mvp-popup__video"></video><p class="uav-mvp-popup__cap">${escapeHtml(s.mediaCaption)}</p></div>`
      : `<div class="uav-mvp-popup__media"><img src="${escapeHtml(s.mediaUrl)}" alt="" class="uav-mvp-popup__img"/><p class="uav-mvp-popup__cap">${escapeHtml(s.mediaCaption)}</p></div>`

  return `
    <div class="service-asset-popup uav-mvp-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(s.callSign)}</h4>
      <p class="uav-mvp-popup__sar">${escapeHtml(s.sarFollowupLine)}</p>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>상태</dt><dd>${escapeHtml(uavOpsStatusLabelKo(s.opsStatus))}</dd></div>
        <div class="service-asset-popup__row"><dt>EO/IR</dt><dd>${s.hasEoIr ? '탑재 · ' + escapeHtml(s.eoIrNote) : '없음'}</dd></div>
        <div class="service-asset-popup__row"><dt>식별</dt><dd>${escapeHtml(s.tankIdentification)}<br/><span class="muted">${escapeHtml(s.identificationConfidence)}</span></dd></div>
        <div class="service-asset-popup__row"><dt>위치</dt><dd class="service-asset-popup__mono">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</dd></div>
        <div class="service-asset-popup__row"><dt>MGRS</dt><dd class="service-asset-popup__mono">${escapeHtml(s.mgrs)}</dd></div>
        <div class="service-asset-popup__row"><dt>속도·방향(추정)</dt><dd>${s.speedKphEst.toFixed(0)} km/h · ${s.headingDegEst.toFixed(0)}°</dd></div>
        <div class="service-asset-popup__row"><dt>${escapeHtml(s.tankSpecLine)}</dt><dd>${escapeHtml(s.tankSpecDetail)}</dd></div>
      </dl>
      ${mediaBlock}
    </div>
  `
}
