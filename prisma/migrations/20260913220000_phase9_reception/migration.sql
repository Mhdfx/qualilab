-- Phase 9 · chantier 1 · tranche 2 — réception groupée.
-- Additive: the acceptance-rule thresholds (defaults = the paper form
-- PG05/EN04) and the coded motif of a non-conformity at reception.

-- AlterTable
ALTER TABLE `LabSettings` ADD COLUMN `coldChainMaxC` DOUBLE NOT NULL DEFAULT 8,
    ADD COLUMN `histamineUnitG` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `histamineUnits` INTEGER NOT NULL DEFAULT 9,
    ADD COLUMN `minFoodChemG` INTEGER NOT NULL DEFAULT 300,
    ADD COLUMN `minFoodMicroG` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `minWaterChemL` DOUBLE NOT NULL DEFAULT 2,
    ADD COLUMN `minWaterMicroL` DOUBLE NOT NULL DEFAULT 1,
    ADD COLUMN `minWaterSalmonellaL` DOUBLE NOT NULL DEFAULT 6,
    ADD COLUMN `temperatureRequiredKinds` VARCHAR(191) NOT NULL DEFAULT 'ALIMENT,EAU';

-- AlterTable
ALTER TABLE `Sample` ADD COLUMN `conformityReason` ENUM('CHAINE_FROID', 'TEMPERATURE_MANQUANTE', 'QUANTITE_INSUFFISANTE', 'EMBALLAGE', 'DELAI', 'IDENTIFICATION', 'AUTRE') NULL;
