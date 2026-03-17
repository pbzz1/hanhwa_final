import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
