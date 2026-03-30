"""
레이더 + 카메라만 사용해 VoD KITTI 레이아웃 데이터를 검증·시각화합니다.
기본 루트: vod-received/view_of_delft_PUBLIC

사용 예:
  python run_radar_camera_dataset.py
  python run_radar_camera_dataset.py --root "D:/data/view_of_delft_PUBLIC" --frame 00123
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

from matplotlib import font_manager, rcParams
import matplotlib.pyplot as plt
import numpy as np

ROOT_DEVKIT = Path(__file__).resolve().parent
if str(ROOT_DEVKIT) not in sys.path:
    sys.path.insert(0, str(ROOT_DEVKIT))

from vod.configuration import KittiLocations
from vod.frame import FrameDataLoader, FrameTransformMatrix
from vod.frame.transformations import project_pcl_to_image


def setup_korean_font() -> None:
    """Franklin Gothic 등 'gothic'만 포함한 서체는 제외하고 한글 가능 폰트를 고릅니다."""
    ttflist = font_manager.fontManager.ttflist

    def try_pick(pred) -> bool:
        for f in ttflist:
            if pred(f):
                rcParams["font.family"] = f.name
                return True
        return False

    if try_pick(lambda f: "malgun" in (f.fname or "").lower()):
        pass
    elif try_pick(lambda f: "malgun" in f.name.lower()):
        pass
    elif try_pick(lambda f: "nanum" in f.name.lower() or "nanum" in (f.fname or "").lower()):
        pass
    elif try_pick(lambda f: "noto sans cjk kr" in f.name.lower() or "notosanscjk" in (f.fname or "").lower()):
        pass
    elif try_pick(lambda f: "noto sans kr" in f.name.lower()):
        pass
    elif try_pick(lambda f: f.name.lower() in ("gulim", "gungsuh", "batang")):
        pass

    rcParams["axes.unicode_minus"] = False


def load_p2_from_calib(calib_path: str) -> np.ndarray:
    with open(calib_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    return np.array(lines[2].strip().split()[1:], dtype=np.float32).reshape(3, 4)


def main() -> int:
    default_root = ROOT_DEVKIT / "vod-received" / "view_of_delft_PUBLIC"
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=str, default=str(default_root), help="데이터셋 루트 (lidar/, radar/ 하위 포함)")
    p.add_argument("--frame", type=str, default="00000", help="프레임 ID (예: 00000, 01201)")
    p.add_argument("--out", type=str, default=str(ROOT_DEVKIT / "_radar_camera_run_output"), help="결과 PNG 저장 폴더")
    args = p.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"[오류] 데이터 루트가 없습니다: {root}")
        return 1

    setup_korean_font()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    kitti = KittiLocations(
        root_dir=str(root),
        output_dir=str(out_dir),
        frame_set_path="",
        pred_dir="",
    )
    frame = args.frame

    cam = Path(kitti.camera_dir) / f"{frame}.jpg"
    rad_f = Path(kitti.radar_dir) / f"{str(frame).zfill(5)}.bin"
    c_radar = Path(kitti.radar_calib_dir) / f"{frame}.txt"
    c_lidar = Path(kitti.lidar_calib_dir) / f"{frame}.txt"

    print("ROOT:", root)
    print("프레임:", frame)
    print("  image:", cam.is_file(), cam)
    print("  radar:", rad_f.is_file(), rad_f)
    print("  radar_calib:", c_radar.is_file())
    print("  lidar_calib:", c_lidar.is_file())

    if not cam.is_file() or not rad_f.is_file():
        print("[오류] 이미지 또는 레이더 .bin 이 없습니다.")
        return 1
    if not c_radar.is_file():
        print("[오류] radar calib 없음.")
        return 1

    loader = FrameDataLoader(kitti_locations=kitti, frame_number=frame)
    rad = loader.radar_data
    img = loader.image
    if rad is None or img is None:
        print("[오류] 데이터 로드 실패.")
        return 1

    xyz = rad[:, :3]
    rng = np.linalg.norm(xyz, axis=1)
    print("\n=== 레이더 통계 ===")
    print("포인트 수:", rad.shape[0])
    print("거리(m) min/median/max:", float(np.min(rng)), float(np.median(rng)), float(np.max(rng)))

    fig, ax = plt.subplots(2, 2, figsize=(10, 8))
    ax[0, 0].hist(rng, bins=40, color="steelblue", edgecolor="white")
    ax[0, 0].set_title("거리 ||(x,y,z)|| (m)")
    ax[0, 1].hist(rad[:, 3], bins=40, color="darkseagreen", edgecolor="white")
    ax[0, 1].set_title("RCS")
    ax[1, 0].hist(rad[:, 4], bins=40, color="coral", edgecolor="white")
    ax[1, 0].set_title("v_r (상대)")
    ax[1, 1].hist(rad[:, 5], bins=40, color="mediumpurple", edgecolor="white")
    ax[1, 1].set_title("v_r 보정")
    plt.tight_layout()
    hist_path = out_dir / f"hist_{frame}.png"
    fig.savefig(hist_path, dpi=120)
    plt.close(fig)
    print("저장:", hist_path)

    gray = img.mean(axis=2) if img.ndim == 3 else img
    fig, ax = plt.subplots(1, 2, figsize=(12, 4))
    ax[0].imshow(img)
    ax[0].set_title(f"프레임 {frame}")
    ax[0].axis("off")
    ax[1].hist(gray.ravel(), bins=64, color="gray", edgecolor="white")
    ax[1].set_title("그레이스케일 밝기")
    plt.tight_layout()
    cam_path = out_dir / f"camera_{frame}.png"
    fig.savefig(cam_path, dpi=120)
    plt.close(fig)
    print("저장:", cam_path)

    ft = FrameTransformMatrix(loader)
    T_cr = ft.t_camera_radar
    if c_lidar.is_file():
        P = ft.camera_projection_matrix
    else:
        P = load_p2_from_calib(str(c_radar))

    uvs, depth = project_pcl_to_image(
        point_cloud=rad,
        t_camera_pcl=T_cr,
        camera_projection_matrix=P,
        image_shape=img.shape,
    )

    fig, ax = plt.subplots(figsize=(14, 5))
    ax.imshow(img)
    if len(depth):
        dmax = float(np.percentile(depth, 98))
        sc = ax.scatter(
            uvs[:, 0],
            uvs[:, 1],
            c=depth,
            cmap="jet",
            s=8,
            alpha=0.85,
            vmin=float(depth.min()),
            vmax=max(dmax, 1e-3),
        )
        plt.colorbar(sc, ax=ax, fraction=0.025, label="깊이 z (m)")
    ax.set_title("레이더 → 카메라 투영")
    ax.axis("off")
    plt.tight_layout()
    proj_path = out_dir / f"project_{frame}.png"
    fig.savefig(proj_path, dpi=120)
    plt.close(fig)
    print("저장:", proj_path)
    print(f"투영 점: {len(uvs)} / {rad.shape[0]}")

    fig, ax = plt.subplots(figsize=(8, 5))
    sc2 = ax.scatter(rng, rad[:, 5], s=6, alpha=0.35, c=rad[:, 3], cmap="viridis")
    ax.set_xlabel("거리 (m)")
    ax.set_ylabel("v_r 보정")
    ax.set_title("거리 vs 보정 방사속도 (색=RCS)")
    plt.colorbar(sc2, ax=ax, label="RCS")
    plt.tight_layout()
    rv_path = out_dir / f"range_doppler_{frame}.png"
    fig.savefig(rv_path, dpi=120)
    plt.close(fig)
    print("저장:", rv_path)

    # 시퀀스: 공통 프레임 수만 요약 (전체 스캔은 시간이 걸릴 수 있어 상한)
    jpgs = {x.stem for x in Path(kitti.camera_dir).glob("*.jpg")}
    bins = {x.stem for x in Path(kitti.radar_dir).glob("*.bin")}
    common = sorted(jpgs & bins, key=lambda s: int(s))
    print(f"\n=== 매칭 프레임 수: {len(common)} (image_2 ∩ radar velodyne) ===")
    if len(common) >= 2:
        step = max(1, len(common) // 200)
        sampled = common[::step][:200]
        counts = []
        for fr in sampled:
            arr = np.fromfile(Path(kitti.radar_dir) / f"{fr.zfill(5)}.bin", dtype=np.float32)
            counts.append(arr.size // 7)
        fig, ax = plt.subplots(figsize=(min(24, max(8, len(sampled) * 0.12)), 4))
        ax.bar(range(len(sampled)), counts, color="steelblue")
        ax.set_xticks(range(len(sampled)))
        ax.set_xticklabels(sampled, rotation=45, ha="right", fontsize=6)
        ax.set_ylabel("레이더 포인트 수")
        ax.set_title(f"프레임별 점 수 (샘플 {len(sampled)}/{len(common)}, step={step})")
        plt.tight_layout()
        seq_path = out_dir / "sequence_point_counts_sample.png"
        fig.savefig(seq_path, dpi=120)
        plt.close(fig)
        print("저장:", seq_path)

    print("\n완료. 출력 폴더:", out_dir.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
