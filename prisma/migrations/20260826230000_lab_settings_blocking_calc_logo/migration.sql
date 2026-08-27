-- Independence pack: everything still awaited from the client becomes a
-- toggle or a data entry (NEEDEDINFO §4 decisions, item 5 logo, item 6
-- formulas). Table names are CAPITALIZED to match the init migrations —
-- Windows MySQL hides casing mistakes, the Linux production server does not.

-- AlterTable
ALTER TABLE `AnalysisParameter` ADD COLUMN `calcFactor` DOUBLE NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `CompanySettings` ADD COLUMN `logoData` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `Result` ADD COLUMN `rawValue` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Sample` ADD COLUMN `alertsSentAt` DATETIME(3) NULL,
    ADD COLUMN `analysisBlocked` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `LabSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'lab',
    `blockNonConformAtReception` BOOLEAN NOT NULL DEFAULT false,
    `alertAfterTechnicalValidation` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
