# Réponses du laboratoire du 19/10 (pages 9 et 10 de la relance du 18/10) — plan du lot 2C

> **Le plan en cours pour ces réponses.** Le 19/10 à 10 h 41, le laboratoire
> a scanné **deux pages** de la relance du 18/10
> (`backups/Qualilab-suite-reponses-16-10-2026-10-18.pdf`, 12 pages) : les
> pages **9 et 10**, c'est-à-dire la partie 4 « Pages 7 à 9 du document du
> 14/10 — non reçues », sauf sa fin (page 11). Chaque réponse a été lue sur le
> scan, puis vérifiée **dans le code** (branche `lot2-retour-16-10`,
> `f4e9140`). Ce document complète `RETOUR-LABO-16-10.md` (lot 2A, construit
> le 19/10, non déployé) ; il ne modifie aucun élément déjà construit.
>
> - **Lot 2C** = ce que ces réponses permettent de construire maintenant
>   (§3) et les défauts relevés en préparant la présentation du 20/10 (§4).
>   **Relance** = ce qu'il faut reposer (§5). **Propriétaire** = geste
>   d'exploitation, pas de code (§6).
> - Le déploiement reste reporté (décision du propriétaire du 19/10,
>   `HANDOFF.md` §9) : le lot 2C se construit sur la branche
>   `lot2-retour-16-10`, et part en production avec le lot 2A, le jour où le
>   propriétaire le décide.
>
> Effort : XS ≈ 1 h ou moins · S 1–4 h · M 4–12 h · L plus de 12 h
> (estimations).
>
> **État au 20/10 (soir) : lot 2C construit le 20/10 et testé en local,
> non déployé.** H1, H2, H3, H4 (en option, à l'impression, avant R-1),
> D-15 à D-18 et l'écran de D-19 ; commits `7b1b540` (H1), `f057892`
> (H2, H3), `a83ec7e` (H4), `5666f3b` (D-15 à D-18), `1cb4a4f` (D-19) sur
> la branche `lot2-retour-16-10`, après la migration additive
> `20261020100000` (`c5db24e`). Portes vertes, recette locale
> `TESTPLAN.md` V17 (§7). **Reste** : H5 et le modèle de facture par client
> (après R-4 et R-1), la relecture de la liste D-19 par le propriétaire
> puis le reclassement en production, et le déploiement (un seul, lot 2A +
> lot 2C, quand le propriétaire le décide).
>
> **21/10 : le point ouvert de D-19 est réglé** — un formulaire de
> /admin/parametres ouvert avant un reclassement écrasait le domaine
> reclassé en enregistrant ; il reçoit désormais 409 « Ce paramètre a été
> modifié entre-temps… » et « Recharger » (`7490af8`, avec les autres dettes
> du 21/10 : `HANDOFF.md` §8 « 2026-10-21 », `TESTPLAN.md` V18-D). Commité et
> poussé, non déployé. Le propriétaire a décidé le 21/10 de déployer après
> chaque construction : le prochain déploiement porte les lots 2A, 2C et ces
> dettes, toujours avec six migrations.
>
> **21/10 au soir : déployé** (`4946ec3`, lots 2A + 2C + les dettes du
> 21/10). **23/10 : D-19 passé en production**, après la reprise F3 du
> même jour, par la route de l'écran et après un dump
> (`qualilab_avant-D19.sql.gz`) : 28 paramètres alimentaires passés de la
> microbiologie à la physico-chimie, le Cadmium parmi eux — le catalogue de
> production n'était pas celui de la copie locale (293) ; la liste
> Alimentaire + Microbiologie n'y porte plus que des germes.
>
> **24/10 : la famille « AUTRES » (point ouvert du §6.3) — « Scinder par
> domaine » est construit** (lot 2E, `1130492`, `HANDOFF.md` §8
> « 2026-10-24 ») : la physico-chimie d'« AUTRES » part dans « AUTRES —
> physico-chimie » (299 lignes sur la copie locale), avec cinq autres
> familles réunies par l'import (HUILE, FARINE DE POISSON et trois familles
> au nom d'un client). Répété sur la copie locale ; en production après le
> déploiement du lot 2E, **après** la reprise (f) des lignes supprimées de
> l'ancien logiciel (`DEPLOY.md` « Lot 2E »).

---

## 0. Ce qui est revenu

- **Un scan de 2 pages** (Canon, 19/10 10:41) : pages 9 et 10 sur 12 du PDF
  du 18/10. Rangé hors du dépôt : `backups/reponses-labo-19-10-scan-pages-9-10.pdf`
  (ignoré par git, comme les autres scans). Il ne porte aucun nom de
  personne.
- **Page 9** : « Rapport et alertes » (Q104, Q93, Q103, Q105) et
  « Facturation (pour votre comptable) » (Q11, Q30, Q85).
- **Page 10** : la fin de la facturation (Q86), « Clients et sites » (Q45,
  Q54) et « Comptes, sécurité, serveur » (Q81, Q82, Q97).
- **Pas revenues** : la page 11 (Q19 bascule, Q98 derniers numéros, Q20
  historique et portail) et toutes les autres pages : partie 1 (ce que nous
  avons compris), partie 2 (les 21 réponses à préciser), partie 3 (les 6
  questions restées vides), partie 5 (informations et documents), ainsi que
  Q131, Q132 et Q133 (posées dans le corps de l'e-mail).
- **Décompte** des 13 questions des deux pages : **5 réglées** (Q11, Q45,
  Q54, Q81, Q82), **3 en partie** (Q30, Q85, Q86), **5 laissées vides**
  (Q104, Q93, Q103, Q105, Q97).

## 1. Les réponses, une par une

Statut : **réglée** · **en partie** (une part réglée, le reste à reposer) ·
**vide**. « H1 »… = l'élément du plan (§3) ; « R-1 »… = le point de la
prochaine relance (§5).

| Q | Écrit sur le scan | Lecture | Statut | Suite |
|---|---|---|---|---|
| Q104 | (vide) | Rapport, là où le modèle M ne dit rien, (a)–(g) | vide | défauts construits gardés ; R-5 |
| Q93 | (vide) | Copies internes des alertes | vide | défaut gardé (adresse générale du laboratoire) ; R-5 |
| Q103 | (vide) | Dates des versions G (protocole) et H (bon) | vide | les cartouches impriment toujours F et G ; R-5 |
| Q105 | (vide) | Fax du client sur le bon ; cartouche sur facture, avoir, étiquettes | vide | défaut gardé (fax à la main, pas de cartouche) ; R-5 |
| Q11 | « OK » coché | Une analyse non faite n'est pas facturée (retirée du programme ; avoir si la facture est déjà émise) | réglée | rien à construire : c'est le fonctionnement actuel |
| Q30 | « OK » coché, un « + », une flèche vers la proposition, et « Besoin par paramètres » | D'accord pour démarrer avec un seul modèle (une ligne par analyse et par échantillon). « Besoin par paramètres » : très probablement une facture **groupée par paramètre** (une ligne par analyse avec la quantité, comme le modèle « par paramètres groupés » de l'ancien logiciel), en plus du modèle actuel. À confirmer avant de construire | en partie | H4 construit en option (impression) ; le choix par client après R-1 |
| Q85 | « OK » coché ; « IF » et « RC » marqués dans la question ; « et ICE » ajouté | Le format de l'export convient. Ajouter l'**IF** (identifiant fiscal) et le **RC** (registre de commerce) du client, avec l'ICE (déjà présent). L'adresse, dans la même question, n'est **pas** marquée | en partie | H2 ; l'adresse : R-2 |
| Q86 | case vide ; dans la proposition, « (2) oui, l'avance apparaît comme déjà réglée sur la facture » **barré** et « 2) non » écrit ; un « ? » souligné sous « (3) non au démarrage » | (1) délai de paiement : pas de réponse, le défaut reste (« à réception, sauf échéance saisie »). (2) l'avance encaissée au comptoir **ne figure pas** sur la facture comme déjà réglée : elle reste sur le bon de réception seulement — c'est le fonctionnement actuel. (3) reprendre les ≈ 6 700 prix propres à chaque client de l'ancien logiciel : le « ? » dit une hésitation, pas un refus | en partie | (2) rien à construire ; (1) et (3) : R-3, R-4 ; H5 si (3) = oui |
| Q45 | « OK » coché | Le rapport porte « Client — Site » et part aux adresses du client **et, s'il y en a, à celles du site** ; une facture par client (un site peut être facturé à une société liée) | réglée | H3 |
| Q54 | « OK » coché | Aucun client réel n'est fusionné par nous ; le laboratoire fusionne lui-même à partir du fichier ; la société facturée (franchisé) reçoit les **factures seulement** | réglée | geste du laboratoire (§6) ; rien à construire |
| Q81 | « OK » coché | Changement de mot de passe **obligatoire** à la première connexion et après chaque réinitialisation | réglée | H1 |
| Q82 | « OK » coché | Déconnexion après 30 minutes, avertissement 2 minutes avant, sauf le préleveur sur son téléphone : gardé | réglée | rien à construire |
| Q97 | (vide) | Sauvegarde chiffrée hors du serveur, clé, accès, créneau | vide | défaut gardé (copie hors site désactivée) ; R-5 |

## 2. Vérifié dans le code (branche `lot2-retour-16-10`, `f4e9140` — l'état avant le lot 2C)

- **Q11** : retirer une analyse du programme la retire du rapport et de la
  facture proposée ; une facture émise se corrige par un avoir
  (`FACTURATION.md` §2). Rien à faire.
- **Q86 (2)** : `Serie.advanceAmount` / `advanceMode` ne sont lus que par le
  bon de réception (`document-html.ts`, `series/[id]/document`) et la
  création du dépôt (`serie-create.ts`) ; aucun code de facturation ne les
  lit. La facture ne déduit donc pas l'avance : c'est ce que le laboratoire
  veut.
- **Q45** : la règle d'envoi est déjà la bonne depuis le défaut D-04 (vague 1,
  `src/lib/email-recipients.ts`) : un e-mail sur un échantillon part aux
  adresses générales du client et aux adresses **du site de l'échantillon**,
  jamais à celles d'un autre site. **Ce qui manque** : sur la fiche client,
  personne ne peut attacher une adresse à un site. `ClientEmail.siteId` ne
  vient que de la reprise du 07/10 ou de « Rattacher comme site » ; la route
  `PATCH /api/clients/[id]` le garde à l'enregistrement, mais
  `ClientForm.tsx` ne le montre ni ne le choisit (H3).
- **Q85** : le client n'a que `Client.ice` ; ni IF ni RC dans le schéma.
  L'export (`src/lib/sales-journal.ts`, `api/invoices/export`) lit
  l'identité **figée sur la facture** (`Invoice.clientSnapshot`,
  `CLIENT_IDENTITY_SELECT`, `src/lib/invoice-client-identity.ts`) : l'IF et le RC doivent entrer dans cet
  instantané (H2).
- **Q81** : chacun change son mot de passe dans « Mon compte »
  (`/compte`, `POST /api/compte/mot-de-passe` ; portail :
  `/api/portail/compte/mot-de-passe`) ; l'administrateur crée un compte
  (`POST /api/admin/users`, par Better Auth) et le réinitialise
  (`PATCH /api/admin/users/[id]`). Rien n'oblige à changer : aucun drapeau
  dans `User` (H1).
- **Q86 (3)** : aucun prix par client dans le schéma (pas de table de tarifs
  client) : la facture propose le prix du catalogue, modifiable ligne par
  ligne (H5 si la réponse est oui).

## 3. Le plan — chantier H (facturation, clients, comptes)

| # | Quoi | Ce qu'il faut faire | Où | Effort | Migration | Ce qui change en production | Statut |
|---|---|---|---|---|---|---|---|
| H1 | Q81 — mot de passe à changer | (1) `User.mustChangePassword Boolean @default(false)`. (2) Vrai à la création d'un compte et à chaque réinitialisation par un administrateur (personnel **et** portail client). (3) Faux quand la personne change elle-même son mot de passe. (4) Tant qu'il est vrai : toute page mène à « Mon compte » avec le message « Choisissez votre mot de passe avant de continuer », toute route d'API répond 403, sauf la session, la déconnexion et le changement de mot de passe — un seul garde, dans `src/lib/auth.ts` (`getSession` / `requireRole` / `requireApiRole`) et son équivalent du portail. (5) Les comptes existants restent à faux (aucun UPDATE) : les comptes nominatifs créés à la mise en service l'auront d'office ; les comptes de démonstration (seed) jamais. (6) Journal : `USER_PASSWORD_CHANGE_REQUIRED { username, reason: CREATED \| RESET }` à la pose (« Changement de mot de passe exigé ») ; `USER_PASSWORD_CHANGED` porte alors `required` et `flagCleared`. Tests : création, réinitialisation, garde des pages et des API, préleveur sur téléphone, portail | `prisma/schema.prisma`, `src/lib/auth.ts`, `api/admin/users`, `api/admin/users/[id]`, `api/compte/mot-de-passe`, `api/portail/compte/mot-de-passe`, `/compte`, portail | S–M ≈ 5 h | oui (additive) | chaque compte créé ou réinitialisé par l'administrateur doit choisir son mot de passe à la connexion suivante | construit le 20/10 (`7b1b540`), testé en local, non déployé ; le garde et ses exceptions : `HANDOFF.md` §3 ; recette `TESTPLAN.md` V17-H1 |
| H2 | Q85 — IF et RC du client | (1) `Client.fiscalId` (IF) et `Client.tradeRegister` (RC), facultatifs. (2) Saisis sur la fiche client (gestionnaire commercial, administrateur), à côté de l'ICE ; repris par la fusion (E4) comme les autres champs. (3) Entrent dans `Invoice.clientSnapshot` à l'émission. Une facture émise avec un instantané sans IF / RC laisse ces cases vides dans l'export ; une facture émise avant le 10/10 (sans instantané) lit la fiche vivante, comme aujourd'hui pour le nom et l'ICE (`invoiceClientIdentity`). (4) Export comptable : colonnes « ICE », « IF », « RC » dans « Journal des ventes » (et le nom seul dans « Règlements », comme aujourd'hui). (5) Vérifier si l'ancienne base (`qlabo-fb`) porte l'IF et le RC des clients : si oui, une reprise en lecture → écriture journalisée, d'abord sur la copie locale (S en plus). **Vérifié le 20/10 (copie locale, lecture seule) : l'ancienne base ne les porte pas.** Sa table des clients (2 394 fiches) n'a que l'ICE (renseigné sur 381) ; ses informations complémentaires sont le délai et le mode de paiement, l'adresse de facturation par défaut, le rapport et deux blocages ; l'IF, le RC, la patente et la CNSS n'y existent que pour le laboratoire lui-même. Seules deux fiches (le même RC, très probablement un doublon) portent un RC écrit dans l'adresse : à saisir à la main. Rien à reprendre. Pas d'adresse avant R-2 | `prisma/schema.prisma`, `ClientForm.tsx`, `api/clients`, `invoice-client-identity.ts` (identité figée), `sales-journal.ts`, `api/invoices/export` | S ≈ 4 h (pas de reprise) | oui (additive) | deux champs de plus sur la fiche client ; trois colonnes d'identité dans l'export | construit le 20/10 (`f057892`), testé en local, non déployé ; (5) vérifié : rien à reprendre ; recette `TESTPLAN.md` V17-H2 |
| H3 | Q45 — adresse propre à un site | Sur la fiche client, chaque adresse e-mail reçoit un choix « Tout le client » / « Site X » (les sites actifs du client) ; la route vérifie que le site appartient au client ; la règle d'envoi (D-04) ne change pas. La fiche (lecture) affiche déjà « site X — ce site seulement ». Rien sur la facture : « une facture par client » est déjà la règle (`Site.billingClientId` pour un site facturé à une société liée) | `ClientForm.tsx`, `validateClientEmails`, `PATCH /api/clients/[id]` | S ≈ 3 h | non | le gestionnaire commercial peut donner à un site ses propres destinataires | construit le 20/10 (`f057892`), testé en local, non déployé ; un site désactivé reste proposé et accepté tant qu'une adresse du client y est rattachée ; recette `TESTPLAN.md` V17-H3 |
| H4 | Q30 — facture « par paramètres » | Si R-1 confirme : une seconde mise en page de la **même** facture, une ligne par paramètre (quantité = nombre d'analyses, prix unitaire, montant), choisie à l'impression ou par client ; montants, numéros et avoirs inchangés. **Construit (20/10) à l'impression seulement** : `GET /api/invoices/[id]/pdf?modele=parametre`, bouton « PDF par paramètre » (fiche facture ; fiche client pour le gestionnaire) ; le paramètre est relu dans le libellé de la ligne (`billedAnalysis`), une ligne d'avoir par la ligne de facture qu'elle reprend ; le PDF par ligne reste le défaut, octet pour octet | `src/lib/invoice-html-layout.ts`, `invoice-html.ts`, `api/invoices/[id]/pdf`, `FactureDetail.tsx`, `commercial/[id]` | M ≈ 8 h | non (le choix par client, `Client.invoiceLayout`, attend R-1) | un second bouton PDF ; rien ne change sur le PDF actuel | construit le 20/10 (`a83ec7e`) en option, à l'impression, avant R-1, sans choix par client ; testé en local, non déployé ; recette `TESTPLAN.md` V17-H4 |
| H5 | Q86 (3) — prix propres à chaque client | Si R-4 = oui : une table des prix par client (client, analyse, prix), reprise des ≈ 6 700 prix de l'ancien logiciel (copie locale d'abord, liste des prix sans analyse correspondante), proposée à la place du prix du catalogue sur la facture, toujours modifiable | schéma, reprise, facture | M–L ≈ 12 h | oui (additive) | — | après R-4 : rien de construit |

Rien à construire pour Q11, Q54, Q82 et Q86 (2) : c'est le fonctionnement
actuel (§2).

## 4. Défauts relevés en préparant la présentation du 20/10

Les captures de la présentation (`backups/Qualilab-presentation-evolutions-16-10-2026-10-20.pdf`,
35 écrans du lot 2A sur la copie locale) ont fait passer chaque nouveauté de
la visite au rapport envoyé. Aucune erreur de calcul, aucune perte de
données ; ces points :

| # | Défaut | Conséquence | Correction | Effort | Statut |
|---|---|---|---|---|---|
| D-15 | Fiche de programme : après un changement de famille (avis « Famille X choisie ; N analyses … retirées »), choisir la nature « Analyse sensorielle » détache la famille, mais l'avis de l'ancienne famille reste affiché. `changeNature()` (`src/components/programmation/ProgrammeSheet.tsx`, ≈ l. 333) n'efface pas `familyNotice`, contrairement à `save()` | l'écran se contredit (« Aucune famille » sous un avis qui en nomme une) | `setFamilyNotice(null)` dans `changeNature()` ; test | XS ≈ 0,5 h | construit le 20/10 (`5666f3b`), testé en local, non déployé : l'avis de la famille choisie est remplacé (`natureChangeOutcome`), jamais laissé ; recette `TESTPLAN.md` V17-D15 / D16 |
| D-16 | Passer un aliment en « Analyse sensorielle » retire la famille et ramène n à 1, mais les germes venus de cette famille restent cochés (« 6 analyses · n = 1 · sans famille »), alors que choisir « — aucune — » famille les retire. `adoptReferential()` (`programme-sheet-logic.ts`) ne touche que n et la famille | un échantillon d'analyse sensorielle peut partir à la paillasse avec des germes microbiologiques | retirer, comme « aucune famille », les analyses venues seulement de la famille, et le dire dans l'avis | XS ≈ 1 h | construit le 20/10 (`5666f3b`), testé en local, non déployé, avec le défaut actuel de Q133 : les analyses venues seulement de la famille sont retirées et la section 1 le dit en ambre (« Famille « X » retirée avec la nature « Analyse sensorielle » : n ramené à 1 (au lieu de 5) ; 2 analyses venues de cette famille ont été retirées (…) », `natureDetachNotice`) ; recette V17-D15 / D16 |
| D-17 | Le nombre de « critères » d'une même famille diffère selon l'écran : la liste « Familles & critères » compte les lignes de critères, versions de norme comprises (`family-catalogue.ts:71`, `criteria.length`) ; le dialogue « Choisir une famille de produits » et la fiche comptent les germes distincts (`programme-referential.ts:497`). Exemple : « CONFITURES, COMPOTES… » 6 dans la liste, 5 dans le dialogue | le laboratoire voit deux chiffres pour la même famille | un seul compte partout : « N germes » (distincts), et « N lignes » seulement dans la grille de la famille | XS ≈ 0,5 h | construit le 20/10 (`5666f3b`), testé en local, non déployé : « N critères » = un par germe partout (`germCount`), « N critères · M lignes » dans la grille seulement ; recette V17-D17 |
| D-18 | Page d'une famille (`/programmation/familles/[id]`) à 1366 px de large : l'en-tête et la grille tronquent « Type d'analyse », « Propre à un client », les germes et les normes (« Microbiologie des alim… », « Clostridium pe… », « NM ISO 1664… ») | lisible au survol seulement, sur le portable le plus courant | colonnes germe / norme plus larges, retour à la ligne dans les listes, en-tête sur deux lignes sous 1440 px | S ≈ 1,5 h | construit le 20/10 (`5666f3b`), testé en local, non déployé : chaque liste de la page est un choix à retour à la ligne (`WrappingSelect`), les en-têtes n, c, m, M gardent leur casse, une grille enregistrée vide le dit ; recette V17-D18 |
| D-19 | **Données** : sur la copie locale, 355 paramètres ALIMENTAIRE de domaine MICRO, dont beaucoup de physico-chimie (absorbance K 232 nm, acésulfame-K, acides gras, cuivre, DDT, colorants E120 / E124…), proposés comme « Analyses microbiologiques » (« Corriger les analyses », fiche de programme). Reste de D-13 : la reprise du 07/10 créait tout paramètre inconnu en ALIMENTAIRE / MICRO ; F3 ne corrige que les créations nouvelles. La production a très probablement les mêmes lignes | des analyses chimiques proposées en microbiologie ; un mauvais choix fausse le domaine de l'échantillon | (1) liste en lecture des paramètres MICRO dont le nom ou la norme relève de la chimie (copie locale, puis production en lecture) ; (2) relue par le propriétaire (ou le laboratoire si un cas est douteux) ; (3) reclassement en CHIMIE par l'écran journalisé, d'abord sur la copie locale ; en production par l'exploitant, après tag + dump. Aucune migration, aucun UPDATE hors de l'écran | S ≈ 3 h (+ la relecture) | l'écran construit le 20/10 (`1cb4a4f`), testé en local, non déployé : « Reclasser plusieurs paramètres » dans « Paramètres d'analyse » (administrateur ; aperçu, puis tout ou rien, une entrée de journal par paramètre ; la recherche part du début des mots) ; la liste et la marche à suivre en production : `backups/D-19-parametres-a-reclasser-2026-10-20.md` (hors dépôt, 62 lignes à ne pas cocher sur 355 — 59 en production : 3 sont des germes de test de la copie locale), le contrôle des noms `.ui-tests/d19-compare-names.mjs` ; **appliqué sur la copie locale** le 20/10 (293 paramètres alimentaires passés en physico-chimie par la route, `.ui-tests/d19-apply.mjs` ; 62 restent en microbiologie, dont 6 à confirmer avec le laboratoire) ; **point ouvert réglé le 21/10** (`7490af8`, non déployé) : une modification d'un seul paramètre faite sur un formulaire ouvert avant le reclassement est refusée (409 « Ce paramètre a été modifié entre-temps… », « Recharger »), un onglet ouvert avant le déploiement aussi (409 « … rechargez-la ») ; **reste** : la relecture du propriétaire, puis la production par l'exploitant (tag + dump), avant la mise en service ; recette V17-D19, V18-D ; **23/10 : appliqué en production** (après F3, par la route, dump `qualilab_avant-D19.sql.gz` : 28 paramètres passés en physico-chimie — le catalogue de production n'était pas celui de la copie locale) |

## 5. La prochaine relance (à envoyer quand le propriétaire le décide)

Courte, en français, dans le corps d'un e-mail (pas de nouveau PDF) ; le
brouillon est dans `NEEDEDINFO.md` §2 (« Lot du 20/10 »).

- **R-1 — Q30** : « Besoin par paramètres » : une facture groupée par
  paramètre (une ligne par analyse, avec la quantité), en plus du modèle par
  échantillon — **construite le 20/10, à l'impression** (« PDF par
  paramètre », H4) : est-ce bien ce que vous vouliez ? Faut-il l'imprimer
  par défaut pour certains clients (lesquels) ? Un exemple de l'ancien
  logiciel nous permettra de la comparer.
- **R-2 — Q85** : faut-il aussi l'**adresse** du client dans l'export
  comptable (IF, RC et ICE y sont, construits le 20/10) ?
- **R-3 — Q86 (1)** : le délai de paiement par défaut reste « à réception,
  sauf échéance saisie » : d'accord ?
- **R-4 — Q86 (3)** : le « ? » : faut-il reprendre les ≈ 6 700 prix propres à
  chaque client dès le démarrage ? Sans eux, chaque facture propose le prix du
  catalogue, que le comptable corrige à la main pour un client à prix
  négocié.
- **R-5 — restées vides sur les pages revenues** : Q104 (a)–(g), Q93, Q103,
  Q105, Q97 — « sans réponse, nous gardons ce qui est construit ».
- **Rappel — pas revenues** : la page 11 (Q19 — urgent, numérotation en
  double —, Q98, Q20) et les parties 1, 2, 3 et 5 de la relance du 18/10,
  plus Q131, Q132, Q133.

## 6. Exploitation : gestes du propriétaire et du laboratoire (pas de code)

1. **Q54** : le laboratoire fusionne lui-même ses clients en double, à
   partir du fichier `doublons-clients.xlsx` (hors dépôt), avec l'écran de
   fusion (administrateur ou gestionnaire commercial depuis la vague 3, E4).
   Une société facturée (franchisé) reçoit les factures seulement : à
   vérifier sur chaque fiche concernée (cases « Rapports » décochées). Le
   préalable reste la décision du propriétaire sur le rattrapage unique de
   l'instantané des factures émises avant le 10/10 (`HANDOFF.md` §9 : sans
   lui, une fusion change le client imprimé sur ces anciennes factures).
   Depuis H2, ce rattrapage fige aussi l'IF et le RC (huit champs, la
   requête de `HANDOFF.md` §9) et ne se lance **qu'après la migration du
   lot 2C** (`20261020100000`) : une version à six champs figerait ces
   factures sans IF ni RC, et leur export les laisserait vides pour
   toujours.
2. **Q81** : à la mise en service, l'administrateur crée les comptes
   nominatifs **après le déploiement** : chacun a alors « mot de passe à
   changer » (H1) et choisit le sien à sa première connexion, à partir du
   mot de passe provisoire que l'administrateur lui remet. Chaque
   réinitialisation par l'administrateur pose de nouveau le drapeau et ferme
   les sessions de la personne. Les comptes existant avant le déploiement ne
   l'ont pas (aucun UPDATE). Les comptes de démonstration sont **désactivés**
   (`scripts/disable-demo-accounts.sh`, `NEXT_PUBLIC_DEMO_MODE=false`), pas
   réinitialisés. Ordre : `DEPLOY.md` « Lot 2 du 16/10 ».
3. **D-19** : le propriétaire relit la liste
   `backups/D-19-parametres-a-reclasser-2026-10-20.md` (hors dépôt : les
   noms à ne pas cocher — 59 en production, 53 germes et 6 à confirmer avec
   le laboratoire). Puis, après le déploiement et avant la mise en service,
   l'exploitant reclasse en production **par l'écran** « Reclasser
   plusieurs paramètres », après un tag et un dump, en suivant la marche à
   suivre du même fichier (noms vérifiés par
   `.ui-tests/d19-compare-names.mjs`) ; jamais par SQL (`DEPLOY.md` « Lot 2
   du 16/10 », étape 6). Point ouvert du même fichier : la famille de
   catalogue « AUTRES » cite 283 des 293 paramètres reclassés ; choisie sur
   un échantillon de microbiologie, elle les cochera sous « autre domaine
   que l'échantillon » — la désactiver ou la scinder (« Familles &
   critères ») est une décision du propriétaire, pas un geste de ce lot.
   *23/10 : D-19 fait en production (28 paramètres). 24/10 : « Scinder
   par domaine » construit (lot 2E) — la scission d'« AUTRES » et des cinq
   autres familles réunies se fait en production après le déploiement,
   après la reprise (f) (`DEPLOY.md` « Lot 2E »).*
   Avant le reclassement, fermer ou recharger tout onglet /admin/parametres
   ouvert avant le déploiement (il ne peut plus rien enregistrer depuis le
   21/10, mais le recharger évite la surprise).

## 7. Ordre et recette

- **Lot 2C — construit le 20/10, testé en local, non déployé** : H1, H2,
  H3, H4 (en option, avant R-1), D-15, D-16 (avec le défaut actuel de Q133),
  D-17, D-18 et l'écran de D-19 ; **une migration additive**
  (`20261020100000` : `User.mustChangePassword`, `Client.fiscalId`,
  `Client.tradeRegister`), écrite à la main, vérifiée contre
  `prisma migrate diff`, aucun UPDATE. Commits `7b1b540`, `f057892`,
  `a83ec7e`, `5666f3b`, `1cb4a4f`. Portes : `npx tsc --noEmit -p .` 0,
  `npx eslint src` 0, `npx vitest run` 123 fichiers / 2 479 tests,
  `npm run build` 94 pages. D-19 (données) : la copie locale reclassée par
  l'écran (293 paramètres alimentaires passés en physico-chimie, 62 restés
  en microbiologie) ; la production attend la relecture du propriétaire
  (§6).
- **Après la relance** : H5 (R-4), l'adresse dans l'export (R-2) ; pour H4,
  seulement le modèle par défaut par client si R-1 le demande (la mise en
  page par paramètre est déjà construite, à l'impression).
- **Recette** : `TESTPLAN.md` Checkpoint V17 (écrit le 20/10 :
  `.ui-tests/v17-local.mjs` 78/78 sur la copie locale, H1–H4 et D-15–D-19 de
  bout en bout ; régressions v16-1 62/62, v16-2 109/109, v16-3 67/67, v16-4
  73/73, v16-final 21/21 + 7/7, V15 24/24, V14 40/40) — en local sur
  « TEST UI » ; en production, plus tard, par le propriétaire avec ses
  comptes (les comptes de démonstration seront désactivés).
- **Le déploiement** : un seul, lot 2A + lot 2C (+ les dettes fermées le
  21/10, `TESTPLAN.md` V18), six migrations additives (aucune de plus le
  21/10) ; décision du propriétaire du 21/10 : déployer après chaque
  construction, puis tester en production (`DEPLOY.md` « Lot 2 du 16/10 »).

## 8. Dépôt public

- Le scan reste dans `backups/` (ignoré par git), comme les précédents ;
  la présentation du 20/10 aussi (elle montre des comptes de démonstration et
  le client « TEST UI » seulement).
- Ici, aucun nom de client, de site ni de membre du personnel ; les familles
  citées sont des familles génériques du catalogue commun.
