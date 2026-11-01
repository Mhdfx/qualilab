-- Lot 3D — Achat & Stock (RETOUR-LABO-28-10.md §5, M1 à M8 ; fichiers 3.3,
-- 3.4 et le « NB » du 28/10). Strictement additif : des colonnes facultatives
-- (ou avec une valeur par défaut), une valeur d'énumération ajoutée, deux
-- tables nouvelles, deux index. Aucune ligne existante n'est réécrite, aucune
-- colonne ni valeur n'est retirée. Une facture ou un mouvement enregistrés
-- avant le lot 3D gardent leurs colonnes nouvelles vides : les écrans lisent
-- alors le TTC seul (facture) et le jour de `createdAt` (mouvement).

-- ---- M1, M6, M7 · factures fournisseurs ------------------------------------

-- HT / taux de TVA / TVA (TTC = HT + TVA, `amount` reste le TTC) ; devise
-- (« Euro ») ; mode et référence du paiement ; attestation de régularité
-- fiscale fournie avec la facture ; retenue à la source appliquée ;
-- correction journalisée et « Annuler la saisie » (statut ANNULEE).
ALTER TABLE `PurchaseInvoice` ADD COLUMN `amountForeign` DECIMAL(12, 2) NULL,
    ADD COLUMN `amountHT` DECIMAL(12, 2) NULL,
    ADD COLUMN `cancelReason` TEXT NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `correctedAt` DATETIME(3) NULL,
    ADD COLUMN `currency` VARCHAR(191) NULL,
    ADD COLUMN `exchangeRate` DECIMAL(12, 6) NULL,
    ADD COLUMN `paymentMethod` ENUM('ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE', 'EFFET', 'AUTRE') NULL,
    ADD COLUMN `paymentReference` VARCHAR(191) NULL,
    ADD COLUMN `taxCertificateDate` DATE NULL,
    ADD COLUMN `taxCertificateProvided` BOOLEAN NULL,
    ADD COLUMN `vatAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `vatRate` DECIMAL(5, 2) NULL,
    ADD COLUMN `withholdingAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `withholdingRate` DECIMAL(5, 2) NULL,
    MODIFY `status` ENUM('A_PAYER', 'PAYEE', 'ANNULEE') NOT NULL DEFAULT 'A_PAYER';

CREATE INDEX `PurchaseInvoice_issueDate_idx` ON `PurchaseInvoice`(`issueDate`);

-- Les paiements d'une facture fournisseur (paiements partiels : hypothèse,
-- à confirmer par R-23). La facture passe à PAYEE quand ils atteignent le
-- net à payer.
CREATE TABLE `PurchasePayment` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `paidOn` DATE NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` ENUM('ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE', 'EFFET', 'AUTRE') NOT NULL,
    `reference` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PurchasePayment_invoiceId_idx`(`invoiceId`),
    INDEX `PurchasePayment_paidOn_idx`(`paidOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PurchasePayment` ADD CONSTRAINT `PurchasePayment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `PurchaseInvoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- M7 · fournisseurs : retenue à la source et attestation ----------------

-- « Soumis à la retenue » (faux par défaut : aucune mise à jour de données),
-- date de la dernière attestation de régularité fiscale et fin de validité.
ALTER TABLE `Supplier` ADD COLUMN `taxCertificateDate` DATE NULL,
    ADD COLUMN `taxCertificateValidUntil` DATE NULL,
    ADD COLUMN `withholdingSubject` BOOLEAN NOT NULL DEFAULT false;

-- ---- M1, M5 · stock ---------------------------------------------------------

-- Lieu de stockage de l'article.
ALTER TABLE `StockItem` ADD COLUMN `location` VARCHAR(191) NULL;

-- Jour du mouvement, niveaux avant / après (écrits dans la transaction
-- gardée), prix unitaire HT d'une entrée.
ALTER TABLE `StockMovement` ADD COLUMN `levelAfter` DECIMAL(12, 2) NULL,
    ADD COLUMN `levelBefore` DECIMAL(12, 2) NULL,
    ADD COLUMN `movementDate` DATE NULL,
    ADD COLUMN `unitPriceHT` DECIMAL(12, 2) NULL;

CREATE INDEX `StockMovement_movementDate_idx` ON `StockMovement`(`movementDate`);

-- ---- Réglages du magasin (M4, M1, M7) ---------------------------------------

-- Une ligne (id « magasin »), créée à la première lecture avec ces valeurs par
-- défaut : fenêtre de péremption 30 jours, TVA 20 %, aucune retenue (aucun
-- taux écrit dans le code : ils viennent du comptable, R-24), attestation
-- valable 3 mois (hypothèse R-24).
CREATE TABLE `AchatStockSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'magasin',
    `expiryWarningDays` INTEGER NOT NULL DEFAULT 30,
    `defaultVatRate` DECIMAL(5, 2) NOT NULL DEFAULT 20,
    `withholdingScope` ENUM('AUCUN', 'FOURNISSEURS_SOUMIS', 'TOUS') NOT NULL DEFAULT 'AUCUN',
    `withholdingBase` ENUM('HT', 'TVA', 'TTC') NOT NULL DEFAULT 'TVA',
    `withholdingRateWithCertificate` DECIMAL(5, 2) NULL,
    `withholdingRateWithoutCertificate` DECIMAL(5, 2) NULL,
    `taxCertificateValidityMonths` INTEGER NOT NULL DEFAULT 3,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
