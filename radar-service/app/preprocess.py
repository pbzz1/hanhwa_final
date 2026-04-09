"""
레이더 포인트 전처리(유효성, 거리 게이트 등).
"""

from __future__ import annotations

import numpy as np


def preprocess_radar_points(
    radar: np.ndarray,
    *,
    max_range_m: float | None = 200.0,
    min_range_m: float = 0.5,
) -> np.ndarray:
    """
    (N,7) 레이더 배열에서 유효한 점만 남깁니다.

    - NaN/Inf 제거
    - 선택적 거리 게이트(유클리드 norm of xyz)
    """
    if radar.size == 0:
        return radar
    xyz = radar[:, :3]
    ok = np.isfinite(xyz).all(axis=1)
    r = np.linalg.norm(xyz, axis=1)
    ok &= r >= min_range_m
    if max_range_m is not None:
        ok &= r <= max_range_m
    return radar[ok]


def example_preprocess() -> None:
    x = np.array(
        [
            [1.0, 0.0, 0.0, 0, 0, 0, 0],
            [np.nan, 0, 0, 0, 0, 0, 0],
            [300.0, 0, 0, 0, 0, 0, 0],
        ],
        dtype=np.float32,
    )
    y = preprocess_radar_points(x, max_range_m=200.0)
    assert y.shape[0] == 1


if __name__ == "__main__":
    example_preprocess()
    print("preprocess OK")
