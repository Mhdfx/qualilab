# Fichiers du laboratoire du 25/11 (fiche de stock, journal des achats, nouveau canevas ONSSA) — plan du lot 6

> **État au 25/11 : analysé, lot 6 planifié — rien construit, aucun code
> touché ; production `c608cf7` non touchée** (branche `lot2-retour-16-10`).
> Le 25/11, le laboratoire a envoyé trois fichiers **remplis** — ceux que
> R-22 / R-23 (`RETOUR-LABO-28-10.md` §6) et la liste « À nous envoyer » de
> `RETOUR-LABO-04-11.md` / `RETOUR-LABO-20-11.md` §3 attendaient depuis le
> 28/10 (le 28/10 n'étaient arrivés que des modèles vides et un extrait de
> trois feuilles du canevas) :
>
> | Fichier (dans `backups/fichiers-labo-25-11/`, ignoré par git) | Ce que c'est | Pour |
> |---|---|---|
> | « Consommable labo.xlsx » | la **fiche de stock réelle** : 21 onglets, **un onglet par article** | lot **6A** |
> | « Journal Achat 2026.xls » | le **journal des achats 2026** : ancien format Excel 97–2003 (BIFF8), une feuille, ≈ 580 lignes de factures fournisseurs | lot **6B** |
> | « NV CANEVAS RA LABO.xlsx » | le **nouveau canevas officiel ONSSA** du rapport d'activité mensuel, complet (7 feuilles), rempli pour un mois de 2026 | lot **6C** |
>
> Chaque fichier a été lu comme une donnée (Python, `openpyxl` / `xlrd`, en
> lecture seule) : structure, en-têtes, types de cellules, formules, cellules
> fusionnées, anomalies comptées. **Aucune valeur des fichiers n'est recopiée
> ici** (dépôt public) : ni nom de fournisseur, ni numéro de facture ou de
> bon de commande, ni montant, ni lot, ni chiffre déclaré à l'ONSSA — seulement
> la forme des fichiers et des comptes de lignes. Les tests du lot 6 utilisent
> des données synthétiques.
>
> - **Lot 6** = trois imports / exports, chacun en **analyse puis import**
>   (ou en export seul pour 6C), idempotents, journalisés, derrière leurs
>   gardes de rôle, avec un interrupteur par hypothèse dans
>   `src/lib/lab-proposals.ts` (ON = la proposition, OFF = le comportement
>   d'aujourd'hui ou le plus prudent). **Rien n'est construit avant que le
>   propriétaire le dise** ; à la construction, la règle du 21/10 s'applique
>   (déployer, puis tester en production sur « TEST UI » seulement — pour les
>   imports, l'analyse en production d'abord, l'import ensuite, par le
>   propriétaire : §10).
> - Le suivi pas à pas est dans `LOT6-AVANCEMENT.md`.

## 0. Ce qui est arrivé, en une phrase par fichier

- **Stock** : le registre du 28/10 (un registre unique pour tous les
  articles, « Libellé » = l'article) **n'est pas** ce que le laboratoire
  tient : il tient **un onglet par article**, où « Libellé » est le **numéro
  du bon de commande**. L'import des articles du lot 3D (M8) ne lit donc pas
  ce fichier correctement (il prendrait chaque bon de commande pour un
  article) — d'où 6A.
- **Achats** : les 13 colonnes du modèle du 28/10, remplies ; l'import des
  fournisseurs du lot 3D en tire les fournisseurs, mais **pas les factures**
  (« les factures du journal ne sont pas importées ») — d'où 6B. Le fichier
  est un `.xls` : aujourd'hui refusé avec le conseil de l'enregistrer en
  `.xlsx` ; et, même converti, **refusé pour « trop de lignes »** (la plage
  utilisée de la feuille va bien au-delà des lignes remplies, §2.3) — à
  corriger quel que soit le choix du lecteur.
- **ONSSA** : le canevas complet attendu par R-22 (page de garde, plan,
  tutoriel, I-AGL, II-AT, III-AD, IV). Les 23 colonnes de germes et la
  colonne « chimie alimentaires » de II-2 sont **exactement** celles de
  l'extrait du 28/10 déjà codées (`ONSSA_COLUMNS`, `onssa-canevas.ts`),
  méthodes comprises : les comptes du lot 3E (`onssa-report.ts`) restent la
  source des chiffres ; ce qui change est la **mise en page** (7 feuilles au
  lieu de 3) et les sections III / IV, que l'application ne produit pas
  aujourd'hui — d'où 6C.

## 1. « Consommable labo.xlsx » — la fiche de stock

### 1.1 Forme du fichier

- **21 onglets, 24 tableaux** : un onglet = un article, nommé par l'onglet
  (désignation, parfois suivie du fournisseur ou d'une référence catalogue —
  noms laissés dans le fichier). Trois onglets portent **deux tableaux**
  l'un sous l'autre, deux variantes d'un même consommable (par exemple
  deux numéros d'un même réactif, ou deux formes d'un même indicateur) : ce
  sont **deux articles**.
- **En-tête à hauteur variable** : ligne 2, 3, 4 ou 5 (et 11, 12, 15 pour
  les seconds tableaux), première colonne en A (15 tableaux) ou en B (9) ;
  en-tête sur **deux lignes** : « Prix (dh/ht) » fusionné sur deux colonnes,
  ses sous-titres « prix unitaire » / « prix total » sur la ligne suivante,
  **dans un ordre ou dans l'autre** (7 tableaux unitaire d'abord, 17 total
  d'abord) ; les autres titres fusionnés sur les deux lignes.
- **Colonnes** : Date | Libellé (= **bon de commande**, « n/aa » ou
  « BC n/aa », en texte) | Lot (ou « lot », « N°LOT ») | Expiration (ou
  « Exp », « EXPIRATION », une fois « Exp/<nombre> ») | **Entrée/<conditionnement>**
  (« Entrée/B50 », « Entrée/C500 », « Entrée/500 », « Entrée/48/carton »,
  « Entrée 5U », « Entrée/1l », ou « Entrée » seul ; une fois préfixé du nom
  de la variante : « DPD 1 Entrée/B500 ») | Sortie | Stock (une fois
  « Stock/ml ») | Prix (deux sous-colonnes) | **Lieu de stockage** (6
  onglets, jamais rempli).
- **Le libellé d'un second tableau** se trouve selon l'onglet : devant
  « Entrée » dans l'en-tête, sur une ligne seule juste au-dessus de
  l'en-tête, ou dans la colonne à gauche du tableau sur sa première ligne de
  données (avec, dessous, un nombre isolé sans titre). Ailleurs, quelques
  textes isolés hors tableau (un nom de fournisseur au-dessus d'un tableau, un
  sigle dans un coin).
- **29 lignes de données** en tout (0 à 5 par tableau ; un onglet vide),
  dont 12 datées d'avant 2025 (2021–2023).

### 1.2 Correspondance avec le modèle

| Fichier | Application | Remarque |
|---|---|---|
| nom de l'onglet (+ libellé du tableau) | `StockItem.name` (unique) | « <onglet> — <variante> » pour un onglet à deux tableaux |
| `<conditionnement>` de « Entrée/… » | `StockItem.unit` | « B50 » → « boîte de 50 », « C500 » → « carton de 500 », « 500 » → « lot de 500 », « 48/carton » → « carton de 48 », « 5U » → « lot de 5 », « 1l » → « flacon de 1 L » ; sans conditionnement : « unité » (hypothèse du lot 3D, R-23) |
| Date | `StockMovement.movementDate` | jamais dans le futur (règle M1) |
| Libellé | **absent** : à ajouter, `StockMovement.orderReference` (migration additive) | aujourd'hui seule la note libre pourrait le porter |
| Lot | `StockMovement.lot` | nombre → texte sans séparateur de milliers |
| Expiration | `StockMovement.expiryDate` | formats mêlés (§1.3) |
| Entrée / Sortie | `StockMovement` ENTREE / SORTIE, `quantity` | rapprochées des prix (§1.3) |
| Stock | `levelAfter` attendu | sert de contrôle et, interrupteur ON, de niveau final (§4) |
| Prix unitaire / total | `StockMovement.unitPriceHT` (prix d'une unité de comptage) | ordre et sens vérifiés par le calcul (§1.3) ; réservé au magasinier et à l'administrateur |
| Lieu de stockage | `StockItem.location` | vide partout |

### 1.3 Écarts relevés (comptés sur les 29 lignes)

- **Aucune sortie n'est jamais écrite** (colonne « Sortie » vide partout) :
  le fichier est un registre des **réceptions**, pas un suivi du niveau. Le
  « Stock » écrit est le plus souvent la quantité de la livraison elle-même
  (pas un cumul) ; il manque sur une partie des lignes ; il vaut parfois une
  formule (« =500*20 », « =F6 »). **Le niveau réel d'aujourd'hui n'est donc
  dans aucune cellule** : après l'import, un inventaire (ajustement, qui
  existe) donnera le vrai niveau — geste du propriétaire (§10).
- **Unité des quantités mêlée** : la même colonne « Entrée/C500 » porte tantôt
  un nombre de cartons, tantôt un nombre de pièces (« =40*500 », « 5000 »).
  Les prix le trahissent : sur 24 lignes avec quantité et prix, 14 vérifient
  total = quantité × unitaire ; **10 non** — dont plusieurs vérifient
  total = quantité × conditionnement × unitaire (prix par pièce) ou
  total = (quantité ÷ conditionnement) × unitaire (quantité en pièces).
- **Sous-colonnes de prix inversées ou mal titrées** : l'ordre
  unitaire / total varie d'un tableau à l'autre, et dans quelques lignes la
  valeur titrée « unitaire » est plus grande que le « total ». 7 lignes ont
  leurs prix en **texte** (un nombre saisi comme texte).
- **Lignes incomplètes** : 3 lignes sans entrée mais avec un « Stock » (un
  stock de départ), 2 lignes sans aucune quantité (prix seuls), 2 lignes sans
  date (le libellé d'une variante, un nombre isolé).
- **Expirations** : 20 vides ; 3 dates Excel au format « mois-année »
  (le 1er du mois) ; en texte « MM-AAAA » (3), « MM/AAAA » (2), « JJ/MM/AA »
  (1). Une expiration est **antérieure à la date d'entrée** (saisie à
  vérifier).
- **Libellé** : texte partout dans ce fichier ; mais une cellule « 1/26 » non
  protégée devient une date dans Excel — à reconnaître (une date dans
  « Libellé » = un bon de commande converti, signalé).

### 1.4 L'import d'aujourd'hui (lot 3D, M8) face à ce fichier

`parseArticleSheet` (`src/lib/stock-import.ts`) lit **la première feuille
seulement** (`readImportFile`, `stock-import-file.ts`), cherche l'en-tête dans
les dix premières lignes, fait **un article par « Libellé »** et crée **un
seul mouvement « Stock d'ouverture »** daté du jour d'import. Sur ce fichier :
un seul onglet lu, ses bons de commande pris pour des articles, l'historique
(dates, bons, lots, prix) perdu. Le format « registre unique » doit continuer
de fonctionner (le modèle du 28/10 reste valable pour un laboratoire qui
l'utiliserait) : 6A ajoute le format « une feuille par article » à côté, sans
le remplacer.

## 2. « Journal Achat 2026.xls » — le journal des achats

### 2.1 Forme du fichier

- `.xls` BIFF8 (Excel 97–2003), une feuille « Journal » (nom suivi
  d'espaces), en-tête ligne 1, **580 lignes remplies** (dates de janvier à
  novembre 2026), mais une plage utilisée de **≈ 7 600 lignes × 253
  colonnes** (mise en forme étendue) ; une cellule isolée hors des 13
  colonnes.
- Les 13 colonnes du modèle du 28/10 : Fournisseurs | Délai de paiement | N°
  Facture | Mois | Date | Échéance | Montant HT | TVA 20 % | Montant TTC |
  Euro | Statut | Date paiement | Mode de paiement.
- Dates en **numéros de série Excel** (système 1900) ; montants en nombres
  (aucun en texte, aucun négatif — pas d'avoir).

### 2.2 Correspondance avec le modèle

| Colonne | Application | Règle proposée |
|---|---|---|
| Fournisseurs | `Supplier` (rapproché par le nom, majuscules / accents / espaces / ponctuation ignorés — `headerKey`) | trouvé → rattaché ; sinon **créé** (délai, ci-dessous ; « soumis à la retenue » non coché) ; un fournisseur archivé est rattaché quand même (historique) et signalé |
| Délai de paiement | `Supplier.paymentTermDays` à la création ; l'échéance de la facture | le délai le plus fréquent des lignes du fournisseur ; à défaut, l'écart échéance − date le plus fréquent ; à défaut 30 |
| N° Facture | `PurchaseInvoice.number` — clé `@@unique([supplierId, number])` | espaces de bord retirés, zéros de tête gardés (texte) |
| Mois | — | recalculé de la date ; un désaccord est signalé, jamais bloquant |
| Date | `issueDate` | numéro de série → jour |
| Échéance | `dueDate` | à défaut : date + délai de la ligne, sinon du fournisseur ; une échéance avant la date est refusée (règle du formulaire) → date + délai, signalé |
| Montant HT, TVA | `amountHT`, `vatAmount`, `vatRate` = TVA ÷ HT (20 ou 0) | arrondis au centime ; TTC recalculé = HT + TVA |
| Montant TTC | `amount` | seul quand HT manque (facture « TTC seul », comme avant le lot 3D) ; écart de plus d'un centime avec HT + TVA → ligne à corriger |
| Euro | `currency` = « EUR », `amountForeign` ; `exchangeRate` = TTC ÷ euros quand les deux sont là | sans TTC en DH : voir §2.3 |
| Statut | `status` | « Payée » (et « Prélèvement », écrit dans Statut) → PAYEE ; vide → A_PAYER (interrupteur, §4) |
| Date paiement | un `PurchasePayment` (`paidOn`, montant = net à payer) | sans date : PAYEE sans ligne de paiement (`paidAt` vide — lu « payée en totalité », comme les factures d'avant le lot 3D) |
| Mode de paiement | `PurchasePayment.method` / `PurchaseInvoice.paymentMethod`, `reference` | table de correspondance, §2.3 |

### 2.3 Écarts relevés

- **11 lignes de fin** sans fournisseur ni numéro, à zéro : lignes de
  modèle préparées pour un mois — ignorées (« ligne vide »).
- **≈ 18 factures sans numéro** (hors les 11) : la clé fournisseur + numéro
  ne peut pas les tenir. Proposition : numéro généré déterministe
  « SN-AAAA-MM-JJ-k » (k = rang parmi les lignes sans numéro du même
  fournisseur et du même jour, dans l'ordre du fichier), interrupteur (§4).
- **Doublons fournisseur + numéro dans le fichier** : 4 groupes de 2 à 3
  lignes. Identiques (même date, mêmes montants) → importées une fois,
  signalées ; différentes → **non importées**, listées « à trancher »
  (plusieurs lignes d'une même facture ? deux factures au même numéro ?).
- **62 lignes en euros sans montant en DH** (et 10 avec les deux) : le
  modèle exige le TTC en DH (`amount`). Proposition : un champ facultatif
  « Taux EUR → DH » dans le formulaire d'import ; rempli, ces lignes
  s'importent avec TTC = euros × taux (sans HT ni TVA) et le taux gardé ;
  vide, elles sont listées « montant en DH manquant » et non importées.
- **118 lignes TTC seul** (sans HT ni TVA) : importées « TTC seul » ; si la
  retenue s'appliquait (fournisseur soumis, base TVA), le formulaire refuse
  — même règle à l'import pour une facture à payer (§2.5).
- **46 lignes à TVA 0** (exonérées) : `vatRate` 0. **116 montants à plus de
  deux décimales** (TVA calculée) : arrondis au centime. **1 ligne** où HT +
  TVA ≠ TTC.
- **Statut** : « Payée » 473 (dont 130 sans date de paiement), vide 105,
  « Prélèvement » 2.
- **Date de paiement** : 340 dates, **4 textes** (deux dates et deux
  montants « + » : paiements en plusieurs fois ; « et comp. ») ; **14 dates
  antérieures à la date de la facture** (acompte ? erreur ?) — la règle des
  paiements les refuse : la facture est importée PAYEE sans ligne de
  paiement, `paidAt` à la date du fichier, signalée.
- **Mode de paiement** : « Virement » (386), vide (101), « Prélèvement »,
  « Caisse » / « Espèce », « Carte … », « chèque », « Versement compte »,
  et surtout **des références bancaires** à la place du mode (« TRF… » ×
  ≈ 30, deux autres familles de codes) et des notes libres (une mention de paiement
  partiel, « Virement + avance espèce »). Correspondance proposée : virement / TRF… →
  VIREMENT (le code en référence) ; caisse / espèce → ESPECES ; carte →
  CARTE ; chèque → CHEQUE ; prélèvement → VIREMENT, référence
  « Prélèvement » (hypothèse : `PaymentMode` n'a pas de prélèvement) ; tout
  le reste → AUTRE (le mode « repris », jamais proposé à la saisie), le texte
  en référence, signalé ; vide avec une date → AUTRE.
- **Échéance** : 337 lignes vérifient échéance = date + délai, 17 non ; sans
  délai, l'écart vaut 0, 60 ou 120 jours. **2 lignes** où « Mois » ≠ mois de
  la date.
- **Plage de la feuille** : `readImportFile` refuse au-delà de
  `MAX_IMPORT_ROWS + 10` lignes **lues**, lignes vides comprises — les
  ≈ 7 600 lignes mises en forme feraient refuser le fichier converti. À
  corriger dans le lecteur : ne compter que les lignes non vides (et couper
  les lignes et colonnes vides de fin).

### 2.4 Lire le `.xls` — décision proposée

| Option | Pour | Contre |
|---|---|---|
| **(a) Demander l'enregistrement en `.xlsx`** (aujourd'hui) | aucune dépendance nouvelle ; `exceljs` (déjà en place, déjà relu) lit le résultat ; Excel ou LibreOffice convertit en un clic ; dates gardées en dates | un geste de plus pour le laboratoire, une fois par fichier |
| (b) SheetJS `xlsx` depuis npm | lit tout | la version publiée sur npm est figée à **0.18.5**, touchée par deux failles connues (pollution de prototype à la lecture d'un fichier forgé, CVE-2023-30533 ; déni de service par expression régulière, CVE-2024-22363) — `npm audit` la signale ; les versions corrigées ne sont distribuées que par le CDN de l'éditeur (tarball hors registre, hors `npm audit`) |
| (c) une republication tierce de SheetJS ou un petit lecteur BIFF peu suivi | lit le `.xls` | chaîne d'approvisionnement non maîtrisée, maintenance incertaine, pour un fichier par an |
| (d) un lecteur BIFF8 maison | sans dépendance | ≈ 400 lignes de format binaire (conteneur CFB, SST, RK / MULRK, formats de date) à écrire et tester : coût et risque disproportionnés |

**Recommandation : (a)**, en mieux : le refus d'un `.xls` devient un message
pas à pas (« Ouvrez le fichier dans Excel → Fichier → Enregistrer sous →
Classeur Excel (.xlsx) ; ou LibreOffice → Enregistrer sous → Excel 2007-365 »),
l'écran d'import le dit avant même le choix du fichier, et le lecteur accepte
la plage étendue (§2.3). **Note de sécurité** : aucune dépendance ajoutée,
aucun accès réseau ; le fichier reçu reste lu en mémoire, côté serveur, par
`exceljs` seulement, sous les limites existantes (8 Mo, rôle MAGASINIER ou
ADMIN) plus deux nouvelles (nombre de feuilles, lignes non vides) ; les
cellules sont lues comme des données (formules : leur résultat en cache,
jamais évaluées). Pour la répétition locale, une copie `.xlsx` du fichier est
produite hors du dépôt (`backups/fichiers-labo-25-11/`, ignoré).

### 2.5 La retenue à la source (S13) et l'import

En production (S13, 21/11) : champ d'application « fournisseurs soumis »,
base TVA, 75 % avec attestation, 100 % sans, **aucun fournisseur coché**
(D-3 attend le comptable). Règle proposée (interrupteur, §4) :

- **facture payée** (PAYEE, avec ou sans ligne de paiement) : **aucune
  retenue calculée** — ce qui a été payé l'a été sur le TTC ; une retenue
  rendrait le paiement repris supérieur au net à payer ;
  `taxCertificateState` est écrit (l'état calculé ce jour-là, en général
  « absente ») comme le formulaire le fait toujours ;
- **facture à payer** : la même règle que le formulaire (`withholdingFor`,
  `purchase-invoices-server.ts`) — champ d'application, fournisseur soumis,
  attestation ; une facture TTC seul d'un fournisseur soumis (base TVA) est
  **refusée** comme au formulaire (« saisissez le montant HT ») et listée ;
- l'ordre compte : cocher « soumis » **après** l'import ne recalcule pas les
  factures importées (la retenue est figée sur la facture, règle du 01/11) —
  d'où, au §10, cocher les fournisseurs soumis **avant** l'import quand le
  laboratoire les a nommés.

## 3. « NV CANEVAS RA LABO.xlsx » — le nouveau canevas ONSSA

### 3.1 Les 7 feuilles

| Feuille | Contenu | Ce que l'application peut y mettre |
|---|---|---|
| « P,Garde » | titre « Rapport d'activité mensuel/annuel des laboratoires agréés et/ou reconnus par l'ONSSA », « LABORATOIRE : … », « MOIS/ANNÉE : … » | le nom du laboratoire (`company.ts` / réglages) et le mois |
| « Plan » | le plan I → IV (texte fixe) | recopié |
| « TUTORIEL » | les consignes de remplissage (texte fixe, dont : les totaux d'analyses et de non-conformités identiques d'un tableau à l'autre ; « Sans objet » quand une rubrique est vide) | recopié |
| « I-AGL » | activités globales : Microbiologie alimentaire / des eaux / Chimie alimentaire / Totaux × nombre d'échantillons, d'analyses ; résultats conformes / non conformes / totaux | **tout** (`report.synthesis`) |
| « II-AT » (nom suivi de deux espaces) | II-1 « cadre de l'analyse et origine » (groupe de produits ; contrôle officiel : DR ONSSA / organisme préleveur, établissement, origine ; autocontrôle : origine ; total) ; II-2 « analyses par produits et par paramètre » (groupe × 23 germes + chimie, chacun avec sa norme, lignes « Réalisées » / « NC », total) | **tout** (`report.groups`, `columnTotals`) |
| « III-AD » (nom suivi d'un espace) | III-1 EIL, nouvelles méthodes ; III-2 accréditation et audits ; III-3 formations ; III-4 participations ; III-5 souches isolées (réseau de surveillance) ; III-6 commentaires : 6-1 références d'interprétation, 6-2 critères d'acceptation des prélèvements, 6-3 retour sur la qualité des prélèvements, 6-4 réclamations | **en partie** : III-1 (EIL), III-5, III-6-1, III-6-3 ; le reste à remplir (§7) |
| « IV-Autres informations » | autres analyses en développement / hors portée : paramètre, norme, méthode, validée oui / non, accréditée oui / non | à remplir (option : les paramètres non accrédités, §4) |

### 3.2 Ce qui est déjà juste

- Les **24 colonnes de II-2** (23 germes, « chimie alimentaires ») et leurs
  **normes** sont exactement celles de `ONSSA_COLUMNS` ; aucune colonne
  nouvelle, aucun renommage.
- I-AGL lit des sommes de II-AT — le lot 3E les calcule déjà
  (`synthesis` : échantillons, analyses, NC par domaine) ; II-1 regroupe
  organisme / établissement / origine — déjà fait (`official`, `self`).
- Règles de comptage confirmées (R-22 le 04/11, C-7 le 20/11) : mois de
  réception, « Acceptable » = conforme, surfaces / mains / air non déclarés.

### 3.3 Écarts

- **Groupes de produits** : le canevas en fixe cinq, plus une ligne chimie
  (« Produits végétaux et d'origine végétale », « Produits animaux et d'origine
  animale », « Produits de pêche et d'origine de la pêche », « Produits
  alimentaires (couscous, épices…) et produits dérivés », « Eaux d'élevage ou
  d'agro-industrie », « Chimie alimentaire ») ; l'application a la liste de
  l'administrateur (`OnssaProductGroup`, une liste « proposée » en neuf
  groupes). C'est la réponse à « la liste des groupes » de R-22 : proposer
  en un clic la liste du canevas sur `/admin/onssa` (créer ce qui manque,
  sans rien supprimer ni renommer), puis reclasser familles et types
  d'analyse (geste du propriétaire).
- **La chimie a sa propre ligne** en II-2 (colonne Z seulement), les lignes
  des groupes ne portant que la microbiologie. Le lot 3E compte la chimie
  dans la ligne du groupe de l'échantillon. Proposition : interrupteur
  `ONSSA_CHEMISTRY_OWN_ROW` (§4).
- **II-1 n'a pas de nombre par ligne** : seul le total du groupe (colonne
  F, fusionnée sur les lignes du groupe) ; l'extrait du 28/10 en avait un et
  le lot 3E l'écrit. Proposition : le canevas tel quel (total du groupe en
  formule vers II-2), les nombres par ligne dans une feuille « Notes
  Qualilab » à la fin (hors canevas).
- **« Origine »** : le tutoriel la définit comme le **domaine d'activité**
  de l'établissement (« Agro-alimentaire, Exploitation, Élevage… ») ; la
  réponse du 04/11 (R-22) disait « Local / Importé / Destiné à l'export »
  (`Serie.origine`). Le mois rempli écrit « Agro-alimentaire » partout.
  Question E-6 ; en attendant, interrupteur (§4).
- **Formules du canevas incohérentes** (à ne pas reproduire, à signaler) :
  les totaux de ligne de II-2 somment des plages différentes selon le groupe
  (C:V, C:T ou C:Y — certaines colonnes des eaux et la chimie oubliées), un
  total vaut « =Z52:Z53 » (une plage dans une cellule), la seconde ligne des
  eaux et de la chimie est titrée « Réalisées » au lieu de « NC », la ligne
  « Total » de II-2 ignore la chimie dans ses colonnes C:Y mais la compte en
  Z, et I-AGL « conformes » de la chimie ne retranche pas ses NC. Le classeur
  produit écrit des formules **cohérentes** (toutes les colonnes C:Z, NC
  retranchés partout) avec leur résultat en cache ; la note de la feuille
  « Notes Qualilab » le dit.
- **Mensuel / annuel** : la page de garde dit « mensuel/annuel ». 6C
  construit le mois ; l'année (somme des douze mois, même classeur) est une
  option N8 (§7), à construire si le laboratoire la demande (E-8).
- **III et IV** : l'application n'a ni audits d'accréditation, ni
  formations, ni participations, ni réclamations (aucun modèle) ; elle a les
  EIL (`EilCampaign`), les textes réglementaires (`Regulation`), les
  non-conformités et refus à la réception (`Sample.conformityReason`,
  annulations « Rejeté à la réception » / « Détruit à la réception »), les
  germes sensibles détectés (`Result.detected`, `AnalysisParameter.alertOnExceed`),
  et l'accréditation par paramètre (`AnalysisParameter.accreditation`).

## 4. Hypothèses et interrupteurs proposés

Tous dans `src/lib/lab-proposals.ts`, section « Lot 6 », chacun avec son
retour en arrière testé (`lab-proposals-6-back.test.ts`) et la question qui le
tranchera.

| Interrupteur | Défaut | ON | OFF | Question |
|---|---|---|---|---|
| `STOCK_IMPORT_QUANTITY_FROM_PRICE` | ON | une quantité qui, d'après les deux prix, est comptée en pièces est ramenée en conditionnements (÷ taille), et le prix unitaire est celui d'un conditionnement ; une ligne que le calcul ne départage pas est importée telle quelle et signalée | quantités et prix tels qu'écrits | E-1 |
| `STOCK_IMPORT_LEVEL_FROM_FILE` | ON | après les mouvements d'un article, si le dernier « Stock » du fichier diffère de entrées − sorties, un **ajustement** daté du jour d'import ramène le niveau au dernier « Stock » (note « Niveau de la fiche importée ») | niveau = entrées − sorties du fichier | E-2 |
| `STOCK_EXPIRY_MONTH_END` | ON | une expiration « mois / année » (texte « MM-AAAA », « MM/AAAA », date au format mois-année) = le dernier jour du mois | le 1er du mois | E-1 |
| `PURCHASE_IMPORT_UNNUMBERED` | `"GENERATE"` | facture sans numéro → « SN-AAAA-MM-JJ-k » (déterministe, idempotent tant que l'ordre du fichier ne change pas) | `"SKIP"` : listée, non importée | E-4 |
| `PURCHASE_IMPORT_EMPTY_STATUS_UNPAID` | ON | « Statut » vide = à payer (les échéances passées apparaîtront « En retard » sur le tableau de bord du magasin — l'analyse en donne le nombre) | ligne listée « statut à préciser », non importée | E-5 |
| `PURCHASE_IMPORT_WITHHOLDING` | `"UNPAID_ONLY"` | §2.5 | `"NEVER"` : aucune retenue à l'import | D-3 |
| `ONSSA_EXPORT_LAYOUT` | `"CANEVAS_2026"` | le bouton principal de `/qualite/onssa` télécharge le canevas complet ; l'extrait du 28/10 reste un lien secondaire | `"EXTRAIT_2025"` : l'export du lot 3E | — |
| `ONSSA_CHEMISTRY_OWN_ROW` | ON | les analyses de chimie de tous les groupes vont à la ligne « Chimie alimentaire » (colonne Z) ; I-AGL « chimie » inchangé | la chimie dans la ligne du groupe de l'échantillon (lot 3E) | E-6 |
| `ONSSA_EMPTY_ORIGIN_AGRO` | ON | une origine vide s'imprime « Agro-alimentaire » (la pratique du mois rempli) ; une origine saisie s'imprime telle quelle | « Non précisée » (lot 3E) | E-6 |
| `ONSSA_SECTIONS_FROM_APP` | ON | III-1, III-5, III-6-1, III-6-3 remplis depuis l'application (§7) | toutes les sections III vides, à remplir | E-7 |
| `ONSSA_IV_NON_ACCREDITED` | OFF | IV liste les paramètres actifs marqués « non accrédité » (norme vide, « validé » vide, « accrédité » non) | IV vide, à remplir | E-7 |

Hypothèses sans interrupteur (règles d'import, écrites dans le code et
l'écran d'analyse) : article = onglet (+ variante) ; un article déjà connu
par son nom et qui porte des mouvements saisis à la main n'est **pas
touché** (listé) ; un fournisseur est rapproché par son nom normalisé ;
« Prélèvement » = virement, référence « Prélèvement » ; un code bancaire
inconnu = « Autre », le code en référence ; un paiement daté avant la
facture = facture payée sans ligne de paiement ; une facture déjà présente
(fournisseur + numéro) n'est **jamais modifiée** (créer seulement, comme
tous les imports du magasin).

## 5. Le plan — lot 6A (la fiche de stock, un onglet par article)

Lettres reprises du lot 3D (**M** Achat & Stock), numéros à la suite.

| # | Ce qu'il faut faire | Où | Effort | Migration |
|---|---|---|---|---|
| M9 | **Lecteur de classeur commun (6A et 6B)** : `readImportWorkbook(file, { sheets: "first" \| "all" })` — toutes les feuilles (nom, lignes, et le format de nombre des cellules date pour reconnaître « mois-année »), lignes et colonnes vides de fin coupées, limite comptée sur les **lignes non vides** (5 000 par feuille), au plus 100 feuilles, 8 Mo ; formule → son résultat en cache, formule sans résultat → cellule signalée ; `.xls` refusé avec le message pas à pas (§2.4) ; `readImportFile` garde son contrat (première feuille) au-dessus | `src/lib/stock-import-file.ts` (+ test sur des classeurs synthétiques construits par `exceljs`) | S | non |
| M10 | **Analyse pure du format « une feuille par article »** : `parseStockWorkbook(sheets)` → par onglet, ses tableaux (en-tête repéré par « Date » + « Libellé » + « Entrée… » n'importe où dans la feuille, en A ou B ; seconde ligne d'en-tête des prix lue pour l'ordre unitaire / total) ; libellé d'un second tableau (devant « Entrée », ligne seule au-dessus, ou colonne de gauche) ; conditionnement lu de « Entrée/… » → unité ; lignes → mouvements (ENTREE, SORTIE, « stock de départ » pour une ligne qui n'a qu'un « Stock ») avec jour, bon de commande, lot, expiration, quantité, prix ; rapprochement quantité / prix (§4) ; textes hors tableau ignorés et listés ; problèmes et avertissements par onglet et ligne (en français) ; `cellDay` étendu (« MM-AAAA », « MM/AAAA », mois-année) ; une date dans « Libellé » signalée | nouveau `src/lib/stock-workbook-import.ts` (+ test : deux tableaux par onglet, en-têtes en A / B et à hauteurs variables, prix inversés et en texte, quantités en pièces, formules, expirations mêlées, onglet vide, ligne sans date) | M | non |
| M11 | **Détection du format** : plus d'une feuille non vide, ou des « Libellé » qui ressemblent à des bons de commande (« n/aa », « BC n/aa ») sur la plupart des lignes → « une feuille par article » ; sinon « registre unique » (le lot 3D, inchangé) ; l'écran propose le format détecté, modifiable | `stock-workbook-import.ts`, `stock-import.ts` | XS | non |
| M12 | **Route** `POST /api/stock/import` (MAGASINIER, ADMIN — inchangé) avec `format=par-article \| registre` : `mode=analyse` rend, par article, « à créer » / « déjà importé (k mouvements nouveaux) » / « suivi à la main — non touché », les mouvements, le niveau qui résultera, le dernier « Stock » du fichier, les avertissements ; `mode=commit` écrit en une transaction par lot d'articles : article créé (ou repris s'il n'a que des mouvements importés), mouvements **dans l'ordre des dates** avec `levelBefore` / `levelAfter`, `orderReference`, `importKey` (empreinte : onglet, variante, ligne normalisée) — une ligne déjà importée est sautée (**idempotent**) ; une ligne nouvelle datée avant le dernier mouvement de l'article est refusée (« à saisir à la main », pour ne pas réécrire les niveaux enregistrés) ; ajustement final (interrupteur) ; jour jamais dans le futur ; journal `STOCK_IMPORTED` (format, fichier, articles créés / repris, mouvements, ajustements, sautés, refusés) ; 409 si une course crée l'article | `src/app/api/stock/import/route.ts`, un module serveur `stock-import-server.ts` | M | voir M13 |
| M13 | **Migration additive** (une seule pour 6A et 6B, `2026112xxxxxx_lot6_imports`) : `StockMovement.orderReference VARCHAR(64) NULL`, `StockMovement.importKey VARCHAR(64) NULL UNIQUE` ; (6B) `PurchaseInvoice.importedFrom VARCHAR(191) NULL` | `prisma/schema.prisma`, migration écrite à la main | XS | **oui, additive** |
| M14 | **Écran** `/magasin/import` : choix du format (proposé), compte rendu par onglet (articles, mouvements, niveau final, prix et quantités rapprochés, avertissements), « Importer » ; le **bon de commande** devient une colonne du journal des mouvements (écran et export, « Libellé » du laboratoire) et un champ facultatif de l'entrée de stock saisie à la main | `src/app/magasin/import/page.tsx`, `src/components/magasin/MagasinImport.tsx`, `src/lib/stock-journal.ts` (+ test), `api/stock/movements` (+ validation), `StockManager.tsx` | S–M | non |

## 6. Le plan — lot 6B (le journal des achats : les factures)

| # | Ce qu'il faut faire | Où | Effort | Migration |
|---|---|---|---|---|
| M15 | **Analyse pure** `parsePurchaseJournal(rows, options)` : en-tête repéré (« Fournisseurs » + « N° Facture »), lignes vides et lignes de modèle à zéro ignorées ; par ligne, un brouillon validé par les **mêmes règles que le formulaire** (`validatePurchaseInvoice`, `achat-validation.ts`) : fournisseur (nom normalisé), numéro (ou généré, §4), date, échéance, HT / TVA / TTC arrondis, devise, statut, paiements (date unique ou « date montant + date montant »), mode et référence (table de correspondance) ; doublons du fichier (identiques → une fois ; différents → « à trancher ») ; avertissements (mois ≠ date, échéance ≠ date + délai, paiement avant la facture, mode inconnu, fournisseur archivé) ; option « Taux EUR → DH » | nouveau `src/lib/purchase-import.ts` (+ test, données synthétiques : chaque cas du §2.3) | M | non |
| M16 | **Route** `POST /api/purchase-invoices/import` (MAGASINIER, ADMIN — les rôles de `/api/purchase-invoices`, décision du 25/10) : `mode=analyse` rend fournisseurs à créer / rapprochés, factures à créer, **déjà présentes** (fournisseur + numéro : identiques → sautées ; montants différents → listées, jamais modifiées), refusées avec leur motif, totaux HT / TVA / TTC de ce qui sera créé, nombre de factures à payer et en retard ; `mode=commit` : une transaction (délai 60 s, lots de 200) — fournisseurs créés, factures (`createdById`, `importedFrom` = fichier + jour), paiements (`PurchasePayment`, montant = net, `createdById`), retenue selon §2.5 ; **idempotent** sur la clé unique existante ; journal `PURCHASE_INVOICES_IMPORTED` (fichier, créées, fournisseurs créés, paiements, sautées, refusées, totaux) ; 409 sur course (P2002) | nouveau `src/app/api/purchase-invoices/import/route.ts`, `purchase-invoices-server.ts` (réutilise `withholdingFor`, `purchaseInvoiceData`) | M | M13 |
| M17 | **Écran** : section « Factures fournisseurs (« Journal Achat ») » sur `/magasin/import` — le conseil `.xlsx` avant le choix du fichier, le champ « Taux EUR → DH », le compte rendu (dont les listes « à trancher », « montant en DH manquant », « sans numéro », « mode inconnu ») ; la fiche d'une facture importée dit « Reprise du journal des achats (<fichier>, <jour>) » ; l'aide de l'import des fournisseurs ne dit plus « les factures ne sont pas importées » | `src/app/magasin/import/page.tsx`, `MagasinImport.tsx`, `FactureDetail.tsx` | S | non |

## 7. Le plan — lot 6C (le nouveau canevas ONSSA)

Lettre reprise du lot 3E (**N** ONSSA).

| # | Ce qu'il faut faire | Où | Effort | Migration |
|---|---|---|---|---|
| N4 | **Données en plus du mois** (lecture seule, mêmes bornes que le lot 3E) : EIL de l'année jusqu'à la fin du mois, ou encore ouvertes (nom / portée, organisateur, date, statut, résultat) ; germes sensibles détectés dans les échantillons comptés (jour de réception, germe, famille / type de produit, ville du site sinon « Non précisée ») ; textes réglementaires choisis sur les échantillons du mois ; non-conformités de réception et refus / destructions du mois, par motif ; (option) paramètres non accrédités | `src/lib/onssa-report-server.ts`, types purs dans un nouveau `src/lib/onssa-sections.ts` (+ test) | S–M | non |
| N5 | **Classeur au nouveau canevas** `buildOnssaCanevasWorkbook(report, sections, meta)` (exceljs) : 7 feuilles aux **mêmes noms** (espaces finaux compris) et dans le même ordre, mêmes cellules d'en-tête, fusions, largeurs, orientation (II-AT en paysage) et zones d'impression ; textes fixes (plan, tutoriel, titres de III, IV) reproduits ; P,Garde : laboratoire et « Mois Année » ; I-AGL : échantillons en valeurs, analyses / conformes / NC en **formules vers II-AT** avec résultat en cache ; II-1 : par groupe, lignes contrôle officiel (organisme, établissement, origine) et autocontrôle (origine) côte à côte, « RàS » quand vide, total du groupe fusionné = formule vers II-2 ; II-2 : groupes × 24 colonnes, en-têtes et normes de `ONSSA_COLUMNS`, lignes « Réalisées » / « NC », ligne chimie (interrupteur), totaux cohérents (§3.3) ; III : tableaux remplis (interrupteur) sinon vides avec la consigne « Sans objet ou non pertinent » ; IV vide (ou option) ; dernière feuille « Notes Qualilab » (règles de comptage, en attente, non déclarés, nombres par ligne de II-1, formules corrigées) ; `fullCalcOnLoad` | nouveau `src/lib/onssa-canevas-workbook.ts` (+ test : noms de feuilles, cellules clés, égalité des totaux I-AGL = II-1 = II-2, NC, chimie, sections vides, aucun nom de client dans II-2) | L | non |
| N6 | **Route et écran** : `GET /api/onssa/rapport?mois=AAAA-MM&format=canevas \| extrait` (défaut selon `ONSSA_EXPORT_LAYOUT`) ; mêmes rôles (VALIDATEUR, DIRECTION, ADMIN), même journal `ONSSA_REPORT_EXPORTED` (+ `format`) ; `/qualite/onssa` : deux téléchargements, un aperçu des sections III remplies (nombres de lignes) ; nom de fichier « rapport-activite-onssa-AAAA-MM.xlsx » | `src/app/api/onssa/rapport/route.ts`, `src/app/qualite/onssa/page.tsx`, `src/lib/onssa-access.ts`, `onssa-guards.test.ts` | S | non |
| N7 | **Groupes du canevas** : sur `/admin/onssa`, « Groupes du nouveau canevas » crée les groupes du canevas qui manquent (domaine alimentaire / eaux, ordre du canevas), sans supprimer, archiver ni renommer ; journalisé (`ONSSA_GROUP_CREATED`) | `src/lib/onssa-canevas.ts` (`CANEVAS_2026_GROUPS`), `api/admin/onssa/groups`, écran | XS–S | non |
| N8 | *Option, non construite sans E-8* : le rapport **annuel** (`?annee=AAAA`, même classeur, douze mois sommés) | route, `onssaMonth` → période | S | non |

## 8. Migration

Une seule, **additive**, écrite à la main (`prisma/migrations/2026112xxxxxx_lot6_imports/migration.sql`) :

```sql
ALTER TABLE `StockMovement` ADD COLUMN `orderReference` VARCHAR(64) NULL,
                            ADD COLUMN `importKey` VARCHAR(64) NULL;
CREATE UNIQUE INDEX `StockMovement_importKey_key` ON `StockMovement`(`importKey`);
ALTER TABLE `PurchaseInvoice` ADD COLUMN `importedFrom` VARCHAR(191) NULL;
```

Aucune colonne supprimée ou renommée, aucune donnée réécrite ; appliquée en
local par `prisma migrate deploy` + `generate`, puis `next.config.ts` touché
(serveur :3210 jamais arrêté).

## 9. Tests, contrôles, recette

- **Unitaires** (vitest, données synthétiques construites dans les tests) :
  `stock-import-file.test.ts` (plage étendue, feuilles multiples, limites,
  `.xls`), `stock-workbook-import.test.ts`, `purchase-import.test.ts`,
  `onssa-sections.test.ts`, `onssa-canevas-workbook.test.ts`,
  `lab-proposals-6-back.test.ts` (chaque interrupteur OFF) ; le format
  « registre unique » garde ses tests (`stock-import.test.ts`).
- **Gardes** (§3 de `HANDOFF.md`, tests qui lisent le source des routes) :
  la nouvelle route `api/purchase-invoices/import` tombe sous le préfixe
  `STOCK_MODULE` de `price-access-guards.test.ts` (MAGASINIER, ADMIN seulement,
  décision du 25/10) et sous ceux de `direction-guards.test.ts` /
  `technician-guards.test.ts` ; l'ajouter aussi à la liste nommée des routes
  du module (à côté de `api/stock/import/route.ts`) ; `onssa-guards.test.ts`
  étendu au paramètre `format`.
- **En base** (local) : import d'un classeur synthétique deux fois (la
  seconde n'écrit rien), course de deux imports (409), niveaux d'un article
  importé (journal des mouvements, valeur du stock), facture importée payée /
  à payer / en euros, retenue d'un fournisseur soumis.
- **Contrôles** à chaque étape : `npx tsc --noEmit -p .`, `npx eslint src`,
  `npx vitest run` ; `npm run build` à la fin.
- **Recette locale** `.ui-tests/v24-lot6-local.mjs` (ignoré par git) :
  fichiers synthétiques générés par le script ; puis **répétition avec les
  vrais fichiers** sur la base locale (analyse, import, relance = 0 écrit,
  comptes relus) — les comptes vont au journal de `LOT6-AVANCEMENT.md`, sans
  valeur ; export ONSSA d'un mois local ouvert et comparé, feuille par
  feuille, au canevas reçu. Régressions : v20 (prix), v22 (lot 4 : magasin),
  v23 (lot 5).
- **TESTPLAN** « Checkpoint V24 » ; **DEPLOY.md** « Lot 6 » (tag
  `v1.9-avant-lot6`, dump, une migration, recette de production
  `v24-lot6-prod.mjs` : écrans d'import en analyse seulement avec un fichier
  synthétique, export ONSSA du mois précédent, gardes).

## 10. Gestes du propriétaire en production (après le déploiement)

| # | Quoi |
|---|---|
| S18 | **Avant tout import** : un dump nommé (`qualilab_avant-import-lot6.sql.gz`, `gzip -t`) — l'import ne s'annule pas par l'écran |
| S19 | **Stock** — `/magasin/import`, format « Une feuille par article », « Consommable labo.xlsx » : **Analyse**, relire (articles, unités proposées, quantités ramenées en conditionnements, prix, expirations douteuses, lignes ignorées) ; corriger le fichier si besoin, relancer l'analyse ; puis **Importer**. Ensuite, **un inventaire** article par article (« Ajustement ») : le fichier n'a aucune sortie, le niveau importé n'est pas le stock réel (§1.3) |
| S20 | **Fournisseurs soumis** (S13 suite, quand le laboratoire les nomme — D-3) : cocher « soumis à la retenue » **avant** l'import des factures (§2.5) ; sinon importer, et les factures à payer de ces fournisseurs se corrigent à la main ensuite |
| S21 | **Factures** — ouvrir « Journal Achat 2026.xls » dans Excel (ou LibreOffice) → **Enregistrer sous .xlsx** ; `/magasin/import`, « Factures fournisseurs » : **Analyse** (relire : à trancher, sans numéro, en euros sans DH — saisir le taux si le laboratoire le donne, modes inconnus, paiements avant facture, nombre de factures à payer / en retard) ; puis **Importer** ; relancer l'analyse : 0 à créer |
| S22 | **ONSSA** — `/admin/onssa` : « Groupes du nouveau canevas », puis reclasser familles et types d'analyse vers ces groupes (les anciens groupes restent, à archiver quand plus rien ne les nomme) ; `/qualite/onssa` : télécharger le mois précédent au nouveau canevas, l'envoyer au laboratoire pour validation avec E-6 / E-7 |

## 11. À poser au laboratoire (prochain échange, une ligne chacune)

- **E-1 — stock, unités et prix** : une entrée se compte-t-elle en
  conditionnements (cartons, boîtes) ou en pièces ? Le prix unitaire est-il
  celui d'une pièce ou d'un conditionnement ? (les deux apparaissent).
  Une expiration « mois / année » = fin du mois ?
- **E-2 — stock, niveau** : les sorties ne sont pas notées dans la fiche :
  quand faire l'inventaire de départ dans le logiciel ? Le « Stock » écrit
  est-il le niveau après la livraison ou la quantité livrée ?
- **E-3 — stock, lieu** : la colonne « Lieu de stockage » est vide : un lieu
  par article suffit-il ?
- **E-4 — achats, lignes particulières** : factures sans numéro (garder un
  numéro « SN-… » ?) ; numéros en double chez un même fournisseur (une ou
  plusieurs factures ?) ; codes dans « Mode de paiement » (« TRF… » = virement
  ? les autres codes ?) ; « Prélèvement » ; paiements datés avant la facture ;
  factures en euros sans montant en DH : à quel taux ?
- **E-5 — achats, statut** : une ligne sans statut = facture à payer ?
- **E-6 — ONSSA, origine et chimie** : « Origine » = domaine d'activité
  (Agro-alimentaire, Élevage…, comme le tutoriel) ou Local / Importé (votre
  réponse du 04/11) ? La chimie sur sa propre ligne seulement ? Les totaux
  du canevas : sur toutes les colonnes (vos formules en oublient) ?
- **E-7 — ONSSA, sections III et IV** : qui les remplit (le logiciel propose
  les EIL, les souches isolées, les textes réglementaires, les refus à la
  réception) ; la partie IV = vos analyses hors portée / non accréditées ?
- **E-8 — ONSSA, annuel** : faut-il aussi le rapport annuel ?

## 12. Ordre et effort

1. **M9** (le lecteur commun) — S.
2. **6A** : M10 → M11 → M13 (migration) → M12 → M14 — ≈ 1,5 jour.
3. **6B** : M15 → M16 → M17 — ≈ 1 jour (après M9 et M13).
4. **6C** : N4 → N5 → N6 → N7 — ≈ 1,5 à 2 jours (indépendant de 6A / 6B ;
   N8 seulement sur E-8).
5. Relecture hostile de chaque partie, corrections, intégration, contrôles,
   recette locale V24 (dont la répétition avec les vrais fichiers), puis
   production (`DEPLOY.md` « Lot 6 ») et gestes S18–S22 par le propriétaire.

## 13. Dépôt public

- Les trois fichiers restent dans `backups/fichiers-labo-25-11/` (ignoré par
  git) ; la copie `.xlsx` du journal produite pour la répétition aussi.
- Ici et dans les tests : aucun nom de fournisseur, aucun numéro de facture
  ou de bon de commande, aucun montant, lot ou chiffre ONSSA du laboratoire ;
  les noms d'articles du fichier non plus (ils portent parfois un nom de
  fournisseur). Les textes officiels du canevas (titres, consignes, intitulés
  des groupes et des germes, normes) sont ceux du formulaire de l'ONSSA, pas
  des données du laboratoire ; les rubriques remplies par le laboratoire
  (EIL, formations, manifestations, liste IV) ne sont pas reprises.
