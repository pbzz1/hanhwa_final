#!/bin/bash
# COLMAP + 3D Gaussian Splatting 학습 한 번에 실행 (WSL/Linux)
# 사용법: ./run_colmap_and_train.sh [장면이름]
# 기본 장면: tank_scene_0deg

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_ROOT="${SCRIPT_DIR}/data"
SCENE="${1:-tank_scene_0deg}"
GS_ROOT="${SCRIPT_DIR}/gaussian-splatting"

if [ ! -d "$DATA_ROOT/$SCENE/images" ]; then
  echo "이미지 폴더가 없습니다: $DATA_ROOT/$SCENE/images"
  echo "먼저 data/$SCENE/images/ 아래에 전차 이미지를 넣어 주세요."
  exit 1
fi

if [ ! -d "$GS_ROOT" ]; then
  echo "3D GS 저장소가 없습니다: $GS_ROOT"
  echo "다음으로 클론 후 다시 실행하세요:"
  echo "  git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git"
  exit 1
fi

echo "=== 1. COLMAP (SfM) ==="
mkdir -p "$DATA_ROOT/$SCENE/sparse/0"
colmap feature_extractor \
  --database_path "$DATA_ROOT/$SCENE/database.db" \
  --image_path "$DATA_ROOT/$SCENE/images"
colmap exhaustive_matcher --database_path "$DATA_ROOT/$SCENE/database.db"
colmap mapper \
  --database_path "$DATA_ROOT/$SCENE/database.db" \
  --image_path "$DATA_ROOT/$SCENE/images" \
  --output_path "$DATA_ROOT/$SCENE/sparse"
colmap model_converter \
  --input_path "$DATA_ROOT/$SCENE/sparse/0" \
  --output_path "$DATA_ROOT/$SCENE/sparse/0" \
  --output_type TXT

echo "=== 2. 3D Gaussian Splatting 학습 ==="
cd "$GS_ROOT"
python train.py -s "$DATA_ROOT/$SCENE"
echo "완료. 출력은 $GS_ROOT/output 또는 저장소 기본 출력 경로를 확인하세요."
