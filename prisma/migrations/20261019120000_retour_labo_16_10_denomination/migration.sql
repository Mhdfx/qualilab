-- Réponses du laboratoire du 16/10 (RETOUR-LABO-16-10.md §3.D, lot 2 vague 2 :
-- D5 et D6, le « lot 1b » de RETOUR-LABO-14-10.md §8). Strictement additif : une
-- colonne nullable. Aucune ligne existante n'est réécrite, aucune valeur ni
-- colonne n'est retirée.

-- ---- D5 / D6 · Dénomination sur les documents (Q22) ---------------------------

-- Comment le rapport (« Préleveur ») et le protocole de prélèvement
-- (« Prélèvement effectué par », case de signature, « Déposé par » du bon)
-- nomment un technicien de Qualilab : « Technicien de QUALILAB 'I.NOM' », comme
-- l'ancien logiciel. Saisie dans /admin/utilisateurs. NULL sur tous les comptes
-- existants : la dénomination par défaut est calculée à l'impression depuis le
-- nom (`defaultDocumentName`), jamais écrite ici. Better Auth ignore cette
-- colonne nullable. Table `User` (nom vérifié sur la base locale).
ALTER TABLE `User`
    ADD COLUMN `documentName` VARCHAR(191) NULL;
