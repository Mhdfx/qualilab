# PROGRAMME.md — le responsable des paramètres et le programme d'analyse

> Spécification de la tranche demandée le 05/10/2026 (`RETOUR-LABO-05-10.md`
> §5). Un nouveau rôle décide, pour chaque échantillon réceptionné, de tout
> ce qui sera fait dessus avant la paillasse ; la facturation peut être
> préparée dès que ce programme est confirmé. Tout ce qui existe est
> conservé ; les ajouts sont additifs (migration sans perte).

## 1. Le circuit

```
PRELEVE ──réception──▶ RECU ──programme confirmé──▶ PROGRAMME ──saisie──▶ EN_ANALYSE
      ──▶ RESULTATS_SAISIS ──validation technique──▶ VALIDE ──approbation──▶ RAPPORT_ENVOYE
```

- **RECU** : la réception a numéroté, mesuré et accepté la ligne. Elle
  n'attribue plus obligatoirement un technicien (le champ devient
  facultatif, « à titre indicatif »).
- **PROGRAMME** (nouveau) : le responsable des paramètres a confirmé le
  programme d'analyse. Seule une ligne PROGRAMME peut être ouverte à la
  paillasse. Le programme reste modifiable tant que la ligne est PROGRAMME ;
  ensuite, « Corriger la fiche » (motif, journal) comme aujourd'hui.
- Transitions (`src/lib/sample-status.ts`) : `RECU → PROGRAMME`
  (PROGRAMMATEUR, ADMIN) ; `PROGRAMME → EN_ANALYSE` (TECHNICIEN, ADMIN) ;
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
  technicianId   String?   // technicien de ce paramètre ; null = celui de l'échantillon
  technician     User?     @relation("ParameterTechnician", fields: [technicianId], references: [id], onDelete: SetNull)
  normVersionId  String?   // version de norme retenue pour ce paramètre
  normVersion    NormVersion? @relation(fields: [normVersionId], references: [id], onDelete: SetNull)
  dilutionFactor Decimal?  @db.Decimal(12, 4)  // facteur propre à cet échantillon (remplace calcFactor du paramètre)
  note           String?   @db.VarChar(191)
}
```

MySQL : `ALTER TABLE Sample MODIFY status ENUM('PRELEVE','RECU','PROGRAMME','EN_ANALYSE','RESULTATS_SAISIS','VALIDE','RAPPORT_ENVOYE','ANNULE') NOT NULL DEFAULT 'PRELEVE'` (ajout de valeur, sans perte) ; même chose pour `User.role`. Index sur `Sample(status, programmedAt)` et `SampleParameter(technicianId)`.

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
5. **Organisation** — technicien par défaut (`Sample.technicianId`) et, par
   paramètre, un technicien différent (`SampleParameter.technicianId`) ;
   raccourcis « tous à X », « micro à X, chimie à Y » ; priorité (Normale /
   Urgente) ; délai de rendu (`dueAt`, pas dans le passé) ; consignes
   (`programmeNote`).
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

- `GET /api/samples/[id]/programme` (PROGRAMMATEUR, ADMIN, TECHNICIEN en
  lecture) : l'échantillon, son programme courant, et le référentiel utile
  (types de produits du client + catalogue avec critères, paramètres de la
  catégorie, profils, techniciens actifs, versions de norme par paramètre,
  prix du catalogue par paramètre).
- `PUT /api/samples/[id]/programme` (PROGRAMMATEUR, ADMIN) — corps validé par
  `src/lib/programme-input.ts` (`validateProgramme`) :
  `{ confirm: boolean, productTypeId: string|null, parameterIds: string[],
     unitCount: number, testPortion: string|null, technicianId: string|null,
     priority: "NORMALE"|"URGENTE", dueAt: string|null, programmeNote: string|null,
     parameters: [{ parameterId, technicianId: string|null, normVersionId: string|null,
                    dilutionFactor: number|null, note: string|null }] }`
  Règles : statut RECU ou PROGRAMME sinon 409 ; `parameterIds` ≥ 1 pour
  confirmer (un brouillon peut être vide) ; type actif et visible pour ce
  client ; unités 1 … `MAX_UNITS` ; `dueAt` ≥ maintenant − 5 min ;
  techniciens actifs de rôle TECHNICIEN ; versions de norme appartenant au
  paramètre ; `dilutionFactor` > 0. Les `SampleParameter` sont remplacés
  en bloc (pas de résultats possibles avant EN_ANALYSE) ; `Sample.technicianId`
  reçoit le technicien par défaut. Réponse : l'échantillon à jour.
- `GET /api/programmation/queue` (PROGRAMMATEUR, ADMIN) : lignes RECU et
  PROGRAMME non annulées, groupées par série (client, N° de série, lignes
  avec N° de contrôle, désignation, nature, unités, priorité, dueAt,
  programmedAt), les RECU d'abord, les plus anciennes réceptions en tête.

## 6. Ce qui s'adapte

- **Réception** (`reception-input.ts`, `SerieReceptionForm`, `DepositForm`) :
  le technicien devient facultatif (« Technicien (facultatif — le responsable
  des paramètres attribue) ») ; « Technicien pour toutes les lignes » reste.
- **Paillasse** : la file (`/technicien`, `/api/samples` pour un TECHNICIEN,
  `/api/bench-sheet`) liste les lignes PROGRAMME et EN_ANALYSE où
  `Sample.technicianId = moi` **ou** un `SampleParameter.technicianId = moi` ;
  une ligne RECU ouverte par URL montre « En attente de programmation » (sans
  champs) ; sur la fiche, seuls mes paramètres sont éditables (helper pur
  `canEditParameter(sample, parameter, userId)` dans `src/lib/bench-access.ts`,
  testé) ; `PUT …/results` refuse un paramètre qui n'est pas le mien (403 avec
  le nom) ; `POST …/results/submit` exige tous les paramètres TERMINE quel
  qu'en soit le technicien (un technicien peut soumettre quand tout est
  terminé ; sinon message « il reste N paramètres à d'autres techniciens »).
  `loadAssignedSample` accepte l'un ou l'autre lien. La dilution
  programmée (`dilutionFactor`) remplace `calcFactor` du paramètre quand elle
  est présente (bench, results, report).
- **Rapport** : « Analyses réalisées par » imprime les techniciens distincts
  (échantillon + paramètres) séparés par « · » ; colonne « Méthode » : la
  version de norme programmée si présente, sinon celle du critère, sinon celle
  du paramètre.
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
  `SAMPLE_PROGRAMME_UPDATED` → « Programme d'analyse modifié ».

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

## 9. Tranches

- **P1 — fondation** : schéma, migration, enums, libellés, rôle (chemin,
  nav vide, seed, panneau démo, gardes), transitions et tests,
  `programme-input.ts` + tests, `bench-access.ts` + tests, les deux routes
  API, `BILLABLE_STATUSES`.
- **P2 — écrans** : `/programmation` (tableau de bord + file) et
  `/programmation/[id]` (fiche), composants sous `src/components/programmation/`,
  menu.
- **P3 — adaptations** : réception (technicien facultatif), paillasse (file,
  fiche, results, submit, bench-sheet, dilution), rapport (techniciens,
  méthode), facturation (statuts, bandeaux), recherche / tableaux de bord /
  badges, journal.
- **P4 — recette** : gates (tsc, eslint, vitest, build), déploiement,
  TESTPLAN T sur la production, docs (WORKFLOW, HANDOFF, DEPLOY, PROGRESS).
