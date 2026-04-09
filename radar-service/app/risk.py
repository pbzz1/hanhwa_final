"""
거리·접근 속도·자산 방향·트랙 안정도·신뢰도를 조합한 위험도.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.config import RadarPipelineConfig
from app.tracker import Track, track_stability
from app.utils import norm3, unit_xy


@dataclass
class RiskBreakdown:
    score: float
    level: str
    components: dict[str, float]


def compute_risk(
    track: Track,
    cfg: RadarPipelineConfig | None = None,
) -> RiskBreakdown:
    """
    위험도 구성요소:

    - distance: 가까울수록 높음
    - approach_speed: 레이더 원점(자산) 쪽으로의 접근 성분이 클수록 높음
    - heading_to_asset: 속도 벡터가 자산 방향과 정렬될수록 높음
    - track_stability: `track_stability()` 휴리스틱
    - confidence: `track.candidate_confidence_last` (마지막 검출 신뢰도)
    """
    cfg = cfg or RadarPipelineConfig()
    asset = np.array(cfg.asset_position, dtype=np.float64)
    c = track.position.astype(np.float64)
    v = track.velocity.astype(np.float64)
    r = norm3(c - asset)
    r_ref = 120.0
    d_norm = max(0.0, min(1.0, 1.0 - r / max(r_ref, 1.0)))

    # 접근 속도: 원점 방향 단위벡터와 속도의 내적 (양수면 접근)
    to_asset = -c.astype(np.float64)
    rn = norm3(to_asset)
    if rn > 0.5:
        u = to_asset / rn
        approach = float(np.dot(v, u))
    else:
        approach = 0.0
    # 음수(이탈)는 위험 완화, 양수(접근)는 증가
    approach_norm = max(0.0, min(1.0, (approach + 5.0) / 20.0))

    spd_xy = float(np.hypot(v[0], v[1]))
    if spd_xy > 0.1 and rn > 0.5:
        vdir = unit_xy(v)
        cxy = unit_xy(-c)  # 자산 쪽
        heading = max(0.0, float(np.dot(vdir, cxy)))
    else:
        heading = 0.0

    stab = track_stability(track)
    conf = float(track.candidate_confidence_last)

    score = (
        0.28 * d_norm
        + 0.26 * approach_norm
        + 0.18 * heading
        + 0.16 * stab
        + 0.12 * conf
    )
    score = float(max(0.0, min(1.0, score)))
    if score < 0.35:
        level = "low"
    elif score < 0.65:
        level = "medium"
    else:
        level = "high"

    return RiskBreakdown(
        score=score,
        level=level,
        components={
            "distance": round(d_norm, 4),
            "approach_speed": round(approach_norm, 4),
            "heading_to_asset": round(heading, 4),
            "track_stability": round(stab, 4),
            "confidence": round(conf, 4),
        },
    )


def example_risk() -> None:
    from app.tracker import KalmanCV3D, Track

    kf = KalmanCV3D(dt=0.1)
    kf.configure_noise(0.5, 0.5, 0.5)
    kf.x[0:3] = [30.0, 0.0, 0.0]
    kf.x[3:6] = [-8.0, 0.0, 0.0]
    tr = Track("T1", kf, hits=5, age=5, time_since_update=0, candidate_confidence_last=0.85)
    rb = compute_risk(tr)
    assert rb.score >= 0.0


if __name__ == "__main__":
    example_risk()
    print("risk OK")
