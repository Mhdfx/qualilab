-- Retour du laboratoire du 12/10 (réponses au questionnaire, formulaires
-- annotés, modèle de rapport PG06/EN03 version M). One folder, additive only:
-- new columns nullable or defaulted; the two data statements below only fill
-- what nobody has set yet (they never overwrite a value the owner typed) and
-- are safe to re-run.

-- ---- 1 · Identité du laboratoire : identifiants légaux et fax ------------------

-- The report's footer (PG06/EN03 version M) prints « IF », « Patente »,
-- « CNSS » and « Fax » beside the RC and the ICE already stored. NULL until the
-- owner types them in /admin/entreprise: the repository never carries the
-- laboratory's identifiers, so nothing is backfilled here.
ALTER TABLE `CompanySettings`
    ADD COLUMN `fiscalId` VARCHAR(191) NULL,
    ADD COLUMN `patente` VARCHAR(191) NULL,
    ADD COLUMN `cnss` VARCHAR(191) NULL,
    ADD COLUMN `fax` VARCHAR(191) NULL;

-- ---- 2 · Bon de réception version H, note (8) : mollusques bivalves vivants ----

-- « Pour le cas des mollusques bivalves vivants, un échantillon représentatif
-- doit contenir au moins 10 individus et peser au moins 50 g (25 g pour les
-- animaux de petite taille) ». Integers like the other gram thresholds of the
-- bon (`minFoodMicroG`, `histamineUnitG`); editable in /admin/reglages later.
ALTER TABLE `LabSettings`
    ADD COLUMN `molluscMinIndividuals` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `molluscMinG` INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN `molluscSmallMinG` INTEGER NOT NULL DEFAULT 25;

-- ---- 2b · Température obligatoire : aliment, eau, air et surface ---------------

-- The laboratory's answer: the temperature at arrival is required for food,
-- water, air and surface samples (stable foods excepted — judged by the
-- reception rules, not by this list). The column default follows (metadata
-- only, no table copy), and the stored row moves only while it still holds
-- the old default set — in either order, as /admin/reglages may have re-saved
-- it — so a list the administrator chose differently is kept as it is.
ALTER TABLE `LabSettings`
    ALTER COLUMN `temperatureRequiredKinds` SET DEFAULT 'ALIMENT,EAU,AIR,SURFACE';

UPDATE `LabSettings`
SET `temperatureRequiredKinds` = 'ALIMENT,EAU,AIR,SURFACE'
WHERE `temperatureRequiredKinds` IN ('ALIMENT,EAU', 'EAU,ALIMENT');

-- ---- 3 · Cartouche du rapport d'essai : PG06/EN03 version M --------------------

-- The report template transmitted on 12/10: « Réf : PG06/EN03 », « Version M »,
-- created 05/01/2006, last updated 18/12/2023. Filled only while the RAPPORT
-- cartouche is still empty: /admin/documents re-sends every row on each save,
-- so the row may exist with an empty reference — or not exist at all. A
-- reference the administrator already typed is never replaced. Two statements,
-- each order-independent (no assignment reads a column another one changes).
UPDATE `DocumentReference`
SET `version` = 'M', `createdOn` = '2006-01-05', `updatedOn` = '2023-12-18', `reference` = 'PG06/EN03'
WHERE `docType` = 'RAPPORT' AND TRIM(`reference`) = '';

-- The row is missing: create it. On an existing row this is a no-op (only the
-- duplicate key is tolerated, unlike INSERT IGNORE which would hide any error).
INSERT INTO `DocumentReference` (`docType`, `reference`, `version`, `createdOn`, `updatedOn`)
VALUES ('RAPPORT', 'PG06/EN03', 'M', '2006-01-05', '2023-12-18')
ON DUPLICATE KEY UPDATE `docType` = `docType`;

-- ---- 4 · Rôle « Direction » (validation administrative) ------------------------

-- The Prisma enum `Role` gains DIRECTION (« Directeur et son suppléant » sign
-- the validation administrative). No SQL: `User.role` is a VARCHAR(191) column
-- (Better Auth stores the role as a string) and no column uses the `Role` enum,
-- so MySQL / MariaDB have no ENUM to grow.
