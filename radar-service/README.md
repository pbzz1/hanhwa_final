# FMCW 레이더 단독 서비스 (`radar-service`)

VoD 형식 레이더 `.bin`(N×7 float32)을 입력으로 **탐지 → 추적 → 단기 궤적 예측 → 위험도 → danger corridor → WebPayload JSON**까지 한 번에 처리합니다. **LiDAR 검증은 운용 파이프라인에 포함하지 않습니다.**

## 디렉터리

- `app/` — 처리 모듈 (`pipeline.py`가 엔드투엔드 연결)
- `notebooks/radar_demo.ipynb` — 모듈 `import`만 하는 얇은 데모
- `outputs/web_payload.json` — 예시 출력(생성 스크립트는 아래 참고)

## 설치

```bash
cd radar-service
pip install -r requirements.txt
```

## 한 프레임 CLI 예시

프로젝트 루트에서 `radar-service`를 작업 디렉터리로 두고:

```bash
python -c "
from pathlib import Path
from app.radar_loader import load_vod_radar_bin
from app.pipeline import run_pipeline_frame
from app.export_json import save_web_payload

radar = load_vod_radar_bin(Path(r'경로/당신의_radar.bin'))
payload, _ = run_pipeline_frame(radar, frame_id='0', radar_frame_mode='radar')
save_web_payload(Path('outputs/web_payload.json'), payload)
print(payload.model_dump_json(indent=2)[:800], '...')
"
```

## `radar_3frames` / `radar_5frames` 스택

같은 시퀀스의 연속 파일 경로를 넘기면 시간 열에 프레임 간격(`frame_dt_s`, 기본 `config`의 `frame_dt_s`와 맞출 것)을 더해 한 배열로 합칩니다.

```python
from pathlib import Path
from app.radar_loader import load_radar_frame_stack
from app.pipeline import run_pipeline_frame
from app.export_json import save_web_payload

paths = [Path(f"seq/{i:06d}.bin") for i in range(3)]
radar, mode = load_radar_frame_stack(paths, frame_dt_s=0.077)
payload, _ = run_pipeline_frame(radar, frame_id="tick-42", radar_frame_mode=mode)
save_web_payload(Path("outputs/web_payload.json"), payload)
```

## FastAPI

```bash
cd radar-service
uvicorn app.main:app --reload --port 8090
```

저장소 루트에서 `npm run dev:all`을 쓰면 백엔드·프론트·`ai-inference`(8001)와 함께 **동일 포트(8090)** 로 자동 기동됩니다(`scripts/run-radar-service.mjs`).

- `GET /health` — 상태
- `POST /v1/radar/process` — multipart `file` = 단일 `.bin`, 쿼리 `frame_id`, `reset_tracks`, `save_output`
- `POST /v1/radar/process_path` — JSON `{"path": "...", "frame_id": "0", "reset_tracks": false}` (서버가 파일에 접근 가능할 때)
- `POST /v1/radar/process_paths_stacked` — JSON `{"paths": ["a.bin","b.bin","c.bin"], "frame_dt_s": 0.077}`
- `GET /v1/demo/payload` — 합성 데이터 예시 JSON

## 전체 흐름

1. `radar_loader` — 바이너리 → `(N,7)`
2. `preprocess` — 유효 점·거리 게이트
3. `clustering` — DBSCAN
4. `candidate_scoring` — 후보 점수·저신뢰 제거 (`candidate_confidence`)
5. `tracker` — Kalman CV + 헝가리안 (`track_confidence`는 페이로드에서 별도 필드)
6. `predictor` — 1s / 2s / 3s horizon
7. `risk` — 거리·접근·방향·안정도·신뢰도
8. `danger_zone` — 예측 폴리라인 버퍼 코리도
9. `export_json` — `WebPayload` 스키마

환경 변수로 DBSCAN·게이트·버퍼 등을 조정할 수 있습니다(`app/config.py` 참고).

## 객체 표기

기본 라벨은 **`unknown_target`**(또는 스키마상 `target`). 레이더만으로 클래스를 단정하지 않으며, 필요 시 API에서 `class_hint`를 확장할 수 있습니다.
