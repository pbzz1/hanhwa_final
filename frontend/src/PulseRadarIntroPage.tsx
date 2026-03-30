import { PulseRadarMockViz } from './PulseRadarMockViz'
import { SensorPageLayout } from './SensorPageLayout'

type Props = {
  onContinue: () => void
}

export function PulseRadarIntroPage({ onContinue }: Props) {
  return (
    <SensorPageLayout
      stepLabel="3"
      title="펄스 레이더 (모의 PPI)"
      lead={
        <>
          중·원거리에서 <strong>한 번에 넓은 공간</strong>을 밝히는 방식입니다. 각도 해상도보다{' '}
          <strong>거리·방위의 빠른 획득</strong>이 목적이며, 본 데모의 지도 보라색 부채꼴·점 탐지와 대응됩니다.
        </>
      }
      modelTitle="모델·파이프라인 (개념)"
      modelBody={
        <>
          <p>
            <strong>단발(또는 소수 펄스)</strong> 송신 후 반사파를 수신해 <strong>시간 지연 → 거리</strong>,{' '}
            <strong>위상차·배열 → 방위</strong>를 추정합니다. MTI/처리기에서 잡음·지면 반사를 억제한 뒤{' '}
            <strong>탐지 리스트</strong>를 냅니다.
          </p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            이 페이지의 원형 그래픽은 <strong>교육용 모의 PPI</strong>이며, 통합 시뮬에서는 백엔드 스냅샷과
            연동됩니다.
          </p>
        </>
      }
      inputItems={[
        '디지털 I/Q 샘플(수신기), 샘플링률·대역',
        '안테나 패턴·주시 방위(heading)·시야각(FOV)',
        '송신 파형(펄스폭, PRF), 플랫폼 자세(필요 시)',
        '처리 파라미터: CFAR, 임계값, 트랙 초기화 규칙',
      ]}
      outputItems={[
        '탐지점: range, azimuth (및 간이 elevation)',
        '신호 품질 지표: SNR, RCS 추정(옵션)',
        '트랙 후보 / 점만 표시 모드(데모: 미확인 구간)',
      ]}
      continueLabel="4단계: FMCW 레이더로"
      onContinue={onContinue}
    >
      <PulseRadarMockViz />
    </SensorPageLayout>
  )
}
