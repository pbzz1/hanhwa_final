import { SarComparePhase } from './SarComparePhase'
import { SensorPageLayout } from './SensorPageLayout'

type Props = {
  onContinue: () => void
}

export function AirborneSarPage({ onContinue }: Props) {
  return (
    <SensorPageLayout
      stepLabel="1"
      title="SAR 광역 · 변화분석"
      lead={<>전·후 SAR 정합으로 <strong>이상·이동 징후</strong> 탐지. 아래 지도는 전·후 비교.</>}
      modelTitle="파이프라인(요약)"
      modelBody={
        <>
          <p>전처리 → 정합/간섭 → 변화 검출(CCD 등).</p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            해상도·기상 등 운용 제약 별도.
          </p>
        </>
      }
      inputItems={['SAR 타일·메타', 'DEM·AOI']}
      outputItems={['변화 마스크', '후보 좌표 → UAV']}
      continueLabel="2단계: UAV"
      onContinue={onContinue}
    >
      <SarComparePhase embedded showContinueButton={false} onContinue={() => {}} />
    </SensorPageLayout>
  )
}
