# 프로젝트 데이터 목록 (VoD 포함)

저장소·백엔드/프론트 코드 기준으로 **현재 프로젝트에 연결된 데이터 종류**를 정리한 문서입니다.  
VoD는 **공식 JSON 메타데이터**와 **KITTI형 센서·라벨 폴더** 두 갈래로 사용됩니다.

---

## 1. 애플리케이션 DB (MySQL · Prisma)

| 데이터(테이블) | 행 수(의미) | 주요 컬럼(필드) |
|----------------|------------|-----------------|
| **User** | 시드 기준 2명 등 | `id`, `email`, `passwordHash`, `name`, `createdAt`, `updatedAt` |
| **Media** | 업로드 시 증가 | `id`, `type`(IMAGE/VIDEO), `originalName`, `mimeType`, `size`, `uploaderId`, `createdAt` |
| **InferenceResult** | 추론 호출 시 증가 | `id`, `mediaId`, `model`, `task`, `detections`(Json), `rawResponse`(Json), `errorMessage`, `createdAt` |
| **Unit** (아군) | 시드 기준 여러 행 | `id`, `name`, `level`, `branch`, `lat`, `lng`, `personnel`, `equipment`, `readiness`, `mission`, `symbolType`, `locationStatus`, `strengthModifier`, `situationVideoUrl`, `createdAt`, `updatedAt` |
| **InfiltrationPoint** (적 침투점) | 시드 기준 여러 행 | `id`, `codename`, `lat`, `lng`, `threatLevel`, `estimatedCount`, `observedAt`, `riskRadiusMeter`, `droneVideoUrl`, `enemySymbol`, `enemyBranch`, `createdAt`, `updatedAt` |

### Prisma 열거형

- `MediaType`, `UnitLevel`, `Readiness`, `TacticalSymbol`, `TacticalLocationStatus`, `StrengthModifier`, `ThreatLevel`, `EnemyTacticalSymbol`

스키마 원본: `backend/prisma/schema.prisma`

---

## 2. VoD 공식 메타데이터 JSON

경로: `vod-devkit/vod-received/vod_official/`  
NuScenes 스타일 **테이블 파일** — **v1.0-test** / **v1.0-trainval** 두 세트.  
아래 “행 수”는 각 JSON **배열 길이**입니다.

| 파일명 | v1.0-test 행 수 | v1.0-trainval 행 수 | 컬럼(키) |
|--------|-----------------|----------------------|----------|
| **scene.json** | 7 | 16 | `token`, `name`, `description`, `log_token`, `nbr_samples`, `first_sample_token`, `last_sample_token` |
| **sample.json** | 2,264 | 6,296 | `token`, `timestamp`, `frame`, `scene_token`, `prev`, `next` |
| **sample_data.json** | 2,264 | 6,296 | `token`, `sample_token`, `ego_pose_token`, `calibrated_sensor_token`, `filename`, `fileformat`, `width`, `height`, `timestamp`, `is_key_frame`, `prev`, `next` |
| **ego_pose.json** | 2,264 | 6,296 | `token`, `translation`, `rotation`, `timestamp` |
| **sample_annotation.json** | 30,695 | 88,164 | `token`, `sample_token`, `instance_token`, `attribute_tokens`, `visibility_token`, `translation`, `rotation`, `size`, `prev`, `next` |
| **instance.json** | 429 | 1,233 | `token`, `category_token`, `tracking_id`, `nbr_annotations`, `first_annotation_token`, `last_annotation_token` |
| **category.json** | 19 | 19 | `token`, `name`, `description`, `dynamic_flag` |
| **attribute.json** | 1 | 1 | `token`, `name`, `description` |
| **sensor.json** | 1 | 1 | `token`, `channel`, `modality` |
| **calibrated_sensor.json** | 1 | 1 | `token`, `sensor_token`, `translation`, `rotation`, `camera_intrinsic` |
| **log.json** | 1 | 1 | `token`, `date_captured`, `location` |
| **prediction_scenes.json** | 객체 1개 (씬 토큰별) | 객체 16개 | 최상위 키가 **scene token**인 객체 (배열 아님) |

참고: 이 경로에는 `visibility.json`이 없을 수 있으나, `sample_annotation`에 `visibility_token` 필드는 존재합니다.

---

## 3. VoD 센서·라벨 (KITTI형 트리 — 백엔드·AI가 읽는 경로)

환경변수 `VOD_DATASET_ROOT` 또는 기본 추정 경로:  
`vod-devkit/vod-received/view_of_delft_PUBLIC` (`backend/src/ai/vod-dataset.util.ts`).

| 데이터 종류 | 형식 / 위치(상대) | 필드·의미 |
|-------------|-------------------|-----------|
| **레이더 스캔** | `radar/training/velodyne/{frameId}.bin` | 포인트당 **7차원**: x, y, z, RCS, v_r, v_r_compensated, time (`vod-devkit/vod/frame/data_loader.py`) |
| **카메라** | `lidar/training/image_2/{frameId}.jpg` | RGB 이미지 |
| **LiDAR** | `lidar/training/velodyne/{frameId}.bin` | N×4: x, y, z, reflectance |
| **프레임 동기 목록** | `image_2`와 `radar/.../velodyne` 파일명 stem 교집합 | 문자열 `frameId` 목록 (정렬) |
| **레이더 학습 라벨(JSON)** | `radar/training/label_2/{frameId}.json` | 배열 요소: `className`, `geometry.center` {x,y,z}, `geometry.quaternion`, `geometry.size` {length,width,height} 등 (`backend/src/map/vod-label-enrichment.ts`) |

KITTI 텍스트 라벨(`label_2/*.txt`) 파싱 시 (`vod-devkit/vod/frame/labels.py`):  
`label_class`, `h`, `w`, `l`, `x`, `y`, `z`, `rotation`, `score` 등.

---

## 4. 웹/API 합성·전달용 데이터 (별도 DB 파일 아님)

| 이름 | 용도 | 비고 |
|------|------|------|
| **레이더 스냅샷 DTO** | 지도·패널용 모의/병합 응답 | `backend/src/map/radar-snapshot.ts` — `RadarSiteDto`, `PulseDetectionDto`, `RadarDetectionDto`, `FmcwTrackDto`, `VodProvenanceDto`, `VodMatchedTargetDto`, `VodRiskZoneDto`, `RadarInsightsDto` 등 |
| **시나리오 상수** | 지도 바운드·SAR 구역·침공 목표 등 | `frontend/src/scenarioBattalion.ts` — `BATTALION_SCENARIO`, `SCENARIO_RANGES_KM` |

---

## 5. 개수 요약

| 구분 | 개수 |
|------|------|
| Prisma **모델(테이블)** | 5 (`User`, `Media`, `InferenceResult`, `Unit`, `InfiltrationPoint`) |
| VoD 공식 JSON **테이블 파일 종류** | 12 (`v1.0-test` / `v1.0-trainval` 동일 구조) |
| VoD 메타 (trainval 대표) | 샘플 6,296 / 어노테이션 88,164 / 인스턴스 1,233 / 씬 16 |
| VoD 메타 (test 대표) | 샘플 2,264 / 어노테이션 30,695 / 인스턴스 429 / 씬 7 |

로컬에 `view_of_delft_PUBLIC` 바이너리가 없으면 **섹션 3** 파일 기반 VoD는 없고 JSON 메타만 있는 상태일 수 있습니다.

---

*문서 생성 시점 기준: 저장소 내 `vod_official` JSON 집계 및 `schema.prisma`.*
