"""
CRUW RAMap → 객체 히트맵 학습 (프로토타입)

- **ResNet** (He et al., "Deep Residual Learning for Image Recognition", CVPR 2015):
  PyTorch 문서: https://pytorch.org/vision/stable/models.html#classification
  잔차(skip) 연결로 깊은 CNN을 안정적으로 학습하는 **일반 이미지 분류 백본**입니다.

- **RODNet** (Wang et al., WACV 2021):
  레이더 Range–Azimuth 맵에서 객체를 찾는 **별도 논문/아키텍처**이며, 공식 학습은
  `vendor/RODNet` 의 `tools/train.py` 를 쓰는 것이 맞습니다.
  이 스크립트는 노트북의 경량 예시와 같이 **ResNet18 백본 + 디코더**로 동일한
  “히트맵 회귀” 아이디어를 재현합니다 (RODNet 전체와 동일하지 않음).

사용:
  cd hanhwa_final
  python ai/radar-cruw/train_cruw_resnet_heatmap.py --epochs 3
  python ai/radar-cruw/train_cruw_resnet_heatmap.py --epochs 5 --backbone tiny   # 더 가벼운 CNN
"""

from __future__ import annotations

import argparse
import io
import os
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from torchvision.models import resnet18


def find_repo_root() -> Path:
    p = Path(__file__).resolve()
    for cand in [p.parent, *p.parents]:
        if (cand / "ai" / "radar-cruw" / "requirements-cruw.txt").is_file():
            return cand
        if (cand / "vod-devkit").is_dir():
            return cand
    return p.parents[3]


def collect_anno_by_stem(data_dir: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    if not data_dir.is_dir():
        return out
    for p in sorted(data_dir.glob("**/TRAIN_RAD_H_ANNO/**/*.txt")):
        out[p.stem] = p
    return out


_TRAIN_ZIP_INDEX: Optional[list[tuple[Path, set[str]]]] = None


def train_zip_stem_index(data_dir: Path) -> list[tuple[Path, set[str]]]:
    global _TRAIN_ZIP_INDEX
    if _TRAIN_ZIP_INDEX is not None:
        return _TRAIN_ZIP_INDEX
    out: list[tuple[Path, set[str]]] = []
    for zp in sorted(data_dir.glob("**/TRAIN_RAD_H*.zip")):
        with zipfile.ZipFile(zp, "r") as z:
            stems: set[str] = set()
            for n in z.namelist():
                n2 = n.replace("\\", "/")
                if "/RADAR_RA_H/" in n2 and n.endswith(".npy"):
                    parts = n2.split("/")
                    if len(parts) >= 3 and parts[0] == "TRAIN_RAD_H":
                        stems.add(parts[1])
        if stems:
            out.append((zp, stems))
    _TRAIN_ZIP_INDEX = out
    return out


def _is_under_rodnet_staging(p: Path) -> bool:
    """이전 실행의 스테이징 폴더(rodnet_staging_*)는 RAMap 소스로 쓰지 않음."""
    return any("rodnet_staging" in part.lower() for part in p.parts)


def find_radar_source_for_sequence(data_dir: Path, stem: str) -> tuple:
    for d in sorted(data_dir.glob(f"**/{stem}/RADAR_RA_H")):
        if _is_under_rodnet_staging(d):
            continue
        if d.is_dir() and d.name == "RADAR_RA_H" and any(d.glob("*.npy")):
            return ("dir", d)
    prefix = f"TRAIN_RAD_H/{stem}/RADAR_RA_H"
    for zp, stems in train_zip_stem_index(data_dir):
        if stem not in stems:
            continue
        return ("zip", zp, prefix)
    return ("none",)


def stems_with_radar_available(data_dir: Path) -> set[str]:
    s: set[str] = set()
    for _, stems in train_zip_stem_index(data_dir):
        s |= stems
    for d in data_dir.glob("**/RADAR_RA_H"):
        if _is_under_rodnet_staging(d):
            continue
        if d.is_dir() and d.name == "RADAR_RA_H" and any(d.glob("*.npy")):
            s.add(d.parent.name)
    return s


def list_sequences_with_radar(data_dir: Path, annos: dict[str, Path]) -> list[str]:
    avail = stems_with_radar_available(data_dir)
    return sorted(stem for stem in annos if stem in avail)


_zip_cache: dict[Path, zipfile.ZipFile] = {}


def _zip_get(zp: Path) -> zipfile.ZipFile:
    if zp not in _zip_cache:
        _zip_cache[zp] = zipfile.ZipFile(zp, "r")
    return _zip_cache[zp]


def load_ramap_rood2021(radar_source: tuple, frame_id: int, chunk_index: int = 0) -> Optional[np.ndarray]:
    fn = f"{frame_id:06d}_{chunk_index:04d}.npy"
    if not radar_source or radar_source[0] == "none":
        return None
    kind = radar_source[0]
    if kind == "dir":
        d = radar_source[1]
        if not d.is_dir():
            return None
        p = d / fn
        if p.is_file():
            return np.load(p)
        matches = sorted(d.glob(f"{frame_id:06d}_*.npy"))
        return np.load(matches[0]) if matches else None
    if kind == "zip":
        _, zp, prefix = radar_source
        prefix = prefix.replace("\\", "/")
        inner = f"{prefix}/{fn}"
        zf = _zip_get(zp)
        names = zf.namelist()
        if inner not in names:
            inner_alt = inner.replace("/", "\\")
            if inner_alt in names:
                inner = inner_alt
            else:
                hits = sorted(
                    n
                    for n in names
                    if n.replace("\\", "/").startswith(prefix + "/")
                    and f"{frame_id:06d}_" in n
                    and n.endswith(".npy")
                )
                if not hits:
                    return None
                inner = hits[0]
        return np.load(io.BytesIO(zf.read(inner)))
    return None


def ramap_to_chw(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 2:
        return arr[np.newaxis, ...]
    if arr.ndim == 3:
        if arr.shape[0] <= 32 and arr.shape[-1] > 32:
            return arr
        return np.transpose(arr, (2, 0, 1))
    return arr


def parse_rod2021_txt(txt_path: Path) -> dict[int, list[tuple[float, float, str]]]:
    by_frame: dict[int, list[tuple[float, float, str]]] = {}
    with open(txt_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.split()
            if len(parts) < 4:
                continue
            fid = int(parts[0])
            r_m, az_rad, cls = float(parts[1]), float(parts[2]), parts[3]
            by_frame.setdefault(fid, []).append((r_m, az_rad, cls))
    return by_frame


def gaussian_heatmap(h: int, w: int, cy: float, cx: float, sigma: float = 2.0) -> np.ndarray:
    yy, xx = np.ogrid[:h, :w]
    g = np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * sigma**2))
    return g.astype(np.float32)


def range_az_to_pixel(
    range_m: float,
    az_rad: float,
    h: int,
    w: int,
    range_max_m: float = 50.0,
    az_fov_rad: float = 1.4,
) -> tuple[float, float]:
    half = az_fov_rad / 2.0
    cy = float(np.clip((range_m / range_max_m) * (h - 1), 0, h - 1))
    ax = float(np.clip((az_rad + half) / az_fov_rad, 0.0, 1.0))
    cx = ax * (w - 1)
    return cy, cx


class CruwRod2021HeatmapDataset(Dataset):
    def __init__(
        self,
        by_frame: dict[int, list[tuple[float, float, str]]],
        radar_source: tuple,
        range_max_m: float = 50.0,
        az_fov_rad: float = 1.4,
        sigma_px: float = 2.5,
        h: int = 128,
        w: int = 128,
    ):
        self.by_frame = by_frame
        self.radar_source = radar_source
        self.range_max_m = range_max_m
        self.az_fov_rad = az_fov_rad
        self.sigma_px = sigma_px
        self.h, self.w = h, w
        self.frame_ids = sorted(by_frame.keys())

    def __len__(self) -> int:
        return len(self.frame_ids)

    def __getitem__(self, idx: int):
        fid = self.frame_ids[idx]
        raw = load_ramap_rood2021(self.radar_source, fid)
        if raw is None:
            raw = np.zeros((self.h, self.w, 2), dtype=np.float32)
        x = torch.from_numpy(ramap_to_chw(raw).astype(np.float32))

        tgt = np.zeros((self.h, self.w), dtype=np.float32)
        for r_m, az_rad, _ in self.by_frame[fid]:
            cy, cx = range_az_to_pixel(r_m, az_rad, self.h, self.w, self.range_max_m, self.az_fov_rad)
            tgt = np.maximum(tgt, gaussian_heatmap(self.h, self.w, cy, cx, sigma=self.sigma_px))
        y = torch.from_numpy(tgt[None, ...])
        return x, y


class DummyRAMapDataset(Dataset):
    def __init__(self, n: int = 256, h: int = 128, w: int = 128, n_chirp: int = 2):
        self.n = n
        self.h, self.w = h, w
        self.n_chirp = n_chirp

    def __len__(self) -> int:
        return self.n

    def __getitem__(self, idx: int):
        rng = np.random.default_rng(idx)
        x = rng.normal(size=(self.n_chirp, self.h, self.w)).astype(np.float32)
        cy = float(rng.uniform(8, self.h - 8))
        cx = float(rng.uniform(8, self.w - 8))
        target = gaussian_heatmap(self.h, self.w, cy, cx, sigma=3.0)
        return torch.from_numpy(x), torch.from_numpy(target[None, ...])


class TinyRadarHeatmapNet(nn.Module):
    def __init__(self, in_ch: int = 2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, 32, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 32, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 1, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class ResNet18HeatmapNet(nn.Module):
    """torchvision ResNet18 백본 + 업샘플 헤드 → H×W 히트맵 (입력 128×128 가정)."""

    def __init__(self, in_ch: int = 2):
        super().__init__()
        m = resnet18(weights=None)
        m.conv1 = nn.Conv2d(in_ch, 64, kernel_size=7, stride=2, padding=3, bias=False)
        nn.init.kaiming_normal_(m.conv1.weight, mode="fan_out", nonlinearity="relu")
        self.backbone = nn.Sequential(
            m.conv1,
            m.bn1,
            m.relu,
            m.maxpool,
            m.layer1,
            m.layer2,
            m.layer3,
            m.layer4,
        )
        # 128 → conv+pool 후 32×32 … layer4 → 4×4, 채널 512
        self.head = nn.Sequential(
            nn.Conv2d(512, 128, 1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(64, 32, 4, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(32, 16, 4, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(16, 8, 4, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(8, 1, 4, stride=2, padding=1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.backbone(x)
        return self.head(x)


def train_one_epoch(model, loader, opt, criterion, device):
    model.train()
    total = 0.0
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        opt.zero_grad()
        pred = model(xb)
        loss = criterion(pred, yb)
        loss.backward()
        opt.step()
        total += loss.item() * xb.size(0)
    return total / len(loader.dataset)


def resolve_data(data_dir: Path) -> tuple[Optional[Dataset], str]:
    anno_by_stem = collect_anno_by_stem(data_dir)
    stem_env = os.environ.get("CRUW_SEQUENCE", "").strip()
    anno_txt: Optional[Path] = None
    radar: tuple = ("none",)

    if os.environ.get("CRUW_ANNO_TXT"):
        anno_txt = Path(os.environ["CRUW_ANNO_TXT"]).resolve()
        stem_env = stem_env or anno_txt.stem
    elif stem_env and stem_env in anno_by_stem:
        anno_txt = anno_by_stem[stem_env]

    if os.environ.get("CRUW_RADAR_DIR"):
        rd = Path(os.environ["CRUW_RADAR_DIR"]).resolve()
        if rd.is_dir():
            radar = ("dir", rd)

    if radar[0] == "none" and stem_env:
        radar = find_radar_source_for_sequence(data_dir, stem_env)

    if anno_txt is None or radar[0] == "none":
        matched = list_sequences_with_radar(data_dir, anno_by_stem)
        pick = stem_env if stem_env and stem_env in matched else (matched[0] if matched else "")
        if pick:
            anno_txt = anno_by_stem.get(pick)
            radar = find_radar_source_for_sequence(data_dir, pick)

    if anno_txt and anno_txt.is_file() and radar[0] != "none":
        by_frame = parse_rod2021_txt(anno_txt)
        if by_frame:
            ds = CruwRod2021HeatmapDataset(by_frame, radar)
            return ds, f"CRUW 실데이터 ({anno_txt.name}, n={len(ds)})"

    ds = DummyRAMapDataset(n=256, h=128, w=128, n_chirp=2)
    return ds, "더미 RAMap (데이터 짝 없음 — CRUW TRAIN 라벨+RAMap 배치 시 실데이터로 전환)"


def main() -> None:
    ap = argparse.ArgumentParser(description="CRUW ResNet18 히트맵 학습 (프로토타입)")
    ap.add_argument("--data_dir", type=Path, default=None, help="기본: REPO/ai/radar-cruw/data 또는 CRUW_DATA_DIR")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--backbone", choices=("resnet18", "tiny"), default="resnet18")
    ap.add_argument("--out", type=Path, default=None, help="체크포인트 저장 경로 (.pt)")
    args = ap.parse_args()

    repo = find_repo_root()
    data_dir = args.data_dir
    if data_dir is None:
        data_dir = Path(os.environ.get("CRUW_DATA_DIR", "") or (repo / "ai" / "radar-cruw" / "data")).resolve()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ds, desc = resolve_data(data_dir)
    loader = DataLoader(ds, batch_size=args.batch, shuffle=True, num_workers=0)

    if args.backbone == "resnet18":
        model = ResNet18HeatmapNet(in_ch=2).to(device)
    else:
        model = TinyRadarHeatmapNet(in_ch=2).to(device)

    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    criterion = nn.MSELoss()

    out_path = args.out
    if out_path is None:
        out_path = data_dir / "checkpoints" / f"cruw_heatmap_{args.backbone}.pt"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print("device     :", device)
    print("데이터     :", desc)
    print("backbone   :", args.backbone)
    print("epochs     :", args.epochs)
    print("checkpoint :", out_path)

    for ep in range(args.epochs):
        loss = train_one_epoch(model, loader, opt, criterion, device)
        print(f"epoch {ep + 1}/{args.epochs}  mse_loss={loss:.6f}")

    torch.save({"model": model.state_dict(), "backbone": args.backbone, "meta": desc}, out_path)
    print("저장 완료:", out_path)


if __name__ == "__main__":
    main()
