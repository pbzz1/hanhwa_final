"""
VoD hybrid risk pipeline v2: LiDAR corroboration, hybrid thresholds, ranking metrics.
Used by 18_vod_hybrid_risk_pipeline_redesign.ipynb
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, ndcg_score, precision_recall_curve
from sklearn.neighbors import NearestNeighbors


def attach_lidar_corroboration_v2(
    cluster_df_local: pd.DataFrame,
    frame_by_id: dict[str, Any],
    roi: dict[str, float],
    *,
    r1: float = 1.5,
    r2: float = 2.5,
    r3: float = 4.0,
    verify_radius: float = 2.2,
) -> pd.DataFrame:
    """
    Multi-radius LiDAR corroboration + footprint-based density (spread_xy 기반 반경).
    """
    out_rows = []
    for frame_id, grp in cluster_df_local.groupby("frame_id"):
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

        tmp = grp.copy()
        n_lidar = len(lidar_xy)

        if n_lidar == 0:
            for col in [
                "lidar_min_dist",
                "lidar_local_density_r1",
                "lidar_local_density_r2",
                "lidar_local_density_r3",
                "lidar_extent_density",
                "lidar_corroboration_score",
                "lidar_verified",
            ]:
                tmp[col] = 0.0 if col != "lidar_min_dist" else np.nan
            out_rows.append(tmp)
            continue

        nn = NearestNeighbors(n_neighbors=1)
        nn.fit(lidar_xy)
        centers = tmp[["cx", "cy"]].to_numpy(dtype=np.float32)
        dists, _ = nn.kneighbors(centers)
        min_dist = dists[:, 0]

        def density_at_radius(c_xy: np.ndarray, radius: float) -> np.ndarray:
            out_d = []
            for c in c_xy:
                d = np.sqrt(np.sum((lidar_xy - c[None, :]) ** 2, axis=1))
                out_d.append(float(np.mean(d <= radius)))
            return np.asarray(out_d)

        d1 = density_at_radius(centers, r1)
        d2 = density_at_radius(centers, r2)
        d3 = density_at_radius(centers, r3)

        # footprint: cluster spread 기반 반경 (center만 보지 않음)
        spread = tmp["spread_xy"].to_numpy(dtype=np.float64)
        foot_r = np.clip(spread * 2.2, 0.8, 6.0)
        ext_dens = []
        for i in range(len(tmp)):
            c = centers[i]
            frad = float(foot_r[i])
            d = np.sqrt(np.sum((lidar_xy - c[None, :]) ** 2, axis=1))
            ext_dens.append(float(np.mean(d <= frad)))
        ext_dens = np.asarray(ext_dens)

        # 연속형 corroboration score
        dist_term = np.clip(1.0 - min_dist / 8.0, 0.0, 1.0)
        dens_mix = 0.35 * d1 + 0.30 * d2 + 0.20 * d3 + 0.15 * ext_dens
        cor_score = np.clip(0.55 * dist_term + 0.45 * dens_mix, 0.0, 1.0)

        tmp["lidar_min_dist"] = min_dist
        tmp["lidar_local_density_r1"] = d1
        tmp["lidar_local_density_r2"] = d2
        tmp["lidar_local_density_r3"] = d3
        tmp["lidar_extent_density"] = ext_dens
        tmp["lidar_corroboration_score"] = cor_score
        tmp["lidar_verified"] = (min_dist <= verify_radius).astype(int)
        out_rows.append(tmp)

    return pd.concat(out_rows, ignore_index=True)


def compute_ttc(df: pd.DataFrame) -> pd.Series:
    speed = df["abs_vr_comp"].clip(lower=0.2)
    ttc = df["range_xy"] / speed
    return ttc.clip(0.0, 60.0)


def compute_rule_score_raw(df: pd.DataFrame) -> pd.Series:
    """연속 rule score (0~1), 라벨 전 단계."""
    ttc = compute_ttc(df)
    ttc_term = np.clip((8.0 - ttc) / 8.0, 0.0, 1.0)
    range_term = np.clip((35.0 - df["range_xy"]) / 35.0, 0.0, 1.0)
    speed_term = np.clip(df["abs_vr_comp"] / 8.0, 0.0, 1.0)
    approach_term = np.clip(df["approach_score"] / 2.0, 0.0, 1.0)
    persistence_term = np.clip(df["cluster_persistence"] / 0.5, 0.0, 1.0)
    temporal_term = np.clip(df["temporal_stability_score"], 0.0, 1.0)
    lidar_term = np.clip(df["lidar_corroboration_score"], 0.0, 1.0)

    rule_score = (
        0.22 * ttc_term
        + 0.16 * range_term
        + 0.16 * speed_term
        + 0.12 * approach_term
        + 0.10 * persistence_term
        + 0.10 * temporal_term
        + 0.14 * lidar_term
    )
    return pd.Series(np.clip(rule_score, 0.0, 1.0), index=df.index)


def assign_hybrid_risk_labels(
    df: pd.DataFrame,
    *,
    mode: str = "hybrid_quantile",
    target_high: tuple[float, float] = (0.02, 0.08),
    target_med: tuple[float, float] = (0.08, 0.22),
    fixed_high: float = 0.70,
    fixed_med: float = 0.42,
) -> pd.DataFrame:
    """
    mode: 'fixed' | 'hybrid_quantile'
    hybrid: 상위 quantile 후보 중 물리/시간/LiDAR 게이트를 만족하는 것만 high.
    """
    out = df.copy()
    out["ttc"] = compute_ttc(out)
    out["risk_score_rule"] = compute_rule_score_raw(out)

    n = len(out)
    if n == 0:
        out["risk_label_rule"] = []
        return out

    score = out["risk_score_rule"].to_numpy(dtype=np.float64)
    ttc = out["ttc"].to_numpy(dtype=np.float64)
    appr = out["approach_score"].to_numpy(dtype=np.float64)
    tlen = out["track_len"].to_numpy(dtype=np.float64)
    lid = out["lidar_corroboration_score"].to_numpy(dtype=np.float64)

    if mode == "fixed":
        out["risk_label_rule"] = np.where(
            score >= fixed_high,
            "high",
            np.where(score >= fixed_med, "medium", "low"),
        )
        return out

    # hybrid quantile + gates
    lo_hi, hi_hi = int(np.ceil(target_high[0] * n)), int(np.floor(target_high[1] * n))
    lo_hi = max(lo_hi, 1)
    hi_hi = max(hi_hi, lo_hi)

    best_high_idx: np.ndarray | None = None
    best_nh = -1

    for q_hi in np.linspace(0.985, 0.82, 40):
        thr = np.quantile(score, q_hi)
        cand = score >= thr
        gated = cand & (
            (ttc < 6.5)
            | (appr > 0.15)
            | (tlen >= 2.0)
            | (lid > 0.25)
        )
        nh = int(gated.sum())
        if lo_hi <= nh <= hi_hi:
            best_high_idx = np.where(gated)[0]
            best_nh = nh
            break
        if nh > 0 and (best_high_idx is None or abs(nh - (lo_hi + hi_hi) / 2) < abs(best_nh - (lo_hi + hi_hi) / 2)):
            best_high_idx = np.where(gated)[0]
            best_nh = nh

    if best_high_idx is None or len(best_high_idx) == 0:
        # fallback: 점수 상위 + 완화된 게이트 (high=0 방지)
        k = max(1, min(hi_hi, max(lo_hi, int(0.03 * n))))
        order = np.argsort(-score)
        high_set = set()
        for i in order:
            if len(high_set) >= k:
                break
            if (ttc[i] < 8.0) or (appr[i] > 0.08) or (tlen[i] >= 1.5) or (lid[i] > 0.18) or (score[i] >= np.quantile(score, 0.90)):
                high_set.add(int(i))
        if not high_set:
            high_set = set(order[: max(1, min(k, 5))].tolist())
    else:
        high_set = set(best_high_idx.tolist())

    # medium: 나머지 중 상위 band
    remain = [i for i in range(n) if i not in high_set]
    lo_med, hi_med = int(np.ceil(target_med[0] * n)), int(np.floor(target_med[1] * n))
    lo_med = max(lo_med, 1)

    labels = np.array(["low"] * n, dtype=object)
    for i in high_set:
        labels[i] = "high"

    rem_score = [(i, score[i]) for i in remain]
    rem_score.sort(key=lambda x: -x[1])
    med_target = min(hi_med - len(high_set), max(lo_med - len(high_set), 0))
    med_target = max(med_target, min(int(0.12 * n), len(remain)))
    med_pick = [i for i, _ in rem_score[:med_target]] if rem_score else []
    for i in med_pick:
        if labels[i] == "low":
            labels[i] = "medium"

    out["risk_label_rule"] = labels
    return out


def threshold_sensitivity_table(df: pd.DataFrame) -> pd.DataFrame:
    """여러 threshold 설정에 대한 요약 표."""
    rows = []
    base_df = df.copy()
    if "risk_score_rule" not in base_df.columns:
        # 노트북에서 cluster_df를 그대로 넣는 경우를 방어:
        # rule score/label을 먼저 생성한 뒤 민감도 표를 계산한다.
        base_df = assign_hybrid_risk_labels(base_df, mode="hybrid_quantile")
    if "risk_score_rule" not in base_df.columns:
        raise KeyError("risk_score_rule")
    score = base_df["risk_score_rule"].astype(float)

    configs = [
        ("fixed_0.70_0.42", "fixed", {}),
        ("hybrid_quantile", "hybrid_quantile", {}),
    ]
    for name, mode, kw in configs:
        d2 = assign_hybrid_risk_labels(df.copy(), mode=mode, **kw)
        vc = d2["risk_label_rule"].value_counts().reindex(["low", "medium", "high"]).fillna(0).astype(int)
        hi = d2["risk_label_rule"] == "high"
        row = {
            "setting": name,
            "n_low": int(vc["low"]),
            "n_medium": int(vc["medium"]),
            "n_high": int(vc["high"]),
            "avg_track_len_high": float(d2.loc[hi, "track_len"].mean()) if hi.any() else np.nan,
            "avg_approach_high": float(d2.loc[hi, "approach_score"].mean()) if hi.any() else np.nan,
            "avg_ttc_high": float(d2.loc[hi, "ttc"].mean()) if hi.any() else np.nan,
            "avg_lidar_cor_high": float(d2.loc[hi, "lidar_corroboration_score"].mean()) if hi.any() else np.nan,
        }
        rows.append(row)

    for q in [0.92, 0.94, 0.96]:
        thr = float(score.quantile(q))
        med_thr = float(score.quantile(max(0.55, q - 0.10)))
        lab = np.where(score >= thr, "high", np.where(score >= med_thr, "medium", "low"))
        vc = pd.Series(lab).value_counts().reindex(["low", "medium", "high"]).fillna(0).astype(int)
        rows.append(
            {
                "setting": f"quantile_only_q{q}",
                "n_low": int(vc["low"]),
                "n_medium": int(vc["medium"]),
                "n_high": int(vc["high"]),
                "avg_track_len_high": np.nan,
                "avg_approach_high": np.nan,
                "avg_ttc_high": np.nan,
                "avg_lidar_cor_high": np.nan,
            }
        )

    return pd.DataFrame(rows)


def ranking_metrics_extended(
    y_true_hard: np.ndarray,
    y_score: np.ndarray,
    *,
    soft_positive: np.ndarray | None = None,
    ks: list[int] | None = None,
) -> dict[str, float]:
    ks = ks or [5, 10, 20]
    y_true_hard = np.asarray(y_true_hard).astype(int)
    y_score = np.asarray(y_score).astype(np.float64)
    out: dict[str, float] = {}

    if y_true_hard.sum() > 0:
        out["average_precision_hard"] = float(average_precision_score(y_true_hard, y_score))
        prec, rec, _ = precision_recall_curve(y_true_hard, y_score)
        if len(rec) > 1:
            x = rec[::-1]
            y = prec[::-1]
            if hasattr(np, "trapezoid"):
                out["pr_auc_interp"] = float(np.trapezoid(y, x))
            elif hasattr(np, "trapz"):
                out["pr_auc_interp"] = float(np.trapz(y, x))
            else:
                out["pr_auc_interp"] = float(np.sum((x[1:] - x[:-1]) * (y[1:] + y[:-1]) * 0.5))
        else:
            out["pr_auc_interp"] = float("nan")
    else:
        out["average_precision_hard"] = float("nan")
        out["pr_auc_interp"] = float("nan")

    order = np.argsort(-y_score)
    for k in ks:
        kk = min(k, len(order))
        top = order[:kk]
        if y_true_hard.sum() > 0:
            tp = int(y_true_hard[top].sum())
            out[f"precision@{k}_hard"] = float(tp / kk) if kk else float("nan")
            out[f"recall@{k}_hard"] = float(tp / max(int(y_true_hard.sum()), 1))
            out[f"hit@{k}_hard"] = float(1.0 if tp > 0 else 0.0)
        else:
            out[f"precision@{k}_hard"] = float("nan")
            out[f"recall@{k}_hard"] = float("nan")
            out[f"hit@{k}_hard"] = float("nan")

    if soft_positive is not None:
        sp = np.asarray(soft_positive).astype(int)
        if sp.sum() > 0:
            out["average_precision_soft"] = float(average_precision_score(sp, y_score))
            rel = sp.astype(float)
            for k in ks:
                kk = min(k, len(y_score))
                if kk >= 1:
                    topk = np.argsort(-y_score)[:kk]
                    dcg = float(np.sum(rel[topk] / np.log2(np.arange(2, len(topk) + 2))))
                    idcg = float(np.sum(np.sort(rel)[::-1][:kk] / np.log2(np.arange(2, kk + 2)))) if kk else 1.0
                    out[f"ndcg@{k}_soft"] = float(dcg / max(idcg, 1e-9))
                else:
                    out[f"ndcg@{k}_soft"] = float("nan")
        else:
            out["average_precision_soft"] = float("nan")

    return out


def assign_hybrid_labels_from_scores(
    df: pd.DataFrame,
    score_col: str = "risk_score_hybrid",
    *,
    target_high: tuple[float, float] = (0.02, 0.08),
    target_med: tuple[float, float] = (0.08, 0.22),
) -> pd.Series:
    """hybrid 최종 점수 열에 대해 `assign_hybrid_risk_labels`와 동일한 quantile+게이트 3단계 라벨."""
    score = df[score_col].to_numpy(dtype=np.float64)
    ttc = compute_ttc(df).to_numpy(dtype=np.float64)
    appr = df["approach_score"].to_numpy(dtype=np.float64)
    tlen = df["track_len"].to_numpy(dtype=np.float64)
    lid = df["lidar_corroboration_score"].to_numpy(dtype=np.float64)
    n = len(df)
    if n == 0:
        return pd.Series(dtype=object, index=df.index)

    lo_hi, hi_hi = int(np.ceil(target_high[0] * n)), int(np.floor(target_high[1] * n))
    lo_hi = max(lo_hi, 1)
    hi_hi = max(hi_hi, lo_hi)

    best_high_idx: np.ndarray | None = None
    best_nh = -1

    for q_hi in np.linspace(0.985, 0.82, 40):
        thr = np.quantile(score, q_hi)
        cand = score >= thr
        gated = cand & (
            (ttc < 6.5)
            | (appr > 0.15)
            | (tlen >= 2.0)
            | (lid > 0.25)
        )
        nh = int(gated.sum())
        if lo_hi <= nh <= hi_hi:
            best_high_idx = np.where(gated)[0]
            break
        if nh > 0 and (
            best_high_idx is None
            or abs(nh - (lo_hi + hi_hi) / 2) < abs(best_nh - (lo_hi + hi_hi) / 2)
        ):
            best_high_idx = np.where(gated)[0]
            best_nh = nh

    if best_high_idx is None or len(best_high_idx) == 0:
        k = max(1, min(hi_hi, max(lo_hi, int(0.03 * n))))
        order = np.argsort(-score)
        high_set: set[int] = set()
        for i in order:
            if len(high_set) >= k:
                break
            if (
                (ttc[i] < 8.0)
                or (appr[i] > 0.08)
                or (tlen[i] >= 1.5)
                or (lid[i] > 0.18)
                or (score[i] >= np.quantile(score, 0.90))
            ):
                high_set.add(int(i))
        if not high_set:
            high_set = set(order[: max(1, min(k, 5))].tolist())
    else:
        high_set = set(best_high_idx.tolist())

    remain = [i for i in range(n) if i not in high_set]
    lo_med, hi_med = int(np.ceil(target_med[0] * n)), int(np.floor(target_med[1] * n))
    lo_med = max(lo_med, 1)

    labels = np.array(["low"] * n, dtype=object)
    for i in high_set:
        labels[i] = "high"

    rem_score = [(i, score[i]) for i in remain]
    rem_score.sort(key=lambda x: -x[1])
    med_target = min(hi_med - len(high_set), max(lo_med - len(high_set), 0))
    med_target = max(med_target, min(int(0.12 * n), len(remain)))
    med_pick = [i for i, _ in rem_score[:med_target]] if rem_score else []
    for i in med_pick:
        if labels[i] == "low":
            labels[i] = "medium"

    return pd.Series(labels, index=df.index)


def spearman_kendall(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    from scipy.stats import kendalltau, spearmanr

    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 3:
        return float("nan"), float("nan")
    sp = spearmanr(x[m], y[m]).correlation
    kd = kendalltau(x[m], y[m]).correlation
    return float(sp) if sp == sp else float("nan"), float(kd) if kd == kd else float("nan")
