import { NavLink } from 'react-router-dom'
import { SensorStagePipelineFrame } from './SensorStagePipelineFrame'

const DEMO_EOIR_VIDEO = '/media/yolo-tank-2.mp4'

type PanelProps = {
  /** 통합 시나리오 4단계 안에 넣을 때 여백·제목·중복 링크 축소 */
  embedded?: boolean
  /** 전용 라우트(`/drone-eo-ir`)에서만 스타일 훅 */
  pageClassName?: string
  /** 시나리오 홈에서만 — 하단 «5단계: 통합 상황» 버튼 */
  scenarioNext?: { label: string; onContinue: () => void }
}

/**
 * 드론 EO/IR 식별 파이프라인 — 전용 페이지·시나리오 4 임베드 공용.
 */
export function DroneEoIrIdentificationPanel({
  embedded = false,
  pageClassName,
  scenarioNext,
}: PanelProps) {
  return (
    <SensorStagePipelineFrame
      embedded={embedded}
      pageClassName={pageClassName}
      nextStep={scenarioNext}
      activeStep="drone"
      title={embedded ? '드론 EO/IR 식별 파이프라인' : '드론 EO/IR 식별'}
      lead={
        <>
          기획 <strong>3단계</strong>(무인기 실시간 추적)·<strong>4단계</strong>(근접 드론 정밀 식별)에서 다루는 EO/IR
          융합·정밀 파이프와 연계합니다. YOLO+ByteTrack 궤적, 저신뢰 검출 연결, 레이더와의 결과 통합, SAHI·BoT-SORT는
          근접·고고도 식별 단계에서 선택·보강합니다.{' '}
          <NavLink to="/sensor-pipeline?step=drone">센서 파이프라인</NavLink> 4단계
          {embedded ? '와 아래 정찰 영상·모달' : '·통합'}과 동일 계열입니다.
          {!embedded ? (
            <>
              {' '}
                <NavLink to="/?scenario=5">5. 통합 상황</NavLink> 정찰 영상·모달과 연결됩니다.
            </>
          ) : null}
        </>
      }
      detailTitle="EO vs IR (역할)"
      detail={
        <>
          <ul className="drone-eoir-band-list">
            <li>
              <strong>EO (가시)</strong> — 윤곽·도색·지형 대비 식별. 야간·연막·기상 악화 시 IR로 보완(기획 ④ 융합).
            </li>
            <li>
              <strong>IR (열상)</strong> — 열 신호 대비, 주·야·저가시성 학습(ARMA3 시뮬 데이터셋 구축안 반영).
            </li>
          </ul>
          <p className="muted drone-eoir-footnote">
            <strong>3.1 전차 EO/IR 시뮬레이션</strong> — Arma 3 무인기 시점, 공항·주거·산악 지형별 EO/IR, 전차·차량
            클래스당 환경×모드 조합별 약 <strong>250</strong>건 수준으로 구축하는 전략과 맞춥니다.
          </p>
          <div className="drone-eoir-spec-table-wrap" role="region" aria-label="시뮬레이션 데이터량 요약">
            <table className="drone-eoir-spec-table">
              <caption className="visually-hidden">
                지형·모드별 데이터량(건)
              </caption>
              <thead>
                <tr>
                  <th scope="col">카테고리</th>
                  <th scope="col">공항 EO</th>
                  <th scope="col">공항 IR</th>
                  <th scope="col">주거 EO</th>
                  <th scope="col">주거 IR</th>
                  <th scope="col">산악 EO</th>
                  <th scope="col">산악 IR</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">전차</th>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                </tr>
                <tr>
                  <th scope="row">차량</th>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                  <td>250</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted drone-eoir-footnote">
            배치 YOLO 업로드는 <NavLink to="/identification">전차 식별·추적</NavLink>, 벤치·Top-K UI 개념은 센서
            파이프라인 드론 단계 설명과 연동됩니다.
          </p>
        </>
      }
      demoTitle="EO/IR 정찰 클립"
      demoLead="통합 상황에서 모달로 재생하는 정찰 영상과 동일 계열입니다."
      demoWrapClassName="sensor-drone-stage drone-eoir-stage"
      demo={
        <>
          <video
            className="sensor-drone-video"
            src={DEMO_EOIR_VIDEO}
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
              <span className="sensor-drone-stage__label">EO/IR · 식별</span>
            </div>
            <span className="sensor-drone-stage__corners" />
          </div>
        </>
      }
      actions={
        <>
          <NavLink to="/sensor-pipeline?step=drone" className="btn-primary">
            파이프라인 4단계로 이동
          </NavLink>
          {!embedded ? (
            <NavLink to="/?scenario=5" className="btn-secondary">
              통합 시나리오 열기
            </NavLink>
          ) : null}
          <NavLink to="/identification" className="btn-secondary">
            YOLO 업로드 식별
          </NavLink>
        </>
      }
    />
  )
}

export function DroneEoIrIdentificationPage() {
  return <DroneEoIrIdentificationPanel embedded={false} pageClassName="drone-eoir-page" />
}
