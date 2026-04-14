# 대화 요약 — VoD·FMCW·노트북·자동 푸시

이 문서는 프로젝트 작업 대화에서 정리된 **결정 사항·산출물·운영 팁**을 한곳에 모은 것입니다.

---

## 1. VoD / BEV / 비교 노트북

### 1.1 통합 비교 (`vod-devkit/13_radar_bev_lidar_yolo_compare.ipynb`)

- **역할**: 데이터셋(VoD) 위에서 레이더·카메라·(보조) LiDAR·YOLO·BEV CNN을 **나란히 보는 오프라인 실험(B 구간)**.
- **학습**: 동일 `label_2` 히트맵 타깃으로 **LiDAR BEV** 입력 CNN과 **레이더만 BEV** 입력 CNN을 각각 학습 (`bev_lidar_detector_train.py`, `BevRadarDataset`, `build_bev_tensor_radar` 등).
- **시각화**: **2×4** 그리드(카메라, YOLO, 요약, BEV 4패널). 패널에 학습 입력(LiDAR vs RADAR) 구분 태그·제목으로 정성 비교가 드러나도록 정리됨.
- **서술**: 맨 앞 셀에 **A(최종 FMCW-only)** vs **B(오프라인 검증)** 구분, 발표용 안전 문장, `strong_validated`/`radar_only` 대신 **레이더 기반 confidence 등급** 권장, **한 줄 결론** 포함.

### 1.2 발표·보고용 서술만 (`vod-devkit/14_fmcw_offline_validation_narrative.ipynb`)

- 코드 없이 **A/B 구조**, 발표용 인용문, `high_confidence` / `medium_confidence` / `low_confidence`와 레이더 특징(군집 점 수, RCS, 속도 일관성, 추적 지속성, heading 안정성), 저장소 내 역할 매핑 정리.
- B 구간 예시로 **13번** 및 **15번**(아래) 언급.

### 1.3 Run All 통합본 (`vod-devkit/15_vod_compare_run_all.ipynb`)

- **13번과 실행 셀 동일**. 13이 열리지 않거나 한 파일만 쓰고 싶을 때 **위에서부터 Run All** 용.
- 첫 제목에 15번·13과 동일함을 명시.

### 1.4 기타

- `bev_lidar_detector_train.py`: LiDAR/레이더 BEV 데이터셋, `TinyBevDetector`, AdamW·cosine·grad clip·val BCE 등 학습 루프.
- `vod_compare_utils.py`: 융합 API·YOLO·KITTI→velo 풋프린트 등 비교 유틸.

---

## 2. 최종 시스템 vs 오프라인 검증 (말하기 구조)

| 구분 | 내용 |
|------|------|
| **A. 최종 시스템** | FMCW 레이더 단독 → 전처리 → 군집화 → 후보 선택 → 추적 → 위험도 |
| **B. 오프라인** | 동일 후보에 LiDAR/GT로 교차 검증, 레이더-only 한계·threshold 튜닝 참고 |

**발표에서 쓰기 안전한 문장 (예시)**

- 최종 운용 가정은 **FMCW 레이더 단독**이며, LiDAR는 실제 시스템 입력이 아니라 **데이터셋 기반 오프라인 검증용 보조 센서**로만 활용했다.
- LiDAR 검증은 레이더 후보의 **공간적 타당성**을 보는 **실험적 비교 단계**이며, **실제 배치 파이프라인에서는 제외**된다.

**운영 UI**

- `strong_validated` / `radar_only` 를 메인 구분으로 두기보다, **레이더 특징 기반** `high_confidence` / `medium_confidence` / `low_confidence` 권장.

---

## 3. Git / 원격 저장소

- **커밋·푸시**: `master`에 반영된 적 있음. 대용량 **`vod-devkit/vod-received/vod_official/**`** 는 커밋에서 제외하고 `.gitignore`에 추가해 저장소 비대화 방지.

---

## 4. 매일 17시 자동 커밋·푸시 (Windows)

- **`scripts/daily-github-push.mjs`**: 변경 있으면 `git add -A` → 요약 본문으로 `chore(snapshot): …` 커밋 → `git push`. 변경 없고 앞선 커밋만 있으면 push만. `DRY_RUN=1`로 시험 가능.
- **`scripts/register-daily-github-push.ps1`**: 작업 스케줄러에 **매일 17:00** `HanhwaDailyGitHubPush` 등록.
- **`package.json`**: `npm run daily:github-push`.
- **주의**: Git 인증·노트북에 올리면 안 될 파일은 `.gitignore` 유지. 원격이 앞서 있으면 자동 `pull`은 하지 않음.

---

## 5. `.ipynb`가 안 열릴 때

- 에디터/확장(Jupyter) 설정 변경 후 노트북이 텍스트로만 열리거나 미리보기가 깨질 수 있음.
- **대안**: VS Code Jupyter, `jupyter lab` / `notebook`, 또는 “Reopen Editor With… → Notebook”.

---

## 6. 파일 목록 (이 대화와 직접 연관)

| 경로 | 설명 |
|------|------|
| `vod-devkit/13_radar_bev_lidar_yolo_compare.ipynb` | VoD 통합 비교·이중 BEV 학습·2×4 시각화 |
| `vod-devkit/15_vod_compare_run_all.ipynb` | 13과 동일 실행본 |
| `vod-devkit/14_fmcw_offline_validation_narrative.ipynb` | 서술 전용 |
| `vod-devkit/bev_lidar_detector_train.py` | BEV 학습 코드 |
| `vod-devkit/vod_compare_utils.py` | 비교·융합 유틸 |
| `scripts/daily-github-push.mjs` | 일일 스냅샷 커밋·푸시 |
| `scripts/register-daily-github-push.ps1` | Windows 예약 등록 |
| `.gitignore` | `vod_official` 등 대용량 제외 |

---

*생성 목적: 위 대화 맥락을 보존하고, 발표·보고·온보딩 시 빠르게 참고하기 위함.*
