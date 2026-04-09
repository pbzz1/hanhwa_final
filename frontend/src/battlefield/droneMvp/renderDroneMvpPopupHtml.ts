import type { DroneMvpSnapshot } from './droneMockData'
import { droneMissionStatusLabelKo } from './droneMockData'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderDroneMvpPopupHtml(s: DroneMvpSnapshot): string {
  const distLine =
    s.distanceToNearestEnemyKm != null
      ? `<div class="service-asset-popup__row"><dt>드론–최근접 적(MB)</dt><dd>${s.distanceToNearestEnemyKm.toFixed(1)} km · 한계 ${s.identificationRangeKm} km</dd></div>`
      : `<div class="service-asset-popup__row"><dt>드론–적 거리</dt><dd>MBT 표적 없음 · 한계 ${s.identificationRangeKm} km</dd></div>`
  const idLine = `<div class="service-asset-popup__row"><dt>EO/IR 판별</dt><dd>${
    s.enemyIdentified ? '가능 (거리 게이트 충족)' : '불가 (접근 필요)'
  }</dd></div>`
  const mediaBlock =
    s.enemyIdentified && s.mediaUrl
      ? s.mediaKind === 'video'
        ? `<div class="drone-mvp-popup__media"><video src="${escapeHtml(s.mediaUrl)}" controls playsinline muted loop class="drone-mvp-popup__video"></video><p class="drone-mvp-popup__cap">${escapeHtml(s.mediaCaption)}</p></div>`
        : `<div class="drone-mvp-popup__media"><img src="${escapeHtml(s.mediaUrl)}" alt="" class="drone-mvp-popup__img"/><p class="drone-mvp-popup__cap">${escapeHtml(s.mediaCaption)}</p></div>`
      : `<p class="muted" style="margin:8px 0 0;font-size:12px;">${escapeHtml(s.mediaCaption)}</p>`

  return `
    <div class="service-asset-popup drone-mvp-popup">
      <h4 class="service-asset-popup__title">${escapeHtml(s.droneId)}</h4>
      <p class="drone-mvp-popup__uavctx">${escapeHtml(s.afterUavContextLine)}</p>
      <dl class="service-asset-popup__dl">
        <div class="service-asset-popup__row"><dt>임무 상태</dt><dd>${escapeHtml(droneMissionStatusLabelKo(s.missionStatus))}</dd></div>
        ${distLine}
        ${idLine}
        <div class="service-asset-popup__row"><dt>표적 종류</dt><dd>${escapeHtml(s.targetClass)}</dd></div>
        <div class="service-asset-popup__row"><dt>이동 방향</dt><dd>${s.headingDegEst.toFixed(0)}° (추정)</dd></div>
        <div class="service-asset-popup__row"><dt>이동 상태</dt><dd>${escapeHtml(s.movementState)} · ${s.speedKphEst.toFixed(0)} km/h</dd></div>
        <div class="service-asset-popup__row"><dt>위협도</dt><dd>${escapeHtml(s.threatLevel)}</dd></div>
        <div class="service-asset-popup__row"><dt>위치</dt><dd class="service-asset-popup__mono">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</dd></div>
        <div class="service-asset-popup__row"><dt>MGRS</dt><dd class="service-asset-popup__mono">${escapeHtml(s.mgrs)}</dd></div>
      </dl>
      ${mediaBlock}
    </div>
  `
}
