# 세션 로그 — 3D 전차 모델 학습 (Colab)

이 문서는 Colab 3D Gaussian Splatting 학습 노트북 개발 및 문제 해결 과정을 정리한 것입니다.

---

## 1. Phase 1 포신 각도 예측 가이드

- **문서**: `docs/3D_모델링_포신_각도_예측_2.md`
- **내용**: Part 1(3D GS 모델) 이후 Phase 1(포신 각도 추정) 구현 가이드
- 접근 A(이미지 회귀), 접근 B(3D 대조), 하이브리드 방식
- scene 폴더명 → 앙각 라벨 매핑, 데이터셋 구성 방법

---

## 2. Colab 노트북 생성

- **파일**: `notebooks/colab_3d_tank_training.ipynb`
- **흐름**:
  1. Drive 마운트 & 전차데이터 압축 해제
  2. 각도별 scene 생성 (18개)
  3. 전차별 scene 병합 (6개)
  4. (선택) 이미지 서브샘플링
  5. COLMAP + Vocab Tree + 3D GS 설치
  6. 전차별 COLMAP → 3D GS 학습
  7. 결과 Drive 저장

---

## 3. Colab 런타임 설정

### 3.1 GPU 선택

| GPU | 추천 | 비고 |
|-----|------|------|
| T4 | ⭐⭐⭐ | 무료 Colab 기본, 16GB VRAM |
| L4 | ⭐⭐⭐ | Pro/Pro+ |
| A100 | ⭐⭐ | Pro+ |
| H100 | ⭐ | 과한 사양 |

### 3.2 Machine Shape

- **Standard**: 일반적인 3D GS 학습에 충분
- **High-RAM**: 대량 이미지(1만 장+) 처리 시 권장

---

## 4. 데이터 경로 문제 해결

### 4.1 FileNotFoundError: `3. 라벨링`

- **원인**: 압축 해제 실패 또는 zip 경로 불일치
- **조치**:
  - zip 후보 경로 추가: `Shareddrives/최종_데이터`, `MyDrive/데이터 분석과정/한화_최종프로젝트/최종_데이터`, `MyDrive/hanhwa_final`
  - 라벨링 루트 자동 탐색: `전차데이터/3. 라벨링`, `전차데이터/전차데이터/3. 라벨링`

### 4.2 이미 압축 해제된 경우

- `3. 라벨링` 폴더 존재 시 unzip 건너뜀
- "✓ 이미 압축 해제됨" 메시지 출력

### 4.3 실제 데이터 구조 반영

- **문서**: `docs/DATA_STRUCTURE.md`
- **구조**: `tank/라벨링/pose/서브폴더(0도,45도 등)/*.jpg`
- **수정**: `prepare_3d_scenes.py` — 서브폴더 내 동일 파일명 충돌 방지 (`{서브폴더}_{파일명}`)

---

## 5. COLMAP 메모리 문제 (SIGABRT)

### 5.1 원인

- 전차당 1만~1.6만 장 이미지
- `exhaustive_matcher`는 O(n²) — 1만 장 이상 시 메모리 부족

### 5.2 서브샘플링 (선택)

- **셀 3.5**: `USE_SUBSAMPLING = False` (기본: 전체 데이터)
- `True`로 변경 시 전차당 80장만 사용 (빠른 테스트용)

### 5.3 vocab_tree_matcher

- 1만 장 이상: `exhaustive_matcher` → `vocab_tree_matcher`
- Vocab tree: `vocab_tree_flickr100K_words1M.bin` (1만~10만 장용)
- URL: `https://github.com/colmap/colmap/releases/download/3.11.1/vocab_tree_flickr100K_words1M.bin`

---

## 6. COLMAP exit code 1

### 6.1 오류 캡처

- `subprocess.run(..., capture_output=True, text=True)`
- 실패 시 `result.stderr` 출력 (최대 2000자)

### 6.2 Colab apt COLMAP 3.7 미지원 옵션

**제거한 옵션** (COLMAP 4.x 전용):

- `--FeatureExtraction.max_image_size`
- `--SiftExtraction.max_num_features`
- `--FeatureExtraction.use_gpu`

**현재 사용**:

```bash
colmap feature_extractor --database_path ... --image_path ...
```

---

## 7. Colab 런타임 끊김

### 7.1 "Server Colab GPU T4 has been removed"

- **원인**: 비활성 시간 초과 (무료 Colab 약 90분~2시간)
- **조치**: 런타임 → 런타임 유형 변경 → GPU 재선택
- **재실행**: 1번(Drive 마운트)부터. 데이터는 `/content/data/tanks`에 유지되면 압축 해제 셀은 건너뜀

---

## 8. Colab Headless 오류 해결 (Qt/OpenGL)

### 8.1 Qt xcb 오류
- **원인**: Colab에 디스플레이 없음
- **조치**: `QT_QPA_PLATFORM=offscreen`, `XDG_RUNTIME_DIR=/tmp/runtime-root`

### 8.2 OpenGL context_.create() 실패
- **원인**: COLMAP SiftGPU가 OpenGL 컨텍스트 필요
- **조치**: `--SiftExtraction.use_gpu 0`, `--SiftMatching.use_gpu 0` (CPU 모드)

### 8.3 빠른 검증 모드 (QUICK_TEST)
- `QUICK_TEST=True`: tiger만 80장, ~10~20분
- `QUICK_TEST=False`: 전체 6개 전차

---

## 9. 현재 노트북 상태 요약

| 항목 | 설정 |
|------|------|
| 데이터 | QUICK_TEST 시 tiger 80장, 아니면 전체 (85,226장) |
| COLMAP | `vocab_tree_matcher`, CPU 모드 (use_gpu 0) |
| Headless | QT_QPA_PLATFORM=offscreen, XDG_RUNTIME_DIR |
| 오류 처리 | 각 단계별 stderr 출력, sparse/0 검증 |

---

## 10. 관련 문서

| 문서 | 내용 |
|------|------|
| `CONVERSATION_SUMMARY.md` | 프로젝트 전체 요약 |
| `DATA_STRUCTURE.md` | 전차데이터 폴더 구조 |
| `3D_모델링_포신_각도_예측_2.md` | Phase 1 구현 가이드 |
| `COLAB_TRAIN_BY_TANK.md` | Colab 학습 코드 (마크다운) |
