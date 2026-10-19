-- Réponses du laboratoire du 16/10 (RETOUR-LABO-16-10.md §3.B, lot 2 vague 2 :
-- B4, Q74). Strictement additif : une valeur ajoutée EN FIN d'énumération.
-- Aucune ligne existante n'est réécrite, aucune valeur ni colonne n'est retirée.

-- ---- B4 · E-mail « échantillon non reçu » (Q74) --------------------------------

-- Un échantillon de visite annulé « Non reçu au laboratoire » est signalé au
-- client : un e-mail par échantillon, aux adresses qui reçoivent les rapports
-- (`not-received-notice.ts`). Le journal des envois (`EmailLog`) range ces
-- messages sous un quatrième type, NON_RECU. La définition reprend à
-- l'identique les trois valeurs existantes (vérifiée sur la base locale :
-- enum('RAPPORT','ALERTE_CONTAMINATION','DESTRUCTION') NOT NULL DEFAULT
-- 'RAPPORT') et ajoute la nouvelle à la fin : les valeurs stockées gardent leur
-- rang, la colonne n'est pas reconstruite (modification de métadonnées).
ALTER TABLE `EmailLog`
    MODIFY `type` ENUM('RAPPORT', 'ALERTE_CONTAMINATION', 'DESTRUCTION', 'NON_RECU') NOT NULL DEFAULT 'RAPPORT';
