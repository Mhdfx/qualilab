-- Lot 4H, H5 (RETOUR-LABO-04-11.md §5, R-4 « Oui ») : les prix propres à
-- certains clients. Une ligne par client et par analyse (`parameterId`) ou
-- prestation du catalogue (`labServiceId`), clé « P:<id> » / « S:<id> »
-- (`itemKey`) ; l'origine dit si le prix vient de l'ancien logiciel (REPRISE,
-- « Importer les prix clients ») ou de la fiche client (SAISIE). La facture
-- propose ce prix à la place de celui du catalogue, toujours modifiable.
-- Strictement additif : une table neuve, aucune ligne existante touchée.

-- CreateTable
CREATE TABLE `ClientPrice` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `parameterId` VARCHAR(191) NULL,
    `labServiceId` VARCHAR(191) NULL,
    `itemKey` VARCHAR(64) NOT NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `origin` ENUM('REPRISE', 'SAISIE') NOT NULL,
    `legacyPriceId` INTEGER NULL,
    `legacyClientId` INTEGER NULL,
    `legacyModifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    UNIQUE INDEX `ClientPrice_legacyPriceId_key`(`legacyPriceId`),
    INDEX `ClientPrice_parameterId_idx`(`parameterId`),
    INDEX `ClientPrice_labServiceId_idx`(`labServiceId`),
    INDEX `ClientPrice_updatedById_idx`(`updatedById`),
    UNIQUE INDEX `ClientPrice_clientId_itemKey_key`(`clientId`, `itemKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientPrice` ADD CONSTRAINT `ClientPrice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientPrice` ADD CONSTRAINT `ClientPrice_parameterId_fkey` FOREIGN KEY (`parameterId`) REFERENCES `AnalysisParameter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientPrice` ADD CONSTRAINT `ClientPrice_labServiceId_fkey` FOREIGN KEY (`labServiceId`) REFERENCES `LabService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientPrice` ADD CONSTRAINT `ClientPrice_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
