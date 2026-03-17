# 한화에어로 최종프로젝트 — 대화 요약

이 문서는 프로젝트 진행 중 논의된 내용을 시간순으로 정리한 요약입니다.

---

## 1. 프로젝트 목표 및 커리큘럼

### 1.1 목표

1. **3D 모델링 기반 포신 각도 학습**: 원본(레퍼런스) 3D 객체와 관측 영상/포인트클라우드를 대조해 **현재 포신 각도(°)** 예측
2. **포신 각도 검증**: 예측 각도의 신뢰도 및 검증
3. **지도 연동**: 포격 위치 예측 및 위험 지역 표시

### 1.2 3D Gaussian Splatting 도입

- **기존 방식 제거**: MASt3R 기반 멀티뷰 복원, ORB + triangulation 기반 2-view 복원
- **새 방식**: 3D Gaussian Splatting (Kerbl et al., SIGGRAPH 2023)
  - 입력: 다중 시점 이미지 + SfM(COLMAP) 카메라 캘리브레이션
  - 표현: 3D 가우시안 집합 (위치, 이방성 공분산, 불투명도, 구면조화)
  - 학습: 6~50분, 실시간 렌더링 가능

### 1.3 관련 문서

- `docs/CURRICULUM_cannon_angle_and_map.md` — 전체 커리큘럼
- `docs/SETUP_AND_RUN_3DGS.md` — 학습 및 실행 가이드

---

## 2. 전차 데이터 및 3D 모델 생성

### 2.1 데이터 위치

- **로컬**: `C:\Users\taehu\Desktop\projects\hanhwa_final\data\전차데이터\전차데이터\3. 라벨링`
- **Colab**: `/content/data/tanks/전차데이터` (Drive 마운트 또는 압축 해제 후)

### 2.2 전차 종류

| 전차 | 각도별 scene 예시 |
|------|-------------------|
| 90식 | 90식_45도각도_포신, 90식_90도각도_포신, 90식_정면각도-포신 |
| K1A1 | K1A1_45도각도, K1A1_90도각도, K1A1_정면각도 |
| K2 | K2_45도각도_포신, K2_90도각도_포신, K2_정면도각도_포신 |
| M1A2 | M1A2_45도각도_포신, M1A2_90도각도_포신, M1A2_정면각도_포신 |
| T-90a | T-90A_45도각도_포신, T-90A_90도각도_포신, T-90A_정면각도_포신 |
| tiger | 1촬영30도, 1촬영60도, 1촬영90도 |

### 2.3 폴더 구조 (3. 라벨링)

```
3. 라벨링/
├── 90식/
│   └── 라벨링/
│       ├── 90식_45도각도_포신/  (이미지들)
│       ├── 90식_90도각도_포신/
│       └── 90식_정면각도-포신/
├── K1A1/라벨링/...
├── K2/라벨링/...
├── M1A2/라벨링/...
├── T-90a/라벨링/...
└── tiger/라벨링/...
```

---

## 3. 스크립트 및 실행 흐름

### 3.1 prepare_3d_scenes.py

- **역할**: `3. 라벨링` → 각도별 scene (18개) 생성
- **입력**: `data/전차데이터/전차데이터/3. 라벨링`
- **출력**: `data/3d_scenes/<전차_각도>/images/`
- **결과**: 18개 scene, 총 85,226장 이미지

```bash
python scripts/prepare_3d_scenes.py
```

### 3.2 prepare_tank_merged_scenes.py

- **역할**: 18개 각도별 scene → 6개 전차별 scene 병합
- **입력**: `data/3d_scenes`
- **출력**: `data/3d_scenes_by_tank/<전차명>/images/`

```bash
python scripts/prepare_tank_merged_scenes.py
```

### 3.3 생성된 scene 위치

| 구분 | 경로 |
|------|------|
| 각도별 (18개) | `data/3d_scenes/<scene>/images/` |
| 전차별 (6개) | `data/3d_scenes_by_tank/<전차명>/images/` |

---

## 4. Colab 작업

### 4.1 Drive 마운트

```python
from google.colab import drive
drive.mount('/content/drive')
```

### 4.2 전차데이터.zip 압축 해제

- **주의**: Colab에서는 쉘 명령 앞에 `!` 필수
- **공유 문서함**: `/content/drive/Shareddrives/최종_데이터/` (MyDrive 아님)

```python
!unzip -q "/content/drive/Shareddrives/최종_데이터/전차데이터.zip" -d "/content/data/tanks"
```

### 4.3 COLMAP + 3D Gaussian Splatting 설치

```python
!sudo apt-get update -y
!sudo apt-get install -y colmap
```

```python
%cd /content
!git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git
%cd gaussian-splatting
!pip install plyfile tqdm
%cd submodules/diff-gaussian-rasterization && pip install . && cd ../simple-knn && pip install . && cd ../..
```

### 4.4 학습 실행 (전차별)

- **데이터 경로**: `/content/data/3d_scenes_by_tank`
- **출력**: `/content/gaussian-splatting/output/<전차명>/point_cloud/.../point_cloud.ply`

---

## 5. 로컬 환경 주의사항

### 5.1 PowerShell vs WSL

- `chmod`, `cd /mnt/c/...` 는 **WSL(우분투 터미널)** 전용
- PowerShell에서는 `chmod` 미지원, `/mnt/c/` 경로 인식 안 됨
- **해결**: Colab 사용 권장, 또는 WSL에서 `Ubuntu` 앱 실행 후 bash 스크립트 실행

### 5.2 Windows 경로

- 프로젝트 루트: `C:\Users\taehu\Desktop\projects\hanhwa_final`
- scene 출력: `C:\Users\taehu\Desktop\projects\hanhwa_final\data\3d_scenes`

---

## 6. YOLO 학습 (라벨링 데이터)

- 전차데이터 내 라벨링 데이터로 **YOLOv8** 학습 가능
- 구조: `images/train`, `images/val`, `labels/train`, `labels/val`
- 라벨 형식: YOLO (classID cx cy w h, 정규화)
- Colab에서 `ultralytics` 설치 후 `model.train(data='tank_dataset.yaml')` 실행

---

## 7. 3D 모델 결과물

| 단계 | 파일/경로 | 설명 |
|------|-----------|------|
| 입력 이미지 | `<scene>/images/*.jpg` | COLMAP·3D GS 입력 |
| COLMAP 결과 | `<scene>/sparse/0/cameras.txt, images.txt, points3D.txt` | 카메라 파라미터, 스파스 포인트 |
| 3D GS 결과 | `output/<scene>/point_cloud/.../point_cloud.ply` | 학습된 3D 가우시안 모델 |

---

## 8. 관련 문서 목록

| 문서 | 내용 |
|------|------|
| `docs/CURRICULUM_cannon_angle_and_map.md` | 포신 각도·지도 커리큘럼 |
| `docs/3D_모델링_포신_각도_예측_2.md` | **Phase 1** 포신 각도 추정 구현 가이드 (Part 2) |
| `docs/SETUP_AND_RUN_3DGS.md` | 3D GS 설치·학습·실행 가이드 |
| `docs/COLAB_TRAIN_BY_TANK.md` | Colab 전차별 3D GS 학습 코드 |
| `docs/DATA_STRUCTURE.md` | 실제 전차데이터 폴더 구조 |
| `docs/SESSION_LOG_3D_TRAINING.md` | Colab 3D 학습 세션 로그 (문제 해결 기록) |
| `scripts/prepare_3d_scenes.py` | 각도별 scene 생성 |
| `scripts/prepare_tank_merged_scenes.py` | 전차별 scene 병합 |
| `notebooks/colab_3d_tank_training.ipynb` | Colab 전차별 3D GS 학습 노트북 |
| `run_colmap_and_train.sh` | WSL용 COLMAP + 3D GS (단일 scene) |
| `run_ai_inference.bat` | ai-inference 서버 실행 (YOLO) |

---

## 9. 요약 체크리스트

- [ ] `prepare_3d_scenes.py` 실행 → 18개 scene 생성
- [ ] `prepare_tank_merged_scenes.py` 실행 → 6개 전차별 scene
- [ ] Colab에서 COLMAP + 3D GS 설치
- [ ] Colab에서 전차별 `train.py` 실행
- [ ] `point_cloud.ply` 다운로드 → 프로젝트 `3d_models/` 등에 저장
- [ ] (선택) 포신 축 추출, 각도 예측, 지도 연동 (커리큘럼 Phase 1~4)
