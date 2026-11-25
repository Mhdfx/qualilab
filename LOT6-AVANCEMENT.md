# Lot 6 — avancement (fichiers du laboratoire du 25/11)

> Journal de reprise. **À lire en premier si le travail s'est arrêté.** Spécification :
> `RETOUR-LABO-25-11.md` — §5 (lot 6A : la fiche de stock, un onglet par article, M9–M14),
> §6 (lot 6B : les factures du journal des achats, M15–M17), §7 (lot 6C : le nouveau canevas
> ONSSA, N4–N8), §4 (interrupteurs), §8 (migration), §10 (gestes du propriétaire S18–S22),
> §11 (questions E-1 … E-8).
> Production : **`c608cf7`** — non touchée par le lot 6.
> **État (25/11) : analysé et planifié — rien construit, aucun code touché.**
> Fichiers du laboratoire : `backups/fichiers-labo-25-11/` (ignoré par git) ; **dépôt public** :
> aucune valeur de ces fichiers dans le code, les tests, les documents ni ce journal (comptes de
> lignes seulement).

## Où se trouve le travail

| Lot | Contenu | Arbre | Branche | État |
|---|---|---|---|---|
| 6 — commun | M9 lecteur de classeur (toutes les feuilles, plage étendue, `.xls` refusé avec le pas à pas) ; M13 migration additive (`StockMovement.orderReference`, `StockMovement.importKey` unique, `PurchaseInvoice.importedFrom`) | `C:\laragon\www\qualilab proto` | `lot2-retour-16-10` | planifié |
| 6A | M10 analyse « une feuille par article », M11 détection du format, M12 route d'import (analyse / import, idempotent, journal `STOCK_IMPORTED`), M14 écran + bon de commande dans le journal des mouvements | idem | idem | planifié |
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
| M9 lecteur commun | ⬜ | | |
| M13 migration additive (locale) | ⬜ | | `prisma migrate deploy` + `generate`, `next.config.ts` touché |
| 6A — M10, M11 | ⬜ | | |
| 6A — M12, M14 | ⬜ | | |
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
