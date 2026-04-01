import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  listSyncedVodFrameStems,
  pathsForVodFrame,
  pickSyncedFrameIndex,
  readVodFrameBuffers,
  resolveVodDatasetRoot,
} from './vod-dataset.util';

type UploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly inferenceBaseUrl =
    process.env.AI_INFERENCE_URL ?? 'http://localhost:8001';

  /** 3D 복원은 수 분 소요되므로 긴 타임아웃 사용 (ms) */
  private static readonly LONG_REQUEST_MS = 600_000; // 10분

  async health() {
    const response = await fetch(`${this.inferenceBaseUrl}/health`);
    if (!response.ok) {
      throw new InternalServerErrorException(
        'AI 서버 상태를 확인할 수 없습니다.',
      );
    }

    return (await response.json()) as unknown;
  }

  async inferImage(file: UploadFile, userId: number) {
    return this.forwardFile('/infer/image', file, userId, 'IMAGE');
  }

  async inferVideo(file: UploadFile, userId: number) {
    return this.forwardFile('/infer/video', file, userId, 'VIDEO');
  }

  /**
   * VoD 형식 레이더(.bin) + 선택 이미지 + 선택 LiDAR(.bin) → Python AI 서버에서 실제 추론·클러스터링.
   * (레이더: DBSCAN, 이미지: YOLO, LiDAR: ROI 점 수 검증)
   */
  async inferVodRadarFusion(
    radar: UploadFile,
    image: UploadFile | undefined,
    lidar: UploadFile | undefined,
    radarPrev?: UploadFile,
  ) {
    const formData = new FormData();
    formData.append(
      'radar',
      new Blob([new Uint8Array(radar.buffer)], {
        type: radar.mimetype || 'application/octet-stream',
      }),
      radar.originalname || 'radar.bin',
    );
    if (image?.buffer?.length) {
      formData.append(
        'image',
        new Blob([new Uint8Array(image.buffer)], {
          type: image.mimetype || 'image/jpeg',
        }),
        image.originalname || 'frame.jpg',
      );
    }
    if (lidar?.buffer?.length) {
      formData.append(
        'lidar',
        new Blob([new Uint8Array(lidar.buffer)], {
          type: lidar.mimetype || 'application/octet-stream',
        }),
        lidar.originalname || 'lidar.bin',
      );
    }
    if (radarPrev?.buffer?.length) {
      formData.append(
        'radar_prev',
        new Blob([new Uint8Array(radarPrev.buffer)], {
          type: radarPrev.mimetype || 'application/octet-stream',
        }),
        radarPrev.originalname || 'radar_prev.bin',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.inferenceBaseUrl}/infer/vod/radar-fusion`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'AI 추론 서버에 연결할 수 없습니다. ai-inference(기본 :8001) 실행 여부를 확인해 주세요.',
      );
    }

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const responseMessage =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.message === 'string'
          ? data.message
          : 'VoD 레이더 융합 추론에 실패했습니다.';

    if (!response.ok) {
      throw new InternalServerErrorException(responseMessage);
    }

    return data;
  }

  /**
   * VoD KITTI 레이아웃 로컬 폴더에서 이미지·레이더가 모두 있는 프레임만 모은 뒤,
   * 무작위(또는 seed)로 하나 골라 Python과 동일한 융합 추론을 실행합니다.
   * 경로: VOD_DATASET_ROOT 또는 `../vod-devkit/vod-received/view_of_delft_PUBLIC`
   */
  async inferVodRadarFusionAuto(seed?: number) {
    const root = resolveVodDatasetRoot();
    if (!existsSync(root)) {
      throw new BadRequestException(
        `VoD 데이터 루트가 없습니다. VOD_DATASET_ROOT를 설정하거나 vod-devkit/vod-received/view_of_delft_PUBLIC을 두세요: ${root}`,
      );
    }
    const frames = await listSyncedVodFrameStems(root);
    if (!frames.length) {
      throw new BadRequestException(
        `동기화된 프레임이 없습니다 (lidar/training/image_2 의 .jpg 와 radar/training/velodyne 의 .bin 이름 stem 일치). root=${root}`,
      );
    }
    const idx = pickSyncedFrameIndex(frames, seed);
    const frameId = frames[idx]!;
    const { radar, image, lidar } = await readVodFrameBuffers(root, frameId);

    let radarPrevFile: UploadFile | undefined;
    if (idx > 0) {
      const prevId = frames[idx - 1]!;
      try {
        const prevPath = pathsForVodFrame(root, prevId).radarPath;
        const prevBuf = await readFile(prevPath);
        radarPrevFile = {
          buffer: prevBuf,
          originalname: `${prevId}.bin`,
          mimetype: 'application/octet-stream',
        };
      } catch {
        radarPrevFile = undefined;
      }
    }

    const radarFile: UploadFile = {
      buffer: radar,
      originalname: `${frameId}.bin`,
      mimetype: 'application/octet-stream',
    };
    const imageFile: UploadFile = {
      buffer: image,
      originalname: `${frameId}.jpg`,
      mimetype: 'image/jpeg',
    };
    const lidarFile: UploadFile | undefined =
      lidar && lidar.length > 0
        ? {
            buffer: lidar,
            originalname: `${frameId}_lidar.bin`,
            mimetype: 'application/octet-stream',
          }
        : undefined;

    const data = await this.inferVodRadarFusion(
      radarFile,
      imageFile,
      lidarFile,
      radarPrevFile,
    );
    return {
      ...(data as Record<string, unknown>),
      autoFrameId: frameId,
      autoPrevFrameId: idx > 0 ? frames[idx - 1] : undefined,
      autoDatasetRoot: root,
      autoSyncedFrameCount: frames.length,
    };
  }

  async reconstructPoints(fileA: UploadFile, fileB: UploadFile, userId: number) {
    const mediaA = await this.prisma.media.create({
      data: {
        uploaderId: userId,
        type: 'IMAGE',
        originalName: fileA.originalname,
        mimeType: fileA.mimetype,
        size: fileA.buffer.length,
      },
    });
    await this.prisma.media.create({
      data: {
        uploaderId: userId,
        type: 'IMAGE',
        originalName: fileB.originalname,
        mimeType: fileB.mimetype,
        size: fileB.buffer.length,
      },
    });

    const formData = new FormData();
    formData.append(
      'fileA',
      new Blob([new Uint8Array(fileA.buffer)], { type: fileA.mimetype }),
      fileA.originalname,
    );
    formData.append(
      'fileB',
      new Blob([new Uint8Array(fileB.buffer)], { type: fileB.mimetype }),
      fileB.originalname,
    );

    let response: Response;
    try {
      response = await fetch(`${this.inferenceBaseUrl}/infer/reconstruct-3d`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(AiService.LONG_REQUEST_MS),
      });
    } catch {
      const offlineMessage =
        'AI 추론 서버에 연결할 수 없습니다. 서버 실행 상태와 포트를 확인해 주세요.';
      await this.prisma.inferenceResult.create({
        data: {
          mediaId: mediaA.id,
          model: '3D-SFM',
          task: '/infer/reconstruct-3d',
          errorMessage: offlineMessage,
          rawResponse: this.toPrismaJson({
            error: 'INFERENCE_SERVER_UNREACHABLE',
            baseUrl: this.inferenceBaseUrl,
          }),
        },
      });
      throw new ServiceUnavailableException(offlineMessage);
    }

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const responseMessage =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.message === 'string'
          ? data.message
          : '3D 점 복원 요청에 실패했습니다.';

    if (!response.ok) {
      await this.prisma.inferenceResult.create({
        data: {
          mediaId: mediaA.id,
          model: '3D-SFM',
          task: '/infer/reconstruct-3d',
          errorMessage: responseMessage,
          rawResponse: this.toPrismaJson(data),
        },
      });
      throw new InternalServerErrorException(responseMessage);
    }

    await this.prisma.inferenceResult.create({
      data: {
        mediaId: mediaA.id,
        model: '3D-SFM',
        task: '/infer/reconstruct-3d',
        rawResponse: this.toPrismaJson(data),
      },
    });

    return data;
  }

  async reconstructPointsMulti(files: UploadFile[], userId: number) {
    const medias = await Promise.all(
      files.map((file) =>
        this.prisma.media.create({
          data: {
            uploaderId: userId,
            type: 'IMAGE',
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.buffer.length,
          },
        }),
      ),
    );
    const primaryMedia = medias[0];

    const formData = new FormData();
    for (const file of files) {
      formData.append(
        'files',
        new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
        file.originalname,
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.inferenceBaseUrl}/infer/reconstruct-3d-multi`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(AiService.LONG_REQUEST_MS),
      });
    } catch {
      const offlineMessage =
        'AI 추론 서버에 연결할 수 없습니다. 서버 실행 상태와 포트를 확인해 주세요.';
      await this.prisma.inferenceResult.create({
        data: {
          mediaId: primaryMedia.id,
          model: 'MASt3R',
          task: '/infer/reconstruct-3d-multi',
          errorMessage: offlineMessage,
          rawResponse: this.toPrismaJson({
            error: 'INFERENCE_SERVER_UNREACHABLE',
            baseUrl: this.inferenceBaseUrl,
          }),
        },
      });
      throw new ServiceUnavailableException(offlineMessage);
    }

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const responseMessage =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.message === 'string'
          ? data.message
          : '멀티 이미지 3D 복원 요청에 실패했습니다.';

    if (!response.ok) {
      await this.prisma.inferenceResult.create({
        data: {
          mediaId: primaryMedia.id,
          model: 'MASt3R',
          task: '/infer/reconstruct-3d-multi',
          errorMessage: responseMessage,
          rawResponse: this.toPrismaJson(data),
        },
      });
      throw new InternalServerErrorException(responseMessage);
    }

    await this.prisma.inferenceResult.create({
      data: {
        mediaId: primaryMedia.id,
        model: 'MASt3R',
        task: '/infer/reconstruct-3d-multi',
        rawResponse: this.toPrismaJson(data),
      },
    });

    return data;
  }

  private async forwardFile(
    path: string,
    file: UploadFile,
    userId: number,
    type: 'IMAGE' | 'VIDEO',
  ) {
    const media = await this.prisma.media.create({
      data: {
        uploaderId: userId,
        type,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.buffer.length,
      },
    });

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );

    let response: Response;
    try {
      response = await fetch(`${this.inferenceBaseUrl}${path}`, {
        method: 'POST',
        body: formData,
      });
    } catch {
      const offlineMessage =
        'AI 추론 서버에 연결할 수 없습니다. 서버 실행 상태와 포트를 확인해 주세요.';
      await this.prisma.inferenceResult.create({
        data: {
          mediaId: media.id,
          model: 'YOLO',
          task: path,
          errorMessage: offlineMessage,
          rawResponse: this.toPrismaJson({
            error: 'INFERENCE_SERVER_UNREACHABLE',
            baseUrl: this.inferenceBaseUrl,
          }),
        },
      });
      throw new ServiceUnavailableException(offlineMessage);
    }

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const responseMessage =
      typeof data.message === 'string'
        ? data.message
        : 'AI 추론 서버 호출에 실패했습니다.';

    if (!response.ok) {
      await this.prisma.inferenceResult.create({
        data: {
          mediaId: media.id,
          model: 'YOLO',
          task: path,
          errorMessage: responseMessage,
          rawResponse: this.toPrismaJson(data),
        },
      });
      throw new InternalServerErrorException(responseMessage);
    }

    await this.prisma.inferenceResult.create({
      data: {
        mediaId: media.id,
        model: 'YOLO',
        task: path,
        detections: this.toPrismaJson(data.detections),
        rawResponse: this.toPrismaJson(data),
      },
    });

    return data;
  }

  private toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
