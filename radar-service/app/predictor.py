"""
트랙 상태 기반 단기 궤적 예측(1/2/3초 horizon).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.tracker import Track


@dataclass
class HorizonPrediction:
    track_id: str
    horizon_s: float
    positions: list[tuple[float, np.ndarray]]  # (t_offset_s, xyz)


def predict_short_term(
    track: Track,
    horizons_s: tuple[float, ...] = (1.0, 2.0, 3.0),
    *,
    steps_per_horizon: int = 5,
) -> list[HorizonPrediction]:
    """
    상수속도로 각 horizon까지 선형 외삽한 샘플 점들을 반환합니다.

    각 horizon 구간을 `steps_per_horizon`개로 나눕니다.
    """
    p0 = track.position.astype(np.float64)
    v = track.velocity.astype(np.float64)
    out: list[HorizonPrediction] = []
    for H in horizons_s:
        pts: list[tuple[float, np.ndarray]] = []
        for k in range(1, steps_per_horizon + 1):
            t_off = H * (k / steps_per_horizon)
            pts.append((t_off, p0 + v * t_off))
        out.append(HorizonPrediction(track_id=track.track_id, horizon_s=H, positions=pts))
    return out


def example_predictor() -> None:
    from app.tracker import KalmanCV3D
    kf = KalmanCV3D(dt=0.1)
    kf.configure_noise(0.5, 0.5, 0.5)
    kf.x[0:3] = [0.0, 0.0, 0.0]
    kf.x[3:6] = [5.0, 0.0, 0.0]
    tr = Track("T1", kf, hits=3, age=3, time_since_update=0, candidate_confidence_last=0.9)
    preds = predict_short_term(tr, (1.0, 2.0))
    assert len(preds) == 2
    assert preds[0].positions[-1][1][0] > 4.0


if __name__ == "__main__":
    example_predictor()
    print("predictor OK")
