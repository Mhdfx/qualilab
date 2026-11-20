# Lot 5 — avancement (réponses du laboratoire du 20/11)

> Journal de reprise. **À lire en premier si le travail s'est arrêté.** Spécification :
> `RETOUR-LABO-20-11.md` §5 (lot 5A : J6, I10, J7, J8, K11, commentaires ; gestes S13–S17)
> et §6 (lot 5B : HA1–HA8, l'historique de l'ancien logiciel sur le portail).
> Production : **`4ebb146` (lot 4, déployé le 05/11 20 h 30)** — non touchée par le lot 5.
> **État : planifié — rien construit.** À construire quand le propriétaire le dit ;
> à la construction, règle du 21/10 : déployer, puis tester en production sur « TEST UI »
> seulement (jamais un mot de passe en production : comptes de démonstration cliqués).

## Où se trouve le travail

| Lot | Contenu | Arbre | Branche | État |
|---|---|---|---|---|
| 5A | J6 (unité des surfaces au choix, jugement par la valeur), I10 (identification « à vérifier »), J7 (échantillons des collègues masqués — hypothèse D-1), J8 (« À prendre » par n° de série), K11 (corriger un rapport jamais envoyé sans amendement), commentaires « confirmé le 20/11 » | `C:\laragon\www\qualilab proto` (ou un arbre `qualilab-lot5a`) | à créer (`lot5a`) depuis `lot2-retour-16-10` | **planifié** |
| 5A — gestes | S13 (retenue TVA 75 / 100, sans la durée), S14 (alias E. coli / Coliformes + relance des prix clients), S15 (sensoriel n = 1), S16 (première adresse de copie), S12 (portée d'accréditation, quand reçue), S17 (compteurs, si décision Q19) | production, par les routes de l'application | — | **planifié** (attend le propriétaire) |
| 5B | HA1–HA7 (+ HA8 en option) : historique de l'ancien logiciel, lecture seule, portail et fiche client | à choisir (arbre `qualilab-lot5b` conseillé) | à créer (`lot5b`) | **planifié** ; HA2-a (repérage des tables dans `qlabo-fb`) à faire en premier |

Migrations prévues (additives, préfixe par lot) : 5A une seule (K11, `ReportVersion.correctedBeforeSend`),
5B trois tables (`LegacyClientLink`, `LegacySample`, `LegacyResult`).

## Ordre

1. Propriétaire, sans code : décision Q19 (S17 si « sauter maintenant ») ; S13 (sans la durée), S14, S15
   (compter d'abord), S16 (première adresse seulement).
2. Lot 5A : construction, relecture hostile, corrections ; contrôles (tsc, eslint, vitest, build) ;
   recette locale `v23-lot5a-local.mjs` ; `DEPLOY.md` « Lot 5A » (tag `v1.8-avant-lot5`, dump,
   migration) ; recette de production `v23-lot5a-prod.mjs` ; TESTPLAN « Checkpoint V23 ».
3. Lot 5B : Docker relancé (contournement du socket périmé, jamais de réinitialisation), `qlabo-fb`
   démarré ; HA2-a (repérer les lectures par unité, le n° et la date du rapport, la conclusion,
   l'annulation) ; HA1 → HA7 ; répétition complète sur une copie locale, comptes relus par le
   propriétaire ; production (dump, migration, liens clients, imports mensuels, recette).
4. Prévenir le laboratoire (5A, puis 5B) avec les questions D-1 … D-7 (`RETOUR-LABO-20-11.md` §8).

## Journal des étapes

- 20/11 — scan des réponses du 20/11 (« Dernières précisions » du 07/11) relu page par page (rendu
  250 et 500 dpi) ; analyse écrite (`RETOUR-LABO-20-11.md`) ; adresses lues rangées hors du dépôt
  (`backups/retour-labo-20-11/adresses.md`) ; NEEDEDINFO, `RETOUR-LABO-04-11.md` §7, HANDOFF §1,
  PROGRESS mis à jour. **Rien construit, aucun code touché, production non touchée.**
- 20/11 — relecture hostile (scan relu à nouveau, chaque « en ligne » vérifié dans le code) : lectures
  du scan confirmées (Q7 « Oui » bien coché ; note de Q5 transcrite avec son mot incertain) ;
  corrigé dans `RETOUR-LABO-20-11.md` : N3 cité à `isNonConformResult` (`onssa-report.ts`, pas
  `ONSSA_COUNT_BY`), `SEND_REPORT_ROLES` à `report-actions.ts` ; J6 précise que seule la surface
  décrite en mots est aujourd'hui « sans interprétation » ; **J7** : « Libérer » est refusé dès qu'un
  relevé est saisi (`untakeRefusal`) — l'ADMIN doit pouvoir libérer un échantillon commencé, sinon
  plus aucune reprise (effort S–M → M ; D-1 complétée) ; prise par paramètre gardée visible ;
  **K11** : cas d'un `-A1` pas encore envoyé (garde son numéro et son « Annule et remplace ») ;
  HA2 : fichiers NDJSON texte (pas `.gz`), plafond 8 Mo cité à sa route. Aucun code touché.
