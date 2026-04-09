"""
VoD 비교 시각화: KITTI 박스 → velo, AI 융합 API 클라이언트, BEV 플롯.
"""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any

import numpy as np
import requests


def kitti_cam_rect_to_velo_points(xyz_cam: np.ndarray, calib: dict[str, np.ndarray]) -> np.ndarray | None:
    r0 = calib.get("R0_rect")
    tr = calib.get("Tr_velo_to_cam")
    if tr is None:
        tr = calib.get("Tr_velo_cam")
    if r0 is None or tr is None:
        return None
    R0 = np.eye(4, dtype=np.float64)
    R0[:3, :3] = np.asarray(r0, dtype=np.float64).reshape(3, 3)
    T = np.eye(4, dtype=np.float64)
    T[:3, :] = np.asarray(tr, dtype=np.float64).reshape(3, 4)
    M = R0 @ T
    Minv = np.linalg.inv(M)
    N = int(xyz_cam.shape[0])
    hom = np.hstack([xyz_cam.astype(np.float64), np.ones((N, 1), dtype=np.float64)])
    return (Minv @ hom.T).T[:, :3]


def roty_cam(ry: float) -> np.ndarray:
    """KITTI camera: rotation around Y (아래 방향) 축."""
    c, s = np.cos(ry), np.sin(ry)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)


def kitti_box_bottom_corners_cam(
    h: float, w: float, l: float, x: float, y: float, z: float, ry: float
) -> np.ndarray:
    """바닥면 4 꼭짓점 (카메라 좌표), Nx3. KITTI: (x,y,z)는 바닥면 중심."""
    x_corners = np.array([l / 2, l / 2, -l / 2, -l / 2], dtype=np.float64)
    z_corners = np.array([w / 2, -w / 2, -w / 2, w / 2], dtype=np.float64)
    y_corners = np.zeros(4, dtype=np.float64)
    R = roty_cam(ry)
    corners = R @ np.vstack([x_corners, y_corners, z_corners])
    corners[0, :] += x
    corners[1, :] += y
    corners[2, :] += z
    return corners.T


def label_rows_to_velo_footprints(
    rows: list[dict[str, Any]],
    calib: dict[str, np.ndarray],
    skip: frozenset[str] | None = None,
) -> list[dict[str, Any]]:
    """각 객체: class, polygon_xy (4,2) velo 평면, center_velo (3,)"""
    skip = skip or frozenset({"DontCare", "dontcare"})
    out: list[dict[str, Any]] = []
    for r in rows:
        if r["class"] in skip:
            continue
        h, w, l = r["dims_hwl"]
        x, y, z = r["center"]
        ry = float(r["yaw"])
        bottom_cam = kitti_box_bottom_corners_cam(h, w, l, x, y, z, ry)
        velo = kitti_cam_rect_to_velo_points(bottom_cam, calib)
        if velo is None:
            continue
        poly = velo[:, :2]
        ctr = velo.mean(axis=0)
        out.append({"class": r["class"], "polygon_xy": poly, "center_velo": ctr})
    return out


def post_vod_radar_fusion(
    ai_base_url: str,
    radar_path: Path,
    image_path: Path | None,
    lidar_path: Path | None,
    radar_prev_path: Path | None = None,
    timeout_s: int = 120,
) -> dict[str, Any]:
    """ai-inference :8001 /infer/vod/radar-fusion"""
    url = ai_base_url.rstrip("/") + "/infer/vod/radar-fusion"
    files: dict[str, Any] = {
        "radar": (radar_path.name, open(radar_path, "rb"), "application/octet-stream"),
    }
    closers: list[Any] = [files["radar"][1]]
    try:
        if image_path and image_path.is_file():
            files["image"] = (image_path.name, open(image_path, "rb"), "image/jpeg")
            closers.append(files["image"][1])
        if lidar_path and lidar_path.is_file():
            files["lidar"] = (lidar_path.name, open(lidar_path, "rb"), "application/octet-stream")
            closers.append(files["lidar"][1])
        if radar_prev_path and radar_prev_path.is_file():
            files["radar_prev"] = (
                radar_prev_path.name,
                open(radar_prev_path, "rb"),
                "application/octet-stream",
            )
            closers.append(files["radar_prev"][1])
        r = requests.post(url, files=files, timeout=timeout_s)
        r.raise_for_status()
        return r.json()
    finally:
        for f in closers:
            try:
                f.close()
            except Exception:
                pass


def post_yolo_image_only(ai_base_url: str, image_path: Path, timeout_s: int = 60) -> dict[str, Any]:
    url = ai_base_url.rstrip("/") + "/infer/image"
    with open(image_path, "rb") as f:
        r = requests.post(url, files={"file": (image_path.name, f, "image/jpeg")}, timeout=timeout_s)
    r.raise_for_status()
    return r.json()


def b64_to_pil_image(b64: str):
    from PIL import Image

    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")
