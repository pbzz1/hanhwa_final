"""
예측 궤적 주변 버퍼 코리도(폴리곤 링).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.config import RadarPipelineConfig
from app.predictor import HorizonPrediction


@dataclass
class DangerCorridor:
    track_id: str
    horizon_s: float
    rings: list[list[list[float]]]


def _perp2d(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """세그먼트 a→b에 수직인 단위벡터 (XY)."""
    d = b - a
    n = float(np.linalg.norm(d[:2]))
    if n < 1e-9:
        return np.array([1.0, 0.0], dtype=np.float64)
    dx, dy = float(d[0] / n), float(d[1] / n)
    return np.array([-dy, dx], dtype=np.float64)


def buffer_polyline_corridor(
    points_xy: list[np.ndarray],
    buffer_m: float,
) -> list[list[float]]:
    """
    2D 폴리라인을 따라 좌우 `buffer_m` 만큼 확장한 단일 폐곡선 링을 만듭니다.

    반환: [[x,y], ...] (시계방향/반시계 무관, 닫힘은 첫점=끝점 권장)
    """
    if len(points_xy) < 2:
        p = points_xy[0][:2] if points_xy else np.zeros(2)
        sq = buffer_m
        return [
            [float(p[0] - sq), float(p[1] - sq)],
            [float(p[0] + sq), float(p[1] - sq)],
            [float(p[0] + sq), float(p[1] + sq)],
            [float(p[0] - sq), float(p[1] + sq)],
            [float(p[0] - sq), float(p[1] - sq)],
        ]
    left: list[list[float]] = []
    right: list[list[float]] = []
    for i in range(len(points_xy) - 1):
        a = points_xy[i][:2].astype(np.float64)
        b = points_xy[i + 1][:2].astype(np.float64)
        n = _perp2d(a, b) * buffer_m
        left.append((a + n).tolist())
        right.append((a - n).tolist())
    a = points_xy[-2][:2].astype(np.float64)
    b = points_xy[-1][:2].astype(np.float64)
    n = _perp2d(a, b) * buffer_m
    left.append((b + n).tolist())
    right.append((b - n).tolist())
    ring = left + right[::-1]
    if ring:
        ring.append(ring[0])
    return ring


def danger_zones_for_prediction(
    pred: HorizonPrediction,
    buffer_m: float | None = None,
) -> DangerCorridor:
    """
    `HorizonPrediction`의 XY 궤적에 버퍼 코리도를 씌웁니다.
    """
    buf = buffer_m if buffer_m is not None else RadarPipelineConfig().danger_buffer_m
    pts = [p[1][:2] for p in pred.positions]
    full = [pred.positions[0][1]] + [p[1] for p in pred.positions]
    ring = buffer_polyline_corridor(full, buf)
    return DangerCorridor(
        track_id=pred.track_id,
        horizon_s=pred.horizon_s,
        rings=[ring],
    )


def example_danger_zone() -> None:
    pred = HorizonPrediction(
        "T1",
        2.0,
        [(0.5, np.array([0.0, 0.0, 0.0])), (1.0, np.array([5.0, 0.0, 0.0]))],
    )
    dz = danger_zones_for_prediction(pred, buffer_m=2.0)
    assert dz.rings and len(dz.rings[0]) >= 4


if __name__ == "__main__":
    example_danger_zone()
    print("danger_zone OK")
