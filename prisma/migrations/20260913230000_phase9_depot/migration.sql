-- Phase 9 · chantier 1 · tranche 3 — dépôt au laboratoire.
-- Additive: the advance cashed on the bon de réception (« Avance / Reste »).

-- AlterTable
ALTER TABLE `Serie` ADD COLUMN `advanceAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `advanceMode` ENUM('ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE') NULL;
