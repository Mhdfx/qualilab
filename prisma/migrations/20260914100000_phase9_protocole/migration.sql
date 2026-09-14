-- Phase 9 · chantier 1 · tranche 1b — le protocole tel quel (retour du laboratoire 14/09).
-- Additive: the two « Analyses à effectuer » boxes of the paper protocol on the
-- série, backfilled from the natures of the existing lines.

-- AlterTable
ALTER TABLE `Serie` ADD COLUMN `analysesMicro` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `analysesChimie` BOOLEAN NOT NULL DEFAULT false;

-- Backfill: a box is ticked when the série has a line of that family.
UPDATE `Serie` AS s
SET s.`analysesMicro` = EXISTS (
      SELECT 1 FROM `Sample` sm JOIN `AnalysisNature` n ON n.`id` = sm.`natureId`
      WHERE sm.`serieId` = s.`id` AND n.`family` = 'MICRO'
    ),
    s.`analysesChimie` = EXISTS (
      SELECT 1 FROM `Sample` sm JOIN `AnalysisNature` n ON n.`id` = sm.`natureId`
      WHERE sm.`serieId` = s.`id` AND n.`family` = 'CHIMIE'
    );
