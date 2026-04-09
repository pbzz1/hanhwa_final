# 지도용 드론 영상 예시

- **`sar-aoi-yolo-ships.png`** — SAR 광역 페이지 「집중 감시 구역」 예시: AOI 슬라이스 위 선박 검출(박스·신뢰도).
- **`yolo-tank-1.mp4`** — KakaoTalk에서보낸 YOLO 전차 인식 클립. 시드 `InfiltrationPoint.droneVideoUrl`, 시뮬 좌측 UAV 영상, UAV SAR 데모.
- **`yolo-tank-2.mp4`** — YOLO 전차 인식(2). 시뮬 우측 「YOLO 기반 전차 판별」, 드론 EO/IR 식별 페이지 데모.
- **`yolo-tank-3.mp4`** — YOLO 전차 인식(3). 시드 아군 유닛 `situationVideoUrl`, 센서 파이프라인 4단계(드론) 데모.
- **`demo-drone-map.mp4`** — 이전 드론 맵 샘플(레거시). 필요 시 참고용으로 유지.
- Vite는 `public/`을 사이트 루트로 제공하므로 DB·코드에는 **`/media/...`** 경로만 쓰면 됩니다.
- 파일을 바꿀 때는 같은 이름으로 교체하거나, DB·시드의 URL 문자열만 새 경로로 맞추면 됩니다.
