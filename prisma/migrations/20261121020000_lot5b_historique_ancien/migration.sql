-- Lot 5B, HA1 (RETOUR-LABO-20-11.md §6, Q20 « Ajouter tout l'historique des
-- clients, ancien plus nouveau ») : l'historique de l'ancien logiciel, en
-- lecture seule, montré sur le portail et sur la fiche client.
--   LegacyClientLink  quel client du nouveau logiciel est un client de
--                     l'ancien (CLIENTS.ID) : certain (ICE, nom unique) ou
--                     tranché à la main ; `clientId` NULL = « ne pas reprendre » ;
--   LegacySample      un échantillon validé de l'ancien logiciel
--                     (LIN_BON_COMMANDE.ID_LIGNE pour clé : relancer le même
--                     fichier n'écrit rien ; `sourceHash` : une ligne changée
--                     est réécrite) ;
--   LegacyResult      ses analyses (PARAMES_BON_COMMANDE.ID pour clé), avec
--                     les lectures par unité.
-- Aucune clé vers le catalogue (les libellés de l'époque sont gardés), aucun
-- prix, aucun nom du personnel. Strictement additif : trois tables neuves,
-- aucune ligne existante touchée.

-- CreateTable
CREATE TABLE `LegacyClientLink` (
    `id` VARCHAR(191) NOT NULL,
    `legacyClientId` INTEGER NOT NULL,
    `legacyName` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `siteId` VARCHAR(191) NULL,
    `matchedBy` ENUM('ICE', 'NOM', 'MAIN') NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LegacyClientLink_legacyClientId_key`(`legacyClientId`),
    INDEX `LegacyClientLink_clientId_idx`(`clientId`),
    INDEX `LegacyClientLink_siteId_idx`(`siteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegacySample` (
    `id` INTEGER NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NULL,
    `legacyClientId` INTEGER NOT NULL,
    `serieNumber` VARCHAR(32) NULL,
    `controlNumber` VARCHAR(32) NULL,
    `year` INTEGER NOT NULL,
    `nature` VARCHAR(191) NULL,
    `productType` VARCHAR(191) NULL,
    `designation` VARCHAR(255) NULL,
    `lot` VARCHAR(191) NULL,
    `place` VARCHAR(255) NULL,
    `sampledAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `reportNumber` VARCHAR(32) NULL,
    `reportedAt` DATETIME(3) NULL,
    `interpretation` ENUM('SATISFAISANT', 'ACCEPTABLE', 'NON_SATISFAISANT', 'INCOMPLET') NULL,
    `verdictLabel` VARCHAR(64) NULL,
    `conclusion` TEXT NULL,
    `observation` TEXT NULL,
    `amendmentNote` TEXT NULL,
    `cancelled` BOOLEAN NOT NULL DEFAULT false,
    `sourceHash` CHAR(64) NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LegacySample_clientId_receivedAt_idx`(`clientId`, `receivedAt`),
    INDEX `LegacySample_clientId_year_idx`(`clientId`, `year`),
    INDEX `LegacySample_siteId_idx`(`siteId`),
    INDEX `LegacySample_legacyClientId_idx`(`legacyClientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegacyResult` (
    `id` INTEGER NOT NULL,
    `legacySampleId` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `parameter` VARCHAR(255) NOT NULL,
    `method` VARCHAR(255) NULL,
    `unit` VARCHAR(64) NULL,
    `value` VARCHAR(1000) NULL,
    `readings` JSON NULL,
    `criterion` VARCHAR(255) NULL,
    `interpretation` ENUM('SATISFAISANT', 'ACCEPTABLE', 'NON_SATISFAISANT', 'INCOMPLET') NULL,

    INDEX `LegacyResult_legacySampleId_position_idx`(`legacySampleId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LegacyClientLink` ADD CONSTRAINT `LegacyClientLink_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegacyClientLink` ADD CONSTRAINT `LegacyClientLink_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegacySample` ADD CONSTRAINT `LegacySample_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegacySample` ADD CONSTRAINT `LegacySample_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegacyResult` ADD CONSTRAINT `LegacyResult_legacySampleId_fkey` FOREIGN KEY (`legacySampleId`) REFERENCES `LegacySample`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

