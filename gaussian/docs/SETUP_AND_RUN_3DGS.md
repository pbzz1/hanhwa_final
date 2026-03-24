# 3D Gaussian Splatting 전차 모델 학습 및 실행 가이드

이 문서는 **전차 다중 시점 이미지 → COLMAP(SfM) → 3D Gaussian Splatting 학습 → 추론/실행**까지 한 번에 따라 할 수 있도록 정리한 절차입니다.

---

## 1. 사전 요구사항

### 1.1 하드웨어

- **GPU**: NVIDIA GPU (CUDA 지원, VRAM 8GB 이상 권장, 11GB+ 권장)
- **저장공간**: COLMAP + 3D GS 저장소 및 학습 결과용 여유 공간 10GB 이상

### 1.2 소프트웨어

- **Windows**: CUDA 11.x/12.x, cuDNN, Visual Studio Build Tools (CUDA 확장 빌드용)
- **Linux / WSL2** (권장): 3D Gaussian Splatting 공식 빌드가 Linux 기준이라 WSL2에서 진행하는 것을 권장합니다.

### 1.3 확인 명령

```bash
# CUDA 버전 확인 (Windows: nvidia-smi)
nvidia-smi

# Python 3.8~3.10 권장
python --version
```

---

## 2. 데이터 준비

### 2.1 전차 이미지 촬영/수집

- **장수**: 한 장면(한 전차, 한 포신 각도)당 **최소 20~50장**, 여유 있으면 50~100장
- **조건**:
  - 동일 전차, **정지 상태** (포신 0°로 레퍼런스용 촬영 시 고정)
  - 서로 다른 시점에서 촬영 (앞/옆/위 등 겹치는 부분 있게)
  - 조명 일정, 블러·반사 최소화
- **포맷**: JPG 또는 PNG

### 2.2 폴더 구조 (COLMAP / 3D GS 입력)

프로젝트 루트에 다음처럼 만듭니다.

```
hanhwa_final/
  data/
    tank_scene_0deg/          # 레퍼런스용 (포신 0°)
      images/                 # 여기에 전차 이미지 모두 넣기
        IMG_001.jpg
        IMG_002.jpg
        ...
```

- `tank_scene_0deg`: 장면 이름(예: 포신 0° 전차). 나중에 다른 앙각은 `tank_scene_5deg` 등으로 추가 가능.
- **images** 폴더에 해당 장면 이미지만 넣습니다. COLMAP이 이 폴더를 입력으로 사용합니다.

---

## 3. COLMAP 설치 및 카메라 포즈 생성

3D Gaussian Splatting은 **COLMAP**이 만든 카메라 파라미터와 스파스 포인트클라우드를 입력으로 사용합니다.

### 3.1 COLMAP 설치

**Windows**

1. [COLMAP 다운로드](https://colmap.github.io/)에서 Windows 빌드 받기 (또는 `colmap.bat` 포함 버전).
2. 압축 해제 후 `COLMAP.bat` 또는 `colmap.exe`가 있는 경로를 `PATH`에 추가.

**WSL2 / Ubuntu**

```bash
sudo apt-get update
sudo apt-get install -y colmap
colmap -h   # 설치 확인
```

**GUI 없이 사용 (서버/헤드리스)**

- COLMAP 커맨드라인: `colmap feature_extractor`, `colmap exhaustive_matcher`, `colmap mapper` 사용 (아래 스크립트 참고).

### 3.2 COLMAP 실행 (커맨드라인)

데이터 경로를 `DATA_ROOT`로 두고, `images`가 있는 폴더를 `SCENE`으로 지정합니다.

```bash
# 예: DATA_ROOT = C:\Users\taehu\Desktop\projects\hanhwa_final\data
#     SCENE   = tank_scene_0deg

export SCENE=tank_scene_0deg
export DATA_ROOT=/path/to/hanhwa_final/data   # 실제 경로로 변경

mkdir -p $DATA_ROOT/$SCENE/sparse/0
colmap feature_extractor \
  --database_path $DATA_ROOT/$SCENE/database.db \
  --image_path $DATA_ROOT/$SCENE/images

colmap exhaustive_matcher \
  --database_path $DATA_ROOT/$SCENE/database.db

colmap mapper \
  --database_path $DATA_ROOT/$SCENE/database.db \
  --image_path $DATA_ROOT/$SCENE/images \
  --output_path $DATA_ROOT/$SCENE/sparse
```

**Windows (PowerShell) 예시**

```powershell
$DATA_ROOT = "C:\Users\taehu\Desktop\projects\hanhwa_final\data"
$SCENE = "tank_scene_0deg"
New-Item -ItemType Directory -Force -Path "$DATA_ROOT\$SCENE\sparse\0"
colmap feature_extractor --database_path "$DATA_ROOT\$SCENE\database.db" --image_path "$DATA_ROOT\$SCENE\images"
colmap exhaustive_matcher --database_path "$DATA_ROOT\$SCENE\database.db"
colmap mapper --database_path "$DATA_ROOT\$SCENE\database.db" --image_path "$DATA_ROOT\$SCENE\images" --output_path "$DATA_ROOT\$SCENE\sparse"
```

실행 후 다음 구조가 생깁니다.

```
tank_scene_0deg/
  images/
  database.db
  sparse/
    0/
      cameras.bin (또는 cameras.txt)
      images.bin (또는 images.txt)
      points3D.bin (또는 points3D.txt)
```

**3D Gaussian Splatting 입력**: `-s`에는 **images/** 와 **sparse/** 가 있는 폴더 경로를 넘깁니다. 즉 `data/tank_scene_0deg` 를 넘기면 되고, 내부에 `images/`와 `sparse/0/`(또는 `sparse/`)가 있으면 됩니다. 공식 코드는 보통 `sparse/0`을 참조합니다.

- **points3D가 비어 있거나** 이미지 매칭이 거의 안 되면: 이미지 수를 늘리거나, 특징이 잘 보이도록 촬영/선별합니다.
- **Binaries**를 쓰면 COLMAP이 `.bin`으로 저장합니다. 3D GS는 보통 **텍스트**를 요구하므로, 변환이 필요할 수 있습니다 (아래 4.2 참고).

### 3.3 COLMAP 결과를 텍스트로 변환 (필요 시)

일부 3D GS 스크립트는 `cameras.txt`, `images.txt`, `points3D.txt`를 요구합니다.

```bash
colmap model_converter \
  --input_path $DATA_ROOT/$SCENE/sparse/0 \
  --output_path $DATA_ROOT/$SCENE/sparse/0 \
  --output_type TXT
```

---

## 4. 3D Gaussian Splatting 저장소 클론 및 환경 구축

공식 저장소: [graphdeco-inria/gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting)

### 4.1 저장소 클론 (서브모듈 포함)

```bash
cd C:\Users\taehu\Desktop\projects\hanhwa_final   # 또는 원하는 상위 경로
git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git
cd gaussian-splatting
```

- `--recursive`로 `submodules/diff-gaussian-rasterization`, `submodules/simple-knn` 등이 함께 받아져야 합니다.

### 4.2 가상환경 및 Python 패키지

```bash
# 가상환경 (선택이지만 권장)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/WSL:
# source venv/bin/activate

pip install torch torchvision
pip install plyfile
pip install tqdm
```

### 4.3 CUDA 확장 빌드 (diff-gaussian-rasterization, simple-knn)

**Linux / WSL2**

```bash
# diff-gaussian-rasterization
cd submodules/diff-gaussian-rasterization
pip install .
cd ../..

# simple-knn
cd submodules/simple-knn
pip install .
cd ../..
```

**Windows**

- Visual Studio에서 **C++** 및 **CUDA** 빌드 도구가 설치되어 있어야 합니다.
- 각 서브모듈 폴더에서 `pip install .` 시 CUDA 버전이 맞는지 확인합니다 (예: PyTorch CUDA 11.8이면 동일 버전 사용).

```powershell
cd submodules\diff-gaussian-rasterization
pip install .
cd ..\..
cd submodules\simple-knn
pip install .
cd ..\..
```

빌드 실패 시: [gaussian-splatting 이슈](https://github.com/graphdeco-inria/gaussian-splatting/issues)에서 Windows 빌드 관련 이슈를 참고하세요.

---

## 5. 학습 실행

### 5.1 학습 스크립트 위치

- 공식 저장소에는 보통 `train.py` 또는 `scripts/train.py` 형태로 학습 스크립트가 있습니다.
- **입력**: COLMAP 결과가 있는 장면 폴더 경로 (상위까지 지정하는 경우가 많음).

### 5.2 학습 명령 예시

**Linux/WSL (bash)**

```bash
export DATA_ROOT=/path/to/hanhwa_final/data
export SCENE=tank_scene_0deg

# COLMAP 결과가 data/tank_scene_0deg 아래에 있다고 가정
python train.py -s $DATA_ROOT/$SCENE
```

**Windows (PowerShell)**

```powershell
$DATA_ROOT = "C:\Users\taehu\Desktop\projects\hanhwa_final\data"
$SCENE = "tank_scene_0deg"
python train.py -s "$DATA_ROOT\$SCENE"
```

- `-s` (source): COLMAP 이미지 폴더와 `sparse/0`(또는 `sparse/0/`)이 있는 경로.
- 공식 코드에 따라 **이미지 폴더 이름**이 `images`가 아니거나 **sparse**가 다른 번호(예: `sparse/0`)일 수 있으므로, 저장소 README의 "Data" 섹션을 반드시 확인하세요.

### 5.3 학습 옵션 (저장소별로 다름)

- **반복 수**: 예시 7,000~30,000 iterations (논문: 7K면 약 5~10분, 30K면 30~50분)
- **체크포인트 저장**: 보통 `output/<scene_name>/` 또는 `train/ours_<scene>/` 아래에 `point_cloud/iteration_7000/point_cloud.ply` 형태로 저장됩니다.

예시 (옵션이 있다면):

```bash
python train.py -s $DATA_ROOT/$SCENE -m output/tank_0deg --iterations 30000
```

- 학습이 끝나면 **point_cloud.ply** (및 기타 파라미터)가 생성됩니다. 이 파일이 학습된 3D 가우시안 모델입니다.

### 5.4 학습 결과 확인

- **뷰어**: 공식 저장소에 포함된 뷰어가 있다면 사용 (예: SIBR 뷰어, 또는 `viewer.py` 등).
- **렌더링**: `render.py`로 특정 카메라 경로에서 렌더링해 품질을 확인할 수 있습니다.

```bash
python render.py -m output/tank_0deg
```

---

## 6. 학습된 모델로 할 수 있는 것 (전차 프로젝트 연동)

- **포신 축 추출**: `point_cloud.ply` 또는 내부 파라미터에서 포신 영역 가우시안을 골라, 주축(또는 직선 피팅)으로 **ref_barrel_direction** 계산 (커리큘럼 Phase 0.4).
- **렌더링**: 새 시점에서 이미지를 렌더해 포신 각도 회귀용 학습 데이터로 사용 (Phase 1.1).
- **추론 서버**: 학습된 3D GS 결과(PLY 또는 로드 가능한 형식)를 `ai-inference`에서 읽어, 포신 각도 추정·지도 표시 등에 사용 (추후 구현).

---

## 7. 기존 ai-inference 서버 실행 (YOLO + API)

3D GS와 별개로, 현재 **전차 검출(YOLO)** 및 **이미지/영상 추론 API**는 아래처럼 실행합니다.

### 7.1 환경

```bash
cd C:\Users\taehu\Desktop\projects\hanhwa_final\ai-inference
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

- `requirements.txt`에 `mast3r` 등이 포함되어 있으면, 3D GS 전환 후에는 해당 의존성 제거 가능 (커리큘럼 참고).

### 7.2 YOLO 가중치 (선택)

- 기본: `yolov8n.pt` (COCO 사전학습).
- 전차 전용으로 쓰려면 `main.py` 상단 `MODEL_PATH`를 학습한 전차 모델로 변경 (예: `weights/tank_best.pt`).

### 7.3 서버 기동

```bash
cd ai-inference
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- 브라우저: `http://localhost:8000/docs` 에서 Swagger UI로 API 테스트 가능.

### 7.4 주요 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 확인 |
| POST | `/infer/image` | 이미지 업로드 → 전차 검출 결과 + 어노테이션 이미지 (base64) |
| POST | `/infer/video` | 영상 업로드 → 프레임별 검출 요약 |

- **3D 복원** (`/infer/reconstruct-3d`, `/infer/reconstruct-3d-multi`)은 3D GS 전환 시 제거/비활성화하고, 3D GS 학습 결과를 별도 로드하는 방식으로 연동할 수 있습니다.

---

## 8. 한 번에 실행하는 스크립트 예시 (WSL/Linux)

데이터 경로와 장면 이름만 바꿔서 COLMAP + 학습까지 한 번에 돌리고 싶다면, 프로젝트 루트에 아래처럼 스크립트를 둘 수 있습니다.

```bash
#!/bin/bash
# run_colmap_and_train.sh
set -e
DATA_ROOT="$(dirname "$0")/data"
SCENE="tank_scene_0deg"
GS_ROOT="$(dirname "$0")/gaussian-splatting"

echo "=== 1. COLMAP ==="
mkdir -p "$DATA_ROOT/$SCENE/sparse/0"
colmap feature_extractor --database_path "$DATA_ROOT/$SCENE/database.db" --image_path "$DATA_ROOT/$SCENE/images"
colmap exhaustive_matcher --database_path "$DATA_ROOT/$SCENE/database.db"
colmap mapper        --database_path "$DATA_ROOT/$SCENE/database.db" --image_path "$DATA_ROOT/$SCENE/images" --output_path "$DATA_ROOT/$SCENE/sparse"
colmap model_converter --input_path "$DATA_ROOT/$SCENE/sparse/0" --output_path "$DATA_ROOT/$SCENE/sparse/0" --output_type TXT

echo "=== 2. 3D Gaussian Splatting Training ==="
cd "$GS_ROOT"
python train.py -s "$DATA_ROOT/$SCENE"
echo "Done. Check output in $GS_ROOT/output or similar."
```

실행:

```bash
chmod +x run_colmap_and_train.sh
./run_colmap_and_train.sh
```

### Windows용 배치 예시 (run_ai_inference.bat)

ai-inference 서버만 빠르게 띄울 때:

```batch
@echo off
cd /d "%~dp0ai-inference"
if not exist venv (
  python -m venv venv
  call venv\Scripts\activate.bat
  pip install -r requirements.txt
) else (
  call venv\Scripts\activate.bat
)
uvicorn main:app --host 0.0.0.0 --port 8000
pause
```

- 프로젝트 루트에서 `run_ai_inference.bat` 로 더블클릭 또는 `.\run_ai_inference.bat` 실행.

---

## 9. 문제 해결 요약

| 현상 | 대응 |
|------|------|
| COLMAP에서 points3D가 비어 있음 | 이미지 수 늘리기, 서로 겹치는 시점 확보, 특징이 많은 배경/전차 각도 촬영 |
| 3D GS 빌드 시 CUDA 오류 | PyTorch와 동일한 CUDA 버전 사용, Visual Studio Build Tools(C++) 설치 |
| 학습 중 GPU 메모리 부족 | 배치 크기/해상도 줄이기, 이미지 해상도 낮추기 |
| `sparse/0`가 비어 있음 | COLMAP mapper 단계 실패 → 이미지 품질·개수·매칭 옵션 확인 |

---

## 10. 요약 체크리스트

- [ ] 전차 이미지 20~50장 이상 준비, `data/<장면명>/images/`에 배치
- [ ] COLMAP 설치 후 `feature_extractor` → `exhaustive_matcher` → `mapper` 실행
- [ ] 필요 시 `model_converter`로 TXT 변환
- [ ] gaussian-splatting 저장소 클론 (`--recursive`), venv 및 CUDA 확장 빌드
- [ ] `train.py -s <COLMAP 장면 경로>` 로 학습
- [ ] `point_cloud.ply` 등 결과로 포신 축 추출·추론 서버 연동 (커리큘럼 Phase 0.4, 1, 2 참고)
- [ ] 기존 전차 검출/API는 `ai-inference`에서 `uvicorn main:app` 로 실행

이 가이드와 `docs/CURRICULUM_cannon_angle_and_map.md`를 함께 보면, 학습부터 포신 각도·지도 표시까지의 전체 흐름을 구현할 수 있습니다.
