# hanhwa_final 프로젝트 사용 스택 정리

## 1) 프론트엔드 (웹)
- **언어/런타임**: TypeScript, React 19
- **빌드/개발 도구**: Vite 7, ESLint 9, TypeScript 5
- **라우팅**: `react-router-dom`
- **지도/좌표**: `maplibre-gl`, `mgrs`
- **문서/리포트 유틸**: `html2canvas`, `jspdf`

참고 파일:
- `frontend/package.json`

---

## 2) 백엔드 API
- **프레임워크**: NestJS 11
- **언어/런타임**: TypeScript, Node.js
- **인증/보안**: JWT (`@nestjs/jwt`, `passport`, `passport-jwt`), `bcrypt`
- **검증/직렬화**: `class-validator`, `class-transformer`
- **ORM/DB**: Prisma (`@prisma/client`, `prisma`)
- **테스트**: Jest, Supertest

참고 파일:
- `backend/package.json`

---

## 3) 레이더 서비스
- **API 프레임워크**: FastAPI, Uvicorn
- **수치/ML**: NumPy, SciPy, scikit-learn
- **입력 데이터 처리**: VoD 형식 레이더 `.bin` 파이프라인

참고 파일:
- `radar-service/requirements.txt`

---

## 4) 데이터/운영 관련
- **DB 마이그레이션/시드**: Prisma migrate/seed
- **정적 미디어 서빙**: 프론트 `public/media` 경로 기반 영상/이미지 사용
- **시나리오 시각화**: 지도 레이어 + GeoJSON 기반 이벤트/경로 렌더링

---

## 5) 한 줄 요약 (발표용)
- **Frontend**: React + TypeScript + Vite + MapLibre
- **Backend**: NestJS + Prisma + JWT Auth
- **Radar Service**: FastAPI + NumPy/Scikit-learn
