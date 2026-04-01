# AI 관련 작업 모음

학습 노트북·레이더 실험·문서를 한곳에서 찾기 쉽게 모아 둔 폴더입니다. (기존 **`ai-inference/`** 서비스 코드·**`gaussian/`** 3DGS 작업과는 역할이 다릅니다.)

## 집에서 CRUW만 돌릴 때 (최소)

1. [CRUW / ROD2021](https://www.cruwdataset.org/) 데이터·약관 확인 후 다운로드  
2. 압축·폴더를 **`radar-cruw/data/`** 아래에 둠 (예: `TRAIN_RAD_H_ANNO`, `TRAIN_RAD_H-001.zip`, `TEST_RAD_H-003` 등)  
3. Python 가상환경에서 `pip install` (아래 **환경**)  
4. **`radar-cruw/0_cruw_radar_training.ipynb`** 만 열고, **위에서부터 순서대로** 셀 실행 — 첫 경로 셀에서 `PAIR_OK=True`·RAMap shape가 나오면 정상  

**안 해도 됨:** `1_rodnet_demo.ipynb`, RODNet `vendor/` 클론, 별도 `.pth` 체크포인트 — 나중에 공식 파이프라인 쓸 때만 보면 됨.

### 환경

```bash
cd ai/radar-cruw
pip install -r requirements-cruw.txt
# PyTorch: https://pytorch.org 에서 CUDA/CPU 선택
```

### 경로를 다른 디스크에 둘 때

- 환경 변수 **`CRUW_DATA_DIR`** = CRUW 압축·폴더를 둔 절대 경로  
- 특정 시퀀스만 쓰려면 **`CRUW_SEQUENCE`** = 라벨 `.txt` 파일명과 같은 stem (예: `2019_04_09_BMS1000`)

## 하위 구조

| 경로 | 설명 |
|------|------|
| **`radar-cruw/`** | **`0_cruw_radar_training.ipynb`** (CRUW 경로·ROD2021 라벨·경량 학습), `requirements-cruw.txt`, 데이터 **`radar-cruw/data/`** |
| **`radar-cruw/1_rodnet_demo.ipynb`** | (선택) 공식 [RODNet](https://github.com/yizhou-wang/RODNet) clone·`prepare_data`·`test.py --demo` — GPU·`.pth` 필요 |
| **`../ai-inference/`** | FastAPI 추론 서버 (MASt3R, YOLO 등) |
| **`../gaussian/notebooks/`** | 3D Gaussian / 전차 각도 관련 Colab·노트북 |
| **`../vod-devkit/`** | View-of-Delft(VoD) — VoD 쓸 때만 연계 |

## RODNet을 나중에 쓸 때

- **`1_rodnet_demo.ipynb`** + [RODNet README](https://github.com/yizhou-wang/RODNet)  
- 학습된 가중치 `.pth`를 `data/checkpoints/` 등에 두고 노트북의 `RODNET_CHECKPOINT` 안내 따름  
