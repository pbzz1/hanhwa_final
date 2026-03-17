# Google Earth 크롤링 — 한국 전차·배경 SAR 데이터 수집

한국 지역 **Sentinel-1 SAR** 영상을 수집하는 스크립트 모음입니다.  
영상은 **배경(지형, 주변)과 함께** 한 장씩 받아지며, 전차/장갑차 탐지 학습용으로 사용할 수 있습니다.

## 폴더 구조

```
google_earth_crawling/
├── README.md                    # 이 문서
├── requirements.txt             # 의존성
├── crawl_korea_sar_gee.py       # Google Earth Engine으로 SAR 내보내기
├── crawl_korea_sar_sentinelsat.py # Copernicus Sentinelsat으로 SAR 다운로드
├── output_sar_gee/              # GEE 관련 출력 (생성됨)
└── output_sar_sentinelsat/      # Sentinelsat 다운로드 ZIP (생성됨)
```

## 준비 사항

### 1) Google Earth Engine (방법 A)

- [Earth Engine 가입](https://signup.earthengine.google.com/) 후 승인 대기
- 로컬에서 한 번만 인증:

```bash
pip install earthengine-api
earthengine authenticate
```

- 실행: 영상은 **Google Drive**의 `Korea_SAR_Export` 폴더로 내보내지며, 완료 후 Drive에서 GeoTIFF를 다운로드합니다.

### 2) Copernicus SciHub (방법 B)

- [Copernicus Open Access Hub](https://scihub.copernicus.eu/)에서 계정 생성
- 환경변수 또는 실행 인자로 로그인 정보 입력

```bash
pip install sentinelsat
set COPERNICUS_USER=your_username
set COPERNICUS_PASSWORD=your_password
```

## 설치

이 폴더에서:

```bash
pip install -r requirements.txt
```

## 사용법

이 폴더를 작업 디렉터리로 두고 실행하세요.

### 방법 A: Google Earth Engine

```bash
cd google_earth_crawling
python crawl_korea_sar_gee.py
```

- 한국 전체 bbox, 기간·개수 지정:  
  `python crawl_korea_sar_gee.py --start 2023-06-01 --end 2024-06-01 --full --max 10`
- 옵션: `--start`, `--end`, `--out`, `--scale`, `--full`, `--max`

실제 영상 파일은 **Google Drive → Korea_SAR_Export**에서 받으면 됩니다.

### 방법 B: Sentinelsat (직접 다운로드)

```bash
cd google_earth_crawling
set COPERNICUS_USER=your_id
set COPERNICUS_PASSWORD=your_pw
python crawl_korea_sar_sentinelsat.py --start 2024-01-01 --end 2024-12-31 --max 5
```

다운로드된 ZIP은 `output_sar_sentinelsat/`에 저장됩니다.

## 관심 지역(ROI) 변경

- **GEE**: `crawl_korea_sar_gee.py` 안의 `KOREA_BBOX`, `KOREA_SAMPLE_ROI` 수정
- **Sentinelsat**: `KOREA_WKT`, `KOREA_SAMPLE_WKT` 수정

특정 훈련장/관심 지역 좌표가 있으면 해당 경위도로 위 값만 바꾸면 됩니다.
