type Props = {
  onContinue: () => void
}

/**
 * 2단계: 무인기(UAV) SAR 추적 — 지도와 분리된 전용 화면.
 * 실제 데이터는 추후 이미지·동영상 에셋으로 이 영역만 교체하면 됩니다.
 */
export function UavTrackingPhase({ onContinue }: Props) {
  return (
    <div className="uav-tracking-phase">
      <div className="uav-tracking-phase__head">
        <h2 className="uav-tracking-phase__title">2단계 · 무인기(UAV) SAR 광역 추적</h2>
        <p className="muted uav-tracking-phase__lead">
          군사분계선(40km) <strong>밖</strong> 구간에서 UAV 탑재 SAR로 표적 남하를 <strong>광역·연속</strong>으로
          감시합니다. 아래 영역은 데모용 플레이스홀더이며, 발표 시 <strong>실측 영상 또는 SAR 타일 이미지</strong>로
          바꿀 수 있습니다.
        </p>
      </div>

      <div className="uav-tracking-phase__media" aria-label="UAV 관측 플레이스홀더">
        <div className="uav-tracking-phase__media-frame">
          <span className="uav-tracking-phase__media-placeholder">
            UAV SAR / EO 영상
            <small>이미지·동영상 URL 또는 컴포넌트로 대체 예정</small>
          </span>
        </div>
      </div>

      <p className="muted uav-tracking-phase__note">
        다음 단계에서는 <strong>대대 전술 지도</strong>에서 지휘통제실 기준 거리에 따라{' '}
        <strong>펄스(40km 이내)</strong>·<strong>FMCW(15km 이내)</strong> 레이더 표현이 이어집니다.
      </p>

      <div className="uav-tracking-phase__actions">
        <button type="button" className="btn-primary" onClick={onContinue}>
          다음: 대대 전술 지도 (펄스·FMCW)
        </button>
      </div>
    </div>
  )
}
