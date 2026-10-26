# PROGRAMME.md — le responsable des paramètres et le programme d'analyse

> Spécification de la tranche demandée le 05/10/2026 (`RETOUR-LABO-05-10.md`
> §5). Un nouveau rôle décide, pour chaque échantillon réceptionné, de tout
> ce qui sera fait dessus avant la paillasse ; la facturation peut être
> préparée dès que ce programme est confirmé. Tout ce qui existe est
> conservé ; les ajouts sont additifs (migration sans perte).
>
> **13/10/2026 — plus d'affectation.** Personne n'attribue plus de
> technicien : un programme confirmé rejoint la liste partagée « À prendre »,
> et le technicien qui prend l'échantillon en charge est le seul à le saisir
> (§10). Point de retour : tag `v1.2-avant-sans-affectation` (`DEPLOY.md`).
>
> **16/10/2026 — réponses du laboratoire** (`RETOUR-LABO-16-10.md` ;
> F1, F3–F7 et F9 construits en local le 19/10, vague 4, non déployés) :
> pas de catégories (Q121) ; le responsable des
> paramètres gère familles et critères sous /programmation (F4) ; changer de
> famille remplace la liste (F6, §4) ; après le
> programme, les analyses se changeront par lui et l'administrateur (F8) ;
> « Reprendre » l'échantillon d'un collègue est dans la relance (C3, §10).
> Vocabulaire des écrans (Q120, F7) : « Famille de produits » (« Familles
> du client ») remplace « Type de produit », et « Domaine » désigne
> Microbiologie / Physico-chimie / Autre ; les identifiants (`ProductType`,
> `Family`, `/admin/types-produits`) ne changent pas, et la famille n'est
> jamais imprimée (Q34). Ce document suit ce vocabulaire depuis le 19/10.
>
> **14/10/2026 — remarques du laboratoire** (`RETOUR-LABO-14-10.md`).
> Vocabulaire : le laboratoire appelle « famille » ce que ce document et
> l'écran appellent « type de produit » (`ProductType`), et « catégorie »
> l'ancien « Group famille » ; ici « famille » désigne encore Microbiologie /
> Physico-chimie — voir `RETOUR-LABO-14-10.md` §1, et §4.7 pour les
> catégories et la gestion des familles par le responsable des paramètres
> (lot 2, en attente de Q120–Q126). Droits (§2, RP3) : le technicien de
> paillasse ne modifie ni les analyses d'un échantillon, ni son programme,
> ni le catalogue (paramètres, familles, critères) ; il saisit les résultats
> des analyses programmées, les soumet, prend les échantillons en charge et
> relève les températures — fixé par `src/lib/technician-guards.test.ts`.
> Depuis le lot 1 du 14/10 (à vérifier), il ne lit plus `GET
> /api/samples/[id]/programme` (403, RP3c) : cela remplace « TECHNICIEN en
> lecture » au §5.

## 1. Le circuit

```
PRELEVE ──réception──▶ RECU ──programme confirmé──▶ PROGRAMME ──saisie──▶ EN_ANALYSE
      ──▶ RESULTATS_SAISIS ──validation technique──▶ VALIDE ──approbation──▶ RAPPORT_ENVOYE
```

- **RECU** : la réception a numéroté, mesuré et accepté la ligne. La
  réception n'attribue aucun technicien (depuis le 08/10) ; depuis le 13/10
  personne n'en attribue : le technicien prend lui-même l'échantillon en
  charge (§10).
- **PROGRAMME** (nouveau) : le responsable des paramètres a confirmé le
  programme d'analyse. Seule une ligne PROGRAMME peut être ouverte à la
  paillasse ; elle attend dans « À prendre » jusqu'à sa prise en charge
  (§10). Le programme reste modifiable tant que la ligne est PROGRAMME, même
  prise en charge. Ensuite (16/10, Q128 — `RETOUR-LABO-16-10.md` F8), les
  analyses — leur liste, la famille de produits, le nombre d'unités — se
  changent par « Corriger les analyses » (motif, journal) : le responsable
  des paramètres à EN_ANALYSE et RESULTATS_SAISIS, l'administrateur
  toujours ; l'identification de l'échantillon, par « Corriger la fiche »
  (réception, validation, Direction, administrateur —
  `FICHE_CORRECTION_ROLES`).
- Transitions (`src/lib/sample-status.ts`) : `RECU → PROGRAMME`
  (PROGRAMMATEUR, ADMIN) ; `PROGRAMME → EN_ANALYSE` (TECHNICIEN, ADMIN — à
  la première saisie avec contenu, jamais à la prise en charge, §10) ;
  `RECU → EN_ANALYSE` **supprimée** ; `PROGRAMME / EN_ANALYSE /
  RESULTATS_SAISIS → ANNULE` (VALIDATEUR, DIRECTION, ADMIN depuis le 16/10,
  Q13 — `ANALYSIS_CANCEL_ROLES` ; la réception n'annule plus une ligne
  programmée, elle annule à PRELEVE et RECU avec l'administrateur) ;
  `ANNULE → PROGRAMME` (ADMIN, motif) quand la ligne avait été programmée
  (`programmedAt` non nul), sinon `ANNULE → RECU` comme aujourd'hui.
- Une ligne détruite à la réception (`DETRUIT_A_RECEPTION`) ne passe jamais
  par la programmation.
- Le dépôt au comptoir suit le même chemin : la réception saisit les
  analyses demandées par le client (proposition), le responsable confirme.

## 2. Le rôle

- `Role.PROGRAMMATEUR`, libellé « Responsable des paramètres », espace
  `/programmation`, redirection de connexion vers `/programmation`.
- Droits : tout ce que voit un technicien (lecture des échantillons, feuille
  de paillasse, recherche avec export) + le programme + **les familles de
  produits et leurs critères** (16/10, Q122 / Q125 — `RETOUR-LABO-16-10.md`
  F4 : créer, renommer, classer par type d'analyse, rattacher à un client,
  désactiver une famille, choisir sa réglementation proposée, enregistrer sa
  grille de critères) ; pas d'approbation, pas de validation. Le reste de la
  configuration — paramètres, normes, profils, liste des réglementations,
  `/admin/*` — reste à l'administrateur (`programmation-guards.test.ts`).
- L'ADMIN peut tout faire à sa place (remplaçant en cas d'absence).
- Compte de démonstration `param1` — « Rachid Alaoui » (seed + panneau de
  connexion + `scripts/disable-demo-accounts.sh` si la liste y est codée).
- Menu (`src/components/layout/programmation-nav.ts`) : Tableau de bord
  `/programmation`, À programmer `/programmation#file`, Recherche des
  analyses `/recherche`, Catalogue › Familles & critères
  `/programmation/familles` (la liste et la grille de l'administrateur,
  `/admin/types-produits`, dans son espace), Documents › Feuille de
  paillasse `/api/bench-sheet`.

## 3. Le modèle (migration `prisma/migrations/20261006100000_programme`)

Écrite à la main, additive, rejouable (`prisma migrate deploy`).

```prisma
enum Role { … PROGRAMMATEUR }
enum SampleStatus { PRELEVE RECU PROGRAMME EN_ANALYSE RESULTATS_SAISIS VALIDE RAPPORT_ENVOYE ANNULE }
enum ProgrammePriority { NORMALE URGENTE }

model Sample {
  …
  technicianId    String?   // (existant) le technicien qui a pris l'échantillon en charge (§10, 13/10) ; avant le 13/10, celui qui lui était attribué
  assignedAt      DateTime? // (existant) heure de la prise en charge (avant le 13/10 : de l'attribution)
  programmedAt    DateTime?
  programmedById  String?
  programmedBy    User?     @relation("ProgrammedSamples", fields: [programmedById], references: [id], onDelete: SetNull)
  priority        ProgrammePriority @default(NORMALE)
  dueAt           DateTime?           // délai de rendu promis
  testPortion     String?   @db.VarChar(60)   // prise d'essai (« 25 g », « 100 mL »)
  programmeNote   String?   @db.Text          // consignes de préparation / conservation
}

model SampleParameter {
  sampleId, parameterId (inchangés)
  technicianId   String?   // hérité — plus écrit par le programme depuis le 13/10 ; lu pour les lignes programmées avant (un paramètre confié à un autre technicien reste le sien) ; null = le titulaire de l'échantillon
  technician     User?     @relation("ParameterTechnician", fields: [technicianId], references: [id], onDelete: SetNull)
  normVersionId  String?   // version de norme retenue pour ce paramètre
  normVersion    NormVersion? @relation(fields: [normVersionId], references: [id], onDelete: SetNull)
  dilutionFactor Decimal?  @db.Decimal(12, 4)  // facteur propre à cet échantillon (remplace calcFactor du paramètre)
  note           String?   @db.VarChar(191)
}
```

MySQL : `ALTER TABLE Sample MODIFY status ENUM('PRELEVE','RECU','PROGRAMME','EN_ANALYSE','RESULTATS_SAISIS','VALIDE','RAPPORT_ENVOYE','ANNULE') NOT NULL DEFAULT 'PRELEVE'` (ajout de valeur, sans perte) ; même chose pour `User.role`. Index sur `Sample(status, programmedAt)` et `SampleParameter(technicianId)`.

Prise en charge libre (13/10, §10) : **aucune migration**. `Sample.technicianId`
et `assignedAt` existaient déjà, avec leurs index `Sample(technicianId)` et
`Sample(technicianId, status)` ; `SampleParameter.technicianId` et son index
restent pour les lignes héritées.

Le nombre d'unités reste `Sample.unitCount` (fait de terrain) : le
responsable peut l'abaisser ou le relever ; s'il est inférieur au n de la famille de produits,
la paillasse lit en indicatif comme aujourd'hui, et la fiche l'affiche
en avertissement avant confirmation.

## 4. La fiche de programme (`/programmation/[sampleId]`)

En-tête : N° de contrôle, série, client, désignation, lieu, nature, kind,
réception (date, T°, quantité, conformité), unités prélevées, statut.

Sections, dans l'ordre :

1. **Nature, famille de produits et paramètres à rechercher** (16/10,
   Q123 / Q124 / Q40 — `RETOUR-LABO-16-10.md` F5, F6). La nature d'analyse
   (même domaine Micro / PC, Q49 ; depuis le 16/10, Q129 — F9, aussi les
   natures « Autres analyses » du même type d'échantillon, comme
   « Analyse sensorielle » d'un aliment, et le retour au domaine de la
   lettre du code « …M » / « …P » ; un échantillon seul (code sans
   lettre) ne retourne qu'au domaine d'où il est venu, lu dans le journal
   (`natureHomeFromJournal`) — MICRO → sensorielle → CHIMIE en deux
   enregistrements contournerait Q49 et les contrôles de réception faits
   pour son domaine ; l'un ou l'autre seulement quand le journal n'en dit
   rien ; le code et le N° de contrôle ne changent jamais —
   `programmeNatureFamilies`), puis la famille de produits
   (`ProductType`), choisie dans le dialogue partagé « Choisir une famille
   de produits » (`FamilyPickerDialog.tsx`, à la place du select) :
   - filtre « Type d'analyse » (`ProductType.natureId` — le mot du
     laboratoire pour les familles, Q124 ; c'est la « Nature d'analyse » de
     la fiche, et le dialogue le dit : « la nature d'analyse de
     l'échantillon (son type d'analyse) », option « — nature de
     l'échantillon ») préréglé sur la nature à l'écran, modifiable, « Tous
     les types d'analyse » possible ;
     pour une nature alimentaire, les familles encore « à préciser » (sans
     type d'analyse) sont listées aussi ; chaque type d'analyse dit son
     nombre de familles (`referential.familyNatures`) ;
   - recherche sur le nom sans accents ni casse (`matchesQuery`) ; les
     familles du client en tête, puis le catalogue commun (groupes nommés
     pour les lecteurs d'écran), chacune avec son nombre de critères — un
     par germe, la version en vigueur, comme l'aperçu ; la famille actuelle
     reste à portée hors filtre ;
   - la famille sélectionnée s'affiche en aperçu (germe · norme · unité ·
     n / c / m / M) **sans toucher au brouillon** ; « Choisir » (ou Entrée
     sur une famille, ou un double-clic) l'applique ; « Fermer », Échap ou
     un clic à côté ne changent rien ; « Aucune famille » en tête de liste ;
   - clavier : la recherche a le focus (sur téléphone, le titre — le
     clavier virtuel couvrirait la liste) ; **Entrée dans la recherche
     sélectionne la première famille trouvée et y met le focus, sans
     choisir** — une seconde Entrée choisit ; Tab reste dans le dialogue
     (Maj+Tab atteint le filtre), une seule tabulation pour la liste
     (flèches), le focus revient au bouton « Choisir une famille… » /
     « Changer de famille… ». Sur téléphone le formulaire est le seul
     ascenseur.
   Pures et testées : `familyFilterFor`, `filterFamilies`. Le serveur
   accepte toujours toute famille active du catalogue ou du client.

   La famille choisie devient la liste **« Paramètres à rechercher »** :
   germe · norme (celle du critère, sinon la version en vigueur du
   paramètre) · **unité du critère** (« /1g » quand la famille le dit,
   Q40 ; sinon celle du paramètre) · n / c / m / M, **cochés d'office** ;
   « Cocher tout » et « Décocher tout » ne touchent que les germes de la
   famille ; « N paramètre(s) coché(s) sur M ». Un critère posé sur un
   paramètre d'une autre catégorie que la nature est affiché, pas cochable.

   **Changer de famille remplace sa liste** (Q123 ; jusqu'au 16/10 le
   choix était additif) : les germes venus seulement de l'ancienne famille
   quittent les analyses, ceux de la nouvelle sont cochés avec la version de
   norme de leur critère, et le message de la fiche — en section 1, sous la
   famille, région vivante, ambre quand une analyse part ou que n baisse —
   nomme les analyses retirées et le changement de n (« n : 9 → 3 »).
   Restent : les germes communs aux deux familles, les analyses
   cochées ou décochées à la main sur la fiche (un profil choisi compte), et
   celles que la ligne portait à l'ouverture sans être des germes de sa
   famille enregistrée — les demandes du préleveur (`manualIds`, mémoire de
   la fiche, jamais envoyé). n est recalculé depuis la nouvelle famille (le
   plus grand n de ses critères), jamais sous celui d'un profil choisi sur
   la fiche. « Aucune famille » — et une famille sans critère — retire de
   même les germes de l'ancienne et laisse n tel quel (rien à lire). Rien
   n'est écrit avant l'enregistrement du programme. Pures et testées :
   `applyProductType`, `checkAllOfType`, `uncheckAllOfType`,
   `familyCheckCount`, `familyParameterRows`, `criterionUnit`,
   `familyChangeNotice`, `familyChangeTookAway` (`programme-sheet-logic.test.ts`).

   Ailleurs, rien ne change de comportement : `LineEditor` / `DepositForm`
   (dépôt au comptoir) ajoutent toujours les germes de la famille choisie,
   et « Corriger la fiche » (`SampleVerbs`) choisit la famille sans toucher
   aux analyses ; ces trois sélecteurs ne proposent plus que les familles
   alimentaires (`GET /api/product-types?category=ALIMENTAIRE` : type
   d'analyse alimentaire ou encore « à préciser ») — ils ne s'affichent que
   sur les lignes d'aliment.
2. **Analyses** — puces de profils (`/api/profiles?clientId&natureId`) et
   cases par paramètre de la catégorie de la nature ; au moins une analyse
   pour confirmer. Les analyses cochées par le préleveur sont pré-cochées.
   Avec une famille, les germes de la famille se cochent en section 1 et les
   autres analyses sont rangées sous « Analyses hors famille », repliable
   (ouvert d'office quand l'une d'elles est cochée, par exemple une demande
   du préleveur, et qui reste ouvert dès qu'on y coche ou décoche une case —
   le panneau ne se referme jamais sous le curseur). « Autres analyses »
   reste le nom du domaine AUTRE (l'analyse sensorielle).
3. **Nombres** — unités à lire (`unitCount`, puces 1 / 3 / 5 / 9 + champ,
   avertissement si < n de la famille), prise d'essai (`testPortion`), facteur de
   dilution par paramètre (`dilutionFactor`, facultatif, « ×10 »).
4. **Méthodes** — par paramètre : version de norme (liste des versions du
   paramètre, celle en vigueur par défaut, celle du critère de la famille
   si une famille est choisie), note de méthode (`note`).
5. **Organisation** — priorité (Normale / Urgente), délai de rendu
   (`dueAt`, pas dans le passé), consignes (`programmeNote`). Aucun
   technicien ni charge de travail depuis le 13/10 : la ligne confirmée
   rejoint « À prendre » (§10). (Avant le 13/10 : technicien par défaut et
   par paramètre, raccourcis « tous à X », « micro à X, chimie à Y ».)
6. **Vérification d'entrée** — rappel des règles de recevabilité
   (`reception-rules.ts`) recalculées avec les analyses programmées
   (quantité suffisante pour n, histamine → 9 unités, eau → 1 L / 2 L…) :
   avertissements, jamais bloquants ici (la réception a déjà accepté) ; les
   verbes de cette personne dessous (« Corriger les analyses » du
   responsable des paramètres à la paillasse, « Corriger la fiche » /
   « Annuler » selon le rôle), la phrase qui les annonce ne nommant que
   ceux-là (`programmeVerbsLead`) ; une note dit à qui revient le reste :
   l'identification, et l'annulation selon l'étape (`programmeVerbsNote`,
   `cancellersLabel` — la réception et l'administrateur avant le programme,
   la validation, la Direction et l'administrateur ensuite).
7. **Facturation** — pour l'administrateur seulement depuis le 25/10 (règle
   du propriétaire : le responsable des paramètres ne voit aucun prix ni
   aucune facture — `seesBilling`, `src/lib/price-access.ts`, HANDOFF §3) :
   lignes qui seront proposées au comptable, chaque analyse programmée avec
   son prix du catalogue (`LabService` apparié par nom de paramètre comme le
   fait `/api/clients/[id]/billable`), « prix à saisir » sinon ; note pour le
   comptable (dans `programmeNote`). Pour le responsable des paramètres la
   section n'est pas rendue et son référentiel ne porte aucun prix ; un
   échantillon déjà facturé lui est signalé sans numéro de facture
   (« Échantillon déjà facturé : un changement d'analyses est à signaler à
   la comptabilité. »).

Pied : « Enregistrer le brouillon » (sans changer de statut) et
« Confirmer le programme » (→ PROGRAMME, `programmedAt`, `programmedById`,
journal `SAMPLE_PROGRAMMED` avec avant/après). Une ligne déjà PROGRAMME
affiche « Programme confirmé le … par … » et le bouton « Enregistrer les
modifications » (journal `SAMPLE_PROGRAMME_UPDATED`). Une ligne EN_ANALYSE
ou au-delà : fiche en lecture seule ; la raison affichée nomme le verbe de
cette personne (« Corriger les analyses » pour le responsable des
paramètres, « Corriger la fiche » pour l'administrateur), ou à qui
s'adresser (`programmeReadOnlyReason`). /recherche ouvre la fiche de
programme d'un échantillon depuis son N° pour le responsable des
paramètres (`sampleLinkFor`) : le chemin vers un échantillon programmé un
autre jour et déjà à la paillasse.

## 5. API

- `GET /api/samples/[id]/programme` (PROGRAMMATEUR, ADMIN ; refusé au
  technicien depuis le 14/10 : 403, RP3c) : l'échantillon, son programme courant, et le référentiel utile
  (familles de produits du client + catalogue avec leurs critères actifs,
  chacune avec `natureId` (son type d'analyse, null = « à préciser ») et
  `criteriaCount` (un par germe) ; `familyNatures` — les types d'analyse du
  filtre du dialogue ; `natureHome` — pour un échantillon seul sur « Autres
  analyses », le domaine où il peut revenir ; paramètres de la catégorie,
  profils, versions de norme par paramètre, prix du catalogue par
  paramètre — pour l'administrateur seulement depuis le 25/10 : `prices`
  est vide pour le responsable des paramètres, `loadProgrammeReferential(…,
  { withPrices: seesBilling(role) })`). Depuis le 13/10, ni la liste des
  techniciens ni leur charge.
- `GET /api/product-types?natureId=&category=&clientId=&all=1` : les
  familles de produits (`productTypeListWhere`, testé) — `natureId` garde un
  type d'analyse ; `category` garde les familles de cette catégorie **et
  celles encore « à préciser »** ; `all=1` (PROGRAMMATEUR, ADMIN) ajoute les
  inactives et celles de tous les clients ; 400 « Catégorie d'analyse
  invalide. » pour une catégorie inconnue ; 400 familles au plus.
- `PUT /api/samples/[id]/programme` (PROGRAMMATEUR, ADMIN) — corps validé par
  `src/lib/programme-input.ts` (`validateProgramme`) :
  `{ confirm: boolean, natureId?: string, productTypeId: string|null,
     parameterIds: string[], unitCount: number, testPortion: string|null,
     priority: "NORMALE"|"URGENTE", dueAt: string|null, programmeNote: string|null,
     parameters: [{ parameterId, normVersionId: string|null,
                    dilutionFactor: number|null, note: string|null }] }`
  Règles : statut RECU ou PROGRAMME sinon 409 (une ligne PROGRAMME déjà prise
  en charge reste modifiable jusqu'à EN_ANALYSE) ; `parameterIds` ≥ 1 pour
  confirmer (un brouillon peut être vide) ; type actif et visible pour ce
  client ; unités 1 … `MAX_UNITS` ; `dueAt` ≥ maintenant − 5 min ; versions
  de norme appartenant au paramètre ; `dilutionFactor` > 0. Un `technicianId`
  envoyé par une page ouverte avant le 13/10 (par défaut ou par analyse) est
  **ignoré, jamais refusé** — comme à la réception depuis le 08/10. Les
  `SampleParameter` sont remplacés en bloc sous le verrou de la ligne
  `Sample` (aucun résultat saisi avant EN_ANALYSE : la première saisie avec
  contenu fait passer la ligne EN_ANALYSE dans sa transaction) ; une
  analyse conservée garde son technicien hérité (ligne programmée avant le
  13/10). Le programme ne touche **ni `Sample.technicianId` ni
  `assignedAt`**. Réponse : l'échantillon à jour.
- `POST /api/samples/[id]/take` (TECHNICIEN) — « Prendre en charge » (§10) :
  200 `{ id, technicianId, assignedAt, technician: { name }, already }`
  (`already: true` = il était déjà à moi, un double clic) ; 409 « Déjà pris
  par X. », 409 hors paillasse ou bloqué en réception ; 404. Journal
  `SAMPLE_TAKEN` (`implicit: false`).
- `DELETE /api/samples/[id]/take` (TECHNICIEN titulaire, ADMIN) —
  « Libérer » (§10) : 200 `{ id, technicianId: null, assignedAt: null }` ;
  403 pour un autre que le titulaire ; 409 quand personne ne le tient, qu'il
  a quitté la paillasse ou qu'un résultat est saisi. Journal
  `SAMPLE_UNTAKEN`. Rien à voir avec le « Libérer » de « Bloqués »
  (`POST /api/samples/[id]/release`, `SAMPLE_RELEASED`).
- `PUT /api/samples/[id]/results` répond `{ status, saved, taken, verdicts }` :
  `taken: true` quand cette saisie a pris l'échantillon (prise implicite,
  §10).
- `GET /api/programmation/queue` (PROGRAMMATEUR, ADMIN) : lignes RECU et
  PROGRAMME non annulées, groupées par série (client, N° de série, lignes
  avec N° de contrôle, désignation, nature, unités, priorité, dueAt,
  programmedAt), les RECU d'abord, les plus anciennes réceptions en tête.

## 6. Ce qui s'adapte

- **Réception** (`reception-input.ts`, `SerieReceptionForm`, `DepositForm`) :
  aucun technicien (08/10 : les sélecteurs ont quitté la réception et le
  dépôt ; un `technicianId` envoyé par une ancienne page est ignoré).
- **Paillasse** (réécrite le 13/10, §10) : `/technicien` montre « À
  prendre » (toutes les lignes à la paillasse que personne ne tient, les
  urgentes puis les plus anciennes en tête), mes échantillons (« À
  commencer », « En analyse », « Anomalies », « Résultats soumis »), et ceux
  des collègues en lecture seule (« Pris par un collègue », nom et heure).
  Seul le titulaire saisit (403 sinon) ; une première saisie avec contenu
  sur un échantillon libre le prend en charge. Une ligne RECU ouverte par
  URL montre « En attente de programmation » (sans champs). Les règles sont
  les fonctions pures testées de `src/lib/bench-access.ts` :
  `canEnterParameter` (échantillon libre, ou paramètre à moi),
  `canEditParameter` (règle des lignes héritées réparties par paramètre),
  `isUnclaimed`, `isHeldByOther`. `loadAssignedSample`
  (`src/lib/sample-access.ts`) refuse un échantillon tenu par un collègue
  (403 « Cet échantillon est pris en charge par X : vous ne pouvez pas y
  saisir de résultats. ») ; `PUT …/results` relit le titulaire sous le
  verrou de la ligne ; `POST …/results/submit` exige un titulaire et tous
  les paramètres TERMINE quel qu'en soit le technicien (lignes héritées :
  « il reste N paramètres à d'autres techniciens »). `/api/samples` et la
  recherche d'un technicien : les échantillons qu'il tient
  (`benchWhereFor`) ; pas d'export pour le technicien. Feuille de paillasse (`/api/bench-sheet`) d'un
  technicien : ce qu'il tient (§10). La dilution programmée
  (`dilutionFactor`) remplace `calcFactor` du paramètre quand elle est
  présente (bench, results, report).
- **Rapport** : `ReportData.technicianName` = le titulaire, plus les
  techniciens hérités par paramètre (`reportTechnicianNames`,
  `src/lib/report-programme.ts`) ; le modèle PG06/EN03 M du 13/10 ne
  l'imprime pas (« Analyses réalisées par » retiré, Q104 (c)) — la validation
  l'affiche sous « Analysé par ». Colonne « Méthode » : la version de norme
  programmée si présente, sinon celle du critère, sinon celle du paramètre.
- **Facturation** : `/api/clients/[id]/billable` prend les statuts
  PROGRAMME, EN_ANALYSE, RESULTATS_SAISIS, VALIDE, RAPPORT_ENVOYE (jamais
  ANNULE) ; la fiche facture et la fiche client affichent un bandeau
  « Facturé avant résultat » tant que la ligne n'est pas VALIDE, et
  « Échantillon annulé après facturation » si elle l'est (nouveau cas à
  traiter par le comptable : avoir ou facture rouverte).
- **Recherche, tableaux de bord, badges** : `SAMPLE_STATUS_LABELS.PROGRAMME =
  "Programmé"`, couleur propre dans `StatusBadge`, « en cours » inclut
  PROGRAMME ; le tableau de bord admin compte « Programmé » ; la réception
  affiche « À programmer » (RECU) au lieu de « En analyse » seul ; la
  validation ne change pas.
- **Administration** : rôle assignable (`ASSIGNABLE_ROLES`), libellés,
  `nav-for-role.ts`, `roles.ts` (chemin `/programmation`), gardes
  `requireRole` / `requireApiRole`, `DemoAccounts`, seed, journal :
  `SAMPLE_PROGRAMMED` → « Programme d'analyse confirmé »,
  `SAMPLE_PROGRAMME_UPDATED` → « Programme d'analyse modifié » ; depuis le
  13/10 `SAMPLE_TAKEN` → « Échantillon pris en charge », `SAMPLE_UNTAKEN` →
  « Échantillon remis dans « À prendre » » (§10).

## 7. Hors périmètre (à confirmer plus tard)

Numérotation (reste à la réception), avoir / annulation d'une facture,
facturation au forfait, notification au technicien (e-mail), planning.

## 8. Recette (TESTPLAN T)

- Réception sans technicien → ligne RECU dans la file de programmation ;
  paillasse : la ligne n'apparaît pas et son URL affiche « En attente de
  programmation ».
- Programme : famille de produits avec critères, profil, unités < n (avertissement),
  prise d'essai, dilution ×10 sur un germe, versions de norme, micro à tech1
  et chimie à tech2, urgente, délai, consignes ; brouillon puis confirmation ;
  journal avant/après ; modification après confirmation.
- Paillasse : tech1 voit la ligne et seulement ses paramètres (ceux de
  tech2 en lecture) ; saisie refusée sur un paramètre d'autrui (403) ;
  soumission refusée tant que tech2 n'a pas terminé ; la dilution ×10
  transforme la lecture ; feuille de paillasse par technicien.
- Facturation : la ligne PROGRAMME est proposée au comptable aux prix du
  catalogue ; facture créée ; bandeau « Facturé avant résultat ». param1 ne
  voit ni la section 7 ni aucun prix (fiche et `GET …/programme`), ni le
  numéro de la facture (pied de fiche, « Corriger les analyses ») — l'admin
  les voit (25/10).
- Rapport : deux techniciens imprimés, méthode programmée.
- Rôles : param1 n'approuve pas, ne valide pas, n'accède pas à /admin ;
  l'admin programme à sa place.
- Recette en production avec un client « TEST UI » purgé ensuite.
- Prise en charge libre : TESTPLAN V14.

## 9. Tranches

- **P1 — fondation** : schéma, migration, enums, libellés, rôle (chemin,
  nav vide, seed, panneau démo, gardes), transitions et tests,
  `programme-input.ts` + tests, `bench-access.ts` + tests, les deux routes
  API, `BILLABLE_STATUSES`.
- **P2 — écrans** : `/programmation` (tableau de bord + file) et
  `/programmation/[id]` (fiche), composants sous `src/components/programmation/`,
  menu.
- **P3 — adaptations** : réception (technicien facultatif — retiré le 08/10, `RETOUR-LABO-06-10.md` §9.3), paillasse (file,
  fiche, results, submit, bench-sheet, dilution), rapport (techniciens,
  méthode), facturation (statuts, bandeaux), recherche / tableaux de bord /
  badges, journal.
- **P4 — recette** : gates (tsc, eslint, vitest, build), déploiement,
  TESTPLAN T sur la production, docs (WORKFLOW, HANDOFF, DEPLOY, PROGRESS).

## 10. Prise en charge libre (13/10)

Décision du laboratoire du 13/10/2026 : **plus personne n'attribue de
technicien** — ni la réception (depuis le 08/10), ni le responsable des
paramètres, ni l'administrateur. Les échantillons programmés attendent dans
une liste commune et chaque technicien prend lui-même ceux qu'il analyse.
Point de retour : tag `v1.2-avant-sans-affectation` (commit `4b9c557`) et la
sauvegarde `qualilab_avant-sans-affectation.sql.gz` prise juste avant le
déploiement (`DEPLOY.md`, « Point de retour — avant la prise en charge
libre »). Recette : TESTPLAN V14.

### 10.1 La fiche de programme et « À prendre »

- La fiche de programme ne choisit plus que les analyses, les versions de
  norme, les dilutions, la priorité, le délai de rendu, la prise d'essai et
  les consignes (§4). Confirmer le programme met l'échantillon dans
  **« À prendre »**, la liste partagée que voient tous les techniciens (et
  l'administrateur).
- Un échantillon est « à prendre » quand il est à la paillasse (PROGRAMME ou
  EN_ANALYSE), n'est pas bloqué en réception (`analysisBlocked`) et que
  **personne ne le tient** : ni `Sample.technicianId`, ni un
  `SampleParameter.technicianId` hérité. Une ligne héritée tenue seulement
  par des techniciens de paramètre compte comme **prise**. Un seul filtre,
  `UNCLAIMED_WHERE` (son jumeau pur : `isUnclaimed`), dans
  `src/lib/bench-access.ts`, sert à la tuile, à la liste
  (`BENCH_VIEWS.a_prendre`, `src/lib/circuit-views.ts`), aux tableaux de bord
  et aux routes : un compte et sa liste ne peuvent pas diverger.
- Ordre : les **urgentes d'abord, puis la réception la plus ancienne**.
  Comme toute liste de la paillasse, « À prendre » est groupée par série :
  une série se place à son échantillon le plus urgent, puis le plus ancien
  (`WORKFLOW.md` §3.4). À confirmer avec le laboratoire (NEEDEDINFO Q106).

### 10.2 Prendre en charge

- **Explicite** : le bouton « Prendre en charge » (« Prise en charge… »
  pendant l'envoi) → `POST /api/samples/[id]/take`, réservé au TECHNICIEN.
- **Implicite** : la première saisie **avec contenu** d'un technicien sur
  un échantillon libre le prend, dans la transaction même des résultats
  (journal `SAMPLE_TAKEN` avec `implicit: true` ; `PUT …/results` répond
  `taken: true`).
- Le titulaire est `Sample.technicianId`, l'heure `Sample.assignedAt`
  (colonnes existantes, aucune migration). **C'est l'échantillon entier qui
  est pris** (la micro et la physico-chimie sont déjà deux échantillons
  « …M » / « …P »). Le programme n'écrit plus `SampleParameter.technicianId`.
- **Le premier gagne.** Chaque écriture du titulaire verrouille d'abord la
  ligne `Sample` (`SELECT … FOR UPDATE`, `lockTakeState` dans
  `src/lib/bench-take-server.ts`), relit le titulaire sous le verrou, puis
  l'écrit par un `updateMany` gardé par `technicianId: null` (jamais un
  `update` gardé, HANDOFF §9). Le second reçoit **409 « Déjà pris par X. »**,
  au bouton comme à la saisie. Reprendre un échantillon déjà à soi n'est pas
  une erreur (`already: true`). Un échantillon hors paillasse ou bloqué en
  réception ne se prend pas (409).
- **Prendre ne change pas le statut.** PROGRAMME → EN_ANALYSE se fait à la
  première saisie avec contenu, dans la transaction des résultats (un
  programme modifié ne peut pas se glisser entre les lectures et le
  statut).
- « Avec contenu » = un résultat qui porte une valeur, une note, une
  lecture d'unité, ou une étape autre que « En cours » (`hasTypedResult`,
  `TYPED_RESULT_WHERE`). **Un « Enregistrer » sans rien de saisi ne prend
  pas l'échantillon et ne démarre pas l'analyse** ; il n'empêche pas non
  plus de le libérer.

### 10.3 Libérer

- « Libérer » remet un échantillon pris dans « À prendre », après la
  confirmation « Remettre cet échantillon dans « À prendre » ? Vos collègues
  pourront le prendre. » → `DELETE /api/samples/[id]/take`.
- Permis au **titulaire** (le TECHNICIEN dont `Sample.technicianId` est
  l'identifiant) et à l'**ADMIN**, seulement tant que l'échantillon est
  PROGRAMME ou EN_ANALYSE et qu'**aucun résultat saisi** n'existe (compté
  sous le même verrou que la saisie, `untakeRefusal`). Sinon : 403 « Seul X
  ou un administrateur peut libérer cet échantillon. » ; 409 « Des résultats
  sont déjà saisis sur cet échantillon : il ne peut plus être libéré. » ;
  409 hors paillasse ou quand personne ne le tient.
- Efface `technicianId`, `assignedAt` et les `SampleParameter.technicianId`
  hérités. Une ligne héritée tenue seulement par paramètre ne peut être
  libérée que par l'administrateur.
- Ce n'est **pas un verbe de correction** (`WORKFLOW.md` §8, `AGENTS.md`
  §3b) : journalisé (`SAMPLE_UNTAKEN`, avec le titulaire précédent), sans
  motif. À ne pas confondre avec le « Libérer » de « Bloqués »
  (`POST /api/samples/[id]/release`, `SAMPLE_RELEASED`, un échantillon
  retenu à la réception).

### 10.4 Qui voit, qui saisit

- Un technicien voit « À prendre », ses échantillons, et ceux de ses
  collègues **en lecture seule** : « Pris par un collègue », avec le nom et
  l'heure, fiche sans champs ni « Enregistrer ». Saisir dessus : **403**
  « Cet échantillon est pris en charge par X : vous ne pouvez pas y saisir
  de résultats. » (`loadAssignedSample`) ; 409 « Déjà pris par X. » quand le
  collègue l'a pris pendant la saisie. *Depuis le lot 2E (24/10, non
  déployé), interrupteur `TAKE_OVER_COLLEAGUE` allumé : un technicien peut
  « Reprendre » l'échantillon d'un collègue (§10.9) ; sans reprise, la
  fiche reste en lecture seule.*
- Sur la fiche, `canEnterParameter` décide de chaque paramètre : tout
  paramètre d'un échantillon libre (la saisie le prendra), ou un paramètre
  à moi. Les lignes héritées gardent leur règle (`canEditParameter` :
  chacun son paramètre, 403 « Le paramètre … est réservé à … : vous ne
  pouvez pas le saisir. »).
- `/api/samples` et la recherche d'un technicien restent limités aux
  échantillons qu'il tient (`benchWhereFor`) ; le technicien n'a **pas
  d'export** (`canExport`, `/api/samples/export`) — à confirmer avec le
  laboratoire (NEEDEDINFO Q108, relance 2.14 du 18/10). Depuis le lot 2E,
  ces écrans ne nomment plus le client (§10.10).
- **La feuille de paillasse d'un technicien = ce qu'il tient** : sans date,
  tout ce qu'il tient maintenant, dans l'ordre où il l'a pris ; avec
  `?date=`, ceux reçus ce jour-là. Les autres rôles impriment la paillasse
  d'un jour (aujourd'hui par défaut), triée par titulaire, les échantillons
  « À prendre » en tête.

### 10.5 L'administrateur et les autres rôles

- L'**ADMIN supplée** sur tout échantillon (il saisit, soumet, libère) mais
  **n'en prend jamais** : `POST …/take` est réservé au TECHNICIEN (403 pour
  l'administrateur, le validateur, la Direction et le responsable des
  paramètres), et une saisie de l'administrateur ne prend pas l'échantillon
  (elle peut le faire passer EN_ANALYSE ; il reste « à prendre »).
- **Soumettre un échantillon que personne ne tient est refusé à tous**,
  administrateur compris : 409 « Personne n'a pris cet échantillon en
  charge : un technicien doit le prendre avant la soumission. » Chaque
  échantillon soumis nomme ainsi son analyste.
- Tableau de bord de l'administrateur : la tuile « À prendre » et « qui
  tient quoi » (les échantillons à la paillasse par titulaire,
  `benchLoadByTechnician`).

### 10.6 Le programme après la prise en charge

- Le responsable des paramètres peut encore modifier le programme d'un
  échantillon PROGRAMME déjà pris, jusqu'à EN_ANALYSE. La route du programme
  n'écrit **jamais** `technicianId` ni `assignedAt` ; les analyses conservées
  d'une ligne héritée gardent leur technicien.
- La fiche ouverte à la paillasse peut alors être périmée : une saisie sur
  une analyse retirée reçoit 409 « Le programme d'analyse de cet
  échantillon a changé : rechargez la fiche. »
- Une fois la paillasse commencée (EN_ANALYSE, RESULTATS_SAISIS), une
  analyse qui ne peut pas être faite se **retire** par « Corriger les
  analyses » (16/10, Q91 / Q128) : seuls les résultats des analyses
  retirées sont effacés, les autres restent et l'échantillon garde son
  étape — une validation technique déjà donnée est effacée à
  RESULTATS_SAISIS (`resultsToReset`, `src/lib/intake-input.ts`). Ajouter
  une analyse, changer la famille de produits ou le nombre d'unités efface tous
  les résultats (et renvoie à la paillasse depuis la validation).
- « NE », « non effectué » et leurs variantes ne sont **pas** des
  résultats : la saisie les refuse (400 « … n'est pas un résultat. Une
  analyse non faite se retire du programme (responsable des paramètres). »,
  `isNotDoneText`, `src/lib/result-value.ts`).

### 10.7 Validation, parcours, journal

- Double validation inchangée. La page de validation affiche **« Analysé
  par »** = le titulaire, plus les techniciens hérités par paramètre
  (`reportTechnicianNames`, `src/lib/report-programme.ts`). Le rapport
  PG06/EN03 M ne l'imprime pas (NEEDEDINFO Q104 (c)).
- Parcours de l'échantillon : « Pris en charge » (avec « À la première
  saisie de résultat » quand la prise est implicite) et « Remis dans « À
  prendre » » (avec « Était pris par X ») ; un échantillon attribué avant le
  13/10 garde son « Attribué à un technicien ». Journal (`/admin/journal`) :
  `SAMPLE_TAKEN` « Échantillon pris en charge », `SAMPLE_UNTAKEN`
  « Échantillon remis dans « À prendre » » (`src/lib/audit-labels.ts`,
  `src/lib/sample-timeline.ts`). Depuis le lot 2E : `SAMPLE_TAKEN_OVER`
  « Échantillon repris à un collègue », parcours « Repris à un collègue »
  (§10.9).

### 10.8 Bascule et compatibilité

- **Aucune migration, aucune reprise de données.** Les échantillons déjà
  attribués en production comptent comme **pris par cette personne** : ils
  restent sur sa paillasse, et elle peut les libérer tant que rien n'y est
  saisi. « À prendre » commence donc presque vide (sur la copie locale du
  13/10, tous les échantillons PROGRAMME et EN_ANALYSE avaient un
  technicien) et se remplit avec les programmes confirmés ensuite.
- Les lignes programmées avant le 13/10 avec un technicien par paramètre
  continuent de fonctionner : chacun saisit son paramètre, la soumission
  attend que tout soit terminé, la ligne compte comme prise.
- Une page ouverte avant la mise à jour qui envoie `technicianId` au
  programme : ignoré, jamais refusé.
- NEEDEDINFO Q42 (un échantillon réparti entre plusieurs techniciens) est
  close par cette décision : un seul technicien prend l'échantillon entier.

### 10.9 Reprendre l'échantillon d'un collègue (relance 2.13 — lot 2E, 24/10, non déployé)

Réponse du laboratoire à Q107 (16/10) : « l'accès à la saisie doit être pour
tous les techniciens responsables de la tâche ». Notre proposition de la
relance 2.13 est construite avant sa réponse, derrière l'interrupteur
`TAKE_OVER_COLLEAGUE` de `src/lib/lab-proposals.ts` (allumé ; éteint, la
fiche d'un collègue redevient en lecture seule et la route répond 403).

- Sur la fiche d'un échantillon pris par un collègue, à la paillasse :
  « Reprendre cet échantillon » → une confirmation qui nomme le titulaire
  (« Reprendre cet échantillon à X ? » : les résultats enregistrés restent,
  chacun au nom de la personne qui l'a saisi ; ce que X n'a pas encore
  enregistré n'est pas gardé) → `PATCH /api/samples/[id]/take`
  `{ holderId }`, réservé au TECHNICIEN, **sans motif**.
- Sous le verrou de la ligne (`lockTakeState`), un `updateMany` gardé par le
  titulaire que la confirmation nommait : si quelqu'un a repris ou libéré
  l'échantillon entre-temps → 409 « Cet échantillon vient de changer :
  rechargez la page. », rien d'écrit. Règle pure : `takeOverRefusal`
  (`src/lib/take-over.ts`) — libre → « utilisez Prendre en charge » ; hors
  paillasse ou bloqué → 409 ; une ligne répartie par paramètre avant le
  13/10 ne se reprend pas (un administrateur la termine).
- Seul `technicianId` change : **`assignedAt` reste le début des analyses**
  (la « Date d'analyse » du rapport) ; l'heure de la reprise se lit au
  journal. Les lectures déjà enregistrées gardent leur auteur et leur heure
  (D-09) ; sous chaque lecture, la fiche dit « Saisi par X le … ». Celui qui
  reprend termine et soumet : « Analysé par » le nomme.
- L'ancien titulaire lit « Repris par B le … » sur la fiche et « Repris par
  B · heure » dans ses listes (l'échantillon passe dans « Pris par un
  collègue ») ; son prochain « Enregistrer » est refusé (403 qui nomme B),
  sa saisie reste affichée jusqu'à « Recharger la fiche ». Aucune
  notification ne le prévient avant. La reprise en sens inverse est permise
  et journalisée.
- Une fiche ouverte avant qu'un autre y enregistre (reprise puis retour,
  administrateur qui supplée) n'écrase jamais ses lectures : la sauvegarde
  envoie l'heure de la fiche (`loadedAt`) et reçoit 409 ; la fiche se
  recharge avec ses lectures et garde la saisie
  (`src/lib/take-over-sheet.ts`).
- Ce n'est pas un verbe de correction (`WORKFLOW.md` §8, `AGENTS.md` §3b) :
  journal `SAMPLE_TAKEN_OVER` (ancien titulaire, nombre de lectures déjà
  enregistrées), sans motif.

### 10.10 Écrans du technicien sans client (relance 2.15 — lot 2E, 24/10, non déployé)

Comme la feuille de paillasse depuis le 19/10 (C1), et derrière
l'interrupteur `BLIND_BENCH_SCREENS` (allumé ; éteint, le client revient) :
les listes de `/technicien`, la fiche `/technicien/[id]`, `/recherche` et
`GET /api/samples` d'un technicien ne chargent ni n'affichent le client, le
site, le lieu du client ni la personne qui a donné l'accord du client
(« Analysé avec l'accord du client. ») ; sa recherche libre ne les trouve
plus (`benchHidesClient`, `benchSearchScope` dans `src/lib/bench-access.ts`).
Les autres rôles lisent tout, comme avant. Les champs libres (notes,
désignation, consignes) restent affichés tels que saisis.
