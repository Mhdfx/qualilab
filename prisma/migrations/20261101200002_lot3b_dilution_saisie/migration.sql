-- Lot 3B (RETOUR-LABO-28-10.md §5), J4 : la dilution saisie par le technicien
-- (28/10, 2.12 : « le technicien va faire entrer les résultats avec les
-- dilutions utilisées »). Strictement additif : une colonne facultative,
-- aucune ligne existante réécrite, aucune colonne ni valeur retirée.

-- Le multiplicateur de la dilution lue (×100 pour « 1/100 »), écrit seulement
-- quand le technicien en saisit une autre que celle du programme d'analyse
-- (`SampleParameter.dilutionFactor`), sinon que le facteur du catalogue.
-- Nul = la dilution du programme, sinon le facteur du catalogue, comme avant.
-- Même précision que `SampleParameter.dilutionFactor`. Table `Result` (nom
-- vérifié dans les migrations précédentes).
ALTER TABLE `Result`
    ADD COLUMN `dilutionUsed` DECIMAL(12, 4) NULL;
