-- AlterTable
ALTER TABLE `ClientEmail` ADD COLUMN `siteId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Sample` ADD COLUMN `ambientTemperature` DOUBLE NULL,
    ADD COLUMN `cancelReason` ENUM('NON_EXPLOITABLE', 'QUANTITE_INSUFFISANTE', 'DOUBLON', 'ANNULATION_CLIENT', 'AUTRE') NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `cancelledById` VARCHAR(191) NULL,
    ADD COLUMN `expiryDate` DATE NULL,
    ADD COLUMN `handsState` ENUM('LAVEES', 'NON_LAVEES') NULL,
    ADD COLUMN `lineKind` ENUM('ALIMENT', 'SURFACE', 'MAINS', 'EAU', 'AIR', 'AUTRE') NOT NULL DEFAULT 'ALIMENT',
    ADD COLUMN `lineNumber` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `natureId` VARCHAR(191) NULL,
    ADD COLUMN `personName` VARCHAR(191) NULL,
    ADD COLUMN `personRole` VARCHAR(191) NULL,
    ADD COLUMN `placeId` VARCHAR(191) NULL,
    ADD COLUMN `productId` VARCHAR(191) NULL,
    ADD COLUMN `productTemperature` DOUBLE NULL,
    ADD COLUMN `productionDate` DATE NULL,
    ADD COLUMN `quantity` DECIMAL(10, 2) NULL,
    ADD COLUMN `quantityUnit` ENUM('UNITE', 'G', 'ML', 'L') NULL,
    ADD COLUMN `receptionTemperature` DOUBLE NULL,
    ADD COLUMN `remarks` TEXT NULL,
    ADD COLUMN `serieId` VARCHAR(191) NULL,
    ADD COLUMN `surfaceAreaCm2` INTEGER NULL,
    ADD COLUMN `surfaceLabel` VARCHAR(191) NULL,
    ADD COLUMN `unitCount` INTEGER NOT NULL DEFAULT 1,
    MODIFY `status` ENUM('PRELEVE', 'RECU', 'EN_ANALYSE', 'RESULTATS_SAISIS', 'VALIDE', 'RAPPORT_ENVOYE', 'ANNULE') NOT NULL DEFAULT 'PRELEVE';

-- CreateTable
CREATE TABLE `Serie` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('VISITE', 'DEPOT') NOT NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NULL,
    `interlocutor` VARCHAR(191) NULL,
    `samplerKind` ENUM('QUALILAB', 'CLIENT', 'SERVICE_VETERINAIRE', 'AUTRE') NOT NULL DEFAULT 'QUALILAB',
    `samplerUserId` VARCHAR(191) NULL,
    `samplerName` VARCHAR(191) NULL,
    `cadre` ENUM('AUTOCONTROLE', 'OFFICIEL') NOT NULL DEFAULT 'AUTOCONTROLE',
    `clientReference` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `arrivedAt` DATETIME(3) NULL,
    `coolerTemperature` DOUBLE NULL,
    `signedProtocolData` LONGTEXT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receivedById` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Serie_serialNumber_key`(`serialNumber`),
    INDEX `Serie_clientId_createdAt_idx`(`clientId`, `createdAt`),
    INDEX `Serie_kind_createdAt_idx`(`kind`, `createdAt`),
    INDEX `Serie_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `Serie_year_idx`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Site` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `contact` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `legacyId` INTEGER NULL,

    UNIQUE INDEX `Site_legacyId_key`(`legacyId`),
    INDEX `Site_clientId_active_idx`(`clientId`, `active`),
    UNIQUE INDEX `Site_clientId_name_key`(`clientId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisNature` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NULL,
    `family` ENUM('MICRO', 'CHIMIE', 'AUTRE') NOT NULL,
    `defaultLineKind` ENUM('ALIMENT', 'SURFACE', 'MAINS', 'EAU', 'AIR', 'AUTRE') NOT NULL,
    `legacyType` ENUM('ALIMENTAIRE', 'EAU', 'AMBIANCE') NOT NULL,
    `minQuantity` DECIMAL(10, 2) NULL,
    `minQuantityUnit` ENUM('UNITE', 'G', 'ML', 'L') NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `legacyId` INTEGER NULL,

    UNIQUE INDEX `AnalysisNature_code_key`(`code`),
    UNIQUE INDEX `AnalysisNature_legacyId_key`(`legacyId`),
    INDEX `AnalysisNature_active_sortOrder_idx`(`active`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisProfile` (
    `id` VARCHAR(191) NOT NULL,
    `natureId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `unitCount` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `AnalysisProfile_natureId_active_idx`(`natureId`, `active`),
    INDEX `AnalysisProfile_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisProfileParameter` (
    `profileId` VARCHAR(191) NOT NULL,
    `parameterId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`profileId`, `parameterId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientPlace` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NULL,
    `label` VARCHAR(191) NOT NULL,
    `normalizedLabel` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `legacyId` INTEGER NULL,

    INDEX `ClientPlace_clientId_siteId_normalizedLabel_idx`(`clientId`, `siteId`, `normalizedLabel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientProduct` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `normalizedLabel` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `legacyId` INTEGER NULL,

    UNIQUE INDEX `ClientProduct_clientId_normalizedLabel_key`(`clientId`, `normalizedLabel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `kind` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `last` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`kind`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentReference` (
    `docType` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `createdOn` DATE NULL,
    `updatedOn` DATE NULL,

    PRIMARY KEY (`docType`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────
-- Phase 9 · chantier 1 — reference data and backfill (hand-written)
-- ─────────────────────────────────────────────────────────────────────────

-- The 16 analysis natures the laboratory practises (legacyId = NATURE_ECHANTILLION.ID).
INSERT INTO `AnalysisNature` (`id`, `code`, `label`, `labelEn`, `family`, `defaultLineKind`, `legacyType`, `minQuantity`, `minQuantityUnit`, `sortOrder`, `active`, `legacyId`) VALUES
('nat_micro_aliments', 'MICRO_ALIMENTS', 'Microbiologie des aliments', 'Food microbiology', 'MICRO', 'ALIMENT', 'ALIMENTAIRE', 100.00, 'G', 10, true, 1),
('nat_micro_surfaces', 'MICRO_SURFACES', 'Microbiologie des surfaces', 'Surface microbiology', 'MICRO', 'SURFACE', 'AMBIANCE', NULL, NULL, 20, true, 5),
('nat_pc_aliments', 'PC_ALIMENTS', 'Physico-chimie des aliments', 'Physico-chemistry of food', 'CHIMIE', 'ALIMENT', 'ALIMENTAIRE', 300.00, 'G', 30, true, 20),
('nat_micro_eaux', 'MICRO_EAUX', 'Microbiologie des eaux', 'Water microbiology', 'MICRO', 'EAU', 'EAU', 1000.00, 'ML', 40, true, 3),
('nat_micro_cosmetiques', 'MICRO_COSMETIQUES', 'Microbiologie des produits cosmétiques', 'Microbiology of cosmetic products', 'MICRO', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 50, true, 22),
('nat_micro_air', 'MICRO_AIR', 'Microbiologie de l''air', 'Air microbiology', 'MICRO', 'AIR', 'AMBIANCE', NULL, NULL, 60, true, 4),
('nat_pc_eaux', 'PC_EAUX', 'Physico-chimie des eaux', 'Physico-chemistry of water', 'CHIMIE', 'EAU', 'EAU', 2000.00, 'ML', 70, true, 2),
('nat_micro_complements', 'MICRO_COMPLEMENTS', 'Microbiologie des compléments alimentaires', 'Microbiology of food supplements', 'MICRO', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 80, true, 31),
('nat_micro_aliments_liquides', 'MICRO_ALIMENTS_LIQUIDES', 'Microbiologie des aliments liquides', 'Microbiology of liquid foods', 'MICRO', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 90, true, 19),
('nat_pc_complements_cosmetiques', 'PC_COMPLEMENTS_COSMETIQUES', 'Physico-chimie des compléments alimentaires, cosmétiques et produits pharmaceutiques', 'Physico-chemistry of supplements, cosmetics and pharmaceuticals', 'CHIMIE', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 100, true, 29),
('nat_micro_nettoyage', 'MICRO_NETTOYAGE', 'Microbiologie des produits de nettoyage', 'Microbiology of cleaning products', 'MICRO', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 110, true, 21),
('nat_effet_aseptisant', 'EFFET_ASEPTISANT', 'Effet aseptisant', 'Aseptic effect', 'CHIMIE', 'AUTRE', 'AMBIANCE', NULL, NULL, 120, true, 26),
('nat_pc_surfaces', 'PC_SURFACES', 'Physico-chimie des surfaces', 'Physico-chemistry of surfaces', 'CHIMIE', 'SURFACE', 'AMBIANCE', NULL, NULL, 130, true, 30),
('nat_pc_nettoyage', 'PC_NETTOYAGE', 'Physico-chimie des produits de nettoyage', 'Physico-chemistry of cleaning products', 'CHIMIE', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 140, true, 24),
('nat_analyse_sensorielle', 'ANALYSE_SENSORIELLE', 'Analyse sensorielle', 'Sensory analysis', 'AUTRE', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 150, true, 27),
('nat_pc_huiles', 'PC_HUILES', 'Physico-chimie des huiles', 'Physico-chemistry of oils', 'CHIMIE', 'ALIMENT', 'ALIMENTAIRE', NULL, NULL, 160, true, 25);

-- The quality cartouche of the four known paper forms.
INSERT INTO `DocumentReference` (`docType`, `reference`, `version`, `createdOn`, `updatedOn`) VALUES
('PROTOCOLE', 'PG04/EN01', 'F', '2007-11-26', '2024-10-01'),
('BON_RECEPTION', 'PG05/EN04', 'G', '2006-01-05', '2024-10-01'),
('FEUILLE_PAILLASSE', 'PG06/EN01', 'G', '2006-01-05', '2024-10-08'),
('CAHIER_PHYSICO', 'PG06/EN06', 'C', '2015-01-24', '2019-10-11');

-- One série per existing sample (kind VISITE, sampled by its creator), numbered
-- « N/AA » per year in creation order, so nothing built before Phase 9 is lost.
INSERT INTO `Serie` (`id`, `kind`, `serialNumber`, `year`, `clientId`, `siteId`, `interlocutor`, `samplerKind`, `samplerUserId`, `samplerName`, `cadre`, `clientReference`, `startedAt`, `endedAt`, `arrivedAt`, `coolerTemperature`, `signedProtocolData`, `notes`, `createdById`, `createdAt`, `receivedById`, `receivedAt`)
SELECT CONCAT('bf_', s.`id`), 'VISITE',
       CONCAT(ROW_NUMBER() OVER (PARTITION BY YEAR(s.`sampledAt`) ORDER BY s.`createdAt`, s.`id`), '/', DATE_FORMAT(s.`sampledAt`, '%y')),
       YEAR(s.`sampledAt`), s.`clientId`, NULL, NULL, 'QUALILAB', s.`userId`, NULL, 'AUTOCONTROLE', NULL,
       s.`sampledAt`, NULL, s.`receivedAt`, NULL, NULL, NULL, s.`userId`, s.`createdAt`, s.`receivedById`, s.`receivedAt`
FROM `Sample` s;

UPDATE `Sample` s
JOIN `AnalysisNature` n ON n.`code` = CASE s.`type` WHEN 'ALIMENTAIRE' THEN 'MICRO_ALIMENTS' WHEN 'EAU' THEN 'MICRO_EAUX' ELSE 'MICRO_SURFACES' END
SET s.`serieId` = CONCAT('bf_', s.`id`), s.`lineNumber` = 1, s.`natureId` = n.`id`, s.`lineKind` = n.`defaultLineKind`;

-- Yearly counters continue after what exists; the admin sets the switch-over
-- values from the old software before go-live.
INSERT INTO `Counter` (`kind`, `year`, `last`)
SELECT 'SERIE', `year`, COUNT(*) FROM `Serie` GROUP BY `year`;
INSERT INTO `Counter` (`kind`, `year`, `last`)
SELECT 'CONTROLE', CAST(SUBSTRING(`controlCode`, 5, 4) AS UNSIGNED), MAX(CAST(SUBSTRING(`controlCode`, 10) AS UNSIGNED))
FROM `Sample` WHERE `controlCode` LIKE 'QLC-%' GROUP BY CAST(SUBSTRING(`controlCode`, 5, 4) AS UNSIGNED);

-- Now every sample belongs to a série and a nature.
ALTER TABLE `Sample` MODIFY `serieId` VARCHAR(191) NOT NULL, MODIFY `natureId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `ClientEmail_siteId_idx` ON `ClientEmail`(`siteId`);

-- CreateIndex
CREATE INDEX `Sample_serieId_lineNumber_idx` ON `Sample`(`serieId`, `lineNumber`);

-- CreateIndex
CREATE INDEX `Sample_natureId_idx` ON `Sample`(`natureId`);

-- AddForeignKey
ALTER TABLE `ClientEmail` ADD CONSTRAINT `ClientEmail_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_serieId_fkey` FOREIGN KEY (`serieId`) REFERENCES `Serie`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_natureId_fkey` FOREIGN KEY (`natureId`) REFERENCES `AnalysisNature`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `ClientProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `ClientPlace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Serie` ADD CONSTRAINT `Serie_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Serie` ADD CONSTRAINT `Serie_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Serie` ADD CONSTRAINT `Serie_samplerUserId_fkey` FOREIGN KEY (`samplerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Serie` ADD CONSTRAINT `Serie_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Serie` ADD CONSTRAINT `Serie_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Site` ADD CONSTRAINT `Site_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisProfile` ADD CONSTRAINT `AnalysisProfile_natureId_fkey` FOREIGN KEY (`natureId`) REFERENCES `AnalysisNature`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisProfile` ADD CONSTRAINT `AnalysisProfile_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisProfileParameter` ADD CONSTRAINT `AnalysisProfileParameter_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `AnalysisProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisProfileParameter` ADD CONSTRAINT `AnalysisProfileParameter_parameterId_fkey` FOREIGN KEY (`parameterId`) REFERENCES `AnalysisParameter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientPlace` ADD CONSTRAINT `ClientPlace_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientPlace` ADD CONSTRAINT `ClientPlace_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientProduct` ADD CONSTRAINT `ClientProduct_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

