# Facturation : brouillon, émission, annulation, avoirs, règlements — spec (08/10/2026)

Construit sans attendre le laboratoire : ces règles viennent de l'ancien
logiciel (types Facture / Facture annulée / Avoir ; 541 avoirs, en hausse ;
modes Espèces, Chèque, Effets, Carte, Virement) et des usages comptables.
Restent au laboratoire : tarifs par client, factures forfaitaires
mensuelles, les sept mises en page de facture.

## 1. Cycle d'une facture

`BROUILLON` → `EN_ATTENTE` (émise) → `PAYEE` (soldée) ; `ANNULEE` depuis
`EN_ATTENTE` sans règlement. Les valeurs existantes `EN_ATTENTE` et `PAYEE`
gardent leur sens ; « partiellement payée » se lit, ne se stocke pas.

- **Brouillon** : créé sans numéro (`Invoice.number` devient nullable),
  modifiable et supprimable (client, lignes, échéance, notes, TVA).
  Les échantillons d'un brouillon sont **réservés** : ils ne sont plus
  proposés à facturer ailleurs.
- **Émettre** : attribue le numéro `FAC-AAAA-NNNN` dans la transaction par
  le compteur `FACTURE` (table des compteurs ; initialisé au plus grand
  numéro existant de l'année), fixe `issuedAt`. Une facture émise ne se
  modifie plus jamais (montants, lignes, client).
- **Annuler** (facture émise, aucun règlement) : motif obligatoire,
  `cancelledAt / cancelledById / cancelReason` ; le numéro est gardé
  (pas de trou), la facture et son PDF portent « ANNULÉE » ; ses
  échantillons redeviennent facturables. Avec un règlement : refus, faire un
  avoir.
- La création directe d'une facture émise (comportement actuel) reste
  possible : « Émettre » à la création.

## 2. Avoirs

`Invoice.kind` : `FACTURE` (défaut) | `AVOIR`. Un avoir porte
`creditedInvoiceId` (la facture émise qu'il corrige), son propre numéro
`AV-AAAA-NNNN` (compteur `AVOIR`), des lignes en montants positifs (reprises
de lignes de la facture, quantité ou prix réduits, ou une ligne libre), la
même TVA. Il est émis directement (pas de brouillon) et ne s'annule pas.
Le total des avoirs d'une facture ne dépasse jamais son total TTC. Un avoir
ne rend pas un échantillon facturable de nouveau (seule l'annulation le fait).

## 3. Règlements

Table `Payment` : facture, montant (> 0), mode (`ESPECES`, `CHEQUE`,
`EFFET`, `CARTE`, `VIREMENT`), date, référence (n° de chèque…), note,
auteur. **Reste à payer** = total TTC − avoirs − règlements ; jamais
négatif (un règlement au-delà est refusé). Le statut passe à `PAYEE` quand
le reste est nul, revient à `EN_ATTENTE` si un règlement est supprimé
(suppression : COMPTABLE / ADMIN, motif, journal). « Marquer encaissée »
devient « Enregistrer un règlement » pré-rempli du reste. Les factures déjà
`PAYEE` reçoivent par la migration un règlement « Repris » de leur total
(mode `AUTRE`, ajouté à l'énumération pour cela seulement).

## 4. Contrat d'API (COMPTABLE, ADMIN ; lecture aussi GESTIONNAIRE comme aujourd'hui)

- `POST /api/invoices` `{ clientId, items, taxRate, dueDate?, notes?, issue: boolean }`
  → 201 facture (`issue: false` = brouillon sans numéro).
- `PATCH /api/invoices/[id]` brouillon seulement : mêmes champs ; 409 sinon.
- `DELETE /api/invoices/[id]` brouillon seulement.
- `POST /api/invoices/[id]/issue` → 200 `{ number, status }`.
- `POST /api/invoices/[id]/cancel` `{ reason }` → 200 ; 409 si brouillon,
  déjà annulée, avoir, ou règlements.
- `POST /api/invoices/[id]/credit-notes` `{ items: [{ description, quantity, unitPrice, invoiceItemId? }], reason }`
  → 201 avoir ; 400 si la facture n'est pas émise ou si le total dépasse le
  reste créditable.
- `GET /api/invoices/[id]/payments` ; `POST` `{ amount, mode, paidAt, reference?, note? }` ;
  `DELETE /api/invoices/[id]/payments/[paymentId]` `{ reason }`.
- `GET /api/invoices/[id]` ajoute `kind`, `issuedAt`, `cancelledAt`,
  `cancelReason`, `creditedInvoice {id, number}`, `creditNotes [{id, number, total}]`,
  `payments [...]`, `paidAmount`, `creditedAmount`, `balance`.
- Liste et statistiques : brouillons et annulées à part ; chiffre facturé =
  factures émises non annulées − avoirs ; encaissé = somme des règlements.

## 5. Documents et écrans

PDF : « BROUILLON » en filigrane et sans numéro ; tampon « ANNULÉE » avec la
date et le motif ; bloc « Réglé / Reste à payer » ; un avoir s'intitule
« AVOIR N° AV-… » et rappelle « se rapporte à la facture FAC-… du … ».
Fiche facture : statut lisible (Brouillon, Émise, Partiellement payée,
Payée, Annulée ; Avoir), actions selon le statut, liste des règlements et
des avoirs. Nouvelle facture : « Enregistrer le brouillon » / « Émettre ».
Liste : filtre par statut et par type, colonne « Reste à payer ». Fiche
client et tableaux de bord : chiffres selon §4. Journal : `INVOICE_DRAFT_*`,
`INVOICE_ISSUED`, `INVOICE_CANCELLED`, `CREDIT_NOTE_ISSUED`,
`PAYMENT_RECORDED`, `PAYMENT_DELETED`.
