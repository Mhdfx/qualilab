-- Phase 9 · chantier 2 · tranche 1 — catalogue et critères (CRITERES.md §3).
-- Additive: product types, norms with dated versions, criteria (n, c, m, M),
-- the conclusion scale, readings per unit; the product type on a sample, the
-- verdict on a result and on a report.

-- AlterTable
ALTER TABLE `AnalysisParameter` ADD COLUMN `aliases` TEXT NULL;

-- AlterTable
ALTER TABLE `Report` ADD COLUMN `interpretation` ENUM('SATISFAISANT', 'ACCEPTABLE', 'NON_SATISFAISANT', 'INCOMPLET') NULL;

-- AlterTable
ALTER TABLE `Result` ADD COLUMN `interpretation` ENUM('SATISFAISANT', 'ACCEPTABLE', 'NON_SATISFAISANT', 'INCOMPLET') NULL,
    ADD COLUMN `normVersionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Sample` ADD COLUMN `productTypeId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProductType` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `family` ENUM('MICRO', 'CHIMIE', 'AUTRE') NOT NULL DEFAULT 'MICRO',
    `clientId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductType_legacyId_key`(`legacyId`),
    INDEX `ProductType_normalizedName_idx`(`normalizedName`),
    INDEX `ProductType_clientId_active_idx`(`clientId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Norm` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Norm_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NormVersion` (
    `id` VARCHAR(191) NOT NULL,
    `normId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `effectiveFrom` DATE NULL,
    `supersededOn` DATE NULL,
    `current` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `NormVersion_normId_version_key`(`normId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Criterion` (
    `id` VARCHAR(191) NOT NULL,
    `productTypeId` VARCHAR(191) NOT NULL,
    `parameterId` VARCHAR(191) NOT NULL,
    `normVersionId` VARCHAR(191) NULL,
    `unit` VARCHAR(191) NULL,
    `n` INTEGER NOT NULL DEFAULT 5,
    `c` INTEGER NULL,
    `mKind` ENUM('VALUE', 'ABSENCE', 'UNSPECIFIED') NOT NULL DEFAULT 'VALUE',
    `m` DOUBLE NULL,
    `bigM` DOUBLE NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Criterion_productTypeId_parameterId_idx`(`productTypeId`, `parameterId`),
    INDEX `Criterion_parameterId_idx`(`parameterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConclusionScale` (
    `interpretation` ENUM('SATISFAISANT', 'ACCEPTABLE', 'NON_SATISFAISANT', 'INCOMPLET') NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sentence` TEXT NOT NULL,

    PRIMARY KEY (`interpretation`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResultUnit` (
    `id` VARCHAR(191) NOT NULL,
    `resultId` VARCHAR(191) NOT NULL,
    `unitIndex` INTEGER NOT NULL,
    `rawValue` VARCHAR(191) NOT NULL,
    `value` DOUBLE NULL,
    `detected` BOOLEAN NULL,

    UNIQUE INDEX `ResultUnit_resultId_unitIndex_key`(`resultId`, `unitIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_productTypeId_fkey` FOREIGN KEY (`productTypeId`) REFERENCES `ProductType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_normVersionId_fkey` FOREIGN KEY (`normVersionId`) REFERENCES `NormVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductType` ADD CONSTRAINT `ProductType_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NormVersion` ADD CONSTRAINT `NormVersion_normId_fkey` FOREIGN KEY (`normId`) REFERENCES `Norm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Criterion` ADD CONSTRAINT `Criterion_productTypeId_fkey` FOREIGN KEY (`productTypeId`) REFERENCES `ProductType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Criterion` ADD CONSTRAINT `Criterion_parameterId_fkey` FOREIGN KEY (`parameterId`) REFERENCES `AnalysisParameter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Criterion` ADD CONSTRAINT `Criterion_normVersionId_fkey` FOREIGN KEY (`normVersionId`) REFERENCES `NormVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResultUnit` ADD CONSTRAINT `ResultUnit_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `Result`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The words printed for each verdict — the admin edits them in /admin/reglages.
INSERT INTO `ConclusionScale` (`interpretation`, `label`, `sentence`) VALUES
('SATISFAISANT', 'Satisfaisant', 'Les résultats obtenus sont conformes aux critères microbiologiques applicables au produit analysé.'),
('ACCEPTABLE', 'Acceptable', 'Les résultats obtenus sont acceptables : le nombre d''unités comprises entre m et M reste dans la tolérance c du plan d''échantillonnage.'),
('NON_SATISFAISANT', 'Non satisfaisant', 'Les résultats obtenus ne sont pas conformes aux critères microbiologiques applicables au produit analysé.'),
('INCOMPLET', 'Incomplet', 'Les résultats sont incomplets : toutes les unités n''ont pas été lues.');
