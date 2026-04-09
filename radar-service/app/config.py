"""
운영·실험 파라미터. 환경변수로 덮어쓸 수 있습니다.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RadarPipelineConfig:
    """레이더 단독 파이프라인 설정."""

    dbscan_eps_m: float = float(os.getenv("RADAR_DBSCAN_EPS", "4.0"))
    dbscan_min_samples: int = int(os.getenv("RADAR_DBSCAN_MIN_SAMPLES", "3"))
    candidate_score_threshold: float = float(os.getenv("RADAR_CANDIDATE_MIN_SCORE", "0.35"))
    max_detections: int = int(os.getenv("RADAR_MAX_DETECTIONS", "24"))
    track_gate_m: float = float(os.getenv("RADAR_TRACK_GATE_M", "12.0"))
    frame_dt_s: float = float(os.getenv("RADAR_FRAME_DT_S", "0.077"))
    prediction_horizons_s: tuple[float, ...] = (1.0, 2.0, 3.0)
    danger_buffer_m: float = float(os.getenv("RADAR_DANGER_BUFFER_M", "8.0"))
    asset_position: tuple[float, float, float] = (0.0, 0.0, 0.0)  # 레이더·보호 자산 원점(차량 좌표계)
    kalman_pos_noise: float = 0.8
    kalman_vel_noise: float = 1.2
    kalman_meas_noise: float = 1.5


DEFAULT_CONFIG = RadarPipelineConfig()
