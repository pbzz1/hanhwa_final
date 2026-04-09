import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const demoVideoUrl =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const localMapDroneVideoUrl = '/media/demo-drone-map.mp4';

/** 한반도 데모: 북위 38° 기준 — 적 표적 등 */
const PARALLEL_38_N = 38;

/**
 * 카카오맵에 그려지는 군사분계선(휴전선)은 구간마다 북위 38°와 다름(서부는 더 남쪽).
 * 아군은 지도상 분계선 이남에 보이도록 위도 상한을 둠(데모용 근사).
 */
const FRIENDLY_MAX_LAT_SOUTH_OF_MDL = 37.79;

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
   * 남한 측 — 휴전선 이남에 서해안~동해안 방향으로 넓게 분산(겹침 최소화)
   */
  await prisma.unit.createMany({
    data: [
      {
        name: '제1기갑대대 지휘통제실',
        level: '대대',
        branch: '기갑',
        lat: 37.72,
        lng: 126.96,
        personnel: 120,
        equipment: 'C2·통신, 전방 중대 통제',
        readiness: '최고',
        mission: '38선 경계 대대 통제',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: localMapDroneVideoUrl,
      },
      {
        name: '1보병중대 (전방)',
        level: '중대',
        branch: '보병',
        lat: 37.67,
        lng: 126.52,
        personnel: 112,
        equipment: '소총, 유탄, 중기관총',
        readiness: '경계',
        mission: '38선 서측 전방',
        symbolType: 'INFANTRY',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '2포병포대',
        level: '중대',
        branch: '포병',
        lat: 37.76,
        lng: 127.38,
        personnel: 95,
        equipment: 'K9A1 6문',
        readiness: '경계',
        mission: '38선 동측 화력',
        symbolType: 'ARTILLERY',
        locationStatus: 'CURRENT',
        strengthModifier: 'REINFORCED',
        situationVideoUrl: localMapDroneVideoUrl,
      },
      {
        name: '3기갑소대',
        level: '소대',
        branch: '기갑',
        lat: 37.7,
        lng: 126.66,
        personnel: 44,
        equipment: 'K2 4대',
        readiness: '경계',
        mission: '경계 순찰(구간 공백 대응)',
        symbolType: 'ARMOR',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: localMapDroneVideoUrl,
      },
      {
        name: '정찰소대',
        level: '소대',
        branch: '정찰',
        lat: 37.74,
        lng: 127.22,
        personnel: 28,
        equipment: '경정찰, 소형 UAV',
        readiness: '양호',
        mission: '38선 전술 정찰',
        symbolType: 'RECON',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '공병분대',
        level: '소대',
        branch: '공병',
        lat: 37.69,
        lng: 126.78,
        personnel: 28,
        equipment: '장애물 개척',
        readiness: '양호',
        mission: '경계 도로·장애',
        symbolType: 'ENGINEER',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: demoVideoUrl,
      },
      {
        name: '방공반',
        level: '소대',
        branch: '방공',
        lat: 37.77,
        lng: 127.05,
        personnel: 24,
        equipment: '비호복합',
        readiness: '최고',
        mission: '38선 상공 대공',
        symbolType: 'ADA',
        locationStatus: 'CURRENT',
        strengthModifier: 'NONE',
        situationVideoUrl: localMapDroneVideoUrl,
      },
    ],
  });

  await prisma.infiltrationPoint.createMany({
    data: [
      {
        codename: '적 제1기갑대대 (북측 집결)',
        /** 평양 시청 일대 근사 — 프론트 시뮌·SAR 소실 원과 동일 */
        lat: 39.0392,
        lng: 125.7625,
        threatLevel: '높음',
        estimatedCount: 28,
        observedAt: new Date('2026-03-26T10:40:00'),
        riskRadiusMeter: 3800,
        droneVideoUrl: localMapDroneVideoUrl,
        enemySymbol: 'ENEMY_UNIT',
        enemyBranch: '기갑 대대 (군사분계선 이북)',
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
