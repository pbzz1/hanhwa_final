-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "UnitLevel" AS ENUM ('소대', '중대', '대대', '연대', '사단', '군단', '특수임무부대');

-- CreateEnum
CREATE TYPE "Readiness" AS ENUM ('양호', '경계', '최고');

-- CreateEnum
CREATE TYPE "TacticalSymbol" AS ENUM ('INFANTRY', 'ARTILLERY', 'ARMOR', 'MECHANIZED_INFANTRY', 'RECON', 'ENGINEER', 'ADA');

-- CreateEnum
CREATE TYPE "TacticalLocationStatus" AS ENUM ('CURRENT', 'PLANNED');

-- CreateEnum
CREATE TYPE "StrengthModifier" AS ENUM ('NONE', 'REINFORCED', 'REDUCED');

-- CreateEnum
CREATE TYPE "ThreatLevel" AS ENUM ('낮음', '중간', '높음');

-- CreateEnum
CREATE TYPE "EnemyTacticalSymbol" AS ENUM ('ENEMY_UNIT', 'ENEMY_STRONGPOINT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" SERIAL NOT NULL,
    "type" "MediaType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceResult" (
    "id" SERIAL NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "detections" JSONB,
    "rawResponse" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "level" "UnitLevel" NOT NULL,
    "branch" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "formation" TEXT NOT NULL DEFAULT '종대',
    "elevationM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mgrs" TEXT NOT NULL DEFAULT '52SDU0000000000',
    "personnel" INTEGER NOT NULL,
    "equipment" TEXT NOT NULL,
    "readiness" "Readiness" NOT NULL,
    "mission" TEXT NOT NULL,
    "symbolType" "TacticalSymbol" NOT NULL DEFAULT 'INFANTRY',
    "locationStatus" "TacticalLocationStatus" NOT NULL DEFAULT 'CURRENT',
    "strengthModifier" "StrengthModifier" NOT NULL DEFAULT 'NONE',
    "situationVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfiltrationPoint" (
    "id" SERIAL NOT NULL,
    "codename" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "elevationM" INTEGER NOT NULL DEFAULT 100,
    "threatLevel" "ThreatLevel" NOT NULL,
    "estimatedCount" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "riskRadiusMeter" INTEGER NOT NULL,
    "droneVideoUrl" TEXT NOT NULL,
    "enemySymbol" "EnemyTacticalSymbol" NOT NULL DEFAULT 'ENEMY_UNIT',
    "enemyBranch" TEXT NOT NULL DEFAULT '미상',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfiltrationPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceResult" ADD CONSTRAINT "InferenceResult_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
