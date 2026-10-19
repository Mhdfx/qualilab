-- Réponses du laboratoire du 16/10 (RETOUR-LABO-16-10.md §3.F, lot 2 vague 4 :
-- F1, RP2a′ de RETOUR-LABO-14-10.md §4.7 réduit par Q121 — pas de catégories).
-- Strictement additif : une colonne nullable, un index, une clé étrangère.
-- Aucune ligne existante n'est réécrite, aucune valeur ni colonne n'est retirée.

-- ---- F1 · Le type d'analyse de chaque famille de produits (Q121, Q124, Q126) ----

-- La nature (« type d'analyse ») à laquelle une famille de produits s'applique :
-- aliments, mains et surfaces, eaux, air… C'est elle qui distingue une famille
-- d'hygiène du personnel d'une famille d'aliments (le filtre préréglé du
-- sélecteur, Q124) et qui dit sur quelle catégorie de paramètres ses critères
-- se rattachent (N2 / OLD31, Q126). NULL sur toutes les familles existantes :
-- « à préciser ». Elle est remplie ensuite par l'écran journalisé « Catalogue
-- de l'ancien logiciel » (F3, depuis la colonne `echantillon` de l'ancien
-- logiciel, seulement là où elle est vide) ou choisie à l'écran — jamais par
-- cette migration. Quand elle est connue, le domaine (`family`) s'en déduit.
-- Même type que `AnalysisNature.id` (VARCHAR(191), utf8mb4_unicode_ci, vérifié
-- sur la base locale). Tables `ProductType` et `AnalysisNature`.
ALTER TABLE `ProductType`
    ADD COLUMN `natureId` VARCHAR(191) NULL;

-- Les sélecteurs de familles filtrent par type d'analyse parmi les familles
-- actives.
CREATE INDEX `ProductType_natureId_active_idx` ON `ProductType`(`natureId`, `active`);

-- Archiver une nature ne touche à rien ; la supprimer (ce que l'application ne
-- fait jamais) remettrait ses familles « à préciser » au lieu de l'empêcher.
ALTER TABLE `ProductType` ADD CONSTRAINT `ProductType_natureId_fkey` FOREIGN KEY (`natureId`) REFERENCES `AnalysisNature`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
