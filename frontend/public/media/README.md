# 정적 미디어 (`public/media`)

Vite는 `public/`을 사이트 루트로 제공하므로 코드·DB에는 **`/media/...`** 경로만 사용하면 됩니다.

## 폴더 구분

| 폴더 | 용도 |
|------|------|
| **`sar/`** | SAR·GRD 예시 이미지, 스포트라이트 결과 PNG 등 |
| **`uav/`** | UAV·EO/IR 데모용 YOLO 전차 클립(`yolo-tank-*.mp4`), 적 UAV 참조 이미지 |
| **`drone/`** | 드론 실시간/시야 영상 클립. `App.tsx`의 `DRONE_ASSET_STREAM_FALLBACK_VIDEO_URLS` 순서대로 자산 목록에 매핑 |
| **(루트)** | 로그인·UI 공용 등 센서 비특화 자산 (`login-hero-satellite.png`, `unit-symbol-legend.png`) |

## 주요 파일

- **`sar/sar-grd-example.png`**, **`sar/sar-aoi-yolo-ships.png`**, **`sar/sar-grd-visualization.png`**, **`sar/sar-grd-peninsula-overlay.png`**, **`sar/sar-spotlight-result.png`** — SAR 관련 화면·모달
- **`uav/yolo-tank-1.mp4`** — UAV SAR 데모, 침투 시드 영상, 집결 영상 등
- **`uav/yolo-tank-2.mp4`** — UAV MVP mock EO/IR, 전술 영상 매핑 등
- **`uav/yolo-tank-3.mp4`** — 드론 MVP mock(근접 정찰 루프), 센서 파이프라인 4단계 데모 등
- **`uav/enemy-uav-target-reference.png`** — 적 UAV 출동 UI 참조
- **`drone/china-type99.mp4`**, **`drone/demo-drone-map.mp4`**, **`drone/north_korea-M2020-천마2호.mp4`** — `소형무인정찰 N소대`는 항상 `(N-1) % 3`번째 클립 고정(`App.tsx`의 `droneFixedMediaVideoPath`·`DRONE_ASSET_STREAM_FALLBACK_VIDEO_URLS` 순서)

파일을 바꿀 때는 동일 파일명으로 교체하거나, 상수/시드의 URL 문자열만 새 경로에 맞추면 됩니다.
