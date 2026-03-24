# Gaussian 작업 폴더

3D Gaussian Splatting 관련 리소스를 한 곳에 모아둔 폴더입니다.

## 구성

- `notebooks/colab_3d_tank_training.ipynb`: Colab 학습 노트북
- `scripts/prepare_3d_scenes.py`: 각도별 scene 생성 스크립트
- `scripts/prepare_tank_merged_scenes.py`: 전차별 scene 병합 스크립트
- `docs/SETUP_AND_RUN_3DGS.md`: 3DGS 실행 가이드
- `docs/SESSION_LOG_3D_TRAINING.md`: 학습 세션 로그
- `docs/3D_모델링_포신_각도_예측_2.md`: 3D 모델링 관련 문서
- `run_colmap_and_train.sh`: 단일 scene 학습 실행 스크립트

## 참고

- 엔진 소스는 루트의 `gaussian-splatting/` 폴더를 사용합니다.
- 데이터는 루트의 `data/` 폴더를 기준으로 관리합니다.
