-- FACTURATION.md, AMENDEMENT.md, PORTAIL.md (08/10/2026) — invoice drafts,
-- issue, cancellation, credit notes and settlements; report versions and
-- amendments; portal accounts tied to their client. Additive: every new
-- column is nullable or defaulted and every enum is widened, never reduced.
-- Three data steps keep the existing rows meaning what they meant:
--   * every existing invoice was issued: `issuedAt` = `issueDate`;
--   * every invoice marked paid receives one « Repris » settlement of its
--     total, so « reste à payer » reads 0 on it;
--   * the FACTURE counter continues after the highest FAC-AAAA-NNNN number.

-- PORTAIL.md §1: the client a CLIENT (portal) account belongs to.
ALTER TABLE `User` ADD COLUMN `clientId` VARCHAR(191) NULL;

-- AMENDEMENT.md §1: current version (0 = original — every existing report),
-- latest amendment note and date, « amendement en cours ».
ALTER TABLE `Report` ADD COLUMN `amendedAt` DATETIME(3) NULL,
    ADD COLUMN `amendmentNote` TEXT NULL,
    ADD COLUMN `amendmentPending` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- FACTURATION.md §3: the payment modes are shared with the advance of the
-- bon de réception; EFFET and AUTRE are appended (existing values unchanged).
ALTER TABLE `Serie` MODIFY `advanceMode` ENUM('ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE', 'EFFET', 'AUTRE') NULL;

-- FACTURATION.md §1–2: drafts have no number yet; BROUILLON and ANNULEE are
-- added to the statuses; kind FACTURE | AVOIR (every existing row: FACTURE);
-- the credit note's invoice; issue and cancellation.
ALTER TABLE `Invoice` ADD COLUMN `cancelReason` TEXT NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `cancelledById` VARCHAR(191) NULL,
    ADD COLUMN `creditedInvoiceId` VARCHAR(191) NULL,
    ADD COLUMN `issuedAt` DATETIME(3) NULL,
    ADD COLUMN `kind` ENUM('FACTURE', 'AVOIR') NOT NULL DEFAULT 'FACTURE',
    MODIFY `number` VARCHAR(191) NULL,
    MODIFY `status` ENUM('BROUILLON', 'EN_ATTENTE', 'PAYEE', 'ANNULEE') NOT NULL DEFAULT 'EN_ATTENTE';

-- Data: every invoice existing today was created issued (there were no
-- drafts before this migration).
UPDATE `Invoice` SET `issuedAt` = `issueDate` WHERE `issuedAt` IS NULL;

-- AMENDEMENT.md §1: a report exactly as it was issued, one row per version.
CREATE TABLE `ReportVersion` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `note` TEXT NULL,
    `reconstructed` BOOLEAN NOT NULL DEFAULT false,
    `issuedAt` DATETIME(3) NOT NULL,
    `issuedById` VARCHAR(191) NULL,

    INDEX `ReportVersion_issuedById_idx`(`issuedById`),
    UNIQUE INDEX `ReportVersion_reportId_version_key`(`reportId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FACTURATION.md §3: the settlements of an invoice.
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `mode` ENUM('ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE', 'EFFET', 'AUTRE') NOT NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_invoiceId_idx`(`invoiceId`),
    INDEX `Payment_createdById_idx`(`createdById`),
    INDEX `Payment_paidAt_idx`(`paidAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `User_clientId_idx` ON `User`(`clientId`);
CREATE INDEX `Invoice_creditedInvoiceId_idx` ON `Invoice`(`creditedInvoiceId`);
CREATE INDEX `Invoice_cancelledById_idx` ON `Invoice`(`cancelledById`);
CREATE INDEX `Invoice_kind_status_idx` ON `Invoice`(`kind`, `status`);

ALTER TABLE `User` ADD CONSTRAINT `User_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ReportVersion` ADD CONSTRAINT `ReportVersion_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ReportVersion` ADD CONSTRAINT `ReportVersion_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_creditedInvoiceId_fkey` FOREIGN KEY (`creditedInvoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data (FACTURATION.md §3): an invoice marked paid before settlements
-- existed receives one settlement of its total, mode AUTRE, dated on the
-- invoice, recorded in the name of the invoice's author. UUID() is evaluated
-- per row: 32 hex characters, unique, as good an id as a cuid. An invoice
-- of 0,00 needs none (nothing is left to pay; a settlement is always > 0).
INSERT INTO `Payment` (`id`, `invoiceId`, `amount`, `mode`, `paidAt`, `reference`, `note`, `createdById`, `createdAt`)
SELECT REPLACE(UUID(), '-', ''), `id`, `total`, 'AUTRE', `issueDate`, NULL,
       'Repris : facture marquée encaissée avant le 09/10/2026.', `createdById`, CURRENT_TIMESTAMP(3)
FROM `Invoice`
WHERE `status` = 'PAYEE' AND `total` > 0;

-- Data (FACTURATION.md §1): numbers are now drawn from the counters table
-- (src/lib/counters.ts, kind FACTURE), which creates a missing row at 0 — so
-- the FACTURE row of each year that already has numbers starts at the
-- highest one, and the next issue continues after it. The pattern keeps any
-- hand-typed number out of the CAST. AVOIR needs no row: no AV- number
-- exists, the first draw creates it.
INSERT INTO `Counter` (`kind`, `year`, `last`)
SELECT 'FACTURE', CAST(SUBSTRING(`number`, 5, 4) AS UNSIGNED), MAX(CAST(SUBSTRING(`number`, 10) AS UNSIGNED))
FROM `Invoice`
WHERE `number` REGEXP '^FAC-[0-9]{4}-[0-9]{1,9}$'
GROUP BY CAST(SUBSTRING(`number`, 5, 4) AS UNSIGNED);
