import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import * as path from 'path';

/** 환경변수 없으면 repo 기준 `vod-devkit/vod-received/view_of_delft_PUBLIC` 추정 */
export function resolveVodDatasetRoot(): string {
  const env = process.env.VOD_DATASET_ROOT?.trim();
  if (env) {
    return path.resolve(env);
  }
  const fromBackendCwd = path.resolve(
    process.cwd(),
    '..',
    'vod-devkit',
    'vod-received',
    'view_of_delft_PUBLIC',
  );
  if (existsSync(fromBackendCwd)) {
    return fromBackendCwd;
  }
  const fromRepoRoot = path.resolve(
    process.cwd(),
    'vod-devkit',
    'vod-received',
    'view_of_delft_PUBLIC',
  );
  return fromRepoRoot;
}

/** `image_2`의 .jpg stem과 `radar/.../velodyne`의 .bin stem 교집합 (정렬) */
export async function listSyncedVodFrameStems(root: string): Promise<string[]> {
  const camDir = path.join(root, 'lidar', 'training', 'image_2');
  const radDir = path.join(root, 'radar', 'training', 'velodyne');
  const [camEntries, radEntries] = await Promise.all([
    readdir(camDir).catch(() => [] as string[]),
    readdir(radDir).catch(() => [] as string[]),
  ]);
  const jpgs = new Set(
    camEntries
      .filter((f) => f.toLowerCase().endsWith('.jpg'))
      .map((f) => path.basename(f, '.jpg')),
  );
  const bins = new Set(
    radEntries
      .filter((f) => f.toLowerCase().endsWith('.bin'))
      .map((f) => path.basename(f, '.bin')),
  );
  const common = [...jpgs].filter((s) => bins.has(s));
  common.sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na - nb;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
  return common;
}

export function pickSyncedFrame(frames: string[], seed?: number): string {
  if (!frames.length) {
    throw new Error('동기화된 프레임 목록이 비어 있습니다.');
  }
  if (seed === undefined || seed === null || Number.isNaN(Number(seed))) {
    const idx = Math.floor(Math.random() * frames.length);
    return frames[idx]!;
  }
  const s = Math.abs(Math.floor(Number(seed)));
  return frames[s % frames.length]!;
}

export type VodFrameFiles = {
  frameId: string;
  radarPath: string;
  imagePath: string;
  lidarPath: string;
};

export function pathsForVodFrame(root: string, frameId: string): VodFrameFiles {
  return {
    frameId,
    radarPath: path.join(root, 'radar', 'training', 'velodyne', `${frameId}.bin`),
    imagePath: path.join(root, 'lidar', 'training', 'image_2', `${frameId}.jpg`),
    lidarPath: path.join(root, 'lidar', 'training', 'velodyne', `${frameId}.bin`),
  };
}

export async function readVodFrameBuffers(
  root: string,
  frameId: string,
): Promise<{
  radar: Buffer;
  image: Buffer;
  lidar: Buffer | null;
}> {
  const p = pathsForVodFrame(root, frameId);
  const [radar, image] = await Promise.all([
    readFile(p.radarPath),
    readFile(p.imagePath),
  ]);
  let lidar: Buffer | null = null;
  try {
    lidar = await readFile(p.lidarPath);
  } catch {
    lidar = null;
  }
  return { radar, image, lidar };
}
