"""
웹·API용 스키마(Pydantic). 내부 연산은 numpy 위주로 두고 마지막에 직렬화합니다.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Vec3(BaseModel):
    x: float
    y: float
    z: float


class DetectionSchema(BaseModel):
    """단일 프레임 클러스터 후보(탐지)."""

    detection_id: str
    label: Literal["target", "unknown_target"] = "unknown_target"
    class_hint: str | None = Field(
        default=None,
        description="선택적 휴리스틱 힌트. 운용 판단의 필수 조건으로 쓰지 않음.",
    )
    centroid_m: list[float] = Field(..., min_length=3, max_length=3)
    range_m: float
    azimuth_deg: float
    elevation_deg: float
    doppler_mps: float
    candidate_confidence: float = Field(..., ge=0.0, le=1.0)
    cluster_point_count: int
    radar_frame_mode: str = "radar"


class TrajectoryPointSchema(BaseModel):
    t_offset_s: float
    position_m: list[float]


class PredictionSchema(BaseModel):
    """트랙별 단기 예측(다중 horizon)."""

    track_id: str
    horizon_s: float
    points: list[TrajectoryPointSchema]


class DangerZoneSchema(BaseModel):
    """예측 궤적 주변 버퍼 폴리곤(링 하나 이상)."""

    track_id: str
    horizon_s: float
    kind: Literal["corridor_polygon"] = "corridor_polygon"
    rings: list[list[list[float]]]  # 각 ring: [[x,y], ...] 폐곡선


class TrackSchema(BaseModel):
    """연속 프레임에 걸친 추적 상태."""

    track_id: str
    label: Literal["target", "unknown_target"] = "unknown_target"
    centroid_m: list[float]
    velocity_mps: list[float]
    range_m: float
    azimuth_deg: float
    track_confidence: float = Field(..., ge=0.0, le=1.0)
    hits: int
    age_frames: int
    candidate_confidence_last: float
    risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_level: Literal["low", "medium", "high"]
    risk_components: dict[str, float]


class WebPayload(BaseModel):
    """프론트·백엔드가 소비하는 단일 JSON 페이로드."""

    schema_version: str = "1.0"
    frame_id: str
    timestamp_unix_ms: int
    radar_frame_mode: Literal["radar", "radar_3frames", "radar_5frames"] = "radar"
    processing_ms: float
    detections: list[DetectionSchema]
    tracks: list[TrackSchema]
    predictions: list[PredictionSchema]
    danger_zones: list[DangerZoneSchema]
    meta: dict[str, Any] = Field(default_factory=dict)
