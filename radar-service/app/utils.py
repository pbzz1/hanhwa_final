"""
기하·각도 유틸리티.
"""

from __future__ import annotations

import math

import numpy as np


def bearing_deg_xy(x: float, y: float) -> float:
    """XY 평면에서 원점 기준 방위각(도)."""
    return float(math.degrees(math.atan2(y, x)))


def angle_diff_abs_deg(a: float, b: float) -> float:
    """두 방위각 차이(절댓값, 0~180)."""
    d = (a - b + 180.0) % 360.0 - 180.0
    return abs(d)


def norm3(v: np.ndarray) -> float:
    """3벡터 노름."""
    return float(np.linalg.norm(v.astype(np.float64)))


def unit_xy(v: np.ndarray) -> np.ndarray:
    """XY 성분 단위벡터."""
    xy = v[:2].astype(np.float64)
    n = float(np.linalg.norm(xy))
    if n < 1e-9:
        return np.array([0.0, 0.0], dtype=np.float64)
    return xy / n


def example_utils() -> None:
    """모듈 동작 확인용."""
    assert abs(bearing_deg_xy(1.0, 0.0) - 0.0) < 1e-6
    assert angle_diff_abs_deg(350.0, 10.0) == 20.0


if __name__ == "__main__":
    example_utils()
    print("utils OK")
