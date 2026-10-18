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
> **16/10/2026 — réponses du laboratoire** (`RETOUR-LABO-16-10.md`, rien
> n'est encore construit) : pas de catégories (Q121) ; le responsable des
> paramètres gère familles et critères sous /programmation (F4) ; changer de
> famille remplacera la liste (F6, contraire au §4 actuel) ; après le
> programme, les analyses se changeront par lui et l'administrateur (F8) ;
> « Reprendre » l'échantillon d'un collègue est dans la relance (C3, §10).
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
  prise en charge ; ensuite, « Corriger la fiche » (motif, journal) comme
  aujourd'hui.
- Transitions (`src/lib/sample-status.ts`) : `RECU → PROGRAMME`
  (PROGRAMMATEUR, ADMIN) ; `PROGRAMME → EN_ANALYSE` (TECHNICIEN, ADMIN — à
  la première saisie avec contenu, jamais à la prise en charge, §10) ;
  `RECU → EN_ANALYSE` **supprimée** ; `PROGRAMME → ANNULE` (ADMIN) ;
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
  de paillasse, recherche avec export) + le programme ; pas d'approbation,
  pas de validation, pas de configuration.
- L'ADMIN peut tout faire à sa place (remplaçant en cas d'absence).
- Compte de démonstration `param1` — « Rachid Alaoui » (seed + panneau de
  connexion + `scripts/disable-demo-accounts.sh` si la liste y est codée).
- Menu (`src/components/layout/programmation-nav.ts`) : Tableau de bord
  `/programmation`, À programmer `/programmation#file`, Recherche des
  analyses `/recherche`, Documents › Feuille de paillasse `/api/bench-sheet`.

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
responsable peut l'abaisser ou le relever ; s'il est inférieur au n du type,
la paillasse lit en indicatif comme aujourd'hui, et la fiche l'affiche
en avertissement avant confirmation.

## 4. La fiche de programme (`/programmation/[sampleId]`)

En-tête : N° de contrôle, série, client, désignation, lieu, nature, kind,
réception (date, T°, quantité, conformité), unités prélevées, statut.

Sections, dans l'ordre :

1. **Type de produit et critères** — sélecteur avec recherche (types du
   client puis catalogue, comme `LineEditor`), aperçu des critères du type
   (germe · norme · n · c · m · M). Choisir un type ajoute ses germes aux
   analyses et propose son n ; « — aucun — » laisse la lecture simple.
2. **Analyses** — puces de profils (`/api/profiles?clientId&natureId`) et
   cases par paramètre de la catégorie de la nature ; au moins une analyse
   pour confirmer. Les analyses cochées par le préleveur sont pré-cochées.
3. **Nombres** — unités à lire (`unitCount`, puces 1 / 3 / 5 / 9 + champ,
   avertissement si < n du type), prise d'essai (`testPortion`), facteur de
   dilution par paramètre (`dilutionFactor`, facultatif, « ×10 »).
4. **Méthodes** — par paramètre : version de norme (liste des versions du
   paramètre, celle en vigueur par défaut, celle du critère du type si un
   type est choisi), note de méthode (`note`).
5. **Organisation** — priorité (Normale / Urgente), délai de rendu
   (`dueAt`, pas dans le passé), consignes (`programmeNote`). Aucun
   technicien ni charge de travail depuis le 13/10 : la ligne confirmée
   rejoint « À prendre » (§10). (Avant le 13/10 : technicien par défaut et
   par paramètre, raccourcis « tous à X », « micro à X, chimie à Y ».)
6. **Vérification d'entrée** — rappel des règles de recevabilité
   (`reception-rules.ts`) recalculées avec les analyses programmées
   (quantité suffisante pour n, histamine → 9 unités, eau → 1 L / 2 L…) :
   avertissements, jamais bloquants ici (la réception a déjà accepté) ; lien
   « Corriger la fiche » / « Annuler » (verbes existants, selon le rôle).
7. **Facturation** — lignes qui seront proposées au comptable : chaque
   analyse programmée avec son prix du catalogue (`LabService` apparié par
   nom de paramètre comme le fait `/api/clients/[id]/billable`), « prix à
   saisir » sinon ; note pour le comptable (dans `programmeNote`).

Pied : « Enregistrer le brouillon » (sans changer de statut) et
« Confirmer le programme » (→ PROGRAMME, `programmedAt`, `programmedById`,
journal `SAMPLE_PROGRAMMED` avec avant/après). Une ligne déjà PROGRAMME
affiche « Programme confirmé le … par … » et le bouton « Enregistrer les
modifications » (journal `SAMPLE_PROGRAMME_UPDATED`). Une ligne EN_ANALYSE
ou au-delà : fiche en lecture seule avec le lien « Corriger la fiche ».

## 5. API

- `GET /api/samples/[id]/programme` (PROGRAMMATEUR, ADMIN ; refusé au
  technicien depuis le 14/10 : 403, RP3c) : l'échantillon, son programme courant, et le référentiel utile
  (types de produits du client + catalogue avec critères, paramètres de la
  catégorie, profils, versions de norme par paramètre, prix du catalogue par
  paramètre). Depuis le 13/10, ni la liste des techniciens ni leur charge.
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
- Programme : type avec critères, profil, unités < n (avertissement),
  prise d'essai, dilution ×10 sur un germe, versions de norme, micro à tech1
  et chimie à tech2, urgente, délai, consignes ; brouillon puis confirmation ;
  journal avant/après ; modification après confirmation.
- Paillasse : tech1 voit la ligne et seulement ses paramètres (ceux de
  tech2 en lecture) ; saisie refusée sur un paramètre d'autrui (403) ;
  soumission refusée tant que tech2 n'a pas terminé ; la dilution ×10
  transforme la lecture ; feuille de paillasse par technicien.
- Facturation : la ligne PROGRAMME est proposée au comptable aux prix du
  catalogue ; facture créée ; bandeau « Facturé avant résultat ».
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
  collègue l'a pris pendant la saisie.
- Sur la fiche, `canEnterParameter` décide de chaque paramètre : tout
  paramètre d'un échantillon libre (la saisie le prendra), ou un paramètre
  à moi. Les lignes héritées gardent leur règle (`canEditParameter` :
  chacun son paramètre, 403 « Le paramètre … est réservé à … : vous ne
  pouvez pas le saisir. »).
- `/api/samples` et la recherche d'un technicien restent limités aux
  échantillons qu'il tient (`benchWhereFor`) ; le technicien n'a **pas
  d'export** (`canExport`, `/api/samples/export`) — à confirmer avec le
  laboratoire (NEEDEDINFO Q108, relance 2.14 du 18/10).
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
  `src/lib/sample-timeline.ts`).

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
