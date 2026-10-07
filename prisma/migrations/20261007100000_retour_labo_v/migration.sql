-- RETOUR-LABO-06-10.md §5 — the laboratory's remarks of 06 and 07/10 (tranches
-- V1 → V4). Additive except the cadre: every new column is nullable or
-- defaulted, old rows keep working unchanged (a line entered before has no
-- `surfaceState` / `airMethod`, a parameter becomes MICRO). The cadre is the
-- one value rewritten: AUTOCONTROLE / OFFICIEL give way to four commercial
-- frames, and the existing séries — test séries only in production — become
-- AUTRE.

-- V1: the cadre, in three steps. MySQL refuses an ENUM that drops a value
-- still stored, so the column is first widened to the union of the old and
-- new values (appended: rewritten in place) ...
ALTER TABLE `Serie`
    MODIFY `cadre` ENUM('AUTOCONTROLE', 'OFFICIEL', 'AUTRE', 'DEVIS_VALIDE', 'BON_COMMANDE', 'CONVENTION') NOT NULL DEFAULT 'AUTOCONTROLE';

-- ... the existing séries are moved to AUTRE (nothing is deduced from who
-- sampled any more) ...
UPDATE `Serie` SET `cadre` = 'AUTRE' WHERE `cadre` IN ('AUTOCONTROLE', 'OFFICIEL');

-- ... then the column is reduced to the four new values, AUTRE by default.
ALTER TABLE `Serie`
    MODIFY `cadre` ENUM('AUTRE', 'DEVIS_VALIDE', 'BON_COMMANDE', 'CONVENTION') NOT NULL DEFAULT 'AUTRE';

-- V1: the free precision offered when the cadre is « Autre » (optional).
ALTER TABLE `Serie`
    ADD COLUMN `cadreNote` VARCHAR(191) NULL;

-- V2: « État de la surface » of a SURFACE line; V4: « Méthode de
-- prélèvement » of an AIR line. Both NULL on the lines entered before.
ALTER TABLE `Sample`
    ADD COLUMN `surfaceState` ENUM('ASEPTIQUE', 'EN_COURS_DE_TRAVAIL', 'NETTOYE') NULL,
    ADD COLUMN `airMethod` ENUM('BOITE_EXPOSEE_30MIN', 'BIOCOLLECTEUR') NULL;

-- V3: the family of each analysis parameter, which groups the analyses
-- proposed on a line and sends each one to the sample of its family. The
-- production catalogue holds microbiology only, hence MICRO for every
-- existing row; set per parameter in /admin/parametres.
ALTER TABLE `AnalysisParameter`
    ADD COLUMN `family` ENUM('MICRO', 'CHIMIE', 'AUTRE') NOT NULL DEFAULT 'MICRO';
