# 탱크 SAR(합성조개레이다) 데이터 크롤링

YouTube가 아닌 **SAR 영상/이미지** 소스에서 탱크·군용 차량 관련 데이터를 가져옵니다.

## 지원 소스

| 소스 | 설명 | 비고 |
|------|------|------|
| **Kaggle SARDet-100K** | 대규모 SAR 객체 검출 (탱크·선박 등) | `kaggle` API + 계정 설정 |
| **GitHub SAMPLE** | MSTAR 기반 측정·합성 SAR 페어 | `git clone` |
| **GitHub data-unicorn-2008** | AFRL SAR/EO 레이블 (4.4M+) | `git clone` |

## 설치

```bash
pip install -r requirements.txt
```

- **Kaggle 사용 시**: [Kaggle 계정](https://www.kaggle.com) → API 토큰 발급 후  
  `~/.kaggle/kaggle.json` (Windows: `C:\Users\<사용자>\.kaggle\kaggle.json`)에 저장
- **GitHub 클론 시**: `git` 설치 필요

## 사용법

**모든 지원 소스 한 번에 수집 (Kaggle + SAMPLE + data-unicorn):**

```bash
python crawl_tank_sar.py --all
```

**소스별로만 수집:**

```bash
# Kaggle SARDet-100K만
python crawl_tank_sar.py --kaggle

# GitHub SAMPLE만
python crawl_tank_sar.py --sample

# GitHub data-unicorn만
python crawl_tank_sar.py --data-unicorn
```

**저장 폴더 지정:**

```bash
python crawl_tank_sar.py --all -o ./my_tank_sar
```

**추가 SAR 데이터 소스 URL만 보기:**

```bash
python crawl_tank_sar.py --list-sources
```

## 출력 구조

- `downloaded_tank_sar/` (또는 `-o`로 지정한 경로)
  - `sardet_100k/` — Kaggle SARDet-100K
  - `sample_dataset/SAMPLE_dataset_public/` — SAMPLE
  - `data_unicorn_2008/data-unicorn-2008/` — data-unicorn

## 추가 소스 (수동 다운로드)

- **MSTAR** (T-72, BMP2 등): [AFRL SDMS](https://www.sdms.afrl.af.mil/index.php?collection=mstar)
- **MSTAR 10-class**: [IEEE DataPort](https://ieee-dataport.org/documents/mstar-dataset-10-classes)
- **Sentinel-1 시계열(지역)**: 프로젝트의 `google_earth_crawling/crawl_korea_sar_sentinelsat.py`, `crawl_korea_sar_gee.py` 사용
