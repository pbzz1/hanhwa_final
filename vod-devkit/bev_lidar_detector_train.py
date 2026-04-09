"""
LiDAR BEV(조류시각) + PyTorch 소형 CNN — KITTI label_2 기반 학습·검출 평가.

규칙 기반(DBSCAN threshold 튜닝)과 달리, 여기서는 가중치를 데이터로부터 학습합니다.
평가: 클래스별 BEV 히트맵 피크 → velodyne (x,y) 와 GT 중심 greedy 매칭 (거리 임계값).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
    candidates = {
        "single": [root / "radar" / "training" / "velodyne"],
        "3-scan": [
            root / "radar" / "training" / "velodyne_3",
            root / "radar" / "training" / "velodyne3",
            root / "radar" / "training" / "velodyne",
        ],
        "5-scan": [
            root / "radar" / "training" / "velodyne_5",
            root / "radar" / "training" / "velodyne5",
            root / "radar" / "training" / "velodyne",
        ],
    }
    for p in candidates.get(mode, []):
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
    ) -> None:
        self.frames = frames
        self.bev_cfg = bev_cfg
        self.num_classes = num_classes
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
        x = build_bev_tensor_radar(radar, self.bev_cfg)
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


def list_vod_sync_frames(dataset_root: Path) -> list[dict[str, Any]]:
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
    radar_dir = choose_radar_dir(root, "3-scan")
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
