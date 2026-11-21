# Réponses du laboratoire du 20/11 (« Dernières précisions » du 07/11 annoté) — plan du lot 5

> **Analysé le 20/11. État : analysé, lot 5 planifié, rien construit,
> production non touchée** (production `4ebb146`, lot 4 ; branche
> `lot2-retour-16-10` = `master` + documents). Le 20/11, le laboratoire a
> renvoyé, scanné (3 pages), notre questionnaire du 07/11 « Dernières
> précisions » (`backups/Qualilab-questions-2026-11-07.pdf`, 17 questions —
> 8 « Vos réponses du 04/11 à préciser » = C-1 … C-8 de
> `RETOUR-LABO-04-11.md` §7, 9 « Questions restées sans réponse » — plus
> « À nous envoyer »), coché et annoté à la main. Chaque réponse a été relue
> sur les pages agrandies (rendu 250 et 500 dpi ; la source est une image
> 150 dpi : au-delà, rien ne se lit mieux), puis comparée au code et aux
> interrupteurs de `src/lib/lab-proposals.ts` (`HANDOFF.md` §9). Ce document
> complète `RETOUR-LABO-04-11.md` (lot 4, en production depuis le 05/11).
>
> - **Règle du propriétaire (04/11)** : une question laissée vide est en
>   suspens de validation par la direction, pas d'urgence — elle n'est pas
>   relancée (§6). Le comportement construit reste en place.
> - **Lot 5** = ce que ces réponses permettent de construire, en **deux
>   étapes** : **5A** (les petits changements, §5) et **5B** (l'historique
>   des rapports de l'ancien logiciel sur le portail, §6). **Rien n'est
>   construit avant que le propriétaire le dise** ; à la construction, la
>   règle du 21/10 s'applique (déployer, puis tester en production sur
>   « TEST UI » seulement).
> - Les adresses e-mail écrites sur le scan **ne sont pas recopiées ici**
>   (dépôt public) : `backups/retour-labo-20-11/adresses.md` (ignoré par git).
>
> Effort : XS ≈ 1 h ou moins · S 1–4 h · M 4–12 h · L plus de 12 h
> (estimations). Priorité : **P1** avant que les essais du laboratoire
> continuent · **P2** avant la mise en service réelle · **P3** après.

---

## 0. Ce qui est revenu

- **Le scan** (20/11, 3 pages, sans e-mail d'accompagnement transmis), rangé
  hors du dépôt : `backups/retour-labo-20-11/reponses-derniere-precisions-scan.pdf`
  (ignoré par git). Les trois pages de notre questionnaire, dans l'ordre ;
  deux écritures : stylo bleu (Q1, Q3 taux et durée, Q5, Q15) et stylo noir
  ou crayon (Q3 note de droite, Q4, Q7, Q9, Q11, Q13, adresses).
- **Décompte des 17 questions** :
  - « Oui, d'accord » coché, sans réserve : **Q2, Q6, Q8, Q14, Q17** ;
  - « Oui » coché **avec une précision** : **Q4** (la liste : « voir portée
    d'accréditation »), **Q7** (« Satisfaisant et acceptable = Conforme »),
    **Q13** (la proposition **barrée** : « pas visible ») ;
  - « Autre » coché : **Q11** (tout l'historique sur le portail), **Q12**
    (« à vérifier » seulement), **Q16** (corriger sans amendement) ;
  - aucune case, mais un texte : **Q1** (l'unité modifiable, le jugement par
    la valeur), **Q3** (taux, base, durée, « au cas par cas »), **Q5**
    (« Juste »), **Q9** (« pas décidé », lecture probable), **Q15** (« par
    n° de série ou code d'échantillon ») ;
  - **rien du tout : Q10** (Q98).
- **« À nous envoyer »** (aucune case cochée) : procès-verbal et dates de
  formation vides ; cachet et logo HD vides ; **deux adresses de copie**
  écrites (la première lisible, la seconde incomplète) ; **adresse
  d'expédition** écrite sans la fin du domaine ; contact du domaine vide ;
  données réelles (stock, achats, ONSSA) vides. Aucun fichier joint.

## 1. Les réponses, une par une

Nature : **confirmé** (en ligne, rien à faire sinon un commentaire) · **à
modifier** · **à construire** · **réglage** / **donnée** (propriétaire, sans
code) · **en attente** (direction ou laboratoire) · **à clarifier**.
« J6 »… = l'élément du plan (§5, §6) ; « D-1 »… = la question à reposer (§8).

| # | Réf. | Écrit sur le scan | Lecture | En ligne aujourd'hui | Suite | Nature | Taille |
|---|---|---|---|---|---|---|---|
| 1 | C-1 (Q6, R-29) | aucune case ; sur la ligne « Autre » et en dessous : « 2 façons pour exprimer l'unité des surfaces : soit UFC/100 cm² soit UFC/objet prélevé, donc laisser la possibilité de modifier ~~[un mot barré]~~ l'unité, pour l'interprétation se fait par rapport aux résultats et non pas par rapport à l'unité » ; ligne de l'air (« limite ≤ … UFC par boîte ») vide | (a) **l'unité d'une surface se choisit à la saisie** : « UFC/100 cm² » ou « UFC/objet prélevé » (« UFC/couteau ») ; (b) **le résultat est jugé contre la limite quelle que soit l'unité** : 120 UFC/couteau face à « ≤ 100 » → non conforme ; notre règle « une autre unité = sans interprétation » est refusée pour les surfaces ; (c) **aucune limite pour l'air** | J1 / J2 : l'unité est calculée, jamais choisie (`resultUnit`, `result-unit.ts`) ; `UNIT_MISMATCH_NOT_JUDGED` = true : un critère d'une autre unité ne juge pas (surfaces et air) | **J6** : unité modifiable à la saisie (surfaces), jugement par la valeur pour les surfaces ; l'air garde la règle actuelle jusqu'à sa limite (**D-4**) | à modifier | S–M |
| 2 | C-2 (Q12) | « Oui, d'accord : 10 jours ouvrés (environ 15 jours calendaires) pour toute la physico-chimie » coché | 10 jours ouvrés pour toute la physico-chimie | S9 appliqué le 05/11 : `dueDaysChimie` = 10, jours ouvrés | rien ; K5 bis abandonné | confirmé | — |
| 3 | C-3 (Q18, pour le comptable) | « Oui, d'accord » **non coché** ; dans sa phrase, « 3 » (mois) **barré**, au-dessus « 4 (1?0 J) » ou « 6 (1?0 J) » (chiffre repassé), et au-dessus de « valide » « 6 J » (ou « 60 J » ?) ; « Avec attestation : **75** % » + « de la TVA » coché ; « Sans attestation : **100** % » + « de la TVA » coché ; « Fournisseurs concernés » : aucun nom, un signe en marge (triangle fléché, « ! ») ; une accolade sur les deux taux : « C'est au cas par cas et préciser l'attestation, est-ce que l'achat ou facturation client » ; « Autre (durée, paiement bloqué) » vide | **retenue sur la TVA : 75 % avec attestation, 100 % sans** ; fournisseurs **au cas par cas** (fournisseur par fournisseur) ; la durée d'une attestation **n'est plus 3 mois** — 4 mois (120 jours) ou 6 mois (180 jours), le chiffre ne se lit pas avec certitude ; le comptable demande **si l'attestation (et la retenue) concerne les achats ou la facturation des clients** ; avertissement ou blocage : pas de réponse | M7 : base, taux **vides** (`AchatStockSettings`), champ d'application `AUCUN` ; `taxCertificateValidityMonths` = 3 ; `PAYMENT_REQUIRES_TAX_CERTIFICATE` = false (avertissement) ; « soumis à la retenue » par fournisseur (`Supplier.withholdingSubject`) existe ; la retenue n'existe que côté **achats** | **S13** (réglage, sans code) : base TVA, 75 / 100, champ « fournisseurs soumis » ; la durée et la portée : **D-3** ; blocage : reste un avertissement (en attente) | réglage + à clarifier | XS |
| 4 | C-4 (Q13) | « Oui, d'accord » coché (la personne qui fait la validation administrative ; le logo seulement avec une analyse accréditée ; « SA » ne compte pas) ; « liste jointe » non coché ; « ou : voir portée d'accréditation déjà transmis[e] sur le site internet » (fin lue « sur le site internet », probable) | K10 tel que construit est **confirmé** (qui, l'ajout, « SA ») ; la liste = leur **portée d'accréditation**, « déjà transmise » ou publiée « sur le site » — **nous ne l'avons pas** (ni dans `backups/`, ni dans les fichiers du 28/10 et du 05/11) | `ACCREDITATION_LOGO_BY_HAND` = true (hypothèses C-4) ; S12 : marques de l'ancien logiciel seulement (73), aucun « Accrédité » | commentaires « confirmé le 20/11 » ; **S12** quand la portée est en main ; la portée : **D-6** (ou le propriétaire la récupère sur le site public de l'organisme d'accréditation) | confirmé + donnée | XS |
| 5 | C-5 (Q8, Q131) | aucune case ; flèche après « une lecture de 500 reste » → « **Juste** » ; dessous : « Si on a un seul critère qui est par exemple le 100, [mot incertain : « bien » ou « oui »] dans le cas de 150 c'est insatisfaisant » | les exemples sont justes : 150 → « Non satisfaisant » (limite unique, n = 1) ; avec m = 100 / M = 1 000, n = 1, **500 reste « Acceptable »** | J5 en ligne (`SINGLE_UNIT_NO_TOLERANCE`) ; deux limites inchangées | commentaire « confirmé le 20/11 » | confirmé | XS |
| 6 | C-6 (Q9) | « Oui, d'accord » coché | envoient : le validateur technique, la Direction, l'administrateur ; le commercial n'envoie ni ne renvoie | K8 en ligne : `COMMERCIAL_RESENDS_REPORTS` = false (`lab-proposals.ts`), `SEND_REPORT_ROLES` = VALIDATEUR, DIRECTION, ADMIN (`src/lib/report-actions.ts`) | commentaire « confirmé le 20/11 » | confirmé | XS |
| 7 | C-7 (Q16) | « Oui, d'accord » coché ; sur la ligne « Autre » (case non cochée) : « Satisfaisant et acceptable = Conforme » | dans le rapport ONSSA, Satisfaisant **et** Acceptable comptent conformes ; les rapports d'analyse gardent « Acceptable » | N3 : « Acceptable » = conforme (`isNonConformResult`, `src/lib/onssa-report.ts` + test ; le commentaire de `ONSSA_COUNT_BY` — interrupteur de la date de comptage — le rappelle) | commentaire « confirmé le 20/11 » | confirmé | XS |
| 8 | C-8 (Q17, pour le comptable) | « Oui, d'accord avec ces cinq règles » coché | (a)–(e) confirmées, dont (d) **E. coli = Escherichia coli, Coliformes totaux = Coliformes à 36 °C** pour l'eau | H5 en ligne : 1 075 prix repris en production ; 255 lignes « analyse introuvable » en production (465 sur la copie locale), surtout ces libellés | commentaires « confirmé le 20/11 » (`CLIENT_PRICE_*`) ; **S14** : les deux équivalences en alias dans /admin/parametres, puis relancer « Importer les prix clients » (analyse, puis import : seuls les prix nouveaux s'écrivent) | confirmé + réglage | XS |
| 9 | Q19 (O-1) | aucune case ; sur « Date d'arrêt de l'ancien logiciel », entouré : « **PAS DÉCIDÉ** » (lecture probable ; lu aussi « pas de date ») ; un trait part de l'ovale vers Q10 | la date d'arrêt **n'est pas décidée** ; la proposition (5001/26 et 40001/26) n'est **ni acceptée ni refusée** | séries et N° de contrôle 2026 depuis 1 (`Counter`) ; « Compteurs » réglables dans /admin (route `/api/admin/counters`) | **décision du propriétaire** (§7) ; rien à construire | en attente (propriétaire) | — (réglage) |
| 10 | Q98 | rien (un petit trait près de « Dernier avoir », sans chiffre) | non répondue | facture `FAC-AAAA-NNNN`, avoir `AV-AAAA-NNNN` depuis 1 | en attente (direction) ; le saut se règle dans « Compteurs » le jour de la bascule | en attente | — |
| 11 | Q20 | « Autre » coché : « **Ajouter tout l'historique des clients, ancien plus nouveau** » | le portail montre **aussi** l'historique de l'ancien logiciel, depuis le début (2017), en plus des rapports du nouveau | le portail (`PORTAIL.md`) ne montre que les échantillons du nouveau logiciel ; de l'ancienne base, seuls les clients, les sites, les critères, la mémoire et les prix ont été repris — **aucun échantillon ni résultat** | **lot 5B** (§6) : « Historique (ancien logiciel) » sur le portail et sur la fiche client, construit depuis la base Firebird | à construire | L |
| 12 | 2.8 (Q70) | « Autre (seulement « à vérifier ») » coché, « vérifier » souligné | un échantillon mal identifié (ou un contenant abîmé) est **« à vérifier »**, pas non conforme d'office | C5 « Identification » répondu « Non » → **NON_CONFORME**, motif « Identification incomplète » (`tickedRow`, `reception-complementary.ts`) ; l'emballage (C3) n'est plus demandé depuis le 16/10 | **I10** : « Non » → « à vérifier » | à modifier | S |
| 13 | 2.14 (Q108) | « Oui, d'accord » coché ; la suite « ceux des collègues restent visibles en lecture sur la paillasse » **barrée**, en marge « **pas visible** » | la recherche d'un technicien = ses échantillons (confirmé) ; **et les échantillons des collègues ne sont plus visibles du technicien**, même en lecture sur la paillasse — **contredit** la réponse du 28/10 à 2.13 (« Reprendre » par tout technicien, `TAKE_OVER_COLLEAGUE`) | liste « Pris par un collègue » (lecture seule) sur /technicien, fiche d'un échantillon d'un collègue ouverte en lecture avec « Reprendre » ; recherche limitée à ses échantillons (`benchSearchScope`) | **J7** (hypothèse) : masquer ; la reprise passe par « Libérer » de l'administrateur (existe) puis « À prendre » ; **D-1** | à modifier + à clarifier | S–M |
| 14 | Q73 | « Oui, d'accord » coché, « simple signal orange » souligné | protocole papier non signé : signal orange, sans bloquer, visites seulement | C6 : « Protocole papier signé reçu » Non → orange, sans effet sur la conformité, visites seulement | rien | confirmé | — |
| 15 | Q106 | aucune case ; en marge : « **par n° de série ou code d'échantillon** » | la liste « À prendre » se range **par numéro de série** (ou par code d'échantillon) — pas « les urgents d'abord, puis les plus anciens reçus » | `BENCH_ORDER` : `priority desc`, `receivedAt asc` (`src/app/technicien/page.tsx`) ; aucune option de tri | **J8** : tri par N° de série (défaut) ou par N° de contrôle, au choix ; les urgents : **D-2** | à modifier | XS–S |
| 16 | Q132 | « Autre (corriger sans amendement : même numéro, sans « annule et remplace ») » coché | un rapport validé **jamais envoyé** se corrige **sans amendement** : même numéro, sans « annule et remplace », sans e-mail « Rapport amendé » | seule voie : « Rouvrir pour amendement » → version `-A1` « Annule et remplace » (`report-amendment.ts`, la fenêtre prévient `unsentReopenWarning`) | **K11** : « Corriger avant envoi » | à construire | M |
| 17 | Q133 | « Oui, d'accord : 1 unité » coché | analyse sensorielle : n = 1 | F9 : passer en « Analyse sensorielle » ramène n à 1 ; **mais** la famille sensorielle reprise de l'ancien logiciel (« PRODUIT ALIMENTAIRE ») garde n = 5, c = 1, et la choisir reprend n = 5 | **S15** : ses critères passent à n = 1 (donnée, comptée d'abord ; NEEDEDINFO Q133 l'avait annoncé) | confirmé + donnée | XS |

**« À nous envoyer »**

| Demandé | Écrit | Suite |
|---|---|---|
| PV de recette signé, dates de formation | vide | en attente (direction) ; pas de mise en service réelle sans PV |
| Cachet (fond blanc), logo HD (PNG / SVG) | vide (« envoyé le … » vide) | en attente ; l'actuel reste, aucun cachet inventé |
| Deux adresses en copie de tous les envois (L6) | **deux adresses** : la première (adresse « direction » au domaine du laboratoire) **lisible** ; la seconde **incomplète** (partie locale d'apparence nominative, domaine remplacé par un trait avant « .com ») — `backups/retour-labo-20-11/adresses.md` | **S16** : la première dans « Copies internes (alertes et rapports) », tous les clients ; la seconde : **D-5** |
| Adresse d'expédition, nom affiché, contact du domaine | une adresse « info@ » au nom du laboratoire, **sans la fin du domaine** ; nom affiché et contact du domaine vides | L4 : rien tant que le domaine n'est pas vérifié (DNS) ; **D-5** |
| Un mois de données réelles (stock, achats, ONSSA) | vide | en attente |

## 2. Les hypothèses et interrupteurs — ce que la réponse en fait

| Hypothèse (interrupteur, `lab-proposals.ts`) | Question | Réponse du 20/11 | Verdict | Suite |
|---|---|---|---|---|
| `UNIT_MISMATCH_NOT_JUDGED` (J1 / J2, lot 3B) | C-1 | surfaces : jugées par la valeur, unité au choix ; air : pas de limite | **refusée pour les surfaces**, ouverte pour l'air | J6 (redéfini : air seulement) ; D-4 |
| K5 — 8 / 10 jours ouvrés (S9) | C-2 | « Oui » | **confirmée** | rien ; K5 bis abandonné |
| M7 — retenue, 3 mois, avertissement (`PAYMENT_REQUIRES_TAX_CERTIFICATE` = false) | C-3 | TVA 75 / 100, au cas par cas, durée changée (4 ou 6 mois), blocage non dit | **en partie répondue** | S13 ; D-3 |
| `ACCREDITATION_LOGO_BY_HAND` (K10) : qui, ajout, « SA » | C-4 | « Oui » | **confirmée** | commentaire ; la portée : D-6, puis S12 |
| `SINGLE_UNIT_NO_TOLERANCE` (J5) et deux limites inchangées | C-5 | « Juste » | **confirmée** | commentaire |
| `COMMERCIAL_RESENDS_REPORTS` = false (K8) ; `SEND_REPORT_ROLES` (constante de `report-actions.ts`, pas un interrupteur) | C-6 | « Oui » | **confirmée** | commentaire |
| N3, « Acceptable » = conforme (`isNonConformResult`, `onssa-report.ts` ; rappelé au commentaire d'`ONSSA_COUNT_BY`) | C-7 | « Oui » + « Satisfaisant et acceptable = Conforme » | **confirmée** | commentaire |
| `CLIENT_PRICE_SKIP_LEGACY_TARIFF`, `CLIENT_PRICE_OWN_BEFORE_SITE`, règles (a), (b), (d) de H5 | C-8 | « Oui » aux cinq règles | **confirmées** | commentaires ; S14 |
| `TAKE_OVER_COLLEAGUE` (2.13, confirmé le 28/10) | 2.14 | « pas visible » | **contredite par la nouvelle réponse** | J7 (hypothèse) ; D-1 |
| C5 Identification « Non » = non conforme (pas d'interrupteur) | 2.8 | « à vérifier » seulement | **changée** | I10 |
| « À prendre » : urgents puis plus anciens (pas d'interrupteur) | Q106 | par n° de série ou code d'échantillon | **changée** | J8 ; D-2 |
| Rapport jamais envoyé : amendement (pas d'interrupteur) | Q132 | sans amendement | **changée** | K11 |
| n = 1 pour « Analyse sensorielle » (F9) | Q133 | 1 unité | **confirmée** | S15 (les critères repris) |
| C6, signal orange (pas d'interrupteur) | Q73 | « Oui » | **confirmée** | rien |
| Portail : rapports du nouveau logiciel seulement | Q20 | tout l'historique, ancien plus nouveau | **changée** | lot 5B |

## 3. Les fichiers

Rien n'est arrivé avec le scan. Toujours attendus : le **cachet**, le **logo
HD**, la **portée d'accréditation** (« déjà transmise » selon le laboratoire :
introuvable chez nous — ni dans `backups/fichiers-labo-28-10/`, ni dans
`backups/fichiers-labo-2026-11-05/`), le **PV de recette** et les **dates de
formation**, la **fiche de stock** et le **journal des achats remplis**, le
**canevas ONSSA complet** avec un mois déclaré et la liste des groupes. Pour
l'historique (5B) : rien à demander pour les données (elles sont dans
l'ancienne base, `qlabo-fb`) ; les **PDF signés** des anciens rapports sont
dans le dossier partagé du laboratoire (texte de notre Q11) — à demander
seulement si l'option HA8 est retenue (§6).

## 4. Désaccords de lecture (scan relu le 20/11, pages agrandies)

La lecture de départ est **confirmée** partout, avec ces nuances :

- **Q1** : la case « Autre » n'est pas cochée, le texte est écrit sur sa
  ligne et déborde sous elle ; un mot est barré avant « l'unité » (« la
  surface » probable) ; rien sur la ligne de l'air.
- **Q3 — durée de l'attestation : nous ne lisons pas « 6 mois » avec
  certitude.** Le « 3 » imprimé est barré ; au-dessus, un chiffre repassé
  (un « 4 » et un « 6 » superposés) suivi de « (1?0 J) » — « (120 J) » ou
  « (180 J) », le deuxième chiffre ressemble à un « L » ; les deux lectures
  sont cohérentes (4 mois = 120 jours, 6 mois = 180 jours). Au-dessus de
  « valide », une seconde note « 6 J » (ou « 60 J ») que nous ne savons pas
  rattacher. **D-3** le redemande ; rien n'est saisi avant.
- **Q3 — fournisseurs** : aucun nom ; sur la ligne, un trait vertical et un
  petit rond (« ! ») ; dans la marge gauche, un triangle fléché vers
  « Fournisseurs concernés ». La note de droite se lit « C'est au cas par
  cas et préciser l'attestation, est-ce que l'achat ou facturation client »
  (une accolade la relie aux deux lignes de taux) : nous la lisons comme une
  **question du comptable** (l'attestation porte-t-elle sur nos achats ou
  sur la facturation des clients ?) plus « au cas par cas » pour les
  fournisseurs.
- **Q4** : la fin de la note se lit « déjà transmise **sur le site
  internet** » (lecture probable, les deux derniers mots sont pâles) —
  peut-être la portée publiée par l'organisme d'accréditation.
- **Q5** : ni « Oui » ni « Autre » cochés ; « → Juste » pointe la phrase
  « une lecture de 500 reste « Acceptable » », la note du dessous confirme
  le cas 150. Lu comme « Oui ».
- **Q7** : « Oui » coché ; « Satisfaisant et acceptable = Conforme » est
  écrit sur la ligne « Autre » sans la cocher — une précision, pas un
  changement.
- **Q9** : le mot entouré se lit plutôt « **PAS DÉCIDÉ** » (accents sur les
  deux « É », un « C » et un « I » au milieu) que « pas de date » ; le sens
  est le même : pas de date d'arrêt. Aucune case cochée : la numérotation
  5001 / 40001 n'est pas acceptée.
- **Q10** : un trait part de l'ovale de Q9 et descend entre « continuer » et
  « Dernier avoir » ; un petit trait oblique près de « Dernier avoir » ;
  aucun chiffre. Lu comme « non répondue ».
- **Q13** : le barré couvre toute la suite « ceux des collègues restent
  visibles en lecture sur la paillasse » ; « pas visible » est écrit au
  stylo noir.
- **Q15** : ni « Oui » ni « Autre » cochés ; la note est dans la marge
  droite, sur quatre lignes : « par n° de / série / ou code d'échantil- /
  lon ».
- **Adresses** : la première se lit « direction@ » + le domaine du
  laboratoire en « .com » ; **la seconde n'est pas complète** : une partie
  locale d'apparence « prénom.nom » (lecture incertaine) puis, après
  « @ », un trait à la place du domaine, puis « .com » (« idem » ? à ne pas
  supposer). L'adresse d'expédition se lit « info@ » + le nom du
  laboratoire, **sans extension** (« .com » non écrit). Détail :
  `backups/retour-labo-20-11/adresses.md`.
- Deux petites marques « K » / « x » en marge droite (Q7, page 2 ; ligne
  « Un mois de données réelles », page 3) : sens inconnu, sans effet.

## 5. Le plan — lot 5A (les petits changements)

Lettres des lots précédents reprises, numéros à la suite (**I** réception ·
**J** paillasse et interprétation · **K** rapport, envoi) ; **S13–S17** sont
des gestes du propriétaire (sans code). Chaque changement de comportement a
son interrupteur dans `src/lib/lab-proposals.ts` (ON = la réponse du 20/11,
OFF = le comportement d'aujourd'hui), son retour en arrière testé
(`lab-proposals-off.test.ts` ou un fichier `lab-proposals-5a-back.test.ts`),
et les commentaires « confirmé le 20/11 ». **Aucune migration dans 5A sauf
K11.** Branche : à créer depuis `lot2-retour-16-10` (par exemple `lot5a`).

### 5A — code

| # | Source | Ce qu'il faut faire | Où | Effort | Migration |
|---|---|---|---|---|---|
| J6 | C-1 (Q6, R-29) | **(a) jugement par la valeur pour les surfaces** : nouvel interrupteur `SURFACE_JUDGED_WHATEVER_UNIT` (ON) — `unitJudges` rend `true` pour une ligne SURFACE, quelle que soit l'unité du critère ou de la limite (« 120 UFC/couteau » face à « ≤ 100 UFC/100 cm² » → jugé, non conforme) ; l'**air garde** la règle de `UNIT_MISMATCH_NOT_JUDGED` (redéfini : « air seulement », hypothèse jusqu'à D-4). Aujourd'hui, une surface n'est mise « sans interprétation » que si elle est **décrite en mots** (`describedSurface` : `Sample.surfaceAreaNote` rempli) face à un critère en « /cm² » (`unitJudges`, `result-unit.ts`) ; une surface sans description est déjà jugée par la valeur — J6 ne change que le cas décrit (et, en (b), une unité choisie à la main). **(b) unité modifiable à la saisie** (lignes SURFACE, unités de comptage seulement) : la fiche de paillasse propose, par paramètre, « UFC/100 cm² », « UFC/<objet> » (objet prérempli de `Sample.surfaceAreaNote`, modifiable, ≤ 60 caractères) et l'unité du critère si elle diffère ; préremplie comme aujourd'hui (`resultUnit`) ; fonction pure `surfaceUnitChoices(context, base)` ; `PUT /api/samples/[id]/results` accepte `unit` par ligne, le **valide** (ligne SURFACE, unité de comptage, ≤ `MAX_RESULT_UNIT`, sinon 400 en français), l'enregistre dans `Result.unit` ; une ligne qui ne poste rien garde l'unité calculée ; journal `RESULTS_SAVED` (unité avant → après) ; le rapport, l'alerte et la feuille imprimée lisent l'unité enregistrée. **Avant** : lister sur la copie locale les unités des critères et limites des surfaces (UFC/cm², UFC/25 cm², UFC/100 cm²…) et le dire au propriétaire : le jugement compare des nombres, sans conversion (la réponse du laboratoire) | `src/lib/lab-proposals.ts`, `src/lib/result-unit.ts` (+ test), `src/lib/bench-plan.ts`, `src/components/programmation/programme-sheet-logic.ts`, `src/app/api/samples/[id]/results/route.ts`, `…/results/submit/route.ts`, `src/app/technicien/[id]/page.tsx`, `src/components/technicien/ResultEntryForm.tsx`, `src/app/api/bench-sheet/route.ts` | S–M | non (`Result.unit` existe) |
| I10 | 2.8 (Q70) | nouvel interrupteur `IDENTIFICATION_TO_VERIFY` (ON) : C5 « Identification » répondu **Non** → ligne **« à vérifier »** (motif `IDENTIFICATION` gardé à portée de main), plus **NON_CONFORME** ; l'échantillon peut être accepté conforme ; avec `OBSERVATION_ONLY_DELAY_AND_TEMPERATURE` allumé, aucune observation n'est exigée pour cette ligne (simple avertissement, comme la DLC) ; le réceptionniste peut toujours déclarer l'échantillon non conforme à la main, motif « Identification » ou « Emballage » ; le texte d'aide « Corriger la fiche avant de valider » devient « À vérifier : corriger la fiche si besoin » ; s'applique aussi au comptoir (`DepositForm`) et à la création d'un dépôt (`serie-input.ts`). L'emballage (C3, retiré le 16/10) : rien à changer (« contenant abîmé » = observation ou non-conformité choisie à la main) | `src/lib/reception-complementary.ts` (`tickedRow`, `identificationHint`), `src/lib/reception-input.ts`, `src/lib/serie-input.ts`, `src/components/reception/SerieReceptionForm.tsx`, `DepositForm.tsx`, `reception-logic.ts`, tests (`reception-complementary`, `reception-input`, `reception-logic`) | S | non |
| J7 | 2.14 (Q108) — **hypothèse, à confirmer par D-1** | nouvel interrupteur `COLLEAGUE_SAMPLES_HIDDEN` (ON) : pour un TECHNICIEN, la liste « Pris par un collègue » disparaît de /technicien ; la fiche `/technicien/[id]` d'un échantillon tenu par un collègue répond **404** (comme un échantillon inexistant : rien n'est dit de ce qu'il contient) ; « Reprendre » n'est plus atteignable (`TAKE_OVER_COLLEAGUE` reste ON, mais sans écran : la route `PATCH …/take` le refuse aussi, 403, tant que J7 est allumé) ; « tenu par un collègue » = `Sample.technicianId` d'un autre **et** aucun paramètre tenu par le technicien lui-même (`SampleParameter.technicianId`, prise par paramètre : un échantillon partagé reste visible de chacun de ses tenants) ; la **reprise** passe par l'administrateur : « Libérer » (existe, `DELETE /api/samples/[id]/take`, TECHNICIEN ou ADMIN) remet l'échantillon dans « À prendre », où tout technicien le prend — **mais aujourd'hui « Libérer » est refusé dès qu'un relevé est saisi** (`untakeRefusal`, `src/lib/bench-access.ts` : 409 « Des résultats sont déjà saisis… ») : or « Reprendre » (2.13) servait justement un échantillon commencé par un collègue absent. Donc, J7 allumé : l'**ADMIN** peut « Libérer » un échantillon qui porte des relevés (les relevés gardent leur auteur, D-09 ; journal `SAMPLE_UNTAKEN` avec le nombre de relevés), le technicien titulaire toujours pas ; vérifier par un test que « Prendre » un échantillon libre qui porte déjà des relevés fonctionne (`takeRefusal`) et que la soumission reste au nouveau tenant ; option, si D-1 le dit : ouvrir « Libérer » au responsable des paramètres (PROGRAMMATEUR) ; la recherche du technicien reste ses échantillons (confirmé) ; les relevés déjà saisis gardent leur auteur (D-09). OFF : comme aujourd'hui | `src/lib/lab-proposals.ts`, `src/app/technicien/page.tsx`, `src/app/technicien/[id]/page.tsx`, `src/lib/bench-access.ts`, `src/lib/take-over.ts`, `src/app/api/samples/[id]/take/route.ts`, tests de gardes (`bench-access` : `untakeRefusal` avec relevés, ADMIN / titulaire ; `take-over`) | M | non |
| J8 | Q106 — **le tri des urgents : hypothèse, à confirmer par D-2** | « À prendre » rangé **par N° de série** (année, puis ordre de tirage du compteur, puis numéro d'échantillon dans la série) par défaut, avec un choix « Trier par : N° de série · N° de contrôle » (paramètre d'URL `?tri=`, gardé dans le lien comme les vues) ; les urgents gardent leur badge mais **ne passent plus devant** (hypothèse : la réponse ne les nomme pas) ; « Mes analyses » et les vues gardent `BENCH_ORDER`. Attention : `Serie.serialNumber` et `Sample.controlCode` sont des chaînes (« 100/26 » < « 99/26 » en tri alphabétique) : trier par `serie.year`, `serie.createdAt`, `lineNumber` (l'ordre du compteur SERIE, tiré à la création sous verrou) et, pour le N° de contrôle, par `receivedAt`, `lineNumber` (tiré à la réception) — à vérifier par un test sur des numéros à 2, 3 et 4 chiffres, et après un saut de compteur (Q19) ; description de la liste et texte d'aide de /technicien mis à jour | `src/app/technicien/page.tsx` (`BENCH_ORDER`, nouvel ordre `TAKE_ORDER`), `src/lib/circuit-views.ts`, un module pur `bench-order.ts` (+ test) | XS–S | non |
| K11 | Q132 | nouvel interrupteur `UNSENT_REPORT_CORRECTED_IN_PLACE` (ON) : sur un rapport **validé jamais envoyé** (`reportVersionSent` faux, statut VALIDE), le verbe devient « **Corriger avant envoi** » (mêmes rôles que « Rouvrir pour amendement » : validateur, Direction, administrateur ; motif obligatoire, interne) ; l'échantillon repasse en RESULTATS_SAISIS, double validation de nouveau ; à la nouvelle approbation, la **même version** est réémise : même numéro imprimé (pas de `-A1`), pas d'en-tête « Rapport amendé — Annule et remplace », pas d'objet « Rapport amendé », `Report.version` et `amendedAt` inchangés ; la version figée remplacée est **gardée comme trace interne** (jamais imprimée ni envoyée), avec le motif, l'auteur et la date ; journal `REPORT_CORRECTED_BEFORE_SEND` ; le parcours de l'échantillon le montre ; un rapport **déjà envoyé** garde l'amendement (inchangé) ; cas d'un **amendement pas encore envoyé** (`-A1` validé, `reportVersionSent` faux, la version 0 envoyée) : il se corrige aussi en place, mais **garde** son numéro `-A1` et son « Annule et remplace » de la version envoyée — seul ce qui n'est jamais parti est corrigé sans trace imprimée ; test des deux cas ; la fenêtre ne montre plus `unsentReopenWarning` quand l'interrupteur est allumé. Garde de course : si l'envoi part pendant la correction, la correction est refusée (409) | `src/lib/report-amendment.ts` (+ test), `src/app/api/samples/[id]/reopen/route.ts` (ou une route sœur `…/correct`), `src/lib/report-dispatch.ts` (émission sans suffixe), `src/lib/validation-server.ts`, `src/components/validation/ReportActions.tsx`, `src/lib/sample-status.ts` (+ test), `src/lib/audit-labels.ts`, `AMENDEMENT.md` | M | **oui, additive** : `ReportVersion.correctedBeforeSend Json?` (les versions remplacées, LONGTEXT — le journal `AuditLog.metadata` est un TEXT de 64 Ko, trop court pour un `ReportData`) |
| — | C-4, C-5, C-6, C-7, C-8, Q73, Q133 | commentaires « confirmé le 20/11 » : `ACCREDITATION_LOGO_BY_HAND` (qui, ajout, « SA »), `SINGLE_UNIT_NO_TOLERANCE`, `COMMERCIAL_RESENDS_REPORTS`, `ONSSA_COUNT_BY`, `CLIENT_PRICE_SKIP_LEGACY_TARIFF`, `CLIENT_PRICE_OWN_BEFORE_SITE` ; `HANDOFF.md` §9 ; les hypothèses « à confirmer par C-x » levées dans `RETOUR-LABO-04-11.md` §5 | `lab-proposals.ts`, `HANDOFF.md` | XS | non |

Tests et contrôles de 5A : `npm test` (nouveaux cas : unité choisie, jugement
par la valeur d'une surface, air inchangé, « à vérifier » d'identification,
404 d'un échantillon d'un collègue, ordre par N° de série « 9/26, 10/26,
100/26 », correction avant envoi sans suffixe et avec trace), `tsc`,
`eslint`, `npm run build` ; recette locale `.ui-tests/v23-lot5a-local.mjs`
puis production `v23-lot5a-prod.mjs` sur « TEST UI » (TESTPLAN « Checkpoint
V23 ») ; `DEPLOY.md` « Lot 5A » (tag `v1.8-avant-lot5`, dump, une migration
additive).

### 5A — gestes du propriétaire (sans code, en production, journalisés)

| # | Quoi |
|---|---|
| S13 | C-3 — /magasin (réglages Achat & Stock) : base **TVA**, **75 %** avec attestation, **100 %** sans, champ d'application « fournisseurs soumis » (au cas par cas : cocher « soumis à la retenue » fournisseur par fournisseur, quand le laboratoire les nomme) ; **la durée de l'attestation reste 3 tant que D-3 n'a pas répondu** (4 ou 6 mois) ; avertissement (pas de blocage) |
| S14 | C-8 (d) — /admin/parametres : « Escherichia coli » en alias de l'analyse « E. coli » de l'eau, « Coliformes à 36 °C » en alias de « Coliformes totaux » de l'eau ; puis /admin/import « Importer les prix clients » : **analyse** (relire les rapprochés nouveaux), puis **import** (idempotent : seuls les prix nouveaux s'écrivent, un prix retiré à la main n'est jamais remis) ; les autres analyses introuvables (surfaces « Coliformes totaux à 30 °C * », effet aseptisant) restent en dehors (non confirmées) |
| S15 | Q133 — compter puis passer à **n = 1** les critères de la famille sensorielle reprise de l'ancien logiciel (« PRODUIT ALIMENTAIRE », n = 5, c = 1) dans la grille des critères ; avec J5, c devient sans effet sur une limite unique ; la « Détermination de l'odeur » (déjà n = 1) inchangée ; si le nombre de lignes rend la saisie à la main trop longue : un script XS par la route de l'application (essai, puis réel), comme S12 |
| S16 | Q11 / L6 — /admin/entreprise « Copies internes (alertes et rapports) » : la **première adresse** (`backups/retour-labo-20-11/adresses.md`), « Alertes » et « Rapports », **tous les clients** ; la seconde seulement quand D-5 l'a complétée (jamais une adresse devinée) ; tant que le domaine n'est pas vérifié, les envois restent simulés |
| S12 | (suite) quand la portée d'accréditation est en main (D-6) : marquer « Accrédité » ligne à ligne dans /admin/parametres (« Accréditation des paramètres ») ; jamais `--domains` |
| S17 | Q19 — **seulement si le propriétaire le décide** (§7) : /admin « Compteurs » — SERIE 2026 → 5000, CONTROLE 2026 → 40000 (le suivant sera 5001/26 et 40001/26), même geste pour 2027 au 1er janvier si l'ancien logiciel tourne encore |

## 6. Le plan — lot 5B (l'historique de l'ancien logiciel sur le portail)

**La demande** (Q20, « Autre ») : « Ajouter tout l'historique des clients,
ancien plus nouveau ». Le client voit sur le portail, en plus de ses
échantillons du nouveau logiciel, **tout ce que l'ancien logiciel a fait
pour lui** depuis 2017 ; le laboratoire le voit aussi sur la fiche client.
**En lecture seule**, construit **depuis la base Firebird** (`qlabo-fb`), sans
toucher aux échantillons, rapports ni compteurs du nouveau logiciel.

**Principes (hypothèses, à confirmer par D-7 quand utile)**
- Un écran **séparé** « Historique (ancien logiciel) » : ses numéros (séries
  « 2772/26 », contrôles « 20459/26 ») croisent ceux du nouveau logiciel en
  2026 (Q19) — ne jamais les mêler dans une même liste ni un même compteur ;
  le tableau de bord du portail (12 mois) reste celui du nouveau logiciel.
- **Ce ne sont pas des rapports officiels** : le rapport signé (PDF du dossier
  partagé du laboratoire) fait foi ; l'écran le dit en tête (« Données
  reprises de l'ancien logiciel, à titre d'information — le rapport signé
  fait foi ») ; **aucun PDF n'est régénéré** à l'en-tête du laboratoire, sans
  logo d'accréditation ni signature (ISO 17025 §7.8 : un rapport réémis
  serait un nouveau rapport). Option HA8 : joindre les PDF d'origine.
- **Aucune fuite entre clients** : un échantillon de l'ancienne base n'est
  rattaché à un client du nouveau logiciel que par une correspondance
  **certaine** ; les cas douteux ne sont jamais importés avant d'avoir été
  tranchés à la main par l'administrateur.
- Idempotent et rejouable : l'ancien logiciel tourne encore (Q19 « pas
  décidé ») ; l'import se relance (chaque mois, puis une dernière fois à
  l'arrêt de l'ancien logiciel) et n'écrit que le nouveau ou le changé.
- Interrupteur `LEGACY_HISTORY_ON_PORTAL` (ON) : OFF, l'écran du portail
  disparaît (la fiche client du laboratoire le garde).

### HA1 — modèle de données (migration additive)

| Table | Champs | Index / contraintes |
|---|---|---|
| `LegacyClientLink` | `legacyClientId Int @unique` (CLIENTS.ID, type 101 client ou 102 site), `clientId` (FK `Client`), `siteId String?` (FK `Site`, pour un site de l'ancien logiciel — `Site.legacyId` existe), `matchedBy` (ICE / NOM / SITE / MAIN), `createdById`, `createdAt` | `@@index([clientId])` |
| `LegacySample` | `legacyId Int @unique` (`LIN_BON_COMMANDE.ID_LIGNE`), `clientId` (FK, le client du nouveau logiciel), `siteId String?`, `legacyClientId Int`, `serieNumber` (« 2772/26 », `BONCOMMAND.CODE/ANNE`), `controlNumber` (« 20459/26 », `LIN_BON_COMMANDE.NUM/ANNE`), `year Int`, `nature String?` (type d'analyse), `productType String?`, `designation String?`, `lot String?`, `place String?` (lieu de prélèvement), `sampledAt DateTime?`, `receivedAt DateTime?`, `reportNumber String?`, `reportedAt DateTime?`, `interpretation Interpretation?` (le verdict de l'échantillon, s'il existe), `conclusion String? @db.Text`, `cancelled Boolean`, `sourceHash String` (empreinte de la ligne, pour ne réécrire que le changé), `importedAt DateTime` | `@@index([clientId, sampledAt])`, `@@index([clientId, year])`, `@@index([siteId])` |
| `LegacyResult` | `legacyId Int @unique` (`PARAMES_BON_COMMANDE.ID`), `legacySampleId` (FK, `onDelete: Cascade`), `position Int` (ordre d'impression), `parameter String`, `method String?` (norme), `unit String?`, `value String?` (tel qu'imprimé : « < 10 », « 3,0.10³ », « Absence /25 g »), `readings Json?` (les lectures par unité : valeur, exposant, opérateur), `criterion String?` (« n = 5 ; c = 2 ; m = 10² ; M = 10³ » en clair), `interpretation Interpretation?` | `@@index([legacySampleId, position])` |

Pas de clé vers `AnalysisParameter`, `ProductType` ni `NormVersion` : les
libellés de l'époque sont gardés tels quels (l'historique ne doit pas changer
quand le catalogue change). Journal : `LEGACY_HISTORY_IMPORTED` (chaque
passage : comptes, fichier, durée), `LEGACY_CLIENT_LINKED` (chaque
correspondance tranchée à la main).

### HA2 — extraction de l'ancienne base (local, lecture seule)

- `scripts/legacy/extract-legacy-history.py` (même méthode que
  `extract-client-prices.py` et `extract-legacy.py` : `docker exec qlabo-fb
  isql`, sentinelle, `decode_mixed` pour l'encodage mêlé UTF-8 / cp1252) →
  `backups/historique-ancien/` (ignoré par git) : un fichier par **mois**
  (`samples-AAAA-MM.ndjson`, `results-AAAA-MM.ndjson`, texte non compressé :
  la route lit du texte, comme les autres imports) — chaque fichier sous 8 Mo
  (même plafond que `MAX_CSV_CHARS` de
  `src/app/api/admin/import/prix-clients/route.ts` ; nginx accepte 10 Mo,
  `client_max_body_size 10M`, `deploy/nginx.conf.example`) ; un mois trop
  gros est coupé en `-a`, `-b`…, plus
  `clients.csv` (les clients et sites de l'ancienne base qui ont au moins un
  échantillon, avec ICE et parent).
- **Étape a (avant tout code)** : repérer dans la base les tables et
  colonnes encore inconnues de nous — **les lectures par unité** (valeur,
  exposant, opérateur : le fait est établi le 13/09, la table exacte n'est
  pas notée dans le dépôt), **le numéro et la date du rapport**, **le verdict
  et la conclusion** de l'échantillon (codes `CONCLUSION` de
  `INTERVAL_PETITM` : 1 / 2 / 3 → Satisfaisant / Acceptable / Non
  satisfaisant, à vérifier sur des rapports réels), **l'annulation** d'un
  échantillon ; les noter dans un fichier `backups/historique-ancien/schema.md`.
  Connu : `BONCOMMAND` (la visite : `CODE`, `ANNE`, `ID_CLIENT`),
  `LIN_BON_COMMANDE` (l'échantillon : `ID_LIGNE`, `NUM`, `NUM_BC`,
  `ID_PRODUIT`, `LIEU_PRELEVEMENT`, `DATE_PRELEV`, `ID_TYPENOURI`,
  `ID_ECHANTILLION`), `PARAMES_BON_COMMANDE` (l'analyse demandée :
  `ID_ECHANTION`, `ID_PARAM` → `TYPENOURITURE_PARAMS.ID`), `LISTE_PARAMETRES`,
  `NORMES`, `UNITES`, `CLIENTS` (type 101 / 102, `ID_HAUTE`).
- Seulement les échantillons **rendus** (résultat validé) ; les annulés
  comptés à part, non repris (hypothèse) ; les échantillons en cours dans
  l'ancien logiciel viendront au passage suivant.
- Le script écrit aussi un **rapport de comptes** (par année : échantillons,
  analyses, lectures, clients ; lignes illisibles) — c'est lui qui fixe les
  volumes réels avant d'écrire la migration.

### HA3 — import (route d'administration, sur la production comme en local)

- `/admin/import` « **Importer l'historique de l'ancien logiciel** »
  (ADMIN seul ; `POST /api/admin/import/historique`), sur le modèle de
  « Importer les prix clients » :
  1. **clients d'abord** (`clients.csv`) — `mode=analyse` : rapprochement par
     `Site.legacyId` (sites), puis ICE exact, puis nom exact normalisé
     **unique** (le moteur de rapprochement de H5, `client-prices-import.ts`,
     réutilisé) ; liste « certains », « ambigus » (plusieurs fiches),
     « introuvables » ; l'administrateur tranche les ambigus un par un
     (choix d'une fiche ou « ne pas reprendre ») → `LegacyClientLink`
     (`MAIN`) ; `mode=commit` écrit les liens certains ;
  2. **échantillons et résultats**, un fichier mensuel par appel
     (`mode=analyse` puis `mode=commit`) : une transaction par fichier,
     `createMany` par lots de 500, `legacyId` unique (relancer le même
     fichier n'écrit rien), `sourceHash` (une ligne changée dans l'ancien
     logiciel est réécrite, jamais une ligne du nouveau logiciel) ; un
     échantillon dont le client n'a pas de lien n'est **pas** écrit (compté
     « client non rattaché ») ;
  3. un écran de suivi : mois importés, comptes, dernier passage.
- La production reçoit **les mêmes fichiers** que la copie locale (ils
  contiennent des noms de clients : ils voyagent hors du dépôt, comme les
  autres exports de l'ancienne base) ; **répétition complète d'abord sur une
  copie locale** (`qualilab_hist`) où les clients et sites de production ont
  été rejoués, puis relecture des comptes par le propriétaire avant la
  production ; dump étiqueté avant le premier import.

### HA4 — portail (`/portail/historique`)

- Onglet « Historique (ancien logiciel) » dans la navigation du portail
  (seulement si le client a au moins un échantillon repris) ; liste paginée
  (50 par page, comme `PORTAIL.md`) : N° de contrôle, N° de série, site,
  désignation, lot, date de prélèvement, date du rapport, verdict ; filtres
  période / site / recherche (numéros, désignation, lot) ; tri le plus récent
  d'abord.
- Détail d'un échantillon : en tête l'avertissement « Données reprises de
  l'ancien logiciel… », puis le tableau des analyses (paramètre, méthode,
  résultat, unité, critère, verdict) et la conclusion ; jamais un prix, un nom
  du personnel, un autre client.
- Option « Exporter (Excel) » de la liste filtrée : seulement si D-7 le
  demande.
- Requêtes : une page = une requête indexée `(clientId, sampledAt)` + un
  `count` ; le détail lit `LegacyResult` par `legacySampleId` ; sous la
  seconde (règle 9 d'`AGENTS.md`).

### HA5 — fiche client du laboratoire

- `src/app/commercial/[id]/page.tsx` (GESTIONNAIRE, ADMIN) : carte
  « Historique (ancien logiciel) » — nombre d'échantillons par année, les 10
  derniers, lien vers la liste complète (`/commercial/[id]/historique`, même
  composant que le portail, sans les restrictions de texte) ; et la liste des
  **correspondances** (fiches de l'ancien logiciel rattachées, ajout / retrait
  par l'administrateur seulement, journalisé).

### HA6 — gardes et cohérence

- Portail : `LegacySample.clientId = session.user.clientId`, sinon **404** ;
  routes `/api/portail/historique/**` seulement ; un client archivé ou
  fusionné n'ouvre plus le portail (règle existante).
- Laboratoire : GESTIONNAIRE et ADMIN lisent (la fiche) ; ADMIN seul importe
  et rattache ; tous les autres rôles 403 ; le technicien jamais (2.15).
- **Fusion, « Rattacher comme site de… », import des sites**
  (`src/lib/client-transfer.ts`, routes `merge`, `attach-as-site`,
  `import/sites`) : l'historique et les correspondances du client archivé
  passent au client conservé, dans la même transaction (sinon l'historique
  disparaîtrait du portail du client conservé) ; tests.
- Tests : rapprochement (certain / ambigu / introuvable, ICE, site), accès
  croisé entre deux clients (portail et API), fusion, relance idempotente,
  ligne changée réécrite, échantillon sans lien non écrit, décodage mêlé.

### HA7 — volumes, performances, sauvegardes

| | Ordre de grandeur (à mesurer en HA2) |
|---|---:|
| Échantillons 2017 → 2026 (≈ 30 000 / an) | ≈ 270 000 – 290 000 |
| Analyses (`PARAMES_BON_COMMANDE`, non annulées, 2017–2026) | ≈ 745 000 |
| Lectures par unité (n jusqu'à 5 ou 9, dans `readings`) | ≈ 2 – 3 millions de valeurs |
| Taille dans MariaDB | quelques centaines de Mo (à mesurer sur la copie locale) |
| Fichiers mensuels | ≈ 2 500 échantillons et ≈ 6 500 analyses par mois → ≈ 115 fichiers par table |

À vérifier avant la production : la place disque du VPS, la durée du dump
nocturne (`scripts/backup-db.sh`) et de sa restauration (`DEPLOY.md`), le
temps d'un import mensuel (cible : moins de 30 s par appel).

### HA8 — option : les PDF signés d'origine

Si le laboratoire nous donne accès au dossier partagé (« depuis 2017 ») :
rattacher chaque PDF à son échantillon par le numéro de rapport (HA2-a) et le
servir tel quel depuis le portail (stockage hors de la base, comme les
fichiers du laboratoire) — le client télécharge alors le **vrai** rapport
signé. Volume inconnu (≈ 30 000 PDF par an ?). **Seulement après D-7.**

### 5B — effort, ordre, risques

| # | Quoi | Effort | Migration |
|---|---|---|---|
| HA1 | modèle (3 tables) | S | oui (additive) |
| HA2 | extraction (dont l'étape a : repérer les tables) | M–L | non |
| HA3 | import (clients, puis mois), écran de suivi | M | non |
| HA4 | portail | M | non |
| HA5 | fiche client | S | non |
| HA6 | gardes, fusion, tests | S–M | non |
| HA7 | répétition locale, comptes, recette locale puis production | M | non |
| HA8 | PDF d'origine (option) | M | à voir |

Ordre : HA2-a (repérage, lecture seule) → HA1 → HA2 → HA3 → HA6 → HA4 →
HA5 → HA7 (répétition locale, comptes relus par le propriétaire) → production
(dump, migration, import client, import mensuel, recette sur « TEST UI » et
sur un client réel **en lecture seule** par le compte administrateur de
démonstration — jamais un mot de passe en production). Total ≈ L (3 à 5
jours).

**Risques** : (1) **une correspondance fausse montre l'historique d'un client
à un autre** — d'où l'import des liens certains seulement, les ambigus
tranchés à la main, et la relecture du propriétaire ; (2) la lecture des
résultats d'il y a neuf ans (codes de conclusion, exposants, opérateurs « < »
sur ≈ 39 % des lignes) peut différer de ce que le rapport signé imprimait —
d'où l'avertissement « le rapport signé fait foi » et la comparaison, en HA7,
de 20 échantillons tirés au hasard avec leurs PDF ; (3) volumes et durée des
sauvegardes ; (4) l'ancien logiciel continue d'écrire (Q19) : relances
mensuelles, puis une dernière ; (5) les clients n'ont de compte portail que
si l'administrateur leur en crée un (l'ancien logiciel en avait ≈ 456) : sans
compte, rien n'est vu (question au propriétaire, D-7) ; (6) les clients
fusionnés depuis la reprise du 01/10 : la fusion doit emporter l'historique
(HA6).

## 7. Ce qui reste en attente

**Le laboratoire (pas de relance hors du prochain échange — règle du
04/11)** : le PV de recette et les dates de formation ; le cachet et le logo
HD ; la portée d'accréditation (D-6) ; la seconde adresse de copie, la fin du
domaine d'expédition, le nom affiché, le contact du domaine (D-5) ; la fiche
de stock et le journal des achats remplis ; le canevas ONSSA complet, un mois
déclaré, les groupes ; Q98 (derniers numéros de facture et d'avoir) ; la
durée de l'attestation, la portée de la retenue et le blocage (D-3) ; la
limite de l'air (D-4) ; la contradiction 2.13 / 2.14 (D-1) ; le tri des
urgents (D-2) ; R-30 / R-15 (Q2 du 02/11) toujours en suspens.

**Le propriétaire** :
- **Q19 — la numérotation (O-1, urgent)** : le laboratoire n'a pas décidé
  d'arrêter l'ancien logiciel et n'a pas accepté 5001 / 40001. Tant que les
  deux tournent, un même « 58/26 » peut désigner deux échantillons (le
  nouveau logiciel en est à ≈ 64/26 en production, données d'essai). Choix :
  (a) **sauter maintenant** à 5001/26 et 40001/26 (S17, un réglage, sans
  code ; à refaire au 1er janvier 2027 — les deux logiciels repartent à 1 —
  si l'ancien tourne encore) ; (b) attendre la date d'arrêt et sauter au
  dernier numéro de l'ancien logiciel ce jour-là (Q98 pour les factures) ;
  (c) un préfixe (« N » devant le numéro) — code, M, non recommandé (le
  format NNNN/AA est celui du laboratoire). Recommandation : (a), avant que
  les essais du laboratoire deviennent réels.
- **Q98** : rien à décider avant la bascule ; le saut se règle dans
  « Compteurs » ce jour-là.
- Le compte `direction1` et les comptes Direction (toujours à créer) ; H5 :
  la Direction toujours sans écran de facture (décision du 26/10, C-8 (d)
  du propriétaire, non tranchée).
- Le lancement de 5A puis de 5B (aucun n'est commencé).

## 8. À reposer au laboratoire — une ligne chacune (prochain échange, quand le propriétaire le décide)

- **D-1 — 2.14 contre 2.13** : « Vous avez écrit que les échantillons des
  collègues ne sont « pas visibles ». Le 28/10, vous aviez demandé que tout
  technicien puisse **reprendre** l'échantillon d'un collègue (2.13). Nous
  proposons : le technicien ne voit plus ceux des collègues ; pour reprendre
  un échantillon, même déjà commencé (ses relevés gardent leur auteur),
  l'administrateur (ou le responsable des paramètres ?) le remet dans « À
  prendre », où un autre technicien le prend. D'accord ? »
- **D-2 — Q106** : « « À prendre » par n° de série : les urgents restent-ils
  en tête, ou seulement signalés ? Et le choix entre n° de série et code
  d'échantillon : faut-il les deux ? »
- **D-3 — Q18, pour le comptable** : « (1) Une attestation de régularité
  fiscale vaut-elle 4 mois (120 jours) ou 6 mois (180 jours) ? (2) La
  retenue (75 % / 100 % de la TVA) concerne-t-elle seulement vos achats
  (vous retenez sur vos fournisseurs), ou aussi vos factures aux clients
  (vos clients retiennent sur vous) ? (3) Sans attestation valide : avertir
  seulement, ou bloquer le paiement ? (4) Quels fournisseurs ? »
- **D-4 — C-1, l'air** : « Pour l'air (boîte exposée, biocollecteur), quelle
  limite (UFC par boîte, UFC/m³) ? En attendant, une lecture d'air n'est
  jugée que contre un critère de la même unité. » **Et, pour une surface
  décrite en mots (« couteau »)** : « Un objet prélevé une fois (n = 1) face
  à un critère à n = 5 : le résultat doit-il être un verdict officiel
  (« 120 UFC/couteau face à ≤ 100 → non conforme »), ou indicatif ? Faut-il
  programmer n = 5 sur un couteau ? » — hypothèse construite (revue du lot
  5A, interrupteur `SURFACE_DESCRIBED_N_FROM_CRITERION` éteint) : le n du
  critère n'est pas proposé pour une surface décrite ; lue sur une unité,
  elle reçoit un verdict indicatif (« Non satisfaisant », l'alerte part
  quand même).
- **D-5 — adresses** : « La seconde adresse de copie est incomplète (le
  domaine manque) : pouvez-vous nous l'écrire en entier ? L'adresse d'envoi
  des rapports se termine-t-elle par « .com » ? Le nom affiché ? Qui gère
  votre nom de domaine (pour les trois enregistrements DNS) ? »
- **D-6 — C-4, la portée d'accréditation** : « Nous n'avons pas reçu la
  portée d'accréditation (« déjà transmise ») : pouvez-vous nous l'envoyer
  (PDF), ou nous dire sur quel site la trouver ? »
- **D-7 — Q20, l'historique** (avec la démonstration de 5B, pas avant) :
  « (1) Faut-il aussi les PDF signés de votre dossier partagé sur le portail
  (le vrai rapport), ou les résultats suffisent-ils ? (2) Les clients qui
  avaient un compte sur l'ancien portail : leur en créer un sur le nouveau ?
  (3) Un export Excel de l'historique pour le client ? »

## 9. Ordre

1. **Maintenant, sans code, quand le propriétaire le dit** : S13 (sans la
   durée), S14, S15 (compté d'abord), S16 (la première adresse) ; décision
   Q19 (S17 si (a)).
2. **Lot 5A** (P1, ≈ 1 à 1,5 jour, une migration additive) : J6, I10, J8,
   K11, commentaires ; J7 derrière son interrupteur — **déployé éteint ou
   allumé selon le propriétaire** tant que D-1 n'a pas répondu (proposition :
   construit allumé, puisque « pas visible » est la réponse la plus récente,
   avec « Libérer » de l'administrateur comme reprise) ; contrôles, recette
   locale, déploiement, recette de production (TESTPLAN V23).
3. **Lot 5B** (P2–P3, ≈ 3 à 5 jours) : HA2-a d'abord (Docker et `qlabo-fb`
   relancés — voir la note du socket périmé), puis HA1 → HA7 ; répétition
   locale relue par le propriétaire avant la production.
4. **Prévenir le laboratoire** au déploiement de 5A : l'unité des surfaces
   au choix et jugée par la valeur, l'identification « à vérifier », « À
   prendre » par n° de série, la correction d'un rapport jamais envoyé sans
   amendement, (J7) les échantillons des collègues masqués ; avec D-1 à D-6.

## 10. Dépôt public

- Le scan reste dans `backups/retour-labo-20-11/` (ignoré par git) ; les
  adresses lues sur le scan dans `backups/retour-labo-20-11/adresses.md`
  (ignoré par git) ; les fichiers de 5B dans `backups/historique-ancien/`.
- Ici, aucun nom de membre du personnel, de client, ni aucune adresse e-mail.
