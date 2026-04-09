import { SensorPageLayout } from './SensorPageLayout'

type Props = {
  onContinue: () => void
}

export function UavSarPage({ onContinue }: Props) {
  return (
    <SensorPageLayout
      stepLabel="2"
      title="UAV · SAR/EO 추적"
      lead={<>저고도 <strong>SAR·EO/IR</strong>로 표적 연속 추적.</>}
      modelTitle="파이프라인(요약)"
      modelBody={
        <>
          <p>항법·자세 + YOLO/트래킹. 1단계 시드 AOI 정밀 추적.</p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            SAR/EO 모드 가용성에 따라 전환.
          </p>
        </>
      }
      inputItems={['SAR/EO 프레임', '플랫폼 로그', '시드 AOI']}
      outputItems={['바운딩·트랙 ID', '다음 단계 좌표']}
      continueLabel="3단계: FMCW"
      onContinue={onContinue}
    >
      <div className="uav-tracking-phase__media" aria-label="UAV 관측">
        <div className="uav-tracking-phase__media-frame">
          <span className="uav-tracking-phase__media-placeholder">UAV SAR / EO</span>
        </div>
      </div>
    </SensorPageLayout>
  )
}
