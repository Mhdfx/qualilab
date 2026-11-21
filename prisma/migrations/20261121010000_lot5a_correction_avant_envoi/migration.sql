-- Lot 5A, K11 — réponse du 20/11 à Q132 (RETOUR-LABO-20-11.md §1 n° 16, §5) :
-- un rapport validé jamais envoyé se corrige sans amendement (« Corriger avant
-- envoi ») : même numéro, sans « annule et remplace ».
--   * `ReportVersion.correctedBeforeSend` : la trace interne de la correction
--     (en cours : motif, auteur, date ; puis chaque version figée remplacée sur
--     place, avec son émission et le motif, l'auteur et la date de la
--     correction) — jamais imprimée ni envoyée. JSON (texte long) : un
--     `ReportData` ne tient pas dans les métadonnées du journal (TEXT, 64 Ko).
-- Strictement additif : une colonne nullable, aucune ligne existante touchée.

-- AlterTable
ALTER TABLE `ReportVersion` ADD COLUMN `correctedBeforeSend` JSON NULL;
