# -*- coding: utf-8 -*-
"""
Step3 FMCW(지상감지 레이더) 파이프라인용 슬라이드 시각화 PNG 생성.

실제 코드 흐름(21_vod_hybrid_risk_pipeline_e2e_runall + vod_e2e_pipeline):
  Raw → 전처리 → 밀도기반 클러스터 후보(DBSCAN/HDBSCAN 자동 선택) → 후보 억제
  → LiDAR 보강( corroboration ) → 시간축 트래킹

출력: <out_dir>/step01_raw_radar.png … step06_temporal_tracking.png

선택: --frame-summary-csv 가 있으면 전처리(유지율) 곡선에 반영.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import FancyBboxPatch, Polygon
from matplotlib.collections import LineCollection


def _setup_font() -> None:
    if sys.platform == "win32":
        plt.rcParams["font.family"] = ["Malgun Gothic", "DejaVu Sans"]
    else:
        plt.rcParams["font.family"] = ["DejaVu Sans", "Noto Sans CJK KR", "NanumGothic"]
    plt.rcParams["axes.unicode_minus"] = False


def _starfield(ax, rng: np.random.Generator, n: int = 220) -> None:
    x = rng.uniform(0, 1, n)
    y = rng.uniform(0, 1, n)
    s = rng.uniform(0.4, 2.2, n)
    a = rng.uniform(0.12, 0.45, n)
    ax.scatter(x, y, s=s, c="white", alpha=a, transform=ax.transAxes, zorder=0)


def _style_dark(fig: plt.Figure) -> None:
    fig.patch.set_facecolor("#0b1020")
    for ax in fig.axes:
        ax.set_facecolor("#121a30")
        for spine in ax.spines.values():
            spine.set_color("#4a5a78")
        ax.tick_params(colors="#c8d4e8")
        ax.title.set_color("#e8f0ff")
        ax.xaxis.label.set_color("#c8d4e8")
        ax.yaxis.label.set_color("#c8d4e8")


def fig01_raw_radar(out: Path, rng: np.random.Generator) -> None:
    """VoD 스타일: RCS / 보상 속도 / XY 산점."""
    n = 3500
    nk = n // 4
    parts = [
        rng.normal(loc=(8, -2), scale=(1.2, 0.55), size=(nk, 2)),
        rng.normal(loc=(18, 3), scale=(1.5, 1.0), size=(nk, 2)),
        rng.normal(loc=(25, -5), scale=(2.0, 1.2), size=(nk, 2)),
    ]
    clusters = np.vstack(parts)
    noise = rng.uniform([0, -12], [35, 12], size=(n - len(clusters), 2))
    xy = np.vstack([clusters, noise])
    rcs = -40 + 8 * np.tanh((xy[:, 0] - 15) / 12) + rng.normal(0, 4, size=len(xy))
    vr = rng.normal(0, 1.2, size=len(xy)) + 0.08 * xy[:, 0]

    fig, axes = plt.subplots(1, 3, figsize=(12.5, 3.6), constrained_layout=True)
    _starfield(axes[0], rng)
    _starfield(axes[1], rng)
    _starfield(axes[2], rng)

    axes[0].hist(rcs, bins=48, color="#5b8def", edgecolor="#0b1020", alpha=0.9)
    axes[0].set_title("RCS 분포")
    axes[0].set_xlabel("RCS (dBsm)")
    axes[0].set_ylabel("count")

    axes[1].hist(vr, bins=48, color="#7dd3a0", edgecolor="#0b1020", alpha=0.9)
    axes[1].set_title("보상 방사속도 $v_r$")
    axes[1].set_xlabel("$v_{r,comp}$ (m/s)")

    sc = axes[2].scatter(xy[:, 0], xy[:, 1], c=rcs, s=2, cmap="plasma", alpha=0.65, rasterized=True)
    axes[2].set_aspect("equal", adjustable="box")
    axes[2].set_xlabel("x (m)")
    axes[2].set_ylabel("y (m)")
    axes[2].set_title("Radar XY (색=RCS)")
    plt.colorbar(sc, ax=axes[2], fraction=0.046, pad=0.02, label="RCS")

    fig.suptitle("① VoD Raw Radar Data", fontsize=13, color="#e8f0ff", y=1.02)
    _style_dark(fig)
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def fig02_preprocess(out: Path, rng: np.random.Generator, frame_summary: pd.DataFrame | None) -> None:
    fig, ax = plt.subplots(figsize=(8.5, 3.8), constrained_layout=True)
    _starfield(ax, rng)

    if frame_summary is not None and "kept_ratio" in frame_summary.columns and len(frame_summary) > 2:
        y = (frame_summary["kept_ratio"].astype(float) * 100.0).to_numpy()
        x = np.arange(len(y))
        ax.plot(x, y, color="#7eb6ff", lw=2.2, marker="o", ms=3, alpha=0.95)
        ax.fill_between(x, y, alpha=0.15, color="#7eb6ff")
        ax.set_xlabel("프레임 순번")
    else:
        x = np.linspace(0, 179, 180)
        base = 88 + 6 * np.sin(x / 22) + rng.normal(0, 1.8, size=len(x))
        y = np.clip(base, 55, 99)
        ax.plot(x, y, color="#7eb6ff", lw=2.2, alpha=0.95)
        ax.fill_between(x, y, alpha=0.15, color="#7eb6ff")
        ax.set_xlabel("프레임 (예시 시퀀스)")

    ax.set_ylabel("전처리 유지율 (%)")
    ax.set_title("② Preprocess — 프레임별 유지율")
    ax.set_ylim(40, 102)
    fig.suptitle("Frame별 전처리 유지율", fontsize=12, color="#e8f0ff", y=1.05)
    _style_dark(fig)
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def fig03_cluster(out: Path, rng: np.random.Generator) -> None:
    """밀도기반 클러스터 후보: 슬라이드의 HDBSCAN 대신 DBSCAN/HDBSCAN 병행 표기."""
    fig, ax = plt.subplots(figsize=(7.2, 6.2), constrained_layout=True)
    _starfield(ax, rng)

    centers = [(6, -3), (14, 2), (22, -6), (28, 5)]
    pts = []
    labels = []
    for k, (mx, my) in enumerate(centers):
        nk = 280 + rng.integers(-40, 80)
        pts.append(rng.normal(loc=(mx, my), scale=(1.1, 0.55), size=(nk, 2)))
        labels.append(np.full(nk, k))
    noise = rng.uniform([0, -10], [35, 10], size=(900, 2))
    P = np.vstack(pts + [noise])
    L = np.concatenate(labels + [-np.ones(len(noise), dtype=int)])
    cols = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3"]
    for k in range(len(centers)):
        m = L == k
        ax.scatter(P[m, 0], P[m, 1], s=6, color=cols[k % len(cols)], alpha=0.75, label=f"cluster {k}")
    ax.scatter(P[L < 0, 0], P[L < 0, 1], s=3, c="#556677", alpha=0.35, label="noise")
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.legend(loc="upper right", fontsize=8, framealpha=0.35)
    ax.set_title("③ 밀도기반 클러스터 후보\n(DBSCAN / HDBSCAN — 품질점수로 자동 선택)")
    fig.suptitle("HDBSCAN / DBSCAN Cluster Proposal", fontsize=12, color="#e8f0ff", y=1.02)
    _style_dark(fig)
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def fig04_suppression(out: Path, rng: np.random.Generator) -> None:
    fig, ax = plt.subplots(figsize=(8, 5), constrained_layout=True)
    ax.set_facecolor("#121a30")
    fig.patch.set_facecolor("#0b1020")
    _starfield(ax, rng)

    # 간단 퍼널 + 단계별 후보 수 (코드의 raw→S1→S2→S3 개념)
    stages = ["raw", "S1", "S2", "S3"]
    counts = np.array([8200, 4100, 2800, 1900], dtype=float)
    w = counts / counts.max()
    yc = np.arange(len(stages))[::-1]
    for i, (st, c, wi) in enumerate(zip(stages, counts, w)):
        left = 0.5 - wi / 2
        poly = Polygon(
            [
                (left, yc[i] - 0.38),
                (left + wi, yc[i] - 0.38),
                (left + wi * 0.88, yc[i] + 0.38),
                (left + wi * 0.12, yc[i] + 0.38),
            ],
            closed=True,
            facecolor="#3d6fb8",
            edgecolor="#8ab8ff",
            lw=1.2,
            alpha=0.85,
        )
        ax.add_patch(poly)
        ax.text(0.52, yc[i], f"{st}\n{int(c)} 후보", ha="center", va="center", color="white", fontsize=10)

    ax.set_xlim(0, 1)
    ax.set_ylim(-0.8, len(stages))
    ax.axis("off")
    ax.set_title("④ Candidate Suppression — 단계별 후보 감소", color="#e8f0ff", pad=12)
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def fig05_lidar(out: Path, rng: np.random.Generator) -> None:
    """BEV 스타일 밀도 + 보강 박스 (attach_lidar_corroboration_v3 개념)."""
    fig, ax = plt.subplots(figsize=(7.5, 6), constrained_layout=True)
    _starfield(ax, rng)
    gx = np.linspace(-25, 25, 180)
    gy = np.linspace(-18, 18, 140)
    Gx, Gy = np.meshgrid(gx, gy)
    Z = np.exp(-((Gx - 8) ** 2 + (Gy + 2) ** 2) / 18) + 0.35 * np.exp(-((Gx + 6) ** 2 + (Gy - 4) ** 2) / 40)
    Z += rng.normal(0, 0.04, size=Z.shape)
    im = ax.imshow(Z, extent=[gx.min(), gx.max(), gy.min(), gy.max()], origin="lower", cmap="magma", alpha=0.92)
    rect = FancyBboxPatch(
        (5.0, -4.2),
        6.5,
        4.4,
        boxstyle="round,pad=0.02,rounding_size=0.3",
        linewidth=2.2,
        edgecolor="#5dff9a",
        facecolor="none",
    )
    ax.add_patch(rect)
    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.set_title("⑤ LiDAR Corroboration — 거리/밀도 기반 보강 영역")
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.02, label="proxy density")
    fig.suptitle("LiDAR 증거와 레이더 후보 정합", fontsize=12, color="#e8f0ff", y=1.02)
    _style_dark(fig)
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def fig06_tracking(out: Path, rng: np.random.Generator) -> None:
    """run_tracking: 프레임 순서에 따른 (cx,cy) 궤적."""
    fig, ax = plt.subplots(figsize=(8, 5.5), constrained_layout=True)
    _starfield(ax, rng)
    t = np.arange(0, 55, dtype=float)
    tracks = []
    for i, (ox, oy) in enumerate([(3, -1), (12, 2), (20, -4)]):
        cx = ox + 0.35 * t + 0.02 * t**1.1 + rng.normal(0, 0.12, size=len(t))
        cy = oy + 0.08 * t * np.sin(t / 9 + i) + rng.normal(0, 0.1, size=len(t))
        tracks.append(np.column_stack([cx, cy]))
    lc = LineCollection(tracks, colors=["#66d9ff", "#ffb86c", "#bd93f9"], linewidths=2.2, alpha=0.95)
    ax.add_collection(lc)
    for i, tr in enumerate(tracks):
        ax.scatter(tr[-1, 0], tr[-1, 1], s=80, marker="*", color=["#66d9ff", "#ffb86c", "#bd93f9"][i], zorder=5, edgecolor="white")
        ax.text(tr[-1, 0] + 0.6, tr[-1, 1], f"track {i}", color="white", fontsize=9)
    ax.set_xlim(0, 40)
    ax.set_ylim(-8, 10)
    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.set_aspect("equal", adjustable="box")
    ax.set_title("⑥ Temporal Tracking — 연속 프레임 연관(트랙 ID)")
    fig.suptitle("TEMPORAL TRACKING (baseline / improved)", fontsize=12, color="#e8f0ff", y=1.02)
    _style_dark(fig)
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def fig00_overview(out: Path, rng: np.random.Generator) -> None:
    flow = (
        "Radar Raw → Preprocess → Density cluster (DBSCAN/HDBSCAN) → "
        "Suppression → LiDAR corroboration → Temporal tracking"
    )
    fig, ax = plt.subplots(figsize=(12, 2.2))
    fig.patch.set_facecolor("#0b1020")
    ax.set_facecolor("#121a30")
    _starfield(ax, rng, n=120)
    ax.text(0.5, 0.55, flow, ha="center", va="center", fontsize=11, color="#e8f0ff", wrap=True)
    ax.text(
        0.5,
        0.18,
        "코드 기준: run_branch 에서 억제 후보 → attach_lidar_corroboration_v3 → run_tracking",
        ha="center",
        va="center",
        fontsize=9,
        color="#9db0d0",
    )
    ax.axis("off")
    fig.savefig(out, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> None:
    _setup_font()
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "artifacts" / "fmcw_pipeline_step3_visuals",
        help="PNG 출력 폴더",
    )
    ap.add_argument(
        "--frame-summary-csv",
        type=Path,
        default=None,
        help="sec2_frame_index.csv 등 (kept_ratio 컬럼) 경로 — 있으면 ②번 그래프에 사용",
    )
    args = ap.parse_args()
    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(42)
    fs: pd.DataFrame | None = None
    if args.frame_summary_csv and args.frame_summary_csv.exists():
        fs = pd.read_csv(args.frame_summary_csv)
    else:
        cand = Path(__file__).resolve().parent.parent / "results" / "tables" / "sec2_frame_index.csv"
        if cand.exists():
            fs = pd.read_csv(cand)

    fig00_overview(out_dir / "step00_pipeline_flow_overview.png", rng)
    fig01_raw_radar(out_dir / "step01_raw_radar.png", rng)
    fig02_preprocess(out_dir / "step02_preprocess.png", rng, fs)
    fig03_cluster(out_dir / "step03_cluster_proposal.png", rng)
    fig04_suppression(out_dir / "step04_candidate_suppression.png", rng)
    fig05_lidar(out_dir / "step05_lidar_corroboration.png", rng)
    fig06_tracking(out_dir / "step06_temporal_tracking.png", rng)
    print("saved:", out_dir)


if __name__ == "__main__":
    main()
