-- AlterTable
ALTER TABLE `analysisparameter` ADD COLUMN `alertOnExceed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `limitValue` DOUBLE NULL;

-- AlterTable
ALTER TABLE `emaillog` ADD COLUMN `type` ENUM('RAPPORT', 'ALERTE_CONTAMINATION') NOT NULL DEFAULT 'RAPPORT';

-- AlterTable
ALTER TABLE `result` ADD COLUMN `numericValue` DOUBLE NULL;

-- AlterTable
ALTER TABLE `sample` ADD COLUMN `numeroLot` VARCHAR(191) NULL,
    ADD COLUMN `produit` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ClientEmail` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `forReports` BOOLEAN NOT NULL DEFAULT true,
    `forAlerts` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ClientEmail_clientId_idx`(`clientId`),
    UNIQUE INDEX `ClientEmail_clientId_email_key`(`clientId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientEmail` ADD CONSTRAINT `ClientEmail_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

