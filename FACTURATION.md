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
PDF par paramètre (`?modele=parametre`, Q30, `src/lib/invoice-html-layout.ts`) :
la même facture ou le même avoir, une ligne par paramètre et par prix
unitaire (quantité = nombre d'analyses, montant = somme des lignes, les
références des échantillons sous la ligne) ; lignes libres inchangées, à leur
place ; totaux, TVA, numéro et tampons identiques. Une ligne d'avoir rejoint
son paramètre par la ligne de facture qu'elle reprend. Sans paramètre, le
PDF par ligne, inchangé ; un autre modèle → 400. Bouton « PDF par paramètre »
sur la fiche facture (comptable, admin) et sur la fiche client (gestionnaire).
Fiche facture : statut lisible (Brouillon, Émise, Partiellement payée,
Payée, Annulée ; Avoir), actions selon le statut, liste des règlements et
des avoirs. Nouvelle facture : « Enregistrer le brouillon » / « Émettre ».
Liste : filtre par statut et par type, colonne « Reste à payer ». Fiche
client et tableaux de bord : chiffres selon §4. Journal : `INVOICE_DRAFT_*`,
`INVOICE_ISSUED`, `INVOICE_CANCELLED`, `CREDIT_NOTE_ISSUED`,
`PAYMENT_RECORDED`, `PAYMENT_DELETED`.

## 6. Réponses du laboratoire du 19/10 (`RETOUR-LABO-19-10.md`)

- **Q11** — une analyse non faite n'est pas facturée : retirée du programme,
  elle disparaît de la facture proposée ; une facture déjà émise se corrige
  par un avoir (§2). Rien à construire.
- **Q30** — d'accord pour démarrer avec **un seul modèle** (une ligne par
  analyse et par échantillon, prix du catalogue modifiable avant émission ;
  ni forfait ni remise). « Besoin par paramètres » : une facture groupée par
  paramètre en plus — **construit le 20/10 en option, avant R-1** (élément
  H4, §5 « PDF par paramètre », `a83ec7e`) : un second bouton à
  l'impression, sans choix par client ni changement de schéma ; testé en
  local, non déployé. La relance R-1 dira si c'est bien cela et s'il faut un
  modèle par défaut par client.
- **Q85** — l'export comptable (« Journal des ventes » + « Règlements ») convient ;
  y ajouter l'**IF** et le **RC** du client avec l'ICE, tirés de l'identité
  figée de la facture (`Invoice.clientSnapshot`) — élément H2, **construit le
  20/10** (`f057892`), testé en local, non déployé : `Client.fiscalId` et
  `Client.tradeRegister` saisis sur la fiche client à côté de l'ICE, figés à
  l'émission (avoir compris), colonnes « ICE », « IF », « RC » du « Journal
  des ventes » ; « Règlements » garde le nom seul ; ni l'un ni l'autre n'est
  imprimé sur la facture. Une facture figée avant H2 les exporte vides, une
  facture d'avant le 10/10 (sans instantané) lit la fiche du client.
  L'ancienne base ne porte pas l'IF ni le RC des clients : rien à reprendre.
  L'adresse : relance R-2.
- **Q86** — (2) l'avance encaissée au comptoir **n'apparaît pas** sur la
  facture : elle reste sur le bon de réception seulement (déjà le cas :
  `Serie.advanceAmount` n'est lu par aucun code de facturation). (1) délai de
  paiement : sans réponse, le défaut reste « Règlement à réception de
  facture, sauf accord écrit contraire », échéance saisie par le comptable
  (R-3). (3) reprise des ≈ 6 700 prix propres à chaque client : « ? »
  (R-4 ; élément H5 si oui — il n'existe aujourd'hui aucun tarif par client).
- **Q45** — une facture par client ; un site peut être facturé à une société
  liée (`Site.billingClientId`, `CLIENTS-FUSION.md`). Inchangé.

