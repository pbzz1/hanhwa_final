/**
 * FMCW 파이프라인(DBSCAN → 프레임 연속성 → 방향 예측 → 지도 위험구역)을
 * 처음 보는 사용자용으로 단계·이론 위주로 요약 표시.
 */
export type FmcwPipelineGuideProps = {
  detectionCount: number
  frameId?: string | null
  prevFrameId?: string | null
  hasRiskZones: boolean
  hasFutureTrajectory: boolean
}

export function FmcwPipelineGuide({
  detectionCount,
  frameId,
  prevFrameId,
  hasRiskZones,
  hasFutureTrajectory,
}: FmcwPipelineGuideProps) {
  return (
    <section className="fmcw-pipeline-guide" aria-labelledby="fmcw-pipeline-guide-title">
      <h2 id="fmcw-pipeline-guide-title" className="fmcw-pipeline-guide__title">
        FMCW 위험 예측 — 단계별로 이해하기
      </h2>
      <p className="fmcw-pipeline-guide__lead muted">
        아래 순서가 백엔드 파이프라인의 큰 흐름입니다. 각 단계는 이전 단계의 출력을 입력으로 받습니다.
      </p>

      <div className="fmcw-pipeline-guide__steps">
        <div className="fmcw-pipeline-guide__step">
          <div className="fmcw-pipeline-guide__step-head">
            <span className="fmcw-pipeline-guide__step-num">1</span>
            <div>
              <h3 className="fmcw-pipeline-guide__step-title">DBSCAN으로 “객체 후보” 묶기</h3>
              <p className="fmcw-pipeline-guide__theory">
                <strong>이론:</strong> 레이더가 주는 점들은 거리·도플러·방위로 흩어 있습니다.{' '}
                <abbr title="Density-Based Spatial Clustering of Applications with Noise">DBSCAN</abbr>은
                서로 가까운 점(반경 ε, 최소 개수 minPts)을 한 덩어리로 묶고, 어디에도 속하지 않는 점은 잡음으로
                버립니다. 덩어리 하나가 곧 “탐지된 객체(클러스터)” 후보입니다.
              </p>
              <p className="fmcw-pipeline-guide__map muted">
                <strong>화면:</strong> Range–Azimuth 차트의 점들이 이 단계 이후의 후보를 나타냅니다. 현재 스냅샷
                탐지 <strong>{detectionCount}</strong>건.
              </p>
            </div>
          </div>
        </div>

        <div className="fmcw-pipeline-guide__step">
          <div className="fmcw-pipeline-guide__step-head">
            <span className="fmcw-pipeline-guide__step-num">2</span>
            <div>
              <h3 className="fmcw-pipeline-guide__step-title">연속 프레임으로 움직임 잇기</h3>
              <p className="fmcw-pipeline-guide__theory">
                <strong>이론:</strong> 한 시점의 클러스터만으로는 속도를 알 수 없습니다. 직전 프레임(또는 이전
                시각)의 클러스터와 짝을 맞추면(association), 같은 객체의 위치 차이가 생깁니다. Δt로 나누면
                순간 속도 벡터에 가까운 값이 되고, 그 방향이 <strong>이동 방향(헤딩)</strong>의 근사가 됩니다.
              </p>
              <p className="fmcw-pipeline-guide__map muted">
                <strong>화면:</strong> VoD·레이더가 같은 stem의 프레임을 쓸 때, 프레임 ID가 연속성을
                가리킵니다.
                {frameId != null && frameId !== '' ? (
                  <>
                    {' '}
                    이번 실행: <strong>{frameId}</strong>
                    {prevFrameId != null && prevFrameId !== '' ? (
                      <>
                        {' '}
                        (속도 추정에 참고: <strong>{prevFrameId}</strong>)
                      </>
                    ) : null}
                    .
                  </>
                ) : (
                  ' (실행 중 스냅샷에 프레임 ID가 붙으면 여기에 표시됩니다.)'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="fmcw-pipeline-guide__step">
          <div className="fmcw-pipeline-guide__step-head">
            <span className="fmcw-pipeline-guide__step-num">3</span>
            <div>
              <h3 className="fmcw-pipeline-guide__step-title">방향·궤적 예측</h3>
              <p className="fmcw-pipeline-guide__theory">
                <strong>이론:</strong> 얻은 속도·방향으로 짧은 시간 구간을 외삽하면, 객체가 갈 가능성이 큰
                직선(또는 곡선 근사) 경로를 얻습니다. 레이더 좌표계에서 지구 좌표(WGS84)로 투영하면 지도 위
                선분이 됩니다.
              </p>
              <p className="fmcw-pipeline-guide__map muted">
                <strong>지도:</strong> 주황·청록 등 <strong>점선 궤적</strong>이 이 예측 경로입니다.
                {hasFutureTrajectory ? ' 현재 스냅샷에 예측 궤적이 포함되어 있습니다.' : ' (이 스냅샷에는 예측 궤적이 없을 수 있습니다.)'}
              </p>
            </div>
          </div>
        </div>

        <div className="fmcw-pipeline-guide__step">
          <div className="fmcw-pipeline-guide__step-head">
            <span className="fmcw-pipeline-guide__step-num">4</span>
            <div>
              <h3 className="fmcw-pipeline-guide__step-title">위험 구역을 지도에 그리기</h3>
              <p className="fmcw-pipeline-guide__theory">
                <strong>이론:</strong> 예측 진행축을 중심으로 부채꼴·버퍼(폭)를 두면 “곧 이 구간을 지날 수
                있다”는 위험 후보 영역이 됩니다. 규칙 기반 점수나 간단한 위험 모델을 얹으면 강조 색(예: 붉은
                톤)으로 단계를 나눌 수 있습니다.
              </p>
              <p className="fmcw-pipeline-guide__map muted">
                <strong>지도:</strong> 붉은/주황 폴리곤·부채꼴이 위험 예측 영역입니다.
                {hasRiskZones ? ' 이번 데이터에 위험 구역 설명이 포함되어 있습니다.' : ' (데이터에 따라 생략될 수 있습니다.)'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="fmcw-pipeline-guide__footnote muted">
        요약: <strong>DBSCAN</strong>으로 객체 단위를 만들고 → <strong>프레임 연속성</strong>으로 방향·속도를
        잡고 → <strong>외삽</strong>으로 궤적을 그린 뒤 → 지도에 <strong>위험 구역</strong>으로 옮깁니다.
      </p>
    </section>
  )
}
