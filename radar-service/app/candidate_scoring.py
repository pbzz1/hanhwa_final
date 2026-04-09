"""
클러스터 후보 점수화 및 저신뢰 제거.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.config import RadarPipelineConfig
from app.clustering import ClusterSlice
from app.utils import bearing_deg_xy


@dataclass
class ClusterCandidate:
    """탐지 후보(한 클러스터)."""

    cluster_label: int
    centroid: np.ndarray  # (3,)
    range_m: float
    azimuth_deg: float
    elevation_deg: float
    doppler_mps: float
    rcs_mean: float
    point_count: int
    candidate_confidence: float


def score_cluster(
    xyz: np.ndarray,
    v_comp: np.ndarray,
    rcs: np.ndarray,
    sl: ClusterSlice,
) -> ClusterCandidate:
    """
    클러스터 통계로부터 기하·도플러·RCS·점 밀도 기반 `candidate_confidence`를 계산합니다.
    """
    m = sl.mask
    c = xyz[m].mean(axis=0).astype(np.float64)
    rng = float(np.linalg.norm(c))
    az = bearing_deg_xy(float(c[0]), float(c[1]))
    el = float(np.degrees(np.arctan2(c[2], np.hypot(c[0], c[1]) + 1e-6)))
    vd = v_comp[m]
    doppler_mps = float(np.mean(vd)) if vd.size else 0.0
    rc = rcs[m]
    rcs_mean = float(np.mean(rc)) if rc.size else 0.0
    npts = int(m.sum())
    conf = min(
        0.99,
        0.22
        + 0.02 * min(npts, 25)
        + 0.18 * min(abs(doppler_mps) / 10.0, 1.0)
        + 0.12 * min(rcs_mean / 35.0, 1.0),
    )
    return ClusterCandidate(
        cluster_label=sl.label,
        centroid=c,
        range_m=rng,
        azimuth_deg=az,
        elevation_deg=el,
        doppler_mps=doppler_mps,
        rcs_mean=rcs_mean,
        point_count=npts,
        candidate_confidence=conf,
    )


def filter_and_rank_candidates(
    candidates: list[ClusterCandidate],
    cfg: RadarPipelineConfig | None = None,
) -> list[ClusterCandidate]:
    """
    `candidate_confidence` 임계 미만 제거 후 점수 내림차순, 상한 개수로 자릅니다.
    """
    cfg = cfg or RadarPipelineConfig()
    kept = [c for c in candidates if c.candidate_confidence >= cfg.candidate_score_threshold]
    kept.sort(key=lambda x: x.candidate_confidence, reverse=True)
    return kept[: cfg.max_detections]


def example_candidate_scoring() -> None:
    rng = np.random.default_rng(1)
    xyz = rng.normal(size=(30, 3)) * 0.2 + np.array([12.0, 1.0, 0.0])
    v = rng.normal(size=30) * 0.5
    rcs = np.abs(rng.normal(size=30)) * 5 + 5
    from app.clustering import ClusterSlice

    sl = ClusterSlice(label=0, mask=np.ones(30, dtype=bool))
    c = score_cluster(xyz, v, rcs, sl)
    assert 0 <= c.candidate_confidence <= 1.0


if __name__ == "__main__":
    example_candidate_scoring()
    print("candidate_scoring OK")
