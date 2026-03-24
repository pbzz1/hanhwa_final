"""
모의 레이더 JSON을 읽어 2D 산점도로 시각화합니다.

- 입력: range_m, azimuth_deg (북 기준 시계방향) → 센서 수평면에서 동쪽 x, 북쪽 y (m)
- 색: 도플러(경속) — 접근(음) / 이탈(양) 구분에 유리

실행 (저장소 루트 또는 simulation 폴더에서):

  pip install matplotlib numpy
  python simulation/plot_radar_scatter_2d.py
  python simulation/plot_radar_scatter_2d.py --json simulation/data/mock_radar_detections.json --out simulation/output/radar_scatter_2d.png
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Tuple


def load_detections(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def polar_to_xy(range_m: float, azimuth_deg_from_north: float) -> Tuple[float, float]:
    """북=0°, 시계방향 증가 → 동쪽 x, 북쪽 y (m)."""
    rad = math.radians(float(azimuth_deg_from_north))
    x = range_m * math.sin(rad)
    y = range_m * math.cos(rad)
    return x, y


def build_arrays(
    detections: List[Dict[str, Any]],
) -> Tuple[Any, Any, Any, Any, List[str]]:
    import numpy as np

    xs: List[float] = []
    ys: List[float] = []
    dopplers: List[float] = []
    elevs: List[float] = []
    ids: List[str] = []
    for d in detections:
        r = float(d["range_m"])
        az = float(d["azimuth_deg"])
        x, y = polar_to_xy(r, az)
        xs.append(x)
        ys.append(y)
        dopplers.append(float(d["doppler_mps"]))
        elevs.append(float(d.get("elevation_deg", 0.0)))
        ids.append(str(d.get("id", "")))
    return np.array(xs), np.array(ys), np.array(dopplers), np.array(elevs), ids


def plot(
    payload: Dict[str, Any],
    out_path: Path | None,
    show: bool,
) -> None:
    import matplotlib.pyplot as plt
    import numpy as np

    radar = payload.get("radar", {})
    dets = payload["detections"]
    xs, ys, dopplers, elevs, ids = build_arrays(dets)

    meta = payload.get("meta", {})
    title = meta.get("plot_title", "FMCW mock detections — 2D scatter")

    fig, axes = plt.subplots(1, 2, figsize=(11, 5))

    # (1) 수평면 x–y (m), 색 = Doppler
    ax = axes[0]
    sc = ax.scatter(
        xs,
        ys,
        c=dopplers,
        cmap="coolwarm",
        s=80,
        alpha=0.9,
        edgecolors="#0f172a",
        linewidths=0.6,
    )
    for i, label in enumerate(ids):
        ax.annotate(
            label,
            (xs[i], ys[i]),
            textcoords="offset points",
            xytext=(4, 4),
            fontsize=8,
            color="#334155",
        )
    ax.axhline(0, color="#94a3b8", linewidth=0.8, linestyle="--")
    ax.axvline(0, color="#94a3b8", linewidth=0.8, linestyle="--")
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel("x east (m)")
    ax.set_ylabel("y north (m)")
    ax.set_title("Horizontal plane (range, azimuth → x, y)\ncolor = Doppler (m/s)")
    ax.grid(True, alpha=0.35)
    cb = fig.colorbar(sc, ax=ax, fraction=0.046, pad=0.04)
    cb.set_label("Doppler (m/s)")

    # (2) 거리–방위 (탐지 “원시” 축에 가까운 2D)
    ax2 = axes[1]
    azimuths = [float(d["azimuth_deg"]) for d in dets]
    ranges = [float(d["range_m"]) for d in dets]
    sc2 = ax2.scatter(
        azimuths,
        ranges,
        c=dopplers,
        cmap="coolwarm",
        s=80,
        alpha=0.9,
        edgecolors="#0f172a",
        linewidths=0.6,
    )
    for i, label in enumerate(ids):
        ax2.annotate(
            label,
            (azimuths[i], ranges[i]),
            textcoords="offset points",
            xytext=(4, 4),
            fontsize=8,
            color="#334155",
        )
    fov = float(radar.get("fov_deg", 0) or 0)
    bore = float(radar.get("boresight_azimuth_deg", 0) or 0)
    if fov > 0:
        ax2.axvspan(
            bore - fov / 2,
            bore + fov / 2,
            alpha=0.08,
            color="tab:blue",
            label=f"FoV ~ {fov:.0f} deg (approx.)",
        )
    ax2.set_xlabel("azimuth (deg)")
    ax2.set_ylabel("range (m)")
    ax2.set_title("Range vs azimuth (radar-like axes)")
    ax2.grid(True, alpha=0.35)
    if fov > 0:
        ax2.legend(loc="upper left", fontsize=8)
    fig.colorbar(sc2, ax=ax2, fraction=0.046, pad=0.04).set_label("Doppler (m/s)")

    fig.suptitle(title, fontsize=11, y=1.02)
    plt.tight_layout()

    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
        print(f"saved: {out_path.resolve()}")

    if show:
        plt.show()
    else:
        plt.close(fig)


def main() -> int:
    p = argparse.ArgumentParser(description="모의 레이더 JSON → 2D 산점도")
    p.add_argument(
        "--json",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "mock_radar_detections.json",
        help="모의 탐지 JSON 경로",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "output" / "radar_scatter_2d.png",
        help="출력 PNG 경로",
    )
    p.add_argument("--no-save", action="store_true", help="파일 저장 안 함")
    p.add_argument("--show", action="store_true", help="창으로 표시 (GUI 필요)")
    args = p.parse_args()

    payload = load_detections(args.json)
    out = None if args.no_save else args.out
    plot(payload, out_path=out, show=args.show)
    print(f"loaded {len(payload['detections'])} detections from {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
