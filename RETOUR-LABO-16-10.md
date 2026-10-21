# Réponses du laboratoire du 16/10 — lecture, plan complet du lot 2 (et 1b), relance du 18/10

> **Le plan en cours.** Le 16/10, le laboratoire a renvoyé, annoté à la main,
> les **pages 1 à 6** du questionnaire du 14/10 (« Qualilab LIMS — Questions au
> laboratoire », 9 pages : Q109–Q130 et 59 questions plus anciennes). Chaque
> réponse a été lue sur le scan, puis vérifiée **dans le code** (`master` =
> `96bb418`, en lecture seule) par sept lectures par thème : préleveur,
> réception, clients, paillasse, validation et rapport, catalogue, questions
> restantes. Ce document **l'emporte sur `RETOUR-LABO-14-10.md` §4** pour tout
> ce qu'il modifie (§2) ; la conception de §4 reste la référence pour le reste.
>
> **État au 19/10 : le lot 2A (lot 1b compris) est construit et testé en
> local, il n'est pas déployé.** Branche `lot2-retour-16-10` = `master`
> (`a1ad186`) + quatre commits : `9770bb0` (vague 1), `d7b8750` (vague 2),
> `124af3a` (vague 3), `b898586` (vague 4), `d9dcd2d` (vérification
> finale), puis deux commits de documents (`81de56d`, `f4e9140` : déploiement
> reporté par le propriétaire, phase de développement). Contrôles verts (tsc, eslint, vitest 117 fichiers / 2 312
> tests, `npm run build`) ; recette locale v16-1 63/63, v16-2 109/109, v16-3
> 67/67, v16-4 73/73, plus les non-régressions V15 24/24 et V14 40/40, et la
> vérification finale 21/21 + 7/7 ; cinq migrations additives répétées sur
> une copie au schéma de production (aucune ligne changée). La production
> tourne toujours `52e0d27`. Ce qui reste avant la production : §4 « État au
> 19/10 » et `DEPLOY.md` « Lot 2 du 16/10 ». Chaque élément porte son statut
> dans la dernière colonne de son tableau (§3, §5).
>
> - Écrit le 16/10, avant toute construction : ce document est le plan. Le
>   propriétaire décide quand le construire (§4 propose quatre vagues).
>   *19/10 : les vagues 1 à 4 sont construites et revues en local (branche
>   `lot2-retour-16-10`), non déployées — `HANDOFF.md` §8 ; la revue de la
>   vague 4 a précisé F3, F5, F6 et F9 (fin de §3.F).*
> - **Lot 2A** = ce qui peut se construire maintenant (réponse claire, ou défaut
>   sûr quelle que soit la réponse) ; **lot 2B** = après la relance du 18/10
>   (§7) ; **Données** = attend un fichier ou une liste du laboratoire ;
>   **Propriétaire** = geste d'exploitation, pas de code (§6).
> - Le lot 1b (« rapport aligné », `RETOUR-LABO-14-10.md` §8) est intégré au
>   chantier D (§3.D), avec ses corrections.
> - Points de retour inchangés : tag `v1.3-avant-retour-14-10` (`cd0054f`) ;
>   la production tourne `52e0d27` (lot 1, 14/10) — les commits suivants
>   (`950a556`, `96bb418`, celui-ci) ne changent que des documents. *19/10 :
>   le point de retour du lot 2 sera le tag `v1.4-avant-lot2-16-10` =
>   `a1ad186` (= `52e0d27` + documents) et le dump
>   `qualilab_avant-lot2-16-10.sql.gz`, pris au déploiement (`DEPLOY.md`).*
>
> **Suite (19/10, scan reçu le 20/10)** : le laboratoire a renvoyé les pages
> 9 et 10 de la relance (Q11, Q30, Q85, Q86, Q45, Q54, Q81, Q82 ; Q104, Q93,
> Q103, Q105, Q97 vides) → `RETOUR-LABO-19-10.md` (lot 2C : H1–H5 et les
> défauts D-15 à D-19 relevés en préparant la présentation du 20/10).
>
> **21/10 — dettes fermées avant le déploiement** : D-09 (« Avec lui » de
> C3 : chaque lecture garde son auteur, « Saisi par » à la validation,
> `e224170`) et le « Annuler » de la réception qui nomme la facture (D1,
> `7c35cfe`), avec d'autres points de `HANDOFF.md` §9 ; construits, testés
> en local (`TESTPLAN.md` V18), commités et poussés sur
> `lot2-retour-16-10`, **non déployés** — ils partent avec les lots 2A et
> 2C au prochain déploiement (décision du propriétaire du 21/10 : déployer
> après chaque construction).
>
> Effort : XS ≈ 1 h ou moins · S 1–4 h · M 4–12 h · L plus de 12 h
> (estimations).

---

## 0. Contexte

- **Ce qui est revenu** : un scan de 6 pages, annoté à la main — les pages 1 à
  6 sur 9. **Les pages 7 à 9 ne sont pas revenues** (la fin de « Validation et
  rapport », la facturation, les clients et sites, les comptes, la mise en
  service, les modules à venir : 22 questions). La partie 2 « Informations à
  nous transmettre » est revenue **sans aucune case cochée**.
- **Décompte** : 81 questions envoyées (22 de Q109–Q130 + 59 plus anciennes)
  → **52 répondues** (29 réglées, 19 en partie, 4 à reposer), **7 laissées
  vides**, **22 non revenues**.
- Le scan et sa transcription restent **hors du dépôt** : une réponse (Q22)
  porte l'initiale et le nom d'un membre du personnel. Scan :
  `backups/reponses-labo-16-10-scan.pdf` ; transcription :
  `backups/reponses-labo-16-10-transcription.md` (ignorés par git). Ici, le
  préleveur s'écrit toujours « X.NOM ».
- **Attention, texte envoyé ≠ fichier de travail des questions** (hors
  dépôt) : le 15/10, après l'extrait de rapport réel, les textes de Q22 et
  Q104 ont été réécrits dans ce fichier **après** l'impression du
  questionnaire. Le scan fait foi : la
  Q22 envoyée demandait **quelle fonction imprimer** à côté de « Prélèvement
  effectué par » sur le protocole.
- La relance (les questions restantes, en français, 11 pages) est prête :
  `backups/Qualilab-suite-reponses-16-10-2026-10-18.pdf` (§7).

## 1. Les réponses, une par une

Statut : **réglée** (on construit) · **en partie** (une part réglée, le reste
dans la relance) · **à reposer** (illisible, contradictoire ou « ?? ») ·
**vide** · **non revenue**. « Relance n » = le numéro du point dans le PDF du
18/10 (§7) ; « A1 », « B2 »… = l'élément du plan (§3).

### 1.1 Remarques du 14/10 (Q109–Q130)

| Q | Réponse (transcrite) | Lecture | Statut | Suite |
|---|---|---|---|---|
| Q109 | Coché « Oui » ; « Aseptique » barré → « Aseptisées ou désinfectées » ; « Nettoyé » barré → « Lavées » ; « Oui à supprimer » (mains non lavées) | Mains : un état **obligatoire**, trois choix « Aseptisées ou désinfectées » / « En cours de travail » / « Lavées » ; « Mains non lavées » disparaît ; rien sur Surface (P1 fermé). Les états de **surface** ne changent pas | réglée | A1 |
| Q110 | Coché « Oui » ; « En cours de travail » écrit sous « non lavées » ; « Mais il faut avoir case pour indiquer le nom de la personne et choisir Lavée/Non Lavée » | **Réglé** : les anciennes « lavées » restent « Lavées », les anciennes « non lavées » se lisent « En cours de travail » (leur message du 14/10, L2). **Pas réglé** : la dernière phrase (« choisir Lavée/Non Lavée ») contredit littéralement « Oui à supprimer » (Q109) ; lecture probable : le maintien du nom et du choix d'état, pas un second choix — à confirmer en relance 2.1 avant de livrer la liste de A1 | en partie | A1 ; relance 2.1 |
| Q111 | « Nous n'avons pas besoin de la fonction de la personne à prélever » | Le nom identifie la personne ; la fonction n'est pas voulue → la case facultative « Fonction » (`Sample.personRole`, jamais documentée) se retire ; « Personne ou poste prélevé » (§4.1 point 5) abandonné. L'état imprimé dans la désignation n'est pas tranché | en partie | A2 ; A3 après relance 2.1 |
| Q112 | « Température au prélèvement » | Le mot à l'écran, sur tous les types (sauf l'air, qui n'a pas cette température) ; protocole « T°p / T°a » et rapport inchangés (leur rapport réel du 15/10 le confirme) | réglée | A4 |
| Q113 | « Autre » : « obligatoire ambiante » (deux mots barrés) | Lecture la plus sûre : la T° ambiante obligatoire sur la visite, **air compris** ; la température au prélèvement reste facultative ; le comptoir reste facultatif | en partie | A5 ; relance 2.2 |
| Q114 | Coché « Oui » + « et autre pour ajouter d'autres matériaux pas seulement en chiffres » | Un choix « Autre » à côté de 100 / 1000 cm² : un texte (ustensile, poignée…) **à la place** de l'aire. L'unité du résultat sans aire reste à demander | en partie | A7 ; relance 2.3 |
| Q115 | Coché « Oui » | Le lot 1 (sites affichés, recherche par site, nom seul) répond à la demande | réglée | — |
| Q116 | « champs à remplir mais pas obligatoire : Adresse, nom de compagnie, site si besoin, lieu de prélèvement » | Formulaire : nom, adresse, site si besoin, lieux de prélèvement ; rien d'autre d'obligatoire. **Un nom reste techniquement indispensable** (rapport, facture, recherche, doublons) : « Nom du client (société ou particulier) » | en partie | E1 ; relance 2.4 |
| Q117 | « Autre » : « Admin ou commercial » | La fusion d'un doublon : administrateur **ou** gestionnaire commercial. « Rattacher comme site » et le signal « À compléter » ne sont pas tranchés | en partie | E3, E4 ; relance 2.5 |
| Q118 | « Lors du prélèvement, il faut obligatoirement avoir la date et l'heure du prélèvement et de la réception » | « Prélevé le » **et** « Arrivé le » obligatoires au comptoir (fin du « laissé vide = Non déclarée » pour les nouveaux dépôts) ; (a) réglée (gardé, obligatoire) ; (c) réglée par l'extrait du 15/10 (réception = l'arrivée). Reste : le client qui ne connaît vraiment pas l'heure | en partie | B1 ; relance 2.6 |
| Q119 | Coché « Oui » | Le contournement est accepté : navigateur et format régional en français sur les postes ; R8 n'est pas construit | réglée | — |
| Q120 | Coché « Oui » | « Famille de produits » partout à l'écran ; Micro / PC = « Domaine » | réglée | F7 |
| Q121 | « Pas important d'avoir groupe famille » | **Pas de catégories.** RP2c abandonné ; RP2a réduit au type d'analyse de chaque famille (nécessaire au filtre de Q124) | réglée | F1–F5 |
| Q122 | Coché « Oui » | Écran de consultation + liste des paramètres de la famille sur la fiche de programme ; pas de version imprimable | réglée | F4, F6 |
| Q123 | Coché « Oui » | Cochés d'office, « Cocher tout / Décocher tout », compteur ; changer de famille **remplace** la liste (les germes cochés à la main restent) | réglée | F6 |
| Q124 | Coché « Oui » | Filtre « Type d'analyse » préréglé, modifiable | réglée | F5 |
| Q125 | Coché « Oui » | Le responsable des paramètres gère familles et critères (et la réglementation proposée d'une famille) ; le reste à l'administrateur | réglée | F4 |
| Q126 | Coché « Oui » | Reprise des familles mains / surfaces / eaux / air de l'ancien logiciel avec leurs critères (UFC/mains…) — N2, OLD31 | réglée | F3 |
| Q127 | Coché « Oui » | La règle du technicien est la bonne (déjà construite, lot 1) ; deux comptes pour une personne qui fait les deux | réglée | Propriétaire (comptes) |
| Q128 | Coché « Oui » | RP3b variante (a) : après la confirmation du programme, les analyses par le responsable des paramètres et l'administrateur seulement | réglée | F8 |
| Q129 | Coché « Oui » | « Analyse sensorielle » sur la fiche de programme d'un aliment ; « Analyse physique » abandonnée | réglée | F9 |
| Q130 | Barrés : échantillon témoin, référence client, neutralisant, diluant, « DPC », multi duplication | OLD9, OLD13, OLD28, OLD21, OLD33, OLD36 **abandonnés**. Non barrés : (g) boutons rapides, (h) commentaire de saisie, (i) préleveur Qualilab au comptoir, (j) précédent / suivant, (k) « plus de N jours » — lus comme demandés, à confirmer | en partie | G1–G5 ; relance 2.20 |

### 1.2 Questions plus anciennes — pages 3 à 6

| Q | Réponse (transcrite) | Lecture | Statut | Suite |
|---|---|---|---|---|
| Q64 | « avoir un bouton général avec possibilité de cliquer sur chaque échantillon » | Un bouton « Tous exploitables » par série + la réponse par échantillon. (a) l'identification aussi ? (b) « Détruire » proposé pour un non exploitable ? — sans réponse | en partie | B2 ; relance 2.7 |
| Q67 | OK | Délais C1 comme construits (24 h micro, aucun en PC, « à vérifier ») | réglée | — |
| Q69 | OK | Bornes C2 et classes par défaut comme construites ; glacière notée, non jugée | réglée | — |
| Q70 | « PAS besoin de question sur l'emballage » ; à côté « si pas rempli » | La question « emballage correct » (C3, et l'indication C4) disparaît ; le motif « Emballage ou contenant non conforme » reste ; « identification correcte » (C5) reste. « si pas rempli » obscur | en partie | B3 ; relance 2.8 |
| Q71 | (vide) | — | vide | B6 ; relance 3 |
| Q72 | « NON » | « NON » lu comme : ni motif dédié, ni non-conformité automatique ; l'avertissement reste, donc l'aliment reste analysable (un « NON » à la dernière sous-question, les essais de fin de vie, contredirait « pas de non-conformité automatique » : lecture écartée ; la relance, partie 1, le leur fait confirmer) | réglée | — |
| Q73 | (vide) | — | vide | relance 3 (défaut gardé) |
| Q74 | « Avis envoyé : un mail par un échantillon pas reçu » | Un e-mail au client pour chaque échantillon « Non reçu » ; rien pour « en attente » ou « analysé malgré » | en partie | B4 ; confirmé en relance 1 |
| Q75 | « Non inscrit sur le bon de réception » | L'accord du client ne s'imprime plus sur le bon ; il reste noté et visible du validateur. Les autres sous-questions : sans réponse | en partie | B5 ; relance 2.8 |
| Q76 | (vide) | — | vide | relance 3 (défaut gardé) |
| Q77 | « Ignoré » (lecture la plus probable du scan ; « Rejeté » possible) | Lecture probable : pas de réserve ISO 17025 sur le rapport. Avec « Rejeté », une autre lecture : un non-conforme serait toujours refusé — contraire à leur réponse du 29/09 | à reposer | relance 2.9 |
| Q80 | « NON » | Pas de liste « À corriger » | réglée | — |
| Q100 | OK | Liste de mots des mollusques et ligne « 10 individus » comme construites | réglée | — |
| Q101 | OK | « Ambiant » = aliment stable ; mains sans température obligatoire à l'arrivée (P10 fermé) | réglée | — |
| Q2 | OK | Le nom de la personne prélevée reste obligatoire et imprimé (2e partie) | réglée | — |
| Q22 | « Préleveur : Technicien de QUALILAB X.NOM » | La dénomination du lot 1b, **aussi sur le protocole** (« Prélèvement effectué par »). La saisie au nom d'un collègue était déjà répondue le 29/09 (un compte par préleveur, `serie-create.ts` le refuse) et n'était pas dans la question envoyée | réglée | D6 |
| Q50 | « toujours » entouré, « mais avoir la possibilité de changer » ; « UFC/m³ » | 30 min par défaut, modifiables ; UFC/m³ plutôt que UFC/cm². Sa portée (biocollecteur seul, ou boîte exposée aussi), le volume du biocollecteur et les analyses d'air : sans réponse | en partie | A8 ; A9 après relance 2.17 |
| Q88 | OK + « l'entrer sur place » + « Il y a une liste existante sinon avoir autre à préciser ! » | Une liste commune au laboratoire, choisie sur place, avec « Autre (préciser) ». La liste elle-même et qui la tient : à obtenir | en partie | A10 (Données) ; relance 2.18 |
| Q9 | « le technicien fera le calcul des 2 boîtes » | Une valeur par répétition, déjà calculée par le technicien ; pas de B1/B2 ; rien à calculer | réglée | (C4 lié) |
| Q78 | « ?? » | Non comprise : à reposer avec un exemple chiffré | à reposer | relance 2.11 |
| Q79 | « ?? » | Non comprise ; Q9 laisse penser que le technicien tape une valeur déjà calculée | à reposer | relance 2.12 |
| Q89 | OK | Analyses de l'autre domaine proposées à part, signalées | réglée | — |
| Q90 | OK | Mise en page de la feuille de paillasse validée | réglée | — |
| Q91 | « nous ne faisons pas de rapport si l'analyse n'est pas faite » | Aucune mention « non effectué » sur le rapport. Plusieurs analyses dont une impossible : rapport sans elle, ou pas de rapport ? Prévenir le client ? | en partie | C5 ; relance 2.10 |
| Q106 | (vide) | — | vide | relance 3 (défaut gardé) |
| Q107 | « l'accès à la saisie doit être pour tous les techniciens responsables de la tâche » | Rejette « seul le titulaire saisit » ; « Reprendre » ou saisie partagée ? | à reposer | C3 ; relance 2.13 |
| Q108 | (vide) | — | vide | C2 ; relance 2.14 |
| Q55 | « Seulement le code de l'échantillon — pas de nom du client sur la feuille de paillasse » | Plus de nom du client sur la feuille (comme les étiquettes du 08/10). « Seulement le code » : garder ce que porte l'étiquette (nature, désignation — le nom de la personne pour les mains —, série, lot) ou vraiment le code seul ? À confirmer, avec les écrans du technicien | en partie | C1 ; reste après relance 2.15 |
| Q8 | (vide) | — | vide | relance 3 |
| Q38 | OK | Les 175 textes réglementaires tels quels | réglée | — |
| Q39 | OK | Le classeur l'emporte ; familles inutilisées importées inactives — affiné par Q43 (« sauf si vide ») | réglée | F3 |
| Q40 | OK + « l'analyse devra être lue dans 1 g » | Le critère « /1 g » est déjà en base et l'emporte ; l'écran de saisie montre encore « /25 g » | réglée | C6, F6 |
| Q43 | « si, il y a des critères dans cette famille » | Ils ont raison : l'ancien logiciel a des critères pour « Plats cuisinés - volailles » (10 lignes, 6 actives) ; notre reprise les a sautés | en partie | F3 ; relance 2.19 |
| Q56 | « il y a une famille de la physico-chimie des surfaces, mais pas pour les mains et l'air » | La famille « Hygiène des surfaces » (allergènes, sulfites, éthanol, SARS-CoV-2, presque tout sans limite) est dans l'export de l'ancien logiciel. « Pas pour les mains et l'air » contredit leur demande du 08/10 | en partie | F3 ; relance 2.19 |
| Q13 | « l'administrateur », « Direction ou le validateur technique » soulignés ; flèche « ces personnes » | Rouvrir un rapport envoyé **et** annuler un échantillon en cours d'analyse : administrateur, Direction, validateur technique | réglée | D1 |
| Q14 | (vide) | — | vide | D7 ; relance 3 et 5 |
| Q92 | « La conclusion se fait selon les critères » ; « le rapport ne devra pas être envoyé automatiquement au client » ; flèche après « échantillon par échantillon » → « avoir les deux options » | Pas d'envoi automatique ; personne ne force la conclusion. « Les deux options » = très probablement valider par échantillon **et** par série (la flèche part de la dernière sous-question) — la transcription du 16/10 lisait « validation par série sans réponse » | en partie | D2 ; D3, D4 après relance 2.16 |

### 1.3 Sans réponse et non revenues

- **Vides (7)** : Q71, Q73, Q76, Q106, Q108, Q8, Q14 — reposés dans la relance
  (partie 3, et 2.14 pour Q108) avec « sans réponse, nous gardons ».
- **Non revenues (22)** : Q93, Q103, Q104, Q105 ; Q11, Q16, Q30, Q83, Q84,
  Q85, Q86 ; Q45, Q54 ; Q81, Q82, Q97 ; Q19, Q20, Q98 ; Q94, Q95, Q96.
  Reposées dans la relance (partie 4), sauf : **Q16** fondue dans Q30, **Q83**
  dans Q98 ; **Q84** retirée (défaut technique retenu : une facture à 0,00
  s'annule comme une impayée) ; **Q94, Q95, Q96** retirées (modules
  d'extension non chiffrés — réclamations, Achat & Stock, pièces jointes :
  décision commerciale du propriétaire, à reposer quand ils seront proposés).
- **Partie 2 (informations)** : rien reçu — reposée en partie 5 de la relance,
  plus une question nouvelle (2.21 : quelles analyses déclenchent l'alerte de
  contamination).
- *19/10 : les pages 9 et 10 de la relance sont revenues (partie 4, sauf la
  page 11) — `RETOUR-LABO-19-10.md` §1.*

## 2. Ce qui change dans le plan du 14/10 (`RETOUR-LABO-14-10.md` §4)

| § du 14/10 | Avant (défaut proposé) | Après le 16/10 |
|---|---|---|
| §4.1 Mains | Trois **nouvelles** valeurs ASEPTIQUE / EN_COURS_DE_TRAVAIL / NETTOYE ; LAVEES / NON_LAVEES gardent leur libellé ; « Personne ou poste prélevé » | **Une seule** valeur ajoutée (`ASEPTISEES`) ; `LAVEES` = « Lavées » ; `NON_LAVEES` **se lit « En cours de travail »** (l'équivalence que le laboratoire écrit lui-même) : aucune ligne réécrite ; la case « Fonction » retirée ; « Personne ou poste » abandonné (A1–A3) |
| §4.2 Températures | T° relevée **et** ambiante obligatoires sur la visite (air : ambiante) | La **T° ambiante seule** obligatoire sur la visite, air compris (A5) ; le mot « Température au prélèvement » (A4) ; P9 inchangé (A6) |
| §4.3 Surface | Rien avant Q114 | « Autre » : un texte à la place de l'aire, colonne `Sample.surfaceAreaNote` (A7) |
| §4.4 « Arrivé le » | « Prélevé le (si connu) » facultatif ; C1 un simple avertissement | « Prélevé le » **obligatoire**, « Arrivé le » obligatoire (prérempli) ; exception « heure inconnue » selon la relance 2.6, avec observation ; `startedAt = arrivedAt` seulement pour l'exception (B1) |
| §4.5 Clients | Raison sociale obligatoire ; `active` / `billingClientId` / `emails` ignorés ; `createdById` + `toComplete` ; fusion à l'administrateur | « Nom du client (société ou particulier) » ; lieux de prélèvement à la création ; `email` **et** `emails` ignorés (l'adresse unique sert de destinataire par défaut) ; `toComplete` seul (le journal dit qui a créé) ; fusion ouverte au commercial (E1–E4). Effort ≈ 22 h au lieu de 16 h |
| §4.6 Dates seules | R8 si demandé | Contournement accepté : **rien à construire** |
| §4.7 Catégories et familles | `ProductTypeGroup`, 8 catégories, écrans des catégories (≈ 52 h) | **Pas de catégories** : `ProductType.natureId` seul ; RP2c abandonné ; RP1 fondu dans RP2d ; filtres sans « Catégorie » ni « Réglementation » ; reprise étendue à Q43 et Q56 (≈ 40 h, F1–F7) |
| §4.8 Droits et natures | RP3b (a) ou (b) ; RP7 | RP3b (a) confirmé (F8) ; RP7 (F9) ; RP3 / C10 fermés (deux comptes) |
| §4.9 Ancien logiciel | 11 fonctions « si demandé » (≈ 27 h) | 6 abandonnées ; 5 à confirmer (G1–G5, ≈ 17–24 h) |
| §4.10 Ordre et migrations | Migrations : enum mains, `surfaceAreaNote`, `Client` ×2, `ProductTypeGroup` | Voir §4 : `HandsState` + `surfaceAreaNote` + `airExposureMin` ; `EmailType` NON_RECU ; `User.documentName` ; `Client.toComplete` ; `ProductType.natureId` |
| §8 Lot 1b | « Un duplicata d'un ancien rapport ne change pas » ; une demi-journée ; date d'analyse = confirmation du programme | **Faux** : la version courante et son duplicata se rendent depuis les données vivantes avec le code du jour (`loadReportData` → `liveReportData`). Le lot 1b ajoute un marqueur de mise en page et rend d'abord la version figée (D5) ; date d'analyse = la prise en charge à la paillasse ; ≈ 10 h ; la dénomination aussi sur le protocole (D6) |

## 3. Le plan complet, par chantier

Chaque élément : ce qui existe (vérifié dans le code), ce qu'il faut faire, où,
l'effort, la migration, ce que cela change **en production**, le statut.

### 3.A Préleveur et visite

A2 et A4 (libellés seuls) partent en vague 1. Un seul constructeur pour A1,
A5–A8 en vague 2 : ils touchent les mêmes fichiers (`LineEditor.tsx`,
`visit-types.ts`, `serie-input.ts`, `intake-input.ts`, `SampleVerbs.tsx` /
`sample-verbs-logic.ts`, `document-html.ts`). Ordre : constantes de
`labels.ts` → validation serveur → correction → formulaires → impressions.
**Une migration additive** pour la part 2A du chantier (A1, A7, A8) ; A9 et
A10 (2B) auront les leurs.

| Id | Quoi | Où | Effort | Migration | Production | Statut |
|---|---|---|---|---|---|---|
| A1 | **États des mains** (Q109, Q110). Aujourd'hui `HandsState { LAVEES NON_LAVEES }`, facultatif, liste écrite trois fois (`LineEditor.tsx:101`, `serie-input.ts:81`, `SampleVerbs.tsx:376`). Faire : `ASEPTISEES` ajouté **en fin** d'enum ; une seule liste `HANDS_STATE_CHOICES` dans `labels.ts` = [ASEPTISEES, NON_LAVEES, LAVEES] ; libellés « Aseptisées ou désinfectées » / « En cours de travail » / « Lavées » ; phrases d'impression propres aux mains (`HANDS_STATE_PHRASES`, jamais celles de la surface, jamais `Sample.surfaceState`) ; **obligatoire** à la création (visite et dépôt : `lineDraftError` → `SERIE_MESSAGES.handsStateMissing`, `validateLine`) ; dans « Corriger la fiche », `handsState` passe de `LINE_RULE_FIELDS` à `decideKindChoice` (un état posé ne se vide plus ; une ancienne ligne sans état reste corrigeable). Option : renommer l'identifiant en `EN_COURS_DE_TRAVAIL @map("NON_LAVEES")` seulement si Prisma 7 + l'adaptateur MariaDB le supportent (vérifier en local) | `prisma/schema.prisma`, `labels.ts`, `LineEditor.tsx`, `visit-types.ts`, `serie-input.ts`, `intake-input.ts`, `SampleVerbs.tsx`, `series/[id]/document/route.ts`, `reception-logic.ts` | M ≈ 7 h | `ALTER TABLE Sample MODIFY handsState ENUM('LAVEES','NON_LAVEES','ASEPTISEES') NULL` — aucun UPDATE | Libellés et choix changés à la visite, au dépôt, en correction ; un protocole ou un bon **réimprimé** d'une ancienne ligne « non lavées » lit « mains en cours de travail » (rendus à la volée) ; les rapports émis ne changent pas | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; la liste des choix est la proposition de la relance 2.1 : **en production après la réponse 2.1** (ou la décision écrite du propriétaire), non déployé |
| A2 | **Case « Fonction » retirée** (Q111). `Sample.personRole`, facultatif (`LineEditor.tsx:466-474`, `SampleVerbs.tsx:354`), imprimé « Nom — Fonction » sur le protocole et le bon. Retirer la saisie, garder la colonne et les anciennes valeurs ; le serveur l'accepte encore des anciennes pages | `LineEditor.tsx`, `SampleVerbs.tsx`, `visit-types.ts` | XS ≈ 0,5 h | non | Un champ en moins | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |
| A3 | **État des mains dans la désignation imprimée** (Q111, 2e partie). `sampleDesignation` (`document-html.ts:665`) ne rend que le nom pour MAINS. Si oui : `withHandsState(nom, état)` → « Nom — mains lavées » ; `handsState` ajouté aux sélections du rapport, des étiquettes, de la feuille de paillasse, de l'avis de destruction, du portail | `document-html.ts`, `report-dispatch.ts`, `labels/route.ts`, `bench-sheet/route.ts`, `destruction-notice.ts`, `portal-query.ts` | S ≈ 2 h | non | Désignation des nouveaux rapports, étiquettes, e-mails | 2B (relance 2.1) |
| A4 | **« Température au prélèvement »** (Q112). Aujourd'hui « T° relevée (°C) » (mains, surface) / « T° produit (°C) » (`LineEditor.tsx:690`) ; la carte de réception dit « T°p / T°a » (`SerieReceptionForm.tsx:812`) ; le récapitulatif et `VisitDetail` montrent une valeur nue (« x °C »). Faire : le libellé partout à l'écran sauf l'air ; « T° au prélèvement x °C · T° ambiante y °C » à la réception ; la valeur préfixée au récapitulatif ; message serveur (`serie-input.ts:454`). Protocole, rapport, colonne inchangés | `LineEditor.tsx`, `serie-input.ts`, `SerieReceptionForm.tsx`, `VisitForm.tsx`, `VisitDetail.tsx`, `SampleVerbs.tsx` | S ≈ 1,5 h | non | Libellés | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |
| A5 | **T° ambiante obligatoire sur la visite** (Q113). Les deux températures sont facultatives partout. Faire : `validateLine` refuse une ligne de VISITE sans `ambientTemperature`, **air compris** (« 0 » compte) ; `lineDraftError(…, { requireAmbient: true })` depuis `VisitForm` seulement + étoile (`LineEditor`) ; dépôt facultatif ; « Corriger la fiche » jamais bloquée pour une ancienne ligne. Si la relance 2.2 rend aussi la température au prélèvement obligatoire : même interrupteur sur `productTemperature` sauf AIR (XS) | `serie-input.ts`, `visit-types.ts`, `VisitForm.tsx`, `LineEditor.tsx` | S ≈ 4 h | non | **Nouvelle règle bloquante** sur les téléphones : prévenir le laboratoire avant le déploiement ; une visite en cours devra porter la T° ambiante | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; **prévenir le laboratoire avant le déploiement** (règle bloquante), non déployé ; extension : 2B |
| A6 | **P9 — températures dans « Corriger la fiche »**. `PATCH …/intake` les accepte déjà ; l'écran n'a pas les champs. Faire : « Température au prélèvement » et « T° ambiante » (virgule décimale, −80…300 °C) ; une valeur posée ne se vide plus ; une ancienne ligne vide reste corrigeable | `SampleVerbs.tsx`, `sample-verbs-logic.ts`, `intake-input.ts` | S ≈ 3 h | non | Deux champs de plus en correction | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé |
| A7 | **Surface « Autre »** (Q114). Lot 1 : puces 100 / 1000 cm² + champ nombre ; le serveur met 100 par défaut. Faire : colonne `Sample.surfaceAreaNote` ; troisième puce « Autre » qui ouvre un seul champ « Préciser » (remplace « ou saisir une autre valeur ») : un nombre entier → `surfaceAreaCm2`, un texte → `surfaceAreaNote` avec l'aire **vide** (plus de 100 par défaut quand un texte est donné ; aire et texte exclusifs) ; `surfaceText` imprime le texte à la place de « N cm² » (protocole, réception, programme, paillasse, validation, récapitulatif). L'unité du résultat sans aire : relance 2.3 (si « par écouvillon » : paramètres en UFC/écouvillon avec la portée par type, A9) | `schema.prisma`, `serie-input.ts`, `intake-input.ts`, `visit-types.ts`, `LineEditor.tsx`, `SampleVerbs.tsx`, `document-html.ts`, `reception-logic.ts`, pages programme / paillasse / validation, sélections | M ≈ 6 h | `Sample.surfaceAreaNote VARCHAR(191) NULL` | Étend P7 (lot 1) | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé ; unité : 2B |
| A8 | **Air : durée d'exposition** (Q50 a). `AirMethod { BOITE_EXPOSEE_30MIN BIOCOLLECTEUR }`, la durée est dans le libellé. Faire : `Sample.airExposureMin` sous la puce « Boîte exposée », 30 prérempli, modifiable (1–480), obligatoire avec cette méthode ; `AIR_METHOD_LABELS` → « Boîte exposée » + `airMethodText(méthode, minutes)` (« Boîte exposée 45 min » ; une ancienne ligne sans minutes = 30 min) ; **ne pas renommer** la valeur stockée ; le helper partout où la méthode s'imprime (protocole, désignation, « Moyen de prélèvement » du rapport, réception, correction) | `schema.prisma`, `labels.ts`, `LineEditor.tsx`, `visit-types.ts`, `serie-input.ts`, `intake-input.ts`, `SampleVerbs.tsx`, `document-html.ts`, `report-html.ts`, `report-dispatch.ts`, `reception-logic.ts`, `programmation/[id]/page.tsx` (l.182), sélections | S ≈ 4 h | `Sample.airExposureMin SMALLINT NULL` | Libellé imprimé de la méthode (V4, 07/10) composé avec la durée | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé |
| A9 | **Air : volume, unités, analyses ; portée des paramètres par type** (Q50 b/c, avec OLD31 et A7). Si oui : `Sample.airVolumeL` (biocollecteur) ; analyses d'air en UFC/m³ (reprises de l'ancien logiciel : levures, moisissures, micro-organismes à 30 °C) ; `AnalysisParameter.lineKind` NULL = tous les types de la catégorie, filtré dans `GET /api/parameters`, le référentiel du programme et `planLineSamples`, pour que l'air ne voie que l'air. Le technicien tape l'UFC/m³ calculé (Q9) | `schema.prisma`, `parameters/route.ts`, `programme-referential.ts`, reprise (F3) | S ≈ 2 h + M ≈ 8 h | `Sample.airVolumeL INT NULL`, `AnalysisParameter.lineKind … NULL` | Listes de paramètres des lignes surface, mains, air | 2B (relance 2.17) |
| A10 | **Liste des surfaces** (Q88). Aujourd'hui la « Désignation » d'une surface est un texte libre (`Sample.surfaceLabel`). Faire : table `SurfaceItem` (nom, nom normalisé unique, aire habituelle facultative, ordre, actif) ; écran de gestion (rôles selon la relance 2.18 ; proposé : ADMIN et PROGRAMMATEUR), import par collage ; à la visite, un choix cherchable (cibles larges) + « Autre (préciser) » qui garde le texte libre ; le nom choisi est **copié** dans `surfaceLabel` (renommer un élément ne réécrit pas l'histoire) ; l'aire habituelle préremplit l'aire | `schema.prisma`, écran et route de la liste, `LineEditor.tsx`, `SampleVerbs.tsx`, `audit-labels.ts` | M ≈ 9 h | `CREATE TABLE SurfaceItem` (+ option `Sample.surfaceItemId`) | Le champ « Désignation » de la surface devient une liste + « Autre » (le texte libre reste possible) | Données (la liste) + 2B |
| A11 | **Dénomination du préleveur sur le protocole** (Q22) — construit avec le lot 1b : voir D6 | — | — | — | — | 2A — avec D6, construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé |

### 3.B Dépôt et réception

B2, B3 (et B6) : un seul constructeur, mêmes fichiers (`SerieReceptionForm.tsx`,
`DepositForm.tsx`, `reception-logic.ts`, `reception-complementary.ts`,
`reception-input.ts`, `serie-input.ts`). B1 se construit avec le lot 1b (D5),
qui imprime l'arrivée.

| Id | Quoi | Où | Effort | Migration | Production | Statut |
|---|---|---|---|---|---|---|
| B1 | **« Prélevé le » et « Arrivé le » obligatoires au comptoir** (Q118, R5, Q68). Aujourd'hui « Prélevé le » est facultatif et vide au départ (`DepositForm.tsx:995-1027`) ; vide = « Non déclarée », C1 « à vérifier », observation obligatoire ; aucune arrivée saisie (l'instant de l'enregistrement). Faire : (1) « Arrivé le » (`LabDateTimeInput`, prérempli maintenant, « Maintenant », obligatoire, refusé dans le futur, `arrivalRefusal` contre « Prélevé le ») envoyé en `arrivedAt`, lu par la checklist en direct à la place de « maintenant », sur le récapitulatif et la confirmation ; (2) « Prélevé le » obligatoire (étoile) ; exception selon la relance 2.6 : une case « Heure de prélèvement inconnue du client » qui envoie `samplingTimeUnknown: true` ; (3) `validateSerie` lit `arrivedAt` **avant** `startedAt` ; pour un dépôt, `startedAt` obligatoire sauf exception ; exception → `startedAt = arrivedAt ?? maintenant`, `samplingTimeDeclared = false` ; arrivée bornée à 30 jours ; une ancienne page sans `arrivedAt` reste « maintenant » ; (4) la visite refuse aussi un « Prélevé le » vidé (aujourd'hui remplacé en silence par l'instant d'enregistrement) ; (5) à la réception d'une visite, « Arrivée au laboratoire » préremplie et obligatoire ; (6) le rapport imprime l'arrivée (D5). C1 ne change pas : un dépôt déclaré a un vrai délai ; l'exception reste « à vérifier » avec observation. « Non déclarée » (lot 1, R6) reste pour les dépôts déjà enregistrés et l'exception | `DepositForm.tsx`, `serie-input.ts`, `serie-create.ts`, `api/series/route.ts`, `SerieReceptionForm.tsx`, `VisitForm.tsx`, `report-dispatch.ts`, `report-html.ts`, `emails/templates.ts` | M ≈ 10 h | non (`Serie.arrivedAt`, `samplingTimeDeclared` existent) | Le comptoir change (en ligne depuis 10/12 octobre) ; une page ouverte avant le déploiement est refusée (convention du projet) | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; l'exception « Heure de prélèvement inconnue du client » est la proposition de la relance 2.6 : **en production après la réponse 2.6** (ou la décision écrite du propriétaire), non déployé ; prévenir le comptoir |
| B2 | **« Tous exploitables »** (Q64). Aujourd'hui jamais pré-répondu, exprès (`SerieReceptionForm.tsx:357-366`, HANDOFF §8 du 10/10). Faire : aide pure `answerAllExploitable(lignes)` (ne remplit que les lignes sans réponse, ne touche jamais un « Non exploitable ») ; un bouton « Tous exploitables (N) » au-dessus des échantillons, à la réception et au dépôt, avec confirmation lue (`aria-live`) ; chaque carte garde ses boutons ; l'API inchangée (une réponse par échantillon). Selon la relance 2.7 : (a) même bouton pour « identification correcte » ; (b) « Détruire » proposé pour un non exploitable (aide `decisionAfterExploitable`, XS ≈ 1 h) | `reception-logic.ts`, `SerieReceptionForm.tsx`, `DepositForm.tsx`, `reception-widgets.tsx` | S ≈ 3 h (+ XS) | non | Revient sur le « jamais de tout cocher » du 10/10 (un clic délibéré, pas une pré-réponse) | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé ; (a)(b) : 2B |
| B3 | **Question « emballage » retirée** (Q70). C3 est obligatoire dans les deux API depuis le 12/10 (`reception-input.ts:320-327`, `serie-input.ts:506-510`). Faire : EMBALLAGE sort de `COMPLEMENTARY_CHECKS` (la clé reste dans le type pour relire l'historique) ; `packagingHint` et l'indication C4 supprimés ; les écrans ne demandent plus ; les API ne l'exigent plus (une ancienne page qui l'envoie est ignorée, pas refusée) ; `receptionPackagingOk` écrit `null` désormais (colonne gardée) ; le motif « Emballage ou contenant non conforme » reste dans la liste des motifs ; C5 « identification » reste | `reception-complementary.ts`, `reception-input.ts`, `serie-input.ts`, `serie-create.ts`, `api/series/[id]/reception/route.ts`, `api/series/route.ts`, `SerieReceptionForm.tsx`, `DepositForm.tsx`, `reception-logic.ts`, `programme-sheet-logic.ts` | S ≈ 4 h (≈ 70 références de test) | non | La checklist de réception perd C3 | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé |
| B4 | **E-mail « échantillon non reçu »** (Q74). Aujourd'hui seule la destruction est notifiée ; « Non reçu » (`cancel`, motif NON_RECU) n'écrit à personne (commentaire « lab question »). Faire : `src/lib/not-received-notice.ts` `notifyNotReceived(sampleId, actorId)` sur le modèle de l'avis de destruction ; gabarit `notReceivedEmail` (« Échantillon non reçu — dossier N° … » : date de la visite, site, désignation, ni analyse ni facture) ; un e-mail **par échantillon**, aux destinataires des rapports ; journal `NOT_RECEIVED_NOTIFIED` ; appelé après l'annulation, un échec d'envoi ne défait jamais l'annulation ; la carte dit « Client prévenu (envoi simulé) » tant que l'envoi réel n'est pas activé | `not-received-notice.ts`, `emails/templates.ts`, `api/samples/[id]/cancel/route.ts`, `email-log-filters.ts`, `audit-labels.ts`, `schema.prisma` | S ≈ 4 h | `EmailType` + `NON_RECU` (en fin) | Un e-mail là où il n'y en avait pas (quand l'envoi réel sera actif) | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé ; envoi simulé tant que l'envoi réel n'est pas activé |
| B5 | **Accord du client hors du bon** (Q75). `buildBonHtml` ajoute « — analysé avec l'accord de … » (`document-html.ts:516-523`). Faire : retirer cette branche ; garder « Non conforme — motif », « — détruit », « — en attente de l'avis du client » ; l'accord reste enregistré et visible du validateur | `document-html.ts` (+ test) | XS ≈ 1 h | non | Le bon (et la réimpression des anciens bons) ne porte plus l'accord | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |
| B6 | **Observation obligatoire réduite** (Q71, vide). Si la proposition est acceptée : `JUSTIFIED_KEYS = {DELAI, TRANSPORT_TEMP}` lu par `rowToJustify` — un seul endroit pour les deux écrans et les deux API | `reception-rules.ts` (+ tests) | S ≈ 2–3 h | non | Moins d'observations obligatoires | 2B (relance 3) |
| B7 | Q73, Q76 (vides) : rien si le défaut est gardé. Q77 : rien en lecture 1 ; en lecture 2 (refuser tout non-conforme), retirer « Analyser malgré tout » — non proposé | — | — | — | — | 2B (relance 2.9, 3) |

### 3.C Paillasse

| Id | Quoi | Où | Effort | Migration | Production | Statut |
|---|---|---|---|---|---|---|
| C1 | **Feuille de paillasse sans client** (Q55). `bench-sheet/route.ts` sélectionne `client.name` (l.68) ; la ligne imprime « Série NN · client · désignation · lot · titulaire ». Faire : retirer le client (sélection et HTML) ; corriger la docstring qui se disait déjà « à l'aveugle ». Le reste de la ligne (nature, désignation — le nom de la personne pour les mains —, série, lot, comme l'étiquette) : gardé tel quel, sauf si la relance 2.15 dit « le code seul » (XS de plus) | `bench-sheet-html.ts` (+ test), `api/bench-sheet/route.ts` | XS ≈ 1 h | non | Contenu de la feuille PG06/EN01 G (une nouvelle version du document : décision du laboratoire) | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |
| C2 | **Écrans du technicien sans client ; recherche des collègues** (Q55 suite, Q108). Le client est affiché dans `WorkQueue` (en-tête de série, chaque ligne), sur la fiche (`technicien/[id]` « Client »), dans `/recherche` (colonnes et filtre client / site). Si oui : une variante sans client pour TECHNICIEN, sans charger les clients ; `technicianSearchWhere()` = tous les échantillons pris (lecture seule), jamais d'export | `WorkQueue.tsx`, `serie-groups.ts`, `technicien/page.tsx`, `technicien/[id]/page.tsx`, `recherche/page.tsx`, `sample-search-server.ts`, `bench-access.ts` | S ≈ 2 h + S ≈ 3 h | non | Écrans du technicien | 2B (relance 2.14, 2.15) |
| C3 | **« Reprendre » l'échantillon d'un collègue** (Q107, lecture recommandée). Aujourd'hui (13/10) : 409 « Déjà pris par X », collègues en lecture seule, « Libérer » seulement sans résultat. Faire : `takeOverRefusal` pur (TECHNICIEN ; libre → « utilisez Prendre en charge » ; ligne héritée seule → administrateur ; hors paillasse ou bloqué → 409) ; `PATCH /api/samples/[id]/take` : sous `lockTakeState`, `updateMany` gardé par l'ancien titulaire (règle des écritures gardées), résultats intacts, journal `SAMPLE_TAKEN_OVER` (ancien titulaire, nombre de résultats) ; bouton « Reprendre cet échantillon » + confirmation dans la carte « Pris par un collègue » ; parcours « Repris par B — était pris par A ». **Avec lui** : `PUT …/results` garde `enteredById` / `enteredAt` des lignes inchangées (aujourd'hui toute sauvegarde réattribue **toutes** les lectures au dernier qui enregistre) → « Saisi par » par résultat à la validation. Saisie partagée simultanée (lecture 2) : M–L ≈ 16–18 h, non recommandée (concurrence par ligne, réécriture de `PROGRAMME.md` §10) | `bench-access.ts`, `bench-take-server.ts`, `api/samples/[id]/take/route.ts`, `api/samples/[id]/results/route.ts`, `sample-access.ts`, `technicien/[id]/page.tsx`, `BenchTakeActions.tsx`, `audit-labels.ts`, `sample-timeline.ts`, `validation/[id]/page.tsx` | S–M ≈ 6 h + ≈ 2 h | non | Règles de la prise en charge libre (13/10) : `PROGRAMME.md` §10, `WORKFLOW.md` §19 (et §8 / AGENTS §3b.5 si « Reprendre » est rangé parmi les verbes), lignes V14 | 2B (relance 2.13) — « Avec lui » construit le 21/10 (D-09, `e224170`, testé en local, non déployé ; « Saisi par » à la validation, pas encore à la paillasse) ; « Reprendre » (`takeOverRefusal`, PATCH /take, `SAMPLE_TAKEN_OVER`) non construit |
| C4 | **« 3(-2) » sur une ligne à valeur simple ; facteur visible** (lié à Q9 et Q79 ; aucune réponse nécessaire). `ACCEPTED_NOTATIONS` annonce « 3(-2) » partout, mais `parseLabValue` (lignes sans critère et n = 1 : aujourd'hui toutes les surfaces et mains, à cause de N2) ne le lit pas : « valeur non numérique », conformité manuelle, « 3(-2) » imprimé tel quel. Faire : `parseLabValue` lit « d(-k) » (0 → « < 10 ») et la valeur simple stocke la notation du laboratoire (« 3.10² ») ; la puce « Facteur ×N — votre lecture sera multipliée » aussi sur les lignes à valeur simple (aujourd'hui sur les lignes à critère seulement) ; ne pas toucher au moteur avant la relance 2.12 | `result-value.ts` (+ test), `api/samples/[id]/results/route.ts`, `ResultEntryForm.tsx` | S ≈ 2,5 h | non | Les futures saisies « 3(-2) » s'impriment « 3.10² » | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |
| C5 | **Retirer une analyse sans effacer les autres résultats** (Q91, avec F8). Aujourd'hui tout changement d'analyses dans « Corriger la fiche » efface **tous** les résultats de l'échantillon (`intake/route.ts:146, 161`) et le renvoie à la paillasse. Faire : aide pure `resultsToReset(avant, après, critèresChangés)` : un retrait seul efface seulement les résultats retirés, garde le statut ; ajouts et changements de famille / d'unités gardent la remise à zéro. Et refuser « NE », « non effectué », « non fait » tapés comme valeur (« Une analyse non faite se retire du programme »). Échantillon sans aucune analyse possible : « Annuler » (droits : D1) | `api/samples/[id]/intake/route.ts`, `intake-input.ts` (+ test), `result-value.ts`, `api/samples/[id]/results/route.ts` | S ≈ 4 h | non | « Corriger la fiche » (WORKFLOW §8) dans le cas du retrait | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; avertissement « déjà facturé » revu le 19/10 (vérification finale, dans l'arbre de travail, non commité) ; non déployé ; prévenir le client : relance 2.10 |
| C6 | **Unité du critère à l'écran de saisie** (Q40). La feuille, le résultat stocké, la validation et le rapport prennent l'unité du critère ; l'écran de saisie montre celle du paramètre (`technicien/[id]/page.tsx:184` → « /25 g » à côté d'un critère « /1 g »). Faire : `unit: plan?.unit ?? parameter.unit` (aide pure testée) | `technicien/[id]/page.tsx` | XS ≈ 1 h | non | Libellé d'unité à la saisie | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |
| C7 | **Contrôle serveur du choix manuel** (Q78, durcissement). La soumission ne revérifie pas qu'une conformité manuelle exigée a été choisie (seul l'écran bloque). Faire : dans `results/submit`, recalculer la règle et refuser une ligne dont `conform` est encore vide | `api/samples/[id]/results/submit/route.ts` | XS ≈ 1 h | non | Aucun cas valide refusé | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; non déployé |

### 3.D Validation, rapport, envoi (avec le lot 1b)

D1, D2, D5 touchent les mêmes fichiers (`report-dispatch.ts`, `ReportActions.tsx`,
`/validation/[id]`, `direction-guards.test.ts`) : D5 (avec D6) se construit en
vague 2 avec B1 ; D1 puis D2 en vague 3, sur la base de D5 déjà en place.

| Id | Quoi | Où | Effort | Migration | Production | Statut |
|---|---|---|---|---|---|---|
| D1 | **Rouvrir et annuler : administrateur, Direction, validateur** (Q13). Aujourd'hui rouvrir = ADMIN (route, `reopenRefusal` / `canReopen`, transitions, statut 409/403) ; annuler après le programme = ADMIN. Faire : `REPORT_REOPEN_ROLES` et `ANALYSIS_CANCEL_ROLES` = VALIDATEUR, DIRECTION, ADMIN dans `sample-status.ts` (transitions PROGRAMME / EN_ANALYSE / RESULTATS_SAISIS → ANNULE et VALIDE / RAPPORT_ENVOYE → RESULTATS_SAISIS) ; gardes des routes `reopen` et `cancel` ; réception : annule toujours avant le programme ; réactiver reste ADMIN ; motif, double validation par deux personnes et « annule et remplace » inchangés ; un lien du N° dans `/recherche` vers `/validation/[id]` pour ces rôles ; `role` dans le journal | `sample-status.ts`, `report-amendment.ts`, `report-dispatch.ts`, routes `reopen` / `cancel`, `sample-verbs.ts`, `recherche/page.tsx` ; tests `sample-status`, `report-amendment`, `direction-guards` | S ≈ 4 h | non | Élargit des droits en production. **Déployer seulement quand la Direction a ses comptes nominatifs et que les comptes de démonstration sont désactivés** (`scripts/disable-demo-accounts.sh`, `DEPLOY.md` « Go-live ») — masquer le panneau ne suffit pas, les comptes resteraient ouverts | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; ce que dit « Annuler » d'un échantillon facturé ou alerté revu le 19/10 (vérification finale, dans l'arbre de travail, non commité) ; **en production seulement avec les comptes nominatifs et les comptes de démonstration désactivés**, non déployé |
| D2 | **Plus d'envoi automatique** (Q92 A). Aujourd'hui `approve` → `issueReportFor` → `sendReport` → alertes (`validation/route.ts:179-256`) ; l'envoi est **simulé** en production (pas de clé d'envoi) mais fait passer l'échantillon à RAPPORT_ENVOYE et ouvre le rapport sur le portail. Faire : `approve` reçoit `send` (faux par défaut) ; deux boutons à la validation administrative, « Valider » (rien ne part) et « Valider et envoyer » ; « Envoyer au client » (route existante, `RESEND_REPORT_ROLES` : GESTIONNAIRE, VALIDATEUR, DIRECTION, ADMIN) sur un rapport validé non envoyé ; `sent` = envoyé depuis l'émission de **cette** version (sinon un -A1 jamais envoyé lit « Renvoyer ») ; tuile « Validés — à envoyer » groupée par série ; textes de l'amendement (« sera à envoyer »). Alertes : inchangées — à la validation technique quand `LabSettings.alertAfterTechnicalValidation` est vrai (défaut, choix du 29/09), sinon à la validation administrative ; l'appel `sendContaminationAlerts` d'`approve` reste fait même quand `send` est faux (seul `sendReport` passe derrière `send`) | `validation/route.ts`, `report-actions.ts`, `report-dispatch.ts`, `ValidationPanel.tsx`, `ResendReportButton.tsx`, `ReportActions.tsx`, `validation/page.tsx`, `circuit-views.ts` | S ≈ 5 h | non | Un échantillon validé reste VALIDE (hors portail) jusqu'à l'envoi : une liste « à envoyer » devient nécessaire | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; réouverture d'un rapport jamais envoyé revu le 19/10 (vérification finale, dans l'arbre de travail, non commité), règle : NEEDEDINFO Q132 ; non déployé |
| D3 | **Envoyer toute une série** (Q92 B) : `POST /api/series/[id]/reports/send`, chaque échantillon VALIDE avec rapport et sans amendement en attente, un e-mail par rapport | nouvelle route, `ValidationQueue.tsx` | S ≈ 3 h | non | — | 2B (relance 2.16) |
| D4 | **Valider toute une série** (Q92 C) : la logique par échantillon extraite dans `validation-server.ts` ; `POST /api/series/[id]/validation` ; plan pur `serieValidationPlan()` (éligibles / écartés avec raison : statut, amendement en attente, réglementation manquante, même signataire) ; bouton « Valider la série (n) » + dialogue | `validation-server.ts`, `serie-validation.ts`, nouvelle route, `ValidationQueue.tsx` | M ≈ 10 h | non | — | 2B (relance 2.16) |
| D5 | **Lot 1b — rapport aligné** (`RETOUR-LABO-14-10.md` §8, corrigé). `User.documentName` + aide pure `defaultDocumentName` (« Technicien de QUALILAB 'I.NOM' » : initiale du premier prénom, nom en capitales, prénoms composés, particules, accents) ; `reportSampler` l'imprime pour un prélèvement Qualilab ; champ « Dénomination sur les documents » dans /admin/utilisateurs (journal `USER_DOCUMENT_NAME_CHANGED`) ; **marqueur de mise en page** `layout: 2` écrit à l'émission : avec lui, « N/A » pour tout vide du bloc (un `na()` propre au rapport, jamais le `show()` partagé), libellés « Lieu de prélèvement », « Date Prod », « Date Exp », « JJ/MM/AAAA HH:MM », **une** date d'analyse = `assignedAt ?? programmedAt ?? receivedAt` (la prise en charge à la paillasse depuis le 13/10), réception = `Serie.arrivedAt ?? receivedAt` ; sans marqueur, le rendu du 13/10. **Rendu d'abord figé** : la version courante se rend depuis sa `ReportVersion` quand elle existe (tout rapport émis depuis le 09/10), pour qu'un duplicata d'un rapport déjà envoyé ne change pas — **toujours passée par `withSilentCorrection(frozen.data, report.conclusion)`**, comme `loadReportData` le fait déjà pendant un amendement (`report-dispatch.ts:298`) : le rendu vivant d'aujourd'hui existe pour que la correction de conclusion de l'administrateur (`admin-edit`) s'affiche, et elle doit continuer de s'afficher. E-mail : date de réception = l'arrivée | `schema.prisma`, `document-name.ts`, `report-template.ts`, `report-html.ts`, `report-dispatch.ts`, `emails/templates.ts`, `api/admin/users/[id]/route.ts`, /admin/utilisateurs | M ≈ 10 h | `User.documentName VARCHAR(191) NULL` | Le rapport imprimé (modèle M) ; sans le rendu figé, chaque re-téléchargement d'un ancien rapport changerait | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé (répétition du 19/10 : les 92 rapports de la copie locale rendus à l'identique) |
| D6 | **Dénomination sur le protocole** (Q22). Aujourd'hui « Prélèvement effectué par : nom complet — Fonction : Préleveur » (`document-html.ts:453-455`, route `document`). Faire : la dénomination (D5) à la place, sans « — Fonction : » (elle porte déjà la fonction) ; même texte dans la case signature et le « déposé par » du bon ; Client / Autre inchangés | `series/[id]/document/route.ts`, `document-html.ts` (+ test) | XS ≈ 1 h | (celle de D5) | En-tête du protocole PG04/EN01 (nouvel indice de version : décision du laboratoire) | 2A — construit le 19/10, vague 2 (`d7b8750`), testé en local ; non déployé |
| D7 | **Logo d'accréditation, cachet** (Q14, vide). `CompanySettings.accreditationLogoData` / `stampData`, téléversés dans /admin/entreprise ; logo d'accréditation dans le cartouche **seulement** une fois les analyses non accréditées marquées (D9) ; cachet sous « Direction » ; vérifier la tenue sur deux pages | `schema.prisma`, `company-input.ts`, `CompanyForm.tsx`, `report-html.ts` | S–M ≈ 4–6 h | deux `LONGTEXT NULL` | Le rapport imprimé | Données + 2B |
| D8 | **Copies internes des alertes** (Q93) : `CompanySettings.alertCopyEmails`, copie = adresse générale + liste | `schema.prisma`, `company-input.ts`, `report-dispatch.ts` | S ≈ 3 h | `TEXT NULL` | — | 2B |
| D9 | **Rapport, là où le modèle M est muet** (Q104 ; la relance du 18/10 relettre les sous-points (a)–(g) : (f) = conclusion en annexe et « (VC) », **(g) = accréditation** = l'ancien (h) ; l'ancien (f), la date d'analyse, est réglé par D5). (d) un moyen de prélèvement par type (proposé : écouvillon / flacon stérile / sachet stérile ou emballage d'origine ; air = méthode ; sinon « N/A ») ; (g) `AnalysisParameter.accreditationMark` (« * », « SA », « SN »), repris des noms de l'ancien logiciel (« … * », « … (SA) »), imprimé après le nom de l'analyse | `report-template.ts`, `report-html.ts`, `schema.prisma`, /admin/parametres, reprise | S ≈ 2 h ; M ≈ 8–10 h | (g) `VARCHAR(4) NULL` | Le rapport imprimé | 2B (relance partie 4, Q104 (d), (g)) |
| D10 | **Analyses qui déclenchent l'alerte** (question nouvelle 2.21) : réglage par paramètre (`alertOnExceed`) dans /admin/parametres — aucun code | — | — | non | — | Propriétaire, après la relance |

### 3.E Clients

| Id | Quoi | Où | Effort | Migration | Production | Statut |
|---|---|---|---|---|---|---|
| E1 | **Créer un client au comptoir et sur le terrain** (R2, Q116 ; conception §4.5 corrigée). `POST /api/clients` et `GET /api/clients/similar` ouverts à RECEPTIONNISTE et PRELEVEUR **en création seule** ; un seul champ obligatoire, « Nom du client (société ou particulier) » ; adresse, site (sinon « Siège »), **lieux de prélèvement habituels** (`places[]`, ≤ 20, créés comme `ClientPlace` sous le site dans la même transaction, dédoublonnés par `normalizeLabel`) ; contact, téléphone, ICE repliés dans « Autres informations » ; pour ces rôles le serveur ignore `email` **et** `emails` (l'adresse unique est le destinataire par défaut des rapports, `email.ts:152`) ; `confirmDuplicate` permis, journalisé, et pose « À compléter » ; N1 (nom d'une fiche archivée fusionnée → son client et son site) ; homonymes entre particuliers : le 409 propose d'ajouter la ville ou le téléphone. `QuickClientDialog`, `ClientPicker` `allowCreate` (jamais dans les sélecteurs de fusion, de rattachement ni de facturation), plein écran sur téléphone ; la liste des clients proches propose « Utiliser ce client » (pas de lien vers /commercial, fermé à ces rôles) | `api/clients/route.ts`, `api/clients/similar/route.ts`, `client-validation.ts`, `quick-client.ts` (nouveau, pur), `QuickClientDialog.tsx` (nouveau), `ClientForm.tsx`, `ClientPicker.tsx`, `DepositForm.tsx`, `VisitForm.tsx` ; tests `quick-client`, `client-creation-guards` | M ≈ 13 h | non | Deux gardes élargies (création seule) | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; non déployé ; formulation : relance 2.4 |
| E2 | **Site complet** (R3) : sous-formulaire nom\*, adresse, ville, contact, téléphone dans `SitePicker` (aujourd'hui `{ name }` seul, `SitePicker.tsx:127-130`) | `SitePicker.tsx`, `site-input.ts` | S ≈ 3 h | non | Étend le lot 1 | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; non déployé |
| E3 | **« À compléter »** (R4). `Client.toComplete` (vrai à la création par RECEPTIONNISTE / PRELEVEUR, effacé par un enregistrement complet de la fiche par GESTIONNAIRE / ADMIN, journalisé) ; badge sur la fiche, bascule « À compléter (N) » dans la liste ; ce qui manque (ICE, adresse des rapports, adresse) par une aide pure `clientCompletionGaps`. `createdById` abandonné (le journal nomme le créateur) | `schema.prisma`, `api/clients/route.ts`, `api/clients/[id]/route.ts`, `commercial/page.tsx`, `commercial/[id]/page.tsx`, `ClientList.tsx` | S ≈ 3 h | `Client.toComplete BOOLEAN NOT NULL DEFAULT false` — aucun UPDATE | Nouvelle colonne | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; non déployé ; confirmé en relance 2.5 |
| E4 | **Fusion par le commercial** (Q117). `merge` et `attach-as-site` sont ADMIN (`requireApiRole("ADMIN")`, page `/commercial/[id]` l.530). Faire : `merge` → GESTIONNAIRE + ADMIN ; `canMergeClients(role)` ; `role` dans `CLIENT_MERGED` ; aperçu inchangé (« ne se défait pas ») ; option : avertir dans l'aperçu des factures émises avant le 10/10 sans instantané. `attach-as-site` ouvert pareil **après** la relance 2.5. Tests : `direction-guards` (retirer les deux POST de ADMIN_ONLY), nouveau `client-merge-guards`, `client-actions-logic` | routes `merge` / `attach-as-site`, `commercial/[id]/page.tsx`, `client-actions-logic.ts`, `ClientMergeActions.tsx`, `CLIENTS-FUSION.md` | S ≈ 3–4 h | non | Une règle en vigueur depuis le 08/10. **Avant le déploiement : la décision du propriétaire sur l'instantané `Invoice.clientSnapshot`** des factures émises avant le 10/10 (HANDOFF §9) — de vraies fusions deviennent possibles sans nous | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; **en production après la décision du propriétaire sur `Invoice.clientSnapshot`**, non déployé ; rattachement : 2B (administrateur seul) |
| E5 | **Chaînes et sites** (Q45, non revenue) : envoyer aussi aux adresses d'un site ; une facture par client. Le garde-fou, lui, est en §5 (D-04) | `email.ts`, `report-dispatch.ts`, `ClientForm.tsx` | S–M ≈ 5 h | non | Destinataires des chaînes | 2B |
| E6 | **Doublons réels** (Q54, non revenue) : le commercial traite la liste dans le logiciel (après E4), ou le fichier validé revient | — | — | — | — | 2B / Propriétaire |

### 3.F Catalogue, familles et critères

Ordre : **F2 → F1 → F3 (mesure en lecture sur la copie locale, puis la copie
locale, puis la production par l'exploitant après un tag et un dump étiqueté)
→ F4 → F5 (après F3, sinon le filtre préréglé est vide) → F6 → F7 en dernier**.
F8 et F9 sont indépendants. Les listes de familles (dont certaines portent un
nom de client) restent hors du dépôt.

| Id | Quoi | Où | Effort | Migration | Production | Statut |
|---|---|---|---|---|---|---|
| F1 | **RP2a′ — le type d'analyse de chaque famille.** `ProductType.natureId` (FK `AnalysisNature`, SET NULL, index `[natureId, active]`) ; `validateProductType` l'accepte (une nature active) et en déduit le domaine ; renvoyé par `GET /api/product-types` (+ filtres `?natureId=` / `?category=`) et `loadProgrammeReferential`. Ni `ProductTypeGroup`, ni `groupId`, ni `description` | `schema.prisma`, `criteria-input.ts`, routes product-types, `programme-referential.ts`, `programme-sheet-types.ts` | XS–S ≈ 2 h | `ProductType.natureId VARCHAR(191) NULL` + index + FK | — | 2A — construit le 19/10, vague 4 (`b898586`), testé en local ; non déployé |
| F2 | **Critère « sans limite » enregistrable.** `validateCriterion` refuse « m non spécifiée » sans M (`criteria-input.ts:89-91`), alors que la reprise de l'ancien logiciel en écrit (`legacy-catalogue.ts:164-168`) et que `PUT …/criteria` revalide **toutes** les lignes : la grille d'une famille qui en contient **ne peut plus être enregistrée** aujourd'hui. Faire : accepter « sans limite — résultat sans verdict » (l'interprétation le gère déjà) ; compter les lignes concernées sur la copie locale. *Construit (vague 1, revu le 19/10) : un m envoyé avec « m non spécifiée » reste refusé (jamais effacé en silence) ; la tolérance c est acceptée sur toute limite unique (m seule, M seule, m = M, réponse à Q31) et, avec n = 1, jusqu'à 998 — les grilles reprises portent n = 1, c = 1 ou 2. Conséquence : un échantillon d'une seule unité au-dessus de la limite est « Acceptable » (conforme, sans alerte) ; la grille l'écrit sous la ligne, règle à confirmer (NEEDEDINFO Q131). Changer le type de limite, ou vider M d'une ligne « m et M chiffrés », efface c : sa signification change.* | `criteria-input.ts` (+ test), `CriteriaGrid.tsx` | XS ≈ 1 h | non | Défaut latent corrigé | 2A — construit le 19/10, vague 1 (`9770bb0`), testé en local ; grille jusqu'à 1000 lignes et c sans objet effacé revu le 19/10 (vérification finale, dans l'arbre de travail, non commité) ; non déployé ; règle c avec n = 1 : NEEDEDINFO Q131 |
| F3 | **RP2b′ — la reprise étendue** (Q121, Q126, Q43, Q56, Q129). Écran « Catalogue de l'ancien logiciel », analyse puis validation, idempotent, ADMIN, journalisé : (a) `natureId` depuis la colonne `echantillon` de l'ancien logiciel (`AnalysisNature.legacyId`), domaine depuis la nature — seulement où c'est vide ou par défaut, jamais sur une modification manuelle ; valeurs inconnues listées ; (b) **N2 / OLD31** : chaque critère d'une famille mains / surface / eau / air rattaché à un paramètre d'une autre catégorie est **copié** sur le paramètre de même germe de sa catégorie (créé au besoin avec l'unité du critère — UFC/mains, UFC/cm², UFC/100 mL — et le domaine de la nature), puis l'ancien passe `active = false` (jamais d'UPDATE de `parameterId`) ; (c) **Q43** : une famille sans aucun critère actif prend les critères de l'ancien logiciel (le classeur l'emporte seulement quand il dit quelque chose) ; (d) **Q56 / Q129** : « Hygiène des surfaces » → nature PC_SURFACES, paramètres AMBIANCE + CHIMIE (allergènes, sulfites, éthanol, SARS-CoV-2 ; sans limite) ; la famille sensorielle → ANALYSE_SENSORIELLE, domaine AUTRE ; un paramètre inconnu se crée dans la catégorie de la nature (aujourd'hui toujours ALIMENTAIRE / MICRO). Puis la liste des familles encore vides envoyée au laboratoire, hors dépôt | `legacy-catalogue.ts` (+ test), `api/admin/import/legacy/route.ts`, `criteria-match.ts`, `ImportLegacy.tsx`, `scripts/legacy/extract-legacy.py` | M ≈ 12 h | non (données, journalisées) | Les critères des familles mains / surfaces / eaux / air **commencent à s'appliquer** (les plans de paillasse lisent les critères vivants) : la lancer quand aucun tel échantillon n'est en cours | 2A — construit le 19/10, vague 4 (`b898586`), testé en local, reprise rejouée sur un schéma local remis dans l'état de la production du 01/10 ; **en production : geste de l'exploitant après le déploiement** (`DEPLOY.md` « Lot 2 du 16/10 », reprise F3) |
| F4 | **RP2d + RP1 — « Familles & critères »** (Q122, Q125). Pages `/programmation/familles` et `/programmation/familles/[id]` réutilisant `ProductTypesManager`, `RegulationEditor`, `CriteriaGrid` (prop `basePath` au lieu des liens `/admin/types-produits` écrits en dur) ; liste groupée par type d'analyse ; filtres Type d'analyse (« à préciser »), Client, Actives / Inactives, **Sans critère** (pour Q43), recherche sur le nom et les germes ; champ « Type d'analyse » à la création et dans l'en-tête de la famille ; gardes élargies à PROGRAMMATEUR + ADMIN sur `POST /api/product-types`, `PATCH …/[id]`, `PUT …/criteria`, `GET ?all=1` ; paramètres, normes, profils, réglementations, `/admin/*` restent ADMIN ; TECHNICIEN exclu ; menu « Familles & critères » | `programmation/familles/*`, `ProductTypesManager.tsx`, `CriteriaGrid.tsx`, `RegulationEditor.tsx`, routes product-types, `programmation-nav.ts` ; tests `programmation-guards` (nouveau), `technician-guards`, `nav-for-role` | M ≈ 10 h | non | `PROGRAMME.md` §2 (« pas de configuration ») devient faux | 2A — construit le 19/10, vague 4 (`b898586`), testé en local ; non déployé |
| F5 | **RP5 — « Choisir une famille de produits »** (Q124). Dialogue partagé sur la fiche de programme à la place du select : Type d'analyse préréglé sur la nature de l'échantillon (« Tous » possible ; pour un aliment, les familles « à préciser » aussi), recherche sans accents, familles du client en tête, nombre de critères, clavier ; `filterFamilies` pur. En plus : `GET /api/product-types?category=ALIMENTAIRE` pour `LineEditor`, `DepositForm`, `SampleVerbs` | `ProgrammeSheet.tsx`, `FamilyPickerDialog.tsx` (nouveau), `programme-sheet-logic.ts`, `programme-referential.ts`, `api/product-types/route.ts` | M ≈ 6 h | non | Le sélecteur de la fiche de programme | 2A — construit le 19/10, vague 4 (`b898586`), testé en local ; famille corrigeable après la paillasse (× F8) revu le 19/10 (vérification finale, dans l'arbre de travail, non commité) ; non déployé |
| F6 | **RP6 — « Paramètres à rechercher »** (Q123, Q40). La famille choisie devient la liste germe · norme · **unité du critère** · n / c / m / M, cochés d'office, « Cocher tout », « Décocher tout », « N paramètre(s) coché(s) » ; « Autres analyses » repliable ; aperçu sans toucher au brouillon ; `applyProductType` (`programme-sheet-logic.ts:181`, aujourd'hui additif) devient un remplacement : il retire les germes venus seulement de l'ancienne famille et garde ceux cochés à la main (et les demandes du préleveur) ; « — aucun — » idem (aujourd'hui il détache seulement la famille). `LineEditor` / `DepositForm` restent additifs | `programme-sheet-logic.ts` (+ test), `ProgrammeSheet.tsx`, `programme-sheet-types.ts`, `PROGRAMME.md` §4 | S ≈ 5 h | non | Changer de famille **retire** désormais des analyses | 2A — construit le 19/10, vague 4 (`b898586`), testé en local ; avertissement « déjà facturé » revu le 19/10 (vérification finale, dans l'arbre de travail, non commité) ; non déployé |
| F7 | **RP4 — les mots** (Q120). « Famille de produits » / « Familles de produits » / « Familles du client » (≈ 65 textes, ≈ 25 fichiers, messages des API compris) ; « Domaine » là où « Famille » veut dire Micro / PC. Aucun identifiant, aucune route, aucun enum ne change ; jamais imprimé (Q34) | `ProgrammeSheet.tsx`, `LineEditor.tsx`, `DepositForm.tsx`, `SampleVerbs.tsx`, pages validation / paillasse / admin, `admin-nav.ts`, `programme-input.ts`, `intake-input.ts`, `criteria-input.ts`, routes | S ≈ 4 h | non | Vocabulaire des écrans | 2A (en dernier) — construit le 19/10, vague 4 (`b898586`), testé en local ; non déployé |
| F8 | **RP3b — les analyses après le programme** (Q128). `correctionRights(role, statut)` pur → { identification, analyses } : identification = rôles actuels de « Corriger la fiche » ; analyses = ADMIN toujours, RECEPTIONNISTE / VALIDATEUR / DIRECTION seulement avant le programme, PROGRAMMATEUR en EN_ANALYSE et RESULTATS_SAISIS ; la route `intake` refuse champ par champ (403 « Après la confirmation du programme, les analyses se changent par le responsable des paramètres. ») ; le dialogue ne montre que ce que le rôle peut changer. Avec C5 | `sample-verbs.ts`, `api/samples/[id]/intake/route.ts`, `intake-input.ts`, `SampleVerbs.tsx`, `programmation/[id]/page.tsx`, `ProgrammeSheet.tsx` ; tests `direction-guards`, `technician-guards` | S ≈ 5 h | non | La réception, le validateur et la Direction **perdent** le changement d'analyses après la confirmation | 2A — construit le 19/10, vague 3 (`124af3a`), testé en local ; non déployé |
| F9 | **RP7 — « Analyse sensorielle »** (Q129). `programmeNatureFamilies(famille, jumeau)` : depuis MICRO ou CHIMIE, la même famille + les natures AUTRE du même type de ligne ; depuis AUTRE, la famille d'origine (suffixe « …M » / « …P », `twinOfCode`) ; utilisé par les quatre endroits qui filtrent les natures ; code et N° de contrôle inchangés ; garder n = 1 pour la sensorielle. « Analyse physique » : rien | `programme-input.ts` (+ test), `programme-referential.ts`, `programme-sheet-logic.ts`, `ProgrammeSheet.tsx`, `sample-code.ts` | S ≈ 4 h | non | Assouplit « même famille seulement » (07/10) pour les natures AUTRE | 2A — construit le 19/10, vague 4 (`b898586`), testé en local ; n = 1 et famille retirée revu le 19/10 (vérification finale, dans l'arbre de travail, non commité), n de la sensorielle : NEEDEDINFO Q133 ; non déployé |

RP2c (écrans des catégories) : **abandonné**. N2 et OLD31 : dans F3.

*19/10 — ce que la revue de la vague 4 a ajouté (construit en local) :*
F3 — un paramètre créé pour un rattachement est le **jumeau** de son germe
(alerte de contamination, limite, seuil, facteur copiés ; unité seulement si
ses critères hors mains s'accordent) ; un jumeau qui ressemble à un paramètre
existant de sa catégorie (« Salmonelles » / « Salmonelles surfaces ») est
listé, et l'import attend un alias dans « Paramètres » ou une confirmation ;
« jamais sur une modification manuelle » vaut aussi pour les critères (grille
enregistrée à la main : rien de l'ancien logiciel, sauf si la famille n'a
aucune ligne) et pour la réglementation (pas de nouveau lien) ; l'analyse
compte les échantillons en cours dont le verdict change (commencent à être
jugés / perdent leurs critères, par statut) et « Importer… » les fait
confirmer ; l'import porte l'empreinte de l'analyse (409 « relancez
l'analyse » sinon) ; les paramètres alimentaires vidés par les copies sont
listés (D-13). Le chemin de production a été rejoué une fois sur un schéma
local jetable (`HANDOFF.md` §8). F5 — Entrée dans la recherche va à la
première famille trouvée, sans choisir ; le filtre « Type d'analyse » est dit
« nature d'analyse de l'échantillon ». F6 — le message du changement de
famille est en section 1 (ambre quand une analyse part ou que n baisse,
« n : 9 → 3 ») ; le panneau s'appelle « Analyses hors famille » et ne se
referme plus sous le curseur. F9 — un échantillon seul (code sans lettre)
ne revient de « Autres analyses » qu'au domaine d'où il est venu (journal).

*19/10 — revue finale des quatre vagues (construit en local, `HANDOFF.md`
§8) :* F2 — une grille prend jusqu'à 1000 lignes (la famille reprise
« AUTRES » en a 346) et la reprise n'écrit plus, et efface (e), la
tolérance c sans objet (critère d'absence, ligne sans limite) ; F9 — « garder
n = 1 pour la sensorielle » construit (n ramené à 1 et famille retirée en
passant en « Analyse sensorielle »), l'ancien logiciel donnant n = 5 à sa
famille sensorielle : NEEDEDINFO Q133 ; F5 × F8 — la famille d'une ligne
eau, surface, mains ou air se corrige aussi après le début de la paillasse ;
C5 / F6 / F8 après facturation — avertissement à l'enregistrement et
« Analyses modifiées après facturation » sur la facture ; D2 × D1 — la
réouverture d'un rapport jamais envoyé le dit (NEEDEDINFO Q132).

### 3.G Ancien logiciel (Q130)

| Id | Quoi | Effort | Migration | Statut |
|---|---|---|---|---|
| — | Abandonnés (barrés) : OLD9 échantillon témoin, OLD13 référence client par échantillon, OLD28 neutralisant, OLD21 diluant, OLD33 « DPC », OLD36 multi duplication | — | (les colonnes prévues ne seront pas créées) | abandonné |
| G1 | (g) OLD44 — boutons rapides sous chaque case de résultat, choisis selon le plan de la ligne (« Absence », « Présence » ; « < 10 », « > », « .10² »…« .10⁶ », « Indénombrable »), insertion au curseur ; `quickEntries` / `insertNotation` purs | S ≈ 2,5 h | non | 2B (relance 2.20) |
| G2 | (h) OLD47 — note de saisie : « Ajouter une note » hors anomalie ; **aujourd'hui `Result.note` s'imprime sur le rapport du client** (`report-dispatch.ts:210` → `report-html.ts:302`, descriptions d'anomalie comprises — jamais documenté). Si « interne » : ne plus l'imprimer sur les nouveaux rapports ; si « les deux » : `Result.reportNote` | XS–S ≈ 2 h (S ≈ 4 h + S ≈ 3 h selon la réponse) | selon la réponse | 2B (relance 2.20) |
| G3 | (i) OLD12 — « Préleveur Qualilab » au « Nouveau dépôt » + liste des préleveurs ; date et heure de prélèvement obligatoires ; le rapport imprime la dénomination (D5) | S ≈ 5 h | non | 2B (relance 2.20) ; le défaut serveur : §5 D-05 |
| G4 | (j) OLD37 — « Échantillon précédent / suivant » dans la même série, fiche de programme et fiche de saisie ; garde « modifications non enregistrées » | S ≈ 4 h | non | 2B |
| G5 | (k) OLD50 — « Reçus depuis plus de N jours » à la paillasse et « reçu il y a N j » sur chaque ligne (jours calendaires, fuseau du laboratoire) | S ≈ 3 h | non | 2B |

## 4. Ordre, migrations, points de retour, recette

**Vagues proposées** (chacune : contrôles tsc / eslint / vitest / build, revue
adverse, test local au navigateur, déploiement hors des heures de travail,
TESTPLAN V16 en production sur « TEST UI » seulement) :

| Vague | Contenu | Effort | Migrations | Préalables |
|---|---|---|---|---|
| 1 — corrections sûres | A2, A4, B5, C1, C4, C6, C7, F2, et les défauts D-04, D-05 (§5) | ≈ 11 h | aucune | — |
| 2 — terrain et comptoir | A1, A5, A6, A7, A8 ; B1, B2, B3, B4 ; D5 + D6 (lot 1b, qui imprime l'arrivée de B1) | ≈ 56 h | `HandsState` + ASEPTISEES, `Sample.surfaceAreaNote`, `Sample.airExposureMin`, `EmailType` + NON_RECU, `User.documentName` (une migration) | Prévenir le laboratoire (T° ambiante obligatoire, « Prélevé le » obligatoire) ; tag + dump étiqueté |
| 3 — droits, envoi, clients | D1, D2 ; E1, E2, E3, E4 ; C5 + F8 (mêmes fichiers) | ≈ 41 h | `Client.toComplete` | **Comptes nominatifs + comptes de démonstration désactivés** (`disable-demo-accounts.sh`, pas seulement le panneau) (D1) ; **décision sur l'instantané des factures** (E4) ; tag + dump |
| 4 — catalogue | F1, F3, F4, F5, F6, F9, puis F7 | ≈ 43 h | `ProductType.natureId` | F3 : mesure en lecture et essai sur la copie locale d'abord ; production par l'exploitant après tag + dump |
| 2B — au fil de la relance | A3, A9, A10, B2 (a)(b), B6, C2, C3, D3, D4, D7, D8, D9, E4 (rattachement), E5, G1–G5, et les questions non revenues (Q8, Q81, Q86…) | ≈ 110–130 h si tout est accepté comme proposé | additives, selon les réponses | la relance du 18/10 |

**Total du lot 2A (lot 1b compris) : ≈ 150 h, soit ≈ 19 jours** (vagues 1 à
4 : A ≈ 26 h, B ≈ 22 h, C ≈ 9,5 h, D ≈ 20 h, E ≈ 22,5 h, F ≈ 49 h, défauts
≈ 1,5 h). Pour mémoire, le plan du 14/10 estimait le lot 2 à ≈ 116 h sans le lot 1b,
la réception du 16/10 (B1–B5), les droits (D1, D2) ni la paillasse (C4–C7).

**Migrations du lot 2A** (toutes additives, écrites à la main, vérifiées
contre `prisma migrate diff`, **aucun UPDATE de données réelles**) :
`HandsState` + `ASEPTISEES` ; `Sample.surfaceAreaNote` ; `Sample.airExposureMin` ;
`EmailType` + `NON_RECU` ; `User.documentName` ; `Client.toComplete` ;
`ProductType.natureId`. Les données de F3 passent par l'écran journalisé
(remplissage des vides, copies, `active = false`), jamais par une migration.
**Un point de retour (tag + dump étiqueté hors rotation) avant chaque
déploiement qui en porte une.**

**Recette** : `TESTPLAN.md` Checkpoint V16 (une section par vague). En
production, chaque rôle se connecte en cliquant son compte de démonstration,
rien n'est tapé ; **une fois les comptes de démonstration désactivés**
(préalable de la vague 3), les lignes de production de V16-3 et V16-4 sont
faites par le propriétaire avec ses propres comptes — un agent ne tape jamais
de mot de passe en production. Le catalogue est partagé : en production, on ne
modifie jamais une famille réelle (familles « TEST UI … » créées pour le
test).

**État au 19/10 — construit et testé en local, non déployé.** Les quatre
vagues ont été construites l'une après l'autre sur la branche
`lot2-retour-16-10`, chacune revue par des relecteurs adverses puis testée
sur la copie locale (`qlab-local-db`, client « TEST UI 2026-10-06
Traiteur » et données « TEST UI V16 … » seulement) :

| Vague | Commit | Construit | Recette locale (19/10, passe finale) | Avant la production |
|---|---|---|---|---|
| 1 — corrections sûres | `9770bb0` | A2, A4, B5, C1, C4, C6, C7, F2, D-04, D-05 ; aucune migration ; revue adverse (15 points) | `v16-1-local` 63/63 | — |
| 2 — terrain, comptoir, lot 1b | `d7b8750` | A1, A5, A6, A7, A8, B1, B2, B3, B4, D5, D6 ; migrations `20261019100000`, `20261019110000`, `20261019120000` ; revue adverse (15 points) | `v16-2-local` 109/109 | réponses 2.1 (états des mains) et 2.6 (heure inconnue) de la relance, **ou** décision écrite du propriétaire de livrer les propositions (un interrupteur chacune, `HANDOFF.md` §9) ; prévenir le laboratoire |
| 3 — droits, envoi, clients | `124af3a` | D1, D2, C5, F8, E1, E2, E3, E4 ; migration `20261019130000` ; revue adverse (26 points) | `v16-3-local` 67/67 | comptes nominatifs et comptes de démonstration **désactivés** (D1) ; décision du propriétaire sur `Invoice.clientSnapshot` (E4) |
| 4 — catalogue | `b898586` | F1, F3, F4, F5, F6, F7, F9 ; migration `20261019140000` ; revue adverse (31 points) | `v16-4-local` 73/73 | F3 en production : geste de l'exploitant **après** le déploiement (second dump, analyse, alias, échantillons en cours, import, nouvelle analyse vide) |
| Vérification finale | `d9dcd2d` | revue de toute la branche (3 constats moyens, 3 faibles), puis dix corrections : grille jusqu'à 1000 lignes et c sans objet effacé (F2), « Analyses modifiées après facturation » (C5 / F6 / F8), ce que dit « Annuler » d'un échantillon facturé ou alerté (D1), famille corrigeable à la paillasse (F5 × F8), réouverture d'un rapport jamais envoyé (D2 × D1), « Analyse sensorielle » à n = 1 (F9), date de réception = l'arrivée dans l'export Excel et /recherche ; aucune migration | `v16-final-local` 21/21, `v16-final-ui` 7/7 ; non-régressions `v15-lot1` 24/24 et `v14-take` 40/40 | fusion dans `master` au déploiement ; Q131, Q132, Q133 : défauts construits, à confirmer (NEEDEDINFO §1b) |

- **Contrôles** (branche + vérification finale) : `npx tsc --noEmit` 0,
  `npx eslint src` 0, vitest 117 fichiers / 2 312 tests, `npm run build`
  (93 pages). Aucune nouvelle route d'API sans garde ; `prisma migrate diff`
  vide ; 39 migrations.
- **Répétition du déploiement** (19/10, copie locale au schéma de la
  production, 34 migrations) : les cinq migrations appliquées par
  `prisma migrate deploy` puis par la commande `migrate` de l'image Docker ;
  les 44 tables identiques ligne à ligne avant / après ; les valeurs d'enum
  ajoutées en fin ; les 92 rapports de la copie rendus octet pour octet comme
  par `master` ; 84 pages et PDF à 200 sur un build de production. Une
  réserve : le retour arrière par le code seul n'est possible que tant
  qu'aucune ligne ne porte `ASEPTISEES` ni `NON_RECU` (`DEPLOY.md`).
- **Un seul déploiement** pour les quatre vagues (cinq migrations), dans
  l'ordre de `DEPLOY.md` « Lot 2 du 16/10 » : il réunit donc les préalables
  des vagues 2 et 3. Comme les comptes de démonstration seront désactivés,
  **toutes** les lignes de production de TESTPLAN V16 sont faites par le
  propriétaire avec ses comptes. Rien n'a été fait en production.

## 5. Défauts trouvés en vérifiant le code (aucune réponse nécessaire)

| # | Défaut | Conséquence | Correction | Où dans le plan |
|---|---|---|---|---|
| D-01 | « 3(-2) » non lu sur une ligne à valeur simple, alors qu'il est annoncé partout | Conformité manuelle, « 3(-2) » brut sur le rapport | C4 ; contrôle en lecture en production (par l'exploitant) des résultats de cette forme | Vague 1 — construit le 19/10 (C4, `9770bb0`), testé en local ; le contrôle en lecture en production (§6.6) reste |
| D-02 | `validateCriterion` refuse les critères « sans limite » que la reprise écrit | La grille de ces familles ne s'enregistre plus | F2 | Vague 1 — construit le 19/10 (F2, `9770bb0`), testé en local |
| D-03 | Le rendu de la version courante d'un rapport (et de son duplicata) lit les données vivantes avec le code du jour — exprès, pour que la correction de conclusion de l'administrateur s'affiche | Tout changement du gabarit change les rapports déjà envoyés quand on les re-télécharge | D5 (rendu d'abord figé, avec `withSilentCorrection`, + marqueur) | Vague 2 — construit le 19/10 (D5, `d7b8750`), testé en local |
| D-04 | `recipientsFor` ignore `ClientEmail.siteId` ; `ClientForm` ne montre pas le site d'une adresse | Une adresse de site cochée « rapports » recevrait les rapports de **tous** les sites du client | Montrer « (site X) » à côté de l'adresse et n'utiliser une adresse de site que pour son site (XS ≈ 1 h). *Construit (vague 1, revu le 19/10) : « site X — ce site seulement » aussi sur la fiche (lecture) ; l'adresse de la fiche (`Client.email`) n'est plus le repli quand c'est celle d'un autre site ; quand toutes les adresses appartiennent à d'autres sites, le refus le dit (« … appartiennent à d'autres sites. Ajoutez une adresse générale ») au lieu de « Aucune adresse enregistrée »* | Vague 1 — construit le 19/10 (`9770bb0`), testé en local |
| D-05 | Un dépôt QUALILAB sans `samplerUserId` prend l'auteur de la saisie comme préleveur (`serie-create.ts:201-214`) | Une réceptionniste nommée préleveur (inatteignable depuis l'écran actuel) | Refuser sans préleveur quand l'auteur n'est pas PRELEVEUR (XS ≈ 0,5 h) | Vague 1 — construit le 19/10 (`9770bb0`), testé en local |
| D-06 | `validateSerie` refuse un dépôt envoyé avec une arrivée mais sans heure de prélèvement (« L'arrivée … précède le prélèvement ») | Inatteignable depuis l'écran actuel ; bloquerait B1 | B1 (3) | Vague 2 — construit le 19/10 (B1, `d7b8750`), testé en local |
| D-07 | La visite accepte un « Prélevé le » vidé, remplacé en silence par l'instant d'enregistrement | Une heure de prélèvement fausse possible | B1 (4) | Vague 2 — construit le 19/10 (B1, `d7b8750`), testé en local |
| D-08 | La soumission ne revérifie pas un choix de conformité manuelle exigé | Seul l'écran bloque | C7 | Vague 1 — construit le 19/10 (C7, `9770bb0`), testé en local |
| D-09 | `PUT …/results` réattribue **toutes** les lectures au dernier qui enregistre | « Qui a saisi quoi » se perd (le journal garde des compteurs, pas les valeurs) | C3 (« Avec lui » : `PUT …/results` garde l'auteur de chaque lecture, ≈ 2 h) — utile même sans « Reprendre » | Construit le 21/10 (`e224170` : `result-author.ts`, `PUT …/results` : auteur gardé sur les lignes inchangées, journal `changed` + `replaced` ; « Saisi par » par résultat à la validation ; la paillasse rouvre une ligne avec ce qui a été tapé, `benchStartingReadings`), testé en local (`TESTPLAN.md` V18-B, `v18-local` 53/53) ; non déployé ; « Saisi par » pas encore à la paillasse ; les lignes enregistrées vides avant le 21/10 nomment leur dernier enregistreur jusqu'à ce qu'on y tape |
| D-10 | `Result.note` (descriptions d'anomalie comprises) s'imprime sur le rapport du client — jamais documenté | Une note interne peut partir chez le client | Décision G2 (relance 2.20 h) | 2B |
| D-11 | « NE », « non effectué » tapés comme valeur sont acceptés sur une ligne à valeur simple | S'imprimeraient sur le rapport, contre la réponse Q91 | C5 | Vague 3 — construit le 19/10 (C5, `124af3a`), testé en local |
| D-12 | L'écran de saisie montre l'unité du paramètre, pas celle du critère | « /25 g » à côté d'un critère « /1 g » | C6 | Vague 1 — construit le 19/10 (C6, `9770bb0`), testé en local |
| D-13 | La reprise de l'ancien logiciel crée tout paramètre inconnu en ALIMENTAIRE / MICRO ; elle saute les critères d'une famille du classeur **même vide** | Analyses PC des surfaces et sensorielles mal rangées ; familles sans critères (Q43) | F3 | Vague 4 — construit le 19/10 (F3, `b898586`), testé en local |
| D-14 | `GET /api/product-types` plafonne à 400 | Sans effet aujourd'hui (≈ 260 actives) ; à surveiller avec `?all=1` (≈ 530) | Note ; les nouvelles pages lisent Prisma directement | — (toujours plafonné à 400 ; les pages « Familles & critères » de la vague 4 lisent Prisma directement) |

## 6. Exploitation : décisions et gestes du propriétaire (pas de code)

1. **Numérotation en double (urgent).** Les compteurs ont été remis à 0 le
   01/10 ; le nouveau logiciel numérote ses séries et ses N° de contrôle
   depuis 1/26, alors que l'ancien en était à ≈ 2772/26 et ≈ 20459/26 le
   13/09 (HANDOFF §8, 13/09). Tant que les deux logiciels tournent, **un même
   numéro peut désigner deux échantillons différents** (étiquettes, rapports).
   Proposé (relance Q19) : sauter dès maintenant SERIE et CONTROLE, sur l'écran
   « Compteurs », à une plage que l'ancien n'atteindra pas en 2026 (par
   exemple 5001/26 et 40001/26), avec l'accord du laboratoire ; puis lister, en
   lecture, les rapports déjà partis avec un numéro qui existe aussi dans
   l'ancien logiciel. Les numéros déjà imprimés ne sont jamais réécrits.
   Geste du propriétaire, essayé d'abord sur la copie locale ; relire la
   valeur avant d'enregistrer : dès qu'un numéro de la nouvelle plage est
   attribué, le compteur ne peut plus redescendre.
2. **Coordonnées bancaires** : à vérifier dans /admin/entreprise avant
   toute facture réelle ; les vraies coordonnées sont demandées en relance,
   partie 5.
3. **Comptes de démonstration (urgent, indépendant du lot 2).** Comptes
   nominatifs dès réception de la liste (relance partie 5, idéalement avec
   Q81), puis `scripts/disable-demo-accounts.sh` et
   `NEXT_PUBLIC_DEMO_MODE=false` (`DEPLOY.md` « Go-live ») — masquer le
   panneau seul ne suffit pas. C'est aussi le préalable de D1 et de « avoir la
   main sur les signatures ».
4. **Instantané des factures** (`Invoice.clientSnapshot`, HANDOFF §9) : la
   décision avant E4 (le commercial pourra fusionner de vraies fiches).
5. **Destinataires avant l'envoi réel** : à l'activation de l'envoi, l'adresse
   reprise de l'ancien logiciel (`Client.email`) reçoit rapports **et**
   alertes de chaque client. D'abord la liste corrigée (relance partie 5 ;
   export Excel des clients actifs, S ≈ 2 h), puis le domaine et les DNS.
6. **Contrôles en lecture en production** (par l'exploitant) : résultats de
   la forme `^\d+\(-?\d\)$` (D-01) ; réglages /admin/reglages toujours aux
   défauts approuvés (24 h micro, 0–8 °C, `temperatureRequiredKinds`) ;
   nombre de lignes de mains par état (pour information avant A1).
7. **/admin/documents** : protocole G et bon H dès que les dates arrivent
   (Q103) ; nouvel indice de version si le laboratoire le décide après C1
   (feuille de paillasse) et D6 (protocole).
8. **Deux comptes** pour une personne qui fait la paillasse et le programme
   (Q127).

## 7. La relance du 18/10

`backups/Qualilab-suite-reponses-16-10-2026-10-18.pdf` (11 pages, ignoré par
git : il cite des membres du personnel par leur prénom, comme le laboratoire).
Cinq parties :

1. **Ce que nous avons compris** (34 lignes, une case « À corriger ? ») — les
   réponses réglées, avec ce que nous ferons.
2. **Vos réponses à préciser** (21 points, 2.1 à 2.21) : mains (Q110, Q111),
   températures (Q113), surface « Autre » (Q114), client (Q116), fusion et
   « À compléter » (Q117), heure inconnue (Q118), « Tous exploitables »
   (Q64), Q70 / Q75, Q77, Q91, Q78 et Q79 avec un exemple chiffré, Q107,
   Q108, Q55 (écrans), Q92 (a)–(d), Q50, Q88, Q43 / Q56, Q130 (g)–(k), et une
   question nouvelle : les analyses qui déclenchent l'alerte.
3. **Restées sans réponse** (6) : Q71, Q73, Q76, Q106, Q8, Q14 — « sans
   réponse, nous gardons ».
4. **Pages 7 à 9** (16) : Q104, Q93, Q103, Q105 ; Q11, Q30, Q85, Q86 (pour
   leur comptable) ; Q45, Q54 ; Q81, Q82, Q97 ; Q19, Q98, Q20. Le
   « fonctionnement actuel » a été revérifié (Q11, Q79, Q86 étaient
   incomplets ; Q19 dit maintenant le risque de numéros en double).
5. **Informations et documents** (7) : comptes, signataires, coordonnées
   bancaires, e-mails et adresse du logiciel, destinataires de chaque client,
   fichiers (logo HD, logo d'accréditation, cachet), le « point 7 » du 13/10.

*Retour au 20/10 : seules les pages 9 et 10 sont revenues (scan du 19/10,
`RETOUR-LABO-19-10.md`) ; la page 11 et les parties 1, 2, 3 et 5 restent
attendues, comme Q131–Q133.*

Laissées hors de la relance, exprès : Q84 (défaut retenu), Q94, Q95, Q96
(modules non chiffrés : au propriétaire de les reposer).

## 8. Documents corrigés par ce lot

- `NEEDEDINFO.md` §1b, Q22 : la « saisie au nom d'un collègue » était
  répondue le 29/09 (§3).
- `HANDOFF.md` §5 et §9, `PROGRAMME.md` §10.4 et §6 : le technicien n'a
  **pas d'export** (`/api/samples/export` l'exclut, `canExport` est faux pour
  lui) ; seule sa recherche est limitée à ce qu'il tient.
- `WORKFLOW.md` §7 et §8 : « Corriger la fiche » est aussi ouvert à DIRECTION
  (`FICHE_CORRECTION_ROLES`).
- `RETOUR-LABO-14-10.md` : en-tête, §4 et §8 renvoient ici ; le §8 « un
  duplicata ne change pas » est corrigé (D-03).
- À corriger **quand les éléments seront construits** (pas avant) :
  `CLIENTS-FUSION.md` §2–3 et HANDOFF §5 (fusion : E4), `AMENDEMENT.md` §2
  (rouvrir : D1 ; envoi : D2), `PROGRAMME.md` §2 et §4 (F4, F6), §10 (C3),
  AGENTS §1 (« automatic email to client » : D2), HANDOFF §8 (le « 7 rules »
  du 10/10 : le bon en a 8 depuis le 13/10 — journal en ajout seul, corrigé
  par l'entrée du 16/10). *19/10 : faits avec les vagues 3 et 4 (`124af3a`,
  `b898586`), sauf `PROGRAMME.md` §10 (C3, toujours 2B).*
- *19/10, construction et vérification :* `HANDOFF.md` §1, §2, §4, §5, §8,
  §9 ; `PROGRESS.md` ; `TESTPLAN.md` V16 (lignes cochées en local seulement) ;
  `DEPLOY.md` « Point de retour — avant le lot 2 du 16/10 » et « Lot 2 du
  16/10 » (ordre du déploiement, contrôles, reprise F3) ; `NEEDEDINFO.md`
  Q131–Q133 (et le lot du 18/10).

## 9. Dépôt public

- Le scan du 16/10 (`backups/reponses-labo-16-10-scan.pdf`), sa
  transcription, le PDF de la relance et toute liste de familles restent dans
  `backups/` (ignoré par git) : le scan porte
  l'initiale et le nom d'un membre du personnel (Q22), la relance des prénoms
  du personnel, et des familles portent des noms de clients.
- Dans le code, les tests, les documents et les commits : « X.NOM » pour un
  préleveur, « Nom Prénom » pour une personne, « TEST UI … » pour un client,
  des familles génériques (« Plats cuisinés - volailles », « Hygiène des
  surfaces » sont des noms génériques de l'ancien logiciel).
- L'exemple « Technicien de QUALILAB 'K.BENALI' » du §8 du 14/10 est le compte
  de démonstration `pre1` (seed), pas une personne réelle.
