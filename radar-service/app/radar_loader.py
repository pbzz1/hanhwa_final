"""
VoD 레이더 바이너리 로딩. `radar`, `radar_3frames`, `radar_5frames` 등 다중 프레임 스택 지원.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import numpy as np

RadarFrameMode = Literal["radar", "radar_3frames", "radar_5frames"]

# VoD .bin 한 점당 float32 7개: x,y,z, RCS, v_r, v_r_comp, time
RADAR_COLUMNS = 7


def load_vod_radar_bin(path: str | Path) -> np.ndarray:
    """
    단일 VoD 레이더 `.bin`을 (N, 7) float32 배열로 읽습니다.

    열 순서: x, y, z, RCS, v_r, v_r_comp, time (VoD 관례).
    """
    p = Path(path)
    raw = np.fromfile(p, dtype=np.float32)
    if raw.size % RADAR_COLUMNS != 0:
        raise ValueError(f"Invalid radar bin size: {p} (not multiple of {RADAR_COLUMNS})")
    return raw.reshape(-1, RADAR_COLUMNS)


def load_radar_frame_stack(paths: list[str | Path], *, frame_dt_s: float) -> tuple[np.ndarray, RadarFrameMode]:
    """
    여러 프레임 파일을 시간 오프셋과 함께 세로로 합칩니다.

    `frame_dt_s`만큼씩 `time` 열(마지막)에 누적 오프셋을 더해 구분 가능하게 합니다.
    반환 모드는 경로 개수에 따라 `radar` / `radar_3frames` / `radar_5frames`로 태깅합니다.
    """
    if not paths:
        raise ValueError("paths must be non-empty")
    chunks: list[np.ndarray] = []
    for i, path in enumerate(paths):
        block = load_vod_radar_bin(path).copy()
        block[:, 6] = block[:, 6] + float(i) * frame_dt_s
        chunks.append(block)
    merged = np.vstack(chunks)
    n = len(paths)
    if n == 1:
        mode: RadarFrameMode = "radar"
    elif n == 3:
        mode = "radar_3frames"
    elif n == 5:
        mode = "radar_5frames"
    else:
        mode = "radar"
    return merged, mode


def example_radar_loader() -> None:
    """합성 바이너리로 로더 검증."""
    tmp = np.arange(14, dtype=np.float32).reshape(2, 7)
    path = Path("_tmp_radar_example.bin")
    try:
        tmp.tofile(path)
        got = load_vod_radar_bin(path)
        assert got.shape == (2, 7)
    finally:
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    example_radar_loader()
    print("radar_loader OK")
