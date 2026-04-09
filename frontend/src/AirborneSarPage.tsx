import { NavLink } from 'react-router-dom'
import { SarComparePhase } from './SarComparePhase'
import { SensorStagePipelineFrame } from './SensorStagePipelineFrame'

type Props = {
  onContinue: () => void
}

export function AirborneSarPage({ onContinue }: Props) {
  return (
    <SensorStagePipelineFrame
      activeStep="sat_sar"
      title="SAR 광역 · 변화분석"
      lead={
        <>
          Sentinel-1 IW 광역에서 <strong>전·후 정합·변화</strong>로 기동 징후를 1차 탐지합니다. 하단은 카카오맵 기반
          전·후 비교, 오른쪽은 입력 데이터·파이프 요약입니다.
        </>
      }
      detailTitle="데이터 · 조기 경보 파이프"
      detail={
        <>
          <ul className="drone-eoir-band-list">
            <li>
              <strong>SLC</strong> — 위상·진폭, Sub-Aperture·시분할 위상차에 사용.
            </li>
            <li>
              <strong>GRD</strong> — 진폭만, 지형·<strong>RCS</strong> 대조·변화 뷰에 사용.
            </li>
            <li>
              <strong>전처리</strong> — Burst 병합(위상 연속), FFT·Sub-Aperture 분할, 위상 간섭으로 정지 배경 제거.
            </li>
            <li>
              <strong>후처리</strong> — RCS 임계·<strong>OSM</strong> 도로·수역 매칭으로 후보 축소 → UAV 유도.
            </li>
          </ul>
          <figure className="sensor-sar-input-figure" style={{ marginTop: 12 }}>
            <img
              src="/media/sar-grd-example.png"
              alt="GRD 진폭 SAR 예시 — 수역·육상·고반사 표적"
              loading="lazy"
            />
            <figcaption className="muted sensor-sar-input-figure__cap">
              입력 예시: GRD 광역 타일(항만·고반사점)
            </figcaption>
          </figure>
          <p className="muted drone-eoir-footnote" style={{ marginTop: 12 }}>
            산출: <strong>변화 마스크</strong>, <strong>후보 좌표</strong> → 2단계 UAV.
          </p>
        </>
      }
      demoTitle="전·후 SAR 타일 비교 (지도)"
      demoLead="관측 전 기준 vs 관측 후 변화(전차 신호 소실 구역) 시연."
      demoWrapClassName="sensor-stage-demo-shell sensor-stage-demo-shell--flush"
      demo={<SarComparePhase embedded showContinueButton={false} onContinue={() => {}} />}
      belowDemo={
        <section className="sensor-sar-aoi-block" aria-labelledby="sar-aoi-detections-h">
          <h3 id="sar-aoi-detections-h" className="sensor-sar-aoi-block__title">
            집중 감시 구역(AOI) · SAR 객체 식별
          </h3>
          <p className="muted sensor-sar-aoi-block__lead">
            광역 타일에서 추린 <strong>집중 감시 구역</strong>에 대해 진폭 SAR 슬라이스를 입력으로 두고, 검출 모델이
            바운딩 박스·클래스·신뢰도를 산출합니다. 아래는 수역 후보에 대해 <strong>선박(ship)</strong>으로 식별된 프레임
            예시입니다(운용 시 API·WebPayload의 <code>detections[]</code>와 동일 스키마로 전달 가능).
          </p>
          <figure className="sensor-sar-input-figure sensor-sar-aoi-block__figure">
            <img
              src="/media/sar-aoi-yolo-ships.png"
              alt="집중 감시 구역 SAR 영상에서 선박 두 표적이 빨간 박스와 ship 라벨·신뢰도로 표시된 예시"
              loading="lazy"
            />
            <figcaption className="muted sensor-sar-input-figure__cap">
              예시 출력: <code>label</code>·<code>confidence</code>·<code>bbox</code> — 고신뢰 표적은 후속 UAV·정밀 SAR
              유도에 우선 반영합니다.
            </figcaption>
          </figure>
        </section>
      }
      actions={
        <NavLink to="/sensor-pipeline?step=sat_sar" className="btn-secondary">
          센서 파이프라인 1단계
        </NavLink>
      }
      nextStep={{ label: '2단계: UAV', onContinue }}
    />
  )
}
