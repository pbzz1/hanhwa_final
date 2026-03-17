"""
탱크 SAR(합성조개레이다) 영상/이미지 데이터 크롤링
- Kaggle: SARDet-100K (탱크·선박 등 SAR 객체 검출)
- GitHub: SAMPLE (MSTAR 기반 측정·합성 SAR 페어)
- 선택: Sentinel-1 시계열(기존 스크립트 호출)
"""

import os
import sys
import argparse
import subprocess
import zipfile
from pathlib import Path

# 기본 저장 루트
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "downloaded_tank_sar"


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


# --- Kaggle: SARDet-100K ---
KAGGLE_DATASET = "greatbird/sardet-100k"


def crawl_kaggle_sardet(output_dir: Path, unzip: bool = True) -> bool:
    """Kaggle에서 SARDet-100K 다운로드 (탱크·선박 등 SAR 객체 검출)."""
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
    except ImportError:
        print("Kaggle API 필요: pip install kaggle")
        print("  설정: ~/.kaggle/kaggle.json (또는 Windows: C:\\Users\\<user>\\.kaggle\\kaggle.json)")
        return False

    out = ensure_dir(output_dir / "sardet_100k")
    api = KaggleApi()
    try:
        api.authenticate()
    except Exception as e:
        print(f"Kaggle 인증 실패: {e}")
        return False

    try:
        api.dataset_download_files(KAGGLE_DATASET, path=str(out), unzip=unzip)
        print(f"  저장: {out}")
        return True
    except Exception as e:
        print(f"  다운로드 실패: {e}")
        return False


# --- GitHub: SAMPLE dataset ---
SAMPLE_REPO = "https://github.com/benjaminlewis-afrl/SAMPLE_dataset_public.git"


def crawl_github_sample(output_dir: Path) -> bool:
    """GitHub에서 SAMPLE (Synthetic and Measured Paired) SAR 데이터 클론."""
    out = ensure_dir(output_dir / "sample_dataset")
    repo_path = out / "SAMPLE_dataset_public"
    if repo_path.exists():
        print(f"  이미 존재: {repo_path}, pull 시도.")
        try:
            subprocess.run(
                ["git", "pull"],
                cwd=str(repo_path),
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError:
            pass
        print(f"  경로: {repo_path}")
        return True

    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", SAMPLE_REPO, str(repo_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"  저장: {repo_path}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  클론 실패 (git 필요): {e}")
        return False


# --- GitHub: data-unicorn (AFRL SAR/EO) ---
DATA_UNICORN_REPO = "https://github.com/AFRL-RY/data-unicorn-2008.git"


def crawl_github_data_unicorn(output_dir: Path) -> bool:
    """GitHub에서 data-unicorn-2008 (SAR/EO 레이블) 클론."""
    out = ensure_dir(output_dir / "data_unicorn_2008")
    repo_path = out / "data-unicorn-2008"
    if repo_path.exists():
        print(f"  이미 존재: {repo_path}, pull 시도.")
        try:
            subprocess.run(
                ["git", "pull"],
                cwd=str(repo_path),
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError:
            pass
        print(f"  경로: {repo_path}")
        return True

    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", DATA_UNICORN_REPO, str(repo_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"  저장: {repo_path}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  클론 실패 (git 필요): {e}")
        return False


# --- SARDet-100K 공식 (Baidu/OneDrive 대안) 문서만 안내 ---
def print_extra_sources():
    """추가 SAR 데이터 소스 안내."""
    print("\n[추가 탱크/군용 SAR 데이터 소스]")
    print("  - MSTAR (T-72, BMP2 등): https://www.sdms.afrl.af.mil/index.php?collection=mstar")
    print("  - MSTAR 10-class (IEEE): https://ieee-dataport.org/documents/mstar-dataset-10-classes")
    print("  - SARDet-100K 공식 (Baidu): https://pan.baidu.com/s/1dIFOm4V2pM_AjhmkD1-Usw?pwd=SARD")
    print("  - Sentinel-1 시계열(지역): 프로젝트의 google_earth_crawling/crawl_korea_sar_*.py 사용")


def main():
    parser = argparse.ArgumentParser(
        description="탱크 SAR 영상/이미지 데이터 크롤링 (Kaggle, GitHub 등)"
    )
    parser.add_argument(
        "-o", "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="저장 루트 폴더",
    )
    parser.add_argument(
        "--kaggle",
        action="store_true",
        help="Kaggle SARDet-100K 다운로드",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="GitHub SAMPLE dataset 클론",
    )
    parser.add_argument(
        "--data-unicorn",
        action="store_true",
        help="GitHub data-unicorn-2008 클론",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="지원하는 모든 소스 수집 (kaggle + sample + data-unicorn)",
    )
    parser.add_argument(
        "--no-unzip",
        action="store_true",
        help="Kaggle 다운로드 시 압축 해제 안 함",
    )
    parser.add_argument(
        "--list-sources",
        action="store_true",
        help="추가 SAR 데이터 소스 URL만 출력",
    )
    args = parser.parse_args()

    if args.list_sources:
        print_extra_sources()
        return

    do_all = args.all or not (args.kaggle or args.sample or args.data_unicorn)
    root = ensure_dir(args.output_dir)
    print(f"저장 경로: {root}\n")

    if do_all or args.kaggle:
        print("[1/3] Kaggle SARDet-100K")
        crawl_kaggle_sardet(root, unzip=not args.no_unzip)
    if do_all or args.sample:
        print("\n[2/3] GitHub SAMPLE dataset")
        crawl_github_sample(root)
    if do_all or args.data_unicorn:
        print("\n[3/3] GitHub data-unicorn-2008")
        crawl_github_data_unicorn(root)

    print_extra_sources()
    print(f"\n완료. 결과 위치: {root}")


if __name__ == "__main__":
    main()
