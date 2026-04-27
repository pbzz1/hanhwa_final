# Pink Ward

> SAR 위성, UAV 영상, FMCW 레이더 데이터를 활용한 전장 상황 인식 및 지휘결심 지원 웹 플랫폼

Pink Ward는 한반도 전장 상황을 가정하여 **다중 센서 기반 표적 탐지, 위험지역 예측, 전장 상황 시각화**를 제공하는 지휘결심 지원 데모 웹 프로젝트입니다.  
React 기반 프론트엔드, NestJS API 서버, PostgreSQL 데이터베이스, Python 기반 AI 추론 파이프라인을 하나의 모노레포 구조로 통합했습니다.

본 프로젝트는 단순 지도 시각화가 아니라, **SAR 광역 탐지 → UAV 객체 식별 → FMCW 레이더 기반 이동·위험 분석 → 드론 기반 객체 식별(YOLO) -> 통합 상황판 제공**이라는 단계적 센서 파이프라인을 구현하는 것을 목표로 했습니다.

---

## 프로젝트 개요

### 개발 목적

군 작전 환경에서는 단일 센서만으로 표적을 식별하거나 위험지역을 판단하기 어렵습니다.  
따라서 본 프로젝트는 SAR, UAV, FMCW 레이더 등 서로 다른 센서 정보를 단계적으로 결합하여 다음과 같은 기능을 제공하도록 설계했습니다.

- 광역 감시 영역에서 관심 지역 후보 도출
- UAV 영상 기반 객체 탐지 및 표적 정보 확인
- FMCW 레이더 데이터 기반 객체 이동·위험도 분석
- 지도 기반 전장 상황판에서 아군·적군·위험지역 통합 시각화
- 지휘관 관점의 상황 판단 및 의사결정 보조

---

## 주요 기능

### 1. 전장 상황판

- MapLibre 기반 지도 시각화
- 아군 부대, 적 표적, 침투 지점, 위험지역 오버레이 표시
- 표적 선택 시 상세 정보 패널 제공
- 작전 구역, 시나리오 단계, 센서별 탐지 결과를 한 화면에서 확인

### 2. SAR 기반 광역 감시 흐름

- SAR 위성 영상을 활용한 광역 감시 단계 구성
- 의심 지역 또는 이동 가능 지역을 지도 위에 표시
- 후속 UAV 및 레이더 분석으로 이어지는 초기 탐지 단계로 설계

### 3. UAV 객체 탐지 시나리오

- UAV EO/IR 영상 기반 객체 식별 흐름 구현
- YOLO 기반 객체 탐지 결과를 연동할 수 있는 구조 설계
- 탐지 객체를 전장 상황판의 표적 정보와 연결

### 4. FMCW 레이더 기반 위험 분석

- View-of-Delft(VoD) 형식의 레이더 데이터를 활용한 분석 파이프라인 구성
- 레이더 포인트 클라우드 전처리
- DBSCAN/HDBSCAN 기반 표적 후보 군집화
- 객체 이동 방향, 속도, 지속성, 위험도 기반 점수화
- 위험지역 오버레이 및 우선순위 표시

### 5. 백엔드 API 및 데이터베이스

- NestJS 기반 REST API 서버 구현
- JWT 인증 구조 적용
- Prisma ORM과 PostgreSQL을 활용한 데이터 모델링
- 사용자, 미디어, 추론 결과, 부대, 침투 지점, 전술 판단 데이터 관리

### 6. AI 추론 서버 연동 구조

- Python FastAPI 기반 AI 추론 서버 분리
- YOLO, 레이더 분석, 위험도 추론 등 외부 AI 모듈 연동 가능
- 백엔드에서 AI 서버를 프록시 형태로 호출하는 구조 설계

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router |
| Map | MapLibre GL, MGRS 좌표 처리 |
| Backend | NestJS, Prisma, PostgreSQL |
| Auth | JWT, Passport, bcrypt |
| AI / Data | Python, FastAPI, NumPy, scikit-learn, VoD Dataset |
| Radar Pipeline | DBSCAN, HDBSCAN, Rule-based Risk Scoring, HGB Refinement |
| Deployment | Vercel, Render, PostgreSQL |
| Collaboration | GitHub, Cursor, Markdown Docs |

---

## 시스템 아키텍처

```text
[Frontend - React/Vite]
        |
        | REST API
        v
[Backend - NestJS]
        |
        | Prisma ORM
        v
[PostgreSQL Database]

[Backend - NestJS]
        |
        | AI_INFERENCE_URL
        v
[Python AI Inference Server - FastAPI]
        |
        v
[YOLO / FMCW Radar / VoD Pipeline]
