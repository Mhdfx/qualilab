-- Réponses du laboratoire du 19/10 (RETOUR-LABO-19-10.md §3, lot 2C : H1 et
-- H2). Strictement additif : trois colonnes, une avec une valeur par défaut,
-- deux facultatives. Aucune ligne existante n'est réécrite, aucune valeur ni
-- colonne n'est retirée.

-- ---- H1 · Mot de passe à changer (Q81) --------------------------------------

-- Vrai quand l'administrateur crée un compte ou réinitialise son mot de passe ;
-- remis à faux quand la personne choisit elle-même son mot de passe. Tant qu'il
-- est vrai, seule la page « Mon compte » (changement du mot de passe) est
-- ouverte. Les comptes existants valent faux par la valeur par défaut : aucune
-- mise à jour de données. Table `User` (nom vérifié sur la base locale).
ALTER TABLE `User`
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;

-- ---- H2 · IF et RC du client (Q85) -------------------------------------------

-- Identifiant fiscal et registre de commerce, saisis sur la fiche client à côté
-- de l'ICE, figés dans l'instantané de chaque facture émise
-- (`Invoice.clientSnapshot`) et listés dans l'export comptable. Facultatifs,
-- vides pour les clients existants.
ALTER TABLE `Client`
    ADD COLUMN `fiscalId` VARCHAR(191) NULL,
    ADD COLUMN `tradeRegister` VARCHAR(191) NULL;
