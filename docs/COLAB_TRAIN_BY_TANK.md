# Colab에서 전차별 3D Gaussian Splatting 학습

전차별(90식, K1A1, K2, M1A2, T-90a, tiger)로 3D 모델을 학습시키는 Colab 코드입니다.

---

## 1. Drive 마운트 & 경로 설정

```python
from google.colab import drive
drive.mount('/content/drive')
```

```python
from pathlib import Path

# Colab에서 전차데이터 위치 (압축 풀린 후)
TANK_DATA_ROOT = Path("/content/data/tanks/전차데이터")
LABELING_ROOT = TANK_DATA_ROOT / "3. 라벨링"

# 출력: 각도별 scene (18개)
SCENES_ROOT = Path("/content/data/3d_scenes")

# 출력: 전차별 병합 scene (6개)
TANK_MERGED_ROOT = Path("/content/data/3d_scenes_by_tank")
```

---

## 2. 각도별 scene 생성 (prepare_3d_scenes)

```python
from pathlib import Path
import shutil

def is_image(p: Path) -> bool:
    return p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}

def prepare_3d_scenes(src_root: Path, out_root: Path) -> None:
    count_scenes = 0
    count_images = 0
    for tank_dir in src_root.iterdir():
        if not tank_dir.is_dir():
            continue
        tank_name = tank_dir.name
        mid_dirs = [d for d in tank_dir.iterdir() if d.is_dir()]
        if len(mid_dirs) == 1 and "라벨" in mid_dirs[0].name:
            label_root = mid_dirs[0]
        else:
            label_root = tank_dir
        for pose_dir in label_root.iterdir():
            if not pose_dir.is_dir():
                continue
            pose_name = pose_dir.name
            scene_name = f"{tank_name}_{pose_name}"
            out_images = out_root / scene_name / "images"
            out_images.mkdir(parents=True, exist_ok=True)
            copied_here = 0
            for p in pose_dir.rglob("*"):
                if is_image(p):
                    shutil.copy2(p, out_images / p.name)
                    copied_here += 1
                    count_images += 1
            if copied_here > 0:
                count_scenes += 1
                print(f"[scene] {scene_name}: {copied_here} images")
    print(f"\n총 scene: {count_scenes}, 이미지: {count_images}")

SRC = Path("/content/data/tanks/전차데이터/3. 라벨링")
OUT = Path("/content/data/3d_scenes")
OUT.mkdir(parents=True, exist_ok=True)
prepare_3d_scenes(SRC, OUT)
```

---

## 3. 전차별 scene 병합 (6개)

```python
from pathlib import Path
import shutil

def is_image(p: Path) -> bool:
    return p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}

def prepare_tank_merged_scenes(scenes_root: Path, out_root: Path) -> None:
    tank_to_scenes = {}
    for scene_dir in scenes_root.iterdir():
        if not scene_dir.is_dir():
            continue
        images_dir = scene_dir / "images"
        if not images_dir.exists():
            continue
        tank_name = scene_dir.name.split("_")[0]
        if tank_name not in tank_to_scenes:
            tank_to_scenes[tank_name] = []
        tank_to_scenes[tank_name].append(scene_dir)

    total_images = 0
    for tank_name, scene_dirs in tank_to_scenes.items():
        out_images = out_root / tank_name / "images"
        out_images.mkdir(parents=True, exist_ok=True)
        copied = 0
        seen = set()
        for scene_dir in scene_dirs:
            for p in (scene_dir / "images").rglob("*"):
                if not is_image(p):
                    continue
                dst_name = f"{p.stem}{p.suffix}"
                if dst_name in seen:
                    dst_name = f"{scene_dir.name}_{p.stem}{p.suffix}"
                seen.add(dst_name)
                shutil.copy2(p, out_images / dst_name)
                copied += 1
                total_images += 1
        print(f"[전차] {tank_name}: {copied} images (from {len(scene_dirs)} scenes)")
    print(f"\n총 6개 전차, {total_images} images")

prepare_tank_merged_scenes(
    Path("/content/data/3d_scenes"),
    Path("/content/data/3d_scenes_by_tank")
)
```

---

## 4. COLMAP + 3D Gaussian Splatting 설치

```python
!sudo apt-get update -y
!sudo apt-get install -y colmap
```

```python
%cd /content
!git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git
%cd /content/gaussian-splatting
!pip install plyfile tqdm
%cd submodules/diff-gaussian-rasterization && pip install . && cd ../simple-knn && pip install . && cd ../..
%cd /content/gaussian-splatting
```

---

## 5. 전차별 3D GS 학습 (6개 전차)

```python
%%bash
DATA_ROOT="/content/data/3d_scenes_by_tank"
GS_ROOT="/content/gaussian-splatting"

for SCENE in $(ls "$DATA_ROOT"); do
  SCENE_ROOT="$DATA_ROOT/$SCENE"
  if [ ! -d "$SCENE_ROOT/images" ]; then
    continue
  fi

  echo "=== [$SCENE] COLMAP ==="
  mkdir -p "$SCENE_ROOT/sparse/0"

  colmap feature_extractor \
    --database_path "$SCENE_ROOT/database.db" \
    --image_path   "$SCENE_ROOT/images"

  colmap exhaustive_matcher \
    --database_path "$SCENE_ROOT/database.db"

  colmap mapper \
    --database_path "$SCENE_ROOT/database.db" \
    --image_path   "$SCENE_ROOT/images" \
    --output_path  "$SCENE_ROOT/sparse"

  colmap model_converter \
    --input_path  "$SCENE_ROOT/sparse/0" \
    --output_path "$SCENE_ROOT/sparse/0" \
    --output_type TXT

  echo "=== [$SCENE] 3D Gaussian Splatting ==="
  cd "$GS_ROOT"
  python train.py -s "$SCENE_ROOT" -m "output/$SCENE"
  cd /content
done

echo "전차별 3D 모델 학습 완료"
```

---

## 6. 결과 확인

학습 완료 후 각 전차별 3D 모델 위치:

```
/content/gaussian-splatting/output/<전차명>/point_cloud/iteration_7000/point_cloud.ply
```

- `90식`: output/90식/...
- `K1A1`: output/K1A1/...
- `K2`: output/K2/...
- `M1A2`: output/M1A2/...
- `T-90a`: output/T-90a/...
- `tiger`: output/tiger/...

---

## 7. Drive로 결과 저장

```python
import shutil
from pathlib import Path

OUT_DIR = Path("/content/gaussian-splatting/output")
DRIVE_SAVE = Path("/content/drive/MyDrive/hanhwa_final/3d_models_by_tank")

if DRIVE_SAVE.exists():
    shutil.rmtree(DRIVE_SAVE)
shutil.copytree(OUT_DIR, DRIVE_SAVE)
print("Drive 저장 완료:", DRIVE_SAVE)
```
