-- Lot 3E — rapport mensuel d'activité ONSSA (RETOUR-LABO-28-10.md §3.2 et §5,
-- N1 et N2 ; O-6 accepté par le propriétaire le 01/11, règles à confirmer par
-- R-22). Strictement additif : une table, une énumération de colonne, des
-- colonnes nullables ou avec une valeur par défaut, des index et des clés
-- étrangères. Aucune ligne existante n'est réécrite, aucune valeur ni colonne
-- n'est retirée.

-- ---- N2 · Les groupes de produits du canevas ONSSA ---------------------------

-- La liste du laboratoire reste demandée (R-22) : l'administrateur la tient
-- dans /admin/onssa (une liste proposée en un clic, journalisée). Cette
-- migration n'insère aucune ligne.
CREATE TABLE `OnssaProductGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `domain` ENUM('ALIMENTAIRE', 'EAU') NOT NULL DEFAULT 'ALIMENTAIRE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OnssaProductGroup_name_key`(`name`),
    INDEX `OnssaProductGroup_active_sortOrder_idx`(`active`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Le groupe d'une famille de produits ; NULL = celui de sa nature, sinon
-- « non déclaré » (listé sur l'écran du rapport).
ALTER TABLE `ProductType`
    ADD COLUMN `onssaGroupId` VARCHAR(191) NULL;
CREATE INDEX `ProductType_onssaGroupId_idx` ON `ProductType`(`onssaGroupId`);
ALTER TABLE `ProductType` ADD CONSTRAINT `ProductType_onssaGroupId_fkey` FOREIGN KEY (`onssaGroupId`) REFERENCES `OnssaProductGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Le groupe des échantillons d'un type d'analyse quand leur famille n'en
-- nomme aucun (les eaux, typiquement).
ALTER TABLE `AnalysisNature`
    ADD COLUMN `onssaGroupId` VARCHAR(191) NULL;
CREATE INDEX `AnalysisNature_onssaGroupId_idx` ON `AnalysisNature`(`onssaGroupId`);
ALTER TABLE `AnalysisNature` ADD CONSTRAINT `AnalysisNature_onssaGroupId_fkey` FOREIGN KEY (`onssaGroupId`) REFERENCES `OnssaProductGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- La colonne de la feuille « II-AT » où un paramètre est compté (une clé de
-- `ONSSA_COLUMNS`, src/lib/onssa-canevas.ts) ; NULL = « non déclaré ».
ALTER TABLE `AnalysisParameter`
    ADD COLUMN `onssaColumn` VARCHAR(40) NULL;

-- ---- N1 · Contrôle officiel / autocontrôle, séparé du cadre commercial --------

-- Faux pour toutes les séries existantes (autocontrôle) par la valeur par
-- défaut : aucune mise à jour de données. L'organisme préleveur et
-- l'établissement ne sont remplis que pour un contrôle officiel ; l'origine
-- (hypothèse R-22) pour les deux.
ALTER TABLE `Serie`
    ADD COLUMN `controleOfficiel` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `organismePreleveur` VARCHAR(191) NULL,
    ADD COLUMN `etablissement` VARCHAR(191) NULL,
    ADD COLUMN `origine` VARCHAR(191) NULL;
