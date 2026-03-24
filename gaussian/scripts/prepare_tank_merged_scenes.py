"""
전차별로 scene을 병합합니다.
18개 scene(각도별) → 6개 scene(전차별: 90식, K1A1, K2, M1A2, T-90a, tiger)
각 전차의 모든 각도 이미지를 하나의 images/ 폴더로 합칩니다.
"""
from pathlib import Path
import shutil


def is_image(p: Path) -> bool:
    return p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}


def prepare_tank_merged_scenes(scenes_root: Path, out_root: Path) -> None:
    """
    scenes_root: data/3d_scenes (각도별 scene들이 있는 루트)
    out_root: data/3d_scenes_by_tank (전차별로 병합된 출력)
    """
    # scene 이름에서 전차 추출: "90식_90식_45도각도_포신" → "90식", "K2_K2_45도각도_포신" → "K2"
    tank_to_scenes: dict[str, list[Path]] = {}

    for scene_dir in scenes_root.iterdir():
        if not scene_dir.is_dir():
            continue
        images_dir = scene_dir / "images"
        if not images_dir.exists():
            continue

        # 첫 번째 _ 앞이 전차 이름
        tank_name = scene_dir.name.split("_")[0]
        if tank_name not in tank_to_scenes:
            tank_to_scenes[tank_name] = []
        tank_to_scenes[tank_name].append(scene_dir)

    total_images = 0
    for tank_name, scene_dirs in tank_to_scenes.items():
        out_images = out_root / tank_name / "images"
        out_images.mkdir(parents=True, exist_ok=True)

        copied = 0
        seen_names: set[str] = set()
        for scene_dir in scene_dirs:
            for p in (scene_dir / "images").rglob("*"):
                if not is_image(p):
                    continue
                # 파일명 중복 방지 (다른 scene에 같은 이름이 있을 수 있음)
                base = p.stem
                ext = p.suffix
                dst_name = f"{base}{ext}"
                if dst_name in seen_names:
                    dst_name = f"{scene_dir.name}_{base}{ext}"
                seen_names.add(dst_name)

                dst = out_images / dst_name
                shutil.copy2(p, dst)
                copied += 1
                total_images += 1

        print(f"[전차] {tank_name}: {copied} images (from {len(scene_dirs)} scenes)")
    print(f"\n총 6개 전차, {total_images} images")
    print(f"출력 루트: {out_root}")


if __name__ == "__main__":
    import sys

    BASE = Path(__file__).resolve().parent.parent
    SCENES_ROOT = BASE / "data" / "3d_scenes"
    OUT_ROOT = BASE / "data" / "3d_scenes_by_tank"

    if len(sys.argv) >= 2:
        SCENES_ROOT = Path(sys.argv[1])
    if len(sys.argv) >= 3:
        OUT_ROOT = Path(sys.argv[2])

    if not SCENES_ROOT.exists():
        print(f"오류: scene 루트가 없습니다: {SCENES_ROOT}")
        sys.exit(1)

    prepare_tank_merged_scenes(SCENES_ROOT, OUT_ROOT)
