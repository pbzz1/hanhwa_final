import { NavLink } from 'react-router-dom'
import { SensorStagePipelineFrame } from './SensorStagePipelineFrame'

const DEMO_UAV_VIDEO = '/media/yolo-tank-1.mp4'

type Props = {
  onContinue: () => void
}

export function UavSarPage({ onContinue }: Props) {
  return (
    <SensorStagePipelineFrame
      activeStep="uav_sar"
      title="UAV · SAR/EO 추적"
      lead={
        <>
          1단계 후보 좌표를 받아 <strong>저고도 SAR·EO/IR</strong>로 연속 추적합니다. 고해상 Spotlight·MSFA 분류와
          영상계 <strong>YOLO+ByteTrack</strong>·경로 분석을 한 흐름으로 봅니다.
        </>
      }
      detailTitle="추적 · 정밀 SAR · EO/IR"
      detail={
        <>
          <ul className="drone-eoir-band-list">
            <li>
              <strong>정밀 SAR</strong> — SARDet-100K 등으로 전차/차량 구분, 위기·평시 이원 운용.
            </li>
            <li>
              <strong>영상</strong> — YOLO 검출 + ByteTrack ID 유지, 저신뢰 검출도 궤적 연결.
            </li>
            <li>
              <strong>EO / IR</strong> — 가시·열상 융합, 야간·연막 보완(시뮬 데이터로 학습).
            </li>
          </ul>
          <div className="drone-eoir-spec-table-wrap" role="region" aria-label="SARDet 클래스 요약">
            <table className="drone-eoir-spec-table">
              <caption className="visually-hidden">주요 클래스 학습 비중(예시)</caption>
              <thead>
                <tr>
                  <th scope="col">클래스</th>
                  <th scope="col">역할</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Tank</th>
                  <td>핵심 표적</td>
                </tr>
                <tr>
                  <th scope="row">Car</th>
                  <td>대조·오탐 억제</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted drone-eoir-footnote">
            산출: <strong>트랙 ID</strong>, <strong>경로</strong>, EO/IR 클립 → 3단계 FMCW.
          </p>
        </>
      }
      demoTitle="데모 EO/IR · 추적 시야"
      demoLead="통합 시나리오와 동일 계열 샘플 영상(드론 시점)."
      demoWrapClassName="sensor-drone-stage drone-eoir-stage"
      demo={
        <>
          <video
            className="sensor-drone-video"
            src={DEMO_UAV_VIDEO}
            autoPlay
            muted
            loop
            playsInline
            controls
          >
            브라우저가 video를 지원하지 않습니다.
          </video>
          <div className="sensor-drone-stage__overlay" aria-hidden>
            <div className="sensor-drone-stage__overlay-top">
              <span className="sensor-drone-stage__rec" />
              <span className="sensor-drone-stage__label">UAV · EO/IR</span>
            </div>
            <span className="sensor-drone-stage__corners" />
          </div>
        </>
      }
      actions={
        <>
          <NavLink to="/sensor-pipeline?step=uav_sar" className="btn-secondary">
            센서 파이프라인 2단계
          </NavLink>
          <NavLink to="/identification" className="btn-secondary">
            YOLO 업로드
          </NavLink>
        </>
      }
      nextStep={{ label: '3단계: FMCW', onContinue }}
    />
  )
}
