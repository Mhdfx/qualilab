-- RETOUR-LABO-29-09.md — the laboratory's answers of 29/09. Additive only.

-- Slice B: the indicative verdict of a germ taken on fewer units than its
-- plan (no official verdict on the report, this one goes in the e-mail).
ALTER TABLE `Result`
    ADD COLUMN `informalInterpretation` ENUM('SATISFAISANT', 'ACCEPTABLE', 'NON_SATISFAISANT', 'INCOMPLET') NULL;

-- Slice C: the « Réglementation en vigueur » text of the report, per product
-- type, with a default per family in the laboratory's settings.
ALTER TABLE `ProductType` ADD COLUMN `regulation` TEXT NULL;
ALTER TABLE `LabSettings`
    ADD COLUMN `regulationMicro` TEXT NULL,
    ADD COLUMN `regulationChimie` TEXT NULL,
    MODIFY `alertAfterTechnicalValidation` BOOLEAN NOT NULL DEFAULT true;

-- Slice E: a line destroyed at reception is cancelled with its own motif.
ALTER TABLE `Sample`
    MODIFY `cancelReason` ENUM('NON_EXPLOITABLE', 'QUANTITE_INSUFFISANTE', 'DOUBLON', 'ANNULATION_CLIENT', 'DETRUIT_A_RECEPTION', 'AUTRE') NULL;

-- Slice D: contamination alerts leave after the technical validation (point 15).
UPDATE `LabSettings` SET `alertAfterTechnicalValidation` = true;
