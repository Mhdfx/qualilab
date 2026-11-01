-- Lot 3C, K5 (RETOUR-LABO-28-10.md §5) : un délai de rendu propre à un type
-- d'analyse (air, aliments, effet aseptisant…), qui l'emporte sur celui de son
-- domaine (microbiologie, physico-chimie, autre). NULL sur tous les types
-- existants : le délai du domaine, comme avant. Strictement additif.
ALTER TABLE `AnalysisNature`
    ADD COLUMN `dueDays` INTEGER NULL;
