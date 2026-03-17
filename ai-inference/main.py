import base64
import os
import tempfile
import uuid
from typing import Any

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO

app = FastAPI(title="YOLO Inference Server")

# Allow local frontend to load /outputs/*.ply directly (PLYLoader/XHR).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: 실제 학습 가중치 경로로 교체하세요. 예: "weights/tank_best.pt"
MODEL_PATH = "yolov8n.pt"
model = YOLO(MODEL_PATH)
APP_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUTS_DIR = os.path.join(APP_DIR, "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Save reconstructed artifacts (PLY) and serve them.
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")
DEFAULT_MAST3R_BASE_DIR = os.path.join(APP_DIR, "mast3r")
DEFAULT_MAST3R_CKPT_PATH = os.path.join(
    APP_DIR,
    "checkpoints",
    "MASt3R_ViTLarge_BaseDecoder_512_catmlpdpt_metric.pth",
)

MAST3R_STATE: dict[str, Any] = {
    "loaded": False,
    "model": None,
    "load_images": None,
    "make_pairs": None,
    "inference": None,
    "global_aligner": None,
    "GlobalAlignerMode": None,
    "device": "cpu",
}


def _decode_upload_image(upload_file: UploadFile) -> np.ndarray:
    file_bytes = upload_file.file.read()
    np_buffer = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="유효한 이미지 파일이 아닙니다.")
    return image


def _encode_image_to_base64(image: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".jpg", image)
    if not ok:
        raise HTTPException(status_code=500, detail="결과 이미지 인코딩에 실패했습니다.")
    return base64.b64encode(encoded.tobytes()).decode("utf-8")


def _extract_detections(result: Any) -> list[dict[str, Any]]:
    names = result.names
    detections: list[dict[str, Any]] = []

    if result.boxes is None:
        return detections

    for box in result.boxes:
        cls_id = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        track_id = int(box.id[0].item()) if box.id is not None else None

        detections.append(
            {
                "label": names.get(cls_id, str(cls_id)),
                "confidence": conf,
                "bbox": [x1, y1, x2, y2],
                "trackId": track_id,
            }
        )

    return detections


def _largest_bbox(detections: list[dict[str, Any]]) -> tuple[int, int, int, int] | None:
    if not detections:
        return None

    best = None
    best_area = -1.0
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        area = max(0.0, (x2 - x1) * (y2 - y1))
        if area > best_area:
            best_area = area
            best = (int(x1), int(y1), int(x2), int(y2))
    return best


def _mask_from_bbox(shape: tuple[int, int, int], bbox: tuple[int, int, int, int] | None):
    h, w = shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    if bbox is None:
        mask[:, :] = 255
        return mask

    x1, y1, x2, y2 = bbox
    pad_x = max(10, int((x2 - x1) * 0.15))
    pad_y = max(10, int((y2 - y1) * 0.15))
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w - 1, x2 + pad_x)
    y2 = min(h - 1, y2 + pad_y)
    cv2.rectangle(mask, (x1, y1), (x2, y2), color=255, thickness=-1)
    return mask


def _load_mast3r_runtime() -> dict[str, Any]:
    if MAST3R_STATE["loaded"]:
        return MAST3R_STATE

    base_dir = os.getenv("MAST3R_BASE_DIR", DEFAULT_MAST3R_BASE_DIR)
    ckpt_path = os.getenv("MAST3R_CKPT_PATH", DEFAULT_MAST3R_CKPT_PATH)
    if not os.path.exists(base_dir) or not os.path.exists(ckpt_path):
        raise HTTPException(
            status_code=503,
            detail=(
                "MASt3R base/checkpoint 경로가 유효하지 않습니다. "
                f"base_dir={base_dir}, ckpt_path={ckpt_path}"
            ),
        )

    import sys

    sys.path.append(base_dir)
    sys.path.append(os.path.join(base_dir, "dust3r"))

    try:
        from mast3r.model import AsymmetricMASt3R
        from dust3r.cloud_opt import GlobalAlignerMode, global_aligner
        from dust3r.image_pairs import make_pairs
        from dust3r.inference import inference
        from dust3r.utils.image import load_images
    except Exception as ex:
        raise HTTPException(status_code=503, detail=f"MASt3R import 실패: {ex}") from ex

    device = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        mast3r_model = AsymmetricMASt3R.from_pretrained(ckpt_path).to(device).eval()
    except Exception as ex:
        raise HTTPException(status_code=503, detail=f"MASt3R 모델 로드 실패: {ex}") from ex

    MAST3R_STATE.update(
        {
            "loaded": True,
            "model": mast3r_model,
            "load_images": load_images,
            "make_pairs": make_pairs,
            "inference": inference,
            "global_aligner": global_aligner,
            "GlobalAlignerMode": GlobalAlignerMode,
            "device": device,
        }
    )
    return MAST3R_STATE


def _to_uint8_rgb(image_tensor: Any) -> np.ndarray:
    # Supports torch tensor (CHW/NCHW) and numpy array (HWC/CHW/NCHW)
    if torch.is_tensor(image_tensor):
        if image_tensor.ndim == 4:
            image_tensor = image_tensor.squeeze(0)
        if image_tensor.ndim != 3:
            raise ValueError("Unsupported tensor image dimensions")
        rgb = image_tensor.permute(1, 2, 0).detach().cpu().numpy()
        rgb = (rgb * 0.5) + 0.5
        return np.clip(rgb * 255.0, 0, 255).astype(np.uint8)

    image_np = np.asarray(image_tensor)
    if image_np.ndim == 4:
        image_np = image_np[0]
    if image_np.ndim != 3:
        raise ValueError("Unsupported ndarray image dimensions")

    # CHW -> HWC
    if image_np.shape[0] in (1, 3) and image_np.shape[2] not in (1, 3):
        image_np = np.transpose(image_np, (1, 2, 0))

    if image_np.dtype != np.uint8:
        max_val = float(np.max(image_np)) if image_np.size > 0 else 1.0
        if max_val <= 1.5:
            image_np = np.clip(image_np, 0.0, 1.0) * 255.0
        else:
            image_np = np.clip(image_np, 0.0, 255.0)
        image_np = image_np.astype(np.uint8)
    return image_np


def _write_ply_ascii(points_xyz: np.ndarray, colors_rgb: np.ndarray | None, out_path: str) -> None:
    pts = np.asarray(points_xyz, dtype=np.float32)
    if pts.ndim != 2 or pts.shape[1] != 3:
        raise ValueError("points_xyz must be Nx3")

    cols: np.ndarray | None = None
    if colors_rgb is not None:
        cols = np.asarray(colors_rgb)
        if cols.ndim != 2 or cols.shape[1] != 3 or cols.shape[0] != pts.shape[0]:
            cols = None
        else:
            if cols.dtype != np.uint8:
                cols = np.clip(cols, 0, 255).astype(np.uint8)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("ply\n")
        f.write("format ascii 1.0\n")
        f.write(f"element vertex {pts.shape[0]}\n")
        f.write("property float x\n")
        f.write("property float y\n")
        f.write("property float z\n")
        if cols is not None:
            f.write("property uchar red\n")
            f.write("property uchar green\n")
            f.write("property uchar blue\n")
        f.write("end_header\n")

        if cols is None:
            for x, y, z in pts:
                f.write(f"{x:.6f} {y:.6f} {z:.6f}\n")
        else:
            for (x, y, z), (r, g, b) in zip(pts, cols, strict=False):
                f.write(f"{x:.6f} {y:.6f} {z:.6f} {int(r)} {int(g)} {int(b)}\n")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/infer/image")
def infer_image(file: UploadFile = File(...)) -> dict[str, Any]:
    image = _decode_upload_image(file)

    results = model.predict(source=image, verbose=False)
    result = results[0]
    detections = _extract_detections(result)

    annotated = result.plot()
    annotated_b64 = _encode_image_to_base64(annotated)

    return {
        "source": file.filename or "uploaded-image",
        "detections": detections,
        "annotatedImageBase64": annotated_b64,
    }


@app.post("/infer/video")
def infer_video(file: UploadFile = File(...)) -> dict[str, Any]:
    suffix = ".mp4"
    if file.filename and "." in file.filename:
        suffix = f".{file.filename.rsplit('.', 1)[1]}"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(file.file.read())
        temp_path = tmp_file.name

    cap = cv2.VideoCapture(temp_path)
    if not cap.isOpened():
        os.remove(temp_path)
        raise HTTPException(status_code=400, detail="유효한 영상 파일이 아닙니다.")

    fps = cap.get(cv2.CAP_PROP_FPS)
    fps_value = int(fps) if fps and fps > 0 else 0
    frame_interval = max(fps_value, 1)  # roughly 1 FPS sampling
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    frame_index = 0
    processed_frames = 0
    total_detections = 0
    counts_by_label: dict[str, int] = {}
    sample_results: list[dict[str, Any]] = []
    preview_frames: list[str] = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_index % frame_interval != 0:
                frame_index += 1
                continue

            results = model.predict(source=frame, verbose=False)
            result = results[0]
            detections = _extract_detections(result)

            processed_frames += 1
            total_detections += len(detections)
            for item in detections:
                label = item["label"]
                counts_by_label[label] = counts_by_label.get(label, 0) + 1

            sample_results.append(
                {
                    "frameIndex": frame_index,
                    "timestampSec": round(frame_index / (fps if fps and fps > 0 else 1), 2),
                    "detections": detections,
                }
            )

            if len(preview_frames) < 3:
                preview_frames.append(_encode_image_to_base64(result.plot()))

            frame_index += 1
    finally:
        cap.release()
        os.remove(temp_path)

    return {
        "source": file.filename or "uploaded-video",
        "fps": fps_value,
        "totalFrames": total_frames,
        "sampledFrames": processed_frames,
        "totalDetections": total_detections,
        "countsByLabel": counts_by_label,
        "frameResults": sample_results,
        "previewFramesBase64": preview_frames,
    }


@app.post("/infer/reconstruct-3d")
def reconstruct_3d(
    file_a: UploadFile = File(..., alias="fileA"),
    file_b: UploadFile = File(..., alias="fileB"),
) -> dict[str, Any]:
    image_a = _decode_upload_image(file_a)
    image_b = _decode_upload_image(file_b)

    if image_a.shape[:2] != image_b.shape[:2]:
        image_b = cv2.resize(image_b, (image_a.shape[1], image_a.shape[0]))

    det_a = _extract_detections(model.predict(source=image_a, verbose=False)[0])
    det_b = _extract_detections(model.predict(source=image_b, verbose=False)[0])
    bbox_a = _largest_bbox(det_a)
    bbox_b = _largest_bbox(det_b)

    gray_a = cv2.cvtColor(image_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(image_b, cv2.COLOR_BGR2GRAY)
    mask_a = _mask_from_bbox(image_a.shape, bbox_a)
    mask_b = _mask_from_bbox(image_b.shape, bbox_b)

    orb = cv2.ORB_create(nfeatures=2500)
    kp_a, des_a = orb.detectAndCompute(gray_a, mask_a)
    kp_b, des_b = orb.detectAndCompute(gray_b, mask_b)

    if des_a is None or des_b is None or len(kp_a) < 12 or len(kp_b) < 12:
        raise HTTPException(
            status_code=400,
            detail="특징점이 부족합니다. 시점 차이가 있는 전차 이미지 2장을 입력해 주세요.",
        )

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    knn_matches = matcher.knnMatch(des_a, des_b, k=2)
    good_matches = []
    for pair in knn_matches:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < 0.75 * n.distance:
            good_matches.append(m)

    if len(good_matches) < 12:
        raise HTTPException(
            status_code=400,
            detail="매칭점이 부족합니다. 겹치는 전차 장면의 프레임을 사용해 주세요.",
        )

    pts_a = np.float32([kp_a[m.queryIdx].pt for m in good_matches])
    pts_b = np.float32([kp_b[m.trainIdx].pt for m in good_matches])

    h, w = gray_a.shape
    focal = float(max(w, h))
    cx, cy = w / 2.0, h / 2.0
    k_mat = np.array([[focal, 0, cx], [0, focal, cy], [0, 0, 1]], dtype=np.float64)

    essential, inlier_mask = cv2.findEssentialMat(
        pts_a,
        pts_b,
        cameraMatrix=k_mat,
        method=cv2.RANSAC,
        prob=0.999,
        threshold=1.5,
    )
    if essential is None or inlier_mask is None:
        raise HTTPException(status_code=400, detail="기하 추정에 실패했습니다.")

    _, r_mat, t_vec, pose_mask = cv2.recoverPose(essential, pts_a, pts_b, cameraMatrix=k_mat)
    inlier_idx = (pose_mask.ravel() > 0).nonzero()[0]
    if inlier_idx.size < 10:
        raise HTTPException(status_code=400, detail="유효한 3D 복원 점이 부족합니다.")

    pts_a_in = pts_a[inlier_idx].T
    pts_b_in = pts_b[inlier_idx].T

    p1 = k_mat @ np.hstack((np.eye(3), np.zeros((3, 1))))
    p2 = k_mat @ np.hstack((r_mat, t_vec))
    points_4d = cv2.triangulatePoints(p1, p2, pts_a_in, pts_b_in)
    points_3d = (points_4d[:3] / points_4d[3]).T

    valid = np.isfinite(points_3d).all(axis=1)
    valid = valid & (points_3d[:, 2] > 0.0)
    points_3d = points_3d[valid]

    if points_3d.shape[0] == 0:
        raise HTTPException(status_code=400, detail="3D 점 복원 결과가 비어 있습니다.")

    max_points = 1200
    if points_3d.shape[0] > max_points:
        step = max(1, points_3d.shape[0] // max_points)
        points_3d = points_3d[::step][:max_points]

    x_min, y_min, z_min = points_3d.min(axis=0).tolist()
    x_max, y_max, z_max = points_3d.max(axis=0).tolist()

    return {
        "sourceA": file_a.filename or "frame-a",
        "sourceB": file_b.filename or "frame-b",
        "matchedKeypoints": len(good_matches),
        "inlierMatches": int(inlier_idx.size),
        "pointCount": int(points_3d.shape[0]),
        "bboxA": list(bbox_a) if bbox_a else None,
        "bboxB": list(bbox_b) if bbox_b else None,
        "bounds": {
            "x": [x_min, x_max],
            "y": [y_min, y_max],
            "z": [z_min, z_max],
        },
        "points3d": points_3d.tolist(),
    }


@app.post("/infer/reconstruct-3d-multi")
def reconstruct_3d_multi(files: list[UploadFile] = File(..., alias="files")) -> dict[str, Any]:
    if len(files) < 3:
        raise HTTPException(status_code=400, detail="최소 3장 이상의 이미지가 필요합니다.")

    print(f"[3D-MULTI] request received: {len(files)} files", flush=True)
    runtime = _load_mast3r_runtime()
    print(f"[3D-MULTI] runtime ready on device={runtime['device']}", flush=True)

    temp_paths: list[str] = []
    try:
        print("[3D-MULTI] stage 1/6: saving uploaded files to temp", flush=True)
        for file in files:
            suffix = ".jpg"
            if file.filename and "." in file.filename:
                suffix = f".{file.filename.rsplit('.', 1)[1]}"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                tmp_file.write(file.file.read())
                temp_paths.append(tmp_file.name)

        print("[3D-MULTI] stage 2/6: loading images", flush=True)
        imgs = runtime["load_images"](temp_paths, size=512)
        print(f"[3D-MULTI] loaded {len(imgs)} images", flush=True)

        print("[3D-MULTI] stage 3/6: creating image pairs", flush=True)
        pairs = runtime["make_pairs"](
            imgs,
            scene_graph="complete",
            prefilter=None,
            symmetrize=True,
        )
        print(f"[3D-MULTI] pair count: {len(pairs)}", flush=True)

        print("[3D-MULTI] stage 4/6: running pair inference", flush=True)
        output = runtime["inference"](
            pairs,
            runtime["model"],
            device=runtime["device"],
            batch_size=1,
            verbose=False,
        )
        print("[3D-MULTI] inference complete", flush=True)

        print("[3D-MULTI] stage 5/6: global alignment optimization", flush=True)
        scene = runtime["global_aligner"](
            output,
            device=runtime["device"],
            mode=runtime["GlobalAlignerMode"].PointCloudOptimizer,
        )
        scene.compute_global_alignment(
            init="mst",
            niter=300,
            schedule="cosine",
            lr=0.01,
        )
        print("[3D-MULTI] global alignment complete", flush=True)

        pts3d_per_view = scene.get_pts3d()
        conf_per_view = scene.get_conf()
        src_images = getattr(scene, "imgs", imgs)

        all_points: list[np.ndarray] = []
        all_colors: list[np.ndarray] = []
        conf_thresh = float(os.getenv("MAST3R_CONF_THRESH", "2.0"))
        print(f"[3D-MULTI] stage 6/6: fusing points (conf>{conf_thresh})", flush=True)

        for view_idx, (pts, conf, img) in enumerate(zip(pts3d_per_view, conf_per_view, src_images)):
            pts_np = pts.detach().cpu().numpy()
            conf_np = conf.detach().cpu().numpy()
            img_tensor = img["img"] if isinstance(img, dict) else img
            rgb_np = _to_uint8_rgb(img_tensor)

            mask = conf_np > conf_thresh
            view_points = pts_np[mask]
            view_colors = rgb_np[mask]
            valid = np.isfinite(view_points).all(axis=1)
            view_points = view_points[valid]
            view_colors = view_colors[valid]
            if view_points.size > 0:
                all_points.append(view_points)
                all_colors.append(view_colors)
            print(
                f"[3D-MULTI] view {view_idx + 1}/{len(src_images)} "
                f"-> points={view_points.shape[0]}",
                flush=True,
            )

        if not all_points:
            raise HTTPException(status_code=400, detail="복원된 3D 점이 없습니다.")

        points = np.concatenate(all_points, axis=0)
        colors = np.concatenate(all_colors, axis=0)
        max_points = int(os.getenv("MAST3R_MAX_POINTS", "12000"))
        if points.shape[0] > max_points:
            idx = np.random.choice(points.shape[0], size=max_points, replace=False)
            points = points[idx]
            colors = colors[idx]
            print(f"[3D-MULTI] downsampled to {max_points} points", flush=True)

        x_min, y_min, z_min = points.min(axis=0).tolist()
        x_max, y_max, z_max = points.max(axis=0).tolist()
        print(f"[3D-MULTI] finished. final points={points.shape[0]}", flush=True)

        # Persist as PLY for external viewers/web loaders.
        ply_name = f"mast3r_{uuid.uuid4().hex}.ply"
        ply_abs_path = os.path.join(OUTPUTS_DIR, ply_name)
        try:
            _write_ply_ascii(points, colors, ply_abs_path)
            print(f"[3D-MULTI] saved ply -> {ply_abs_path}", flush=True)
        except Exception as e:
            # Don't fail inference response if file write fails.
            print(f"[3D-MULTI] WARNING: failed to save ply: {e}", flush=True)
            ply_name = ""
            ply_abs_path = ""

        return {
            "sourceCount": len(files),
            "pairCount": len(pairs),
            "pointCount": int(points.shape[0]),
            "bounds": {
                "x": [x_min, x_max],
                "y": [y_min, y_max],
                "z": [z_min, z_max],
            },
            "points3d": points.tolist(),
            "colorsRgb": colors.tolist(),
            "ply": {
                "fileName": ply_name,
                "relativePath": f"outputs/{ply_name}" if ply_name else None,
                "downloadUrl": f"/outputs/{ply_name}" if ply_name else None,
                "absolutePath": ply_abs_path if ply_abs_path else None,
            },
        }
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass
