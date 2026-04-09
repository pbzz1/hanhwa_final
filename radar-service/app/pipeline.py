"""
엔드투엔드 레이더 단독 파이프라인(탐지 → 추적 → 예측 → 위험 → 코리도 → JSON).
"""

from __future__ import annotations

import time
from typing import Any, Literal

import numpy as np

from app.candidate_scoring import filter_and_rank_candidates, score_cluster
from app.clustering import dbscan_clusters
from app.config import DEFAULT_CONFIG, RadarPipelineConfig
from app.danger_zone import danger_zones_for_prediction
from app.export_json import build_web_payload
from app.predictor import HorizonPrediction, predict_short_term
from app.preprocess import preprocess_radar_points
from app.risk import compute_risk
from app.schemas import WebPayload
from app.tracker import TrackManager

RadarMode = Literal["radar", "radar_3frames", "radar_5frames"]


def run_pipeline_frame(
    radar: np.ndarray,
    *,
    frame_id: str,
    radar_frame_mode: RadarMode = "radar",
    track_manager: TrackManager | None = None,
    cfg: RadarPipelineConfig | None = None,
    meta_extra: dict[str, Any] | None = None,
) -> tuple[WebPayload, TrackManager]:
    """
    단일 (또는 스택된) 레이더 프레임 배열에 대해 전체 파이프라인을 실행합니다.

    Parameters
    ----------
    radar :
        (N, 7) VoD 레이더 포인트.
    track_manager :
        이전 프레임까지의 추적기. `None`이면 새로 생성합니다.
    """
    cfg = cfg or DEFAULT_CONFIG
    t0 = time.perf_counter()
    clean = preprocess_radar_points(radar)
    mgr = track_manager or TrackManager(cfg)

    if clean.shape[0] == 0:
        processing_ms = (time.perf_counter() - t0) * 1000.0
        payload = build_web_payload(
            frame_id=frame_id,
            radar_frame_mode=radar_frame_mode,
            processing_ms=processing_ms,
            detections=[],
            tracks=[],
            risk_by_track={},
            predictions=[],
            danger_zones=[],
            meta={"pipeline": "radar-only-v1", **(meta_extra or {})},
        )
        return payload, mgr

    xyz = clean[:, :3]
    v_comp = clean[:, 5]
    rcs = clean[:, 3]
    slices = dbscan_clusters(xyz, cfg)
    candidates = [score_cluster(xyz, v_comp, rcs, sl) for sl in slices]
    candidates = filter_and_rank_candidates(candidates, cfg)
    tracks = mgr.step(candidates)
    risk_by_track = {tr.track_id: compute_risk(tr, cfg) for tr in tracks}

    predictions: list[HorizonPrediction] = []
    danger_list = []
    horizons = cfg.prediction_horizons_s
    for tr in tracks:
        preds = predict_short_term(tr, horizons, steps_per_horizon=5)
        predictions.extend(preds)
        for hp in preds:
            danger_list.append(danger_zones_for_prediction(hp, buffer_m=cfg.danger_buffer_m))

    processing_ms = (time.perf_counter() - t0) * 1000.0
    meta = {
        "pipeline": "radar-only-v1",
        "dbscan_eps_m": cfg.dbscan_eps_m,
        "track_gate_m": cfg.track_gate_m,
        "horizons_s": list(horizons),
        **(meta_extra or {}),
    }
    payload = build_web_payload(
        frame_id=frame_id,
        radar_frame_mode=radar_frame_mode,
        processing_ms=processing_ms,
        detections=candidates,
        tracks=tracks,
        risk_by_track=risk_by_track,
        predictions=predictions,
        danger_zones=danger_list,
        meta=meta,
    )
    return payload, mgr


def example_pipeline() -> None:
    rng = np.random.default_rng(42)
    a = rng.normal(size=(35, 3)) * 0.25 + np.array([25.0, 3.0, 0.2])
    b = rng.normal(size=(30, 3)) * 0.3 + np.array([-15.0, 20.0, 0.0])
    xyz = np.vstack([a, b]).astype(np.float32)
    n = xyz.shape[0]
    rcs = (np.abs(rng.normal(size=n)) * 5 + 5).astype(np.float32)
    vr = rng.normal(size=n).astype(np.float32) * 0.3
    vcomp = rng.normal(size=n).astype(np.float32) * 0.5
    tim = np.zeros(n, dtype=np.float32)
    full = np.column_stack([xyz, rcs, vr, vcomp, tim])
    _, m1 = run_pipeline_frame(full, frame_id="f0", radar_frame_mode="radar")
    shifted = full.copy()
    shifted[:, 0:3] += 0.05
    _, _ = run_pipeline_frame(shifted, frame_id="f1", radar_frame_mode="radar", track_manager=m1)


if __name__ == "__main__":
    example_pipeline()
    print("pipeline OK")
