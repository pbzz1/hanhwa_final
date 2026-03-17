# 한화 전차 프로젝트 (hanhwa_final)

전차 3D 모델링, SAR 데이터 크롤링, AI 추론을 포함한 통합 프로젝트입니다.

## 프로젝트 구조

- **backend/** - NestJS API 서버
- **frontend/** - React + Vite 프론트엔드
- **ai-inference/** - AI 추론 서버 (MASt3R, YOLO 등)
- **gaussian-splatting/** - 3D Gaussian Splatting (별도 clone 필요)
- **tank_sar_crawling/** - 전차 SAR 데이터 크롤링
- **google_earth_crawling/** - Google Earth SAR 크롤링
- **notebooks/** - Colab 학습 노트북
- **docs/** - 프로젝트 문서

## 환경 설정

### 1. 환경 변수

```bash
# frontend
cp frontend/.env.example frontend/.env
# frontend/.env에 VITE_KAKAO_MAP_APP_KEY 설정

# backend
cp backend/.env.example backend/.env
# backend/.env에 DATABASE_URL, JWT_SECRET 등 설정
```

### 2. 외부 의존성 (별도 설치)

- **gaussian-splatting**: [graphdeco-inria/gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting) clone 후 프로젝트 루트에 배치
- **ai-inference/mast3r**: MASt3R 모델 별도 설치 (ai-inference/README.md 참고)
- **tank_sar_crawling/downloaded_tank_sar**: SAR 데이터는 별도 다운로드

자세한 설정은 `docs/` 폴더의 문서를 참고하세요.

## 실행

```bash
# Backend
cd backend && npm install && npx prisma generate && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev

# AI Inference
# run_ai_inference.bat 또는 python ai-inference/main.py
```

## 라이선스

프로젝트 내부 정책에 따릅니다.
