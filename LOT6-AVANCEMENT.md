# Lot 6 — avancement (fichiers du laboratoire du 25/11)

> Journal de reprise. **À lire en premier si le travail s'est arrêté.** Spécification :
> `RETOUR-LABO-25-11.md` — §5 (lot 6A : la fiche de stock, un onglet par article, M9–M14),
> §6 (lot 6B : les factures du journal des achats, M15–M17), §7 (lot 6C : le nouveau canevas
> ONSSA, N4–N8), §4 (interrupteurs), §8 (migration), §10 (gestes du propriétaire S18–S22),
> §11 (questions E-1 … E-8).
> Production : **`c608cf7`** — non touchée par le lot 6.
> **État (25/11) : 6A construit, vérifié en local et commité (M9, M13, M10–M14) — non poussé, non déployé ;
> 6B et 6C restent à construire.**
> Fichiers du laboratoire : `backups/fichiers-labo-25-11/` (ignoré par git) ; **dépôt public** :
> aucune valeur de ces fichiers dans le code, les tests, les documents ni ce journal (comptes de
> lignes seulement).

## Où se trouve le travail

| Lot | Contenu | Arbre | Branche | État |
|---|---|---|---|---|
| 6 — commun | M9 lecteur de classeur (toutes les feuilles, plage étendue, `.xls` refusé avec le pas à pas) ; M13 migration additive (`StockMovement.orderReference`, `StockMovement.importKey` unique, `PurchaseInvoice.importedFrom`) | `C:\laragon\www\qualilab proto` | `lot2-retour-16-10` | ✅ local (25/11) |
| 6A | M10 analyse « une feuille par article », M11 détection du format, M12 route d'import (analyse / import, idempotent, journal `STOCK_IMPORTED`), M14 écran + bon de commande dans le journal des mouvements | idem | idem | ✅ local (25/11) |
| 6B | M15 analyse du journal des achats, M16 route `POST /api/purchase-invoices/import` (idempotent sur fournisseur + numéro, paiements, retenue §2.5, journal `PURCHASE_INVOICES_IMPORTED`), M17 écran | idem | idem | planifié |
| 6C | N4 données des sections III, N5 classeur au nouveau canevas (7 feuilles + « Notes Qualilab »), N6 route `?format=` et écran, N7 « Groupes du nouveau canevas » ; N8 (annuel) seulement sur E-8 | idem | idem | planifié |
| Gestes | S18 dump, S19 import du stock + inventaire, S20 fournisseurs soumis, S21 conversion `.xlsx` + import des factures, S22 groupes ONSSA + export à valider | production, par les écrans | — | après le déploiement |

Interrupteurs (défaut) : `STOCK_IMPORT_QUANTITY_FROM_PRICE` ON, `STOCK_IMPORT_LEVEL_FROM_FILE` ON,
`STOCK_EXPIRY_MONTH_END` ON, `PURCHASE_IMPORT_UNNUMBERED` « GENERATE », `PURCHASE_IMPORT_EMPTY_STATUS_UNPAID` ON,
`PURCHASE_IMPORT_WITHHOLDING` « UNPAID_ONLY », `ONSSA_EXPORT_LAYOUT` « CANEVAS_2026 »,
`ONSSA_CHEMISTRY_OWN_ROW` ON, `ONSSA_EMPTY_ORIGIN_AGRO` ON, `ONSSA_SECTIONS_FROM_APP` ON,
`ONSSA_IV_NON_ACCREDITED` OFF.

## État par étape

| Étape | Statut | Contrôles (tsc / eslint / vitest) | Note |
|---|---|---|---|
| Analyse des trois fichiers, `RETOUR-LABO-25-11.md` | ✅ 25/11 | — (documents seulement) | |
| M9 lecteur commun | ✅ 25/11 | tsc 0 / eslint 0 / vitest ✅ | `stock-import-file.ts` (+ test) |
| M13 migration additive (locale) | ✅ 25/11 | — | `20261125010000_lot6_imports` appliquée sur `qualilab_local` (`migrate deploy` + `generate`), `next.config.ts` touché |
| 6A — M10, M11 | ✅ 25/11 | tsc 0 / eslint 0 / vitest ✅ | `stock-workbook-import.ts` (+ test), interrupteurs + `lab-proposals-6-back.test.ts` |
| 6A — M12, M14 | ✅ 25/11 (commité après reprise) | tsc 0 / eslint 0 / vitest ✅ ; V24 local 26/26 ; build ✅ | route `api/stock/import`, `stock-import-server.ts`, écran, journal (+ export), entrée saisie |
| 6B — M15 | ⬜ | | |
| 6B — M16, M17 | ⬜ | | |
| 6C — N4, N5 | ⬜ | | |
| 6C — N6, N7 | ⬜ | | |
| Relecture hostile + corrections | ⬜ | | |
| Recette locale V24 (synthétique) + répétition avec les vrais fichiers | ⬜ | | comptes seulement, aucune valeur |
| `npm run build`, régressions v20 / v22 / v23 | ⬜ | | |
| Documents (HANDOFF §5 §8 §9, TESTPLAN V24, DEPLOY « Lot 6 », PROGRESS) | ⬜ | | |
| Production (tag `v1.9-avant-lot6`, dump, migration, recette `v24-lot6-prod.mjs`) | ⬜ | | |
| Gestes S18–S22 (propriétaire) | ⬜ | | |

## Ordre

1. M9, puis M13 (migration locale).
2. 6A (M10 → M11 → M12 → M14), 6B (M15 → M16 → M17), 6C (N4 → N5 → N6 → N7) — 6C indépendant.
3. Relecture hostile de chaque partie (`qualilab-audit-lessons` : relire aussi le correctif), corrections,
   contrôles, recette locale, documents.
4. Production, recette de production, puis les gestes du propriétaire (analyse d'abord, import ensuite).
5. Questions E-1 … E-8 au laboratoire, quand le propriétaire le décide.

## Journal des étapes

- 25/11 — **analyse des trois fichiers reçus le 25/11** (lecture seule, Python `openpyxl` / `xlrd`) :
  « Consommable labo.xlsx » (21 onglets, 24 tableaux, 29 lignes de données ; aucune sortie écrite ;
  10 lignes sur 24 où les prix ne vérifient pas quantité × unitaire ; sous-colonnes de prix dans les
  deux ordres ; expirations en 4 formats), « Journal Achat 2026.xls » (BIFF8, une feuille, 580 lignes
  remplies dont 11 lignes de modèle à zéro, plage utilisée ≈ 7 600 × 253 ; ≈ 18 factures sans numéro,
  4 groupes de doublons fournisseur + numéro, 62 lignes en euros sans DH, 118 TTC seul, 105 sans
  statut, 4 dates de paiement en texte, 14 paiements avant la facture, références bancaires dans
  « Mode de paiement »), « NV CANEVAS RA LABO.xlsx » (7 feuilles ; II-2 = les 24 colonnes et normes
  déjà codées ; formules de totaux incohérentes ; « Origine » = domaine d'activité selon le
  tutoriel). Code relu : imports du magasin (`stock-import*.ts`, routes `api/stock/import`,
  `api/suppliers/import`, `/magasin/import`), factures fournisseurs (`purchase-*.ts`,
  `withholding.ts`, routes `api/purchase-invoices*`), rapport ONSSA (`onssa-report*.ts`,
  `onssa-workbook.ts`, `onssa-canevas.ts`, route `api/onssa/rapport`, `/qualite/onssa`), notes de
  `RETOUR-LABO-28-10.md` / `04-11` / `20-11`. Décision proposée pour le `.xls` : pas de dépendance
  (SheetJS sur npm figé à 0.18.5, vulnérable) — enregistrement en `.xlsx` avec un message pas à pas,
  et le lecteur corrigé pour la plage étendue. Plan écrit (`RETOUR-LABO-25-11.md`), ce journal créé.
  **Rien construit, aucun code touché, production non touchée.**
- 25/11 — **lot 6A construit (M9, M13, M10–M14)**, branche `lot2-retour-16-10`, rien poussé, production
  `c608cf7` non touchée.
  - **M9** `readImportWorkbook(file, { sheets: "first" | "all" })` (`stock-import-file.ts`) : toutes les
    feuilles, lignes et colonnes vides de fin coupées, limite comptée sur les lignes **remplies** (5 000 par
    feuille), 100 feuilles au plus, 8 Mo ; une plage fusionnée lue dans sa première cellule seulement
    (exceljs répète la valeur dans les autres : l'en-tête sur deux lignes était lu deux fois) ; formule →
    son résultat en cache, sans résultat → signalée ; date au format « mois-année » repérée ; `.xls` refusé
    avec le pas à pas (Excel / LibreOffice). `readImportFile` garde son contrat (première feuille).
  - **M13** migration additive `20261125010000_lot6_imports` (les trois colonnes du §8, une seule
    migration pour 6A et 6B), appliquée en local.
  - **M10 / M11** `stock-workbook-import.ts` (pur) : tableaux repérés partout (« Date » + « Libellé » +
    « Entrée… »), sous-titres de prix dans les deux ordres, variante d'un second tableau (devant « Entrée »,
    colonne de gauche, ligne seule au-dessus — seulement quand l'onglet porte plusieurs tableaux), unité
    du conditionnement, lignes → mouvements (entrée, sortie, « stock de départ »), `reconcile` (dans
    l'ordre : total = q × u avec les titres puis inversés, prix d'une pièce, quantité en pièces avec
    q ≥ taille), expirations « MM-AAAA » / « MM/AAAA » / mois-année / « JJ/MM/AA », `importKey` = empreinte
    (onglet, variante, cellules brutes de la ligne, rang parmi les lignes identiques) ; `detectStockFormat`.
    Précisions de construction (dans l'esprit d'E-1 / E-2, sous `STOCK_IMPORT_QUANTITY_FROM_PRICE`) : un
    « Stock » écrit en pièces (= entrée × taille) ou en mL (« Stock/ml » d'un article « Entrée/1l ») est
    ramené dans l'unité de l'article ; le « dernier Stock » est celui de la ligne la plus récente (date,
    puis ligne).
  - **M12** route `POST /api/stock/import` (`format=auto | par-article | registre`, MAGASINIER / ADMIN
    inchangés) + `stock-import-server.ts` : analyse par article (« à créer » / « déjà importé » /
    « suivi à la main — non touché » / « archivé — non touché »), import par lots de 50 articles (une
    transaction chacun), niveau d'un article repris gardé par sa quantité lue (comme une saisie), ligne
    nouvelle datée avant le dernier mouvement refusée, ajustement final daté du jour (avec son
    `importKey`) ; 409 sur course ; journal `STOCK_IMPORTED` (`format`, comptes) seulement quand
    quelque chose est écrit — un import qui n'a rien à écrire répond 200 « rien à importer ». Le format
    « registre » (lot 3D) est inchangé (le journal porte désormais `format: "registre"`).
  - **M14** `/magasin/import` : choix du format (détecté par défaut), compte rendu
    `StockWorkbookReport.tsx` (articles, mouvements, prix rapprochés, ajustements, lignes ignorées, à
    vérifier, textes hors tableau) ; colonne « Bon de commande » dans le journal des mouvements (écran,
    route, export Excel, juste après « Libellé ») ; champ « Bon de commande » de l'entrée saisie (64
    caractères, entrée seulement) et dans l'historique d'un article.
  - **Tests** : `stock-import-file.test.ts` (classeurs synthétiques exceljs), `stock-workbook-import.test.ts`,
    `lab-proposals-6-back.test.ts` (les trois interrupteurs OFF), `stock.test.ts` (bon de commande),
    `stock-journal.test.ts` (colonne). Contrôles : tsc 0, eslint 0, vitest 220 fichiers / 3 962 tests
    (un seul échec dans la suite complète, `report-number.race.test.ts` « 60 approbations », délai de 30 s
    dépassé sous charge — sans lien, vert relancé seul).
  - **Recette locale** `.ui-tests/v24-lot6-local.mjs` (ignoré) : partie A synthétique 23/23 (gardes,
    `.xls`, analyse, import, second import = 0 écrit, niveaux et bon de commande en base, journal et
    export, audit, entrée saisie, article devenu « suivi à la main », registre toujours lu, classeur sans
    tableau refusé). **Répétition avec « Consommable labo.xlsx »** (base locale, comptes seulement) :
    analyse — format détecté « par-article », 21 onglets, 24 tableaux, 28 lignes lues, 24 articles à
    créer, 27 mouvements, 2 ajustements au niveau de la fiche, 1 ligne ignorée (sans quantité), 14
    avertissements, 4 textes hors tableau ; contrôle des prix sur les 27 mouvements : 16 vérifiés, 5
    quantités en pièces ramenées, 3 prix d'une pièce ramenés, 1 inversion, 2 non départagés (importés
    tels qu'écrits, signalés) ; **import** : 24 articles créés, 27 mouvements, 2 ajustements (29 lignes
    en base portant une empreinte) ; **second import : 0 écrit** (27 lignes sautées). Rien n'est recopié
    du fichier ici.
  - Reste : 6B (M15–M17), 6C (N4–N7), relecture hostile, `npm run build`, documents (HANDOFF, TESTPLAN
    V24, DEPLOY « Lot 6 »), production.
- 25/11 (soir) — **reprise après le redémarrage de session, 6A relu et commité.** Le travail non commité
  (sauvegardé aussi en `refs/wip/lot6a-interrompu-2026-11-25`) relu : lecteur, analyse, plan, route,
  module serveur, écran, journal des mouvements, entrée saisie — gardé tel quel. Migration
  `20261125010000_lot6_imports` confirmée appliquée sur `qualilab_local` (`migrate status` : à jour ; les
  trois colonnes et l'index unique présents), `prisma generate` relancé, `next.config.ts` touché.
  - **Dépôt public — correction** : des jeux d'essai de `stock-workbook-import.test.ts`,
    `lab-proposals-6-back.test.ts`, `stock-import-file.test.ts` et `stock-journal.test.ts` (et quelques
    exemples en commentaire du schéma, de `stock-workbook-import.ts` et de `lab-proposals.ts`) reprenaient
    des valeurs du fichier du laboratoire (bons de commande, lots, expirations, prix, dates) : tous
    remplacés par des valeurs inventées, vérifiées absentes du fichier par un balayage automatique des
    cellules (hors en-têtes de structure « Entrée/… » déjà décrits dans le plan et petits entiers).
    Même nettoyage dans `.ui-tests/v24-lot6-local.mjs` (ignoré).
  - **Répétition complète avec « Consommable labo.xlsx »** sur la base locale, après suppression des 24
    articles locaux de la première répétition (comptes seulement) : analyse — « par-article » détecté,
    21 onglets, 24 tableaux, 28 lignes lues, 24 articles à créer, 27 mouvements, 2 ajustements, 1 ligne
    ignorée, 14 avertissements, 4 textes hors tableau ; **import** — 24 articles créés, 27 mouvements,
    2 ajustements (29 lignes en base portant une empreinte) ; **second import : 0 écrit** (27 lignes
    sautées) ; une troisième analyse et deux imports de plus : toujours 0.
  - Contrôles : tsc 0, eslint 0, vitest 220 fichiers / 3 962 tests, `npm run build` ✅ ; V24 locale partie A
    23/23, A + B 26/26.
  - Reste : 6B (M15–M17), 6C (N4–N7), relecture hostile, documents (HANDOFF, TESTPLAN V24, DEPLOY
    « Lot 6 »), production.
