-- Réponses du laboratoire du 28/10 (RETOUR-LABO-28-10.md §5, lot 3C :
-- réception, rapport, exports, exploitation).
-- Strictement additif : des colonnes NULL, deux tables nouvelles, un type
-- énuméré nouveau. Aucune ligne existante n'est réécrite, aucune colonne ni
-- valeur n'est retirée.

-- ---- K4 · Le statut d'accréditation de chaque paramètre (Q14) ----

-- Accrédité, non accrédité (« * »), sous-traité accrédité (« SA ») ou
-- sous-traité non accrédité (« SN »), comme la légende du rapport. NULL sur
-- tous les paramètres existants : « à préciser » — rien n'est imprimé. La
-- proposition tirée des marques de l'ancien logiciel (« * », « (SA) »,
-- « (SN) » dans le nom) est appliquée depuis /admin/parametres, journalisée,
-- jamais par cette migration.
ALTER TABLE `AnalysisParameter`
    ADD COLUMN `accreditation` ENUM('ACCREDITE', 'NON_ACCREDITE', 'SOUS_TRAITE_ACCREDITE', 'SOUS_TRAITE_NON_ACCREDITE') NULL;

-- ---- K4 · Logo d'accréditation et cachet ; L4 · l'expéditeur des e-mails ----

-- Les deux fichiers attendus du laboratoire (data URI, 300 Ko au plus), NULL
-- tant qu'ils ne sont pas téléversés : rien n'est imprimé. L'expéditeur, le
-- nom affiché et l'adresse de réponse : NULL = la configuration EMAIL_FROM,
-- sinon l'adresse de l'identité (« Nous n'utilisons pas d'adresse no-reply ! »).
ALTER TABLE `CompanySettings`
    ADD COLUMN `accreditationLogoData` LONGTEXT NULL,
    ADD COLUMN `stampData` LONGTEXT NULL,
    ADD COLUMN `emailSenderAddress` VARCHAR(191) NULL,
    ADD COLUMN `emailSenderName` VARCHAR(191) NULL,
    ADD COLUMN `emailReplyTo` VARCHAR(191) NULL;

-- ---- K5 · « À rendre le » proposée par type d'analyse (Q8) ----

-- Les jours entre l'arrivée et le rapport promis, par domaine (microbiologie,
-- physico-chimie, autre). 5 et 7 jours ouvrés : une hypothèse en attendant
-- les jours du laboratoire (relance R-18) ; NULL = rien n'est proposé.
-- `dueCalendarDays` NULL = jours ouvrés (du lundi au vendredi).
ALTER TABLE `LabSettings`
    ADD COLUMN `dueDaysMicro` INTEGER NULL DEFAULT 5,
    ADD COLUMN `dueDaysChimie` INTEGER NULL DEFAULT 7,
    ADD COLUMN `dueDaysAutre` INTEGER NULL,
    ADD COLUMN `dueCalendarDays` BOOLEAN NULL;

-- ---- L5 · Les adresses du laboratoire en copie des alertes (Q93) ----

CREATE TABLE `AlertCopyAddress` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `allClients` BOOLEAN NULL DEFAULT true,
    `active` BOOLEAN NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AlertCopyClient` (
    `addressId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,

    INDEX `AlertCopyClient_clientId_idx`(`clientId`),
    PRIMARY KEY (`addressId`, `clientId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AlertCopyClient` ADD CONSTRAINT `AlertCopyClient_addressId_fkey` FOREIGN KEY (`addressId`) REFERENCES `AlertCopyAddress`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AlertCopyClient` ADD CONSTRAINT `AlertCopyClient_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
