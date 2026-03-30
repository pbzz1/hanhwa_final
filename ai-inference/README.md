# AI Inference (YOLO) Server

FastAPI 기반 YOLO 추론 서버입니다. NestJS 백엔드가 이 서버를 호출합니다.

## 1) 설치

```bash
cd ai-inference
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### MASt3R 코드/체크포인트 준비

```bash
cd ai-inference
git clone --recursive https://github.com/naver/mast3r.git mast3r
mkdir checkpoints
```

체크포인트 파일을 아래 경로에 둡니다.

```text
ai-inference/checkpoints/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth
```

공식 체크포인트: [MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth](https://download.europe.naverlabs.com/ComputerVision/MASt3R/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth)

## 2) 실행

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## 3) 모델 경로 설정

`main.py`의 `MODEL_PATH`를 실제 가중치 파일로 교체하세요.

- 예: `weights/tank_best.pt`

## 4) NestJS 연동 환경변수

`backend/.env`에 아래 값을 추가하세요.

```env
AI_INFERENCE_URL=http://localhost:8001
```

## 5) 엔드포인트

- `GET /health`
- `POST /infer/image` (multipart: `file`)
- `POST /infer/video` (multipart: `file`)
- `POST /infer/reconstruct-3d` (multipart: `fileA`, `fileB`)
- `POST /infer/reconstruct-3d-multi` (multipart: `files` x N)
- `POST /infer/vod/radar-fusion` — VoD **레이더 N×7 `.bin`** (필수) + **카메라 `.jpg`** (선택, YOLO) + **LiDAR `.bin`** (선택, 클러스터 주변 점 수 검증). 레이더는 DBSCAN 기하 클러스터, 학습 가중치 없음. 환경변수 `VOD_RADAR_DBSCAN_EPS`, `VOD_RADAR_DBSCAN_MIN_SAMPLES`로 튜닝 가능.

Nest 프록시: `POST /ai/vod/radar-fusion` (JWT), 필드명 `radar`, `image`, `lidar`.

## 6) MASt3R 멀티뷰 3D 복원 설정

기본적으로 아래 경로를 사용합니다(환경변수 없이 동작):

- MASt3R 코드: `ai-inference/mast3r`
- 체크포인트: `ai-inference/checkpoints/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth`

즉, 모델 파일은 아래 경로에 두면 됩니다.

```text
ai-inference/checkpoints/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth
```

경로를 바꾸고 싶을 때만 환경변수를 설정하세요.

```env
MAST3R_BASE_DIR=/path/to/mast3r-repo
MAST3R_CKPT_PATH=/path/to/MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth
MAST3R_CONF_THRESH=2.0
MAST3R_MAX_POINTS=12000
```
