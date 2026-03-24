from pathlib import Path
import shutil

def is_image(p: Path) -> bool:
    return p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}

def prepare_3d_scenes(src_root: Path, out_root: Path) -> None:
    """
    src_root: 전차데이터/전차데이터/3. 라벨링
    out_root: data/3d_scenes
    """
    count_scenes = 0
    count_images = 0

    for tank_dir in src_root.iterdir():
        if not tank_dir.is_dir():
            continue

        tank_name = tank_dir.name  # 90식, K1A1, K2, ...

        # 보통 중간에 '라벨링' 폴더가 한 번 더 있는 구조라 가정
        mid_dirs = [d for d in tank_dir.iterdir() if d.is_dir()]
        if len(mid_dirs) == 1 and "라벨" in mid_dirs[0].name:
            label_root = mid_dirs[0]
        else:
            label_root = tank_dir

        # 각도/포즈별 폴더 (예: 90식_45도_..., 90식_90도_...)
        for pose_dir in label_root.iterdir():
            if not pose_dir.is_dir():
                continue

            pose_name = pose_dir.name
            scene_name = f"{tank_name}_{pose_name}"

            out_images = out_root / scene_name / "images"
            out_images.mkdir(parents=True, exist_ok=True)

            copied_here = 0
            seen_names: set[str] = set()
            for p in pose_dir.rglob("*"):
                if is_image(p):
                    rel = p.relative_to(pose_dir)
                    if len(rel.parts) > 1:
                        dst_name = f"{rel.parts[0]}_{p.name}"
                    else:
                        dst_name = p.name
                    if dst_name in seen_names:
                        dst_name = f"{rel.parts[0]}_{p.stem}_{copied_here}{p.suffix}"
                    seen_names.add(dst_name)
                    shutil.copy2(p, out_images / dst_name)
                    copied_here += 1
                    count_images += 1

            if copied_here > 0:
                count_scenes += 1
                print(f"[scene] {scene_name}: {copied_here} images")

    print(f"\n총 scene 개수: {count_scenes}, 총 이미지 수: {count_images}")
    print(f"출력 루트: {out_root}")


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent / "data"
    for cand in [base / "전차데이터" / "3. 라벨링", base / "전차데이터" / "전차데이터" / "3. 라벨링"]:
        if cand.exists():
            SRC_ROOT = cand
            break
    else:
        SRC_ROOT = base / "전차데이터" / "전차데이터" / "3. 라벨링"
    OUT_ROOT = base / "3d_scenes"
    if not SRC_ROOT.exists():
        print(f"오류: 라벨링 폴더가 없습니다. {SRC_ROOT}")
        raise SystemExit(1)
    prepare_3d_scenes(SRC_ROOT, OUT_ROOT)