# -*- coding: utf-8 -*-
"""Shared helpers for 21_vod_hybrid_risk_pipeline_e2e_runall.ipynb (Run-All, dual mode)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score, mean_absolute_error, r2_score, recall_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

import vod_hybrid_pipeline_v2 as v2
import vod_hybrid_pipeline_stage3 as s3


LEAKAGE_BLACKLIST = frozenset({"ttc", "range_xy", "abs_vr_comp"})
RULE_SCORE_LIKE = frozenset(
    {
        "risk_score_rule",
        "risk_score_rule_v1",
        "risk_score_rule_v2",
        "risk_score_hybrid",
        "risk_label_rule",
        "risk_label_rule_v1",
        "risk_label_rule_v2",
        "risk_label_hybrid",
    }
)
HONEST_SPLITS = ("group_frame", "time", "contiguous_block")
ALL_EXPERIMENT_SPLITS = ("random",) + HONEST_SPLITS


def suppress_candidates(cluster_df_raw: pd.DataFrame, *, mode: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    d0 = cluster_df_raw.copy()
    n0 = len(d0)
    if mode == "ops":
        min_pts, max_spread, min_range = 4, 18.0, 1.2
        grid = 1.0
        grid_min = 3
        vr_thr = 0.35
        merge_eps = 0.28
        keep_frac = 0.68
    else:
        min_pts, max_spread, min_range = 3, 24.0, 0.5
        grid = 1.2
        grid_min = 2
        vr_thr = 0.5
        merge_eps = 0.35
        keep_frac = 0.85

    s1 = d0[(d0["n_points"] >= min_pts) & (d0["spread_xy"] <= max_spread) & (d0["range_xy"] >= min_range)].copy()
    s1["gx"] = (s1["cx"] / grid).round().astype(int)
    s1["gy"] = (s1["cy"] / grid).round().astype(int)
    grid_cnt = s1.groupby(["gx", "gy"]).size().rename("grid_count")
    s2 = s1.merge(grid_cnt, on=["gx", "gy"], how="left")
    s2 = s2[(s2["grid_count"] >= grid_min) | (s2["abs_vr_comp"] >= vr_thr)].copy()
    s3u = s3.merge_near_duplicate_clusters(s2.drop(columns=["gx", "gy"]).copy(), eps=merge_eps)
    s3u = s3.compute_proposal_quality(s3u, lidar_col="density_proxy")
    s3u = s3.gate_top_fraction(s3u, keep_fraction=keep_frac)
    top0 = set(d0.nlargest(min(100, len(d0)), "density_proxy").index.tolist())
    top3 = set(s3u.nlargest(min(100, len(s3u)), "density_proxy").index.tolist())
    useful_keep = float(len(top0 & top3) / max(len(top0), 1))
    suppression_summary_df = pd.DataFrame(
        [
            {"stage": "raw", "n_candidates": int(n0), "remove_ratio": 0.0, "mode": mode},
            {"stage": "S1_geometric", "n_candidates": int(len(s1)), "remove_ratio": float(1 - len(s1) / max(n0, 1)), "mode": mode},
            {"stage": "S2_temporal", "n_candidates": int(len(s2)), "remove_ratio": float(1 - len(s2) / max(n0, 1)), "mode": mode},
            {"stage": "S3_utility", "n_candidates": int(len(s3u)), "remove_ratio": float(1 - len(s3u) / max(n0, 1)), "mode": mode},
        ]
    )
    suppression_summary_df["topk_useful_keep_proxy"] = useful_keep
    return s3u.reset_index(drop=True), suppression_summary_df


def _assert_feature_set(name: str, cols: list[str], *, allow_rule_like: bool) -> None:
    cols_set = set(cols)
    inter = cols_set & LEAKAGE_BLACKLIST
    assert not inter, f"{name}: leakage blacklist columns present: {sorted(inter)}"
    if not allow_rule_like:
        inter2 = cols_set & RULE_SCORE_LIKE
        assert not inter2, f"{name}: rule-score/label columns present: {sorted(inter2)}"


def build_feature_sets(df: pd.DataFrame) -> tuple[dict[str, list[str]], pd.DataFrame]:
    leak_core = {
        "risk_label_rule_v2",
        "risk_label_rule_v1",
        "risk_score_rule_v2",
        "risk_score_rule_v1",
        "risk_score_hybrid",
        "risk_label_hybrid",
        "risk_label_rule",
        "risk_score_rule",
    }
    base = [
        c
        for c in [
            "spread_xy",
            "density_proxy",
            "n_points",
            "mean_rcs",
            "rcs_std",
            "vr_comp_std",
            "z_std",
            "lidar_corroboration_score_v2",
            "lidar_min_dist_center",
            "lidar_min_dist_extent",
            "lidar_density_center",
            "lidar_density_extent",
            "lidar_multi_nn_mean_dist",
            "lidar_overlap_proxy",
            "track_len",
            "avg_speed",
            "heading_change",
            "approach_score",
            "temporal_stability_score",
            "cluster_persistence",
            "track_age",
            "visible_ratio",
            "acceleration_proxy",
            "jerk_proxy",
            "heading_consistency_score",
            "closing_consistency_score",
            "radial_approach_persistence",
            "lateral_drift_magnitude",
            "stop_go_variability",
            "motion_smoothness_score",
            "trajectory_risk_proxy",
            "risk_proximity",
            "risk_closing",
            "risk_persistence",
            "risk_corroboration",
            "risk_motion_anomaly",
            "risk_track_stability",
        ]
        if c in df.columns
    ]

    fs = {
        "A_strict_anti_leakage": [c for c in base if c not in leak_core and not c.startswith("risk_")],
        "B_moderate_anti_leakage": [c for c in base if c not in leak_core],
        "C_diagnostic_leakage": base + [c for c in ["risk_score_rule_v2", "risk_score_rule_v1"] if c in df.columns],
    }
    _assert_feature_set("A_strict_anti_leakage", fs["A_strict_anti_leakage"], allow_rule_like=False)
    _assert_feature_set("B_moderate_anti_leakage", fs["B_moderate_anti_leakage"], allow_rule_like=False)
    rows = []
    for k, v in fs.items():
        cols_set = set(v)
        rows.append(
            {
                "feature_set": k,
                "n_features": len(v),
                "contains_leakage_core": any(c in leak_core for c in v),
                "contains_ttc": "ttc" in cols_set,
                "contains_range_xy": "range_xy" in cols_set,
                "contains_abs_vr_comp": "abs_vr_comp" in cols_set,
                "contains_rule_score_like_feature": bool(cols_set & RULE_SCORE_LIKE),
                "anti_leakage_passed": k.startswith("A") or k.startswith("B"),
                "sample_features": ", ".join(v[:10]),
            }
        )
    return fs, pd.DataFrame(rows)


def build_splits(df: pd.DataFrame, test_size: float, seed: int) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    idx = np.arange(len(df))
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    tr_g, te_g = next(gss.split(idx, groups=df["frame_id"].astype(str).to_numpy()))
    thr = df["frame_order"].quantile(1 - test_size)
    tr_t = np.where(df["frame_order"] < thr)[0]
    te_t = np.where(df["frame_order"] >= thr)[0]
    blk = s3.contiguous_block_ids(df["frame_order"], n_blocks=4)
    tr_b = np.where(blk <= 2)[0]
    te_b = np.where(blk == 3)[0]
    rng = np.random.RandomState(int(seed))
    perm = rng.permutation(len(df))
    n_te = max(1, int(round(len(df) * test_size)))
    te_r = perm[:n_te]
    tr_r = perm[n_te:]
    return {"random": (tr_r, te_r), "group_frame": (tr_g, te_g), "time": (tr_t, te_t), "contiguous_block": (tr_b, te_b)}


def _build_cls_models(opt: dict[str, bool], seed: int) -> dict[str, Any]:
    models: dict[str, Any] = {
        "logreg": Pipeline([("scaler", StandardScaler()), ("m", LogisticRegression(max_iter=600, random_state=seed))]),
        "rf": RandomForestClassifier(n_estimators=220, max_depth=14, random_state=seed, n_jobs=-1),
        "svm_rbf": Pipeline([("scaler", StandardScaler()), ("m", SVC(C=2.0, gamma="scale", probability=True, random_state=seed))]),
        "hgb": HistGradientBoostingClassifier(max_depth=7, max_iter=200, random_state=seed),
    }
    if opt.get("xgboost"):
        from xgboost import XGBClassifier

        models["xgb"] = XGBClassifier(n_estimators=180, max_depth=6, learning_rate=0.05, random_state=seed, eval_metric="logloss")
    if opt.get("lightgbm"):
        from lightgbm import LGBMClassifier

        models["lgbm"] = LGBMClassifier(n_estimators=180, learning_rate=0.05, random_state=seed)
    if opt.get("catboost"):
        from catboost import CatBoostClassifier

        models["catboost"] = CatBoostClassifier(iterations=180, depth=6, learning_rate=0.05, random_state=seed, verbose=False)
    return models


def clone_classifier(model_name: str, opt: dict[str, bool], seed: int) -> Any:
    return clone(_build_cls_models(opt, seed)[model_name])


def _build_reg_models(seed: int) -> dict[str, Any]:
    return {
        "rf_reg": RandomForestRegressor(n_estimators=200, max_depth=14, random_state=seed, n_jobs=-1),
        "hgb_reg": HistGradientBoostingRegressor(max_depth=7, max_iter=200, random_state=seed),
    }


def run_ml_experiments(
    df: pd.DataFrame,
    feature_set_dict: dict[str, list[str]],
    split_dict: dict[str, tuple[np.ndarray, np.ndarray]],
    opt: dict[str, bool],
    seed: int,
) -> pd.DataFrame:
    y_cls = (df["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    y_reg = df["risk_score_rule_v2"].to_numpy(dtype=np.float64)
    rows: list[dict[str, Any]] = []
    for fs_name, cols in feature_set_dict.items():
        if fs_name == "C_diagnostic_leakage":
            continue
        X = df[cols].fillna(0).to_numpy(dtype=np.float64)
        for split_name, (tr, te) in split_dict.items():
            if split_name not in ALL_EXPERIMENT_SPLITS:
                continue
            Xtr, Xte = X[tr], X[te]
            ytr, yte = y_cls[tr], y_cls[te]
            ytr_r, yte_r = y_reg[tr], y_reg[te]
            for mname, m in _build_cls_models(opt, seed).items():
                try:
                    m.fit(Xtr, ytr)
                    pte = m.predict_proba(Xte)[:, 1] if hasattr(m, "predict_proba") else 1.0 / (1.0 + np.exp(-m.decision_function(Xte)))
                    ptr = m.predict_proba(Xtr)[:, 1] if hasattr(m, "predict_proba") else 1.0 / (1.0 + np.exp(-m.decision_function(Xtr)))
                    yhat_te = (pte >= 0.5).astype(int)
                    yhat_tr = (ptr >= 0.5).astype(int)
                    macro_f1 = f1_score(yte, yhat_te, average="macro", zero_division=0)
                    high_recall = recall_score(yte, yhat_te, zero_division=0)
                    overfit = float(f1_score(ytr, yhat_tr, average="macro", zero_division=0) - macro_f1)
                    rkm = v2.ranking_metrics_extended(
                        yte, pte, soft_positive=(yte_r >= np.quantile(yte_r, 0.9)).astype(int), ks=[10]
                    )
                    rows.append(
                        {
                            "task": "classification",
                            "model": mname,
                            "feature_set": fs_name,
                            "split": split_name,
                            "macro_f1": float(macro_f1),
                            "high_recall": float(high_recall),
                            "ranking_ap": float(rkm.get("average_precision_soft", np.nan)),
                            "topk_precision": float(rkm.get("precision@10_hard", np.nan)),
                            "candidate_burden": float((yhat_te == 1).sum() / max(df.iloc[te]["frame_id"].nunique(), 1)),
                            "overfit_gap": overfit,
                        }
                    )
                except Exception as e:
                    rows.append(
                        {
                            "task": "classification",
                            "model": mname,
                            "feature_set": fs_name,
                            "split": split_name,
                            "error": str(e),
                        }
                    )
            for mname, m in _build_reg_models(seed).items():
                try:
                    m.fit(Xtr, ytr_r)
                    pr = np.clip(m.predict(Xte), 0.0, 1.0)
                    rkm = v2.ranking_metrics_extended(yte, pr, soft_positive=(yte_r >= np.quantile(yte_r, 0.9)).astype(int), ks=[10])
                    rows.append(
                        {
                            "task": "regression",
                            "model": mname,
                            "feature_set": fs_name,
                            "split": split_name,
                            "mae": float(mean_absolute_error(yte_r, pr)),
                            "r2": float(r2_score(yte_r, pr)),
                            "ranking_ap": float(rkm.get("average_precision_soft", np.nan)),
                        }
                    )
                except Exception as e:
                    rows.append({"task": "regression", "model": mname, "feature_set": fs_name, "split": split_name, "error": str(e)})
    return pd.DataFrame(rows)


def select_honest_best(experiment_results_df: pd.DataFrame) -> pd.Series:
    sub = experiment_results_df[
        (experiment_results_df["task"] == "classification")
        & (experiment_results_df["feature_set"].isin(["A_strict_anti_leakage", "B_moderate_anti_leakage"]))
        & (experiment_results_df["split"].isin(list(HONEST_SPLITS)))
        & (experiment_results_df["macro_f1"].notna())
    ].copy()
    if sub.empty:
        raise RuntimeError("No honest anti-leakage classification results; check data / splits.")
    sub["score"] = sub["macro_f1"] * 0.45 + sub["high_recall"] * 0.35 + sub["ranking_ap"].fillna(0) * 0.20
    return sub.sort_values(["score", "macro_f1"], ascending=False).iloc[0]


def select_overall_best(experiment_results_df: pd.DataFrame) -> pd.Series:
    """Anti-leakage feature sets only, but any split (including random) allowed for diagnostic 'overall' pick."""
    sub = experiment_results_df[
        (experiment_results_df["task"] == "classification")
        & (experiment_results_df["feature_set"].isin(["A_strict_anti_leakage", "B_moderate_anti_leakage"]))
        & (experiment_results_df["macro_f1"].notna())
    ].copy()
    if sub.empty:
        return pd.Series(dtype=float)
    sub["score"] = sub["macro_f1"] * 0.45 + sub["high_recall"] * 0.35 + sub["ranking_ap"].fillna(0) * 0.20
    return sub.sort_values(["score", "macro_f1"], ascending=False).iloc[0]


def saturation_stats(p: np.ndarray) -> dict[str, float]:
    p = np.asarray(p, dtype=np.float64)
    p = np.clip(p, 0.0, 1.0)
    return {
        "sat_gt_0.99": float(np.mean(p > 0.99)),
        "sat_gt_0.999": float(np.mean(p > 0.999)),
        "sat_lt_1e-3": float(np.mean(p < 1e-3)),
    }


def compare_and_select_calibration(
    base_estimator: Any,
    Xtr: np.ndarray,
    ytr: np.ndarray,
    Xte: np.ndarray,
    yte: np.ndarray,
    *,
    ranking_y: np.ndarray,
    ranking_soft: np.ndarray,
    seed: int,
) -> dict[str, Any]:
    base = clone(base_estimator)
    base.fit(Xtr, ytr)
    if hasattr(base, "predict_proba"):
        p_raw = base.predict_proba(Xte)[:, 1]
    else:
        p_raw = 1.0 / (1.0 + np.exp(-base.decision_function(Xte)))
    p_raw = np.clip(p_raw, 1e-6, 1.0 - 1e-6)

    rows: list[dict[str, Any]] = []
    candidates: dict[str, np.ndarray] = {"raw": p_raw}

    # Platt on train predictions -> apply to test via refit on full train is leakage-prone; use nested: fit Platt on train CV is heavy.
    # Here: fit Platt on (Xtr) holdout internal split using CalibratedClassifierCV sigmoid is cleaner.
    try:
        sig = CalibratedClassifierCV(clone(base_estimator), method="sigmoid", cv=3)
        sig.fit(Xtr, ytr)
        p_sig = np.clip(sig.predict_proba(Xte)[:, 1], 1e-6, 1.0 - 1e-6)
        candidates["platt_cv"] = p_sig
    except Exception as e:
        rows.append({"method": "platt_cv", "error": str(e)})

    try:
        iso = CalibratedClassifierCV(clone(base_estimator), method="isotonic", cv=3)
        iso.fit(Xtr, ytr)
        p_iso = np.clip(iso.predict_proba(Xte)[:, 1], 1e-6, 1.0 - 1e-6)
        candidates["isotonic_cv"] = p_iso
    except Exception as e:
        rows.append({"method": "isotonic_cv", "error": str(e)})

    b0 = float(brier_score_loss(yte, p_raw))
    e0 = float(s3.expected_calibration_error(yte, p_raw))
    rk0 = v2.ranking_metrics_extended(ranking_y, p_raw, soft_positive=ranking_soft, ks=[10])
    sat0 = saturation_stats(p_raw)
    rows.append(
        {
            "method": "raw",
            "brier": b0,
            "ece": e0,
            "ranking_ap": float(rk0.get("average_precision_soft", np.nan)),
            "precision@10_hard": float(rk0.get("precision@10_hard", np.nan)),
            **{f"sat_{k}": v for k, v in sat0.items()},
        }
    )

    best_name = "raw"
    best_p = p_raw
    best_b, best_e = b0, e0
    best_rk_ap = float(rk0.get("average_precision_soft", np.nan))
    best_p10 = float(rk0.get("precision@10_hard", np.nan))

    for name, p in candidates.items():
        if name == "raw":
            continue
        try:
            b = float(brier_score_loss(yte, p))
            e = float(s3.expected_calibration_error(yte, p))
            rk = v2.ranking_metrics_extended(ranking_y, p, soft_positive=ranking_soft, ks=[10])
            ap = float(rk.get("average_precision_soft", np.nan))
            p10 = float(rk.get("precision@10_hard", np.nan))
            sat = saturation_stats(p)
            rows.append(
                {
                    "method": name,
                    "brier": b,
                    "ece": e,
                    "ranking_ap": ap,
                    "precision@10_hard": p10,
                    **{f"sat_{k}": v for k, v in sat.items()},
                }
            )
            ranking_ok = True
            if ap == ap and best_rk_ap == best_rk_ap:
                if ap < best_rk_ap - 0.03:
                    ranking_ok = False
            if p10 == p10 and best_p10 == best_p10:
                if p10 < best_p10 - 0.05:
                    ranking_ok = False
            if sat["sat_gt_0.99"] > 0.35:
                ranking_ok = False
            # Reject calibration if Brier or ECE is worse than raw (no slack vs raw).
            improves = (b <= b0 + 1e-12) and (e <= e0 + 1e-12) and ranking_ok
            if improves:
                best_name, best_p, best_b, best_e = name, p, b, e
                best_rk_ap, best_p10 = ap, p10
        except Exception as ex:
            rows.append({"method": name, "error": str(ex)})

    calibration_used = best_name != "raw"
    return {
        "calibration_used": calibration_used,
        "selected_calibration_method": best_name,
        "p_selected": best_p,
        "p_raw": p_raw,
        "brier_raw": b0,
        "brier_selected": float(brier_score_loss(yte, best_p)),
        "ece_raw": e0,
        "ece_selected": float(s3.expected_calibration_error(yte, best_p)),
        "calibration_compare_df": pd.DataFrame(rows),
        "saturation_raw": sat0,
        "saturation_selected": saturation_stats(best_p),
    }


def tracking_summary_enriched(obs: pd.DataFrame, mode: str) -> dict[str, Any]:
    if obs.empty:
        return {"mode": mode, "n_tracks": 0}
    tl = obs.groupby("track_id").size()
    for col in ("approach_score", "temporal_stability_score"):
        if col not in obs.columns:
            obs[col] = 0.0
    s_ap = obs["approach_score"].astype(float)
    s_ts = obs["temporal_stability_score"].astype(float)
    return {
        "mode": mode,
        "n_tracks": int(obs["track_id"].nunique()),
        "mean_track_len": float(tl.mean()),
        "fragmentation": float((tl == 1).mean()),
        "approach_score_mean": float(obs["approach_score"].mean()),
        "approach_score_std": float(obs["approach_score"].std()),
        "approach_score_median": float(obs["approach_score"].median()),
        "approach_score_p90": float(obs["approach_score"].quantile(0.9)),
        "approach_score_min": float(obs["approach_score"].min()),
        "approach_score_max": float(obs["approach_score"].max()),
        "approach_score_nonzero_ratio": float((obs["approach_score"].abs() > 1e-6).mean()),
        "temporal_stability_mean": float(s_ts.mean()),
        "temporal_stability_std": float(s_ts.std()),
        "temporal_stability_median": float(s_ts.median()),
        "temporal_stability_p90": float(s_ts.quantile(0.9)),
        "temporal_stability_min": float(s_ts.min()),
        "temporal_stability_max": float(s_ts.max()),
        "temporal_stability_nonzero_ratio": float((s_ts.abs() > 1e-6).mean()),
    }


@dataclass
class BranchResult:
    mode: str
    cluster_df_suppressed: pd.DataFrame
    suppression_summary_df: pd.DataFrame
    cluster_df_corr: pd.DataFrame
    track_obs_baseline: pd.DataFrame
    track_obs_improved: pd.DataFrame
    tracking_summary_df: pd.DataFrame
    selected_tracking_mode: str
    track_obs_selected: pd.DataFrame
    cluster_df_tracked: pd.DataFrame
    cluster_df_rule: pd.DataFrame
    threshold_sensitivity_df: pd.DataFrame
    track_threshold_sensitivity_df: pd.DataFrame
    feature_set_dict: dict[str, list[str]] = field(default_factory=dict)
    feature_set_summary_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    split_dict: dict[str, tuple[np.ndarray, np.ndarray]] = field(default_factory=dict)
    split_summary_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    experiment_results_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    honest_best_row: pd.Series = field(default_factory=pd.Series)
    honest_model_name: str = ""
    honest_split: str = ""
    honest_feature_set: str = ""
    honest_model_obj: Any = None
    honest_feature_cols: list[str] = field(default_factory=list)
    overall_best_row: pd.Series = field(default_factory=pd.Series)
    calibration_bundle: dict[str, Any] = field(default_factory=dict)
    cluster_df_calibrated: pd.DataFrame = field(default_factory=pd.DataFrame)
    cluster_df_final: pd.DataFrame = field(default_factory=pd.DataFrame)
    ranking_summary_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    ablation_results_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    top_candidate_table: pd.DataFrame = field(default_factory=pd.DataFrame)
    hard_case_table: pd.DataFrame = field(default_factory=pd.DataFrame)
    hybrid_sensitivity_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    hybrid_vs_rule_df: pd.DataFrame = field(default_factory=pd.DataFrame)


def run_branch(
    cluster_df_suppressed: pd.DataFrame,
    suppression_summary_df: pd.DataFrame,
    *,
    mode: str,
    frames: list[dict[str, Any]],
    frame_by_id: dict[str, Any],
    roi: dict[str, float],
    track_gate_dist: float,
    seed: int,
    opt: dict[str, bool],
    hybrid_grid: list[dict[str, float]] | None = None,
) -> BranchResult:
    res = BranchResult(
        mode=mode,
        cluster_df_suppressed=cluster_df_suppressed,
        suppression_summary_df=suppression_summary_df,
        cluster_df_corr=pd.DataFrame(),
        track_obs_baseline=pd.DataFrame(),
        track_obs_improved=pd.DataFrame(),
        tracking_summary_df=pd.DataFrame(),
        selected_tracking_mode="improved",
        track_obs_selected=pd.DataFrame(),
        cluster_df_tracked=pd.DataFrame(),
        cluster_df_rule=pd.DataFrame(),
        threshold_sensitivity_df=pd.DataFrame(),
        track_threshold_sensitivity_df=pd.DataFrame(),
    )

    res.cluster_df_corr = s3.attach_lidar_corroboration_v3(cluster_df_suppressed.copy(), frame_by_id, roi, r1=1.5, r2=2.5, r3=4.0, verify_radius=2.2)
    res.track_obs_baseline = s3.run_tracking(res.cluster_df_corr, mode="baseline", gate_dist=track_gate_dist, max_miss=1)
    res.track_obs_improved = s3.run_tracking(res.cluster_df_corr, mode="improved", gate_dist=track_gate_dist, max_miss=2)
    tb = tracking_summary_enriched(res.track_obs_baseline, "baseline")
    ti = tracking_summary_enriched(res.track_obs_improved, "improved")
    res.tracking_summary_df = pd.DataFrame([tb, ti])
    res.selected_tracking_mode = (
        "improved" if ti["fragmentation"] <= tb["fragmentation"] else "baseline"
    )
    res.track_obs_selected = res.track_obs_improved if res.selected_tracking_mode == "improved" else res.track_obs_baseline

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
        if c not in res.track_obs_selected.columns:
            res.track_obs_selected[c] = d

    res.cluster_df_tracked = res.cluster_df_corr.merge(
        res.track_obs_selected[use_cols].drop_duplicates("cluster_uid"), on="cluster_uid", how="left"
    )
    for c, d in {
        "track_id": -1,
        "track_len": 1,
        "avg_speed": 0.0,
        "heading_change": 0.0,
        "approach_score": 0.0,
        "temporal_stability_score": 0.0,
        "cluster_persistence": 0.0,
    }.items():
        res.cluster_df_tracked[c] = res.cluster_df_tracked[c].fillna(d)
    res.cluster_df_tracked = s3.attach_track_temporal_features_v3(res.cluster_df_tracked, res.track_obs_selected)

    res.cluster_df_rule = res.cluster_df_tracked.copy()
    res.cluster_df_rule["risk_score_rule_v1"] = v2.compute_rule_score_raw(res.cluster_df_rule)
    res.cluster_df_rule = s3.compute_rule_components_v2(res.cluster_df_rule, lidar_col="lidar_corroboration_score_v2")
    rule_v1_df = res.cluster_df_rule.copy()
    rule_v1_df["risk_score_rule"] = rule_v1_df["risk_score_rule_v1"]
    rule_v1_df = v2.assign_hybrid_risk_labels(rule_v1_df, mode="hybrid_quantile")
    res.cluster_df_rule["risk_label_rule_v1"] = rule_v1_df["risk_label_rule"].values
    res.cluster_df_rule["risk_label_rule_v2"] = v2.assign_hybrid_labels_from_scores(res.cluster_df_rule, score_col="risk_score_rule_v2")
    res.cluster_df_rule["risk_score_hybrid"] = 0.55 * res.cluster_df_rule["risk_score_rule_v2"] + 0.45 * res.cluster_df_rule["risk_score_rule_v1"]
    res.cluster_df_rule = s3.aggregate_track_level_risk_scores(
        res.cluster_df_rule, cluster_score_col="risk_score_rule_v2", hybrid_score_col="risk_score_hybrid"
    )
    tmp = res.cluster_df_rule.copy()
    tmp["risk_score_rule"] = tmp["risk_score_rule_v2"]
    res.threshold_sensitivity_df = v2.threshold_sensitivity_table(tmp)
    res.track_threshold_sensitivity_df = s3.threshold_sensitivity_track_level(res.cluster_df_rule, score_col="risk_score_track")

    res.feature_set_dict, res.feature_set_summary_df = build_feature_sets(res.cluster_df_rule)
    res.split_dict = build_splits(res.cluster_df_rule, 0.25, seed)
    split_rows = []
    for name, (tr, te) in res.split_dict.items():
        ytr = res.cluster_df_rule.iloc[tr]["risk_label_rule_v2"]
        yte = res.cluster_df_rule.iloc[te]["risk_label_rule_v2"]
        split_rows.append(
            {
                "split": name,
                "n_train": len(tr),
                "n_test": len(te),
                "train_high": int((ytr == "high").sum()),
                "test_high": int((yte == "high").sum()),
            }
        )
    res.split_summary_df = pd.DataFrame(split_rows)

    res.experiment_results_df = run_ml_experiments(res.cluster_df_rule, res.feature_set_dict, res.split_dict, opt, seed)
    res.overall_best_row = select_overall_best(res.experiment_results_df)
    hrow = select_honest_best(res.experiment_results_df)
    res.honest_best_row = hrow
    res.honest_model_name = str(hrow["model"])
    res.honest_split = str(hrow["split"])
    res.honest_feature_set = str(hrow["feature_set"])
    cols = res.feature_set_dict[res.honest_feature_set]
    res.honest_feature_cols = cols

    tr, te = res.split_dict[res.honest_split]
    X = res.cluster_df_rule[cols].fillna(0).to_numpy(dtype=np.float64)
    y = (res.cluster_df_rule["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    Xtr, Xte = X[tr], X[te]
    ytr, yte = y[tr], y[te]
    y_reg = res.cluster_df_rule["risk_score_rule_v2"].to_numpy(dtype=np.float64)
    yte_r = y_reg[te]

    res.honest_model_obj = clone_classifier(res.honest_model_name, opt, seed)
    res.honest_model_obj.fit(Xtr, ytr)

    base_est = res.honest_model_obj
    ranking_soft = (yte_r >= np.quantile(yte_r, 0.9)).astype(int)
    res.calibration_bundle = compare_and_select_calibration(
        base_est, Xtr, ytr, Xte, yte, ranking_y=yte, ranking_soft=ranking_soft, seed=seed
    )
    p_sel = res.calibration_bundle["p_selected"]
    p_raw = res.calibration_bundle["p_raw"]
    ent = -(p_sel * np.log(p_sel) + (1 - p_sel) * np.log(1 - p_sel)) / np.log(2)
    margin = np.abs(p_sel - 0.5) * 2.0
    rule_gap = np.abs(res.cluster_df_rule.iloc[te]["risk_score_rule_v2"].to_numpy() - p_sel)
    temp_instab = 1.0 - res.cluster_df_rule.iloc[te]["motion_smoothness_score"].fillna(0).to_numpy()
    risk_unc = np.clip(0.35 * ent + 0.25 * (1 - margin) + 0.25 * rule_gap + 0.15 * temp_instab, 0, 1)
    conf_cal = np.clip(p_sel * (1 - 0.45 * risk_unc), 0, 1)

    res.cluster_df_calibrated = res.cluster_df_rule.copy()
    res.cluster_df_calibrated["ml_high_prob_raw"] = 0.0
    res.cluster_df_calibrated["ml_high_prob_selected"] = 0.0
    res.cluster_df_calibrated.loc[res.cluster_df_calibrated.index[te], "ml_high_prob_raw"] = p_raw
    res.cluster_df_calibrated.loc[res.cluster_df_calibrated.index[te], "ml_high_prob_selected"] = p_sel
    res.cluster_df_calibrated["risk_uncertainty"] = 0.5
    res.cluster_df_calibrated["risk_confidence_calibrated"] = res.cluster_df_calibrated["risk_score_rule_v2"]
    res.cluster_df_calibrated.loc[res.cluster_df_calibrated.index[te], "risk_uncertainty"] = risk_unc
    res.cluster_df_calibrated.loc[res.cluster_df_calibrated.index[te], "risk_confidence_calibrated"] = conf_cal
    res.cluster_df_calibrated["ml_refine_score"] = res.cluster_df_calibrated["ml_high_prob_selected"]

    w_lidar = 0.12
    w_temporal = 0.10
    w_reliability = 0.10
    w_quality = 0.08
    w_uncertainty = 0.20

    def build_final(dfx: pd.DataFrame) -> pd.DataFrame:
        out = dfx.copy()
        out["score_base_rule"] = out["risk_score_rule_v2"].clip(0, 1)
        out["score_adj_lidar"] = w_lidar * out["lidar_corroboration_score_v2"].fillna(0)
        out["score_adj_temporal"] = w_temporal * (
            0.5 * out["closing_consistency_score"].fillna(0) + 0.5 * out["motion_smoothness_score"].fillna(0)
        )
        out["score_adj_reliability"] = w_reliability * out["risk_confidence_calibrated"].fillna(0)
        out["score_adj_quality"] = w_quality * out.get("proposal_quality_score", pd.Series(0.0, index=out.index)).fillna(0)
        out["score_penalty_uncertainty"] = w_uncertainty * out["risk_uncertainty"].fillna(0)
        out["score_final_stage4"] = (
            out["score_base_rule"]
            + out["score_adj_lidar"]
            + out["score_adj_temporal"]
            + out["score_adj_reliability"]
            + out["score_adj_quality"]
            - out["score_penalty_uncertainty"]
        ).clip(0, 1)
        return out

    res.cluster_df_final = build_final(res.cluster_df_calibrated)

    hard = (res.cluster_df_final["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    soft = (res.cluster_df_final["risk_score_rule_v2"] >= res.cluster_df_final["risk_score_rule_v2"].quantile(0.90)).astype(int).to_numpy()
    score = res.cluster_df_final["score_final_stage4"].to_numpy(dtype=np.float64)
    rkm = v2.ranking_metrics_extended(hard, score, soft_positive=soft, ks=[5, 10, 20])
    rkm["map"] = s3.mean_average_precision_binary(soft, score)
    rkm["mrr"] = s3.mean_reciprocal_rank(hard, score)
    rkm["ndcg@10"] = s3.ndcg_at_k_from_scores(soft.astype(float), score, 10)
    track_df = res.cluster_df_final.sort_values("score_final_stage4", ascending=False).drop_duplicates("track_id")
    track_hard = (track_df["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    track_ap = s3.mean_average_precision_binary(track_hard, track_df["score_final_stage4"].to_numpy())
    res.cluster_df_final["hard_tmp"] = hard
    win10 = s3.window_topk_hit_recall(res.cluster_df_final, score_col="score_final_stage4", label_high_col="hard_tmp", window=10, k=5)
    win20 = s3.window_topk_hit_recall(res.cluster_df_final, score_col="score_final_stage4", label_high_col="hard_tmp", window=20, k=10)
    sp, kd = v2.spearman_kendall(res.cluster_df_final["risk_score_rule_v2"].to_numpy(), score)
    burden = s3.false_positive_burden_proxy(res.cluster_df_final, score_col="score_final_stage4")
    res.ranking_summary_df = pd.DataFrame(
        [
            {"metric": "precision@5_hard", "value": rkm.get("precision@5_hard", np.nan)},
            {"metric": "precision@10_hard", "value": rkm.get("precision@10_hard", np.nan)},
            {"metric": "recall@10_hard", "value": rkm.get("recall@10_hard", np.nan)},
            {"metric": "ap_soft", "value": rkm.get("average_precision_soft", np.nan)},
            {"metric": "map", "value": rkm.get("map", np.nan)},
            {"metric": "mrr", "value": rkm.get("mrr", np.nan)},
            {"metric": "ndcg@10", "value": rkm.get("ndcg@10", np.nan)},
            {"metric": "track_ap", "value": track_ap},
            {"metric": "window10_hit_rate", "value": win10.get("hit_rate", np.nan)},
            {"metric": "window20_hit_rate", "value": win20.get("hit_rate", np.nan)},
            {"metric": "spearman(rule,final)", "value": sp},
            {"metric": "kendall(rule,final)", "value": kd},
            {"metric": "candidate_burden_per_frame", "value": burden.get("candidate_burden_per_frame", np.nan)},
        ]
    )

    def ablation_row(tag: str, d0: pd.DataFrame) -> dict[str, Any]:
        d = d0.copy()
        if tag == "no_lidar":
            d["score_adj_lidar"] = 0.0
        if tag == "no_tracking_features":
            d["score_adj_temporal"] = 0.0
        if tag == "no_calibration":
            d["score_adj_reliability"] = 0.0
            d["score_penalty_uncertainty"] = 0.0
        if tag == "rule_only":
            d["score_adj_lidar"] = 0
            d["score_adj_temporal"] = 0
            d["score_adj_reliability"] = 0
            d["score_adj_quality"] = 0
            d["score_penalty_uncertainty"] = 0
        if tag == "ml_only":
            d["score_base_rule"] = 0
            d["score_adj_lidar"] = 0
            d["score_adj_temporal"] = 0
            d["score_adj_quality"] = 0
        if tag == "rule_plus_ml_hybrid":
            d["score_adj_quality"] = 0
            d["score_penalty_uncertainty"] = 0
        d["score_var"] = (
            d["score_base_rule"]
            + d["score_adj_lidar"]
            + d["score_adj_temporal"]
            + d["score_adj_reliability"]
            + d["score_adj_quality"]
            - d["score_penalty_uncertainty"]
        ).clip(0, 1)
        ytrue = d["risk_label_rule_v2"]
        ypred = np.where(
            d["score_var"] >= d["score_var"].quantile(0.94),
            "high",
            np.where(d["score_var"] >= d["score_var"].quantile(0.78), "medium", "low"),
        )
        hh = (ytrue == "high").astype(int).to_numpy()
        sof = (d["risk_score_rule_v2"] >= d["risk_score_rule_v2"].quantile(0.90)).astype(int).to_numpy()
        rk = v2.ranking_metrics_extended(hh, d["score_var"].to_numpy(), soft_positive=sof, ks=[10])
        return {
            "ablation": tag,
            "macro_f1": float(f1_score(ytrue, ypred, average="macro", labels=["low", "medium", "high"], zero_division=0)),
            "high_recall": float(recall_score(hh, (d["score_var"] >= d["score_var"].quantile(0.94)).astype(int), zero_division=0)),
            "ranking_ap": float(rk.get("average_precision_soft", np.nan)),
            "topk_precision": float(rk.get("precision@10_hard", np.nan)),
            "candidate_burden": float((d["score_var"] >= d["score_var"].quantile(0.94)).sum() / max(d["frame_id"].nunique(), 1)),
        }

    ab_rows = [ablation_row("full_model", res.cluster_df_final), ablation_row("rule_only", res.cluster_df_final)]
    for t in ["no_lidar", "no_tracking_features", "no_calibration", "ml_only", "rule_plus_ml_hybrid"]:
        ab_rows.append(ablation_row(t, res.cluster_df_final))
    res.ablation_results_df = pd.DataFrame(ab_rows)

    res.top_candidate_table = s3.build_topk_explanation_table(
        res.cluster_df_final.assign(risk_label_hybrid=res.cluster_df_final["risk_label_rule_v2"]),
        score_col="score_final_stage4",
        top_k=20,
    )
    rule_only_scores = res.cluster_df_final["risk_score_rule_v2"]
    hybrid_scores = res.cluster_df_final["score_final_stage4"]
    k = 30
    top_rule = set(res.cluster_df_final.nlargest(k, "risk_score_rule_v2").index)
    top_hyb = set(res.cluster_df_final.nlargest(k, "score_final_stage4").index)
    res.hybrid_vs_rule_df = pd.DataFrame(
        [
            {
                "topk": k,
                "overlap": float(len(top_rule & top_hyb) / k),
                "rule_only_mean_score": float(rule_only_scores.mean()),
                "hybrid_mean_score": float(hybrid_scores.mean()),
            }
        ]
    )

    # Hybrid worse than rule-only on same row: hybrid score significantly lower while rule high
    mask_hybrid_down = (res.cluster_df_final["risk_label_rule_v2"] == "high") & (
        res.cluster_df_final["score_final_stage4"] < res.cluster_df_final["risk_score_rule_v2"] - 0.08
    )
    hard_parts = [
        res.cluster_df_final[(res.cluster_df_final["score_final_stage4"] >= res.cluster_df_final["score_final_stage4"].quantile(0.92)) & (res.cluster_df_final["lidar_corroboration_score_v2"] < 0.15)].assign(case_type="high_score_low_corroboration"),
        res.cluster_df_final[(res.cluster_df_final["score_final_stage4"] >= res.cluster_df_final["score_final_stage4"].quantile(0.92)) & (res.cluster_df_final["risk_uncertainty"] >= 0.60)].assign(case_type="high_score_high_uncertainty"),
        res.cluster_df_final[(res.cluster_df_final["risk_label_rule_v2"] == "medium") & (res.cluster_df_final["track_len"] >= res.cluster_df_final["track_len"].quantile(0.8))].assign(case_type="medium_but_persistent"),
        res.cluster_df_final[(np.abs(res.cluster_df_final["risk_score_rule_v2"] - res.cluster_df_final["score_final_stage4"]) >= 0.30)].assign(case_type="rule_ml_disagreement"),
        res.cluster_df_final.loc[mask_hybrid_down].assign(case_type="rule_high_hybrid_score_reduced"),
    ]
    res.hard_case_table = pd.concat(hard_parts, ignore_index=True).drop_duplicates("cluster_uid")

    # Sensitivity sweep (small grid)
    grid = hybrid_grid or [
        {"W_LIDAR": 0.10, "W_TEMPORAL": 0.10, "W_RELIABILITY": 0.08, "W_QUALITY": 0.06, "W_UNCERTAINTY": 0.18},
        {"W_LIDAR": 0.12, "W_TEMPORAL": 0.10, "W_RELIABILITY": 0.10, "W_QUALITY": 0.08, "W_UNCERTAINTY": 0.20},
        {"W_LIDAR": 0.08, "W_TEMPORAL": 0.14, "W_RELIABILITY": 0.10, "W_QUALITY": 0.08, "W_UNCERTAINTY": 0.22},
    ]
    sens_rows = []
    base_df = res.cluster_df_calibrated
    hh_all = (base_df["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    soft_all = (base_df["risk_score_rule_v2"] >= base_df["risk_score_rule_v2"].quantile(0.90)).astype(int).to_numpy()
    for g in grid:
        dtmp = base_df.copy()
        dtmp["score_base_rule"] = dtmp["risk_score_rule_v2"].clip(0, 1)
        dtmp["score_adj_lidar"] = g["W_LIDAR"] * dtmp["lidar_corroboration_score_v2"].fillna(0)
        dtmp["score_adj_temporal"] = g["W_TEMPORAL"] * (
            0.5 * dtmp["closing_consistency_score"].fillna(0) + 0.5 * dtmp["motion_smoothness_score"].fillna(0)
        )
        dtmp["score_adj_reliability"] = g["W_RELIABILITY"] * dtmp["risk_confidence_calibrated"].fillna(0)
        dtmp["score_adj_quality"] = g["W_QUALITY"] * dtmp.get("proposal_quality_score", pd.Series(0.0, index=dtmp.index)).fillna(0)
        dtmp["score_penalty_uncertainty"] = g["W_UNCERTAINTY"] * dtmp["risk_uncertainty"].fillna(0)
        dtmp["score_final_stage4"] = (
            dtmp["score_base_rule"]
            + dtmp["score_adj_lidar"]
            + dtmp["score_adj_temporal"]
            + dtmp["score_adj_reliability"]
            + dtmp["score_adj_quality"]
            - dtmp["score_penalty_uncertainty"]
        ).clip(0, 1)
        sc = dtmp["score_final_stage4"].to_numpy(dtype=np.float64)
        rk = v2.ranking_metrics_extended(hh_all, sc, soft_positive=soft_all, ks=[10])
        bur = s3.false_positive_burden_proxy(dtmp, score_col="score_final_stage4")
        sens_rows.append({**g, "ranking_ap": float(rk.get("average_precision_soft", np.nan)), "p10": float(rk.get("precision@10_hard", np.nan)), "burden_per_frame": float(bur.get("candidate_burden_per_frame", np.nan))})
    res.hybrid_sensitivity_df = pd.DataFrame(sens_rows)

    return res


def temporal_importance_proxy(cluster_df_final: pd.DataFrame, cols: list[str], seed: int) -> pd.DataFrame:
    y = (cluster_df_final["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    temporal_cols = [
        c
        for c in cols
        if c
        in (
            "track_age",
            "visible_ratio",
            "acceleration_proxy",
            "jerk_proxy",
            "heading_consistency_score",
            "closing_consistency_score",
            "radial_approach_persistence",
            "lateral_drift_magnitude",
            "stop_go_variability",
            "motion_smoothness_score",
            "trajectory_risk_proxy",
            "approach_score",
            "temporal_stability_score",
            "cluster_persistence",
            "track_len",
        )
        and c in cluster_df_final.columns
    ]
    X = cluster_df_final[cols].fillna(0).to_numpy(dtype=np.float64)
    if X.shape[0] < 80 or not temporal_cols:
        return pd.DataFrame([{"temporal_feature_importance_sum": np.nan}])
    from sklearn.inspection import permutation_importance

    rf = RandomForestClassifier(n_estimators=120, max_depth=10, random_state=seed, n_jobs=-1)
    rf.fit(X, y)
    r = permutation_importance(rf, X, y, n_repeats=5, random_state=seed, n_jobs=-1)
    imp = pd.Series(r.importances_mean, index=cols)
    tsum = float(imp.reindex(temporal_cols).fillna(0).sum())
    return pd.DataFrame([{"temporal_feature_importance_sum": tsum, "n_temporal_cols_used": len(temporal_cols)}])
