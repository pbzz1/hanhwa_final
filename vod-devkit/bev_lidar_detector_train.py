"""
LiDAR BEV(조류시각) + PyTorch 소형 CNN — KITTI label_2 기반 학습·검출 평가.

규칙 기반(DBSCAN threshold 튜닝)과 달리, 여기서는 가중치를 데이터로부터 학습합니다.
평가: 클래스별 BEV 히트맵 피크 → velodyne (x,y) 와 GT 중심 greedy 매칭 (거리 임계값).
"""

from __future__ import annotations

import copy
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# ---------------------------------------------------------------------------
# KITTI / VoD I/O
# ---------------------------------------------------------------------------


def parse_lidar_bin(path: Path) -> np.ndarray:
    raw = np.fromfile(path, dtype=np.float32)
    if raw.size % 4 != 0:
        raise ValueError(f"LiDAR 형식 오류: {path}")
    return raw.reshape(-1, 4)


def parse_radar_bin(path: Path) -> np.ndarray:
    """VoD 레이더 N×7 (x,y,z, rcs, …, v_comp, …)."""
    raw = np.fromfile(path, dtype=np.float32)
    if raw.size % 7 != 0:
        raise ValueError(f"Radar 형식 오류(7배수 아님): {path}")
    return raw.reshape(-1, 7)


def choose_radar_dir(root: Path, mode: str = "3-scan") -> Path:
    mode_key = str(mode).strip().lower()
    aliases = {
        "single": "single",
        "1": "single",
        "single-scan": "single",
        "3": "3-scan",
        "3-scan": "3-scan",
        "3scan": "3-scan",
        "3-frame": "3-scan",
        "3frames": "3-scan",
        "5": "5-scan",
        "5-scan": "5-scan",
        "5scan": "5-scan",
        "5-frame": "5-scan",
        "5frames": "5-scan",
    }
    normalized = aliases.get(mode_key, "3-scan")
    candidates = {
        "single": [
            root / "radar" / "training" / "velodyne",
        ],
        "3-scan": [
            root / "radar_3frames" / "training" / "velodyne",
            root / "radar_3_scans" / "training" / "velodyne",
            root / "radar" / "training" / "velodyne_3",
            root / "radar" / "training" / "velodyne3",
            root / "radar" / "training" / "velodyne",
        ],
        "5-scan": [
            root / "radar_5frames" / "training" / "velodyne",
            root / "radar_5_scans" / "training" / "velodyne",
            root / "radar" / "training" / "velodyne_5",
            root / "radar" / "training" / "velodyne5",
            root / "radar" / "training" / "velodyne",
        ],
    }
    for p in candidates.get(normalized, []):
        if p.is_dir():
            return p
    return root / "radar" / "training" / "velodyne"


def parse_kitti_label(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.strip().split()
        if len(parts) < 15:
            continue
        cls = parts[0]
        h, w, l = map(float, parts[8:11])
        x, y, z = map(float, parts[11:14])
        ry = float(parts[14])
        rows.append({"class": cls, "dims_hwl": [h, w, l], "center": [x, y, z], "yaw": ry})
    return rows


def parse_calib_txt(path: Path) -> dict[str, np.ndarray] | None:
    if not path.is_file():
        return None
    out: dict[str, np.ndarray] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        vals = [float(x) for x in v.strip().split() if x]
        if vals:
            out[k.strip()] = np.array(vals, dtype=np.float64)
    return out if out else None


def kitti_cam_rect_to_velo_points(xyz_cam: np.ndarray, calib: dict[str, np.ndarray]) -> np.ndarray | None:
    r0 = calib.get("R0_rect")
    tr = calib.get("Tr_velo_to_cam")
    if tr is None:
        tr = calib.get("Tr_velo_cam")
    if r0 is None or tr is None:
        return None
    R0 = np.eye(4, dtype=np.float64)
    R0[:3, :3] = np.asarray(r0, dtype=np.float64).reshape(3, 3)
    T = np.eye(4, dtype=np.float64)
    T[:3, :] = np.asarray(tr, dtype=np.float64).reshape(3, 4)
    M = R0 @ T
    Minv = np.linalg.inv(M)
    N = int(xyz_cam.shape[0])
    hom = np.hstack([xyz_cam.astype(np.float64), np.ones((N, 1), dtype=np.float64)])
    return (Minv @ hom.T).T[:, :3]


# label_2 클래스 → 학습 채널 (3-class + 기타는 무시)
KITTI_CLASS_TO_IDX: dict[str, int] = {
    "Car": 0,
    "Van": 0,
    "Truck": 0,
    "Bus": 0,
    "Pedestrian": 1,
    "Person_sitting": 1,
    "Cyclist": 2,
}
SKIP_CLASSES = frozenset({"DontCare", "dontcare", "Misc"})


@dataclass
class BevGridConfig:
    """velodyne 기준 BEV 범위 (노트북 ROI와 유사)."""
    x_min: float = 0.0
    x_max: float = 70.0
    y_min: float = -30.0
    y_max: float = 30.0
    z_min: float = -2.0
    z_max: float = 3.0
    grid_h: int = 96
    grid_w: int = 96
    gaussian_sigma_cells: float = 2.0


RADAR_FEATURE_PRESETS: dict[str, tuple[str, ...]] = {
    "baseline_2ch": (
        "log_count",
        "max_abs_vr_comp",
    ),
    "rich_8ch": (
        "log_count",
        "max_abs_vr_comp",
        "mean_abs_vr_comp",
        "max_abs_vr",
        "max_rcs",
        "mean_rcs",
        "max_z",
        "mean_z",
    ),
    "temporal_12ch": (
        "log_count",
        "max_abs_vr_comp",
        "mean_abs_vr_comp",
        "max_abs_vr",
        "max_rcs",
        "mean_rcs",
        "max_z",
        "mean_z",
        "recent_ratio",
        "history_ratio",
        "mean_time",
        "time_span",
    ),
}


def resolve_radar_feature_channels(channels: str | Sequence[str] | None) -> tuple[str, ...]:
    if channels is None:
        return RADAR_FEATURE_PRESETS["baseline_2ch"]
    if isinstance(channels, str):
        preset = RADAR_FEATURE_PRESETS.get(channels)
        if preset is not None:
            return preset
        return (channels,)
    return tuple(str(ch).strip() for ch in channels if str(ch).strip())


def world_xy_to_grid(x: float, y: float, cfg: BevGridConfig) -> tuple[float, float]:
    u = (x - cfg.x_min) / (cfg.x_max - cfg.x_min) * (cfg.grid_w - 1)
    v = (cfg.y_max - y) / (cfg.y_max - cfg.y_min) * (cfg.grid_h - 1)
    return u, v


def build_bev_tensor(lidar: np.ndarray, cfg: BevGridConfig) -> np.ndarray:
    """[2, H, W] — 채0: log(1+점수), 채1: 셀 내 최대 z 정규화."""
    if lidar.size == 0:
        return np.zeros((2, cfg.grid_h, cfg.grid_w), dtype=np.float32)
    xyz = lidar[:, :3]
    m = (
        (xyz[:, 0] >= cfg.x_min)
        & (xyz[:, 0] <= cfg.x_max)
        & (xyz[:, 1] >= cfg.y_min)
        & (xyz[:, 1] <= cfg.y_max)
        & (xyz[:, 2] >= cfg.z_min)
        & (xyz[:, 2] <= cfg.z_max)
    )
    pts = xyz[m]
    if pts.size == 0:
        return np.zeros((2, cfg.grid_h, cfg.grid_w), dtype=np.float32)

    count = np.zeros((cfg.grid_h, cfg.grid_w), dtype=np.float32)
    zmax = np.full((cfg.grid_h, cfg.grid_w), -1e9, dtype=np.float32)
    xi = ((pts[:, 0] - cfg.x_min) / (cfg.x_max - cfg.x_min) * (cfg.grid_w - 1)).astype(np.int32)
    yi = ((cfg.y_max - pts[:, 1]) / (cfg.y_max - cfg.y_min) * (cfg.grid_h - 1)).astype(np.int32)
    xi = np.clip(xi, 0, cfg.grid_w - 1)
    yi = np.clip(yi, 0, cfg.grid_h - 1)
    for i in range(pts.shape[0]):
        r, c = int(yi[i]), int(xi[i])
        count[r, c] += 1.0
        zmax[r, c] = max(zmax[r, c], float(pts[i, 2]))
    ch0 = np.log1p(count)
    if np.isfinite(zmax).any():
        zm = zmax.copy()
        zm[zm < -1e8] = cfg.z_min
        ch1 = (zm - cfg.z_min) / max(cfg.z_max - cfg.z_min, 1e-6)
    else:
        ch1 = np.zeros_like(count)
    ch0 = ch0 / max(ch0.max(), 1e-6)
    stack = np.stack([ch0, ch1.astype(np.float32)], axis=0)
    return stack.astype(np.float32)


def build_bev_tensor_radar(radar: np.ndarray, cfg: BevGridConfig) -> np.ndarray:
    """
    LiDAR BEV와 동일 격자. 입력은 VoD 레이더만 (LiDAR 미사용).
    채0: log(1+셀 내 점 수), 채1: 셀 내 max |v_comp| 를 0~8m/s 로 정규화.
    """
    if radar.size == 0:
        return np.zeros((2, cfg.grid_h, cfg.grid_w), dtype=np.float32)
    xyz = radar[:, :3]
    v_comp = radar[:, 5]
    m = (
        (xyz[:, 0] >= cfg.x_min)
        & (xyz[:, 0] <= cfg.x_max)
        & (xyz[:, 1] >= cfg.y_min)
        & (xyz[:, 1] <= cfg.y_max)
        & (xyz[:, 2] >= cfg.z_min)
        & (xyz[:, 2] <= cfg.z_max)
    )
    pts = xyz[m]
    vv = np.abs(v_comp[m])
    if pts.size == 0:
        return np.zeros((2, cfg.grid_h, cfg.grid_w), dtype=np.float32)

    count = np.zeros((cfg.grid_h, cfg.grid_w), dtype=np.float32)
    vmax = np.zeros((cfg.grid_h, cfg.grid_w), dtype=np.float32)
    xi = ((pts[:, 0] - cfg.x_min) / (cfg.x_max - cfg.x_min) * (cfg.grid_w - 1)).astype(np.int32)
    yi = ((cfg.y_max - pts[:, 1]) / (cfg.y_max - cfg.y_min) * (cfg.grid_h - 1)).astype(np.int32)
    xi = np.clip(xi, 0, cfg.grid_w - 1)
    yi = np.clip(yi, 0, cfg.grid_h - 1)
    for i in range(pts.shape[0]):
        r, c = int(yi[i]), int(xi[i])
        count[r, c] += 1.0
        vmax[r, c] = max(vmax[r, c], float(vv[i]))
    ch0 = np.log1p(count)
    ch0 = ch0 / max(ch0.max(), 1e-6)
    ch1 = np.clip(vmax / 8.0, 0.0, 1.0).astype(np.float32)
    return np.stack([ch0, ch1], axis=0).astype(np.float32)


def build_bev_tensor_radar_features(
    radar: np.ndarray,
    cfg: BevGridConfig,
    channels: str | Sequence[str] | None = "temporal_12ch",
    *,
    rcs_scale: float = 20.0,
    speed_scale: float = 10.0,
    time_span_frames: float = 4.0,
) -> np.ndarray:
    feature_names = resolve_radar_feature_channels(channels)
    if len(feature_names) == 0:
        raise ValueError("At least one radar feature channel is required")
    if radar.size == 0:
        return np.zeros((len(feature_names), cfg.grid_h, cfg.grid_w), dtype=np.float32)

    xyz = radar[:, :3]
    rcs = radar[:, 3]
    vr = radar[:, 4]
    vr_comp = radar[:, 5]
    time_idx = radar[:, 6]
    m = (
        (xyz[:, 0] >= cfg.x_min)
        & (xyz[:, 0] <= cfg.x_max)
        & (xyz[:, 1] >= cfg.y_min)
        & (xyz[:, 1] <= cfg.y_max)
        & (xyz[:, 2] >= cfg.z_min)
        & (xyz[:, 2] <= cfg.z_max)
    )
    pts = xyz[m]
    if pts.size == 0:
        return np.zeros((len(feature_names), cfg.grid_h, cfg.grid_w), dtype=np.float32)
    rcs = rcs[m]
    vr = vr[m]
    vr_comp = vr_comp[m]
    time_idx = time_idx[m]

    xi = ((pts[:, 0] - cfg.x_min) / (cfg.x_max - cfg.x_min) * (cfg.grid_w - 1)).astype(np.int32)
    yi = ((cfg.y_max - pts[:, 1]) / (cfg.y_max - cfg.y_min) * (cfg.grid_h - 1)).astype(np.int32)
    xi = np.clip(xi, 0, cfg.grid_w - 1)
    yi = np.clip(yi, 0, cfg.grid_h - 1)

    shape = (cfg.grid_h, cfg.grid_w)
    count = np.zeros(shape, dtype=np.float32)
    recent_count = np.zeros(shape, dtype=np.float32)
    history_count = np.zeros(shape, dtype=np.float32)
    rcs_sum = np.zeros(shape, dtype=np.float32)
    rcs_max = np.full(shape, -1e9, dtype=np.float32)
    vr_abs_max = np.zeros(shape, dtype=np.float32)
    vr_comp_abs_sum = np.zeros(shape, dtype=np.float32)
    vr_comp_abs_max = np.zeros(shape, dtype=np.float32)
    z_sum = np.zeros(shape, dtype=np.float32)
    z_max = np.full(shape, cfg.z_min, dtype=np.float32)
    time_sum = np.zeros(shape, dtype=np.float32)
    time_min = np.full(shape, 1e9, dtype=np.float32)
    time_max = np.full(shape, -1e9, dtype=np.float32)

    for i in range(pts.shape[0]):
        r, c = int(yi[i]), int(xi[i])
        count[r, c] += 1.0
        if float(time_idx[i]) >= -0.5:
            recent_count[r, c] += 1.0
        else:
            history_count[r, c] += 1.0
        rcs_sum[r, c] += float(rcs[i])
        rcs_max[r, c] = max(rcs_max[r, c], float(rcs[i]))
        vr_abs_max[r, c] = max(vr_abs_max[r, c], abs(float(vr[i])))
        vr_comp_abs_sum[r, c] += abs(float(vr_comp[i]))
        vr_comp_abs_max[r, c] = max(vr_comp_abs_max[r, c], abs(float(vr_comp[i])))
        z_sum[r, c] += float(pts[i, 2])
        z_max[r, c] = max(z_max[r, c], float(pts[i, 2]))
        time_sum[r, c] += float(time_idx[i])
        time_min[r, c] = min(time_min[r, c], float(time_idx[i]))
        time_max[r, c] = max(time_max[r, c], float(time_idx[i]))

    safe_count = np.maximum(count, 1.0)
    log_count = np.log1p(count)
    if log_count.max() > 0:
        log_count = log_count / log_count.max()

    def norm_rcs(v: np.ndarray) -> np.ndarray:
        return (0.5 * (np.tanh(v / max(rcs_scale, 1e-6)) + 1.0)).astype(np.float32)

    def norm_speed(v: np.ndarray) -> np.ndarray:
        return np.clip(v / max(speed_scale, 1e-6), 0.0, 1.0).astype(np.float32)

    def norm_z(v: np.ndarray) -> np.ndarray:
        return np.clip((v - cfg.z_min) / max(cfg.z_max - cfg.z_min, 1e-6), 0.0, 1.0).astype(np.float32)

    mean_rcs = rcs_sum / safe_count
    mean_abs_vr_comp = vr_comp_abs_sum / safe_count
    mean_z = z_sum / safe_count
    mean_time = time_sum / safe_count
    mean_time = np.clip((mean_time + time_span_frames) / max(time_span_frames, 1e-6), 0.0, 1.0)
    time_extent = np.clip(
        (time_max - time_min) / max(time_span_frames, 1e-6),
        0.0,
        1.0,
    )
    recent_ratio = recent_count / safe_count
    history_ratio = history_count / safe_count

    feature_bank: dict[str, np.ndarray] = {
        "log_count": log_count.astype(np.float32),
        "max_abs_vr_comp": norm_speed(vr_comp_abs_max),
        "mean_abs_vr_comp": norm_speed(mean_abs_vr_comp),
        "max_abs_vr": norm_speed(vr_abs_max),
        "max_rcs": norm_rcs(rcs_max),
        "mean_rcs": norm_rcs(mean_rcs),
        "max_z": norm_z(z_max),
        "mean_z": norm_z(mean_z),
        "recent_ratio": recent_ratio.astype(np.float32),
        "history_ratio": history_ratio.astype(np.float32),
        "mean_time": mean_time.astype(np.float32),
        "time_span": time_extent.astype(np.float32),
    }
    missing = [name for name in feature_names if name not in feature_bank]
    if missing:
        raise KeyError(f"Unknown radar feature channels: {missing}")
    return np.stack([feature_bank[name] for name in feature_names], axis=0).astype(np.float32)


def gaussian_2d(h: int, w: int, cx: float, cy: float, sigma: float) -> np.ndarray:
    yy, xx = np.ogrid[:h, :w]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    g = np.exp(-d2 / (2 * sigma * sigma))
    return g.astype(np.float32)


def build_target_heatmaps(
    label_path: Path | None,
    calib: dict[str, np.ndarray] | None,
    cfg: BevGridConfig,
    num_classes: int = 3,
) -> np.ndarray:
    """[num_classes, H, W] 0~1 히트맵."""
    t = np.zeros((num_classes, cfg.grid_h, cfg.grid_w), dtype=np.float32)
    if label_path is None or calib is None:
        return t
    rows = parse_kitti_label(label_path)
    centers_cam: list[tuple[int, np.ndarray]] = []
    for r in rows:
        cname = r["class"]
        if cname in SKIP_CLASSES:
            continue
        ci = KITTI_CLASS_TO_IDX.get(cname)
        if ci is None or ci >= num_classes:
            continue
        centers_cam.append((ci, np.array(r["center"], dtype=np.float64).reshape(1, 3)))
    if not centers_cam:
        return t
    for ci, cc in centers_cam:
        velo = kitti_cam_rect_to_velo_points(cc, calib)
        if velo is None:
            continue
        x, y = float(velo[0, 0]), float(velo[0, 1])
        if not (cfg.x_min <= x <= cfg.x_max and cfg.y_min <= y <= cfg.y_max):
            continue
        u, v = world_xy_to_grid(x, y, cfg)
        g = gaussian_2d(cfg.grid_h, cfg.grid_w, u, v, cfg.gaussian_sigma_cells)
        t[ci] = np.maximum(t[ci], g)
    return np.clip(t, 0.0, 1.0)


def extract_gt_centers_xy_by_class(
    label_path: Path | None,
    calib: dict[str, np.ndarray] | None,
    cfg: BevGridConfig,
    num_classes: int = 3,
) -> list[list[tuple[float, float]]]:
    """클래스별 GT (x,y) velodyne."""
    out: list[list[tuple[float, float]]] = [[] for _ in range(num_classes)]
    if label_path is None or calib is None or not label_path.is_file():
        return out
    for r in parse_kitti_label(label_path):
        cname = r["class"]
        if cname in SKIP_CLASSES:
            continue
        ci = KITTI_CLASS_TO_IDX.get(cname)
        if ci is None or ci >= num_classes:
            continue
        cc = np.array(r["center"], dtype=np.float64).reshape(1, 3)
        velo = kitti_cam_rect_to_velo_points(cc, calib)
        if velo is None:
            continue
        x, y = float(velo[0, 0]), float(velo[0, 1])
        if cfg.x_min <= x <= cfg.x_max and cfg.y_min <= y <= cfg.y_max:
            out[ci].append((x, y))
    return out


# ---------------------------------------------------------------------------
# Dataset & model
# ---------------------------------------------------------------------------


class BevLidarDataset(Dataset):
    def __init__(
        self,
        frames: list[dict[str, Any]],
        bev_cfg: BevGridConfig,
        num_classes: int = 3,
    ) -> None:
        self.frames = frames
        self.bev_cfg = bev_cfg
        self.num_classes = num_classes
        self._valid_idx: list[int] = []
        for i, fr in enumerate(frames):
            calib = parse_calib_txt(Path(fr["calib_path"])) if fr.get("calib_path") else None
            if calib is None:
                continue
            lp = fr.get("label_path")
            if lp is None or not Path(lp).is_file():
                continue
            self._valid_idx.append(i)

    def __len__(self) -> int:
        return len(self._valid_idx)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        i = self._valid_idx[idx]
        fr = self.frames[i]
        lidar = parse_lidar_bin(Path(fr["lidar_path"]))
        calib = parse_calib_txt(Path(fr["calib_path"]))
        assert calib is not None
        lp = Path(fr["label_path"])
        x = build_bev_tensor(lidar, self.bev_cfg)
        y = build_target_heatmaps(lp, calib, self.bev_cfg, self.num_classes)
        return {
            "x": torch.from_numpy(x),
            "y": torch.from_numpy(y),
            "frame_id": fr["frame_id"],
        }


class BevRadarDataset(Dataset):
    """동일 label_2 히트맵 타깃 — 입력 BEV는 레이더 점만으로 구성 (LiDAR 미사용)."""

    def __init__(
        self,
        frames: list[dict[str, Any]],
        bev_cfg: BevGridConfig,
        num_classes: int = 3,
        radar_input_builder: Callable[..., np.ndarray] | None = None,
        radar_feature_channels: str | Sequence[str] | None = None,
    ) -> None:
        self.frames = frames
        self.bev_cfg = bev_cfg
        self.num_classes = num_classes
        self.radar_input_builder = radar_input_builder or build_bev_tensor_radar
        self.radar_feature_channels = radar_feature_channels
        self._valid_idx: list[int] = []
        for i, fr in enumerate(frames):
            calib = parse_calib_txt(Path(fr["calib_path"])) if fr.get("calib_path") else None
            rp = fr.get("radar_path")
            lp = fr.get("label_path")
            if calib is None or rp is None or not Path(rp).is_file():
                continue
            if lp is None or not Path(lp).is_file():
                continue
            self._valid_idx.append(i)

    def __len__(self) -> int:
        return len(self._valid_idx)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        i = self._valid_idx[idx]
        fr = self.frames[i]
        radar = parse_radar_bin(Path(fr["radar_path"]))
        calib = parse_calib_txt(Path(fr["calib_path"]))
        assert calib is not None
        lp = Path(fr["label_path"])
        if self.radar_feature_channels is None:
            x = self.radar_input_builder(radar, self.bev_cfg)
        else:
            x = self.radar_input_builder(
                radar,
                self.bev_cfg,
                channels=self.radar_feature_channels,
            )
        y = build_target_heatmaps(lp, calib, self.bev_cfg, self.num_classes)
        return {
            "x": torch.from_numpy(x),
            "y": torch.from_numpy(y),
            "frame_id": fr["frame_id"],
        }


class TinyBevDetector(nn.Module):
    """BEV CNN — base 키우면 용량·표현력 증가."""

    def __init__(self, in_ch: int = 2, num_classes: int = 3, base: int = 48) -> None:
        super().__init__()
        b2 = base * 2
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, base, 3, padding=1),
            nn.BatchNorm2d(base),
            nn.ReLU(inplace=True),
            nn.Conv2d(base, b2, 3, padding=1),
            nn.BatchNorm2d(b2),
            nn.ReLU(inplace=True),
            nn.Conv2d(b2, b2, 3, padding=1),
            nn.BatchNorm2d(b2),
            nn.ReLU(inplace=True),
            nn.Conv2d(b2, b2, 3, padding=1),
            nn.BatchNorm2d(b2),
            nn.ReLU(inplace=True),
            nn.Conv2d(b2, num_classes, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class ResidualBlock(nn.Module):
    def __init__(self, ch: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(ch, ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(ch, ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(ch),
        )
        self.act = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.act(x + self.block(x))


class ResidualBevDetector(nn.Module):
    def __init__(self, in_ch: int = 2, num_classes: int = 3, base: int = 48, depth: int = 5) -> None:
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(in_ch, base, 3, padding=1, bias=False),
            nn.BatchNorm2d(base),
            nn.ReLU(inplace=True),
        )
        self.blocks = nn.Sequential(*[ResidualBlock(base) for _ in range(max(depth, 1))])
        self.head = nn.Sequential(
            nn.Conv2d(base, base, 3, padding=1, bias=False),
            nn.BatchNorm2d(base),
            nn.ReLU(inplace=True),
            nn.Conv2d(base, num_classes, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.blocks(x)
        return self.head(x)


class DoubleConv(nn.Module):
    def __init__(self, in_ch: int, out_ch: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class UNetBevDetector(nn.Module):
    def __init__(self, in_ch: int = 2, num_classes: int = 3, base: int = 32) -> None:
        super().__init__()
        self.enc1 = DoubleConv(in_ch, base)
        self.down1 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(base, base * 2))
        self.down2 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(base * 2, base * 4))
        self.bottleneck = nn.Sequential(nn.MaxPool2d(2), DoubleConv(base * 4, base * 8))
        self.up2 = DoubleConv(base * 8 + base * 4, base * 4)
        self.up1 = DoubleConv(base * 4 + base * 2, base * 2)
        self.up0 = DoubleConv(base * 2 + base, base)
        self.head = nn.Conv2d(base, num_classes, 1)

    def _upsample_cat(self, x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        return torch.cat([x, skip], dim=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.down1(e1)
        e3 = self.down2(e2)
        b = self.bottleneck(e3)
        d2 = self.up2(self._upsample_cat(b, e3))
        d1 = self.up1(self._upsample_cat(d2, e2))
        d0 = self.up0(self._upsample_cat(d1, e1))
        return self.head(d0)


def create_bev_model(
    model_name: str,
    in_ch: int,
    num_classes: int = 3,
    base: int = 48,
) -> nn.Module:
    key = str(model_name).strip().lower()
    if key in {"tiny", "baseline", "plain"}:
        return TinyBevDetector(in_ch=in_ch, num_classes=num_classes, base=base)
    if key in {"res", "residual", "resnet"}:
        return ResidualBevDetector(in_ch=in_ch, num_classes=num_classes, base=base)
    if key in {"unet", "u-net"}:
        return UNetBevDetector(in_ch=in_ch, num_classes=num_classes, base=max(base, 16))
    raise KeyError(f"Unknown model_name: {model_name}")


# ---------------------------------------------------------------------------
# Train / eval
# ---------------------------------------------------------------------------


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    opt: torch.optim.Optimizer,
    device: torch.device,
    pos_weight: torch.Tensor | None = None,
    grad_clip_norm: float | None = 1.0,
) -> float:
    model.train()
    bce = nn.BCEWithLogitsLoss(pos_weight=pos_weight, reduction="mean")
    total = 0.0
    n = 0
    for batch in loader:
        x = batch["x"].to(device)
        y = batch["y"].to(device)
        opt.zero_grad(set_to_none=True)
        logits = model(x)
        loss = bce(logits, y)
        loss.backward()
        if grad_clip_norm is not None and grad_clip_norm > 0:
            nn.utils.clip_grad_norm_(model.parameters(), grad_clip_norm)
        opt.step()
        total += float(loss.item()) * x.size(0)
        n += x.size(0)
    return total / max(n, 1)


@torch.no_grad()
def eval_bce_epoch(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    pos_weight: torch.Tensor | None = None,
) -> float:
    if len(loader) == 0:
        return float("nan")
    model.eval()
    bce = nn.BCEWithLogitsLoss(pos_weight=pos_weight, reduction="mean")
    total = 0.0
    n = 0
    for batch in loader:
        x = batch["x"].to(device)
        y = batch["y"].to(device)
        logits = model(x)
        loss = bce(logits, y)
        total += float(loss.item()) * x.size(0)
        n += x.size(0)
    return total / max(n, 1)


def fit_bev_model(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader | None,
    *,
    device: torch.device,
    epochs: int,
    lr: float,
    weight_decay: float = 0.02,
    pos_weight: torch.Tensor | None = None,
    grad_clip_norm: float | None = 1.0,
) -> tuple[nn.Module, list[dict[str, float]], float]:
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(epochs, 1))
    history: list[dict[str, float]] = []
    best_val = float("inf")
    best_state = copy.deepcopy(model.state_dict())
    for ep in range(epochs):
        tr = train_one_epoch(
            model,
            train_loader,
            opt,
            device,
            pos_weight=pos_weight,
            grad_clip_norm=grad_clip_norm,
        )
        va = (
            eval_bce_epoch(model, val_loader, device, pos_weight=pos_weight)
            if val_loader is not None
            else float("nan")
        )
        sched.step()
        history.append(
            {
                "epoch": float(ep + 1),
                "train_bce_loss": round(float(tr), 6),
                "val_bce_loss": round(float(va), 6),
            }
        )
        if not math.isnan(va) and va <= best_val:
            best_val = float(va)
            best_state = copy.deepcopy(model.state_dict())
    model.load_state_dict(best_state)
    return model, history, float(best_val)


@torch.no_grad()
def heatmap_peaks_xy(
    heat: torch.Tensor,
    cfg: BevGridConfig,
    thresh: float = 0.35,
    min_dist_cells: int = 3,
) -> list[tuple[float, float]]:
    """[H,W] 확률맵에서 국소 최대값 → velodyne x,y."""
    h = heat.squeeze().cpu().numpy()
    H, W = h.shape
    peaks: list[tuple[float, float]] = []
    hm = torch.from_numpy(h).unsqueeze(0).unsqueeze(0)
    pooled = F.max_pool2d(hm, kernel_size=min_dist_cells * 2 + 1, stride=1, padding=min_dist_cells)
    peaks_mask = (hm == pooled) & (hm >= thresh)
    yy, xx = np.where(peaks_mask.squeeze().numpy())
    for r, c in zip(yy.tolist(), xx.tolist()):
        u, v = float(c), float(r)
        x = cfg.x_min + (u / max(W - 1, 1)) * (cfg.x_max - cfg.x_min)
        y = cfg.y_max - (v / max(H - 1, 1)) * (cfg.y_max - cfg.y_min)
        peaks.append((x, y))
    return peaks


def dedupe_centers(points: Sequence[tuple[float, float]], thr_m: float = 1.25) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for x, y in points:
        if all(math.hypot(x - ox, y - oy) > thr_m for ox, oy in out):
            out.append((x, y))
    return out


def greedy_match_centers(
    pred: list[tuple[float, float]],
    gt: list[tuple[float, float]],
    thr_m: float,
) -> tuple[int, int, int]:
    """TP / FP / FN (1:1 거리 매칭)."""
    used_p: set[int] = set()
    used_g: set[int] = set()
    tp = 0
    pairs: list[tuple[int, int, float]] = []
    for pi, (px, py) in enumerate(pred):
        for gi, (gx, gy) in enumerate(gt):
            d = math.hypot(px - gx, py - gy)
            if d <= thr_m:
                pairs.append((pi, gi, d))
    pairs.sort(key=lambda t: t[2])
    for pi, gi, _ in pairs:
        if pi in used_p or gi in used_g:
            continue
        used_p.add(pi)
        used_g.add(gi)
        tp += 1
    fp = len(pred) - tp
    fn = len(gt) - tp
    return tp, fp, fn


@torch.no_grad()
def evaluate_detection_on_loader(
    model: nn.Module,
    loader: DataLoader,
    frames_by_id: dict[str, dict[str, Any]],
    bev_cfg: BevGridConfig,
    device: torch.device,
    num_classes: int = 3,
    match_thr_m: float = 2.5,
    heat_thresh: float = 0.35,
) -> dict[str, Any]:
    model.eval()
    class_names = ["Vehicle", "Pedestrian", "Cyclist"]
    per_cls = {i: {"tp": 0, "fp": 0, "fn": 0} for i in range(num_classes)}
    for batch in loader:
        x = batch["x"].to(device)
        logits = model(x)
        prob = torch.sigmoid(logits)
        bsz = x.size(0)
        for bi in range(bsz):
            fid = batch["frame_id"][bi]
            fr = frames_by_id[fid]
            calib = parse_calib_txt(Path(fr["calib_path"]))
            lp = Path(fr["label_path"]) if fr.get("label_path") else None
            gt_xy = extract_gt_centers_xy_by_class(lp, calib, bev_cfg, num_classes)
            for c in range(num_classes):
                peaks = heatmap_peaks_xy(prob[bi, c], bev_cfg, thresh=heat_thresh)
                tp, fp, fn = greedy_match_centers(peaks, gt_xy[c], match_thr_m)
                per_cls[c]["tp"] += tp
                per_cls[c]["fp"] += fp
                per_cls[c]["fn"] += fn

    micro_tp = sum(per_cls[c]["tp"] for c in range(num_classes))
    micro_fp = sum(per_cls[c]["fp"] for c in range(num_classes))
    micro_fn = sum(per_cls[c]["fn"] for c in range(num_classes))
    p = micro_tp / max(micro_tp + micro_fp, 1)
    r = micro_tp / max(micro_tp + micro_fn, 1)
    f1 = 2 * p * r / max(p + r, 1e-9)
    by_name = {}
    for c in range(num_classes):
        t, f, n = per_cls[c]["tp"], per_cls[c]["fp"], per_cls[c]["fn"]
        pc = t / max(t + f, 1)
        rc = t / max(t + n, 1)
        f1c = 2 * pc * rc / max(pc + rc, 1e-9)
        by_name[class_names[c]] = {
            "tp": t,
            "fp": f,
            "fn": n,
            "precision": round(float(pc), 4),
            "recall": round(float(rc), 4),
            "f1": round(float(f1c), 4),
        }
    return {
        "micro_precision": round(float(p), 4),
        "micro_recall": round(float(r), 4),
        "micro_f1": round(float(f1), 4),
        "per_class": by_name,
        "note": "히트맵 피크→(x,y) vs label_2 GT 중심(velo), greedy 매칭. mAP 아님.",
    }


def lidar_cluster_centers_xy(
    lidar_xyz: np.ndarray,
    cfg: BevGridConfig,
    *,
    eps: float = 0.9,
    min_samples: int = 10,
    min_points_per_cluster: int = 16,
    min_extent_m: float = 0.35,
    max_extent_m: float = 12.0,
) -> list[tuple[float, float]]:
    if lidar_xyz.size == 0:
        return []
    m = (
        (lidar_xyz[:, 0] >= cfg.x_min)
        & (lidar_xyz[:, 0] <= cfg.x_max)
        & (lidar_xyz[:, 1] >= cfg.y_min)
        & (lidar_xyz[:, 1] <= cfg.y_max)
        & (lidar_xyz[:, 2] >= cfg.z_min)
        & (lidar_xyz[:, 2] <= cfg.z_max)
    )
    pts = lidar_xyz[m]
    if pts.shape[0] < min_samples:
        return []
    from sklearn.cluster import DBSCAN

    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(pts[:, :2])
    out: list[tuple[float, float]] = []
    for lab in sorted(set(labels.tolist())):
        if lab < 0:
            continue
        blk = pts[labels == lab]
        if blk.shape[0] < min_points_per_cluster:
            continue
        extent_x = float(blk[:, 0].max() - blk[:, 0].min())
        extent_y = float(blk[:, 1].max() - blk[:, 1].min())
        if max(extent_x, extent_y) < min_extent_m:
            continue
        if max(extent_x, extent_y) > max_extent_m:
            continue
        ctr = blk[:, :2].mean(axis=0)
        out.append((float(ctr[0]), float(ctr[1])))
    return out


def lidar_points_in_roi(
    lidar_xyz: np.ndarray,
    center_xy: tuple[float, float],
    radius_m: float = 1.8,
) -> int:
    if lidar_xyz.size == 0:
        return 0
    ctr = np.array([center_xy[0], center_xy[1]], dtype=np.float32)
    d = np.linalg.norm(lidar_xyz[:, :2] - ctr[None, :], axis=1)
    return int(np.count_nonzero(d <= radius_m))


@torch.no_grad()
def predict_radar_peaks(
    model: nn.Module,
    radar: np.ndarray,
    bev_cfg: BevGridConfig,
    device: torch.device,
    *,
    feature_channels: str | Sequence[str] | None = "baseline_2ch",
    heat_thresh: float = 0.3,
    min_dist_cells: int = 3,
) -> dict[str, Any]:
    x_np = build_bev_tensor_radar_features(radar, bev_cfg, channels=feature_channels)
    x = torch.from_numpy(x_np).unsqueeze(0).to(device)
    logits = model(x)
    prob = torch.sigmoid(logits).squeeze(0).cpu()
    peaks_by_class: list[list[tuple[float, float]]] = []
    for c in range(prob.shape[0]):
        peaks_by_class.append(
            heatmap_peaks_xy(
                prob[c],
                bev_cfg,
                thresh=heat_thresh,
                min_dist_cells=min_dist_cells,
            )
        )
    merged = dedupe_centers([pt for pts in peaks_by_class for pt in pts], thr_m=1.25)
    return {
        "x": x_np,
        "prob": prob.numpy(),
        "peaks_by_class": peaks_by_class,
        "merged_peaks": merged,
    }


@torch.no_grad()
def evaluate_lidar_consistency_on_loader(
    model: nn.Module,
    loader: DataLoader,
    frames_by_id: dict[str, dict[str, Any]],
    bev_cfg: BevGridConfig,
    device: torch.device,
    *,
    feature_channels: str | Sequence[str] | None = "baseline_2ch",
    heat_thresh: float = 0.3,
    match_thr_m: float = 2.5,
    support_radius_m: float = 1.8,
    support_min_points: int = 12,
) -> dict[str, Any]:
    model.eval()
    tp = 0
    fp = 0
    fn = 0
    supported = 0
    total_pred = 0
    total_support_points = 0
    total_clusters = 0
    frames_seen = 0

    for batch in loader:
        x = batch["x"].to(device)
        logits = model(x)
        prob = torch.sigmoid(logits)
        bsz = x.size(0)
        for bi in range(bsz):
            fid = batch["frame_id"][bi]
            fr = frames_by_id[fid]
            lidar = parse_lidar_bin(Path(fr["lidar_path"]))[:, :3]
            pred_points: list[tuple[float, float]] = []
            for c in range(prob.shape[1]):
                pred_points.extend(
                    heatmap_peaks_xy(prob[bi, c], bev_cfg, thresh=heat_thresh)
                )
            pred_points = dedupe_centers(pred_points, thr_m=1.25)
            lidar_centers = lidar_cluster_centers_xy(lidar, bev_cfg)
            c_tp, c_fp, c_fn = greedy_match_centers(pred_points, lidar_centers, match_thr_m)
            tp += c_tp
            fp += c_fp
            fn += c_fn
            total_clusters += len(lidar_centers)
            total_pred += len(pred_points)
            for pt in pred_points:
                pts_in_roi = lidar_points_in_roi(lidar, pt, radius_m=support_radius_m)
                total_support_points += pts_in_roi
                if pts_in_roi >= support_min_points:
                    supported += 1
            frames_seen += 1

    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)
    support_ratio = supported / max(total_pred, 1)
    avg_points = total_support_points / max(total_pred, 1)
    return {
        "cluster_precision": round(float(precision), 4),
        "cluster_recall": round(float(recall), 4),
        "cluster_f1": round(float(f1), 4),
        "support_ratio": round(float(support_ratio), 4),
        "avg_lidar_points_per_prediction": round(float(avg_points), 2),
        "frames": frames_seen,
        "predictions": total_pred,
        "lidar_clusters": total_clusters,
        "note": "Radar-only predictions validated against LiDAR cluster centers and local LiDAR support.",
        "feature_channels": list(resolve_radar_feature_channels(feature_channels)),
    }


@dataclass(frozen=True)
class RadarExperimentSpec:
    name: str
    radar_mode: str
    feature_channels: str | Sequence[str]
    model_name: str
    base: int = 48
    heat_thresh: float = 0.3
    lr_scale: float = 1.0


def default_radar_experiment_specs() -> list[RadarExperimentSpec]:
    return [
        RadarExperimentSpec(
            name="radar_baseline_3scan_tiny",
            radar_mode="3-scan",
            feature_channels="baseline_2ch",
            model_name="tiny",
            base=48,
            heat_thresh=0.3,
        ),
        RadarExperimentSpec(
            name="radar_rich_5scan_resnet",
            radar_mode="5-scan",
            feature_channels="rich_8ch",
            model_name="resnet",
            base=48,
            heat_thresh=0.28,
        ),
        RadarExperimentSpec(
            name="radar_temporal_5scan_unet",
            radar_mode="5-scan",
            feature_channels="temporal_12ch",
            model_name="unet",
            base=32,
            heat_thresh=0.26,
        ),
    ]


def score_radar_experiment(
    detection_metrics: dict[str, Any],
    lidar_metrics: dict[str, Any],
) -> float:
    det_f1 = float(detection_metrics.get("micro_f1", 0.0))
    lidar_f1 = float(lidar_metrics.get("cluster_f1", 0.0))
    support = float(lidar_metrics.get("support_ratio", 0.0))
    return round(0.5 * det_f1 + 0.3 * lidar_f1 + 0.2 * support, 4)


def run_train_and_eval(
    dataset_root: Path,
    train_indices: np.ndarray,
    val_indices: np.ndarray,
    frames_all: list[dict[str, Any]],
    *,
    bev_cfg: BevGridConfig | None = None,
    epochs: int = 5,
    batch_size: int = 4,
    lr: float = 1e-3,
    max_train: int = 400,
    max_val: int = 120,
    num_workers: int = 0,
    seed: int = 42,
) -> dict[str, Any]:
    torch.manual_seed(seed)
    np.random.seed(seed)
    bev_cfg = bev_cfg or BevGridConfig()
    num_classes = 3

    def take(inds: np.ndarray, cap: int) -> list[dict[str, Any]]:
        out = [frames_all[int(i)] for i in inds[:cap]]
        return out

    train_frames = take(train_indices, max_train)
    val_frames = take(val_indices, max_val)

    train_ds = BevLidarDataset(train_frames, bev_cfg, num_classes)
    val_ds = BevLidarDataset(val_frames, bev_cfg, num_classes)
    if len(train_ds) == 0:
        raise RuntimeError(
            "학습 가능한 프레임이 없습니다. calib + label_2가 있는 동기 프레임이 필요합니다."
        )
    if len(val_ds) == 0:
        raise RuntimeError(
            "검증용 프레임이 없습니다. val split에 calib+label_2가 있는 프레임이 있는지 확인하세요."
        )

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        drop_last=False,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = TinyBevDetector(in_ch=2, num_classes=num_classes, base=48).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.02)
    # 클래스 불균형 완화 (B,C,H,W 와 브로드캐스트)
    pos_weight = torch.full((num_classes, 1, 1), 80.0, device=device)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(epochs, 1))

    history: list[dict[str, float]] = []
    for ep in range(epochs):
        tr = train_one_epoch(
            model, train_loader, opt, device, pos_weight=pos_weight, grad_clip_norm=1.0
        )
        va = eval_bce_epoch(model, val_loader, device, pos_weight=pos_weight)
        sched.step()
        history.append(
            {
                "epoch": float(ep + 1),
                "train_bce_loss": round(tr, 6),
                "val_bce_loss": round(va, 6),
            }
        )

    frames_by_id = {str(f["frame_id"]): f for f in val_frames}
    metrics = evaluate_detection_on_loader(
        model,
        val_loader,
        frames_by_id,
        bev_cfg,
        device,
        num_classes=num_classes,
    )

    return {
        "device": str(device),
        "train_samples": len(train_ds),
        "val_samples": len(val_ds),
        "epochs": epochs,
        "history": history,
        "metrics": metrics,
        "bev": {
            "grid_h": bev_cfg.grid_h,
            "grid_w": bev_cfg.grid_w,
            "x_range": [bev_cfg.x_min, bev_cfg.x_max],
            "y_range": [bev_cfg.y_min, bev_cfg.y_max],
        },
    }


def save_run_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def list_vod_sync_frames(dataset_root: Path, radar_mode: str = "3-scan") -> list[dict[str, Any]]:
    """
    VoD / KITTI 스타일 PUBLIC 트리에서 lidar·image·(calib)·(label) stem이 맞는 프레임 목록.
    학습용으로 calib·label_2 경로를 포함한다.
    """
    root = dataset_root.resolve()
    lidar_dir = root / "lidar" / "training" / "velodyne"
    image_dir = root / "lidar" / "training" / "image_2"
    label_dir = root / "lidar" / "training" / "label_2"
    calib_candidates = [
        root / "lidar" / "training" / "calib",
        root / "lidar" / "training" / "calib_2",
        root / "calib",
    ]
    calib_dir = next((p for p in calib_candidates if p.is_dir()), None)
    if not lidar_dir.is_dir() or not image_dir.is_dir():
        return []

    lidar_stems = {p.stem for p in lidar_dir.glob("*.bin")}
    image_stems = {p.stem for p in image_dir.glob("*.jpg")}
    radar_dir = choose_radar_dir(root, radar_mode)
    common = sorted(
        lidar_stems & image_stems,
        key=lambda s: (0, int(s)) if s.isdigit() else (1, s),
    )

    frames: list[dict[str, Any]] = []
    for stem in common:
        rpath = radar_dir / f"{stem}.bin"
        frames.append(
            {
                "frame_id": stem,
                "lidar_path": lidar_dir / f"{stem}.bin",
                "radar_path": rpath if rpath.is_file() else None,
                "image_path": image_dir / f"{stem}.jpg",
                "label_path": (label_dir / f"{stem}.txt") if label_dir.is_dir() else None,
                "calib_path": (calib_dir / f"{stem}.txt") if calib_dir else None,
            }
        )
    return frames


def read_imageset_frame_ids(dataset_root: Path, split: str = "train") -> list[str]:
    aliases = {
        "valid": "val",
        "validation": "val",
    }
    split_name = aliases.get(str(split).strip().lower(), str(split).strip().lower())
    p = dataset_root.resolve() / "lidar" / "ImageSets" / f"{split_name}.txt"
    if not p.is_file():
        return []
    return [line.strip() for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def frames_from_ids(
    frames_all: Sequence[dict[str, Any]],
    frame_ids: Sequence[str],
) -> list[dict[str, Any]]:
    by_id = {str(fr["frame_id"]): fr for fr in frames_all}
    return [by_id[str(fid)] for fid in frame_ids if str(fid) in by_id]


def take_frames(frames: Sequence[dict[str, Any]], cap: int | None) -> list[dict[str, Any]]:
    if cap is None or cap <= 0:
        return list(frames)
    return list(frames[:cap])


def list_vod_frames_for_split(
    dataset_root: Path,
    split: str,
    *,
    radar_mode: str = "3-scan",
    cap: int | None = None,
) -> list[dict[str, Any]]:
    frames_all = list_vod_sync_frames(dataset_root, radar_mode=radar_mode)
    ids = read_imageset_frame_ids(dataset_root, split)
    if ids:
        return take_frames(frames_from_ids(frames_all, ids), cap)
    return take_frames(frames_all, cap)


def run_radar_only_benchmark(
    dataset_root: Path,
    *,
    bev_cfg: BevGridConfig | None = None,
    experiments: Sequence[RadarExperimentSpec] | None = None,
    train_split: str = "train",
    val_split: str = "val",
    max_train: int | None = 320,
    max_val: int | None = 120,
    epochs: int = 8,
    batch_size: int = 4,
    lr: float = 8e-4,
    weight_decay: float = 0.02,
    num_workers: int = 0,
    seed: int = 42,
) -> dict[str, Any]:
    torch.manual_seed(seed)
    np.random.seed(seed)
    bev_cfg = bev_cfg or BevGridConfig()
    specs = list(experiments or default_radar_experiment_specs())
    if len(specs) == 0:
        raise RuntimeError("No radar experiments configured")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pos_weight = torch.full((3, 1, 1), 80.0, device=device)
    frames_cache: dict[str, dict[str, list[dict[str, Any]]]] = {}
    results: list[dict[str, Any]] = []

    for spec in specs:
        cache_key = str(spec.radar_mode)
        split_cache = frames_cache.setdefault(cache_key, {})
        if train_split not in split_cache:
            split_cache[train_split] = list_vod_frames_for_split(
                dataset_root,
                train_split,
                radar_mode=spec.radar_mode,
                cap=max_train,
            )
        if val_split not in split_cache:
            split_cache[val_split] = list_vod_frames_for_split(
                dataset_root,
                val_split,
                radar_mode=spec.radar_mode,
                cap=max_val,
            )
        train_frames = split_cache[train_split]
        val_frames = split_cache[val_split]
        train_ds = BevRadarDataset(
            train_frames,
            bev_cfg,
            3,
            radar_input_builder=build_bev_tensor_radar_features,
            radar_feature_channels=spec.feature_channels,
        )
        val_ds = BevRadarDataset(
            val_frames,
            bev_cfg,
            3,
            radar_input_builder=build_bev_tensor_radar_features,
            radar_feature_channels=spec.feature_channels,
        )
        if len(train_ds) == 0:
            raise RuntimeError(f"{spec.name}: train dataset is empty")
        if len(val_ds) == 0:
            raise RuntimeError(f"{spec.name}: val dataset is empty")

        train_loader = DataLoader(
            train_ds,
            batch_size=batch_size,
            shuffle=True,
            num_workers=num_workers,
            drop_last=False,
        )
        val_loader = DataLoader(
            val_ds,
            batch_size=batch_size,
            shuffle=False,
            num_workers=num_workers,
        )
        feature_channels = resolve_radar_feature_channels(spec.feature_channels)
        model = create_bev_model(
            spec.model_name,
            in_ch=len(feature_channels),
            num_classes=3,
            base=spec.base,
        ).to(device)
        model, history, best_val = fit_bev_model(
            model,
            train_loader,
            val_loader,
            device=device,
            epochs=epochs,
            lr=lr * float(spec.lr_scale),
            weight_decay=weight_decay,
            pos_weight=pos_weight,
            grad_clip_norm=1.0,
        )
        frames_by_id = {str(f["frame_id"]): f for f in val_frames}
        detection_metrics = evaluate_detection_on_loader(
            model,
            val_loader,
            frames_by_id,
            bev_cfg,
            device,
            num_classes=3,
            match_thr_m=2.5,
            heat_thresh=spec.heat_thresh,
        )
        lidar_metrics = evaluate_lidar_consistency_on_loader(
            model,
            val_loader,
            frames_by_id,
            bev_cfg,
            device,
            feature_channels=spec.feature_channels,
            heat_thresh=spec.heat_thresh,
        )
        selection_score = score_radar_experiment(detection_metrics, lidar_metrics)
        results.append(
            {
                "name": spec.name,
                "radar_mode": spec.radar_mode,
                "feature_channels": list(feature_channels),
                "model_name": spec.model_name,
                "base": spec.base,
                "heat_thresh": spec.heat_thresh,
                "train_samples": len(train_ds),
                "val_samples": len(val_ds),
                "history": history,
                "best_val_bce": round(float(best_val), 6),
                "metrics": detection_metrics,
                "lidar_validation": lidar_metrics,
                "selection_score": selection_score,
                "model": model,
                "device": str(device),
                "bev_cfg": bev_cfg,
            }
        )

    results.sort(
        key=lambda r: (
            -float(r["selection_score"]),
            -float(r["metrics"]["micro_f1"]),
            float(r["best_val_bce"]),
        )
    )
    leaderboard: list[dict[str, Any]] = []
    for rank, item in enumerate(results, start=1):
        leaderboard.append(
            {
                "rank": rank,
                "name": item["name"],
                "radar_mode": item["radar_mode"],
                "model_name": item["model_name"],
                "feature_channels": item["feature_channels"],
                "best_val_bce": item["best_val_bce"],
                "micro_f1": item["metrics"]["micro_f1"],
                "lidar_cluster_f1": item["lidar_validation"]["cluster_f1"],
                "lidar_support_ratio": item["lidar_validation"]["support_ratio"],
                "selection_score": item["selection_score"],
            }
        )
    return {
        "device": str(device),
        "train_split": train_split,
        "val_split": val_split,
        "experiments": results,
        "leaderboard": leaderboard,
        "best": results[0] if results else None,
    }


def split_indices(n: int, train_ratio: float, valid_ratio: float) -> dict[str, np.ndarray]:
    idx = np.arange(n, dtype=int)
    n_train = int(round(n * train_ratio))
    n_valid = int(round(n * valid_ratio))
    n_train = min(max(n_train, 0), n)
    n_valid = min(max(n_valid, 0), n - n_train)
    return {
        "train": idx[:n_train],
        "valid": idx[n_train : n_train + n_valid],
        "test": idx[n_train + n_valid :],
    }
