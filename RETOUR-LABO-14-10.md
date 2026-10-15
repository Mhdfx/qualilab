# Remarques du laboratoire du 14/10 — analyse, lot 1 et lot 2

> **Le plan en cours.** Message du laboratoire reçu le 14/10/2026 (16 lignes,
> trois rôles) et 14 captures d'écran de l'ancien logiciel. Chaque point a été
> vérifié dans le code de la production (`master` = `cd0054f`), en lecture
> seule, par quatre lectures (préleveur, réception, responsable des
> paramètres, ancien logiciel) puis une relecture critique **dont les
> corrections l'emportent** sur les lectures. L'analyse complète reste hors du
> dépôt : elle cite des captures où figurent des noms réels (§7).
>
> - **Lot 1** — ce qui ne demande aucune réponse du laboratoire : **construit
>   le 14/10 sur la branche `retour-labo-14-10`, à vérifier** (contrôles,
>   test local au navigateur, déploiement, TESTPLAN V15 — ils mettront ce
>   statut à jour). Aucune migration.
> - **Lot 2** — tout le reste : **en attente des réponses Q109–Q130**
>   (`NEEDEDINFO.md`), avec pour chaque élément le défaut recommandé et la
>   conception à construire une fois la réponse reçue (§4).
> - Point de retour : tag **`v1.3-avant-retour-14-10`** = `cd0054f` (poussé
>   sur origin) — « Version stable du 14/10/2026 (prise en charge libre +
>   réponses du 13/10) ». Revenir : `git checkout v1.3-avant-retour-14-10`.
>
> Effort : XS ≈ 1 h ou moins · S 1–4 h · M 4–12 h · L plus de 12 h
> (estimations).

---

## 0. Contexte

Le 14/10, le laboratoire a envoyé par WhatsApp ses remarques sur trois
rôles — le préleveur (« Type de prélèvement »), la réception (« Nouveau
dépôt ») et le responsable des paramètres — avec une remarque globale sur
l'heure (AM/PM), et 14 captures d'écran de l'ancien logiciel : saisie des
échantillons (en-tête, client et site, paramètres à rechercher), fenêtre
« Choix famille produits », liste « Type d'analyse », saisie des résultats.
Ces captures montrent des clients, des sites, des membres du personnel et des
employés de clients **réels** : elles ne sont jamais ajoutées au dépôt (§7).

### 0.1 Le message, tel quel

Texte intégral reçu le 14/10 (orthographe et mise en forme d'origine ; les
astérisques marquent le gras de WhatsApp) :

> Salam, les remarques:
> \*Dans le rôle préleveur:\*
> Dans Type de prélèvement
> - Si choisi -> Surface: ajouter état des mains
> - Si choisi -> Mains du personnel: Remplacer Mains non lavées par En cours de travail.
> - Rendre \*IMPERATIF\* T° relevée (a remplacer le mot) et T° ambiante (°C)
> A implanter dans tous les \*Type de prélèvement\*
> Ajouter : "État de la surface\*" -> "Aseptique - En cours de travail - Nettoyé " dans "Mains du personnel"
> Dans Type de prélèvement -> Surface:
> - Ajouter une case text à coté de "Surface prélevée (cm²)"
> - Ajourer le choix de : "100cm2" et "1000cm" dans Surface prélevée (cm²)
> \*Rôle Réceptionniste\*
> Dans Nouveau dépôt:
> - Ajouter les sites au client (Afficher)
> - Ajouter la possibilité d'ajouter un client avec ses sites et informations (dans le rôle Préleveur aussi).
> - Remplacer "Prélevé le" par "Arrivé le"
> - \*Remarque global sur la date AM/PM par 24h\*
> \*Rôle Responsable des paramètres\*
> - Afficher les critères par famille
> - Gestion des catégorie et famille des critères
> - \*le technicien n'a pas les droits pour changer les paramaitres\*

Le découpage en 16 lignes ci-dessous est le nôtre : L3 et L4 forment une
seule phrase du message (« Rendre IMPERATIF T° relevée (a remplacer le mot)
et T° ambiante (°C) »), de même que L10 et L11.

| # | Rubrique | Texte reçu |
|---|---|---|
| L1 | Préleveur | « Dans Type de prélèvement - Si choisi -> Surface: ajouter état des mains » |
| L2 | Préleveur | « Si choisi -> Mains du personnel: Remplacer Mains non lavées par En cours de travail. » |
| L3 | Préleveur | « Rendre IMPERATIF T° relevée … et T° ambiante (°C) » |
| L4 | Préleveur | « (a remplacer le mot) » — la parenthèse qui suit « T° relevée » dans L3 |
| L5 | Préleveur | « A implanter dans tous les Type de prélèvement » |
| L6 | Préleveur | « Ajouter : "État de la surface*" -> "Aseptique - En cours de travail - Nettoyé " dans "Mains du personnel" » |
| L7 | Préleveur | « Dans Type de prélèvement -> Surface: Ajouter une case text à coté de "Surface prélevée (cm²)" » |
| L8 | Préleveur | « Ajourer le choix de : "100cm2" et "1000cm" dans Surface prélevée (cm²) » |
| L9 | Nouveau dépôt | « Dans Nouveau dépôt : - Ajouter les sites au client (Afficher) » |
| L10 | Nouveau dépôt | « - Ajouter la possibilité d'ajouter un client avec ses sites et informations » |
| L11 | Nouveau dépôt | « (dans le rôle Préleveur aussi) » — la fin de la phrase de L10 |
| L12 | Nouveau dépôt | « - Remplacer "Prélevé le" par "Arrivé le" » |
| L13 | Globale | « Remarque global sur la date AM/PM par 24h » |
| L14 | Responsable des paramètres | « Rôle Responsable des paramètres : Afficher les critères par famille » |
| L15 | Responsable des paramètres | « Gestion des catégorie et famille des critères » |
| L16 | Responsable des paramètres | « le technicien n'a pas les droits pour changer les paramaitres » (en gras) |

### 0.2 Couverture : chaque ligne a au moins un élément

| # | Éléments (§2) | Lot |
|---|---|---|
| L1 | P1 (lecture recommandée : même demande que L6 → P5) | 2 |
| L2 | P2 (avec P5) | 2 |
| L3 | P4 ; conséquences P8, P9 ; vérification P10 | 2 |
| L4 | P3 | 2 |
| L5 | P4, P8 | 2 |
| L6 | P5 (+ P2) | 2 |
| L7 | P6 | 2 |
| L8 | **P7** | **1** |
| L9 | **R1**, **R10** | **1** |
| L10 | R2, R4 | 2 |
| L11 | R3 (sauf `active` ignoré pour le terrain : 1) | 2 |
| L12 | R5 ; prérequis **R6** | 2 ; R6 : **1** |
| L13 | **R7** (saisie), R8 (dates seules), R9 (affichage — déjà fait) | R7 : **1** ; R8 : 2 |
| L14 | RP1, RP5, RP6, RP4 | 2 |
| L15 | RP2a, RP2b, RP2c, RP2d | 2 |
| L16 | **RP3**, **RP3c**, RP3b | RP3, RP3c : **1** ; RP3b : 2 |
| Captures | OLD1–OLD50 (§2.4, §5) ; **OLD29**, **OLD40** | OLD29, OLD40 : **1** |

### 0.3 Une seule numérotation

- **P1–P10** : préleveur (P8–P10 sont des conséquences et vérifications,
  pas des lignes du message).
- **R1–R10** : réception. Les corrections de la relecture critique y sont
  fondues : C5 dans R6, C6 dans R5, C7 dans R10, N1 dans R2.
- **RP1–RP7** : responsable des paramètres — RP1, RP2a–RP2d, RP3, RP3b,
  RP3c, RP4, puis les trois points de l'ancien logiciel vus par cette lecture,
  renommés **RP5** (sélecteur de famille), **RP6** (liste des paramètres de
  la famille) et **RP7** (« Type d'analyse »). Fondus : C8 dans RP7, C9 dans
  RP6, N2 dans RP2b, C10 dans RP3.
- **OLD1–OLD50** : inventaire des écrans de l'ancien logiciel. La liste
  « R1–R12 » propre à cette lecture est abandonnée : elle doublait P, R et RP.
  Son point « Q2-MAINS » (nom obligatoire et état des mains sur le rapport) est
  fondu dans P5.
- Questions : **Q109–Q130**, une seule suite (§6) ; elles remplacent les
  numéros provisoires de l'analyse.

## 1. Vocabulaire

Le même mot n'a pas le même sens chez le laboratoire et dans le logiciel.
Dans ce document et dans les questions : « famille de produits » pour ce que
le laboratoire appelle « famille », « Micro / PC » pour la famille d'analyses
du logiciel. Aucun identifiant de code ne change (renommer les écrans :
RP4, Q120).

| Mot | Chez le laboratoire | Dans le logiciel |
|---|---|---|
| **famille** (de produits) | ensemble de produits qui partagent les mêmes critères (ex. « SALADES AVEC SOURCE PROTÉIQUE ») ; fenêtre « Choix famille produits » de l'ancien logiciel, champ « Nature échantillon » ; réponse Q34 du 30/09 : « Ce sont des familles pour faciliter les paramétrages à l'interne » | « Type de produit » à l'écran (« Types de produits & critères », « Nature, type de produit et critères ») ; modèle `ProductType` (catalogue, ou propre à un client par `clientId`) portant ses `Criterion` (germe × version de norme, n, c, m, M). Jamais imprimé pour le client |
| **catégorie** | regroupement de familles = « Group famille » de l'ancien logiciel, 8 groupes : Lait et produits à base de lait · Viandes et produits dérivés · Produits de pêche et produits dérivés · Fruits légumes et dérivés · Produit traiteur et restaurant · Conserve semi conserve · Produit de pâtisserie · Autres (céréales, épices, chocolat…) | **n'existe pas** : `ProductType` n'a aucune colonne de groupe ; l'import de l'ancien logiciel lit le groupe (`src/lib/legacy-catalogue.ts`) sans l'enregistrer → RP2a |
| **famille** (au sens du logiciel) | — | Microbiologie / Physico-chimie : enum `Family` (MICRO, CHIMIE, AUTRE) sur `AnalysisParameter.family`, `ProductType.family` (MICRO par défaut), `AnalysisNature.family` ; libellés `ANALYSIS_FAMILY_LABELS` / `FAMILY_SHORT_LABELS` (`src/lib/labels.ts`) ; « …M » / « …P » sur une ligne à deux familles |
| **Type d'analyse** (ancien logiciel) | Microbiologie des aliments, des surfaces, de l'air, Analyse sensorielle… | la **nature d'analyse**, `AnalysisNature` : les 16 natures de l'ancien logiciel (`legacyId`) plus `PC_AIR` et `MICRO_AUTRE` (08/10) ; déduite du type de prélèvement et des cases Micro / PC (`src/lib/nature-family.ts`), nature fine choisie sur la fiche de programme |
| **Type de prélèvement** | Produit alimentaire, Surface, Mains du personnel, Eau, Air, Autre | `lineKind` (`LINE_KIND_LABELS`) |

Champs dont parle le message :

| À l'écran | Donnée |
|---|---|
| « T° relevée » (surface, mains) / « T° produit » (aliment, eau, autre) | `Sample.productTemperature` — au prélèvement, facultative |
| « T° ambiante (°C) » | `Sample.ambientTemperature` — au prélèvement, facultative |
| « T° à l'arrivée » | `Sample.receptionTemperature` — à la réception ; seule température lue par la règle (6) |
| « T° de la glacière » | `Serie.coolerTemperature` |
| « Prélevé le » | `Serie.startedAt` (recopié dans `Sample.sampledAt`) ; au dépôt, vide = `Serie.samplingTimeDeclared = false` |
| « Arrivée au laboratoire » / « Arrivé le » | `Serie.arrivedAt` (au dépôt : l'instant de l'enregistrement, sans champ) |
| « Reçu le » | `Sample.receivedAt` — l'enregistrement de la réception |
| « État de la surface » | `Sample.surfaceState` — `SurfaceState` : ASEPTIQUE, EN_COURS_DE_TRAVAIL, NETTOYE (Surface seulement) |
| « État des mains » | `Sample.handsState` — `HandsState` : LAVEES, NON_LAVEES (Mains, facultatif) |
| « Surface prélevée (cm²) » | `Sample.surfaceAreaCm2` (entier, 100 par défaut) |

## 2. Tableau de tous les éléments

« Aujourd'hui » = la production (`cd0054f`), avant le lot 1. Lot : **1** =
construit le 14/10, à vérifier ; **2** = en attente ; — = rien à construire.

### 2.1 Préleveur (P1–P10)

| Id | Demande | Ce qui existe aujourd'hui | Ce qu'il faut faire | Effort | Migration | Lot | Question |
|---|---|---|---|---|---|---|---|
| P1 | L1 « Surface : ajouter état des mains » | Une ligne Surface a « État de la surface »\* (Aseptique / En cours de travail / Nettoyé ; obligatoire : `lineDraftError` dans `src/components/preleveur/visit-types.ts`, `validateLine` dans `src/lib/serie-input.ts`). Aucun état des mains sur Surface : `linePayload` ne garde `handsState` que sur MAINS. | Lecture recommandée (a) : la même demande que L6, écrite cinq minutes plus tôt → rien sur Surface, tout est livré par P5. La lecture littérale (un « État des mains » sur une ligne Surface) seulement si le laboratoire la confirme. | XS (S en lecture littérale) | non | 2 | Q109 |
| P2 | L2 « Mains : remplacer Mains non lavées par En cours de travail » | « État des mains » facultatif : Mains lavées / Mains non lavées (`HandsState` LAVEES, NON_LAVEES ; `HANDS_STATE_LABELS`, `labels.ts`). La liste est écrite trois fois (`HANDS_STATE_CHOICES` de `LineEditor.tsx`, `HANDS_STATES` de `serie-input.ts`, `SampleVerbs.tsx`). Imprimé sur le protocole et le bon (« (mains lavées) »), pas sur le rapport. | Avec P5, dans la même migration additive. « Mains non lavées » n'est plus proposé ; les lignes existantes ne sont pas réécrites. | S (compris dans P5) | oui (avec P5) | 2 | Q109, Q110 |
| P3 | L4 « (a remplacer le mot) » | « T° relevée (°C) » sur Surface et Mains, « T° produit (°C) » sur aliment, eau, autre, rien sur l'air (`LineEditor.tsx`). Le protocole imprime « T°p / T°a » (document maîtrisé PG04/EN01), le rapport « Température du produit : Au prélèvement » (PG06/EN03 M) ; la T° ambiante n'est pas sur le rapport. | Ambigu (relecture critique) : demander le mot exact. Puis le libellé à l'écran (`LineEditor`, récapitulatif de la visite, `VisitDetail`, carte de réception « T°p ») et le message du serveur (`serie-input.ts`). Protocole et rapport inchangés sauf demande. | S | non | 2 | Q112 |
| P4 | L3 + L5 T° relevée et T° ambiante obligatoires « dans tous les Type de prélèvement » | Les deux facultatives partout ; seule la plage −80…300 °C est contrôlée. Pas de première température sur l'air depuis la demande du laboratoire du 08/10 (`RETOUR-LABO-06-10.md` §8.5). | Sur la **visite seulement** : au serveur, `validateLine` exige `ambientTemperature`, et `productTemperature` sauf sur l'air, quand `options.kind === "VISITE"` (déjà transmis par `validateSerie` ; aucune nouvelle option) ; au client, `lineDraftError(…, { requireTemperatures: true })` appelé par `VisitForm` et les étoiles dans `LineEditor`. « 0 » compte comme une valeur. Air = T° ambiante seule ; comptoir facultatif (P8) ; « Corriger la fiche » appelle `validateLine` sans options, donc une ancienne ligne sans température reste corrigeable. Tests `visit-types`, `serie-input`, `intake-input`. | M | non | 2 | Q113 |
| P5 | L6 « État de la surface\* » (Aseptique / En cours de travail / Nettoyé) dans « Mains du personnel » — avec le point « Q2-MAINS » de l'ancien logiciel | « État des mains » facultatif à deux valeurs (P2) ; les trois valeurs n'existent que sur Surface (`SurfaceState`). « Personne prélevée »\* est obligatoire (client et serveur) et recopiée dans la désignation imprimée sur le rapport, l'étiquette et l'e-mail (`sampleDesignation`, `src/lib/document-html.ts`) ; l'état des mains n'y figure pas. | Une migration additive : `HandsState` reçoit ASEPTIQUE, EN_COURS_DE_TRAVAIL, NETTOYE **en fin d'enum**, sans UPDATE, sans valeur retirée. Une seule liste `HANDS_STATE_CHOICES` dans `labels.ts` (les trois nouvelles valeurs) pour `LineEditor`, `serie-input.ts` et `SampleVerbs`. LAVEES / NON_LAVEES gardent leurs libellés. Obligatoire à la création ; dans « Corriger la fiche », `handsState` sort de `LINE_RULE_FIELDS` pour `decideKindChoice` (`src/lib/intake-input.ts`). Phrases d'impression propres aux mains. Ne jamais réutiliser `Sample.surfaceState`. Selon Q111 : l'état dans la désignation imprimée, « Personne ou poste prélevé ». Détail §4.1. | M | oui | 2 | Q109, Q110, Q111 |
| P6 | L7 case texte à côté de « Surface prélevée (cm²) » | Un seul champ nombre (`Sample.surfaceAreaCm2` entier, 100 par défaut ; le serveur accepte 1…100 000). Rien à côté. | Après Q114 seulement. « Une autre aire » : déjà couvert par P7 (puces + nombre). « Une description » : colonne additive `Sample.surfaceAreaNote` VARCHAR(191), imprimée sur le protocole (`surfaceText`), à la réception, à la paillasse et sur le rapport, corrigeable. | S (M avec la colonne) | seulement pour une description | 2 | Q114 |
| P7 | L8 choix « 100cm2 » et « 1000cm » | 100 cm² n'est que la valeur préremplie (`emptyLine` / `kindPatch`, `visit-types.ts`) ; 1 000 se tape ; aucun bouton. Même champ dans « Corriger la fiche » (`SampleVerbs.tsx`). | Puces « 100 cm² » / « 1000 cm² » à côté du champ nombre, gardé pour toute autre valeur ; visite, dépôt (même `LineEditor`) et « Corriger la fiche » ; 100 reste le défaut. Répond à la 1re partie de Q2. | S | non | **1** | — (Q2, 1re partie, répondue) |
| P8 | (conséquence) la carte d'échantillon est partagée avec « Nouveau dépôt » | `DepositForm` rend le même `LineEditor` et appelle `lineDraftError(…, { requirePlace: false })` ; un dépôt passe par le même `validateLine`. Le comptoir a déjà « T° à l'arrivée » par ligne (règle (6)). | Toute exigence de P4 réservée à la visite (prop, option du client, `options.kind`). Test : une ligne de dépôt sans T° relevée ni T° ambiante est acceptée. | XS (dans P4) | non | 2 | Q113 |
| P9 | (conséquence) corriger une température ou un état devenus obligatoires | « Corriger la fiche » (`SampleVerbs.tsx`, `sample-verbs-logic.ts`) n'a aucun champ de température, alors que `PATCH /api/samples/[id]/intake` les accepte déjà (`intake-input.ts`). Le préleveur ne corrige pas une ligne enregistrée. | « T° relevée » / « T° ambiante » dans la correction (virgule décimale, −80…300 °C) : une valeur posée ne se vide plus, une ancienne ligne peut rester vide ; l'état des mains par `decideKindChoice` (P5). Tests `sample-verbs-logic`, `intake-input`. | S | non | 2 | — (suit Q111–Q113) |
| P10 | (vérification) la règle (6) est-elle touchée ? | Non. La règle (6) ne lit que `receptionTemperature` (« T° à l'arrivée »), pour les types de `LabSettings.temperatureRequiredKinds` (`src/lib/reception-rules.ts`) ; une T° relevée sur place ne la remplace jamais. | Rien. Si Q101 rend les mains obligatoires à la réception : cocher « Mains » dans `/admin/reglages` (un réglage, pas de code). | — | non | — (déjà fait) | Q101 (ouverte) |

### 2.2 Réception (R1–R10)

| Id | Demande | Ce qui existe aujourd'hui | Ce qu'il faut faire | Effort | Migration | Lot | Question |
|---|---|---|---|---|---|---|---|
| R1 | L9 « Ajouter les sites au client (Afficher) » | Le champ site du dépôt n'apparaît que si le client a déjà des sites (`DepositForm.tsx`, « Site (facultatif) »), sans « + Nouveau site… » — que la visite a déjà (`VisitForm.tsx`) et que `POST /api/clients/[id]/sites` admet pour RECEPTIONNISTE. Ni le récapitulatif ni la confirmation du dépôt ne montrent le site (l'API le renvoie). | « Site de prélèvement » toujours affiché, désactivé tant qu'aucun client n'est choisi, « Siège » par défaut, « + Nouveau site… » ; un composant partagé par la visite et le dépôt ; le site sur le récapitulatif et la confirmation. | S | non | **1** | Q115 |
| R2 | L10 créer un client « avec ses sites et informations » au comptoir — avec N1 | `POST /api/clients` et `GET /api/clients/similar` : GESTIONNAIRE et ADMIN seulement ; `ClientForm` / `SitesManager` côté commercial ; quasi-doublon → 409 levé par `confirmDuplicate`. Un nom exact est refusé contre **tous** les clients, archivés compris (409 « Un client porte déjà cette raison sociale. »), alors que le sélecteur cache les archivés — dont les 345 clients-sites archivés par l'import des sites du 07/10. | Création seule (ni modification, ni fusion) ouverte à RECEPTIONNISTE et PRELEVEUR ; sites créés dans la même transaction (`validateSite`, `src/lib/site-input.ts`) ; `active` / `billingClientId` ignorés pour ces rôles ; journal CLIENT_CREATED (origine, rôle) + SITE_CREATED. Dialogue `QuickClientDialog` ouvert par « + Nouveau client » dans `ClientPicker` (prérempli du texte tapé ; jamais dans les sélecteurs de fusion, de rattachement ni de facturation) ; quasi-doublons en direct avec « Utiliser ce client ». N1 : un nom exact d'un client archivé fusionné → 409 `{ mergedInto, siteId }` « Ce nom est maintenant un site de … : utiliser ce client et ce site » ; archivé sans parent → « demandez au gestionnaire de le réactiver ». Tests de garde de rôle. Détail §4.5. | M | non | 2 | Q116 |
| R3 | L11 « (dans le rôle Préleveur aussi) » | `VisitForm` : `ClientPicker` sans création ; « + Nouveau site… » ne demande que le nom (`createSite` envoie `{ name }`) alors que l'API accepte adresse, ville, téléphone, contact ; `validateSite` honore `active: false` de n'importe quel appelant. | Le même dialogue dans la visite, plein écran sur téléphone (cibles ≥ 44 px, clavier numérique pour l'ICE et le téléphone) ; sous-formulaire de site complet (nom\*, adresse, ville, contact, téléphone) dans le composant de site partagé. Déjà fait au lot 1 : `active` ignoré pour PRELEVEUR / RECEPTIONNISTE dans `POST /api/clients/[id]/sites` (`createdSiteActive`, `src/lib/site-creation.ts`). | S | non | 2 (la partie `active` : 1) | Q116 |
| R4 | (conséquence) suivre les clients créés hors du commercial | Rien ne dit qui a créé un client (pas de `createdById` ; seulement le journal CLIENT_CREATED). Fusion et rattachement : ADMIN. Un client sans destinataire des rapports ne reçoit aucun rapport. | Proposé : migration additive `Client.createdById` (FK, SET NULL) + `Client.toComplete` (vrai quand le créateur est RECEPTIONNISTE ou PRELEVEUR) ; filtre et badge « À compléter » sur `/commercial` et la fiche, effacés quand le gestionnaire enregistre la fiche ; avertissement à la confirmation de la visite ou du dépôt quand le client n'a aucun destinataire des rapports. | S | oui | 2 | Q117 |
| R5 | L12 « Remplacer "Prélevé le" par "Arrivé le" » — avec C6 | « Prélevé le » (`DepositForm.tsx`) écrit `Serie.startedAt` et `Sample.sampledAt` : la « Date et heure du Prélèvement » du rapport et la base du délai C1. Vide = « Non déclarée », `samplingTimeDeclared = false`, C1 « à vérifier » ⇒ une observation écrite pour accepter conforme (A7, Q71). L'arrivée n'est pas saisie au dépôt : `arrivedAt` = l'instant de l'enregistrement (`serie-create.ts`), alors que l'API accepte déjà `arrivedAt` pour un dépôt. C6 : la file de réception ne liste jamais un dépôt (né RECU), donc `SerieQueue` n'est pas concernée. | **Jamais un simple changement de libellé** (§4.4). Un vrai champ « Arrivé le » (`LabDateTimeInput`, prérempli maintenant, « Maintenant », refusé dans le futur) envoyé en `arrivedAt`, lu par la checklist en direct et le récapitulatif ; au serveur, un dépôt sans heure de prélèvement prend `startedAt = arrivedAt ?? maintenant` (sinon `arrivalRefusal` refuse toute arrivée antérieure à l'enregistrement) ; ancienneté de l'arrivée bornée. Selon Q118 : « Prélevé le (si connu) » gardé ou retiré, C1 d'un dépôt non déclaré, heure de réception du rapport. | M | non | 2 | Q118 (+ Q68, Q71) |
| R6 | (prérequis de L12) l'instant du comptoir affiché comme heure de prélèvement — avec C5 | Pour un dépôt sans heure de prélèvement, `Sample.sampledAt` = l'instant de l'enregistrement. Le rapport et le parcours affichent déjà « Non déclarée » (`report-html.ts`, `sample-timeline.ts`) ; l'e-mail du rapport (`src/lib/emails/templates.ts`), l'avis de destruction, le portail (accueil et « Prélevé le » de `/portail/echantillons`), `/recherche` (colonne « Prélevé »), la fiche client du commercial, `SampleTable` et `SampleDetailPanel` impriment la date. Après R5 ce serait presque chaque dépôt. | Lire `serie.samplingTimeDeclared` dans ces requêtes et imprimer « Non déclarée » à la place de la date. Les filtres et les tris par date de prélèvement continuent de lire la colonne (un dépôt non déclaré se retrouve par son jour d'enregistrement), comportement documenté. | M | non | **1** | — |
| R7 | L13 « Remarque global sur la date AM/PM par 24h » (saisie) | Le seul champ date-heure, `LabDateTimeInput` (`src/components/LabDateTimeInput.tsx`), enveloppe un `<input type="datetime-local">` natif, que le navigateur dessine dans la langue du poste : AM/PM sur un Windows ou un Chrome en anglais, malgré `<html lang="fr">`. 8 appels : visite (prélevé le, heure de fin), fiche de visite (fin, arrivée), dépôt, réception (arrivée), accord du client (`reception-widgets.tsx`, sur trois écrans), délai du programme. La valeur enregistrée est déjà en 24 h. | Réécrire l'intérieur du composant seulement, mêmes props et même valeur (« AAAA-MM-JJTHH:mm », heure légale ; "" si vide) : une date et une heure 24 h tapées en texte (00:00–23:59), lues et écrites par un module pur et testé `src/lib/wall-input.ts` ; garder « Maintenant », l'indication d'heure légale, `errorId` / `aria-describedby`, le décalage de l'appareil (`src/lib/device-time.ts`). Contournement immédiat, sans code : langue du navigateur et format régional en français sur les postes. | M | non | **1** | — |
| R8 | L13 (volet dates seules) | 28 `<input type="date">` natifs dans 16 fichiers (DLC et date de production de `LineEditor`, filtres « Du / Au », facturation, administration, qualité, magasin) : mois/jour/année sur un poste en anglais. Valeurs ISO, seul l'affichage dépend du poste. | Si confirmé : un `LabDateInput` « JJ/MM/AAAA » tiré du même `wall-input.ts` (valeur ISO inchangée) ; les formulaires GET des pages serveur écrivent un champ caché ISO (adresses et lecteurs inchangés) ; la DLC d'abord. | M | non | 2 | Q119 |
| R9 | L13 (affichage et documents) | Déjà en 24 h partout : `formatDateTime` / `formatDayTime` (`labels.ts`), `lab-time.ts` (h23), rapport (« 09h30 »), bon et protocole (« 14h05 »), exports Excel. Écart mineur : `formatInvoiceDate` (`FactureDetail.tsx`) sans fuseau du laboratoire (date seule, sans effet sauf près de minuit sur un appareil non mis à jour). | Rien pour AM/PM. Facultatif : le fuseau du laboratoire dans `formatInvoiceDate`. | XS | non | — (déjà fait) | — |
| R10 | L9 (retrouver le client par son site) — avec C7 | `GET /api/clients?q=` ne cherche que nom, ICE et contact (`src/app/api/clients/route.ts`) et cache les archivés : depuis l'import du 07/10 (420 sites sous 36 clients, 345 clients-sites archivés avec `mergedIntoId`), taper le nom d'un restaurant devenu site répond « Aucun client actif ne correspond. » ; aucune borne au serveur (8 lignes coupées au client). Un site désactivé du même nom fait refuser la création (409 « Ce client a déjà un site de ce nom. ») alors que le sélecteur ne liste que les sites actifs. | Chercher aussi les noms des sites actifs et les fiches archivées devenues partie d'un autre client (fusionnées, rattachées comme site, archivées par l'import des sites) ; renvoyer le client vivant avec `matchedSiteId`, afficher « Client — Site », présélectionner le site au dépôt et à la visite ; borne au serveur. Sur le 409 d'un nom de site déjà pris par un site absent de la liste : dire qu'il est désactivé et qu'il faut demander au gestionnaire commercial de le réactiver. | S | non | **1** | Q115 |

### 2.3 Responsable des paramètres (RP1–RP7)

| Id | Demande | Ce qui existe aujourd'hui | Ce qu'il faut faire | Effort | Migration | Lot | Question |
|---|---|---|---|---|---|---|---|
| RP1 | L14 « Afficher les critères par famille » | Le responsable des paramètres (PROGRAMMATEUR) ne voit les critères que de la famille choisie, sur la fiche de programme (§1, tableau en lecture, `src/components/programmation/ProgrammeSheet.tsx`). `/admin/types-produits` est réservé à ADMIN ; `programmation-nav.ts` n'a ni catalogue ni critères ; `GET /api/product-types/[id]` admet déjà PROGRAMMATEUR. | Page en lecture `/programmation/criteres` « Familles & critères » (PROGRAMMATEUR, ADMIN) : familles groupées par catégorie (après RP2a), filtres Type d'analyse, Catégorie, Réglementation, Client, actives / inactives ; recherche sur la famille et le germe ; grille des critères (germe, version de norme, unité, n, c, m, M). Entrée de menu, test `nav-for-role`. Tant que N2 (RP2b) n'est pas corrigé, ne proposer que les familles applicables à la catégorie de l'échantillon. | M | non | 2 | Q122 |
| RP2a | L15 catégories (le modèle) | `ProductType` : name, family (MICRO par défaut), clientId, active, legacyId, regulationId — ni catégorie, ni nature, ni description. L'import de l'ancien logiciel (`src/app/api/admin/import/legacy/route.ts`) et celui du classeur (`…/import/criteres/route.ts`) créent tout en MICRO. Production : ≈ 530 familles (≈ 260 actives), ≈ 3 020 critères. | Migration additive écrite à la main : table `ProductTypeGroup` (name, normalizedName unique, sortOrder, active, legacyId unique) ; `ProductType.groupId` (FK SET NULL, index `[groupId, active]`), `ProductType.natureId` (FK `AnalysisNature`, SET NULL — le filtre « Type d'analyse »), `ProductType.description` (texte « FAMILLE » de l'ancien logiciel, facultatif). `criteria-input.ts`, les routes product-types et `programme-referential.ts` les lisent et les renvoient. Table de jonction au lieu de `natureId` si une famille peut avoir plusieurs types d'analyse (Q121). | S | oui | 2 | Q120, Q121 |
| RP2b | L15 reprise des catégories — avec **N2** | Le groupe (8 valeurs ; 382 des 634 familles en ont un) et le type d'analyse (`echantillon`) sont dans l'export de l'ancien logiciel (hors dépôt), jamais importés ; toutes les familles sont MICRO. **N2** : l'import rattache chaque critère au paramètre ALIMENTAIRE du même germe (l'index prend les aliments d'abord) ; les familles des mains, surfaces, eaux et air de l'ancien logiciel se choisissent donc sur la fiche de programme de ces échantillons, mais leurs critères ne s'appliquent pas (`programme-referential.ts` ne charge que la catégorie de l'échantillon ; « non programmé ») et un résultat n'est jamais interprété contre eux. | Étendre l'import « Catalogue de l'ancien logiciel » (analyse puis validation, idempotent, ADMIN) : créer les 8 catégories, poser `groupId`, `natureId` (`AnalysisNature.legacyId`), `family` = celle de la nature — **seulement là où la colonne est vide ou par défaut**, jamais sur une modification manuelle, journalisé. N2 : mesurer d'abord en lecture sur la copie locale (jamais la production), puis rattacher chaque critère d'une famille AMBIANCE / EAU au paramètre de même nom de cette catégorie (créé si besoin avec l'unité du critère : UFC/mains, UFC/cm², UFC/100 mL). Ordre : copie locale, puis production par l'exploitant. Le CSV n'entre jamais dans le dépôt. Tests `legacy-catalogue`, `programme-sheet-logic`. | M | non (après RP2a) | 2 | Q121, Q126 |
| RP2c | L15 écrans des catégories | Familles : création (quasi-doublon), renommage, Micro / PC / Autre, client, actif (`ProductTypesManager.tsx`, `CriteriaGrid.tsx`) ; réglementation (`RegulationEditor`). Aucune catégorie ; filtres Tous / Catalogue / Par client / Inactifs. | `GET` / `POST /api/product-type-groups`, `PATCH /api/product-type-groups/[id]` (renommer, ordonner, archiver ; supprimer refusé quand des familles y sont) ; validation dans `criteria-input.ts` ; journal (`PRODUCT_TYPE_GROUP_CREATED` / `_UPDATED`, libellés `audit-labels.ts`) ; panneau « Catégories » (liste, création, ordre, archivage, déplacement groupé) ; Catégorie et Type d'analyse dans la fiche famille et la création ; filtres et vue groupée par catégorie. | M | non | 2 | Q125 |
| RP2d | L15 « dans le rôle Responsable des paramètres » | Toute écriture du catalogue est ADMIN : `POST /api/product-types`, `PATCH /api/product-types/[id]`, `PUT /api/product-types/[id]/criteria` ; pages `/admin/types-produits*` et layout `/admin` : ADMIN. `PROGRAMME.md` §2 : « pas de configuration ». `GET /api/parameters` exclut PROGRAMMATEUR. | Ne pas ouvrir `/admin` : pages `/programmation/familles` et `/programmation/familles/[id]` réutilisant `ProductTypesManager`, `RegulationEditor`, `CriteriaGrid` (une prop `basePath` au lieu des liens `/admin/types-produits` écrits en dur) ; gardes élargies à PROGRAMMATEUR + ADMIN sur ces écritures, les routes des catégories et `GET ?all=1` ; TECHNICIEN exclu partout ; menu « Familles & critères » ; test des gardes sur le modèle de `direction-guards.test.ts`. | M | non | 2 | Q125 |
| RP3 | L16 « le technicien n'a pas les droits pour changer les paramaitres » — avec C10 | **Déjà la règle**, vérifiée au serveur : programme `PUT …/programme` (PROGRAMMATEUR, ADMIN) ; « Corriger la fiche » `PATCH …/intake` (RECEPTIONNISTE, VALIDATEUR, DIRECTION, ADMIN) ; séries (PRELEVEUR, RECEPTIONNISTE, ADMIN) ; catalogue (paramètres, familles, critères, profils, normes, réglementations, prestations, `/api/admin/*`) : ADMIN ; layouts `/admin` et `/programmation` refusés. Les seules écritures du technicien : `PUT …/results` (paramètres déjà programmés seulement, 409 sinon), `results/submit`, `take`, `temperatures`. Aucun test ne fixait cette exclusion. C10 : un compte n'a qu'un rôle. | `src/lib/technician-guards.test.ts`, sur le modèle de `direction-guards.test.ts` : lit chaque route et chaque layout, échoue si une garde admet TECHNICIEN au-delà des résultats, de la soumission, de la prise en charge et des relevés de température. Réponse au laboratoire : « c'est déjà la règle » (Q127). | S | non | **1** | Q127 |
| RP3b | (corollaire de L16) qui change les analyses après le programme | `FICHE_CORRECTION_ROLES` (`src/lib/sample-verbs.ts`) = RECEPTIONNISTE, VALIDATEUR, DIRECTION, ADMIN : ils changent analyses, famille et n jusqu'à RESULTATS_SAISIS. Le responsable des paramètres ne le peut plus une fois la paillasse commencée : sa fiche renvoie vers « Corriger la fiche », qu'il n'a pas. | Selon Q128 : (a) à partir de PROGRAMME, `parameterIds` / `productTypeId` / `unitCount` réservés à PROGRAMMATEUR et ADMIN, vérifié au serveur par rôle et par champ, drapeau `correctAnalyses` dans `verbsFor` ; ou (b) PROGRAMMATEUR ajouté à la partie « analyses » de la correction. Tests `direction-guards`, `sample-verbs` ; texte de la fiche en lecture seule ; `WORKFLOW.md` §8. | S | non | 2 | Q128 |
| RP3c | (durcissement) le technicien lisait le référentiel du programme | `GET /api/samples/[id]/programme` admettait TECHNICIEN : il renvoie tout le référentiel (familles et critères, profils, prix du catalogue). Aucun écran du technicien ne l'appelle. | TECHNICIEN retiré de la garde du GET (403) ; commentaire de la route ; note du 14/10 dans `PROGRAMME.md`. | XS | non | **1** | — |
| RP4 | L14 / L15 (vocabulaire) | L'écran dit « Type de produit » ; « famille » y désigne Micro / PC (§1). | Si Q120 l'accepte : « Famille de produits » partout à l'écran (fiche de programme, `LineEditor`, `DepositForm`, `SampleVerbs`, validation, administration, programmation) et « Domaine (Microbiologie / Physico-chimie) » dans la fiche famille ; libellés seulement ; docs et TESTPLAN. En dernier (§4.7). | S | non | 2 | Q120 |
| RP5 | L14 sélecteur « Choix famille produits » (ex-OLD1 de cette lecture) | Fiche de programme : recherche texte + une liste (« Types du client » puis « Catalogue », ≈ 260 familles actives + celles du client), sans filtre de nature, de catégorie ni de réglementation ; même principe dans `LineEditor` (aliment) et `DepositForm` (`GET /api/product-types?clientId=`). | Dialogue partagé « Choisir une famille » : filtres Type d'analyse (préréglé sur la nature de l'échantillon), Catégorie, Réglementation, Recherche sans accents ; familles du client en tête ; nombre de critères ; ✓ / Fermer ; utilisable au clavier. Logique de filtre pure et testée ; `programme-referential.ts` renvoie groupId / natureId / regulationId ; `GET /api/product-types` filtre. Fiche de programme d'abord. La migration est celle de RP2a. | M | non | 2 | Q124 |
| RP6 | L14 les paramètres de la famille à cocher (ex-OLD2 ; avec C9, OLD32) | Fiche de programme §2 : tous les paramètres de la catégorie, groupés Micro / PC / Autre, compteurs « x sur y ». Choisir une famille coche tous ses germes ; changer de famille ou « — aucun — » ne retire rien (`applyProductType` fusionne, `programme-sheet-logic.ts` ; fixé par `programme-sheet-logic.test.ts`). Pas de « Cocher tout ». C9 : dans l'ancien logiciel, deux captures du même échantillon montrent que changer de famille **remplaçait** la liste. | En §1, la famille choisie devient la liste « Paramètres à rechercher » (germe · norme · unité · n / c / m / M) avec « Cocher tout », « Décocher tout », « N paramètre(s) coché(s) » ; les autres analyses dans « Autres analyses », repliable ; aperçu d'une famille sans toucher au brouillon ; aides pures `checkAllOfType` / `uncheckAllOfType` et remplacement au changement de famille (retire les germes venus seulement de l'ancienne famille, garde ceux cochés à la main) ; test de fusion mis à jour ; `PROGRAMME.md` §4. | S | non | 2 | Q123 |
| RP7 | « Type d'analyse » de l'ancien logiciel (ex-OLD3 ; avec C8, OLD4) | 16 natures de l'ancien logiciel (`AnalysisNature`, migration `20260913200000_phase9_serie`) + `PC_AIR`, `MICRO_AUTRE`. « Analyse sensorielle » existe en famille AUTRE mais aucun échantillon ne peut l'atteindre : la ligne n'offre que Micro / PC, `natureChoices` ne garde que la même famille et `resolveProgrammeNature` refuse un changement de famille. « Analyse physique » n'existe pas. (La lecture « déjà fait » est fausse — C8.) | Selon Q129 : proposer « Analyse sensorielle » sur la fiche de programme d'un échantillon d'aliment quelle que soit sa famille (ou la reclasser : migration de données) ; « Analyse physique » : rien si abandonnée, sinon une nature ajoutée par migration avec son `legacyId`. Test `programme-sheet-logic`. | S | non (option : données) | 2 | Q129 |

### 2.4 Ancien logiciel (OLD1–OLD50)

Les écrans des captures, rapprochés du logiciel. Statuts : **fait** (rien à
construire) · **→ X** (couvert par un élément ci-dessus) · **lot 1** ·
**si demandé** (Q130) · **attend Qn** (question déjà ouverte) · **hors
périmètre** (raison au §5).

| Id | Ancien logiciel | Aujourd'hui | À faire | Effort | Migration | Statut | Question |
|---|---|---|---|---|---|---|---|
| OLD1 | « Num d'échantillon » NNNNN/AA | `Sample.controlCode`, séquence annuelle verrouillée (`counters.ts`, `serie-create.ts`), « Code contrôle » partout | — | — | non | fait | — |
| OLD2 | « Date réception » + heure, modifiables | Visite : « Arrivée au laboratoire » modifiable (fiche de visite, réception) ; dépôt : l'instant de l'enregistrement, sans champ | R5 | S | non | → R5 | Q118 |
| OLD3 | « Client » puis « Site » toujours affichés | Visite : oui ; dépôt : seulement si le client a des sites ; la recherche ignore les sites | R1, R10 | S | non | → R1, R10 (lot 1) | Q115 |
| OLD4 | liste « Type d'analyse » | nature déduite ; « Analyse sensorielle » inaccessible ; « Analyse physique » absente | RP7 | S | non | → RP7 | Q129 |
| OLD5 | « Nature échantillon » + « … » → « Choix famille produits » (filtres) | famille choisie par recherche + liste, sans filtre ; le groupe lu à l'import, jamais enregistré | RP5 (données : RP2a) | M | non | → RP5 | Q124 |
| OLD6 | liste « Produit » | mémoire `ClientProduct` par client et site, « Vouliez-vous dire » (`LineEditor`) | — | — | non | fait | — |
| OLD7 | « Lieu de prélèvement » | mémoire `ClientPlace` par site ; au dépôt « Dépôt au laboratoire » | — | — | non | fait | — |
| OLD8 | « Nbr de prélèvement » | « Nombre d'unités (n) » 1 / 3 / 5 / 9 + nombre libre | — | — | non | fait | — |
| OLD9 | case « Échantillon témoin » | rien | si demandé : booléen `Sample.controlSample` | XS | oui | hors périmètre (posée en Q130 a) | Q130 |
| OLD10 | case « Conforme » | les 8 règles du bon et C1–C7, motif codé, observation, accord du client, décision (`reception-rules.ts`, `reception-complementary.ts`) | — | — | non | fait | — |
| OLD11 | « Pers. chargée de la réception » | `receivedById` = le compte connecté, imprimé sur le bon | — | — | non | fait | — |
| OLD12 | « Pers. chargée du prélèvement » (un préleveur Qualilab saisi à la réception) | visite : le préleveur connecté, ou « Le client » / « Autre » ; dépôt : « Le client » / « Autre » seulement ; `GET /api/preleveurs` existe sans écran | si demandé : « Qualilab (préleveur) » au dépôt avec un compte PRELEVEUR → `samplerKind` QUALILAB (référence PG04 imprimée) | S | non | si demandé | Q130 |
| OLD13 | « Réf d'échantillon de client » | `Serie.clientReference`, une par série | si demandé : `Sample.clientSampleRef`, imprimée dans « Données fournies par le client » | S | oui | si demandé | Q130 |
| OLD14 | « Type de teste » (Normal / vieillissement / stabilité) | rien | — | — | non | hors périmètre | — |
| OLD15 | date et heure de prélèvement par échantillon | une par série, comme le protocole papier ; dépôt vide = « Non déclarée » | — (choix voulu, `WORKFLOW.md`) ; dépôt : R5 | — | non | fait | — |
| OLD16 | « Date production » / « Dates expiration » | « DLC — production / expiration », contrôle C7, rapport | format JJ/MM/AAAA : R8 | — | non | fait (format → R8) | Q119 |
| OLD17 | « Lot/Code » | « N° du lot » | — | — | non | fait | — |
| OLD18 | « Moyen de prélèvement » | air seulement (« Méthode de prélèvement ») ; ailleurs le rapport imprime « — » | après la réponse : liste par type, `Sample.samplingMeans`, imprimée protocole + rapport | S | oui | attend Q104 (d) | Q104 (d) |
| OLD19 | quantité + unité | « Quantité » + unité ; « Quantité 1M / 1P » au comptoir | — | — | non | fait | — |
| OLD20 | « Surface prélevée » en texte libre | nombre en cm² ; mains : « MAIN » sur le protocole | P7 (lot 1), P6 | S | si P6 | → P7, P6 | Q114 |
| OLD21 | « Diluant utilisé » | note de méthode par paramètre, consignes, facteur de dilution | si demandé : liste « Diluant » sur la fiche de programme, imprimée sur la paillasse | S | oui | si demandé | Q130 |
| OLD22 | « Date d'analyse » prévue et heure modifiable | `dueAt` « à rendre le » ; date d'analyse du rapport calculée (programme → dernier résultat) | après la réponse : « Début d'analyse » à la paillasse (`Sample.analysisStartedAt`) | S | oui | attend Q104 (f) | Q104 (f) |
| OLD23 | « Température de prélèvement » | `productTemperature` facultative (« T° produit » / « T° relevée ») + T° ambiante | P3, P4 | M | non | → P3, P4 | Q112, Q113 |
| OLD24 | « Température à la réception » | `receptionTemperature`, origine, classe de conservation, règle (6) | — | — | non | fait | — |
| OLD25 | « Température glacière » | `Serie.coolerTemperature`, imprimée sur le rapport | — | — | non | fait | — |
| OLD26 | « Lieu d'exécution » | constante `REPORT_EXECUTION_PLACE` (`report-template.ts`), une seule valeur dans l'ancienne base | dette mineure : un fait du laboratoire écrit dans le code ; vers `/admin/entreprise` si un 2e lieu apparaît | — | non | fait | — |
| OLD27 | « Référence prélèvement » | `SAMPLING_PROCEDURES` ; « N/A … » pour un dépôt ; PG06/IT55 pour l'air | — | — | non | fait | — |
| OLD28 | « Neutralisant » (surfaces, mains) | aucun champ | si demandé : `Sample.neutralizer` sur Surface et Mains, imprimé | S | oui | si demandé | Q130 |
| OLD29 | paramètres listés avec leur norme et leur unité | `LineEditor` (visite, dépôt) : le nom seul ; fiche de programme : nom + unité, norme dans le tableau des critères | l'unité et la version de norme en vigueur sous chaque analyse proposée | S | non | **lot 1** | — |
| OLD30 | marque « \* » (non accrédité) par matrice | aucun champ ; la légende du rapport explique « \* », SA, SN, DPC sans marquer aucun paramètre | après la réponse : statut d'accréditation par paramètre × nature, importable de l'ancienne base, marque sur le rapport | M | oui | attend Q104 (h), Q7 | Q104 (h) |
| OLD31 | paramètres des mains en UFC/mains | une ligne Mains prend la nature des surfaces : 5 paramètres en UFC/cm², aucun en UFC/mains | reprendre ou saisir les paramètres des mains (UFC/mains), avec N2 | M | non (données) | lot 2, avec RP2b | Q126 |
| OLD32 | « Cocher tout » / « Décocher tout » + compteur | fiche de programme : « x sur y », profils ; `LineEditor` : rien | avec RP6 ; dans `LineEditor` si demandé | XS | non | → RP6 | Q123 |
| OLD33 | onglet « Paramètres demandés par le client » (DPC) | les analyses demandées précochent le programme, qui les remplace : la demande du client se perd ; « DPC » jamais imprimé | si demandé : `SampleParameter.clientRequested`, marque « DPC » sur le rapport | S | oui | si demandé | Q130 |
| OLD34 | onglet « Observations » | remarques, notes de série, observation de réception, consignes | — | — | non | fait | — |
| OLD35 | Nouveau / Dupliquer / Modifier / Valider / Annuler | « + Ajouter un échantillon », « Dupliquer », « Supprimer », « Enregistrer », « Corriger la fiche » | — | — | non | fait | — |
| OLD36 | « Multi Duplication » | une copie par clic | si demandé : « Dupliquer × N » (borné) | XS | non | si demandé | Q130 |
| OLD37 | navigation ◀ ▶ d'un échantillon à l'autre | écrans de série sur une page ; fiche de programme et paillasse : retour à la file seulement | si demandé : « Échantillon précédent / suivant » de la même série | S | non | si demandé | Q130 |
| OLD38 | impression | étiquettes, protocole / bon, feuille de paillasse | — | — | non | fait | — |
| OLD39 | la réception saisit chaque échantillon, un par un | remplacé par le circuit série | — | — | non | hors périmètre | — |
| OLD40 | en-tête de la saisie des résultats : type d'analyse, nature | carte de la paillasse et file : le domaine seulement (`TypeBadge`) | le libellé de la nature sur la carte (`/technicien/[id]`) et sur chaque ligne de la file | XS | non | **lot 1** | — |
| OLD41 | « Date saisie » | `Result.enteredAt` / `enteredById` | — | — | non | fait | — |
| OLD42 | « Type param. » / « Valeur pm » | « Critère : » (Absence /25 g, m, M, n, c) et norme (`bench-plan.ts`) | — | — | non | fait | — |
| OLD43 | opérateur, valeur, exposant | un champ qui lit « 1,2.10² », « < 10 », « > 3.10⁵ », « Indénombrable »… (`result-value.ts`) | — | — | non | fait | — |
| OLD44 | boutons rapides « < », « 1e+1 »… | tout se tape | si demandé : raccourcis sous le champ (`ResultEntryForm.tsx`) | XS | non | si demandé | Q130 |
| OLD45 | cases « Limite de quantification » / « de détection » | aucune | — | — | non | hors périmètre | — |
| OLD46 | conclusion par paramètre et générale | verdict en direct, verdict de l'échantillon, échelle de conclusion, « Modifier la conclusion » | — | — | non | fait | — |
| OLD47 | onglet « Commentaire » de la saisie des résultats | la note n'apparaît que sur « Anomalie » ou si une note existe (`ResultEntryForm.tsx`) ; pas de commentaire d'échantillon | si demandé : « Ajouter une note » par paramètre (sans migration) ; commentaire d'échantillon `Sample.benchNote` | S | oui (commentaire d'échantillon) | si demandé | Q130 |
| OLD48 | « Activer la saisie » (verrou) | « Prendre en charge » / « Libérer », collègues en lecture seule (`PROGRAMME.md` §10) | — | — | non | fait | — |
| OLD49 | liste « Saisie des Résultats » | `/technicien` par série : code, désignation, réception, échéance, statut, pastilles | nature : OLD40 | — | non | fait (nature → OLD40) | — |
| OLD50 | filtres « Plus de N jours » | vues À prendre / À commencer / En analyse… ; `/recherche` par période | si demandé : filtre « reçu depuis plus de N jours » et ancienneté sur chaque ligne de `/technicien` | S | non | si demandé | Q130 |

## 3. Lot 1 — construit le 14/10 (aucune réponse nécessaire)

Exactement ces éléments, sur la branche `retour-labo-14-10` (depuis
`cd0054f`), **sans migration**, chacun avec ses tests. **Statut de chaque
ligne : en production (14/10, `52e0d27`)** — les contrôles (tsc, eslint, vitest,
build), le test local au navigateur, le déploiement et TESTPLAN V15 en
production mettront ce statut à jour.

| Élément | Ce qui est construit | Où | Statut |
|---|---|---|---|
| P7 | Puces « 100 cm² » / « 1000 cm² » à côté du champ nombre (gardé pour toute autre valeur) sur une ligne Surface, à la visite, au dépôt et dans « Corriger la fiche » ; 100 reste le défaut | `SURFACE_AREA_CHOICES` (`src/lib/labels.ts`) ; `LineEditor.tsx` ; `SampleVerbs.tsx` | en production (14/10, `52e0d27`) (V15-B) |
| R7 | Le champ date-heure devient deux textes masqués, le jour « JJ/MM/AAAA » et l'heure « HH:MM » en 24 h, lus sans la langue du poste ; « 24:00 » ou « 31/04 » refusés, jamais réinterprétés ; même composant, mêmes props, même valeur enregistrée (heure légale), « Maintenant » et décalage de l'appareil conservés | `src/components/LabDateTimeInput.tsx` ; `src/lib/wall-input.ts` (+ test) | en production (14/10, `52e0d27`) (V15-A) |
| R1 + R10 (C7) | Au dépôt, « Site de prélèvement » toujours affiché (désactivé sans client, « Siège », « + Nouveau site… »), composant partagé avec la visite ; un nom déjà dans la liste (casse, accents et ponctuation à part) choisit ce site au lieu d'en créer un second ; sur un 409, l'indication qu'un site absent de la liste est désactivé (demander au gestionnaire) ; site sur le récapitulatif et la confirmation ; recherche du client par le nom d'un site actif et par une fiche archivée devenue partie d'un autre client → le client vivant, site présélectionné (« Client — Site ») ; au plus 20 lignes ; un site créé par le préleveur ou la réception est toujours actif | `src/components/commercial/SitePicker.tsx` ; `DepositForm.tsx`, `VisitForm.tsx` ; `ClientPicker.tsx` (`siteRows`, `PickedClient.siteId`) ; `GET /api/clients` + `src/lib/client-search.ts` (+ test) ; `POST /api/clients/[id]/sites` + `src/lib/site-creation.ts` (+ test) | en production (14/10, `52e0d27`) (V15-C) |
| OLD29 | Sous chaque analyse proposée à la visite, au dépôt et sur la fiche de programme : « norme en vigueur · unité » (ex. « NM ISO 6579 - 1:2021 · /25g ») ; affichage seulement | `src/lib/parameter-caption.ts` (+ test) ; `normLabel` ajouté à `GET /api/parameters` ; `LineEditor.tsx`, `ProgrammeSheet.tsx` | en production (14/10, `52e0d27`) (V15-D) |
| OLD40 | La nature de l'échantillon sur la carte de la paillasse et sur chaque ligne de la file | `src/app/technicien/[id]/page.tsx` ; `WorkQueue.tsx` | en production (14/10, `52e0d27`) (V15-E) |
| R6 + C5 | « Non déclarée » au lieu de l'instant d'enregistrement d'un dépôt sans heure de prélèvement : e-mail du rapport et avis de destruction, portail (accueil, « Mes échantillons »), `/recherche`, fiche client du commercial, `SampleTable`, `SampleDetailPanel`. Filtres et tris : inchangés (ils lisent la colonne ; documenté) | `declaredSampledAt` / `UNDECLARED_SAMPLING` (`src/lib/sample-search.ts`) ; `emails/templates.ts`, `report-dispatch.ts`, `destruction-notice.ts`, `portal-query.ts`, `sample-search-server.ts` | en production (14/10, `52e0d27`) (V15-F) |
| RP3 + RP3c | Test des gardes du technicien ; `GET /api/samples/[id]/programme` refusé au technicien (403) | `src/lib/technician-guards.test.ts` ; `src/app/api/samples/[id]/programme/route.ts` | en production (14/10, `52e0d27`) (V15-G) |
| Dépôt public | Le nom d'une personne dans la désignation de mains d'un test remplacé par « Personne Test », celui d'un membre du personnel par « Préleveur Test », le nom d'un client dans une désignation d'exemple par « Salade maison » ; le nom d'un client retiré de `WORKFLOW.md` §10 ; noms retirés de TESTPLAN (L1, L1b, L4) et de PROGRESS | `src/lib/document-html.test.ts`, `src/lib/intake-input.test.ts`, `prisma/schema.prisma` (commentaire seul) ; docs | en production (14/10, `52e0d27`) (V15-H) |
| Dérive de HANDOFF | État réel des déploiements (10/10, 12/10, 13/10, V14) ; ligne du 14/10 ; « où changer X » ; journal des décisions du 14/10 | `HANDOFF.md` | en production (14/10, `52e0d27`) (relu au déploiement) |

Le lot 1 ne touche pas : la création de clients (R2–R4) ni le
sous-formulaire de site complet (R3), « Arrivé le » (R5), les dates seules
hors du champ date-heure (R8), les états des mains et les températures
obligatoires, ni rien du catalogue (RP1, RP2, RP4–RP7).

## 4. Lot 2 — en attente du laboratoire

Rien de ce qui suit n'est construit. Chaque thème : le défaut recommandé (ce
que l'on construira si le laboratoire l'accepte), la conception, l'ordre.

### 4.1 Mains : un état obligatoire à trois valeurs (P1, P2, P5 ; Q109–Q111)

**Défaut recommandé** : sur « Mains du personnel », un seul « État des
mains »\* — Aseptique / En cours de travail / Nettoyé ; rien de nouveau sur
Surface ; « Mains non lavées » n'est plus proposé ; les anciennes lignes
gardent leur libellé.

**Conception (correction C1 de la relecture — elle remplace les trois plans
des lectures)** :
1. **Une migration additive** : `ALTER TABLE Sample MODIFY handsState
   ENUM('LAVEES','NON_LAVEES','ASEPTIQUE','EN_COURS_DE_TRAVAIL','NETTOYE')
   NULL` ; l'enum Prisma reçoit les mêmes valeurs. Les nouvelles valeurs vont
   **en fin** de liste ; **aucun UPDATE, aucune valeur retirée** : la
   production contient des données réelles (la migration du cadre du 07/10
   ne réécrivait des lignes que parce que la production ne contenait alors
   que des séries de test).
2. Une seule liste `HANDS_STATE_CHOICES` dans `labels.ts` (les trois
   nouvelles valeurs) pour `LineEditor`, `HANDS_STATES` de `serie-input.ts`
   (création) et `SampleVerbs`. LAVEES / NON_LAVEES gardent leurs libellés :
   les anciens protocoles et bons se réimpriment à l'identique. Une
   conversion des anciennes lignes seulement si Q110 répond oui, par un
   UPDATE unique relu.
3. Des phrases d'impression propres aux mains (« aseptiques », « en cours de
   travail », « nettoyées ») ; jamais `SURFACE_STATE_PHRASES`, qui écrirait
   « surface … » après le nom d'une personne. **Ne jamais réutiliser
   `Sample.surfaceState`** pour les mains.
4. Obligatoire à la création (`lineDraftError` + `validateLine`). Dans
   « Corriger la fiche », `handsState` sort de `LINE_RULE_FIELDS` pour
   `decideKindChoice`, avec une valeur de remplacement pour une ancienne
   ligne : sinon `oneOf()` rend `null` pour LAVEES / NON_LAVEES et toute
   correction d'une ancienne ligne de mains serait refusée.
5. Selon Q111 : l'état dans la désignation imprimée (rapport, étiquette,
   e-mail : « Mains — Chef cuisine — en cours de travail ») ; « Personne ou
   poste prélevé » au lieu de « Personne prélevée » (le nom **ou** la
   fonction).
6. Tests : `serie-input`, `intake-input` (une ancienne ligne LAVEES reste
   corrigeable, inchangée), `document-html`, `reception-logic`.

Effort : M (≈ 10 h, P1 et P2 compris). Migration : oui (une).

### 4.2 Températures obligatoires (P3, P4, P8, P9 ; Q112, Q113)

**Défaut recommandé** : T° relevée et T° ambiante obligatoires **sur la
visite seulement** ; **air = T° ambiante seule** (le laboratoire a lui-même
retiré la première température de l'air le 08/10) ; **comptoir facultatif**
(la « T° à l'arrivée » reste exigée par la règle (6)) ; le mot « T° relevée »
à l'écran sur tous les types ; protocole et rapport inchangés.

**Conception (corrections C2, C3)** :
- Serveur : dans `validateLine`, `if (options.kind === "VISITE")` exige
  `ambientTemperature`, et `productTemperature` sauf `lineKind === "AIR"`.
  `validateSerie` passe déjà `kind` : aucune nouvelle option. « Corriger la
  fiche » (`intake-input.ts`) appelle `validateLine` sans options : jamais
  bloquée pour une ancienne ligne.
- Client : `lineDraftError(line, natures, { requireTemperatures: true })`
  depuis `VisitForm` seulement, étoiles par une prop de `LineEditor` ; tester
  la chaîne nettoyée (« 0 » est une valeur).
- P9 : les deux températures dans « Corriger la fiche » (une valeur posée ne
  se vide plus).
- P3 : le libellé seulement après Q112 (écran, récapitulatif, `VisitDetail`,
  carte de réception, message du serveur).
- Ne pas « remettre le champ » sur l'air (proposition abandonnée de la
  lecture de l'ancien logiciel).

Effort : P4 + P8 M (≈ 7 h), P3 S, P9 S. Migration : non.

### 4.3 Surface : la case texte (P6 ; Q114)

**Défaut construit** (lot 1) : puces 100 / 1000 cm² + nombre. **Rien de plus
avant Q114.** Si la case sert à « une autre aire », P7 la couvre déjà ; si
elle sert à « décrire la zone », colonne additive `Sample.surfaceAreaNote`
VARCHAR(191) et ses impressions (§2.1). Effort : S, M avec la colonne.

### 4.4 « Arrivé le » au dépôt (R5 ; Q118, avec Q68 et Q71)

**Jamais un renommage.** Le champ « Prélevé le » du dépôt écrit l'heure de
prélèvement (`Serie.startedAt`, `Sample.sampledAt`) : renommé, la
réceptionniste y taperait l'arrivée, le rapport l'imprimerait comme « Date et
heure du Prélèvement » et le délai C1 vaudrait ≈ 0 min (toujours conforme),
cachant les échantillons en retard.

**Défaut recommandé** : un vrai champ « Arrivé le » (arrivée au comptoir,
préremplie, modifiable) ; « Prélevé le (si connu) » gardé facultatif ; pour
un dépôt sans heure de prélèvement, C1 = simple avertissement sans
observation obligatoire ; sur le rapport, « Date et heure de réception » =
l'arrivée saisie.

**Conception** :
1. `DepositForm` : état `arrivedAt` prérempli (`toLabWallTime(now)`),
   `LabDateTimeInput` « Arrivé le » avec « Maintenant », obligatoire, envoyé
   `fromLocalInput(arrivedAt)` ; `futureFieldError("L'heure d'arrivée")` et
   `arrivalRefusal` contre l'heure de prélèvement quand elle est tapée ;
   utilisé par la checklist en direct à la place de `now` et dans le
   récapitulatif.
2. `validateSerie` : pour un dépôt sans `startedAt`, `startedAt = arrivedAt ??
   maintenant` (sinon une arrivée antérieure à l'enregistrement est refusée
   « L'arrivée au laboratoire précède le prélèvement. ») ; ancienneté de
   l'arrivée bornée (comme le prélèvement).
3. C1 d'un dépôt non déclaré selon Q118 (b) / Q71 ; heure de réception du
   rapport selon Q118 (c).
4. R6 est déjà construit (lot 1) : l'instant du comptoir n'est plus jamais
   affiché comme heure de prélèvement.
5. Tests : `serie-input`, `sample-timeline`, `reception-logic`,
   `reception-complementary` (C1 non déclaré), et le cas « arrivée tapée
   08:30, enregistrée 09:40, sans heure de prélèvement → 201, bon Heure
   08h30 ». C6 : `SerieQueue` n'est pas à modifier.

Effort : M (≈ 8 h). Migration : non.

### 4.5 Créer un client au comptoir et sur le terrain (R2, R3, R4 ; Q116, Q117)

Q87 est répondue sur le principe (oui, au comptoir et dans le rôle
préleveur) ; les détails sont Q116 et Q117.

**Défaut recommandé** : création seule ouverte à RECEPTIONNISTE et
PRELEVEUR ; raison sociale obligatoire, contact, téléphone, adresse, ICE
facultatifs ; le site où l'on se trouve ; **pas de destinataires des
rapports** saisis par ces rôles (le gestionnaire commercial les complète) ;
contrôle des quasi-doublons obligatoire ; signal « À compléter » pour le
commercial ; la fusion d'un doublon reste à l'administrateur.

**Conception** :
1. API : `POST /api/clients` et `GET /api/clients/similar` ouverts à
   RECEPTIONNISTE et PRELEVEUR **en création seule** (PATCH, fusion,
   rattachement inchangés) ; verrou du nom exact et 409 de quasi-doublon
   gardés ; `sites: [{ name, address, city, phone, contact }]` validés par
   `validateSite`, doublons de nom refusés, créés dans la même transaction ;
   `active` / `billingClientId` / `emails` ignorés pour ces rôles (selon
   Q116) ; journal CLIENT_CREATED `{ origin: "DEPOT" | "VISITE", sites: n }`
   + un SITE_CREATED par site.
2. **N1 — les noms archivés** : le premier essai le plus probable est un nom
   que la recherche ne trouvait pas, c'est-à-dire un des 345 clients-sites
   archivés. Nom exact d'un archivé avec `mergedIntoId` → 409 `{ mergedInto:
   { id, name }, siteId? }` et le message « Ce nom est maintenant un site de
   … : utiliser ce client et ce site » ; archivé sans parent → « Client
   archivé : demandez au gestionnaire de le réactiver ». La recherche par
   site (R10, lot 1) est faite avant, comme le demandait la relecture.
3. UI : `QuickClientDialog` (`src/components/clients/`) réutilisant les
   champs et la liste des clients proches de `ClientForm` ; bloc « Sites »
   répétable ; « Utiliser ce client » sur un quasi-doublon ; à la création,
   le client est choisi aussitôt (et son site s'il n'y en a qu'un).
   `ClientPicker` reçoit une option `allowCreate` (« + Nouveau client » sous
   la recherche et dans « Aucun client actif ne correspond »), jamais dans
   les sélecteurs de fusion, de rattachement ni de facturation. Préleveur :
   plein écran sur téléphone (≥ 44 px, clavier numérique).
4. R3 : sous-formulaire de site complet (nom\*, adresse, ville, contact,
   téléphone) dans `SitePicker` (lot 1 : le nom seul). Déjà fait au lot 1 :
   un site créé par le préleveur ou la réception est toujours actif
   (`createdSiteActive`).
5. R4 (selon Q117) : migration additive `Client.createdById` +
   `Client.toComplete`, filtre et badge « À compléter » sur `/commercial`.
6. Tests : validation du bloc sites, gardes de rôle (recep1 et pre1 → 201,
   TECHNICIEN → 403), un nom archivé fusionné créé depuis recep1 rend le
   parent et jamais un nouveau client.

Effort : R2 M (≈ 10 h), R3 S (≈ 3 h), R4 S (≈ 3 h). Migration : oui pour R4
seulement.

### 4.6 Dates seules en JJ/MM/AAAA (R8 ; Q119)

**Défaut** : les dates seules suivent la langue du navigateur ;
contournement immédiat : régler la langue du navigateur et le format
régional en français sur chaque poste et téléphone du laboratoire. Si Q119
le demande : `LabDateInput` « JJ/MM/AAAA » tiré de `wall-input.ts`, DLC
d'abord, puis les filtres (champ caché ISO). Effort : M. Migration : non.

### 4.7 Catégories et familles (RP1, RP2a–RP2d, RP4, RP5, RP6 ; Q120–Q126)

**Défaut recommandé** : catégorie = « Group famille » de l'ancien logiciel
(8 groupes) ; famille = famille de produits (`ProductType`) ; une catégorie
et un type d'analyse par famille, repris de l'ancien logiciel ; le
responsable des paramètres gère catégories, familles et critères dans son
espace ; écrans renommés « Famille de produits » ; choisir une famille coche
ses paramètres, et changer de famille remplace la liste (comme l'ancien
logiciel) ; filtre « Type d'analyse » préréglé, modifiable.

**Conception** :
1. **RP2a** — migration additive : `ProductTypeGroup` + `ProductType.groupId`
   / `natureId` (+ `description`) (§2.3).
2. **RP2b** — reprise : les 8 catégories, `groupId`, `natureId`, `family`
   depuis l'ancien logiciel, seulement dans les colonnes encore vides,
   journalisé ; **N2** dans la même reprise : les critères des familles des
   mains, surfaces, eaux et air rattachés aux paramètres de leur propre
   catégorie (créés avec l'unité du critère — UFC/mains pour les mains,
   OLD31). Mesure d'abord, en lecture, sur la copie locale (`qlab-local-db`),
   puis la reprise sur la copie locale, puis la production par l'exploitant.
   Les 252 familles sans catégorie restent « Sans catégorie », à classer à la
   main (Q121).
3. **RP2c / RP2d** — écrans sous `/programmation` (jamais `/admin`),
   composants réutilisés avec `basePath`, gardes élargies à PROGRAMMATEUR +
   ADMIN, TECHNICIEN exclu, test des gardes.
4. **RP1, RP5, RP6** — page « Familles & critères », dialogue « Choisir une
   famille », liste « Paramètres à rechercher » avec « Cocher tout » et
   remplacement au changement de famille. Tant que N2 n'est pas fait : ne
   proposer que les familles applicables à la catégorie de l'échantillon.
5. **RP4** — en dernier : les libellés, une fois les écrans en place.

Ordre : **RP2a → RP2b (+ N2) → RP2c / RP2d → RP1 / RP5 / RP6 → RP4.**
Effort : ≈ 52 h, 6 à 7 jours (RP2a S, RP2b M, RP2c M, RP2d M, RP1 M, RP5 M,
RP6 S, RP4 S). Migration : oui (RP2a, une).

### 4.8 Droits et natures (RP3b, RP7 ; Q127–Q129)

- **RP3b** — défaut recommandé : après la confirmation du programme, les
  analyses (paramètres, famille, n) ne se changent que par le responsable
  des paramètres et l'administrateur ; l'identification (lot, désignation,
  dates…) reste aux rôles actuels de « Corriger la fiche ». S, sans
  migration.
- **RP3 / C10** — si une même personne travaille à la paillasse et au
  programme : deux comptes (aucun code) ; un second rôle par compte serait
  une migration (M à L) ; un PROGRAMMATEUR autorisé à prendre des
  échantillons serait un changement de garde (S). Rien avant Q127.
- **RP7** — défaut recommandé : « Analyse sensorielle » proposée sur la fiche
  de programme d'un échantillon d'aliment ; « Analyse physique » abandonnée.
  S.

### 4.9 Ancien logiciel « si demandé » (Q130) et questions déjà ouvertes

Rien n'est construit pour OLD9, OLD12, OLD13, OLD21, OLD28, OLD33, OLD36,
OLD37, OLD44, OLD47, OLD50 avant la réponse à Q130 (≈ 27 h si tout était
demandé). OLD18, OLD22 et OLD30 attendent Q104 (d), (f), (h) et Q7 (≈ 14 h).

### 4.10 Ordre, dépendances, migrations, total

1. **Dès les réponses sur le travail quotidien** : R5 « Arrivé le » (Q118),
   les mains (Q109–Q111), les températures et la correction (Q112, Q113 —
   P4, P8, P9, puis P3). Mains et températures touchent les mêmes fichiers
   (`LineEditor`, `visit-types.ts`, `serie-input.ts`, `intake-input.ts`,
   `SampleVerbs`) : un seul constructeur, ou un ordre strict.
2. **Clients** : R2 → R3 → R4 (Q116, Q117).
3. **Catalogue** : RP2a → RP2b (+ N2) → RP2c / RP2d → RP1 / RP5 / RP6 → RP4
   (Q120–Q126).
4. **Au fil des réponses** : RP3b (Q128), RP7 (Q129), P6 (Q114), R8 (Q119),
   Q130, Q104.

Migrations du lot 2 (toutes additives, écrites à la main, vérifiées contre
`prisma migrate diff`) : enum `HandsState` (P5) ; `Sample.surfaceAreaNote`
(P6, si description) ; `Client.createdById` / `toComplete` (R4) ;
`ProductTypeGroup` + colonnes de `ProductType` (RP2a) ; celles de Q130 / Q104
si demandées. Un point de retour (tag + dump étiqueté) avant chaque
déploiement qui en porte une.

| Thème | Éléments | Effort |
|---|---|---|
| Mains | P1, P2, P5 | ≈ 11 h |
| Températures | P3, P4, P8, P9 | ≈ 12 h |
| Surface (case texte) | P6 | ≈ 3 h (6 h avec la colonne) |
| « Arrivé le » | R5 | ≈ 8 h |
| Clients | R2, R3, R4 | ≈ 16 h |
| Dates seules | R8 | ≈ 8 h |
| Catégories et familles | RP1, RP2a–RP2d, RP4, RP5, RP6 | ≈ 52 h |
| Droits et natures | RP3b, RP7 | ≈ 6 h |
| **Total du lot 2** | | **≈ 116 h, soit ≈ 15 jours** |
| Ancien logiciel, si tout est demandé | Q130 ; Q104 (d) (f) (h) | + ≈ 27 h ; + ≈ 14 h |

Pour mémoire, le lot 1 : ≈ 35 h.

## 5. L'ancien logiciel en résumé (OLD1–OLD50)

| Statut | Éléments | Raison |
|---|---|---|
| **Déjà fait** (23) | OLD1, 6, 7, 8, 10, 11, 15, 16, 17, 19, 24, 25, 26, 27, 34, 35, 38, 41, 42, 43, 46, 48, 49 | la fonction existe, souvent sous une autre forme (série au lieu de l'échantillon, mémoire du client, checklist de réception, prise en charge libre). OLD26 garde une petite dette (le lieu d'exécution est une constante du code) ; OLD16 attend le format de date (R8) ; OLD49 reçoit la nature avec OLD40 |
| **Couvert par une remarque** (7) | OLD2 → R5 ; OLD3 → R1, R10 ; OLD4 → RP7 ; OLD5 → RP5 ; OLD20 → P7, P6 ; OLD23 → P3, P4 ; OLD32 → RP6 | traité avec la remarque correspondante |
| **Lot 1** (2) | OLD29 (norme et unité), OLD40 (nature à la paillasse) | aucune réponse nécessaire |
| **Lot 2 avec le catalogue** (1) | OLD31 (paramètres des mains en UFC/mains) | lié à N2 (RP2b), Q126 |
| **Attend une question déjà ouverte** (3) | OLD18 (moyen de prélèvement, Q104 d), OLD22 (date d'analyse, Q104 f), OLD30 (accréditation, Q104 h et Q7) | la réponse décide du champ |
| **À faire si demandé** (10) | OLD12, 13, 21, 28, 33, 36, 37, 44, 47, 50 | absent ou partiel, jamais demandé par le laboratoire : petite addition chacun, posée en Q130 |
| **Hors périmètre** (4) | OLD9 « Échantillon témoin » (60 lignes sur 200 072 dans l'ancienne base, absent des formulaires papier et du périmètre signé ; posée quand même en Q130 a) ; OLD14 « Type de teste » (0 ligne) ; OLD39 (saisie un par un : remplacée exprès par le circuit série, validé par le laboratoire) ; OLD45 LQ / LD (0 ligne) | ni l'usage ni le périmètre ne le justifient |

## 6. Questions au laboratoire (Q109–Q130)

Une seule suite, reprise dans `NEEDEDINFO.md` (§1 et lot du 14/10 au §2).
« Défaut construit » = déjà dans le logiciel ; « défaut proposé » = ce que
l'on construira si le laboratoire ne dit pas autre chose.

| # | Élément | Question | Défaut |
|---|---|---|---|
| Q109 | P1, P2, P5 | « Surface : ajouter état des mains » et « Ajouter État de la surface\* (Aseptique / En cours de travail / Nettoyé) dans Mains du personnel » : nous les lisons comme une seule demande — sur « Mains du personnel », un état obligatoire avec ces trois choix (affiché « État des mains »), et rien de nouveau sur « Surface ». Est-ce bien cela, ou voulez-vous deux choix sur les mains (« Mains lavées / En cours de travail » plus les trois états), ou un « État des mains » sur une ligne Surface ? | Proposé : un seul état obligatoire à trois valeurs sur les mains ; « Mains non lavées » n'est plus proposé |
| Q110 | P2, P5 | Les échantillons de mains déjà enregistrés « Mains lavées » ou « Mains non lavées » gardent-ils ce libellé sur leurs documents, ou faut-il les convertir (par exemple « Mains lavées » → « Nettoyé », « Mains non lavées » → « En cours de travail ») ? | Proposé : ils gardent leur libellé ; aucune donnée réécrite |
| Q111 | P5 (Q2-MAINS) | L'état des mains doit-il figurer dans la désignation imprimée sur le rapport, l'étiquette et l'e-mail (« Mains — Chef cuisine — en cours de travail ») ? « Personne prélevée » est aujourd'hui obligatoire et imprimé : la fonction ou un repère (« Chef cuisine », « Employé 1 ») peut-il suffire ? (Q2, 2e partie — le nom des employés sur le rapport — reste ouverte.) | Proposé : l'état imprimé ; « Personne ou poste prélevé » obligatoire (nom ou fonction). Aujourd'hui : nom obligatoire et imprimé, état sur le protocole et le bon seulement |
| Q112 | P3 | « T° relevée (à remplacer le mot) » : quel libellé voulez-vous, sur tous les types de prélèvement — « T° relevée » partout (aujourd'hui « T° produit » sur aliment, eau et autre), « Température de prélèvement » (le mot de l'ancien logiciel), ou un autre ? Le protocole garde-t-il « T°p / T°a » et le rapport « Température du produit : Au prélèvement » ? La T° ambiante doit-elle figurer sur le rapport d'essai (aujourd'hui seulement sur le protocole) ? | Proposé : « T° relevée » à l'écran sur tous les types ; protocole et rapport inchangés ; T° ambiante non imprimée sur le rapport |
| Q113 | P4, P8 | T° relevée et T° ambiante obligatoires : sur la visite du préleveur, pour chaque échantillon ; pour l'air, la T° ambiante seule (vous aviez retiré la première température de l'air le 08/10) ; au comptoir, facultatives (le client ne les connaît souvent pas ; la « T° à l'arrivée » reste exigée par la règle (6)). Est-ce juste ? Faut-il un choix « Non mesurée » quand un thermomètre manque sur place ? | Proposé : comme décrit, sans « Non mesurée ». Lien : Q101 (T° à l'arrivée des mains) |
| Q114 | P6 | Les choix « 100 cm² » et « 1000 cm² » sont faits ; le champ garde toute autre aire en cm². La case texte à côté sert-elle à taper une autre aire (déjà possible), ou à décrire la zone en texte libre (« 10 × 10 cm », « surface totale ») ? Quel libellé, et faut-il l'imprimer sur le protocole et le rapport ? | Construit : puces 100 / 1000 cm² + nombre ; pas de case texte avant la réponse |
| Q115 | R1, R10 | Au « Nouveau dépôt », le site est maintenant toujours affiché sous le client (« Siège » par défaut, « + Nouveau site… »), et la recherche du client trouve aussi le nom d'un site — y compris un restaurant qui était un client à part dans l'ancien logiciel (il mène à son client, site choisi). Est-ce bien ce que demandait « Ajouter les sites au client (Afficher) » ? Faut-il afficher la ville ou l'adresse de chaque site dans la liste ? | Construit : le nom du site seul |
| Q116 | R2, R3 | Pour créer un client au comptoir ou sur le terrain : quels champs sont obligatoires — la raison sociale seule, ou aussi ICE, téléphone, adresse, e-mail ? La réception et le préleveur peuvent-ils saisir les adresses qui recevront les rapports (une faute de frappe enverrait un rapport à un tiers), ou le gestionnaire commercial les complète-t-il ensuite ? Le préleveur, sur son téléphone, crée-t-il le même client complet, ou la raison sociale, un contact, un téléphone et le site où il se trouve ? | Proposé : raison sociale obligatoire, le reste facultatif, le site sur place ; pas de destinataires des rapports saisis par ces rôles ; contrôle des doublons obligatoire ; un nom devenu site propose le client et son site |
| Q117 | R4 | Un client créé au comptoir ou sur le terrain doit-il être signalé « à compléter » au gestionnaire commercial (ICE, destinataires des rapports) ? Qui peut fusionner un doublon créé par erreur (aujourd'hui l'administrateur seul) ? | Proposé : signal « À compléter » sur la liste et la fiche, effacé quand le gestionnaire enregistre la fiche ; fusion à l'administrateur |
| Q118 | R5 | Nous ajoutons au dépôt un vrai champ « Arrivé le » (arrivée au comptoir, prérempli, modifiable) : renommer « Prélevé le » ferait imprimer l'heure d'arrivée comme heure de prélèvement. (a) Garde-t-on un champ facultatif « Prélevé le (si connu) », ou ne demande-t-on plus l'heure de prélèvement au comptoir ? (b) Sans heure de prélèvement, le contrôle C1 (délai) est « à vérifier » et oblige aujourd'hui à écrire une observation sur chaque échantillon accepté : pour un dépôt, en faire un simple avertissement ? (c) Sur le rapport, « Date et heure de réception » : l'arrivée saisie ou l'heure d'enregistrement au comptoir ? | Proposé : (a) gardé, facultatif ; (b) avertissement sans observation obligatoire ; (c) l'arrivée saisie. Complète Q68 et Q71 |
| Q119 | R8 | Les heures se saisissent maintenant en 24 h partout. Sur vos postes, les dates seules (DLC, date de production, filtres « Du / Au ») s'affichent-elles aussi à l'américaine (mois/jour/année) ? Faut-il les forcer en JJ/MM/AAAA partout ? | Construit : dates seules selon la langue du navigateur ; contournement : navigateur et format régional en français sur chaque poste |
| Q120 | RP4 | Ce que vous appelez « famille » (« Choix famille produits », ex. SALADES AVEC SOURCE PROTÉIQUE) s'appelle « Type de produit » dans le logiciel, où le mot « famille » désigne Microbiologie / Physico-chimie. Faut-il renommer partout « Type de produit » en « Famille de produits » (et Microbiologie / Physico-chimie en « Domaine ») ? | Proposé : oui, libellés seulement (la famille n'est jamais imprimée pour le client, réponse Q34) |
| Q121 | RP2a, RP2b | Par « catégorie », entendez-vous le « Group famille » de l'ancien logiciel (8 groupes : Lait et produits à base de lait, Viandes et produits dérivés, Produits de pêche et produits dérivés, Fruits légumes et dérivés, Produit traiteur et restaurant, Conserve semi conserve, Produit de pâtisserie, Autres) ? Une famille appartient-elle à une seule catégorie et à un seul type d'analyse ? Reprend-on de l'ancien logiciel la catégorie et le type d'analyse de chaque famille ? 252 des 634 familles de l'ancien logiciel n'ont pas de catégorie : les ranger dans « Autres », ou les classer à la main ? | Proposé : les 8 catégories ; une catégorie et un type d'analyse par famille ; reprise automatique ; les familles sans catégorie à classer à la main (filtre « Sans catégorie ») |
| Q122 | RP1 | « Afficher les critères par famille » : voulez-vous (a) un écran où le responsable des paramètres consulte, par catégorie puis par famille, les critères de chaque famille (germe, norme, n, c, m, M) ; (b) sur la fiche de programme, après le choix de la famille, la liste de ses paramètres à cocher comme dans l'ancien logiciel ; (c) autre chose ? Faut-il une version imprimable (PDF ou Excel) ? | Proposé : (a) et (b) ; pas de version imprimable |
| Q123 | RP6 | Quand on choisit une famille sur la fiche de programme, ses paramètres doivent-ils être tous cochés d'office (comme aujourd'hui) ou listés non cochés avec « Cocher tout » ? Dans l'ancien logiciel, changer de famille remplaçait la liste des paramètres ; le logiciel actuel ajoute sans jamais retirer. Voulez-vous le comportement de l'ancien logiciel (les germes de l'ancienne famille sont retirés, ceux cochés à la main restent) ? | Proposé : cochés d'office, « Cocher tout / Décocher tout » et compteur, remplacement au changement de famille |
| Q124 | RP5 | Dans le choix de la famille, le filtre « Type d'analyse » doit-il être imposé (seulement les familles du type d'analyse de l'échantillon) ou seulement préréglé et modifiable ? | Proposé : préréglé sur celui de l'échantillon, modifiable (« Tous ») |
| Q125 | RP2c, RP2d | Le responsable des paramètres gérera les catégories, les familles et leurs critères (m, M, n, c — aujourd'hui l'administrateur seul). Doit-il aussi gérer les paramètres d'analyse eux-mêmes (unités, limites, Microbiologie / Physico-chimie), les normes, les profils et les réglementations, aujourd'hui réservés à l'administrateur ? | Proposé : catégories, familles et critères (avec la réglementation proposée d'une famille) ; le reste à l'administrateur |
| Q126 | RP2b (N2), OLD31 | Les familles de l'ancien logiciel pour les mains, les surfaces, les eaux et l'air (ex. « Hygiène du personnel », en UFC/mains) doivent-elles être proposées et appliquées sur la fiche de programme de ces échantillons, avec leurs critères ? Aujourd'hui leurs critères sont rattachés aux analyses des aliments et ne s'appliquent pas, et le catalogue n'a aucune analyse des mains en UFC/mains. Peut-on reprendre de l'ancien logiciel les analyses des mains, leurs unités et leurs critères ? | Proposé : oui — critères rattachés aux analyses de la bonne catégorie lors de la reprise (copie locale d'abord) ; d'ici là, ces familles ne sont proposées que là où elles s'appliquent |
| Q127 | RP3 (C10) | Le technicien de paillasse ne peut déjà modifier ni les analyses d'un échantillon, ni son programme, ni le catalogue (paramètres, familles, critères) : il saisit seulement les résultats des analyses programmées, et un test le vérifie désormais. Est-ce bien la règle voulue, et non un droit qui manque ? Le responsable des paramètres travaille-t-il aussi à la paillasse ? Un compte n'a qu'un rôle : faut-il lui donner deux comptes ? | Construit : la règle telle quelle. Proposé : deux comptes pour une personne qui fait les deux |
| Q128 | RP3b | Une fois le programme confirmé, « Corriger la fiche » permet aujourd'hui à la réception, au validateur technique, à la Direction et à l'administrateur de changer les analyses, la famille ou le nombre d'unités — pas au responsable des paramètres. Faut-il réserver ce changement au responsable des paramètres et à l'administrateur ? | Proposé : oui pour les analyses ; l'identification (lot, désignation, dates…) reste aux rôles actuels |
| Q129 | RP7 | « Analyse sensorielle » (27 échantillons en 2025-26 dans l'ancien logiciel) : qui la choisit, et à quelle étape (réception, responsable des paramètres) ? Aujourd'hui aucun échantillon ne peut la recevoir. « Analyse physique » est-elle encore pratiquée ? | Proposé : « Analyse sensorielle » proposée sur la fiche de programme d'un échantillon d'aliment ; « Analyse physique » abandonnée |
| Q130 | OLD9, 12, 13, 21, 28, 33, 36, 37, 44, 47, 50 | Parmi ces fonctions de l'ancien logiciel, lesquelles vous manquent ? (a) la case « Échantillon témoin » ; (b) une référence client par échantillon, en plus de celle de la série ; (c) « Neutralisant » sur les surfaces et les mains (quelles valeurs, où l'imprimer) ; (d) « Diluant utilisé » dans un champ à part (aujourd'hui la note de méthode du programme) ; (e) « Paramètres demandés par le client » et la marque « DPC » sur le rapport ; (f) « Multi Duplication » (N copies d'un échantillon) ; (g) les boutons rapides « < », « 1e+1 »… de la saisie des résultats ; (h) le commentaire de la saisie des résultats — imprimé sur le rapport ou interne ? ; (i) la réception attribue-t-elle encore au comptoir un prélèvement fait par un préleveur Qualilab, ou ces prélèvements passent-ils tous par la visite sur le téléphone ? ; (j) passer à l'échantillon précédent / suivant sur la fiche de programme et la paillasse ; (k) un filtre « reçu depuis plus de N jours » à la paillasse | Construit : aucune ; chacune est une petite addition si vous la demandez |

Questions déjà ouvertes que ce lot touche (pas de nouveau numéro) : **Q2**
(2e partie : le nom des employés sur le rapport — la 1re partie est répondue
le 14/10 : 100 et 1000 cm²) ; **Q68** et **Q71** (heure de prélèvement au
comptoir, observation obligatoire) avec Q118 ; **Q101** (mains à la
réception) avec Q113 ; **Q104** (d), (f), (h) et **Q7** (OLD18, OLD22,
OLD30). **Q87** (créer un client au comptoir) est répondue sur le principe le
14/10 ; ses détails sont Q116 et Q117.

## 7. Dépôt public : la règle de ce lot

Le dépôt GitHub est public.

- Les captures d'écran de l'ancien logiciel et l'analyse complète du 14/10
  ne sont **jamais** ajoutées au dépôt : elles montrent des noms réels de
  clients, de sites, d'un membre du personnel du laboratoire, d'employés de
  clients (dans le texte « Produit » des mains), et des familles de produits
  nommées d'après des clients. L'analyse reste dans `backups/` (ignoré par
  git) ; `legacy-export/` reste ignoré.
- Aucun de ces noms dans le code, les tests, les fixtures, le seed, les
  documents ni les messages de commit. Utiliser « TEST UI … » pour les
  clients, « Personne Test » pour une personne, « Cuisine centrale » pour un
  site, et des familles génériques (« SALADES AVEC SOURCE PROTÉIQUE », les 8
  catégories). Les numéros d'échantillon des captures ne servent pas non plus
  de fixtures.
- Nettoyé dans ce lot : le nom d'une personne dans la désignation de mains
  d'un test (`src/lib/document-html.test.ts` → « Personne Test ») ; le nom
  d'un membre du personnel du laboratoire dans la même fixture (→ « Préleveur
  Test ») ; le nom d'un client dans une désignation de produit d'exemple
  (→ « Salade maison » : commentaire du modèle `ClientProduct` de
  `prisma/schema.prisma`, `src/lib/document-html.test.ts`,
  `src/lib/intake-input.test.ts`) ; le nom d'un client dans `WORKFLOW.md`
  §10 ; des noms dans TESTPLAN (L1, L1b, L4) et PROGRESS.
- L'historique git garde les noms déjà publiés : le réécrire est une
  décision du propriétaire.
- Vérifier chaque diff avant le commit (TESTPLAN V15-H).

## 8. Extrait d'un rapport réel (15/10) — préleveurs, dénomination, champs vides

Le 15/10, le laboratoire a envoyé « pour info ce qui s'écrit sur le rapport
concernant les préleveurs et dénomination » : une capture du bloc
« Prélèvement et réception » d'un rapport émis par l'ancien logiciel (produit,
site et numéros masqués ou non repris ici ; la capture n'est jamais ajoutée au
dépôt, §7). Comparaison ligne à ligne avec le rapport PG06/EN03 M du logiciel :

| Sur leur rapport | Notre rapport aujourd'hui | À faire |
|---|---|---|
| « Préleveur : Technicien de QUALILAB 'X.NOM' » — la fonction, le laboratoire, puis l'initiale du prénom et le nom entre apostrophes (même forme que dans les listes de personnes de l'ancien logiciel) | Le nom complet du préleveur (`reportSampler`, `src/lib/report-template.ts`) | Une « dénomination sur les documents » par compte, préremplie depuis le nom (« Technicien de QUALILAB 'K.BENALI' » pour « Karim Benali ») et modifiable dans /admin/utilisateurs ; `reportSampler` l'imprime pour un prélèvement Qualilab. Elle protège aussi le nom complet (initiale + nom). |
| « Moyen de prélèvement : N/A » | « — », rempli seulement pour l'air | « N/A » quand rien n'est renseigné (la légende du modèle dit déjà « N/A Non applicable »). |
| « Lieu de prélèvement : N/A », « Date Prod : N/A », « Date Exp : N/A » | « — » quand vide ; libellés « Lieu du prélèvement », « Dates Prod », « Dates Exp » | « N/A » pour tout champ vide du bloc ; leurs libellés exacts « Lieu de prélèvement », « Date Prod », « Date Exp ». |
| « 25/08/2026 10:40 » | « 25/08/2026 à 10h40 » (`reportDateTime`) | Leur format « JJ/MM/AAAA HH:MM ». |
| « Date d'analyse : 26/08/2026 » — une seule date | « du … au … » quand les analyses durent plusieurs jours (`analysisPeriodText`) | Une seule date : le début des analyses (confirmation du programme, sinon la réception). |
| « Date et heure de réception : 25/08/2026 16:05 » — l'arrivée réelle, environ 5 h après le prélèvement | L'heure d'enregistrement de l'écran de réception (`Sample.receivedAt`) | Imprimer l'heure d'arrivée saisie (`Serie.arrivedAt`) — confirme la proposition de Q118. |
| « Température du produit : Au prélèvement / à la réception » et « Température glacière à la réception » ; pas de température ambiante | Identique | Rien. Confirme que la T° ambiante reste hors du rapport (Q112). |
| Lot dans « Données fournies par le client (IC) », Lieu d'exécution, Référence prélèvement | Identique | Rien. |

**Ce que cela règle** : Q22 (1re partie, la fonction imprimée : « Technicien
de QUALILAB » et la dénomination de la personne) ; Q104 (d) pour le cas vide
(« N/A ») — la liste des moyens par type reste à demander ; Q104 (f) (une
seule date d'analyse) ; un appui à la proposition de Q118 (l'heure d'arrivée
saisie sur le rapport) et à celle de Q112 (T° ambiante hors du rapport).

**Lot 1b — « rapport aligné »** : ne demande aucune réponse ; **décision du
15/10 : construit avec le lot 2**, après les réponses du laboratoire.
- Migration additive : `User.documentName VARCHAR(191) NULL` (la
  dénomination), remplie à la volée par défaut, jamais réécrite.
- `src/lib/report-template.ts` : `reportSampler` (dénomination),
  `reportDateTime` (« JJ/MM/AAAA HH:MM »), `analysisPeriodText` (une date) ;
  `src/lib/report-html.ts` : « N/A » pour les vides du bloc, libellés
  « Lieu de prélèvement », « Date Prod », « Date Exp » ; la réception
  imprime `Serie.arrivedAt` (avec R5 / Q118).
- /admin/utilisateurs : le champ « Dénomination sur les documents » ; aide
  pure et testée qui propose « Technicien de QUALILAB 'I.NOM' » à partir du
  nom (prénoms composés, particules, accents).
- Les rapports déjà émis gardent leur version figée (`ReportVersion`) ; un
  duplicata d'un ancien rapport ne change pas.
- Tests : `report-template.test.ts`, `report-html.test.ts` (dont la tenue sur
  deux pages, `report-onepage.test.ts`), l'aide de dénomination. TESTPLAN :
  un rapport de test comparé à la capture.
- Effort : environ une demi-journée.
