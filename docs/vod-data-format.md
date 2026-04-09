# 1. 데이터 수집 (VoD)

## 1.1 VoD 메타데이터 (NuScenes 형식)

- 본 프로젝트에서 VoD 메타는 `v1.0-trainval`, `v1.0-test` 2분할을 사용함
- 문서 가독성을 위해 표에는 `Train+Val / Test / 합계` 형태로 정리함

### 1.1.1 핵심 규모 요약

| 카테고리 | Train+Val | Test | 합계 |
|----------|----------:|-----:|-----:|
| Scene(시퀀스) | 16 | 7 | 23 |
| Sample(프레임) | 6,296 | 2,264 | 8,560 |
| 3D Annotation(Box) | 88,164 | 30,695 | 118,859 |
| Instance(추적 객체) | 1,233 | 429 | 1,662 |

### 1.1.2 메타 파일별 레코드 수

| 종류 | Train+Val | Test | 합계 |
|------|----------:|-----:|-----:|
| `scene.json` | 16 | 7 | 23 |
| `sample.json` | 6,296 | 2,264 | 8,560 |
| `sample_data.json` | 6,296 | 2,264 | 8,560 |
| `ego_pose.json` | 6,296 | 2,264 | 8,560 |
| `sample_annotation.json` | 88,164 | 30,695 | 118,859 |
| `instance.json` | 1,233 | 429 | 1,662 |
| `category.json` | 19 | 19 | 19종 정의(분할별 1세트) |
| `attribute.json` | 1 | 1 | 분할별 1행 |
| `sensor.json` | 1 | 1 | 분할별 1행 |
| `calibrated_sensor.json` | 1 | 1 | 분할별 1행 |
| `log.json` | 1 | 1 | 분할별 1행 |

---

## 1.2 VoD 센서 원본 파일 (`view_of_delft_PUBLIC`)

- 실제 추론 파이프라인은 로컬 루트 `view_of_delft_PUBLIC`를 우선 사용함
- 동기 기준: `image_2(.jpg)`와 `radar velodyne(.bin)` stem 교집합

| 종류 | 개수 | 비고 |
|------|-----:|------|
| 카메라 이미지 (`lidar/training/image_2/*.jpg`) | 8,682 | 동기 프레임 기준 |
| 레이더 포인트 (`radar/training/velodyne/*.bin`) | 8,682 | VoD 7채널 포인트 |
| LiDAR 포인트 (`lidar/training/velodyne/*.bin`) | 8,682 | KITTI 4채널 포인트 |
| 라벨 (`lidar/training/label_2/*.txt`) | 6,435 | 라벨 있는 프레임 |
| 카메라∩레이더∩LiDAR 동기 프레임 | 8,682 | 프로젝트 자동 선택 모수 |
| 카메라∩레이더∩LiDAR∩라벨 동기 프레임 | 6,435 | 학습/검증에 바로 사용 가능 |

---

## 1.3 프로젝트 가공 데이터 (실사용 포맷)

- 가공 파이프라인: `DBSCAN(레이더) + YOLO(카메라) + LiDAR ROI 검증 + 위험도`
- 실제 웹 표출은 백엔드 DTO(`RadarSnapshotDto`)로 변환해서 사용함

### 1.3.1 가공 후 데이터셋 크기

| 데이터셋(가공 결과) | 행 수(현재 데이터 기준) | 컬럼 수 |
|---------------------|------------------------:|--------:|
| `VodFrameFiles` 인덱스 (`frameId`, `radarPath`, `imagePath`, `lidarPath`) | 8,682 | 4 |
| 라벨 포함 프레임 인덱스 (`labelTxtPath` 포함) | 6,435 | 5 |
| `radarDetections` (프레임당 최대 12개) | 최대 104,184 (=8,682×12) | 12 |
| `lidarCrossChecks` (프레임당 최대 3개) | 최대 26,046 (=8,682×3) | 14 |
| `futureTrajectoryEgoM` (기본 10 포인트) | 최대 86,820 (=8,682×10) | 3 |
| `RadarDetectionDto`(웹 지도용) | 최대 104,184 | 9 |

### 1.3.2 가공 레코드별 컬럼

| 가공 레코드 | 컬럼 수 | 컬럼 |
|-------------|--------:|------|
| `radarDetections` (AI 원출력) | 12 | `id`, `rangeM`, `azimuthDeg`, `elevationDeg`, `dopplerMps`, `confidence`, `clusterSize`, `centroidM`, `motionMatched`, `velocityEgoMps`, `speedMps`, `headingDegMotion` |
| `yoloDetections` | 3 (+bbox 4값) | `label`, `confidence`, `bbox` |
| `lidarValidation` | 13 | `primaryClusterId`, `radiusM`, `lidarPointCount`, `matched`, `pointsInRoi`, `meanDistanceM`, `lidarClusterRangeM`, `radarRangeM`, `deltaRangeM`, `deltaBearingDeg`, `lidarClusterAzimuthDeg`, `iouBevProxy`, `verdict` |
| `lidarCrossChecks` | 14 | `rank`, `clusterId`, `radiusM`, `lidarPointCount` + LiDAR 검증 10필드 |
| `RadarDetectionDto` (웹 표출) | 9 | `id`, `lat`, `lng`, `rangeM`, `azimuthDeg`, `elevationDeg`, `dopplerMps`, `confidence`, `phaseDeg` |

---

## 1.4 클래스별 Instance 분포 (요약)

| 종류 | Train+Val | Test | 합계 |
|------|----------:|-----:|-----:|
| vehicle.car | 306 | 113 | 419 |
| human.pedestrian.adult | 284 | 95 | 379 |
| static.vehicle.bicycle | 263 | 106 | 369 |
| vehicle.bicycle | 134 | 45 | 179 |
| static_object.bicycle_rack | 129 | 26 | 155 |
| static.vehicle.motorcycle | 43 | 22 | 65 |
| vehicle.motorcycle | 21 | 6 | 27 |
| vehicle.ego | 16 | 7 | 23 |
| static.vehicle.other | 12 | 2 | 14 |
| vehicle.other | 8 | 5 | 13 |
| static.manmade | 10 | 0 | 10 |
| vehicle.truck | 5 | 1 | 6 |
| vehicle.unknown | 2 | 1 | 3 |
| **합계** | **1,233** | **429** | **1,662** |

---

*집계 시점: 현재 저장소 로컬 데이터(`vod_official`, `view_of_delft_PUBLIC`) 기준.*
