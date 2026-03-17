"""
한국 지역 Sentinel-1 SAR 영상 검색 및 다운로드 (배경 포함)
Copernicus Open Access Hub + Sentinelsat. 영상 전체가 배경과 함께 다운로드됩니다.
"""
import os
from pathlib import Path

# 한국 경계 (WGS84)
KOREA_WKT = (
    "POLYGON((124.5 33.0, 132.0 33.0, 132.0 43.0, 124.5 43.0, 124.5 33.0))"
)

# 샘플: 더 작은 ROI (경기 남부)
KOREA_SAMPLE_WKT = (
    "POLYGON((127.0 37.2, 127.6 37.2, 127.6 37.7, 127.0 37.7, 127.0 37.2))"
)


def crawl_and_download(
    start_date: str = "2024-01-01",
    end_date: str = "2024-12-31",
    output_dir: str = "output_sar_sentinelsat",
    footprint_wkt: str = KOREA_SAMPLE_WKT,
    max_results: int = 10,
    username: str = None,
    password: str = None,
):
    """
    Sentinelsat로 한국 지역 Sentinel-1 GRD 영상을 검색하고 다운로드.
    Copernicus Open Access Hub 계정 필요: https://scihub.copernicus.eu/
    """
    try:
        from sentinelsat import SentinelAPI, read_geojson, geojson_to_wkt
    except ImportError:
        raise ImportError("sentinelsat이 필요합니다: pip install sentinelsat")

    if not username or not password:
        print("Copernicus SciHub 계정이 필요합니다.")
        print("  환경변수: COPERNICUS_USER, COPERNICUS_PASSWORD")
        print("  또는 인자: --user, --password")
        username = username or os.environ.get("COPERNICUS_USER")
        password = password or os.environ.get("COPERNICUS_PASSWORD")
    if not username or not password:
        raise ValueError("Copernicus username/password를 설정하세요.")

    api = SentinelAPI(username, password, "https://scihub.copernicus.eu/dhus")
    os.makedirs(output_dir, exist_ok=True)

    # Sentinel-1 GRD, IW, VV+VH
    products = api.query(
        footprint_wkt,
        date=(start_date, end_date),
        platformname="Sentinel-1",
        producttype="GRD",
        sensoroperationalmode="IW",
        orbitdirection="ASCENDING",
    )

    items = list(products.items())
    if not items:
        print("해당 기간/지역에 Sentinel-1 GRD 영상이 없습니다.")
        return []

    # 최대 개수만 선택
    to_download = items[:max_results]
    print(f"총 {len(items)}개 검색됨. {len(to_download)}개 다운로드 예정.")

    downloaded = []
    for product_id, info in to_download:
        out_path = os.path.join(output_dir, f"{product_id}.zip")
        if os.path.exists(out_path):
            print(f"  이미 존재: {product_id}")
            downloaded.append(out_path)
            continue
        try:
            result = api.download(product_id, directory_path=output_dir)
            if result:
                downloaded.append(result.get("path", out_path))
                print(f"  다운로드 완료: {product_id}")
        except Exception as e:
            print(f"  다운로드 실패 {product_id}: {e}")

    return downloaded


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="한국 SAR 영상 수집 (Sentinelsat)")
    p.add_argument("--start", default="2024-01-01", help="시작일")
    p.add_argument("--end", default="2024-12-31", help="종료일")
    p.add_argument("--out", default="output_sar_sentinelsat", help="출력 디렉터리")
    p.add_argument("--full", action="store_true", help="한국 전체 폴리곤 사용")
    p.add_argument("--max", type=int, default=5, help="최대 다운로드 개수")
    p.add_argument("--user", default=None, help="SciHub 사용자명")
    p.add_argument("--password", default=None, help="SciHub 비밀번호")
    args = p.parse_args()

    footprint = KOREA_WKT if args.full else KOREA_SAMPLE_WKT
    crawl_and_download(
        start_date=args.start,
        end_date=args.end,
        output_dir=args.out,
        footprint_wkt=footprint,
        max_results=args.max,
        username=args.user,
        password=args.password,
    )
