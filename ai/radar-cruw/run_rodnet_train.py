"""
RODNet 공식 학습 파이프라인 (vendor/RODNet/tools/train.py)

1) CRUW 데이터를 ROD2021 레이아웃으로 스테이징 (sequences/train, annotations/train)
2) prepare_data.py --split train → .pkl
3) train.py (CDC 등 config)

사전 설치 (한 번, 레포 루트에서):
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  pip install -e ai/radar-cruw/vendor/cruw-devkit --no-build-isolation
  copy ai/radar-cruw/vendor/RODNet/setup_wo_tdc.py ai/radar-cruw/vendor/RODNet/setup.py
  pip install -e ai/radar-cruw/vendor/RODNet --no-build-isolation

사용 예:
  python ai/radar-cruw/run_rodnet_train.py --epochs 1 --batch_size 2

환경 변수 (선택): CRUW_DATA_DIR, CRUW_SEQUENCE (특정 시퀀스 stem)
학습 산출물: data/rodnet_checkpoints_train/ (config에 따라 하위 폴더에 epoch_*_final.pkl 등)
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from train_cruw_resnet_heatmap import (
    collect_anno_by_stem,
    find_radar_source_for_sequence,
    find_repo_root,
    list_sequences_with_radar,
)


def stage_train_rod2021(
    data_dir: Path,
    staging_root: Path,
    stem: str,
) -> tuple[bool, str]:
    anno_by_stem = collect_anno_by_stem(data_dir)
    if stem not in anno_by_stem:
        return False, f"라벨 없음: {stem}"
    # 이전 스테이징을 먼저 지워야 glob이 rodnet_staging 아래를 잘못된 소스로 고르지 않음
    if staging_root.exists():
        shutil.rmtree(staging_root)

    radar = find_radar_source_for_sequence(data_dir, stem)
    if radar[0] == "none":
        return False, f"RAMap 없음: {stem}"
    seq_dir = staging_root / "sequences" / "train" / stem
    dst_radar = seq_dir / "RADAR_RA_H"
    dst_radar.parent.mkdir(parents=True, exist_ok=True)
    ann_dir = staging_root / "annotations" / "train"
    ann_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(anno_by_stem[stem], ann_dir / f"{stem}.txt")

    if radar[0] == "dir":
        shutil.copytree(radar[1], dst_radar)
    else:
        _, zp, prefix = radar
        prefix = prefix.replace("\\", "/")
        with zipfile.ZipFile(zp, "r") as z:
            for n in z.namelist():
                n2 = n.replace("\\", "/")
                if not n2.startswith(prefix + "/") or not n.endswith(".npy"):
                    continue
                rel = n2[len(prefix) + 1 :].lstrip("/")
                if not rel:
                    continue
                out = dst_radar / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                with z.open(n) as src, open(out, "wb") as out_f:
                    out_f.write(src.read())

    for cand in sorted(data_dir.glob("**/CAM_CALIB")):
        calib_sub = cand / "calib"
        if calib_sub.is_dir():
            dst_calib = staging_root / "calib"
            shutil.copytree(calib_sub, dst_calib)
            break

    return True, "ok"


def print_training_status(data_dir: Path | None = None, tail_lines: int = 40) -> None:
    """학습 진행 여부 확인: GPU, checkpoint 폴더, 가장 최근 `train.log` 마지막 줄."""
    import torch

    repo = find_repo_root()
    data_dir = data_dir or Path(os.environ.get("CRUW_DATA_DIR", "") or (repo / "ai" / "radar-cruw" / "data")).resolve()
    log_root = data_dir / "rodnet_checkpoints_train"

    print("torch.cuda.is_available():", torch.cuda.is_available())
    if torch.cuda.is_available():
        print("GPU:", torch.cuda.get_device_name(0))
    try:
        r = subprocess.run(
            ["nvidia-smi", "-L"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            print("nvidia-smi -L:\n", r.stdout.strip())
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

    print("checkpoint 루트:", log_root, "| exists:", log_root.is_dir())
    if not log_root.is_dir():
        print("(학습을 한 번도 안 돌렸거나 경로가 다릅니다.)")
        return

    logs = sorted(log_root.rglob("train.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not logs:
        print("train.log 아직 없음.")
        return
    p = logs[0]
    print("가장 최근 train.log:", p)
    print("수정 시각:", datetime.fromtimestamp(p.stat().st_mtime))
    text = p.read_text(encoding="utf-8", errors="replace").splitlines()
    print("--- 마지막", tail_lines, "줄 ---")
    print("\n".join(text[-tail_lines:]))


def run_training(
    data_dir: Path | None = None,
    stem: str = "",
    epochs: int = 1,
    batch_size: int = 2,
    log_step: int = 50,
    lr_step: int = 5,
    skip_stage: bool = False,
    skip_prepare: bool = False,
) -> dict[str, Path | str]:
    """Jupyter / 스크립트 공용. 학습 subprocess는 표준 출력을 그대로 넘겨 노트북 셀에 줄 단위로 표시됩니다."""
    repo = find_repo_root()
    radar_cruw = repo / "ai" / "radar-cruw"
    data_dir = data_dir or Path(os.environ.get("CRUW_DATA_DIR", "") or (radar_cruw / "data")).resolve()
    rodnet = radar_cruw / "vendor" / "RODNet"
    if not (rodnet / "tools" / "train.py").is_file():
        raise FileNotFoundError(f"RODNet 없음: {rodnet} — git clone 후 pip install -e . 하세요.")

    staging = data_dir / "rodnet_staging_train_rod2021"
    prepared = rodnet / "data" / "prepared_train_project"
    log_dir = data_dir / "rodnet_checkpoints_train"
    cfg = rodnet / "configs" / "config_rodnet_cdc_win16.py"

    stem = stem.strip() or os.environ.get("CRUW_SEQUENCE", "").strip()
    anno_by_stem = collect_anno_by_stem(data_dir)
    matched = list_sequences_with_radar(data_dir, anno_by_stem)
    if not stem:
        stem = matched[0] if matched else ""
    if not stem:
        raise RuntimeError("TRAIN 라벨 + RAMap 짝이 없습니다. data/ 에 TRAIN_RAD_H_ANNO 와 TRAIN_RAD_H 를 두세요.")

    if not skip_stage:
        ok, msg = stage_train_rod2021(data_dir, staging, stem)
        if not ok:
            raise RuntimeError(f"스테이징 실패: {msg}")
        print("스테이징:", staging, "시퀀스:", stem)

    if not skip_prepare:
        prep = rodnet / "tools" / "prepare_dataset" / "prepare_data.py"
        cmd_p = [
            sys.executable,
            str(prep),
            "--config",
            str(cfg),
            "--data_root",
            str(staging),
            "--split",
            "train",
            "--out_data_dir",
            str(prepared),
            "--overwrite",
        ]
        print("실행:", " ".join(cmd_p))
        r = subprocess.run(cmd_p, cwd=str(rodnet), capture_output=True, text=True)
        if r.stdout:
            print(r.stdout, end="")
        if r.stderr:
            print(r.stderr, end="")
        r.check_returncode()
        pkls = list((prepared / "train").glob("*.pkl"))
        if not pkls:
            raise RuntimeError("prepare_data 후 train/*.pkl 없음")
        print("생성된 pkl:", len(pkls))

    train_py = rodnet / "tools" / "train.py"
    cmd_t = [
        sys.executable,
        str(train_py),
        "--config",
        str(cfg),
        "--data_root",
        str(staging),
        "--data_dir",
        str(prepared),
        "--log_dir",
        str(log_dir),
        "--n_epoch",
        str(epochs),
        "--batch_size",
        str(batch_size),
        "--log_step",
        str(log_step),
        "--lr_step",
        str(lr_step),
    ]
    print("실행:", " ".join(cmd_t))
    r = subprocess.run(cmd_t, cwd=str(rodnet))
    if r.returncode != 0:
        raise subprocess.CalledProcessError(r.returncode, cmd_t)
    print("로그·가중치:", log_dir)
    return {
        "staging": staging,
        "prepared": prepared,
        "log_dir": log_dir,
        "stem": stem,
        "config": cfg,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="RODNet 스테이징 + prepare_data + train")
    ap.add_argument("--data_dir", type=Path, default=None, help="기본: REPO/ai/radar-cruw/data")
    ap.add_argument("--stem", type=str, default="", help="시퀀스 stem (미지정 시 짝 맞는 첫 시퀀스)")
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--batch_size", type=int, default=2)
    ap.add_argument("--log_step", type=int, default=50)
    ap.add_argument("--lr_step", type=int, default=5)
    ap.add_argument("--skip_stage", action="store_true", help="이미 스테이징됨 — prepare/train 만")
    ap.add_argument("--skip_prepare", action="store_true", help="이미 .pkl 있음 — train 만")
    args = ap.parse_args()

    try:
        run_training(
            data_dir=args.data_dir,
            stem=args.stem,
            epochs=args.epochs,
            batch_size=args.batch_size,
            log_step=args.log_step,
            lr_step=args.lr_step,
            skip_stage=args.skip_stage,
            skip_prepare=args.skip_prepare,
        )
    except (FileNotFoundError, RuntimeError, subprocess.CalledProcessError) as e:
        print(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
