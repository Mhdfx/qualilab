-- Réponses du laboratoire du 16/10 (RETOUR-LABO-16-10.md §3.A, lot 2 vague 2 :
-- A1, A7, A8). Un seul dossier, strictement additif : une valeur ajoutée EN FIN
-- d'énumération, deux colonnes nullables. Aucune ligne existante n'est réécrite,
-- aucune valeur ni colonne n'est retirée.

-- ---- A1 · État des mains (Q109, Q110) ------------------------------------------

-- « Aseptisées ou désinfectées » rejoint « Lavées » et « En cours de travail ».
-- Pas de nouvelle valeur pour « En cours de travail » : c'est NON_LAVEES, que le
-- laboratoire assimile lui-même aux anciennes « mains non lavées » (le libellé
-- change à l'écran, `labels.ts`), si bien qu'aucune ligne n'est convertie. La
-- valeur est ajoutée à la fin : la définition de la colonne change, les valeurs
-- stockées gardent leur rang (modification de métadonnées seulement).
ALTER TABLE `Sample`
    MODIFY `handsState` ENUM('LAVEES', 'NON_LAVEES', 'ASEPTISEES') NULL;

-- ---- A7 · Surface « Autre » (Q114) ---------------------------------------------

-- Ce qui est prélevé quand ce n'est pas une aire en cm² (« couteau entier »,
-- « poignée de porte ») : imprimé à la place de « N cm² ». Ligne Surface
-- seulement, jamais avec `surfaceAreaCm2` (qui reste alors vide). NULL sur toutes
-- les lignes existantes : elles s'impriment comme avant.
ALTER TABLE `Sample`
    ADD COLUMN `surfaceAreaNote` VARCHAR(191) NULL;

-- ---- A8 · Air : durée d'exposition de la boîte (Q50 a) -------------------------

-- 30 minutes proposées, modifiables (1 à 480), avec la méthode « Boîte exposée »
-- seulement. La valeur stockée de la méthode (`BOITE_EXPOSEE_30MIN`) ne change
-- pas ; une ligne existante, sans durée, se lit « 30 min » (`airMethodText`) :
-- rien n'est rempli ici.
ALTER TABLE `Sample`
    ADD COLUMN `airExposureMin` SMALLINT NULL;
