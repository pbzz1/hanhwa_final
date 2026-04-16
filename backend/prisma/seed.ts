import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const demoVideoUrl =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

/** YOLO 전차 인식 데모 영상 (public/media) */
const yoloTankInfiltrationVideoUrl = '/media/yolo-tank-1.mp4';
const yoloTankSituationVideoUrl = '/media/yolo-tank-3.mp4';

/** 한반도 데모: 북위 38° 기준 — 적 표적 등 */
const PARALLEL_38_N = 38;

/**
 * 카카오맵에 그려지는 군사분계선(휴전선)은 구간마다 북위 38°와 다름(서부는 더 남쪽).
 * 아군은 지도상 분계선 이남에 보이도록 위도 상한을 둠(데모용 근사).
 */
const FRIENDLY_MAX_LAT_SOUTH_OF_MDL = 37.79;

/** 전술대형(교범·훈련소 요강 등 공개 자료 용어): 종대·횡대·쐐기·분산·방어 */
const FORMATION_PRESETS = [
  '종대',
  '횡대',
  '쐐기대형',
  '분산대형',
  '방어대형',
] as const;

function buildPseudoMgrs(lat: number, lng: number, idx: number): string {
  const squares = ['DU', 'DV', 'DW', 'DX', 'DY', 'DZ'] as const;
  const square = squares[idx % squares.length];
  const east = Math.abs(Math.round((lng - 124) * 10000) % 100000)
    .toString()
    .padStart(5, '0');
  const north = Math.abs(Math.round((lat - 33) * 10000) % 100000)
    .toString()
    .padStart(5, '0');
  return `52S${square}${east}${north}`;
}

async function main() {
  await prisma.unit.deleteMany();
  await prisma.infiltrationPoint.deleteMany();

  const demoEmails = ['demo@hanhwa.local', 'viewer@hanhwa.local'] as const;
  await prisma.user.deleteMany({ where: { email: { in: [...demoEmails] } } });

  const demoHash = await bcrypt.hash('Demo1234!', 10);
  await prisma.user.createMany({
    data: [
      { email: demoEmails[0], passwordHash: demoHash, name: '모의 지휘관' },
      { email: demoEmails[1], passwordHash:
         demoHash, name: '모의 관제' },
    ],
  });

  /**
   * 실서비스형 전장판 자산 시드
   * - SAR / UAV(EO/IR) / 드론 / 대대 / 상위대대 + 포병부대/전차부대
   * - 모두 분계선 이남(데모 상한 포함) 좌표로 배치
   */
  await prisma.unit.createMany({
    data: [
      // SAR (5) — 병과: 정보·감시, 합성개구레이더(SAR) 운용 소대
      {
        name: '합성개구레이더 운용 1소대',
        level: '소대',
        branch: '정보(합성개구레이더ㆍSAR)',
        lat: 37.765,
        lng: 126.715,
        personnel: 16,
        equipment: '합성개구레이더 모듈',
        readiness: '최고',
        mission: '광역 스캔 1구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '합성개구레이더 운용 2소대',
        level: '소대',
        branch: '정보(합성개구레이더ㆍSAR)',
        lat: 37.748,
        lng: 126.842,
        personnel: 18,
        equipment: '지상 감시 SAR',
        readiness: '경계',
        mission: '광역 스캔 2구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '합성개구레이더 운용 3소대',
        level: '소대',
        branch: '정보(합성개구레이더ㆍSAR)',
        lat: 37.736,
        lng: 126.964,
        personnel: 14,
        equipment: '기동형 SAR 탑재체',
        readiness: '양호',
        mission: '광역 스캔 3구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '합성개구레이더 운용 4소대',
        level: '소대',
        branch: '정보(합성개구레이더ㆍSAR)',
        lat: 37.724,
        lng: 127.092,
        personnel: 17,
        equipment: '고정익 SAR 모듈',
        readiness: '경계',
        mission: '광역 스캔 4구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '합성개구레이더 운용 5소대',
        level: '소대',
        branch: '정보(합성개구레이더ㆍSAR)',
        lat: 37.712,
        lng: 127.228,
        personnel: 15,
        equipment: '고해상 SAR 포드',
        readiness: '양호',
        mission: '광역 스캔 5구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },

      // UAV(EO/IR) (5) — 정찰: 무인항공기(EO/IR)
      {
        name: '무인항공기(EO/IR) 정찰 1소대',
        level: '소대',
        branch: '정찰(무인항공기ㆍEOIR)',
        lat: 37.703,
        lng: 126.676,
        personnel: 22,
        equipment: 'EO/IR 짐벌 · 데이터링크',
        readiness: '최고',
        mission: '저고도 정찰 1구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '무인항공기(EO/IR) 정찰 2소대',
        level: '소대',
        branch: '정찰(무인항공기ㆍEOIR)',
        lat: 37.691,
        lng: 126.804,
        personnel: 20,
        equipment: 'EO/IR 짐벌 · 실시간 전송',
        readiness: '경계',
        mission: '저고도 정찰 2구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '무인항공기(EO/IR) 정찰 3소대',
        level: '소대',
        branch: '정찰(무인항공기ㆍEOIR)',
        lat: 37.678,
        lng: 126.936,
        personnel: 21,
        equipment: 'EO/IR 융합 페이로드',
        readiness: '양호',
        mission: '저고도 정찰 3구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '무인항공기(EO/IR) 정찰 4소대',
        level: '소대',
        branch: '정찰(무인항공기ㆍEOIR)',
        lat: 37.666,
        lng: 127.062,
        personnel: 19,
        equipment: 'EO/IR 추적 모듈',
        readiness: '경계',
        mission: '저고도 정찰 4구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '무인항공기(EO/IR) 정찰 5소대',
        level: '소대',
        branch: '정찰(무인항공기ㆍEOIR)',
        lat: 37.654,
        lng: 127.195,
        personnel: 20,
        equipment: 'EO/IR 타게팅 링크',
        readiness: '양호',
        mission: '저고도 정찰 5구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },

      // 드론 (5) — 소형 무인기 정찰 소대
      {
        name: '소형무인정찰 1소대',
        level: '소대',
        branch: '정찰(소형무인기)',
        lat: 37.642,
        lng: 126.692,
        personnel: 12,
        equipment: '근접 EO/IR 드론',
        readiness: '최고',
        mission: '근접 식별 1구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankInfiltrationVideoUrl,
      },
      {
        name: '소형무인정찰 2소대',
        level: '소대',
        branch: '정찰(소형무인기)',
        lat: 37.631,
        lng: 126.823,
        personnel: 11,
        equipment: '근접 EO 드론',
        readiness: '경계',
        mission: '근접 식별 2구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankInfiltrationVideoUrl,
      },
      {
        name: '소형무인정찰 3소대',
        level: '소대',
        branch: '정찰(소형무인기)',
        lat: 37.619,
        lng: 126.952,
        personnel: 10,
        equipment: '근접 IR 드론',
        readiness: '양호',
        mission: '근접 식별 3구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankInfiltrationVideoUrl,
      },
      {
        name: '소형무인정찰 4소대',
        level: '소대',
        branch: '정찰(소형무인기)',
        lat: 37.607,
        lng: 127.078,
        personnel: 12,
        equipment: '근접 EO/IR 드론',
        readiness: '경계',
        mission: '근접 식별 4구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankInfiltrationVideoUrl,
      },
      {
        name: '소형무인정찰 5소대',
        level: '특수임무부대',
        branch: '정찰(특수임무부대·소형무인기)',
        lat: 37.594,
        lng: 127.206,
        personnel: 11,
        equipment: '근접 추적 드론',
        readiness: '양호',
        mission: '근접 식별 5구역',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankInfiltrationVideoUrl,
      },

      // 대대급 TPC(전술지휘소) — 편제상 대대 본부
      {
        name: '제1기갑대대 TPC',
        level: '대대',
        branch: '기갑·대대지휘소',
        lat: 37.682,
        lng: 126.732,
        personnel: 148,
        equipment: 'C2 체계 · 통신 차량',
        readiness: '최고',
        mission: '전방 전술 통제',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제3보병대대 TPC',
        level: '대대',
        branch: '보병·대대지휘소',
        lat: 37.669,
        lng: 126.868,
        personnel: 140,
        equipment: '대대 통신 중계',
        readiness: '경계',
        mission: '서부 전선 통제',
        symbolType: 'INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제7기계화보병대대 TPC',
        level: '대대',
        branch: '기계화보병·대대지휘소',
        lat: 37.656,
        lng: 126.998,
        personnel: 136,
        equipment: '대대 지휘 통합 단말',
        readiness: '경계',
        mission: '중앙 전선 통제',
        symbolType: 'MECHANIZED_INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제11포병연대 관측대대',
        level: '대대',
        branch: '포병·관측대대',
        lat: 37.644,
        lng: 127.123,
        personnel: 142,
        equipment: '대대 상황 공유 체계',
        readiness: '양호',
        mission: '동부 전선 감시·통제',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제9보병대대 TPC',
        level: '대대',
        branch: '보병·대대지휘소',
        lat: 37.632,
        lng: 127.246,
        personnel: 139,
        equipment: '대대 전술 데이터 링크',
        readiness: '양호',
        mission: '후방 예비 통제',
        symbolType: 'INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },

      // 연대 전방지휘소(상급 통제 노드)
      {
        name: '제11기계화보병연대 전방지휘소-1',
        level: '연대',
        branch: '기계화보병연대·전방지휘소',
        lat: 37.612,
        lng: 126.742,
        personnel: 182,
        equipment: '상위 C2 · 상황융합서버',
        readiness: '최고',
        mission: '권역 작전 통합 지휘',
        symbolType: 'MECHANIZED_INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'REINFORCED',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제11기계화보병연대 전방지휘소-2',
        level: '연대',
        branch: '기계화보병연대·전방지휘소',
        lat: 37.601,
        lng: 126.881,
        personnel: 176,
        equipment: '상위 지휘 통신 중계',
        readiness: '경계',
        mission: '서부 권역 지휘',
        symbolType: 'MECHANIZED_INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제11기계화보병연대 전방지휘소-3',
        level: '연대',
        branch: '기계화보병연대·전방지휘소',
        lat: 37.589,
        lng: 127.01,
        personnel: 188,
        equipment: '상위 작전 계획 체계',
        readiness: '경계',
        mission: '중앙 권역 지휘',
        symbolType: 'MECHANIZED_INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제11기계화보병연대 전방지휘소-4',
        level: '사단',
        branch: '기계화보병연대·전방지휘소',
        lat: 37.578,
        lng: 127.136,
        personnel: 181,
        equipment: '상위 전장 정보 허브',
        readiness: '양호',
        mission: '동부 권역 지휘',
        symbolType: 'MECHANIZED_INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제11기계화보병연대 전방지휘소-5',
        level: '군단',
        branch: '기계화보병연대·전방지휘소',
        lat: 37.566,
        lng: 127.263,
        personnel: 179,
        equipment: '상위 예비 지휘 노드',
        readiness: '양호',
        mission: '예비 작전 지휘',
        symbolType: 'MECHANIZED_INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },

      // 포병 중대
      {
        name: '제37포병대대 1포전(자주포)',
        level: '중대',
        branch: '포병(자주포중대)',
        lat: 37.553,
        lng: 126.812,
        personnel: 92,
        equipment: '자주포 6문 · 사격지휘장치',
        readiness: '경계',
        mission: '서부권역 화력지원',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제37포병대대 2포전(견인포)',
        level: '중대',
        branch: '포병(견인포중대)',
        lat: 37.547,
        lng: 126.934,
        personnel: 88,
        equipment: '견인포 · 탄약수송차',
        readiness: '양호',
        mission: '중앙권역 화력준비',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제42포병대대 다연장포전',
        level: '중대',
        branch: '포병(다연장로켓중대)',
        lat: 37.541,
        lng: 127.051,
        personnel: 96,
        equipment: '다연장로켓 · 관측레이더',
        readiness: '최고',
        mission: '동부권역 화력대기',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'REINFORCED',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제37포병대대 3포전(자주포)',
        level: '중대',
        branch: '포병(자주포중대)',
        lat: 37.535,
        lng: 127.167,
        personnel: 90,
        equipment: '자주포 · 사격통제망',
        readiness: '경계',
        mission: '동부 접근로 차단',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제55포병대대 장사정포전',
        level: '중대',
        branch: '포병(장사정포중대)',
        lat: 37.529,
        lng: 127.284,
        personnel: 94,
        equipment: '장사정포 · 탄도계산체계',
        readiness: '양호',
        mission: '후방 화력지원',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },

      // 기갑(전차) 중대
      {
        name: '제1기갑대대 1전차중대',
        level: '중대',
        branch: '기갑(전차중대)',
        lat: 37.561,
        lng: 126.776,
        personnel: 76,
        equipment: 'K2 8대 · 정비차량',
        readiness: '최고',
        mission: '서부 돌파대기',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'REINFORCED',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제1기갑대대 2전차중대',
        level: '중대',
        branch: '기갑(전차중대)',
        lat: 37.556,
        lng: 126.902,
        personnel: 72,
        equipment: 'K1A2 7대 · 통신차',
        readiness: '경계',
        mission: '중앙 예비기동',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제5기갑대대 1전차중대',
        level: '중대',
        branch: '기갑(전차중대)',
        lat: 37.55,
        lng: 127.023,
        personnel: 74,
        equipment: 'K2 8대 · 전술단말',
        readiness: '최고',
        mission: '중앙 신속대응',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제5기갑대대 2전차중대',
        level: '중대',
        branch: '기갑(전차중대)',
        lat: 37.544,
        lng: 127.144,
        personnel: 71,
        equipment: 'K1A2 7대 · 정찰드론 연동',
        readiness: '경계',
        mission: '동부 방어기동',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
      {
        name: '제8기갑대대 1전차중대',
        level: '중대',
        branch: '기갑(전차중대)',
        lat: 37.538,
        lng: 127.268,
        personnel: 73,
        equipment: 'K2 8대 · 보급차량',
        readiness: '양호',
        mission: '후방 차단기동',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: yoloTankSituationVideoUrl,
      },
    ],
  });

  await prisma.infiltrationPoint.createMany({
    data: [
      {
        codename: '적 제105기갑사단 예하 제1기갑대대 (북측 집결)',
        /** 평양 시청 일대 근사 — 프론트 시뮬·SAR 소실 원과 동일 */
        lat: 39.0392,
        lng: 125.7625,
        threatLevel: '중간',
        estimatedCount: 28,
        observedAt: new Date('2026-03-26T10:40:00'),
        riskRadiusMeter: 3800,
        droneVideoUrl: yoloTankInfiltrationVideoUrl,
        enemySymbol: 'ENEMY_UNIT',
        enemyBranch: '기갑(전차대대·분계 이북)',
      },
      {
        codename: '적 제4기갑사단 예하 제2기갑여단 (함흥 집결)',
        /** 함흥시 도심권 근사 — 침공 주축(함흥→평양→서울) 시뮬 우선 표적 */
        lat: 39.8417,
        lng: 127.7264,
        threatLevel: '높음',
        estimatedCount: 21,
        observedAt: new Date('2026-03-26T11:15:00'),
        riskRadiusMeter: 3200,
        droneVideoUrl: yoloTankInfiltrationVideoUrl,
        enemySymbol: 'ENEMY_UNIT',
        enemyBranch: '기갑(기갑여단·동부 축선)',
      },
    ],
  });

  /** 38선 이남에 잘못 둔 적 표적 제거 */
  const removedSouthEnemies = await prisma.infiltrationPoint.deleteMany({
    where: { lat: { lt: PARALLEL_38_N } },
  });
  if (removedSouthEnemies.count > 0) {
    console.log('  위치 정리:', `분계선 이남 적 ${removedSouthEnemies.count}건 삭제`);
  }

  /** 분계선 이북(데모: 위도 상한 초과) 아군 제거 */
  const removedNorthFriendlies = await prisma.unit.deleteMany({
    where: {
      OR: [
        { lat: { gte: PARALLEL_38_N } },
        { lat: { gt: FRIENDLY_MAX_LAT_SOUTH_OF_MDL } },
      ],
    },
  });
  if (removedNorthFriendlies.count > 0) {
    console.log('  위치 정리:', `분계선 이북(또는 상한 초과) 아군 ${removedNorthFriendlies.count}건 삭제`);
  }

  // 추가 메타(전술대형·표고·MGRS) 저장
  const allUnits = await prisma.unit.findMany({ orderBy: { id: 'asc' } });
  await Promise.all(
    allUnits.map((unit, idx) => {
      const formation = FORMATION_PRESETS[idx % FORMATION_PRESETS.length];
      const elevationM = 18 + ((idx * 23) % 260) + Math.round((unit.lat - 37.5) * 32);
      const mgrs = buildPseudoMgrs(unit.lat, unit.lng, idx);
      return prisma.$executeRaw`
        UPDATE \`Unit\`
        SET formation = ${formation}, elevationM = ${elevationM}, mgrs = ${mgrs}
        WHERE id = ${unit.id}
      `;
    }),
  );

  console.log(
    'Seed 완료: 모의 로그인',
    demoEmails.join(', '),
    '/ 비밀번호: Demo1234!',
  );
  console.log(
    '  Unit',
    await prisma.unit.count(),
    '개, InfiltrationPoint',
    await prisma.infiltrationPoint.count(),
    '개',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
