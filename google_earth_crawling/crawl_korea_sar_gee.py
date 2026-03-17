"""
한국 지역 Sentinel-1 SAR 영상 수집 (배경 포함)
Google Earth Engine 사용. 지역 전체를 타일로 내보내므로 배경(지형)과 함께 저장됩니다.
"""
import os
import time
from pathlib import Path

# 한국 경계 (대략적 bounding box: 한반도 남부)
KOREA_BBOX = {
    "west": 124.5,
    "south": 33.0,
    "east": 132.0,
    "north": 43.0,
}

# 선택: 더 작은 관심 지역 (예: 훈련장 인근 등)
KOREA_SAMPLE_ROI = {
    "west": 127.0,
    "south": 37.2,
    "east": 127.6,
    "north": 37.7,
}


def get_roi(use_full_korea: bool = False):
    """사용할 지역 ROI 반환 (폴리곤 링: [서남, 서북, 동북, 동남, 서남])."""
    b = KOREA_BBOX if use_full_korea else KOREA_SAMPLE_ROI
    ring = [
        [b["west"], b["south"]],
        [b["west"], b["north"]],
        [b["east"], b["north"]],
        [b["east"], b["south"]],
        [b["west"], b["south"]],
    ]
    return [ring]


def run_gee_export(
    start_date: str = "2024-01-01",
    end_date: str = "2024-12-31",
    output_dir: str = "output_sar_gee",
    scale_meters: int = 20,
    use_full_korea: bool = False,
    max_images: int = 10,
    project: str = None,
):
    """
    Earth Engine으로 한국 지역 Sentinel-1 SAR 영상을 검색 후 Drive/GCS로 내보내기.
    project: GCP 프로젝트 ID (필수). 환경변수 EE_PROJECT 또는 --project로 지정.
    """
    try:
        import ee
    except ImportError:
        raise ImportError("earthengine-api가 필요합니다: pip install earthengine-api")

    project = project or os.environ.get("EE_PROJECT")
    init_kw = {"project": project} if project else {}

    try:
        ee.Initialize(**init_kw)
    except Exception as e:
        err_msg = str(e).lower()
        if "no project" in err_msg or ("project" in err_msg and "found" in err_msg):
            print("Earth Engine 사용을 위해 GCP 프로젝트 ID가 필요합니다.")
            print("  방법 1: --project YOUR_PROJECT_ID")
            print("  방법 2: 환경변수 설정 set EE_PROJECT=YOUR_PROJECT_ID")
            print("  GCP 콘솔에서 프로젝트 ID 확인: https://console.cloud.google.com/")
            raise SystemExit(1) from e
        if "has not been used" in err_msg or "it is disabled" in err_msg or "enable it by visiting" in err_msg:
            pid = project or "YOUR_PROJECT_ID"
            url = f"https://console.developers.google.com/apis/api/earthengine.googleapis.com/overview?project={pid}"
            print("이 프로젝트에서 Google Earth Engine API가 꺼져 있습니다.")
            print("아래 링크에서 '사용 설정'을 눌러 활성화한 뒤, 몇 분 후 다시 실행하세요.")
            print(f"  {url}")
            raise SystemExit(1) from e
        if "authorize" in err_msg or "authenticate" in err_msg:
            print("Earth Engine 인증이 필요합니다. 브라우저가 열리면 로그인해 주세요.")
            ee.Authenticate()
            ee.Initialize(**init_kw)
        else:
            raise
    os.makedirs(output_dir, exist_ok=True)

    roi = ee.Geometry.Polygon(get_roi(use_full_korea))

    # Sentinel-1 GRD, IW, VV+VH
    col = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(roi)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    )

    n = col.size().getInfo()
    if n == 0:
        print("해당 기간/지역에 Sentinel-1 영상이 없습니다.")
        return

    print(f"총 {n}개 영상. 최대 {max_images}개만 내보냅니다.")

    # 컬렉션을 리스트로 가져와서 순회
    col_list = col.toList(max_images)
    task_names = []

    for i in range(min(max_images, n)):
        img = ee.Image(col_list.get(i))
        img_id = img.get("system:index").getInfo()
        desc = f"Korea_S1_SAR_{img_id}"
        # 로컬 다운로드는 제한이 있어서, 보통 Drive 또는 GCS로 Export 후 수동 다운로드
        task = ee.batch.Export.image.toDrive(
            image=img.select(["VV", "VH"]),
            description=desc,
            scale=scale_meters,
            region=roi,
            maxPixels=1e13,
            folder="Korea_SAR_Export",
            fileFormat="GeoTIFF",
        )
        task.start()
        task_names.append((desc, task.id))
        print(f"  Export 시작: {desc} (task id: {task.id})")
        time.sleep(2)

    print("\n내보내기가 Google Drive로 예약되었습니다.")
    print("Earth Engine 콘솔에서 작업 상태 확인: https://code.earthengine.google.com/tasks")
    print("완료 후 Drive 'Korea_SAR_Export' 폴더에서 GeoTIFF를 받으세요.")
    return task_names


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="한국 SAR 영상 수집 (GEE)")
    p.add_argument("--start", default="2024-01-01", help="시작일 (YYYY-MM-DD)")
    p.add_argument("--end", default="2024-12-31", help="종료일")
    p.add_argument("--out", default="output_sar_gee", help="출력 디렉터리")
    p.add_argument("--scale", type=int, default=20, help="픽셀 크기(m)")
    p.add_argument("--full", action="store_true", help="한국 전체 bbox 사용 (기본: 샘플 ROI)")
    p.add_argument("--max", type=int, default=5, help="최대 내보낼 영상 수")
    p.add_argument("--project", default=None, help="GCP 프로젝트 ID (또는 환경변수 EE_PROJECT)")
    args = p.parse_args()

    run_gee_export(
        start_date=args.start,
        end_date=args.end,
        output_dir=args.out,
        scale_meters=args.scale,
        use_full_korea=args.full,
        max_images=args.max,
        project=args.project,
    )
