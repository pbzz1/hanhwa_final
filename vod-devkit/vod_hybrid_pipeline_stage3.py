"""
VoD hybrid risk pipeline — Stage 3.

Candidate suppression, proposal quality, LiDAR corroboration v3,
track-level temporal reasoning, rule decomposition v2, calibration / uncertainty,
ranking extensions, explainability helpers, profiling, light/full presets.

Depends on: vod_hybrid_pipeline_v2 (LiDAR v1 attach, hybrid labels, ranking base).
"""

from __future__ import annotations

import math
import os
import time
from collections import defaultdict
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import pandas as pd

from sklearn.cluster import DBSCAN
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, ndcg_score
from sklearn.preprocessing import StandardScaler

from vod_hybrid_pipeline_v2 import (
    attach_lidar_corroboration_v2,
    assign_hybrid_labels_from_scores,
    assign_hybrid_risk_labels,
    compute_rule_score_raw,
    compute_ttc,
    ranking_metrics_extended,
    threshold_sensitivity_table,
)

try:
    from scipy.optimize import linear_sum_assignment

    SCIPY_OK = True
except Exception:  # pragma: no cover
    SCIPY_OK = False

try:
    import hdbscan

    HDBSCAN_OK = True
except Exception:  # pragma: no cover
    HDBSCAN_OK = False

# ---------------------------------------------------------------------------
# Defaults (clustering / tracking)
# ---------------------------------------------------------------------------

DEFAULT_DBSCAN_EPS = float(os.environ.get("VOD_DBSCAN_EPS", "0.35"))
DEFAULT_DBSCAN_MIN_SAMPLES = int(os.environ.get("VOD_DBSCAN_MIN_SAMPLES", "4"))
DEFAULT_HDBSCAN_MIN_CLUSTER_SIZE = int(os.environ.get("VOD_HDBSCAN_MIN_CLUSTER_SIZE", "8"))
DEFAULT_RADAR_DT_SEC = 0.1
DEFAULT_TRACK_GATE_DIST = 2.5


def _assign_greedy(cost_mat: np.ndarray, gate: float) -> list[tuple[int, int]]:
    if cost_mat.size == 0:
        return []
    pairs: list[tuple[int, int]] = []
    used_r, used_c = set(), set()
    flat = [(i, j, cost_mat[i, j]) for i in range(cost_mat.shape[0]) for j in range(cost_mat.shape[1])]
    flat.sort(key=lambda x: x[2])
    for i, j, c in flat:
        if c > gate:
            continue
        if i in used_r or j in used_c:
            continue
        used_r.add(i)
        used_c.add(j)
        pairs.append((i, j))
    return pairs


TRACK_OBS_SCHEMA_DEFAULTS: dict[str, Any] = {
    "cluster_uid": "",
    "frame_order": 0,
    "track_id": -1,
    "obs_speed": 0.0,
    "obs_heading": 0.0,
    "approach_delta": 0.0,
    "track_len": 1,
    "avg_speed": 0.0,
    "heading_change": 0.0,
    "approach_score": 0.0,
    "temporal_stability_score": 0.0,
    "cluster_persistence": 0.0,
}


def normalize_track_obs_schema(obs: pd.DataFrame | None) -> pd.DataFrame:
    if obs is None or not isinstance(obs, pd.DataFrame):
        obs = pd.DataFrame()
    out = obs.copy()
    for c, d in TRACK_OBS_SCHEMA_DEFAULTS.items():
        if c not in out.columns:
            out[c] = d
        out[c] = out[c].fillna(d)
    out["track_id"] = pd.to_numeric(out["track_id"], errors="coerce").fillna(-1).astype(int)
    out["frame_order"] = pd.to_numeric(out["frame_order"], errors="coerce").fillna(0).astype(int)
    return out


def run_tracking(
    cluster_df_local: pd.DataFrame,
    mode: str = "baseline",
    gate_dist: float = DEFAULT_TRACK_GATE_DIST,
    max_miss: int = 2,
    radar_dt_sec: float = DEFAULT_RADAR_DT_SEC,
) -> pd.DataFrame:
    work = cluster_df_local.sort_values(["frame_order", "cluster_id"]).copy().reset_index(drop=True)
    next_track_id = 0
    active: dict[int, dict[str, Any]] = {}
    obs_rows: list[dict[str, Any]] = []

    for frame_order, frame_grp in work.groupby("frame_order"):
        cur = frame_grp.copy().reset_index(drop=True)
        cur_pos = cur[["cx", "cy"]].to_numpy(dtype=np.float32)
        cur_uid = cur["cluster_uid"].tolist()
        cur_range = cur["range_xy"].to_numpy(dtype=np.float32)

        active_ids = list(active.keys())
        assigned_pairs: list[tuple[int, int]] = []

        if active_ids and len(cur_pos) > 0:
            pred_pos = []
            for tid in active_ids:
                tr = active[tid]
                if mode == "improved" and tr.get("vel") is not None:
                    p = tr["pos"] + tr["vel"] * radar_dt_sec
                else:
                    p = tr["pos"]
                pred_pos.append(p)
            pred_pos = np.asarray(pred_pos)
            cost = np.linalg.norm(pred_pos[:, None, :] - cur_pos[None, :, :], axis=2)
            if mode == "improved" and SCIPY_OK:
                ri, ci = linear_sum_assignment(cost)
                assigned_pairs = [(int(r), int(c)) for r, c in zip(ri, ci) if cost[r, c] <= gate_dist]
            else:
                assigned_pairs = _assign_greedy(cost, gate_dist)

        matched_active: set[int] = set()
        matched_cur: set[int] = set()

        for r, c in assigned_pairs:
            tid = active_ids[r]
            matched_active.add(tid)
            matched_cur.add(c)
            tr = active[tid]
            prev_pos = tr["pos"]
            new_pos = cur_pos[c]
            vel = (new_pos - prev_pos) / max(radar_dt_sec, 1e-6)
            speed = float(np.linalg.norm(vel))
            heading = float(math.atan2(vel[1], vel[0])) if speed > 1e-6 else float(tr.get("heading", 0.0))
            approach_delta = float(tr.get("last_range", cur_range[c]) - cur_range[c])
            tr["pos"] = new_pos
            tr["vel"] = vel
            tr["last_range"] = float(cur_range[c])
            tr["last_frame"] = int(frame_order)
            tr["miss"] = 0
            tr.setdefault("speeds", []).append(speed)
            tr.setdefault("headings", []).append(heading)
            tr.setdefault("approach_deltas", []).append(approach_delta)
            tr.setdefault("uids", []).append(cur_uid[c])
            obs_rows.append(
                {
                    "cluster_uid": cur_uid[c],
                    "frame_order": int(frame_order),
                    "track_id": int(tid),
                    "obs_speed": speed,
                    "obs_heading": heading,
                    "approach_delta": approach_delta,
                }
            )

        for c in range(len(cur_pos)):
            if c in matched_cur:
                continue
            tid = next_track_id
            next_track_id += 1
            active[tid] = {
                "pos": cur_pos[c],
                "vel": np.array([0.0, 0.0], dtype=np.float32),
                "last_range": float(cur_range[c]),
                "last_frame": int(frame_order),
                "miss": 0,
                "speeds": [0.0],
                "headings": [0.0],
                "approach_deltas": [0.0],
                "uids": [cur_uid[c]],
            }
            obs_rows.append(
                {
                    "cluster_uid": cur_uid[c],
                    "frame_order": int(frame_order),
                    "track_id": int(tid),
                    "obs_speed": 0.0,
                    "obs_heading": 0.0,
                    "approach_delta": 0.0,
                }
            )

        for tid in list(active.keys()):
            if tid in matched_active:
                continue
            active[tid]["miss"] += 1
            if active[tid]["miss"] > max_miss:
                del active[tid]

    obs_df = normalize_track_obs_schema(pd.DataFrame(obs_rows))
    if obs_df.empty:
        return obs_df

    n_frames = max(int(cluster_df_local["frame_order"].nunique()), 1)
    trows = []
    for tid, g in obs_df.groupby("track_id"):
        g = g.sort_values("frame_order")
        speeds = g["obs_speed"].to_numpy(dtype=np.float64)
        heads = g["obs_heading"].to_numpy(dtype=np.float64)
        apps = g["approach_delta"].to_numpy(dtype=np.float64)
        heading_change = float(np.mean(np.abs(np.diff(heads)))) if len(heads) > 1 else 0.0
        # Closing proxy: positive when range decreases (approach). Use signed rate, not only positive deltas.
        closing_rate = np.clip(-apps / max(radar_dt_sec, 1e-6), 0.0, None)
        approach_score = float(np.mean(closing_rate)) if closing_rate.size else 0.0
        # Speed consistency: avoid exp(-std) collapsing to ~0 for natural speed jitter.
        spd_std = float(np.std(speeds)) if speeds.size else 0.0
        temporal_stability = float(1.0 / (1.0 + spd_std)) * float(np.log1p(len(g)) / np.log1p(6.0))
        trows.append(
            {
                "track_id": int(tid),
                "track_len": int(len(g)),
                "avg_speed": float(np.mean(speeds)),
                "heading_change": heading_change,
                "approach_score": approach_score,
                "temporal_stability_score": temporal_stability,
                "cluster_persistence": float(len(g) / n_frames),
            }
        )
    track_summary = pd.DataFrame(trows)
    out = obs_df.merge(track_summary, on="track_id", how="left")
    return normalize_track_obs_schema(out)


# ---------------------------------------------------------------------------
# Cluster proposal (DBSCAN / HDBSCAN) — extracted from Stage2 notebook
# ---------------------------------------------------------------------------


def cluster_points_one_frame(
    frame_pts: pd.DataFrame,
    method: str = "dbscan",
    *,
    dbscan_eps: float = DEFAULT_DBSCAN_EPS,
    dbscan_min_samples: int = DEFAULT_DBSCAN_MIN_SAMPLES,
    hdbscan_min_cluster_size: int = DEFAULT_HDBSCAN_MIN_CLUSTER_SIZE,
) -> tuple[np.ndarray, dict[str, float]]:
    if frame_pts.empty:
        return np.zeros((0,), dtype=np.int32), {"noise_ratio": 1.0, "persistence_mean": float("nan")}

    x = frame_pts[["x", "y", "v_r_compensated"]].to_numpy(dtype=np.float32)
    x_scaled = StandardScaler().fit_transform(x)

    if method == "hdbscan" and HDBSCAN_OK:
        clusterer = hdbscan.HDBSCAN(min_cluster_size=hdbscan_min_cluster_size, min_samples=5)
        labels = clusterer.fit_predict(x_scaled)
        pers = getattr(clusterer, "cluster_persistence_", None)
        if pers is None:
            persistence_mean = float("nan")
        else:
            pers_arr = np.asarray(pers, dtype=np.float64).reshape(-1)
            persistence_mean = float(np.mean(pers_arr)) if pers_arr.size > 0 else float("nan")
    else:
        clusterer = DBSCAN(eps=dbscan_eps, min_samples=dbscan_min_samples)
        labels = clusterer.fit_predict(x_scaled)
        persistence_mean = float("nan")

    noise_ratio = float(np.mean(labels < 0)) if len(labels) > 0 else 1.0
    return labels.astype(np.int32), {"noise_ratio": noise_ratio, "persistence_mean": persistence_mean}


def build_cluster_tables(
    radar_df_local: pd.DataFrame,
    methods: list[str],
    **cluster_kw: Any,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    cluster_rows: list[dict[str, Any]] = []
    frame_quality_rows: list[dict[str, Any]] = []

    for method in methods:
        for frame_id, grp in radar_df_local.groupby("frame_id"):
            labels, meta = cluster_points_one_frame(grp, method=method, **cluster_kw)
            if labels.shape[0] != grp.shape[0]:
                continue
            tmp = grp.copy().reset_index(drop=True)
            tmp["cluster_id"] = labels
            frame_quality_rows.append(
                {
                    "algorithm": method,
                    "frame_id": frame_id,
                    "frame_order": int(tmp["frame_order"].iloc[0]),
                    "noise_ratio": float(meta["noise_ratio"]),
                    "persistence_mean": float(meta["persistence_mean"]) if np.isfinite(meta["persistence_mean"]) else np.nan,
                    "n_clusters": int(tmp.loc[tmp["cluster_id"] >= 0, "cluster_id"].nunique()),
                    "n_points": int(len(tmp)),
                }
            )
            for cid, cgrp in tmp.groupby("cluster_id"):
                if int(cid) < 0:
                    continue
                cx, cy, cz = cgrp[["x", "y", "z"]].mean().values
                spread_xy = float(np.sqrt(cgrp[["x", "y"]].var(ddof=0).sum()))
                n_points = int(len(cgrp))
                density_proxy = float(n_points / max(spread_xy + 1e-3, 1e-3))
                cluster_rows.append(
                    {
                        "algorithm": method,
                        "frame_id": frame_id,
                        "frame_order": int(cgrp["frame_order"].iloc[0]),
                        "cluster_id": int(cid),
                        "cluster_uid": f"{method}:{frame_id}:{int(cid)}",
                        "n_points": n_points,
                        "cx": float(cx),
                        "cy": float(cy),
                        "cz": float(cz),
                        "range_xy": float(np.hypot(cx, cy)),
                        "spread_xy": spread_xy,
                        "density_proxy": density_proxy,
                        "mean_rcs": float(cgrp["RCS"].mean()),
                        "rcs_std": float(cgrp["RCS"].std(ddof=0)),
                        "mean_vr_comp": float(cgrp["v_r_compensated"].mean()),
                        "abs_vr_comp": float(cgrp["v_r_compensated"].abs().mean()),
                        "vr_comp_std": float(cgrp["v_r_compensated"].std(ddof=0)),
                        "z_std": float(cgrp["z"].std(ddof=0)),
                        "time_mean": float(cgrp["time"].mean()),
                    }
                )

    return pd.DataFrame(cluster_rows), pd.DataFrame(frame_quality_rows)


# ---------------------------------------------------------------------------
# 1. Candidate suppression + proposal quality
# ---------------------------------------------------------------------------


@dataclass
class SuppressionConfig:
    min_n_points: int = 3
    min_density_proxy: float = 0.12
    max_spread_xy: float = 24.0
    min_range_xy: float = 0.5
    drop_low_lidar_and_sparse: bool = True
    lidar_cor_threshold: float = 0.08
    density_proxy_sparse: float = 0.08
    merge_near_duplicate_eps: float = 0.38
    single_frame_max_speed: float = 0.35
    motion_significance_min: float = 0.02


def merge_near_duplicate_clusters(
    df: pd.DataFrame,
    eps: float = 0.38,
    *,
    frame_col: str = "frame_id",
) -> pd.DataFrame:
    """같은 프레임에서 중심이 매우 가까운 클러스터는 n_points가 큰 쪽을 유지."""
    if df.empty:
        return df
    out_parts: list[pd.DataFrame] = []
    for (alg, fid), g in df.groupby(["algorithm", frame_col], sort=False):
        g = g.reset_index(drop=True)
        keep = np.ones(len(g), dtype=bool)
        pts = g[["cx", "cy"]].to_numpy(dtype=np.float64)
        for i in range(len(g)):
            if not keep[i]:
                continue
            for j in range(i + 1, len(g)):
                if not keep[j]:
                    continue
                if np.hypot(pts[i, 0] - pts[j, 0], pts[i, 1] - pts[j, 1]) <= eps:
                    if int(g.at[i, "n_points"]) >= int(g.at[j, "n_points"]):
                        keep[j] = False
                    else:
                        keep[i] = False
                        break
        out_parts.append(g.loc[keep])
    return pd.concat(out_parts, ignore_index=True) if out_parts else df.iloc[0:0]


def suppress_cluster_candidates(
    df: pd.DataFrame,
    cfg: SuppressionConfig | None = None,
    *,
    lidar_cor_col: str | None = "lidar_corroboration_score",
) -> tuple[pd.DataFrame, dict[str, Any]]:
    cfg = cfg or SuppressionConfig()
    n0 = len(df)
    d = df.copy()
    d = merge_near_duplicate_clusters(d, eps=cfg.merge_near_duplicate_eps)

    m = (
        (d["n_points"] >= cfg.min_n_points)
        & (d["density_proxy"] >= cfg.min_density_proxy)
        & (d["spread_xy"] <= cfg.max_spread_xy)
        & (d["range_xy"] >= cfg.min_range_xy)
    )
    motion_sig = (d["abs_vr_comp"] / 8.0).clip(0, 1) * 0.5 + (d["spread_xy"] / (d["spread_xy"].median() + 1e-6)).clip(0, 2) * 0.25
    single_frame = d.groupby("cluster_uid").transform("count")["frame_id"] * 0 + d.groupby("cluster_uid")["frame_id"].transform("count")
    # 위 한 줄은 잘못됨: cluster_uid별 frame 수 = track 이전에는 보통 1
    # 대신 n_points 작고 속도 낮은 단발 클러스터 제거
    low_motion = (d["abs_vr_comp"] < cfg.single_frame_max_speed) & (d["n_points"] <= 4) & (d["density_proxy"] < cfg.density_proxy_sparse * 2)

    if cfg.drop_low_lidar_and_sparse and lidar_cor_col and lidar_cor_col in d.columns:
        lidar_weak = d[lidar_cor_col].fillna(0.0) < cfg.lidar_cor_threshold
        sparse = d["density_proxy"] < cfg.density_proxy_sparse
        m &= ~(lidar_weak & sparse)

    m &= ~(low_motion & (motion_sig < cfg.motion_significance_min))
    out = d.loc[m].reset_index(drop=True)
    summary = {
        "n_clusters_before": int(n0),
        "n_clusters_after": int(len(out)),
        "suppression_rate": float(1.0 - len(out) / max(n0, 1)),
    }
    return out, summary


def compute_proposal_quality(df: pd.DataFrame, *, lidar_col: str = "lidar_corroboration_score") -> pd.DataFrame:
    out = df.copy()
    dens = (out["density_proxy"] / (out["density_proxy"].quantile(0.95) + 1e-6)).clip(0, 1)
    compact = (1.0 / (1.0 + out["spread_xy"] / 6.0)).clip(0, 1)
    motion = (out["abs_vr_comp"] / 8.0).clip(0, 1)
    persist_hint = (out["n_points"] / 25.0).clip(0, 1)
    lid = out[lidar_col].fillna(0.0).clip(0, 1) if lidar_col in out.columns else pd.Series(0.0, index=out.index)
    noise_inv = 1.0 - (out["spread_xy"] / (out["spread_xy"].quantile(0.97) + 1e-6)).clip(0, 1) * 0.35
    score = (
        0.24 * dens
        + 0.20 * compact
        + 0.14 * motion
        + 0.12 * persist_hint
        + 0.22 * lid
        + 0.08 * noise_inv
    )
    out["proposal_quality_score"] = np.clip(score.astype(np.float64), 0.0, 1.0)
    thr = float(out["proposal_quality_score"].quantile(0.15)) if len(out) else 0.0
    out["proposal_keep_flag"] = (out["proposal_quality_score"] >= thr).astype(int)
    return out


def gate_top_fraction(df: pd.DataFrame, score_col: str = "proposal_quality_score", keep_fraction: float = 0.82) -> pd.DataFrame:
    if df.empty:
        return df
    k = max(1, int(math.ceil(len(df) * keep_fraction)))
    thr = float(np.sort(df[score_col].to_numpy())[-k])
    return df.loc[df[score_col] >= thr].reset_index(drop=True)


# ---------------------------------------------------------------------------
# 2. LiDAR corroboration v3 (extent, multi-NN, overlap proxy) + radar fallback
# ---------------------------------------------------------------------------


def attach_lidar_corroboration_v3(
    cluster_df_local: pd.DataFrame,
    frame_by_id: dict[str, Any],
    roi: dict[str, float],
    *,
    r1: float = 1.5,
    r2: float = 2.5,
    r3: float = 4.0,
    verify_radius: float = 2.2,
    k_multi_nn: int = 5,
) -> pd.DataFrame:
    """
    v1 컬럼은 attach_lidar_corroboration_v2 결과를 유지하고,
    v3 전용 세부 LiDAR feature + lidar_corroboration_score_v2 및 radar-only fallback을 추가한다.
    """
    base = attach_lidar_corroboration_v2(
        cluster_df_local, frame_by_id, roi, r1=r1, r2=r2, r3=r3, verify_radius=verify_radius
    )
    out_rows: list[pd.DataFrame] = []

    for frame_id, tmp in base.groupby("frame_id"):
        fr = frame_by_id.get(frame_id)
        lidar_xy = np.zeros((0, 2), dtype=np.float32)
        if fr and fr.get("lidar_path") and Path(fr["lidar_path"]).is_file():
            import bev_lidar_detector_train as bev

            lidar_pts = bev.parse_lidar_bin(Path(fr["lidar_path"]))
            m = (
                (lidar_pts[:, 0] >= roi["x_min"])
                & (lidar_pts[:, 0] <= roi["x_max"])
                & (lidar_pts[:, 1] >= roi["y_min"])
                & (lidar_pts[:, 1] <= roi["y_max"])
            )
            lidar_xy = lidar_pts[m, :2]

        t2 = tmp.copy()
        n_lidar = len(lidar_xy)
        centers = t2[["cx", "cy"]].to_numpy(dtype=np.float32)
        spread = t2["spread_xy"].to_numpy(dtype=np.float64)
        half = np.clip(spread * 0.65, 0.35, 5.0)

        if n_lidar == 0:
            t2["lidar_mode"] = "radar_only"
            t2["lidar_min_dist_center"] = np.nan
            t2["lidar_min_dist_extent"] = np.nan
            t2["lidar_density_center"] = 0.0
            t2["lidar_density_extent"] = 0.0
            t2["lidar_multi_nn_mean_dist"] = np.nan
            t2["lidar_overlap_proxy"] = 0.0
            t2["lidar_corroboration_score_v2"] = np.clip(
                0.45 * (t2["range_xy"].clip(1, 50) / 50.0)
                + 0.35 * (t2["abs_vr_comp"].clip(0, 8) / 8.0)
                + 0.20 * t2["density_proxy"].clip(0, 2) / 2.0,
                0.0,
                1.0,
            )
            out_rows.append(t2)
            continue

        from sklearn.neighbors import NearestNeighbors

        kk = int(min(max(k_multi_nn, 2), max(2, n_lidar)))
        nn = NearestNeighbors(n_neighbors=kk)
        nn.fit(lidar_xy)
        dists_m, _ = nn.kneighbors(centers)
        multi_mean = dists_m.mean(axis=1)

        nn1 = NearestNeighbors(n_neighbors=1)
        nn1.fit(lidar_xy)
        d1, _ = nn1.kneighbors(centers)
        min_center = d1[:, 0]

        extent_min = np.zeros(len(t2), dtype=np.float64)
        dens_center = np.zeros(len(t2), dtype=np.float64)
        dens_extent = np.zeros(len(t2), dtype=np.float64)
        overlap_p = np.zeros(len(t2), dtype=np.float64)

        for i in range(len(t2)):
            cx, cy = float(centers[i, 0]), float(centers[i, 1])
            hx, hy = float(half[i]), float(half[i])
            box_pts = np.array(
                [
                    [cx - hx, cy - hy],
                    [cx + hx, cy - hy],
                    [cx + hx, cy + hy],
                    [cx - hx, cy + hy],
                    [cx, cy - hy],
                    [cx + hx, cy],
                    [cx, cy + hy],
                    [cx - hx, cy],
                ],
                dtype=np.float32,
            )
            dbox = np.sqrt(np.sum((lidar_xy[:, None, :] - box_pts[None, :, :]) ** 2, axis=2))
            extent_min[i] = float(np.min(dbox))

            dc = np.sqrt(np.sum((lidar_xy - centers[i]) ** 2, axis=1))
            dens_center[i] = float(np.mean(dc <= r2))
            r_foot = float(np.clip(spread[i] * 2.0, 0.9, 7.0))
            dens_extent[i] = float(np.mean(dc <= r_foot))
            r_in = float(np.clip(0.7 + spread[i], 0.8, 4.0))
            r_out = r_in + 2.5
            n_in = int(np.sum(dc <= r_in))
            n_out = int(np.sum(dc <= r_out)) + 1
            overlap_p[i] = float(n_in / max(n_out, 1))

        dist_term_c = np.clip(1.0 - min_center / 8.0, 0.0, 1.0)
        dist_term_e = np.clip(1.0 - extent_min / 10.0, 0.0, 1.0)
        dmix = 0.45 * dens_center + 0.35 * dens_extent + 0.20 * np.clip(multi_mean / 12.0, 0, 1)
        v2 = np.clip(0.28 * dist_term_c + 0.18 * dist_term_e + 0.34 * dmix + 0.20 * overlap_p, 0.0, 1.0)

        t2["lidar_mode"] = "lidar"
        t2["lidar_min_dist_center"] = min_center
        t2["lidar_min_dist_extent"] = extent_min
        t2["lidar_density_center"] = dens_center
        t2["lidar_density_extent"] = dens_extent
        t2["lidar_multi_nn_mean_dist"] = multi_mean
        t2["lidar_overlap_proxy"] = overlap_p
        t2["lidar_corroboration_score_v2"] = v2
        out_rows.append(t2)

    return pd.concat(out_rows, ignore_index=True)


# ---------------------------------------------------------------------------
# 3. Track-level temporal features + track risk aggregation
# ---------------------------------------------------------------------------


def attach_track_temporal_features_v3(
    cluster_df: pd.DataFrame,
    track_obs: pd.DataFrame,
) -> pd.DataFrame:
    """cluster_df에 track_id merge 이후 호출 권장."""
    if track_obs.empty or "track_id" not in cluster_df.columns:
        out = cluster_df.copy()
        for c in [
            "track_age",
            "visible_ratio",
            "acceleration_proxy",
            "jerk_proxy",
            "heading_consistency_score",
            "closing_consistency_score",
            "radial_approach_persistence",
            "lateral_drift_magnitude",
            "stop_go_variability",
            "reappearance_count",
            "track_fragmentation_proxy",
            "motion_smoothness_score",
            "trajectory_risk_proxy",
        ]:
            out[c] = 0.0 if c != "reappearance_count" else 0
        return out

    obs = normalize_track_obs_schema(track_obs)
    uid_pos = cluster_df[["cluster_uid", "frame_order", "cx", "cy"]].drop_duplicates(["cluster_uid", "frame_order"])
    obs = obs.merge(uid_pos, on=["cluster_uid", "frame_order"], how="left")
    obs["cx"] = obs["cx"].ffill().fillna(0.0)
    obs["cy"] = obs["cy"].fillna(0.0)

    rows = []
    for tid, g in obs.groupby("track_id"):
        if tid < 0:
            continue
        g = g.sort_values("frame_order")
        fo = g["frame_order"].to_numpy(dtype=np.int32)
        spd = g["obs_speed"].to_numpy(dtype=np.float64)
        hd = g["obs_heading"].to_numpy(dtype=np.float64)
        ad = g["approach_delta"].to_numpy(dtype=np.float64)
        cx = g["cx"].to_numpy(dtype=np.float64)
        cy = g["cy"].to_numpy(dtype=np.float64)

        track_age = int(fo.max() - fo.min() + 1) if len(fo) else 0
        visible_ratio = float(len(g) / max(track_age, 1))
        acc_proxy = float(np.mean(np.abs(np.diff(spd)))) if len(spd) > 1 else 0.0
        jerk_proxy = float(np.mean(np.abs(np.diff(np.diff(spd))))) if len(spd) > 2 else 0.0
        hcons = float(1.0 / (1.0 + np.mean(np.abs(np.diff(hd))))) if len(hd) > 1 else 1.0
        ccons = float(1.0 / (1.0 + float(np.std(ad)))) if len(ad) > 1 else 1.0
        rad_persist = float(np.mean(ad > 0)) if len(ad) else 0.0
        lat = float(np.mean(np.sqrt(np.diff(cx) ** 2 + np.diff(cy) ** 2))) if len(cx) > 1 else 0.0
        stop_go = float(np.std(spd))
        gaps = np.diff(np.unique(fo))
        reapp = int(np.sum(gaps > 1))
        frag = float(reapp / max(len(np.unique(fo)), 1))
        smooth = float(1.0 / (1.0 + acc_proxy))
        traj_risk = float(
            0.22 * (1.0 - hcons)
            + 0.22 * rad_persist
            + 0.18 * acc_proxy
            + 0.14 * lat / 3.0
            + 0.14 * (1.0 - smooth)
            + 0.10 * frag
        )
        rows.append(
            {
                "track_id": int(tid),
                "track_age": track_age,
                "visible_ratio": visible_ratio,
                "acceleration_proxy": acc_proxy,
                "jerk_proxy": jerk_proxy,
                "heading_consistency_score": hcons,
                "closing_consistency_score": ccons,
                "radial_approach_persistence": rad_persist,
                "lateral_drift_magnitude": lat,
                "stop_go_variability": stop_go,
                "reappearance_count": reapp,
                "track_fragmentation_proxy": frag,
                "motion_smoothness_score": smooth,
                "trajectory_risk_proxy": traj_risk,
            }
        )

    feat = pd.DataFrame(rows)
    out = cluster_df.merge(feat, on="track_id", how="left")
    for c in feat.columns:
        if c == "track_id":
            continue
        if c in out.columns:
            out[c] = out[c].fillna(0.0 if c != "reappearance_count" else 0)
    return out


def aggregate_track_level_risk_scores(
    df: pd.DataFrame,
    *,
    cluster_score_col: str = "risk_score_rule",
    hybrid_score_col: str | None = "risk_score_hybrid",
    track_len_col: str = "track_len",
) -> pd.DataFrame:
    out = df.copy()
    if "track_id" not in out.columns or out.empty:
        for c in (
            "risk_score_track",
            "risk_score_track_hybrid",
            "risk_score_track_max",
            "risk_score_track_mean",
            "risk_score_track_persist_adj",
        ):
            out[c] = np.nan
        return out

    tl = pd.to_numeric(out[track_len_col], errors="coerce").fillna(1.0).clip(lower=1.0)
    w = np.log1p(tl) / np.log1p(8.0)
    g = out.groupby("track_id", sort=False)
    out["risk_score_track_max"] = g[cluster_score_col].transform("max")
    out["risk_score_track_mean"] = g[cluster_score_col].transform("mean")
    out["risk_score_track_persist_adj"] = (out["risk_score_track_mean"] * (0.55 + 0.45 * w)).clip(0.0, 1.0)
    out["risk_score_track"] = out["risk_score_track_persist_adj"]
    if hybrid_score_col and hybrid_score_col in out.columns:
        hm = g[hybrid_score_col].transform("mean")
        out["risk_score_track_hybrid"] = (hm * (0.55 + 0.45 * w)).clip(0.0, 1.0)
    else:
        out["risk_score_track_hybrid"] = out["risk_score_track"]
    return out


# ---------------------------------------------------------------------------
# 4. Rule-based risk v2 (explicit components)
# ---------------------------------------------------------------------------


def compute_rule_components_v2(
    df: pd.DataFrame,
    *,
    lidar_col: str = "lidar_corroboration_score_v2",
    weights: dict[str, float] | None = None,
) -> pd.DataFrame:
    out = df.copy()
    ttc = compute_ttc(out).to_numpy(dtype=np.float64)
    rng = out["range_xy"].to_numpy(dtype=np.float64)
    spd = out["abs_vr_comp"].to_numpy(dtype=np.float64)
    appr = out["approach_score"].to_numpy(dtype=np.float64)
    persist = out["cluster_persistence"].to_numpy(dtype=np.float64)
    tlen = out["track_len"].to_numpy(dtype=np.float64)
    tstab = out["temporal_stability_score"].to_numpy(dtype=np.float64)
    lid = out[lidar_col].to_numpy(dtype=np.float64) if lidar_col in out.columns else np.zeros(len(out))

    traj = out["trajectory_risk_proxy"].to_numpy(dtype=np.float64) if "trajectory_risk_proxy" in out.columns else np.zeros(len(out))
    mot_anom = np.clip(out["vr_comp_std"].fillna(0).to_numpy(dtype=np.float64) / 4.0, 0, 1) if "vr_comp_std" in out.columns else np.zeros(len(out))

    risk_proximity = np.clip((38.0 - rng) / 38.0, 0.0, 1.0)
    risk_closing = np.clip(0.55 * np.clip((8.0 - ttc) / 8.0, 0, 1) + 0.45 * np.clip(appr / 1.8, 0, 1), 0.0, 1.0)
    risk_persistence = np.clip(0.5 * np.clip(persist / 0.55, 0, 1) + 0.5 * np.clip(tlen / 6.0, 0, 1), 0.0, 1.0)
    risk_corroboration = np.clip(lid, 0.0, 1.0)
    risk_motion_anomaly = np.clip(0.6 * mot_anom + 0.4 * np.clip(traj, 0, 1), 0.0, 1.0)
    risk_track_stability = np.clip(tstab, 0.0, 1.0)

    w = weights or {
        "proximity": 0.18,
        "closing": 0.18,
        "persistence": 0.14,
        "corroboration": 0.18,
        "motion_anomaly": 0.16,
        "track_stability": 0.16,
    }
    risk_score_rule_v2 = (
        w["proximity"] * risk_proximity
        + w["closing"] * risk_closing
        + w["persistence"] * risk_persistence
        + w["corroboration"] * risk_corroboration
        + w["motion_anomaly"] * risk_motion_anomaly
        + w["track_stability"] * risk_track_stability
    )
    out["risk_proximity"] = risk_proximity
    out["risk_closing"] = risk_closing
    out["risk_persistence"] = risk_persistence
    out["risk_corroboration"] = risk_corroboration
    out["risk_motion_anomaly"] = risk_motion_anomaly
    out["risk_track_stability"] = risk_track_stability
    out["risk_score_rule_v2"] = np.clip(risk_score_rule_v2, 0.0, 1.0)
    out["risk_rule_v2_weights_json"] = str(w)
    return out


def threshold_sensitivity_track_level(df: pd.DataFrame, score_col: str = "risk_score_track") -> pd.DataFrame:
    if df.empty or "track_id" not in df.columns:
        return pd.DataFrame()
    t = df.groupby("track_id", sort=False).first().reset_index()
    s = t[score_col].astype(float)
    rows = []
    for q in [0.90, 0.93, 0.96, 0.98]:
        thr = float(s.quantile(q))
        lab = np.where(s >= thr, "high", np.where(s >= float(s.quantile(max(q - 0.12, 0.5))), "medium", "low"))
        vc = pd.Series(lab).value_counts().reindex(["low", "medium", "high"]).fillna(0).astype(int)
        rows.append(
            {
                "setting": f"track_quantile_{q}",
                "n_low": int(vc["low"]),
                "n_medium": int(vc["medium"]),
                "n_high": int(vc["high"]),
                "n_tracks": int(len(t)),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 5. Calibration + uncertainty
# ---------------------------------------------------------------------------


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.clip(np.asarray(y_prob, dtype=np.float64), 1e-6, 1 - 1e-6)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    if n == 0:
        return float("nan")
    for i in range(n_bins):
        m = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if i == n_bins - 1:
            m = (y_prob >= bins[i]) & (y_prob <= bins[i + 1])
        cnt = int(m.sum())
        if cnt == 0:
            continue
        conf = float(y_prob[m].mean())
        acc = float(y_true[m].mean())
        ece += (cnt / n) * abs(acc - conf)
    return float(ece)


def fit_calibrated_binary_models(
    X: np.ndarray,
    y_high: np.ndarray,
    *,
    cv: int = 3,
    random_state: int = 42,
) -> dict[str, Any]:
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier

    X = np.asarray(X, dtype=np.float64)
    y_high = np.asarray(y_high).astype(int)
    out: dict[str, Any] = {"models": {}, "calibrated": {}}
    if len(np.unique(y_high)) < 2 or X.shape[0] < 80:
        out["skip_reason"] = "insufficient_class_variation_or_samples"
        return out

    estimators = {
        "hgb": HistGradientBoostingClassifier(max_depth=6, max_iter=120, random_state=random_state),
        "rf": RandomForestClassifier(n_estimators=120, max_depth=12, random_state=random_state, n_jobs=-1),
    }
    for name, est in estimators.items():
        out["models"][name] = est
        cal = CalibratedClassifierCV(est, method="isotonic", cv=min(cv, 3))
        cal.fit(X, y_high)
        out["calibrated"][name] = cal
    return out


def collect_calibrated_probabilities(cal_models: dict[str, Any], X: np.ndarray) -> np.ndarray:
    X = np.asarray(X, dtype=np.float64)
    probs = []
    for _name, m in cal_models.items():
        if hasattr(m, "predict_proba"):
            probs.append(m.predict_proba(X)[:, 1])
    if not probs:
        return np.zeros((X.shape[0], 0))
    return np.vstack(probs).T


def uncertainty_from_prob_matrix(P: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """열=모델별 positive probability. 반환: risk_uncertainty, risk_confidence_calibrated."""
    if P.size == 0:
        z = np.zeros(P.shape[0])
        return z, 1.0 - z
    p_mean = np.clip(P.mean(axis=1), 1e-6, 1 - 1e-6)
    ent = -(p_mean * np.log(p_mean) + (1 - p_mean) * np.log(1 - p_mean))
    ent /= math.log(2)
    disagree = float(np.std(P, axis=1).mean()) if P.shape[1] > 1 else 0.0
    risk_uncertainty = np.clip(0.65 * ent + 0.35 * (np.std(P, axis=1) if P.shape[1] > 1 else 0.0), 0.0, 1.0)
    risk_confidence_calibrated = np.clip(p_mean * (1.0 - 0.45 * risk_uncertainty), 0.0, 1.0)
    return risk_uncertainty, risk_confidence_calibrated


def compute_risk_score_final_calibrated(
    df: pd.DataFrame,
    *,
    rule_col: str = "risk_score_rule_v2",
    ml_prob_col: str = "ml_high_prob_mean",
    uncertainty_col: str = "risk_uncertainty",
    w_rule: float = 0.42,
    w_ml: float = 0.38,
    w_conf: float = 0.20,
    u_penalty: float = 0.18,
) -> pd.Series:
    r = df[rule_col].to_numpy(dtype=np.float64) if rule_col in df.columns else np.zeros(len(df))
    m = df[ml_prob_col].to_numpy(dtype=np.float64) if ml_prob_col in df.columns else np.zeros(len(df))
    u = df[uncertainty_col].to_numpy(dtype=np.float64) if uncertainty_col in df.columns else np.zeros(len(df))
    conf = df["risk_confidence_calibrated"].to_numpy(dtype=np.float64) if "risk_confidence_calibrated" in df.columns else (1.0 - u)
    raw = w_rule * r + w_ml * m + w_conf * conf - u_penalty * u
    return pd.Series(np.clip(raw, 0.0, 1.0), index=df.index, name="risk_score_final_calibrated")


# ---------------------------------------------------------------------------
# 6. Ranking extensions (MAP, MRR, window top-k, burden)
# ---------------------------------------------------------------------------


def mean_reciprocal_rank(y_true: np.ndarray, y_score: np.ndarray) -> float:
    order = np.argsort(-y_score)
    for rank, idx in enumerate(order, start=1):
        if y_true[idx] > 0:
            return 1.0 / rank
    return 0.0


def mean_average_precision_binary(y_true: np.ndarray, y_score: np.ndarray) -> float:
    y_true = np.asarray(y_true).astype(int)
    y_score = np.asarray(y_score, dtype=np.float64)
    if y_true.sum() == 0:
        return float("nan")
    return float(average_precision_score(y_true, y_score))


def ndcg_at_k_from_scores(y_rel: np.ndarray, y_score: np.ndarray, k: int) -> float:
    y_rel = np.asarray(y_rel, dtype=np.float64).reshape(1, -1)
    y_score = np.asarray(y_score, dtype=np.float64).reshape(1, -1)
    kk = min(k, y_rel.shape[1])
    if kk < 1:
        return float("nan")
    return float(ndcg_score(y_rel, y_score, k=kk))


def window_topk_hit_recall(
    df: pd.DataFrame,
    *,
    frame_order_col: str = "frame_order",
    score_col: str,
    label_high_col: str,
    window: int = 10,
    k: int = 5,
) -> dict[str, float]:
    """프레임을 window로 묶어, window 내 max score top-k에 high가 포함되는지 요약."""
    if df.empty:
        return {"hit_rate": float("nan"), "recall_proxy": float("nan")}
    df = df.sort_values(frame_order_col)
    frames = df[frame_order_col].unique()
    hits = 0
    total = 0
    for i in range(0, len(frames), window):
        chunk_f = frames[i : i + window]
        sub = df[df[frame_order_col].isin(chunk_f)]
        if sub.empty:
            continue
        total += 1
        order = sub[score_col].to_numpy().argsort()[::-1]
        top = set(order[: min(k, len(order))])
        hi = sub[label_high_col].to_numpy().astype(int)
        if hi[list(top)].sum() > 0:
            hits += 1
    return {"hit_rate": float(hits / max(total, 1)), "n_windows": float(total)}


def false_positive_burden_proxy(
    df: pd.DataFrame,
    *,
    score_col: str,
    frame_col: str = "frame_id",
    top_m: int = 10,
) -> dict[str, float]:
    if df.empty:
        return {}
    per_frame = df.groupby(frame_col).size().mean()
    per_window = per_frame * 10.0
    top_scores = df.nlargest(min(top_m, len(df)), score_col)
    burden = float(len(df) / max(df[frame_col].nunique(), 1))
    return {
        "candidates_per_frame_mean": float(per_frame),
        "candidates_per_window_est": float(per_window),
        "topk_review_proxy": float(len(top_scores)),
        "candidate_burden_per_frame": float(burden),
    }


# ---------------------------------------------------------------------------
# 7. Explainability (Korean)
# ---------------------------------------------------------------------------

RISK_KO_NAMES = {
    "risk_proximity": "근접성",
    "risk_closing": "접근/시간여유",
    "risk_persistence": "지속성",
    "risk_corroboration": "LiDAR 정합",
    "risk_motion_anomaly": "운동 이상",
    "risk_track_stability": "궤적 안정성",
}


def dominant_risk_contributors(row: pd.Series, cols: list[str], topn: int = 3) -> str:
    vals = [(c, float(row.get(c, 0.0) or 0.0)) for c in cols]
    vals.sort(key=lambda x: -x[1])
    parts = [f"{RISK_KO_NAMES.get(c, c)}:{v:.2f}" for c, v in vals[:topn]]
    return ", ".join(parts)


def build_korean_explanation(row: pd.Series) -> tuple[str, str]:
    """(explanation_ko, decision_reason_ko)"""
    lab = str(row.get("risk_label_hybrid", row.get("risk_label_rule", "low")))
    prox = float(row.get("risk_proximity", 0) or 0)
    clo = float(row.get("risk_closing", 0) or 0)
    cor = float(row.get("risk_corroboration", 0) or 0)
    pers = float(row.get("risk_persistence", 0) or 0)
    unc = float(row.get("risk_uncertainty", 0) or 0)
    parts = []
    if prox > 0.62:
        parts.append("근거리")
    if clo > 0.55:
        parts.append("접근·TTC 압박")
    if cor > 0.45:
        parts.append("LiDAR 정합 강함")
    if pers > 0.5:
        parts.append("프레임 간 지속")
    if unc > 0.55:
        parts.append("모델 불확실성 큼")
    head = "·".join(parts) if parts else "복합 신호"
    expl = f"{head} 기준으로 {lab} 구간으로 분류됨."
    reason = (
        f"최종점수={float(row.get('risk_score_final_calibrated', row.get('risk_score_hybrid', 0)) or 0):.3f}, "
        f"보정신뢰={float(row.get('risk_confidence_calibrated', 0) or 0):.3f}, 불확실성={unc:.3f}."
    )
    return expl, reason


def build_topk_explanation_table(df: pd.DataFrame, *, score_col: str, top_k: int = 15) -> pd.DataFrame:
    comp_cols = [
        "risk_proximity",
        "risk_closing",
        "risk_persistence",
        "risk_corroboration",
        "risk_motion_anomaly",
        "risk_track_stability",
    ]
    sub = df.nlargest(min(top_k, len(df)), score_col).copy()
    rows = []
    for _, r in sub.iterrows():
        dom = dominant_risk_contributors(r, [c for c in comp_cols if c in df.columns], topn=3)
        ek, dk = build_korean_explanation(r)
        rows.append(
            {
                "cluster_uid": r.get("cluster_uid", ""),
                "track_id": r.get("track_id", -1),
                "final_risk_score": float(r.get(score_col, np.nan)),
                "risk_label": r.get("risk_label_hybrid", r.get("risk_label_rule", "")),
                "risk_confidence_calibrated": r.get("risk_confidence_calibrated", np.nan),
                "risk_uncertainty": r.get("risk_uncertainty", np.nan),
                "track_age": r.get("track_age", np.nan),
                "avg_speed": r.get("avg_speed", np.nan),
                "closing_consistency_score": r.get("closing_consistency_score", np.nan),
                "lidar_corroboration_score_v2": r.get("lidar_corroboration_score_v2", r.get("lidar_corroboration_score", np.nan)),
                "dominant_risk_contributors": dom,
                "explanation_ko": ek,
                "decision_reason_ko": dk,
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 8. Runtime profiler + Light/Full presets
# ---------------------------------------------------------------------------


@dataclass
class Stage3Profiler:
    times: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))

    @contextmanager
    def section(self, name: str) -> Iterator[None]:
        t0 = time.perf_counter()
        yield
        self.times[name].append(time.perf_counter() - t0)

    def summary(self) -> pd.DataFrame:
        rows = []
        for k, v in self.times.items():
            rows.append({"stage": k, "total_sec": float(np.sum(v)), "mean_sec": float(np.mean(v)), "n_calls": len(v)})
        return pd.DataFrame(rows).sort_values("total_sec", ascending=False)


@dataclass
class PipelineMode:
    name: str
    use_hdbscan: bool
    use_suppression: bool
    lidar_full: bool
    tracking_mode: str
    enable_calibration: bool
    enable_explanation: bool


PIPELINE_MODE_LIGHT = PipelineMode(
    name="light",
    use_hdbscan=False,
    use_suppression=True,
    lidar_full=False,
    tracking_mode="baseline",
    enable_calibration=False,
    enable_explanation=False,
)
PIPELINE_MODE_FULL = PipelineMode(
    name="full",
    use_hdbscan=True,
    use_suppression=True,
    lidar_full=True,
    tracking_mode="improved",
    enable_calibration=True,
    enable_explanation=True,
)


def permutation_importance_mse(
    model: Any,
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    *,
    n_repeat: int = 8,
    random_state: int = 0,
) -> pd.DataFrame:
    from sklearn.metrics import mean_squared_error

    rng = np.random.default_rng(random_state)
    base = mean_squared_error(y, model.predict(X))
    rows = []
    for j, name in enumerate(feature_names):
        losses = []
        for _ in range(n_repeat):
            Xp = X.copy()
            col = rng.permutation(Xp[:, j])
            Xp[:, j] = col
            losses.append(mean_squared_error(y, model.predict(Xp)))
        rows.append({"feature": name, "delta_mse_mean": float(np.mean(losses) - base)})
    return pd.DataFrame(rows).sort_values("delta_mse_mean", ascending=False)


def compare_clustering_variants(
    radar_df: pd.DataFrame,
    frame_by_id: dict[str, Any],
    roi: dict[str, float],
    *,
    profile: Stage3Profiler | None = None,
    gate_dist: float = DEFAULT_TRACK_GATE_DIST,
    use_lidar_v3: bool = True,
) -> pd.DataFrame:
    """DBSCAN / HDBSCAN / suppressed+HDBSCAN 요약 비교."""
    rows = []
    variants: list[tuple[str, list[str], bool]] = [
        ("dbscan_raw", ["dbscan"], False),
        ("hdbscan_raw", ["hdbscan"] if HDBSCAN_OK else ["dbscan"], False),
        ("hdbscan_suppressed", ["hdbscan"] if HDBSCAN_OK else ["dbscan"], True),
    ]
    for tag, methods, do_sup in variants:
        with profile.section(f"cluster_{tag}") if profile else nullcontext():
            cdf, fq = build_cluster_tables(radar_df, methods)
        if cdf.empty:
            continue
        alg = methods[0]
        sub = cdf[cdf["algorithm"] == alg].copy()
        n_clusters_raw = int(len(sub))
        sup_summary: dict[str, Any] = {}
        if do_sup:
            sub_suppressed, sup_summary = suppress_cluster_candidates(sub)
            sub = compute_proposal_quality(sub_suppressed)
            sub = gate_top_fraction(sub, keep_fraction=0.88)
            sup_summary["after_gate"] = len(sub)
        else:
            sub = compute_proposal_quality(sub)
        with profile.section(f"lidar_{tag}") if profile else nullcontext():
            if use_lidar_v3:
                sub_l = attach_lidar_corroboration_v3(sub, frame_by_id, roi)
            else:
                sub_l = attach_lidar_corroboration_v2(sub, frame_by_id, roi)
        with profile.section(f"track_{tag}") if profile else nullcontext():
            tobs = run_tracking(sub_l, mode="improved", gate_dist=gate_dist, max_miss=2)
        use_cols = [
            "cluster_uid",
            "track_id",
            "track_len",
            "avg_speed",
            "heading_change",
            "approach_score",
            "temporal_stability_score",
            "cluster_persistence",
        ]
        for c, d in {
            "track_id": -1,
            "track_len": 1,
            "avg_speed": 0.0,
            "heading_change": 0.0,
            "approach_score": 0.0,
            "temporal_stability_score": 0.0,
            "cluster_persistence": 0.0,
        }.items():
            if c not in tobs.columns:
                tobs[c] = d
        mdf = sub_l.merge(tobs[use_cols].drop_duplicates("cluster_uid"), on="cluster_uid", how="left")
        for c, d in {
            "track_id": -1,
            "track_len": 1,
            "avg_speed": 0.0,
            "heading_change": 0.0,
            "approach_score": 0.0,
            "temporal_stability_score": 0.0,
            "cluster_persistence": 0.0,
        }.items():
            mdf[c] = mdf[c].fillna(d)
        mdf = attach_track_temporal_features_v3(mdf, tobs)
        mdf = compute_rule_components_v2(mdf, lidar_col="lidar_corroboration_score_v2" if "lidar_corroboration_score_v2" in mdf.columns else "lidar_corroboration_score")
        mdf["risk_score_rule"] = compute_rule_score_raw(mdf)
        mdf = assign_hybrid_risk_labels(mdf, mode="hybrid_quantile")
        hard = (mdf["risk_label_rule"] == "high").astype(int).to_numpy()
        soft = (mdf["risk_score_rule"] >= mdf["risk_score_rule"].quantile(0.90)).astype(int).to_numpy()
        rk = ranking_metrics_extended(hard, mdf["risk_score_rule"].to_numpy(), soft_positive=soft, ks=[10])
        fq_alg = fq[fq["algorithm"] == alg] if not fq.empty else fq
        noise_ratio = float(fq_alg["noise_ratio"].mean()) if not fq_alg.empty else np.nan
        tlens = tobs.groupby("track_id").size() if not tobs.empty else pd.Series(dtype=float)
        mean_tl = float(tlens.mean()) if len(tlens) else np.nan
        rows.append(
            {
                "variant": tag,
                "algorithm": alg,
                "n_clusters_raw": n_clusters_raw,
                "n_clusters_scored": int(len(mdf)),
                "n_clusters_after_sup": int(sup_summary.get("n_clusters_after", len(sub_l))) if do_sup else n_clusters_raw,
                "suppression_rate": float(sup_summary.get("suppression_rate", 0.0)) if do_sup else 0.0,
                "noise_ratio_mean": noise_ratio,
                "mean_track_len": mean_tl,
                "ap_soft": rk.get("average_precision_soft", np.nan),
                "precision@10_hard": rk.get("precision@10_hard", np.nan),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 10. Optional: contiguous block IDs for stricter CV / SHAP helper
# ---------------------------------------------------------------------------


def contiguous_block_ids(frame_order: pd.Series, n_blocks: int = 4) -> np.ndarray:
    """frame_order 값을 시간 순으로 n_blocks개 구간으로 나눈 block id (0..n_blocks-1)."""
    u = np.sort(pd.unique(frame_order))
    if len(u) == 0:
        return np.zeros(len(frame_order), dtype=int)
    blocks = np.array_split(u, min(n_blocks, len(u)))
    m: dict[int, int] = {}
    for bi, arr in enumerate(blocks):
        for v in arr:
            m[int(v)] = bi
    return np.asarray([m[int(x)] for x in frame_order.to_numpy()], dtype=int)


def try_shap_tree_summary(
    model: Any,
    X: np.ndarray,
    feature_names: list[str],
    *,
    max_samples: int = 500,
) -> dict[str, Any]:
    """SHAP TreeExplainer 요약(선택). shap 미설치 시 ok=False."""
    try:
        import shap
    except Exception as e:  # pragma: no cover
        return {"ok": False, "error": f"shap import: {e}"}

    Xs = np.asarray(X, dtype=np.float64)
    if len(Xs) > max_samples:
        rng = np.random.default_rng(0)
        idx = rng.choice(len(Xs), size=max_samples, replace=False)
        Xs = Xs[idx]
    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(Xs)
    if isinstance(sv, list):
        sv = sv[1] if len(sv) > 1 else sv[0]
    mean_abs = np.mean(np.abs(sv), axis=0)
    tab = pd.DataFrame({"feature": feature_names[: len(mean_abs)], "mean_abs_shap": mean_abs}).sort_values(
        "mean_abs_shap", ascending=False
    )
    return {"ok": True, "mean_abs_shap": tab}

