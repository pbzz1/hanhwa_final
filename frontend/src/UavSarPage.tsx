import { SensorPageLayout } from './SensorPageLayout'

type Props = {
  onContinue: () => void
}

export function UavSarPage({ onContinue }: Props) {
  return (
    <SensorPageLayout
      stepLabel="2"
      title="무인기(UAV) SAR · EO 추적"
      lead={
        <>
          저고도·저속 플랫폼에서 <strong>세밀한 해상도</strong>와 <strong>영상·SAR 병행</strong>으로 표적을
          지속 추적합니다. 아래 프레임은 <strong>추후 실제 영상·SAR 타일</strong>로 교체할 위치입니다.
        </>
      }
      modelTitle="모델·파이프라인 (개념)"
      modelBody={
        <>
          <p>
            <strong>항법·자세 추정(IMU/GNSS)</strong>으로 SAR 영상을 형성하거나, EO/IR 스트림에{' '}
            <strong>검출·트래킹(YOLO 계열 등)</strong>을 적용합니다. 광역 SAR에서 넘어온 <strong>시드
            좌표</strong>를 윈도우 내에서 정밀 추적하는 경우가 많습니다.
          </p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            링크 예산·체공 시간·날씨에 따라 SAR 모드와 EO 모드를 선택적으로 전환합니다.
          </p>
        </>
      }
      inputItems={[
        'RAW SAR 또는 SAR 이미지 타일, EO/IR 프레임 시퀀스',
        '플랫폼 자세·위치 로그, 렌즈·센서 캘리브레이션',
        '이전 단계에서의 시드 AOI / 우선 표적 ID',
        '추적기·검출기 가중치 및 임계값',
      ]}
      outputItems={[
        '표적 바운딩 박스 또는 SAR 기반 위치 추정',
        '트랙 ID, 속도 벡터(영상 기반), 타임스탬프',
        '다음 레이더 단계로 전달할 **접촉 예고 좌표·거리 힌트**',
      ]}
      continueLabel="3단계: 펄스 레이더로"
      onContinue={onContinue}
    >
      <div className="uav-tracking-phase__media" aria-label="UAV 관측 플레이스홀더">
        <div className="uav-tracking-phase__media-frame">
          <span className="uav-tracking-phase__media-placeholder">
            UAV SAR / EO 영상
            <small>이미지·동영상 URL 또는 컴포넌트로 대체 예정</small>
          </span>
        </div>
      </div>
    </SensorPageLayout>
  )
}
