"""
DBSCAN 기반 레이더 포인트 클러스터링.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.cluster import DBSCAN

from app.config import RadarPipelineConfig


@dataclass
class ClusterSlice:
    """단일 클러스터에 대한 뷰."""

    label: int
    mask: np.ndarray  # bool (N,)


def dbscan_clusters(
    xyz: np.ndarray,
    cfg: RadarPipelineConfig | None = None,
) -> list[ClusterSlice]:
    """
    3D 위치 `xyz`에 DBSCAN을 적용해 노이즈(-1)를 제외한 클러스터 마스크 목록을 반환합니다.
    """
    cfg = cfg or RadarPipelineConfig()
    if xyz.shape[0] == 0:
        return []
    clustering = DBSCAN(eps=cfg.dbscan_eps_m, min_samples=cfg.dbscan_min_samples).fit(xyz)
    labels = clustering.labels_
    out: list[ClusterSlice] = []
    for lab in sorted(set(labels.tolist())):
        if lab < 0:
            continue
        m = labels == lab
        out.append(ClusterSlice(label=int(lab), mask=m))
    return out


def example_clustering() -> None:
    rng = np.random.default_rng(0)
    a = rng.normal(size=(40, 3)) * 0.3 + np.array([10.0, 2.0, 0.0])
    b = rng.normal(size=(40, 3)) * 0.3 + np.array([-5.0, 8.0, 0.5])
    xyz = np.vstack([a, b])
    sl = dbscan_clusters(xyz, RadarPipelineConfig(dbscan_eps_m=2.0, dbscan_min_samples=4))
    assert len(sl) >= 1


if __name__ == "__main__":
    example_clustering()
    print("clustering OK")
