import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AnyFilesInterceptor,
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

type UploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  health() {
    return this.aiService.health();
  }

  @Post('yolo/image')
  @UseInterceptors(FileInterceptor('file'))
  inferImage(
    @Req() req: Request & { user: { userId: number } },
    @UploadedFile() file?: UploadFile,
  ) {
    if (!file) {
      throw new BadRequestException('이미지 파일이 필요합니다.');
    }

    return this.aiService.inferImage(file, req.user.userId);
  }

  @Post('yolo/video')
  @UseInterceptors(FileInterceptor('file'))
  inferVideo(
    @Req() req: Request & { user: { userId: number } },
    @UploadedFile() file?: UploadFile,
  ) {
    if (!file) {
      throw new BadRequestException('영상 파일이 필요합니다.');
    }

    return this.aiService.inferVideo(file, req.user.userId);
  }

  @Post('reconstruct/points')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'fileA', maxCount: 1 },
      { name: 'fileB', maxCount: 1 },
    ]),
  )
  reconstructPoints(
    @Req() req: Request & { user: { userId: number } },
    @UploadedFiles()
    files?: { fileA?: UploadFile[]; fileB?: UploadFile[] },
  ) {
    const fileA = files?.fileA?.[0];
    const fileB = files?.fileB?.[0];
    if (!fileA || !fileB) {
      throw new BadRequestException('image A/B 파일이 모두 필요합니다.');
    }

    return this.aiService.reconstructPoints(fileA, fileB, req.user.userId);
  }

  @Post('reconstruct/points-multi')
  @UseInterceptors(AnyFilesInterceptor())
  reconstructPointsMulti(
    @Req() req: Request & { user: { userId: number } },
    @UploadedFiles() files?: UploadFile[],
  ) {
    if (!files || files.length < 3) {
      throw new BadRequestException('최소 3장의 이미지 파일이 필요합니다.');
    }

    return this.aiService.reconstructPointsMulti(files, req.user.userId);
  }
}
