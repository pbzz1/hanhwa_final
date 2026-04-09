"""
FastAPI: 레이더 바이너리 업로드 → `WebPayload` JSON.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.export_json import payload_to_json_dict, save_web_payload
from app.pipeline import run_pipeline_frame
from app.radar_loader import load_radar_frame_stack, load_vod_radar_bin

APP_DIR = Path(__file__).resolve().parent.parent
OUTPUTS = APP_DIR / "outputs"
OUTPUTS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="FMCW Radar-Only Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("RADAR_CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 단일 프로세스 데모용 전역 추적기(운영에서는 세션/토큰별 분리 권장)
_track_state: dict[str, Any] = {"manager": None}


class ProcessResponse(BaseModel):
    ok: bool = True
    payload: dict[str, Any]


class FilePathRequest(BaseModel):
    """서버가 접근 가능한 경로(로컬 개발용)."""

    path: str = Field(..., description="단일 .bin 경로")
    frame_id: str = "0"
    reset_tracks: bool = False


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "radar-only"}


@app.post("/v1/radar/process", response_model=ProcessResponse)
async def process_upload(
    file: UploadFile = File(..., description="VoD radar .bin (float32 x7)"),
    frame_id: str = "0",
    reset_tracks: bool = False,
    save_output: bool = False,
) -> ProcessResponse:
    """
    레이더 `.bin` 업로드 한 프레임을 처리하고 웹 페이로드를 반환합니다.
    """
    data = await file.read()
    try:
        raw = np.frombuffer(data, dtype=np.float32)
        if raw.size % 7 != 0:
            raise ValueError("byte length must be multiple of 7 floats")
        radar = raw.reshape(-1, 7)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid radar bin: {ex}") from ex

    mgr = None if reset_tracks else _track_state["manager"]
    payload, new_mgr = run_pipeline_frame(
        radar,
        frame_id=frame_id,
        radar_frame_mode="radar",
        track_manager=mgr,
    )
    _track_state["manager"] = new_mgr
    if save_output:
        save_web_payload(OUTPUTS / "web_payload.json", payload)
    return ProcessResponse(payload=payload_to_json_dict(payload))


@app.post("/v1/radar/process_path", response_model=ProcessResponse)
def process_path(body: FilePathRequest) -> ProcessResponse:
    """
    서버 파일 시스템상의 `.bin` 경로로 처리(노트북·배치와 동일 데이터에 편리).
    """
    p = Path(body.path)
    if not p.is_file():
        raise HTTPException(status_code=400, detail=f"File not found: {p}")
    radar = load_vod_radar_bin(p)
    mgr = None if body.reset_tracks else _track_state["manager"]
    payload, new_mgr = run_pipeline_frame(
        radar,
        frame_id=body.frame_id,
        radar_frame_mode="radar",
        track_manager=mgr,
    )
    _track_state["manager"] = new_mgr
    return ProcessResponse(payload=payload_to_json_dict(payload))


class MultiPathRequest(BaseModel):
    paths: list[str]
    frame_id: str = "0"
    frame_dt_s: float = 0.077
    reset_tracks: bool = False


@app.post("/v1/radar/process_paths_stacked", response_model=ProcessResponse)
def process_paths_stacked(body: MultiPathRequest) -> ProcessResponse:
    """
    `radar_3frames` / `radar_5frames` 등 다중 파일을 시간 오프셋과 함께 스택합니다.
    """
    paths = [Path(x) for x in body.paths]
    for p in paths:
        if not p.is_file():
            raise HTTPException(status_code=400, detail=f"File not found: {p}")
    radar, mode = load_radar_frame_stack([str(p) for p in paths], frame_dt_s=body.frame_dt_s)
    mgr = None if body.reset_tracks else _track_state["manager"]
    payload, new_mgr = run_pipeline_frame(
        radar,
        frame_id=body.frame_id,
        radar_frame_mode=mode,
        track_manager=mgr,
        meta_extra={"stacked_paths": [str(p) for p in paths]},
    )
    _track_state["manager"] = new_mgr
    return ProcessResponse(payload=payload_to_json_dict(payload))


@app.get("/v1/demo/payload")
def demo_payload() -> dict[str, Any]:
    """합성 데이터로 생성한 예시 페이로드(연결 테스트용)."""
    rng = np.random.default_rng(7)
    a = rng.normal(size=(40, 3)) * 0.2 + np.array([18.0, 2.0, 0.0])
    rest = rng.normal(size=(40, 4)).astype(np.float32) * 0.5
    radar = np.hstack([a, rest]).astype(np.float32)
    payload, _ = run_pipeline_frame(radar, frame_id="demo", radar_frame_mode="radar", track_manager=None)
    return payload_to_json_dict(payload)
