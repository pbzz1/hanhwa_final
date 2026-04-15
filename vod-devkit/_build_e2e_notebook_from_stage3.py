from __future__ import annotations

import json
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "20_vod_hybrid_risk_pipeline_stage3_fullrun.ipynb"
OUT = ROOT / "21_vod_hybrid_risk_pipeline_e2e_runall.ipynb"

src_nb = json.loads(SRC.read_text(encoding="utf-8"))
setup_code = "".join(src_nb["cells"][2].get("source", []))

nb = nbf.v4.new_notebook()
cells: list[dict] = []


def add_md(text: str) -> None:
    cells.append(nbf.v4.new_markdown_cell(text))


def add_code(text: str) -> None:
    cells.append(nbf.v4.new_code_cell(text))


add_md(
    """# VoD 하이브리드 위험도 파이프라인 단일 Run-All 노트북

목표는 점수 미세 개선보다 **일관성/신뢰성/운영성 강화**입니다.

- Full mode: 분석/발표 중심
- Ops mode: burden 축소 중심
- 결과 저장: `results/tables`, `results/figures`, `results/artifacts`
"""
)

add_md(
    """## Section 0. 개요 및 실행 가이드

- 최종 summary는 반드시 본문의 honest anti-leakage 결과와 일치해야 함
- calibration은 조건부 채택(Brier/ECE/ranking/saturation 기준)
- temporal feature는 분포/효과/top-k 변화 사례로 실효성 검증
- ops는 `<20`, `<18`, `<15` 후보/frame 목표 실험 포함
"""
)

add_md("## Section 1. 환경 설정 및 공통 유틸")
add_code(
    setup_code
    + r"""

import importlib.util
from contextlib import contextmanager
import os

import vod_e2e_pipeline as e2e

OPT = {
    "hdbscan": HDBSCAN_OK,
    "shap": importlib.util.find_spec("shap") is not None,
    "xgboost": importlib.util.find_spec("xgboost") is not None,
    "lightgbm": importlib.util.find_spec("lightgbm") is not None,
    "catboost": importlib.util.find_spec("catboost") is not None,
}

RESULT_ROOT = NOTEBOOK_DIR / "results"
FIG_DIR = RESULT_ROOT / "figures"
TABLE_DIR = RESULT_ROOT / "tables"
ART_DIR = RESULT_ROOT / "artifacts"
for p in [RESULT_ROOT, FIG_DIR, TABLE_DIR, ART_DIR]:
    p.mkdir(parents=True, exist_ok=True)

runtime_records: list[dict[str, float | str]] = []

@contextmanager
def timed(stage: str):
    import time
    t0 = time.perf_counter()
    yield
    dt = time.perf_counter() - t0
    runtime_records.append({"stage": stage, "sec": float(dt)})
    print(f"[timed] {stage}: {dt:.3f}s")

def save_table(df: pd.DataFrame, name: str):
    path = TABLE_DIR / f"{name}.csv"
    df.to_csv(path, index=False, encoding="utf-8-sig")
    return path

def save_fig(name: str):
    path = FIG_DIR / f"{name}.png"
    plt.savefig(path, dpi=140, bbox_inches="tight")
    return path

env_summary_df = pd.DataFrame(
    [{"key": k, "value": v} for k, v in {
        "NOTEBOOK_DIR": str(NOTEBOOK_DIR),
        "DATASET_ROOT": str(DATASET_ROOT),
        "RADAR_MODE": RADAR_MODE,
        "MAX_FRAMES": MAX_FRAMES,
        "MAX_POINTS_PER_FRAME": MAX_POINTS_PER_FRAME,
        **{f"opt_{k}": v for k, v in OPT.items()},
    }.items()]
)
display(env_summary_df)
"""
)

add_md("## Section 2. 데이터 로딩 및 기본 EDA")
add_code(
    r"""
with timed("section2_load_and_eda"):
    lidar_by_frame: dict[str, np.ndarray] = {}
    rows = []
    for fr in frames:
        fid = fr["frame_id"]
        lp = fr.get("lidar_path")
        larr = np.zeros((0, 4), dtype=np.float32)
        if lp and Path(lp).is_file():
            try:
                larr = bev.parse_lidar_bin(Path(lp))
            except Exception:
                larr = np.zeros((0, 4), dtype=np.float32)
        lidar_by_frame[fid] = larr
        rows.append(
            {
                "frame_id": fid,
                "frame_order": int(frame_order_map[fid]),
                "radar_points_processed": int(frame_summary.loc[frame_summary["frame_id"] == fid, "processed_points"].iloc[0]),
                "lidar_points": int(larr.shape[0]),
            }
        )
    frame_index_df = pd.DataFrame(rows).sort_values("frame_order").reset_index(drop=True)

display(frame_index_df.head())
fig, axes = plt.subplots(1, 3, figsize=(14, 4))
sns.histplot(radar_df["RCS"], bins=40, ax=axes[0]); axes[0].set_title("RCS")
sns.histplot(radar_df["v_r_compensated"], bins=40, ax=axes[1]); axes[1].set_title("v_r_compensated")
sxy = radar_df.sample(min(6000, len(radar_df)), random_state=SEED)
sc = axes[2].scatter(sxy["x"], sxy["y"], c=sxy["abs_vr_comp"], s=4, alpha=0.35, cmap="coolwarm")
axes[2].axis("equal"); axes[2].set_title("Radar XY")
plt.colorbar(sc, ax=axes[2]); plt.tight_layout(); save_fig("sec2_basic_eda"); plt.show()
save_table(frame_index_df, "sec2_frame_index")
"""
)

add_md("## Section 3. Radar 전처리")
add_code(
    r"""
with timed("section3_preprocess"):
    radar_df_clean = radar_df.copy()
    preproc_summary_df = pd.DataFrame(
        [
            {"metric": "n_raw_total", "value": int(frame_summary["raw_points"].sum())},
            {"metric": "n_clean_total", "value": int(len(radar_df_clean))},
            {"metric": "keep_ratio_global", "value": float(len(radar_df_clean) / max(frame_summary["raw_points"].sum(), 1))},
            {"metric": "keep_ratio_mean_frame", "value": float(frame_summary["kept_ratio"].mean())},
        ]
    )
display(preproc_summary_df)
fig, ax = plt.subplots(figsize=(7, 3.4))
ax.plot(frame_summary["frame_order"], frame_summary["kept_ratio"], lw=1.2)
ax.set_title("Frame별 전처리 유지율")
plt.tight_layout(); save_fig("sec3_keep_ratio"); plt.show()
save_table(preproc_summary_df, "sec3_preprocess_summary")
"""
)

add_md("## Section 4. Candidate generation")
add_code(
    r"""
with timed("section4_candidate_generation"):
    methods = ["dbscan"] + (["hdbscan"] if OPT["hdbscan"] else [])
    cluster_df_all, cluster_quality = s3.build_cluster_tables(radar_df_clean, methods)
    rows = []
    for alg in sorted(cluster_df_all["algorithm"].unique()):
        sub = cluster_df_all[cluster_df_all["algorithm"] == alg]
        fq = cluster_quality[cluster_quality["algorithm"] == alg]
        rows.append(
            {
                "algorithm": alg,
                "cluster_count": int(len(sub)),
                "noise_ratio": float(fq["noise_ratio"].mean()) if not fq.empty else np.nan,
                "mean_trackable_size_proxy": float(sub["n_points"].mean()),
                "mean_spread_xy": float(sub["spread_xy"].mean()),
                "mean_clusters_per_frame": float(fq["n_clusters"].mean()) if not fq.empty else np.nan,
            }
        )
    cluster_algo_summary = pd.DataFrame(rows)
    cluster_algo_summary["quality_score"] = (
        -cluster_algo_summary["noise_ratio"].fillna(1.0)
        + 0.04 * cluster_algo_summary["mean_clusters_per_frame"].fillna(0).clip(0, 30)
        - 0.001 * cluster_algo_summary["mean_spread_xy"].fillna(0)
    )
    cluster_algo_summary = cluster_algo_summary.sort_values("quality_score", ascending=False).reset_index(drop=True)
    selected_cluster_algo = str(cluster_algo_summary.iloc[0]["algorithm"])
    cluster_df_raw = cluster_df_all[cluster_df_all["algorithm"] == selected_cluster_algo].copy().reset_index(drop=True)
display(cluster_algo_summary)
save_table(cluster_algo_summary, "sec4_cluster_algo_summary")
"""
)

add_md("## Section 5. Candidate suppression (stronger ops 포함)")
add_code(
    r"""
with timed("section5_suppression"):
    sup_full, sum_full = e2e.suppress_candidates(cluster_df_raw, mode="full")
    sup_ops, sum_ops = e2e.suppress_candidates(cluster_df_raw, mode="ops")

    suppressed_by_mode = {"full": sup_full, "ops": sup_ops}
    suppression_by_mode = {"full": sum_full, "ops": sum_ops}

    # stronger ops targets: <20 / <18 / <15 후보/frame 목표
    target_keep = {"ops_t20": 0.62, "ops_t18": 0.54, "ops_t15": 0.46}
    for m, frac in target_keep.items():
        d = s3.gate_top_fraction(sup_ops.copy(), keep_fraction=frac)
        d = d[d["proposal_quality_score"] >= d["proposal_quality_score"].quantile(0.15)].copy()
        suppressed_by_mode[m] = d.reset_index(drop=True)
        suppression_by_mode[m] = pd.DataFrame(
            [
                {"stage": "raw_ops_base", "n_candidates": int(len(sup_ops)), "remove_ratio": 0.0, "mode": m},
                {"stage": f"extra_gate_{frac:.2f}", "n_candidates": int(len(d)), "remove_ratio": float(1 - len(d) / max(len(sup_ops), 1)), "mode": m},
            ]
        )

    suppression_summary_df = pd.concat(list(suppression_by_mode.values()), ignore_index=True)
    frame_n = max(frame_summary["frame_id"].nunique(), 1)
    ops_burden_preview_df = pd.DataFrame(
        [
            {"mode": m, "n_candidates_after_suppression": int(len(dfm)), "candidates_per_frame_after_suppression": float(len(dfm) / frame_n)}
            for m, dfm in suppressed_by_mode.items()
        ]
    ).sort_values("candidates_per_frame_after_suppression")

display(suppression_summary_df)
display(ops_burden_preview_df)
save_table(suppression_summary_df, "sec5_suppression_summary")
save_table(ops_burden_preview_df, "sec5_ops_burden_preview")
"""
)

add_md("## Section 6. Dual pipeline 실행 (full / ops / ops_t20 / ops_t18 / ops_t15)")
add_code(
    r"""
with timed("section6_dual_pipeline"):
    frame_by_id = {fr["frame_id"]: fr for fr in frames}
    RESULTS = {}
    modes_to_run = ["full", "ops", "ops_t20", "ops_t18", "ops_t15"]
    for m in modes_to_run:
        RESULTS[m] = e2e.run_branch(
            suppressed_by_mode[m],
            suppression_by_mode[m],
            mode=m,
            frames=frames,
            frame_by_id=frame_by_id,
            roi=ROI,
            track_gate_dist=TRACK_GATE_DIST,
            seed=SEED,
            opt=OPT,
        )
for m, R in RESULTS.items():
    print("===", m, "clusters", len(R.cluster_df_suppressed), "tracked rows", len(R.cluster_df_tracked))
"""
)

add_md("## Section 7. Tracking summary (분포 지표 포함)")
add_code(
    r"""
for m, R in RESULTS.items():
    display(R.tracking_summary_df.assign(mode=m))
    save_table(R.tracking_summary_df, f"sec7_tracking_summary_{m}")
"""
)

add_md("## Section 8. Rule risk / threshold sensitivity")
add_code(
    r"""
for m, R in RESULTS.items():
    display(R.threshold_sensitivity_df.head())
    display(R.track_threshold_sensitivity_df.head())
    save_table(R.threshold_sensitivity_df, f"sec8_threshold_sensitivity_cluster_{m}")
    save_table(R.track_threshold_sensitivity_df, f"sec8_threshold_sensitivity_track_{m}")
"""
)

add_md("## Section 9. Anti-leakage feature set 검증")
add_code(
    r"""
R0 = RESULTS["full"]
display(R0.feature_set_summary_df)
save_table(R0.feature_set_summary_df, "sec9_feature_set_summary")
for fs, cols in R0.feature_set_dict.items():
    assert set(cols).isdisjoint(e2e.LEAKAGE_BLACKLIST), f"blacklist in {fs}: {set(cols) & e2e.LEAKAGE_BLACKLIST}"
    if fs in {"A_strict_anti_leakage", "B_moderate_anti_leakage"}:
        assert not (set(cols) & e2e.RULE_SCORE_LIKE), f"rule-like leakage in {fs}"
"""
)

add_md("## Section 10. Honest split summary")
add_code(
    r"""
for m, R in RESULTS.items():
    display(R.split_summary_df.assign(mode=m))
    save_table(R.split_summary_df, f"sec10_split_summary_{m}")
"""
)

add_md("## Section 11. ML refinement (honest anti-leakage)")
add_code(
    r"""
for m, R in RESULTS.items():
    display(R.experiment_results_df.head(40))
    display(pd.DataFrame([R.honest_best_row]).assign(mode=m))
    save_table(R.experiment_results_df, f"sec11_experiment_results_{m}")
"""
)

add_md("## Section 12. Calibration selection + saturation")
add_code(
    r"""
from sklearn.calibration import calibration_curve
for m, R in RESULTS.items():
    cb = R.calibration_bundle
    display(cb["calibration_compare_df"])
    save_table(cb["calibration_compare_df"], f"sec12_calibration_compare_{m}")
    summ = pd.DataFrame(
        [
            {"metric": "calibration_used", "value": cb["calibration_used"]},
            {"metric": "selected_calibration_method", "value": cb["selected_calibration_method"]},
            {"metric": "brier_raw", "value": cb["brier_raw"]},
            {"metric": "brier_selected", "value": cb["brier_selected"]},
            {"metric": "ece_raw", "value": cb["ece_raw"]},
            {"metric": "ece_selected", "value": cb["ece_selected"]},
            {"metric": "sat_raw_gt_0.99", "value": cb["saturation_raw"]["sat_gt_0.99"]},
            {"metric": "sat_raw_gt_0.999", "value": cb["saturation_raw"]["sat_gt_0.999"]},
            {"metric": "sat_sel_gt_0.99", "value": cb["saturation_selected"]["sat_gt_0.99"]},
            {"metric": "sat_sel_gt_0.999", "value": cb["saturation_selected"]["sat_gt_0.999"]},
            {"metric": "uncertainty_lt_0.01_ratio", "value": float((R.cluster_df_calibrated["risk_uncertainty"] < 0.01).mean())},
        ]
    )
    display(summ)
    save_table(summ, f"sec12_calibration_selection_{m}")

    tr, te = R.split_dict[str(R.honest_best_row["split"])]
    yte = (R.cluster_df_rule.iloc[te]["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    p_raw = cb["p_raw"]; p_sel = cb["p_selected"]
    fig, ax = plt.subplots(figsize=(5, 4))
    pr, pp = calibration_curve(yte, p_raw, n_bins=10, strategy="uniform")
    pr2, pp2 = calibration_curve(yte, p_sel, n_bins=10, strategy="uniform")
    ax.plot(pp, pr, marker="o", label="raw")
    ax.plot(pp2, pr2, marker="o", label=cb["selected_calibration_method"])
    ax.plot([0,1],[0,1],"--",color="gray")
    ax.legend(); ax.set_title(f"Reliability ({m})")
    plt.tight_layout(); save_fig(f"sec12_reliability_{m}"); plt.show()
"""
)

add_md("## Section 13. Hybrid 결합식 재튜닝 + rule_only 비교")
add_code(
    r"""
def _recompute_ranking_summary(d: pd.DataFrame):
    hard = (d["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    soft = (d["risk_score_rule_v2"] >= d["risk_score_rule_v2"].quantile(0.90)).astype(int).to_numpy()
    score = d["score_final_stage4"].to_numpy(dtype=np.float64)
    rk = v2.ranking_metrics_extended(hard, score, soft_positive=soft, ks=[5,10,20])
    burden = s3.false_positive_burden_proxy(d, score_col="score_final_stage4")
    return {
        "precision@10_hard": float(rk.get("precision@10_hard", np.nan)),
        "ap_soft": float(rk.get("average_precision_soft", np.nan)),
        "burden_per_frame": float(burden.get("candidate_burden_per_frame", np.nan)),
    }

def _score_with_weights(d0: pd.DataFrame, w):
    d = d0.copy()
    d["score_base_rule"] = d["risk_score_rule_v2"].clip(0, 1)
    d["score_adj_lidar"] = w["W_LIDAR"] * d["lidar_corroboration_score_v2"].fillna(0)
    d["score_adj_temporal"] = w["W_TEMPORAL"] * (0.5*d["closing_consistency_score"].fillna(0) + 0.5*d["motion_smoothness_score"].fillna(0))
    d["score_adj_reliability"] = w["W_RELIABILITY"] * d["risk_confidence_calibrated"].fillna(0)
    d["score_adj_quality"] = w["W_QUALITY"] * d.get("proposal_quality_score", pd.Series(0.0, index=d.index)).fillna(0)
    d["score_penalty_uncertainty"] = w["W_UNCERTAINTY"] * d["risk_uncertainty"].fillna(0)
    d["score_final_stage4"] = (
        d["score_base_rule"] + d["score_adj_lidar"] + d["score_adj_temporal"] + d["score_adj_reliability"] + d["score_adj_quality"] - d["score_penalty_uncertainty"]
    ).clip(0,1)
    return d

grid = []
for wl in [0.08,0.12,0.16]:
    for wt in [0.06,0.10,0.14]:
        for wr in [0.06,0.10,0.14]:
            for wq in [0.04,0.08]:
                for wu in [0.16,0.20,0.24]:
                    grid.append({"W_LIDAR": wl, "W_TEMPORAL": wt, "W_RELIABILITY": wr, "W_QUALITY": wq, "W_UNCERTAINTY": wu})

tuning_rows = []
for m, R in RESULTS.items():
    d0 = R.cluster_df_calibrated.copy()
    rule_row = R.ablation_results_df[R.ablation_results_df["ablation"] == "rule_only"].head(1)
    rule_p10 = float(rule_row["topk_precision"].iloc[0]) if len(rule_row) else np.nan
    rule_ap = float(rule_row["ranking_ap"].iloc[0]) if len(rule_row) else np.nan
    rule_bur = float(rule_row["candidate_burden"].iloc[0]) if len(rule_row) else np.nan
    cand = []
    for w in grid:
        dt = _score_with_weights(d0, w)
        rs = _recompute_ranking_summary(dt)
        obj = (0 if np.isnan(rs["precision@10_hard"]) else rs["precision@10_hard"]) + 0.5*(0 if np.isnan(rs["ap_soft"]) else rs["ap_soft"]) - 0.015*(0 if np.isnan(rs["burden_per_frame"]) else rs["burden_per_frame"])
        cand.append({**w, **rs, "objective": obj})
    cand_df = pd.DataFrame(cand).sort_values("objective", ascending=False).reset_index(drop=True)
    best = cand_df.iloc[0].to_dict()
    tuned = _score_with_weights(d0, best)
    R.cluster_df_final = tuned
    R.ranking_summary_df = pd.DataFrame([{"metric":"precision@10_hard","value":best["precision@10_hard"]},{"metric":"ap_soft","value":best["ap_soft"]},{"metric":"candidate_burden_per_frame","value":best["burden_per_frame"]}])
    R.hybrid_sensitivity_df = cand_df.head(30)
    R.hybrid_vs_rule_df = pd.DataFrame([{
        "mode": m,
        "rule_only_p10": rule_p10,
        "hybrid_p10": best["precision@10_hard"],
        "delta_p10": best["precision@10_hard"] - rule_p10 if rule_p10 == rule_p10 else np.nan,
        "rule_only_ap": rule_ap,
        "hybrid_ap": best["ap_soft"],
        "delta_ap": best["ap_soft"] - rule_ap if rule_ap == rule_ap else np.nan,
        "rule_only_burden": rule_bur,
        "hybrid_burden": best["burden_per_frame"],
        "delta_burden": best["burden_per_frame"] - rule_bur if rule_bur == rule_bur else np.nan,
    }])
    k = min(40, len(tuned))
    top_h = set(tuned.nlargest(k, "score_final_stage4").index)
    top_r = set(tuned.nlargest(k, "risk_score_rule_v2").index)
    R.hybrid_better_cases = tuned.loc[list(top_h - top_r)].sort_values("score_final_stage4", ascending=False).head(20)
    tuning_rows.append({"mode": m, **{k: best[k] for k in ["W_LIDAR","W_TEMPORAL","W_RELIABILITY","W_QUALITY","W_UNCERTAINTY","precision@10_hard","ap_soft","burden_per_frame","objective"]}})
    save_table(R.hybrid_sensitivity_df, f"sec13_hybrid_weight_sensitivity_{m}")
    save_table(R.hybrid_vs_rule_df, f"sec13_rule_vs_hybrid_{m}")
    save_table(R.hybrid_better_cases, f"sec13_hybrid_better_cases_{m}")

hybrid_tuning_summary_df = pd.DataFrame(tuning_rows)
display(hybrid_tuning_summary_df)
save_table(hybrid_tuning_summary_df, "sec13_hybrid_tuning_summary")
"""
)

add_md("## Section 14. Stronger ops mode 비교 + frontier + operating point 추천")
add_code(
    r"""
rows = []
for m, R in RESULTS.items():
    rk = R.ranking_summary_df.set_index("metric")["value"].to_dict()
    d = R.cluster_df_final.copy()
    cand_pf = float(len(d) / max(d["frame_id"].nunique(), 1))
    d["window_id"] = (d["frame_order"] // 10).astype(int)
    cand_pw = float(d.groupby("window_id").size().mean()) if len(d) else np.nan
    rows.append({
        "mode": m,
        "candidates_per_frame": cand_pf,
        "candidates_per_window": cand_pw,
        "precision@10_hard": rk.get("precision@10_hard", np.nan),
        "ranking_ap_soft": rk.get("ap_soft", np.nan),
        "analyst_burden_proxy": float(cand_pf * 0.7 + cand_pw * 0.3) if (cand_pf == cand_pf and cand_pw == cand_pw) else np.nan,
    })
mode_compare_metrics_df = pd.DataFrame(rows).sort_values("candidates_per_frame")
display(mode_compare_metrics_df)
save_table(mode_compare_metrics_df, "sec14_mode_compare_metrics")

fig, ax = plt.subplots(figsize=(6.8, 4.2))
for _, r in mode_compare_metrics_df.iterrows():
    ax.scatter(r["candidates_per_frame"], r["precision@10_hard"], s=120)
    ax.annotate(r["mode"], (r["candidates_per_frame"], r["precision@10_hard"]), textcoords="offset points", xytext=(5, 2))
ax.set_xlabel("candidates / frame"); ax.set_ylabel("P@10 hard")
ax.set_title("Burden–utility frontier")
ax.grid(True, alpha=0.3)
plt.tight_layout(); save_fig("sec14_burden_utility_frontier"); plt.show()

def _recommend(df):
    cand = df.copy()
    cand["objective"] = cand["precision@10_hard"].fillna(0) + 0.4*cand["ranking_ap_soft"].fillna(0) - 0.01*cand["candidates_per_frame"].fillna(0)
    for thr in [15, 18, 20]:
        sub = cand[cand["candidates_per_frame"] < thr]
        if len(sub):
            return sub.sort_values("objective", ascending=False).head(1).assign(target=f"<{thr}")
    return cand.sort_values("objective", ascending=False).head(1).assign(target="fallback")

recommended_operating_point_df = _recommend(mode_compare_metrics_df)
display(recommended_operating_point_df)
save_table(recommended_operating_point_df, "sec14_recommended_operating_point")
"""
)

add_md("## Section 15. Ablation")
add_code(
    r"""
for m, R in RESULTS.items():
    display(R.ablation_results_df)
    save_table(R.ablation_results_df, f"sec15_ablation_results_{m}")
"""
)

add_md("## Section 16. Runtime")
add_code(
    r"""
runtime_summary_df = pd.DataFrame(runtime_records)
if not runtime_summary_df.empty:
    runtime_summary_df = runtime_summary_df.groupby("stage", as_index=False)["sec"].sum().sort_values("sec", ascending=False)
display(runtime_summary_df)
save_table(runtime_summary_df, "sec16_runtime_summary")
"""
)

add_md("## Section 17. Explainability + hybrid 유리 hard case")
add_code(
    r"""
for m, R in RESULTS.items():
    display(R.top_candidate_table.head(12))
    display(R.hybrid_better_cases.head(10))
    save_table(R.top_candidate_table, f"sec17_top_candidate_table_{m}")
    save_table(R.hard_case_table, f"sec17_hard_case_table_{m}")
    save_table(R.hybrid_better_cases, f"sec17_hybrid_better_cases_{m}")
"""
)

add_md("## Section 18. Temporal effectiveness report")
add_code(
    r"""
temp_cols = ["approach_score","temporal_stability_score","motion_smoothness_score","closing_consistency_score","trajectory_risk_proxy"]
for m, R in RESULTS.items():
    d = R.cluster_df_final
    fig, axes = plt.subplots(2, 3, figsize=(12, 6))
    axes = axes.ravel()
    for i, c in enumerate(temp_cols):
        if c in d.columns:
            sns.histplot(d[c].clip(0, d[c].quantile(0.99)), bins=40, ax=axes[i], color="#4c72b0")
            axes[i].set_title(c)
    plt.tight_layout(); save_fig(f"sec18_temporal_hist_{m}"); plt.show()

Rref = RESULTS["full"]
base = Rref.cluster_df_calibrated.copy()
temporal_rows = []
top_sets = {}
for tag, wt in [("weak", 0.06), ("medium", 0.10), ("strong", 0.14)]:
    d = base.copy()
    d["score_tmp"] = (
        d["risk_score_rule_v2"].clip(0,1)
        + 0.12*d["lidar_corroboration_score_v2"].fillna(0)
        + wt*(0.5*d["closing_consistency_score"].fillna(0)+0.5*d["motion_smoothness_score"].fillna(0))
        + 0.10*d["risk_confidence_calibrated"].fillna(0)
        + 0.08*d.get("proposal_quality_score", pd.Series(0.0, index=d.index)).fillna(0)
        - 0.20*d["risk_uncertainty"].fillna(0)
    ).clip(0,1)
    hard = (d["risk_label_rule_v2"] == "high").astype(int).to_numpy()
    soft = (d["risk_score_rule_v2"] >= d["risk_score_rule_v2"].quantile(0.90)).astype(int).to_numpy()
    rk = v2.ranking_metrics_extended(hard, d["score_tmp"].to_numpy(), soft_positive=soft, ks=[10])
    top_sets[tag] = set(d.nlargest(min(50, len(d)), "score_tmp").index)
    temporal_rows.append({"setting": tag, "W_TEMPORAL": wt, "precision@10_hard": rk.get("precision@10_hard", np.nan), "ranking_ap_soft": rk.get("average_precision_soft", np.nan)})

temporal_effectiveness_report_df = pd.DataFrame(temporal_rows)
mid = top_sets["medium"]
temporal_effectiveness_report_df["rank_shift_vs_medium"] = [
    float(len(top_sets[s] ^ mid) / max(len(mid), 1)) for s in temporal_effectiveness_report_df["setting"]
]
display(temporal_effectiveness_report_df)
save_table(temporal_effectiveness_report_df, "sec18_temporal_effectiveness_report")

changed_idx = list((top_sets["strong"] - top_sets["weak"]))[:3]
temporal_topk_changed_examples = base.loc[changed_idx, [c for c in ["cluster_uid","track_id","risk_score_rule_v2","closing_consistency_score","motion_smoothness_score","trajectory_risk_proxy"] if c in base.columns]].copy()
display(temporal_topk_changed_examples)
save_table(temporal_topk_changed_examples, "sec18_temporal_topk_changed_examples")
"""
)

add_md("## Section 19. Final summary + ops source trace + sanity checks")
add_code(
    r"""
def _summary_row(scope: str, m: str, R):
    hb = R.honest_best_row
    rk = R.ranking_summary_df.set_index("metric")["value"].to_dict()
    cb = R.calibration_bundle
    return {
        "summary_scope": scope,
        "pipeline_mode": m,
        "selected_clusterer": selected_cluster_algo,
        "selected_tracking_mode": R.selected_tracking_mode,
        "selected_threshold_strategy": "quantile-gated + track sensitivity",
        "best_model": str(hb["model"]),
        "honest_eval_split": str(hb["split"]),
        "honest_feature_set": str(hb["feature_set"]),
        "macro_f1": float(hb["macro_f1"]),
        "high_recall": float(hb["high_recall"]),
        "ranking_ap": float(rk.get("ap_soft", np.nan)),
        "burden_per_frame": float(rk.get("candidate_burden_per_frame", np.nan)),
        "runtime_sec_total": float(pd.DataFrame(runtime_records)["sec"].sum()) if runtime_records else np.nan,
        "calibration_used": bool(cb["calibration_used"]),
        "selected_calibration_method": str(cb["selected_calibration_method"]),
        "brier_raw": float(cb["brier_raw"]),
        "brier_selected": float(cb["brier_selected"]),
        "ece_raw": float(cb["ece_raw"]),
        "ece_selected": float(cb["ece_selected"]),
    }

ops_mode = "ops"
if "recommended_operating_point_df" in globals() and len(recommended_operating_point_df):
    ops_mode = str(recommended_operating_point_df.iloc[0]["mode"])

final_summary_df = pd.DataFrame(
    [
        _summary_row("research_full", "full", RESULTS["full"]),
        _summary_row("ops_low_burden", ops_mode, RESULTS[ops_mode]),
    ]
)
display(final_summary_df)
save_table(final_summary_df, "sec19_final_summary")

# source trace transparency
trace_rows = []
for _, row in final_summary_df.iterrows():
    m = row["pipeline_mode"]
    R = RESULTS[m]
    exp = R.experiment_results_df
    q = exp[
        (exp["task"] == "classification")
        & (exp["model"] == row["best_model"])
        & (exp["feature_set"] == row["honest_feature_set"])
        & (exp["split"] == row["honest_eval_split"])
    ]
    assert len(q) == 1, f"source trace mismatch for mode={m}"
    qr = q.iloc[0]
    split_row = R.split_summary_df[R.split_summary_df["split"] == row["honest_eval_split"]].iloc[0]
    trace_rows.append(
        {
            "pipeline_mode": m,
            "source_model": qr["model"],
            "source_feature_set": qr["feature_set"],
            "source_split": qr["split"],
            "source_macro_f1": qr["macro_f1"],
            "source_high_recall": qr["high_recall"],
            "source_test_n": split_row["n_test"],
            "source_test_high_n": split_row["test_high"],
            "summary_macro_f1": row["macro_f1"],
            "summary_high_recall": row["high_recall"],
        }
    )
ops_summary_source_trace_df = pd.DataFrame(trace_rows)
display(ops_summary_source_trace_df)
save_table(ops_summary_source_trace_df, "sec19_ops_summary_source_trace")

# sanity checks
for _, row in final_summary_df.iterrows():
    assert str(row["honest_eval_split"]) in e2e.HONEST_SPLITS, "random split mixed in final summary"
    assert str(row["honest_feature_set"]) in {"A_strict_anti_leakage", "B_moderate_anti_leakage"}, "leakage feature set mixed in final summary"

perfect_warn = ops_summary_source_trace_df[
    (ops_summary_source_trace_df["source_macro_f1"] >= 0.9999)
    & (ops_summary_source_trace_df["source_high_recall"] >= 0.9999)
    & (ops_summary_source_trace_df["source_test_high_n"] < 20)
]
if len(perfect_warn):
    print("[경고] subset이 너무 작은 perfect score 가능성")
    display(perfect_warn)
"""
)

add_md(
    """## Section 20. 한국어 결론

1. Run-All 구조는 유지하면서 summary가 실제 결과와 일치하도록 source trace/검증을 넣었다.  
2. anti-leakage는 blacklist + assert로 강제했다.  
3. calibration은 성능이 좋아질 때만 채택하도록 조건부로 변경했다.  
4. hybrid는 가중치 sweep으로 rule_only 대비 trade-off 관점에서 재튜닝했다.  
5. ops는 stronger suppression(`ops_t20/ops_t18/ops_t15`)로 burden 목표를 실험하고 추천 operating point를 자동 제안한다.  
6. temporal은 rescaling + weight sweep + top-k 변화 사례로 실질 기여를 검증한다.  
7. 최종 목표는 최고 accuracy가 아니라 정직한 평가와 운영 가능한 top-k 제시다.
"""
)

add_code(
    r"""
need = [TABLE_DIR / "sec19_final_summary.csv", TABLE_DIR / "sec19_ops_summary_source_trace.csv", TABLE_DIR / "sec18_temporal_effectiveness_report.csv"]
ok = all(p.exists() for p in need)
print("[완료] 핵심 산출물 확인:", ok)
"""
)

nb.cells = cells
nb.metadata = {
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    "language_info": {"name": "python"},
}

OUT.write_text(nbf.writes(nb), encoding="utf-8")
print("wrote", OUT)
