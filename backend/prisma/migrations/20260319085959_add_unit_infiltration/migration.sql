-- CreateTable
CREATE TABLE `Unit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `level` ENUM('소대', '중대', '대대') NOT NULL,
    `branch` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `personnel` INTEGER NOT NULL,
    `equipment` VARCHAR(191) NOT NULL,
    `readiness` ENUM('양호', '경계', '최고') NOT NULL,
    `mission` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InfiltrationPoint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codename` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `threatLevel` ENUM('낮음', '중간', '높음') NOT NULL,
    `estimatedCount` INTEGER NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `riskRadiusMeter` INTEGER NOT NULL,
    `droneVideoUrl` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
