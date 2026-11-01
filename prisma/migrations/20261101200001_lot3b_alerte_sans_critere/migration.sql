-- Lot 3B (RETOUR-LABO-28-10.md §5), règle O-12 : l'alerte de contamination
-- sans critère. Strictement additif : une colonne facultative, aucune ligne
-- existante réécrite, aucune colonne ni valeur retirée.

-- Vrai quand la lecture montre le germe (présence, dénombrement supérieur à
-- zéro, « > x », « Indénombrable »), faux quand toutes les lectures disent
-- son absence, nul quand rien de lisible n'a été saisi — et sur toutes les
-- lignes enregistrées avant ce lot (aucune reprise : elles portent déjà le
-- choix « Conforme / Non conforme » du technicien). Un germe sensible
-- (`alertOnExceed`) sans aucun verdict déclenche l'alerte sur cette colonne
-- (`contamination-alert.ts`). Table `Result` (nom vérifié dans les migrations
-- précédentes).
ALTER TABLE `Result`
    ADD COLUMN `detected` BOOLEAN NULL;
