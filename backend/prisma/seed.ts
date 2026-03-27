import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const demoVideoUrl =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const localMapDroneVideoUrl = '/media/demo-drone-map.mp4';

/** 한반도 데모: 북위 38° 기준 — 아군·적 표적 모두 남한(휴전선 이남) 좌표 사용 */
const PARALLEL_38_N = 38;

async function main() {
  await prisma.unit.deleteMany();
  await prisma.infiltrationPoint.deleteMany();

  const demoEmails = ['demo@hanhwa.local', 'viewer@hanhwa.local'] as const;
  await prisma.user.deleteMany({ where: { email: { in: [...demoEmails] } } });

  const demoHash = await bcrypt.hash('Demo1234!', 10);
  await prisma.user.createMany({
    data: [
      { email: demoEmails[0], passwordHash: demoHash, name: '모의 지휘관' },
      { email: demoEmails[1], passwordHash: demoHash, name: '모의 관제' },
    ],
  });

  /**
   * 남한 측 — 휴전선(38선 부근) 이남에 서~동으로 넓게 분산 (겹침 최소화)
   * 경도: 서측(강화·김포 방향) ~ 동측(포천·춘천 방향), 위도: 구간마다 살짝 엇갈림
   */
  await prisma.unit.createMany({
    data: [
      {
        name: '제1기갑대대 지휘통제실',
        level: '대대',
        branch: '기갑',
        lat: 37.928,
        lng: 126.935,
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
        lat: 37.872,
        lng: 126.58,
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
        lat: 37.978,
        lng: 127.28,
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
        lat: 37.902,
        lng: 126.695,
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
        lat: 37.848,
        lng: 127.06,
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
        lat: 37.958,
        lng: 126.805,
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
        lat: 37.992,
        lng: 127.155,
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
        codename: '적 제1기갑대대 (남하 침투)',
        lat: 37.89,
        lng: 126.97,
        threatLevel: '높음',
        estimatedCount: 28,
        observedAt: new Date('2026-03-26T10:40:00'),
        riskRadiusMeter: 2800,
        droneVideoUrl: localMapDroneVideoUrl,
        enemySymbol: 'ENEMY_UNIT',
        enemyBranch: '기갑 대대 (접촉 · 남한 이남)',
      },
    ],
  });

  /** 38선 이북에 잘못 둔 아군만 제거 (적 표적은 남한 좌표를 씀) */
  const removedNorthFriendlies = await prisma.unit.deleteMany({
    where: { lat: { gte: PARALLEL_38_N } },
  });
  if (removedNorthFriendlies.count > 0) {
    console.log('  위치 정리:', `북쪽 아군 ${removedNorthFriendlies.count}건 삭제`);
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
