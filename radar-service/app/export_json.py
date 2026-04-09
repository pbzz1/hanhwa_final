"""
내부 상태 → `WebPayload` / JSON 직렬화.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import numpy as np

from app.candidate_scoring import ClusterCandidate
from app.config import RadarPipelineConfig
from app.danger_zone import DangerCorridor, danger_zones_for_prediction
from app.predictor import HorizonPrediction, predict_short_term
from app.risk import RiskBreakdown, compute_risk
from app.schemas import (
    DangerZoneSchema,
    DetectionSchema,
    PredictionSchema,
    TrackSchema,
    TrajectoryPointSchema,
    WebPayload,
)
from app.tracker import Track
from app.utils import bearing_deg_xy


def build_web_payload(
    *,
    frame_id: str,
    radar_frame_mode: str,
    processing_ms: float,
    detections: list[ClusterCandidate],
    tracks: list[Track],
    risk_by_track: dict[str, RiskBreakdown],
    predictions: list[HorizonPrediction],
    danger_zones: list[DangerCorridor],
    meta: dict[str, Any] | None = None,
) -> WebPayload:
    """
    파이프라인 산출물을 웹용 스키마로 묶습니다.
    """
    dets = [
        DetectionSchema(
            detection_id=f"cand-{c.cluster_label}",
            label="unknown_target",
            class_hint=None,
            centroid_m=c.centroid.tolist(),
            range_m=round(c.range_m, 3),
            azimuth_deg=round(c.azimuth_deg, 3),
            elevation_deg=round(c.elevation_deg, 3),
            doppler_mps=round(c.doppler_mps, 4),
            candidate_confidence=round(c.candidate_confidence, 4),
            cluster_point_count=c.point_count,
            radar_frame_mode=radar_frame_mode,
        )
        for c in detections
    ]
    ts_list: list[TrackSchema] = []
    for tr in tracks:
        rb = risk_by_track.get(tr.track_id) or compute_risk(tr)
        c = tr.position
        rng = float(np.linalg.norm(c))
        ts_list.append(
            TrackSchema(
                track_id=tr.track_id,
                label="unknown_target",
                centroid_m=c.tolist(),
                velocity_mps=tr.velocity.tolist(),
                range_m=round(rng, 3),
                azimuth_deg=round(bearing_deg_xy(float(c[0]), float(c[1])), 3),
                track_confidence=round(min(1.0, 0.2 + 0.1 * tr.hits + 0.5 * tr.candidate_confidence_last), 4),
                hits=tr.hits,
                age_frames=tr.age,
                candidate_confidence_last=round(tr.candidate_confidence_last, 4),
                risk_score=round(rb.score, 4),
                risk_level=rb.level,  # type: ignore[arg-type]
                risk_components=rb.components,
            )
        )
    preds_out: list[PredictionSchema] = []
    for hp in predictions:
        preds_out.append(
            PredictionSchema(
                track_id=hp.track_id,
                horizon_s=hp.horizon_s,
                points=[
                    TrajectoryPointSchema(t_offset_s=round(t, 4), position_m=p.tolist()) for t, p in hp.positions
                ],
            )
        )
    dz_out = [
        DangerZoneSchema(
            track_id=dz.track_id,
            horizon_s=dz.horizon_s,
            rings=dz.rings,
        )
        for dz in danger_zones
    ]
    return WebPayload(
        frame_id=frame_id,
        timestamp_unix_ms=int(time.time() * 1000),
        radar_frame_mode=radar_frame_mode,  # type: ignore[arg-type]
        processing_ms=round(processing_ms, 3),
        detections=dets,
        tracks=ts_list,
        predictions=preds_out,
        danger_zones=dz_out,
        meta=meta or {},
    )


def save_web_payload(path: str | Path, payload: WebPayload) -> None:
    """UTF-8 JSON으로 저장."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(payload.model_dump_json(indent=2), encoding="utf-8")


def payload_to_json_dict(payload: WebPayload) -> dict[str, Any]:
    """일반 dict (JSON 직렬화 호환)."""
    return json.loads(payload.model_dump_json())


def example_export_json() -> None:
    from app.tracker import KalmanCV3D, Track

    kf = KalmanCV3D(0.1)
    kf.configure_noise(0.5, 0.5, 0.5)
    kf.x[0:3] = [20.0, 1.0, 0.0]
    tr = Track("T9", kf, hits=2, age=2, time_since_update=0, candidate_confidence_last=0.7)
    rb = compute_risk(tr)
    hp = predict_short_term(tr, (1.0,))[0]
    dz = danger_zones_for_prediction(hp, buffer_m=5.0)
    cand = ClusterCandidate(0, tr.position, 20.0, 0, 0, 0, 0, 5, 0.6)
    wp = build_web_payload(
        frame_id="demo",
        radar_frame_mode="radar",
        processing_ms=1.0,
        detections=[cand],
        tracks=[tr],
        risk_by_track={tr.track_id: rb},
        predictions=[hp],
        danger_zones=[dz],
    )
    assert wp.detections[0].detection_id.startswith("cand-")


if __name__ == "__main__":
    example_export_json()
    print("export_json OK")
