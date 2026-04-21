type Props = {
  onContinue: () => void
}

/** 2단계: 무인기(UAV) SAR 추적 — 지도와 분리된 전용 화면 */
export function UavTrackingPhase({ onContinue }: Props) {
  return (
    <div className="uav-tracking-phase">
      <div className="uav-tracking-phase__head">
        <h2 className="uav-tracking-phase__title">2단계 · 무인기(UAV) SAR 광역 추적</h2>
        <p className="muted uav-tracking-phase__lead">
          군사분계선(40km) <strong>밖</strong> 구간에서 UAV 탑재 SAR로 표적 남하를 <strong>광역·연속</strong>으로
          감시합니다.
        </p>
      </div>

      <div className="uav-tracking-phase__media" aria-label="UAV 관측">
        <div className="uav-tracking-phase__media-frame">
          <span className="uav-tracking-phase__media-placeholder">UAV SAR / EO</span>
        </div>
      </div>

      <p className="muted uav-tracking-phase__note">
        다음 단계에서는 <strong>대대 전술 지도</strong>에서 지휘통제실 기준 거리에 따라{' '}
        <strong>전술 권역(40km 이내)</strong>·<strong>FMCW(15km 이내)</strong> 표현이 이어집니다.
      </p>

      <div className="uav-tracking-phase__actions">
        <button type="button" className="btn-primary" onClick={onContinue}>
          다음: 대대 전술 지도 (전술·FMCW)
        </button>
      </div>
    </div>
  )
}
