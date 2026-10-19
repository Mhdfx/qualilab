-- Réponses du laboratoire du 16/10 (RETOUR-LABO-16-10.md §3.E, lot 2 vague 3 :
-- E1 et E3, R2 et R4 de RETOUR-LABO-14-10.md §4.5). Strictement additif : une
-- colonne avec une valeur par défaut. Aucune ligne existante n'est réécrite,
-- aucune valeur ni colonne n'est retirée.

-- ---- E3 · « À compléter » (R4, Q117) --------------------------------------------

-- Un client créé au comptoir (RECEPTIONNISTE) ou sur le terrain (PRELEVEUR)
-- n'a souvent que son nom : le gestionnaire commercial complète ensuite l'ICE,
-- l'adresse et les adresses qui reçoivent les rapports. Vrai à la création par
-- ces deux rôles, remis à faux quand le gestionnaire commercial ou
-- l'administrateur enregistre la fiche complète (jamais par un simple
-- archivage). Les clients existants valent faux par la valeur par défaut :
-- aucune mise à jour de données. Pas d'index : la liste des clients filtre à
-- l'écran. Qui a créé le client, le journal le dit (CLIENT_CREATED). Table
-- `Client` (nom vérifié sur la base locale).
ALTER TABLE `Client`
    ADD COLUMN `toComplete` BOOLEAN NOT NULL DEFAULT false;
