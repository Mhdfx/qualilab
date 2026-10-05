-- PROGRAMME.md (RETOUR-LABO-05-10.md §5) — the responsable des paramètres and
-- the programme d'analyse of each received line. Additive only: enum values
-- are appended, every new column is nullable or defaulted, old rows keep
-- working unchanged (a line never programmed simply has `programmedAt` NULL).

-- §1: the PROGRAMME step between RECU and EN_ANALYSE. MySQL rewrites the
-- ENUM in place; existing values are kept.
ALTER TABLE `Sample`
    MODIFY `status` ENUM('PRELEVE', 'RECU', 'PROGRAMME', 'EN_ANALYSE', 'RESULTATS_SAISIS', 'VALIDE', 'RAPPORT_ENVOYE', 'ANNULE') NOT NULL DEFAULT 'PRELEVE';

-- §2: the role. `User.role` has been a VARCHAR(191) since the Better Auth
-- migration (20260729120000), so PROGRAMMATEUR needs no column change.

-- §3: the programme on the line.
ALTER TABLE `Sample`
    ADD COLUMN `programmedAt` DATETIME(3) NULL,
    ADD COLUMN `programmedById` VARCHAR(191) NULL,
    ADD COLUMN `priority` ENUM('NORMALE', 'URGENTE') NOT NULL DEFAULT 'NORMALE',
    ADD COLUMN `dueAt` DATETIME(3) NULL,
    ADD COLUMN `testPortion` VARCHAR(60) NULL,
    ADD COLUMN `programmeNote` TEXT NULL;

-- §3: what the programme decides per parameter.
ALTER TABLE `SampleParameter`
    ADD COLUMN `technicianId` VARCHAR(191) NULL,
    ADD COLUMN `normVersionId` VARCHAR(191) NULL,
    ADD COLUMN `dilutionFactor` DECIMAL(12, 4) NULL,
    ADD COLUMN `note` VARCHAR(191) NULL;

-- Indexes: the programmation queue reads by (status, programmedAt); the
-- technician's bench reads the parameters handed to them.
CREATE INDEX `Sample_status_programmedAt_idx` ON `Sample`(`status`, `programmedAt`);
CREATE INDEX `SampleParameter_technicianId_idx` ON `SampleParameter`(`technicianId`);

-- Foreign keys, SET NULL like every other actor link of the circuit.
ALTER TABLE `Sample` ADD CONSTRAINT `Sample_programmedById_fkey` FOREIGN KEY (`programmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SampleParameter` ADD CONSTRAINT `SampleParameter_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SampleParameter` ADD CONSTRAINT `SampleParameter_normVersionId_fkey` FOREIGN KEY (`normVersionId`) REFERENCES `NormVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
