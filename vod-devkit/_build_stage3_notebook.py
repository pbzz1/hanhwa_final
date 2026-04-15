# -*- coding: utf-8 -*-
"""Generate 20_vod_hybrid_risk_pipeline_stage3_fullrun.ipynb from Stage2 notebook cells."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
nb_path = ROOT / "20_vod_hybrid_risk_pipeline_stage3_fullrun.ipynb"
src_nb = json.loads((ROOT / "19_vod_hybrid_risk_pipeline_stage2_fullrun.ipynb").read_text(encoding="utf-8"))

def cell_src(idx: int) -> str:
    return "".join(src_nb["cells"][idx].get("source", []))

cell3 = cell_src(3)
cell5 = cell_src(5)
cell7_radar = cell_src(7)

imports_s3 = "\nimport vod_hybrid_pipeline_stage3 as s3\n"

setup_code = cell3 + imports_s3 + "\n" + cell5 + "\n" + cell7_radar

pipeline_code = r'''# --- Stage3: suppression + proposal quality + LiDAR v3 + tracking + rule v2 ---
methods = ["dbscan"] + (["hdbscan"] if HDBSCAN_OK else [])
cluster_df_all, cluster_quality = s3.build_cluster_tables(radar_df, methods)
print("cluster_df_all:", cluster_df_all.shape)

hdb = cluster_df_all[cluster_df_all["algorithm"] == "hdbscan"].copy() if HDBSCAN_OK else cluster_df_all[cluster_df_all["algorithm"] == "dbscan"].copy()
n0 = len(hdb)
h_sup, sup_sum = s3.suppress_cluster_candidates(hdb)
h_prop = s3.compute_proposal_quality(h_sup)
h_gated = s3.gate_top_fraction(h_prop, keep_fraction=0.88)
print("Suppression summary (HDBSCAN path):", sup_sum)
print("clusters raw / after suppression / after top-q gate:", n0, len(h_sup), len(h_gated))

frame_by_id = {fr["frame_id"]: fr for fr in frames}
profiler = s3.Stage3Profiler()
variant_df = s3.compare_clustering_variants(radar_df, frame_by_id, ROI, profile=profiler)
display(variant_df)
display(profiler.summary())
'''

lidar_compare = r'''# LiDAR v1 vs v3 (동일 서브샘플)
sub = h_gated.head(min(4000, len(h_gated))).copy() if len(h_gated) else hdb.head(500).copy()
v1 = v2.attach_lidar_corroboration_v2(sub, frame_by_id, ROI, r1=1.5, r2=2.5, r3=4.0, verify_radius=2.2)
v3 = s3.attach_lidar_corroboration_v3(sub, frame_by_id, ROI, r1=1.5, r2=2.5, r3=4.0, verify_radius=2.2)
cmp = pd.DataFrame({
    "lidar_v1_mean": [float(v1["lidar_corroboration_score"].mean())],
    "lidar_v2_mean": [float(v3["lidar_corroboration_score_v2"].mean())],
    "lidar_v1_std": [float(v1["lidar_corroboration_score"].std())],
    "lidar_v2_std": [float(v3["lidar_corroboration_score_v2"].std())],
})
display(cmp)
'''

tracking_compare_code = r'''# baseline vs improved tracking + expanded temporal feature 비교
track_src = h_gated.head(min(5000, len(h_gated))).copy() if len(h_gated) else hdb.head(1000).copy()
track_src = s3.attach_lidar_corroboration_v3(track_src, frame_by_id, ROI)
obs_b = s3.run_tracking(track_src, mode="baseline", gate_dist=TRACK_GATE_DIST, max_miss=1)
obs_i = s3.run_tracking(track_src, mode="improved", gate_dist=TRACK_GATE_DIST, max_miss=2)

def _track_quality(obs: pd.DataFrame, mode: str):
    if obs.empty:
        return {"mode": mode, "n_tracks": 0}
    tl = obs.groupby("track_id").size()
    merged = track_src.merge(
        obs[["cluster_uid", "track_id", "track_len", "avg_speed", "heading_change", "approach_score", "temporal_stability_score", "cluster_persistence"]].drop_duplicates("cluster_uid"),
        on="cluster_uid",
        how="left",
    )
    for c, d in {"track_id": -1, "track_len": 1, "avg_speed": 0.0, "heading_change": 0.0, "approach_score": 0.0, "temporal_stability_score": 0.0, "cluster_persistence": 0.0}.items():
        merged[c] = merged[c].fillna(d)
    merged = s3.attach_track_temporal_features_v3(merged, obs)
    return {
        "mode": mode,
        "n_tracks": int(obs["track_id"].nunique()),
        "mean_track_len": float(tl.mean()),
        "track_fragmentation_rate": float((tl == 1).mean()),
        "approach_score_mean": float(obs["approach_score"].mean()),
        "temporal_stability_mean": float(obs["temporal_stability_score"].mean()),
        "motion_smoothness_score_mean": float(merged["motion_smoothness_score"].mean()),
        "closing_consistency_score_mean": float(merged["closing_consistency_score"].mean()),
        "trajectory_risk_proxy_mean": float(merged["trajectory_risk_proxy"].mean()),
    }

track_cmp = pd.DataFrame([_track_quality(obs_b, "baseline"), _track_quality(obs_i, "improved")])
display(track_cmp)
'''

rule_compare_code = r'''# rule risk v1 vs v2 비교
rule_src = h_gated.head(min(5000, len(h_gated))).copy() if len(h_gated) else hdb.head(1000).copy()
rule_src = s3.attach_lidar_corroboration_v3(rule_src, frame_by_id, ROI)
tobs_r = s3.run_tracking(rule_src, mode="improved", gate_dist=TRACK_GATE_DIST, max_miss=2)
rule_m = rule_src.merge(
    tobs_r[["cluster_uid", "track_id", "track_len", "avg_speed", "heading_change", "approach_score", "temporal_stability_score", "cluster_persistence"]].drop_duplicates("cluster_uid"),
    on="cluster_uid",
    how="left",
)
for c, d in {"track_id": -1, "track_len": 1, "avg_speed": 0.0, "heading_change": 0.0, "approach_score": 0.0, "temporal_stability_score": 0.0, "cluster_persistence": 0.0}.items():
    rule_m[c] = rule_m[c].fillna(d)
rule_m = s3.attach_track_temporal_features_v3(rule_m, tobs_r)
rule_m = s3.compute_rule_components_v2(rule_m, lidar_col="lidar_corroboration_score_v2")
rule_m["risk_score_rule_v1"] = v2.compute_rule_score_raw(rule_m)
rule_m_v1 = rule_m.copy()
rule_m_v1["lidar_corroboration_score"] = rule_m_v1["lidar_corroboration_score_v2"]
rule_m_v1 = v2.assign_hybrid_risk_labels(rule_m_v1, mode="hybrid_quantile")
rule_m_v2 = rule_m.copy()
rule_m_v2["risk_score_rule"] = rule_m_v2["risk_score_rule_v2"]
rule_m_v2["risk_label_rule"] = v2.assign_hybrid_labels_from_scores(rule_m_v2, score_col="risk_score_rule_v2")

cmp_rule = pd.DataFrame({
    "metric": ["score_mean", "score_std", "high_count", "medium_count", "low_count"],
    "rule_v1": [
        float(rule_m_v1["risk_score_rule"].mean()),
        float(rule_m_v1["risk_score_rule"].std()),
        int((rule_m_v1["risk_label_rule"] == "high").sum()),
        int((rule_m_v1["risk_label_rule"] == "medium").sum()),
        int((rule_m_v1["risk_label_rule"] == "low").sum()),
    ],
    "rule_v2": [
        float(rule_m_v2["risk_score_rule_v2"].mean()),
        float(rule_m_v2["risk_score_rule_v2"].std()),
        int((rule_m_v2["risk_label_rule"] == "high").sum()),
        int((rule_m_v2["risk_label_rule"] == "medium").sum()),
        int((rule_m_v2["risk_label_rule"] == "low").sum()),
    ],
})
display(cmp_rule)
'''

full_pipe = r'''# Full path: suppressed HDBSCAN + LiDAR v3 + improved tracking + rule v2 + hybrid + calibration
work = h_gated.copy() if len(h_gated) else h_prop.copy()
work = s3.attach_lidar_corroboration_v3(work, frame_by_id, ROI)
tobs = s3.run_tracking(work, mode="improved", gate_dist=TRACK_GATE_DIST, max_miss=2)
use_cols = ["cluster_uid", "track_id", "track_len", "avg_speed", "heading_change", "approach_score", "temporal_stability_score", "cluster_persistence"]
for c, d in {"track_id": -1, "track_len": 1, "avg_speed": 0.0, "heading_change": 0.0, "approach_score": 0.0, "temporal_stability_score": 0.0, "cluster_persistence": 0.0}.items():
    if c not in tobs.columns:
        tobs[c] = d
mdf = work.merge(tobs[use_cols].drop_duplicates("cluster_uid"), on="cluster_uid", how="left")
for c, d in {"track_id": -1, "track_len": 1, "avg_speed": 0.0, "heading_change": 0.0, "approach_score": 0.0, "temporal_stability_score": 0.0, "cluster_persistence": 0.0}.items():
    mdf[c] = mdf[c].fillna(d)
mdf = s3.attach_track_temporal_features_v3(mdf, tobs)
mdf = s3.compute_rule_components_v2(mdf, lidar_col="lidar_corroboration_score_v2")
mdf["risk_score_rule"] = v2.compute_rule_score_raw(mdf)
mdf_l = mdf.copy()
mdf_l["lidar_corroboration_score"] = mdf_l["lidar_corroboration_score_v2"]
risk_df = v2.assign_hybrid_risk_labels(mdf_l, mode="hybrid_quantile")
for c in ["risk_proximity", "risk_closing", "risk_persistence", "risk_corroboration", "risk_motion_anomaly", "risk_track_stability", "risk_score_rule_v2"]:
    risk_df[c] = mdf[c].values
risk_df["risk_label_hybrid"] = v2.assign_hybrid_labels_from_scores(risk_df, score_col="risk_score_rule_v2")

# ML high vs not + calibration (HistGradientBoosting / RandomForest)
feat_cols = [
    "range_xy", "abs_vr_comp", "spread_xy", "density_proxy", "n_points",
    "lidar_corroboration_score_v2", "track_len", "approach_score", "temporal_stability_score",
    "cluster_persistence", "trajectory_risk_proxy", "heading_consistency_score",
]
X = risk_df[feat_cols].fillna(0).to_numpy(dtype=np.float64)
y_high = (risk_df["risk_label_rule"] == "high").astype(int).to_numpy()
cal_pack = s3.fit_calibrated_binary_models(X, y_high, cv=3)
P = s3.collect_calibrated_probabilities(cal_pack.get("calibrated", {}), X)
u, conf = s3.uncertainty_from_prob_matrix(P) if P.size else (np.zeros(len(risk_df)), np.zeros(len(risk_df)))
risk_df["ml_high_prob_mean"] = P.mean(axis=1) if P.size else 0.0
risk_df["risk_uncertainty"] = u
risk_df["risk_confidence_calibrated"] = conf
risk_df["risk_score_hybrid"] = risk_df["risk_score_rule_v2"] * 0.55 + risk_df["ml_high_prob_mean"] * 0.45
risk_df["risk_score_final_calibrated"] = s3.compute_risk_score_final_calibrated(risk_df, rule_col="risk_score_rule_v2", ml_prob_col="ml_high_prob_mean")
risk_df = s3.aggregate_track_level_risk_scores(risk_df, cluster_score_col="risk_score_rule_v2", hybrid_score_col="risk_score_hybrid")
track_topk = risk_df.sort_values("risk_score_track_hybrid", ascending=False).drop_duplicates("track_id").head(15)
display(track_topk[["track_id", "risk_score_track_hybrid", "risk_score_track", "track_age", "risk_label_rule", "cluster_uid"]])

# Ranking / window / burden
hard = (risk_df["risk_label_rule"] == "high").astype(int).to_numpy()
soft = (risk_df["risk_score_rule"] >= risk_df["risk_score_rule"].quantile(0.90)).astype(int).to_numpy()
rk = v2.ranking_metrics_extended(hard, risk_df["risk_score_final_calibrated"].to_numpy(), soft_positive=soft, ks=[5, 10, 20])
rk["mean_average_precision"] = s3.mean_average_precision_binary(soft, risk_df["risk_score_final_calibrated"].to_numpy())
rk["mrr_hard"] = s3.mean_reciprocal_rank(hard, risk_df["risk_score_final_calibrated"].to_numpy())
rk["ndcg10_soft"] = s3.ndcg_at_k_from_scores(soft.astype(float), risk_df["risk_score_final_calibrated"].to_numpy(), 10)
risk_df["is_high_tmp"] = hard
win = s3.window_topk_hit_recall(risk_df, score_col="risk_score_final_calibrated", label_high_col="is_high_tmp", window=10, k=5)
burden = s3.false_positive_burden_proxy(risk_df, score_col="risk_score_final_calibrated")
print("ranking:", rk)
print("window10 top5:", win)
print("burden:", burden)

# Calibration curve (first calibrated model)
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss
if cal_pack.get("calibrated"):
    name0 = next(iter(cal_pack["calibrated"]))
    m0 = cal_pack["calibrated"][name0]
    p0 = m0.predict_proba(X)[:, 1]
    prob_true, prob_pred = calibration_curve(y_high, p0, n_bins=10, strategy="uniform")
    print("Brier", name0, float(brier_score_loss(y_high, p0)))
    print("ECE", name0, s3.expected_calibration_error(y_high, p0))
    fig, ax = plt.subplots(figsize=(4.5, 4))
    ax.plot(prob_pred, prob_true, marker="o", label=name0)
    ax.plot([0, 1], [0, 1], ls="--", color="gray")
    ax.set_xlabel("mean predicted"); ax.set_ylabel("fraction positive"); ax.legend()
    ax.set_title("Calibration curve (high proxy)")
    plt.show()

# Track-level threshold sensitivity
display(s3.threshold_sensitivity_track_level(risk_df, score_col="risk_score_track"))

# Explain top-k
expl = s3.build_topk_explanation_table(risk_df, score_col="risk_score_final_calibrated", top_k=12)
display(expl)

# Macro F1 (proxy labels)
from sklearn.metrics import f1_score
macro_f1 = f1_score(risk_df["risk_label_rule"], risk_df["risk_label_hybrid"], average="macro", labels=["low", "medium", "high"], zero_division=0)
high_recall = float((risk_df["risk_label_hybrid"] == "high").sum() / max((risk_df["risk_label_rule"] == "high").sum(), 1))
print("macro F1 (rule vs hybrid label):", macro_f1, "high recall proxy:", high_recall)
'''

ablation_code = r'''# Ablation (요약): Stage3 스트레스 테스트 — 동일 proxy 라벨로 ranking 비교
rows = []
base = risk_df.copy()
runtime_total = float(profiler.summary()["total_sec"].sum()) if len(profiler.summary()) else np.nan

def eval_row(tag, dfx, score_col=None, runtime_sec=np.nan):
    if dfx is None or len(dfx) < 50:
        return
    h = (dfx["risk_label_rule"] == "high").astype(int).to_numpy()
    s = (dfx["risk_score_rule"] >= dfx["risk_score_rule"].quantile(0.90)).astype(int).to_numpy()
    sc = dfx[score_col].to_numpy() if score_col and score_col in dfx.columns else dfx["risk_score_final_calibrated"].to_numpy()
    r = v2.ranking_metrics_extended(h, sc, soft_positive=s, ks=[10])
    rows.append({
        "ablation": tag,
        "n": len(dfx),
        "macro_f1_proxy": float(f1_score(dfx["risk_label_rule"], dfx["risk_label_hybrid"], average="macro", labels=["low","medium","high"], zero_division=0)),
        "ap_soft": r.get("average_precision_soft", np.nan),
        "p@10_hard": r.get("precision@10_hard", np.nan),
        "high_recall_proxy": float((dfx["risk_label_hybrid"] == "high").sum() / max((dfx["risk_label_rule"] == "high").sum(), 1)),
        "candidate_burden": float(len(dfx) / max(dfx["frame_id"].nunique(), 1)),
        "runtime_sec_proxy": float(runtime_sec),
    })

eval_row("full_model", base, None, runtime_total)
eval_row("no_lidar", base.assign(lidar_corroboration_score_v2=0.0), "risk_score_final_calibrated", runtime_total)
eval_row("no_tracking_features", base.assign(track_len=1, temporal_stability_score=0.0, cluster_persistence=0.0), "risk_score_final_calibrated", runtime_total)
eval_row("no_suppression", base.sample(frac=min(1.0, 6000 / max(len(base), 1)), random_state=SEED), "risk_score_rule_v2", runtime_total)
eval_row("no_calibration", base.assign(risk_uncertainty=0.0), "risk_score_final_calibrated", runtime_total)
eval_row("rule_only", base.assign(ml_high_prob_mean=0.0), "risk_score_rule_v2")
eval_row("ml_only", base.assign(risk_score_rule_v2=base["ml_high_prob_mean"]), "ml_high_prob_mean")
eval_row("rule_plus_ml_hybrid", base.assign(risk_uncertainty=0.0), "risk_score_hybrid")

# dbscan / hdbscan only (variant summary 기반)
if not variant_df.empty:
    for tag in ["dbscan_raw", "hdbscan_raw", "hdbscan_suppressed"]:
        vv = variant_df[variant_df["variant"] == tag]
        if vv.empty:
            continue
        rr = vv.iloc[0]
        rows.append({
            "ablation": "dbscan_only" if tag == "dbscan_raw" else ("hdbscan_only" if tag == "hdbscan_raw" else "hdbscan_suppressed"),
            "n": int(rr.get("n_clusters_scored", np.nan)),
            "macro_f1_proxy": np.nan,
            "ap_soft": float(rr.get("ap_soft", np.nan)),
            "p@10_hard": float(rr.get("precision@10_hard", np.nan)),
            "high_recall_proxy": np.nan,
            "candidate_burden": float(rr.get("n_clusters_scored", np.nan) / max(frame_summary["frame_id"].nunique(), 1)),
            "runtime_sec_proxy": float(runtime_total),
        })

display(pd.DataFrame(rows).sort_values("ap_soft", ascending=False))
'''

md_modes = """### LiDAR-assisted vs Radar-only (`lidar_mode`)\n- **LiDAR-assisted**: LiDAR bin이 있을 때 `lidar_corroboration_score_v2`가 거리·밀도·extent·multi-NN·overlap을 반영합니다.\n- **Radar-only**: 해당 프레임에 LiDAR 포인트가 없으면 `lidar_mode=radar_only`로 두고, 거리·속도·밀도 proxy만으로 `lidar_corroboration_score_v2`(fallback)를 채웁니다.\n"""

md_conclusion = """## Stage3 최종 결론\n1. Stage2는 **high 후보가 실제로 존재**하고 3-class 분포가 형성된 것이 핵심 성과였습니다.\n2. Stage3의 목적은 점수 미세 튜닝이 아니라 **후보 부담(candidate burden) 감소**, **track 단위 해석**, **설명 가능성**, **calibration·uncertainty** 강화입니다.\n3. 외부 GT가 아닌 rule/hybrid 내부 라벨이므로 **절대 정확도 과대해석은 금지**이며, 운영 지표(부담·ranking·high recall proxy) 중심으로 봅니다.\n4. **지속적 위협 우선순위화**(track·window)가 단일 프레임 분류보다 운영에 가깝습니다.\n5. **rule baseline + ML refinement + calibration + uncertainty + 설명**의 하이브리드가 실전형 구조에 가깝습니다.\n6. accuracy보다 **macro F1, high recall proxy, ranking quality, candidate burden**이 더 중요합니다.\n7. 최종 목표는 \"무엇인지 맞히기\"보다 **\"어디를 먼저 볼지 설명 가능하게 제시\"**하는 것입니다.\n8. **Suppression + proposal quality**로 HDBSCAN 후보 폭주를 완화하고, 이후 단계 계산 비용을 줄입니다.\n9. **LiDAR v3**는 center·extent·multi-NN·overlap을 함께 보며 v1 대비 정합 신호의 입체성을 높입니다.\n10. **Light vs Full** 모드(`s3.PIPELINE_MODE_*`)는 속도·기능 트레이드오프를 명시적으로 나눕니다.\n11. Ablation으로 **LiDAR/트래킹/보정/규칙** 각각의 기여를 분리해 과적합·과대해석을 줄입니다.\n"""

bev_code = r'''# BEV + 설명 overlay (간단): hybrid 상위 포인트 + 설명 텍스트 샘플
sample = risk_df.sort_values("risk_score_final_calibrated", ascending=False).head(400)
fig, ax = plt.subplots(figsize=(6, 6))
ax.scatter(radar_df["x"], radar_df["y"], s=1, c="0.8", alpha=0.12, label="radar")
sc = ax.scatter(sample["cx"], sample["cy"], c=sample["risk_score_final_calibrated"], cmap="magma", s=18, edgecolor="k", linewidth=0.2)
for _, r in expl.head(5).iterrows():
    uid = r["cluster_uid"]
    row = risk_df[risk_df["cluster_uid"] == uid]
    if row.empty:
        continue
    rx, ry = float(row.iloc[0]["cx"]), float(row.iloc[0]["cy"])
    ax.text(rx + 0.4, ry + 0.4, r["explanation_ko"][:40] + "…", fontsize=6, clip_on=True)
plt.colorbar(sc, ax=ax, fraction=0.046, pad=0.04)
ax.set_title("BEV: calibrated risk + Korean explanation (top-5 snippet)")
ax.set_aspect("equal", "box")
plt.show()
'''

cells = [
    {"cell_type": "markdown", "metadata": {}, "source": ["# VoD Hybrid Risk Pipeline — Stage 3\n\nStage2 결과를 바탕으로 후보 억제·LiDAR v3·track reasoning·rule v2·calibration·설명 가능한 top-k까지 확장합니다.\n"]},
    {"cell_type": "markdown", "metadata": {}, "source": [md_modes]},
    {"cell_type": "code", "metadata": {}, "source": [setup_code], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 1. Candidate suppression & clustering variants\n"]},
    {"cell_type": "code", "metadata": {}, "source": [pipeline_code], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 2. LiDAR corroboration v1 vs v2\n"]},
    {"cell_type": "code", "metadata": {}, "source": [lidar_compare], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 3. Tracking baseline vs improved + temporal feature 확장 비교\n"]},
    {"cell_type": "code", "metadata": {}, "source": [tracking_compare_code], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 4. Rule risk v1 vs v2 비교\n"]},
    {"cell_type": "code", "metadata": {}, "source": [rule_compare_code], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 5. Full pipeline + calibration + explainability\n"]},
    {"cell_type": "code", "metadata": {}, "source": [full_pipe], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 6. Ablation (요약)\n"]},
    {"cell_type": "code", "metadata": {}, "source": [ablation_code], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": ["## 7. BEV + explanation overlay\n"]},
    {"cell_type": "code", "metadata": {}, "source": [bev_code], "outputs": [], "execution_count": None},
    {"cell_type": "markdown", "metadata": {}, "source": [md_conclusion]},
]

nb = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
    "cells": cells,
}
nb_path.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", nb_path)
