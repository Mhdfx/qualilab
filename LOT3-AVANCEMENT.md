# Lot 3 — avancement (retour du laboratoire du 28/10)

> Journal de reprise. **À lire en premier si le travail s'est arrêté.** Chaque
> étape terminée ajoute une ligne en bas (« Journal des étapes »). Spécification :
> `RETOUR-LABO-28-10.md` §5. Rien n'est en production : la production tourne
> toujours `e8cbfe1`.

## Où se trouve le travail

| Lot | Contenu (RETOUR-LABO-28-10.md §5) | Arbre de travail | Branche | État au 01/11 17 h 20 |
|---|---|---|---|---|
| 3A | I1, K1, I2, I3, I4, I5, K2, G2, I7, drapeaux d'alerte (S3) | `C:\laragon\www\qualilab proto` | `lot2-retour-16-10` (non commité) | construit ; relecture et corrections **à faire** |
| 3D | M1 à M8 (Achat & Stock) | `C:\laragon\www\qualilab proto` (même arbre que 3A) | `lot2-retour-16-10` (non commité) | construit ; relecture et corrections **à faire** |
| 3B | O-12, J3, J1, J2, J4, G1, G4, G5 | `C:\laragon\www\qualilab-lot3b` | `lot3b` (8 commits + 5 fichiers non commités) | construction presque finie, interrompue ; **à terminer**, puis relecture |
| 3C | I6, K5, K4, K6, L1, L2, L4, L5, I8 | `C:\laragon\www\qualilab-lot3c` | `lot3c` (1 commit + 45 fichiers non commités) | construction interrompue en cours ; **à terminer**, puis relecture |
| 3E | N1, N2, N3 (ONSSA) | `C:\laragon\www\qualilab-lot3e` | `lot3e` (commit `832d23c`) | construit et relu ; corrections de la relecture **à appliquer** |

Copies de sécurité du travail non commité (01/11 17 h 20) :
`refs/wip/lot3-qualilab-proto-2026-11-01` (3A + 3D), `refs/wip/lot3-qualilab-lot3c-2026-11-01`,
`refs/wip/lot3-qualilab-lot3b-2026-11-01` — `git diff HEAD <ref>` les montre.

Les arbres `qualilab-lot3*` sont des `git worktree` du même dépôt (node_modules =
jonction vers celui de l'arbre principal, `.env.local` copié, client Prisma généré
dans chaque arbre). Les migrations sont additives et préfixées par lot
(3A 202611011000xx, 3B …2000xx, 3C …3000xx, 3D …4000xx, 3E …5000xx).

## Ordre restant

1. Terminer 3B et 3C ; relire 3A, 3D ; appliquer les corrections de 3E (en parallèle).
2. Relire 3B et 3C, corriger.
3. Intégrer dans l'arbre principal : commits 3A et 3D, fusion de `lot3b`, `lot3c`, `lot3e`,
   migrations, contrôles (tsc, eslint, vitest, build), recettes locales + `.ui-tests/v21-lot3-local.mjs`,
   documents (HANDOFF, TESTPLAN V21, PROGRESS, RETOUR-LABO-28-10, DEPLOY « Lot 3 »).
4. Contrôle final hostile, corrections, push.
5. Production : dump, déploiement (migrations additives), étapes de `DEPLOY.md` « Lot 3 »,
   recette en production (comptes de démonstration, « TEST UI » seulement), notification au propriétaire.
6. Supprimer les arbres `qualilab-lot3*` (`git worktree remove`) une fois tout fusionné.

## Journal des étapes

- 01/11 01 h 45 — analyse du retour du 28/10 commitée (`8970d0a`).
- 01/11 ~02 h – 02 h 45 — construction en parallèle des cinq lots ; 3A, 3D et 3E construits, 3E relu ;
  puis arrêt de tous les agents (accès au service coupé). État ci-dessus.
- 01/11 17 h 20 — copies de sécurité `refs/wip/lot3-*` ; reprise lancée.
- 01/11 17 h 23 — lot 3B terminé (`lot3b`, commit `2321985`) : garde-fou O-12 × J3 (germe sensible sans critère lu dans un texte illisible → refusé à la paillasse et à la soumission) commité avec tests et documents ; O-12, J3, J1, J2, J4, G1, G4, G5 tous présents ; tsc 0, eslint 0, vitest 3112/3112, migrations 3B appliquées en local — reste la relecture.
- 01/11 17 h 26 — relecture hostile 3A : 3136 tests verts, tsc et eslint à 0, aucune migration ; 6 points à corriger (le plus important : une visite « Autre » sans « Prélevé le » imprime l'heure d'enregistrement sur le protocole et refuse ensuite une fin ou une arrivée antérieures ; le script S3 de production est ignoré par git).
- 01/11 17 h 27 — relecture hostile 3D : M1 à M8 présents, hypothèses écrites (R-23 / R-24), deux interrupteurs, migration additive et conforme au schéma, gardes magasinier + administrateur intactes, tsc 0, eslint 0, vitest 3136/3136 ; 7 points à corriger (le plus important : une facture saisie au TTC seul ne retient rien quand la retenue s'applique sur le HT ou la TVA, sans avertissement).
- 01/11 17 h 30 — corrections de la relecture de 3E : les 10 constats appliqués sur lot3e (commit 88cc51c ; verdict indicatif et Incomplet lus comme l’alerte, familles archivées sur /admin/onssa, propositions eaux et ratios, scission garde le groupe, Feuil3 et Notes, regroupement Feuil1, message texte attendu, avertissement après validation, HANDOFF et TESTPLAN), tsc 0, vitest 161 fichiers / 3 098 tests.
- 01/11 17 h 30 — relecture hostile du lot 3B (lecture seule, `lot3b` `2321985`) : tous les éléments présents, tsc 0 et vitest 3112/3112 relancés ; 7 constats à corriger (dont 2 erreurs 500 : dilution 10-8/10-9 au-delà de DECIMAL(12,4), unité « UFC/<texte> » au-delà de 191 caractères ; fiche « non enregistrée » après enregistrement d'une dilution tapée autrement que « 1/100 » ; élision « de E. coli » dans la conclusion imprimée).
- 01/11 17 h 32 — lot 3C terminé (`qualilab-lot3c`, branche `lot3c`, commit `c7e3203` sur `d3f4e9d`) : I6, K3 (interrupteur), K4, K5, K6, L1 (+ colonne « Client » sans client choisi), L2, L4, L5, I8 construits ; tsc 0, eslint 0, vitest 166 fichiers / 3 103 tests ; vérifié sur un serveur jetable (port 3233, webpack) 33/33 + script de sauvegarde avec un faux docker ; reste : relecture hostile puis intégration.
- 01/11 18 h 41 — corrections de la relecture 3D appliquées (arbre principal, non commité) : retenue HT/TVA refusée sur une facture au TTC seul et retenue absorbant tout le TTC refusée, attestation valide seulement si datée au plus tard le jour de la facture, base et état de l'attestation gardés sur la facture (migration additive 20261101400001 appliquée en local), « Rouvrir » confirmé et jamais sur une facture annulée, interrupteur PAYMENT_REQUIRES_TAX_CERTIFICATE testé dans les deux sens, hypothèse « Stock » au moment de la saisie écrite (RETOUR §5 M3), HANDOFF §8 + TESTPLAN V24 + scripts .ui-tests mis à jour ; tsc 0, eslint 0, vitest 3162/3162, contrôle des routes sur la base locale 5/5.
- 01/11 17 h 42 — correction de l'heure de la ligne précédente : les corrections 3D sont de 17 h 41 (horloge du poste), pas 18 h 41.
- 01/11 17 h 40 — corrections de la relecture 3A appliquées (arbre principal, non commité) : les 6 points corrigés — heure « Non déclarée » jamais comparée ni imprimée (PATCH série, réception, protocole, fiche et confirmation de visite), note G2 gardée sur un ancien rapport, « Détruire » choisi à la main conservé (I4), script S3 suivi dans `scripts/` avec Listeria exclue par défaut et la limite 0 annoncée (DEPLOY « Lot 3 »), interrupteurs 3A sous leur bandeau, RETOUR §5/R-14/R-28 ; tsc 0, eslint 0 sur les fichiers touchés, vitest 3162/3162.
- 01/11 17 h 45 — relecture hostile du lot 3C (lecture seule, `lot3c` `c7e3203`) : tous les éléments présents, migration additive et conforme au schéma (prisma migrate diff), tsc 0 et vitest 3103/3103 relancés ; 10 constats à corriger, dont 3 moyens : valeurs des résultats du récapitulatif données à la réception et au programmateur (hors REPORT_READ_ROLES), logo d'accréditation et cachet relus à chaque impression (non figés), adresses « clients choisis » de L5 perdues à une fusion ou un rattachement de client.
- 01/11 17 h 41 — corrections de la relecture de 3B : les 7 constats appliqués sur lot3b (commit 1c70f74 ; dilution plafonnée à 99 999 999, unité « UFC/<texte> » coupée à 191 caractères, fiche propre après une dilution réécrite, conclusion sans « de E. coli », cas « anomalie » écrit (R-28), fiche de programmation alignée sur la paillasse, interrupteur UNIT_MISMATCH_NOT_JUDGED + R-29, « Germe détecté — alerte »), tsc 0, eslint 0, vitest 160 fichiers / 3 124 tests.
- 01/11 17 h 59 — corrections de la relecture 3C (`lot3c`, commit `6e3cb7d`) : les 10 constats corrigés — valeurs du récapitulatif réservées aux profils qui lisent les rapports (réception et programmation : C / NC, décision à confirmer R-21), logo et cachet figés par empreinte avec chaque version (table en ajout seul `ReportImageArchive`, migration 20261101300001), adresses « clients choisis » suivies à la fusion et au rattachement, marque de l'ancien logiciel retirée du nom une fois le statut enregistré, délai propre à un type d'analyse en option (migration 20261101300002), EMAIL_FROM « no-reply » ignoré, accord du client comparé à la minute et protégé des corrections concurrentes, piège de backup-db.sh sans effet sur le code de sortie (vérifié sous WSL), ligne K3 « Valider et envoyer », RETOUR §5 + DEPLOY « Lot 3C » ; tsc 0, eslint 0, vitest 168 fichiers / 3 130 tests, migrations appliquées en local ; reste pour l'intégrateur : lignes HANDOFF « où changer » K4, K5, L1, L2, L4, L5.
