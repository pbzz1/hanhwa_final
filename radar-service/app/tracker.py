"""
상수속도 Kalman 필터 + 헝가리안(SciPy) 데이터 연계 기반 다중 목표 추적.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linear_sum_assignment

from app.candidate_scoring import ClusterCandidate
from app.config import RadarPipelineConfig


@dataclass
class KalmanCV3D:
    """6상태 [x,y,z,vx,vy,vz] 상수속도 모델, 관측은 위치 3차원."""

    dt: float
    x: np.ndarray = field(default_factory=lambda: np.zeros(6, dtype=np.float64))
    P: np.ndarray = field(default_factory=lambda: np.eye(6, dtype=np.float64) * 5.0)

    def __post_init__(self) -> None:
        self.F = np.eye(6, dtype=np.float64)
        self.F[0:3, 3:6] = np.eye(3, dtype=np.float64) * self.dt
        self.H = np.zeros((3, 6), dtype=np.float64)
        self.H[0:3, 0:3] = np.eye(3, dtype=np.float64)

    def configure_noise(self, q_pos: float, q_vel: float, r_meas: float) -> None:
        """프로세스·관측 잡음 대각."""
        self.Q = np.eye(6, dtype=np.float64)
        self.Q[0:3, 0:3] *= q_pos**2
        self.Q[3:6, 3:6] *= q_vel**2
        self.R = np.eye(3, dtype=np.float64) * (r_meas**2)

    def predict(self) -> None:
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q

    def update(self, z: np.ndarray) -> None:
        z = z.reshape(3)
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        I = np.eye(6, dtype=np.float64)
        self.P = (I - K @ self.H) @ self.P


@dataclass
class Track:
    track_id: str
    kf: KalmanCV3D
    hits: int = 1
    age: int = 1
    time_since_update: int = 0
    candidate_confidence_last: float = 0.0

    @property
    def position(self) -> np.ndarray:
        return self.kf.x[0:3].copy()

    @property
    def velocity(self) -> np.ndarray:
        return self.kf.x[3:6].copy()


class TrackManager:
    """프레임마다 예측·연계·갱신."""

    def __init__(self, cfg: RadarPipelineConfig | None = None) -> None:
        self.cfg = cfg or RadarPipelineConfig()
        self._next_id = 1
        self.tracks: dict[str, Track] = {}

    def _new_track(self, centroid: np.ndarray, conf: float) -> Track:
        tid = f"T{self._next_id}"
        self._next_id += 1
        kf = KalmanCV3D(dt=self.cfg.frame_dt_s)
        kf.configure_noise(self.cfg.kalman_pos_noise, self.cfg.kalman_vel_noise, self.cfg.kalman_meas_noise)
        kf.x[0:3] = centroid.astype(np.float64)
        kf.x[3:6] = 0.0
        return Track(track_id=tid, kf=kf, candidate_confidence_last=conf)

    def step(self, detections: list[ClusterCandidate]) -> list[Track]:
        """
        검출 목록에 대해 기존 트랙을 예측하고 헝가리안으로 매칭한 뒤 Kalman 갱신·신규 생성합니다.
        """
        gate = self.cfg.track_gate_m
        for t in self.tracks.values():
            t.kf.predict()
            t.age += 1
            t.time_since_update += 1

        if not self.tracks:
            for d in detections:
                nt = self._new_track(d.centroid, d.candidate_confidence)
                self.tracks[nt.track_id] = nt
            return list(self.tracks.values())

        tids = list(self.tracks.keys())
        pred = np.stack([self.tracks[i].position for i in tids], axis=0)
        n_t, n_d = pred.shape[0], len(detections)
        cost = np.full((n_t, n_d), 1e6, dtype=np.float64)
        det_xyz = np.stack([d.centroid for d in detections], axis=0) if n_d else np.zeros((0, 3))
        for i in range(n_t):
            for j in range(n_d):
                dist = float(np.linalg.norm(pred[i] - det_xyz[j]))
                if dist < gate:
                    cost[i, j] = dist

        row_ind, col_ind = linear_sum_assignment(cost)
        matched_det: set[int] = set()
        matched_tid: set[str] = set()
        for r, c in zip(row_ind, col_ind):
            if cost[r, c] >= 1e5:
                continue
            tid = tids[r]
            tr = self.tracks[tid]
            tr.kf.update(det_xyz[c])
            tr.hits += 1
            tr.time_since_update = 0
            tr.candidate_confidence_last = detections[c].candidate_confidence
            matched_det.add(c)
            matched_tid.add(tid)

        for j in range(n_d):
            if j not in matched_det:
                nt = self._new_track(detections[j].centroid, detections[j].candidate_confidence)
                self.tracks[nt.track_id] = nt

        stale = [tid for tid, tr in self.tracks.items() if tr.time_since_update > 4]
        for tid in stale:
            del self.tracks[tid]

        return list(self.tracks.values())


def track_stability(tr: Track) -> float:
    """
    연속 관측 횟수와 미관측 프레임을 반영한 0~1 안정도 휴리스틱.
    """
    miss = tr.time_since_update
    base = min(1.0, tr.hits / 8.0)
    decay = max(0.0, 1.0 - 0.2 * miss)
    return float(max(0.0, min(1.0, base * decay)))


def example_tracker() -> None:
    cfg = RadarPipelineConfig(frame_dt_s=0.1, track_gate_m=50.0)
    mgr = TrackManager(cfg)
    d0 = ClusterCandidate(0, np.array([10.0, 0.0, 0.0]), 10.0, 0, 0, 0, 0, 10, 0.8)
    d1 = ClusterCandidate(1, np.array([10.5, 0.1, 0.0]), 10.5, 0, 0, 0, 0, 8, 0.7)
    mgr.step([d0])
    tr = mgr.step([d1])
    assert len(tr) >= 1


if __name__ == "__main__":
    example_tracker()
    print("tracker OK")
