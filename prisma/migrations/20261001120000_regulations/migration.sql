-- RETOUR-LABO-30-09.md, slice I — the regulation is chosen per sample by the
-- technical validator (answer to Q32), from a catalogue. Additive.

CREATE TABLE `Regulation` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `normalizedTitle` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `legacyId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Regulation_legacyId_key`(`legacyId`),
    INDEX `Regulation_normalizedTitle_idx`(`normalizedTitle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Sample` ADD COLUMN `regulationId` VARCHAR(191) NULL;
ALTER TABLE `ProductType` ADD COLUMN `regulationId` VARCHAR(191) NULL;
ALTER TABLE `ClientProduct` ADD COLUMN `regulationId` VARCHAR(191) NULL;
ALTER TABLE `LabSettings`
    ADD COLUMN `regulationMicroId` VARCHAR(191) NULL,
    ADD COLUMN `regulationChimieId` VARCHAR(191) NULL;

ALTER TABLE `Sample` ADD CONSTRAINT `Sample_regulationId_fkey` FOREIGN KEY (`regulationId`) REFERENCES `Regulation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ClientProduct` ADD CONSTRAINT `ClientProduct_regulationId_fkey` FOREIGN KEY (`regulationId`) REFERENCES `Regulation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ProductType` ADD CONSTRAINT `ProductType_regulationId_fkey` FOREIGN KEY (`regulationId`) REFERENCES `Regulation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The one text the laboratory's report model cites, until slice J imports
-- the old software's list (Q38).
INSERT INTO `Regulation` (`id`, `title`, `normalizedTitle`, `text`, `sortOrder`, `updatedAt`)
VALUES ('reg-arrete-624-04', 'Arrêté conjoint n° 624-04 du 8 avril 2004',
        'arrete conjoint n 624 04 du 8 avril 2004',
        'Arrêté conjoint n° 624-04 du 8 avril 2004', 0, CURRENT_TIMESTAMP(3));

-- The free texts typed with slice C become catalogue entries (one per
-- distinct text), linked back to where they were typed.
INSERT INTO `Regulation` (`id`, `title`, `normalizedTitle`, `text`, `sortOrder`, `updatedAt`)
SELECT CONCAT('reg-', LEFT(SHA1(t.txt), 20)), LEFT(t.txt, 120), LOWER(LEFT(t.txt, 120)), t.txt, 10, CURRENT_TIMESTAMP(3)
FROM (
    SELECT DISTINCT TRIM(`regulation`) AS txt FROM `ProductType` WHERE `regulation` IS NOT NULL AND TRIM(`regulation`) <> ''
    UNION SELECT TRIM(`regulationMicro`) FROM `LabSettings` WHERE `regulationMicro` IS NOT NULL AND TRIM(`regulationMicro`) <> ''
    UNION SELECT TRIM(`regulationChimie`) FROM `LabSettings` WHERE `regulationChimie` IS NOT NULL AND TRIM(`regulationChimie`) <> ''
) t
WHERE t.txt <> 'Arrêté conjoint n° 624-04 du 8 avril 2004';

UPDATE `ProductType` SET `regulationId` = CONCAT('reg-', LEFT(SHA1(TRIM(`regulation`)), 20))
WHERE `regulation` IS NOT NULL AND TRIM(`regulation`) <> ''
  AND EXISTS (SELECT 1 FROM `Regulation` r WHERE r.`id` = CONCAT('reg-', LEFT(SHA1(TRIM(`ProductType`.`regulation`)), 20)));
UPDATE `LabSettings` SET `regulationMicroId` = CONCAT('reg-', LEFT(SHA1(TRIM(`regulationMicro`)), 20))
WHERE `regulationMicro` IS NOT NULL AND TRIM(`regulationMicro`) <> '';
UPDATE `LabSettings` SET `regulationChimieId` = CONCAT('reg-', LEFT(SHA1(TRIM(`regulationChimie`)), 20))
WHERE `regulationChimie` IS NOT NULL AND TRIM(`regulationChimie`) <> '';
