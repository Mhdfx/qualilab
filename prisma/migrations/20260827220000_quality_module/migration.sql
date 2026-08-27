-- CreateTable
CREATE TABLE `Equipment` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `calibrationFrequencyMonths` INTEGER NULL,
    `lastCalibratedAt` DATETIME(3) NULL,
    `tempMin` DOUBLE NULL,
    `tempMax` DOUBLE NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Equipment_code_key`(`code`),
    INDEX `Equipment_archived_name_idx`(`archived`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalibrationRecord` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `performedAt` DATETIME(3) NOT NULL,
    `provider` VARCHAR(191) NULL,
    `certificate` VARCHAR(191) NULL,
    `result` ENUM('CONFORME', 'NON_CONFORME') NOT NULL DEFAULT 'CONFORME',
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CalibrationRecord_equipmentId_performedAt_idx`(`equipmentId`, `performedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemperatureReading` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `value` DOUBLE NOT NULL,
    `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `outOfRange` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,

    INDEX `TemperatureReading_equipmentId_readAt_idx`(`equipmentId`, `readAt`),
    INDEX `TemperatureReading_outOfRange_readAt_idx`(`outOfRange`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EilCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `organizer` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `resultDate` DATETIME(3) NULL,
    `status` ENUM('PREVUE', 'EN_COURS', 'RESULTATS_RECUS', 'CLOTUREE') NOT NULL DEFAULT 'PREVUE',
    `outcome` VARCHAR(191) NULL,
    `satisfactory` BOOLEAN NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EilCampaign_status_startDate_idx`(`status`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CalibrationRecord` ADD CONSTRAINT `CalibrationRecord_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalibrationRecord` ADD CONSTRAINT `CalibrationRecord_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemperatureReading` ADD CONSTRAINT `TemperatureReading_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemperatureReading` ADD CONSTRAINT `TemperatureReading_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EilCampaign` ADD CONSTRAINT `EilCampaign_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

