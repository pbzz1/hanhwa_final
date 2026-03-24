"""
VoD devkit 스모크 테스트 — 저장소에 포함된 example_set만으로 동작 확인.
전체 데이터셋 승인 후 root_dir 를 실제 View-of-Delft 루트로 바꿔 사용하면 됨.

실행 (vod-devkit 디렉터리에서):
  pip install numpy matplotlib k3d
  python smoke_example_set.py

또는:
  set PYTHONPATH=%CD%
  python smoke_example_set.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent
    root = here / "example_set"
    if not root.is_dir():
        print("example_set 폴더가 없습니다:", root, file=sys.stderr)
        return 1

    # 패키지 루트를 path에 넣어 `import vod` 가 동작하게 함
    if str(here) not in sys.path:
        sys.path.insert(0, str(here))

    os.environ.setdefault("PYTHONPATH", str(here))

    from vod.configuration import KittiLocations
    from vod.frame.data_loader import FrameDataLoader

    kitti = KittiLocations(str(root))
    frame = "01047"
    loader = FrameDataLoader(kitti, frame)

    radar = loader.radar_data
    lidar = loader.lidar_data
    image = loader.image
    labels = loader.raw_labels

    print("VoD devkit smoke (example_set, frame", frame, ")")
    print("  radar shape:", None if radar is None else radar.shape, "(x,y,z, RCS, v_r, v_r_comp, time)")
    print("  lidar shape:", None if lidar is None else lidar.shape)
    print("  image shape:", None if image is None else image.shape)
    print("  label lines:", 0 if not labels else len(labels))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
