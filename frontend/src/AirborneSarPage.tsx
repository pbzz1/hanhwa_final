import { SarComparePhase } from './SarComparePhase'
import { SensorPageLayout } from './SensorPageLayout'

type Props = {
  onContinue: () => void
}

export function AirborneSarPage({ onContinue }: Props) {
  return (
    <SensorPageLayout
      stepLabel="1"
      title="항공(위성) SAR 변화분석"
      lead={
        <>
          고도에서 <strong>여러 패스·시각</strong>의 SAR 영상을 정합해 <strong>변화를 검출</strong>합니다. 아래
          지도는 북측 전차급 신호가 사라진 의심 구역을 <strong>시각적으로 비교</strong>하는 데모입니다.
        </>
      }
      modelTitle="모델·파이프라인 (개념)"
      modelBody={
        <>
          <p>
            <strong>전처리</strong>(방사 보정, 지형 보정) → <strong>코히전·간섭</strong> →{' '}
            <strong>변화지수(CDI 등)</strong> 또는 <strong>학습 기반 변화 검출</strong>으로 시공간 정렬된 타일
            쌍에서 이상을 강조합니다.
          </p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            실제 운용에서는 해상도·입사각·대기 상태에 민감하며, 위양·가용성 제약을 별도로 고려합니다.
          </p>
        </>
      }
      inputItems={[
        'SAR SLC/GRD 타일(전·후 또는 다시간), 메타데이터(궤도, 파장, 편파)',
        '기준 DEM 또는 지형 정합에 쓰는 래스터',
        '관심영역(AOI) 폴리곤, 임계·민감도 파라미터',
      ]}
      outputItems={[
        '변화 마스크 / 변화 강도 래스터',
        '의심 객체·구역 벡터(폴리곤) + 신뢰도',
        '다음 단계(UAV·지상 센서)로 넘길 타깃 리스트·좌표',
      ]}
      continueLabel="2단계: UAV SAR로"
      onContinue={onContinue}
    >
      <SarComparePhase embedded showContinueButton={false} onContinue={() => {}} />
    </SensorPageLayout>
  )
}
