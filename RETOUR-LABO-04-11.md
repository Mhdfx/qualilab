# Réponses du laboratoire du 04/11 (le questionnaire du 02/11 annoté) — plan du lot 4

> **Analysé le 05/11 — rien construit, rien déployé, production non
> touchée.** Le 04/11, le laboratoire a renvoyé, scanné (3 pages), notre
> questionnaire du 02/11 « Quelques questions pour finir les réglages »
> (`backups/Qualilab-questions-2026-11-02.pdf`, 18 questions, chacune avec sa
> référence R-x de `RETOUR-LABO-28-10.md` §6), coché et annoté à la main.
> Chaque réponse a été relue sur les pages agrandies, puis comparée **au
> code** (branche `lot2-retour-16-10` = `master`, `c287aa0` ; la production
> tourne `19d21af`, même code applicatif) et aux interrupteurs de
> `src/lib/lab-proposals.ts`. Ce document complète `RETOUR-LABO-28-10.md`
> (lot 3, en production depuis le 01/11).
>
> - **Règle du propriétaire (04/11)** : « les questions non répondues sont en
>   suspens de validation par la direction, pas d'urgence là-dessus ». Une
>   question laissée vide n'est donc **pas** relancée : elle est notée « en
>   attente (direction) » (§6) et le comportement construit reste en place.
> - **Lot 4** = ce que ces réponses permettent de construire ou de corriger
>   (§5). **À clarifier** = une réponse écrite mais ambiguë (§7).
>   **Propriétaire** = réglage ou donnée, pas de code (§5, lignes S).
> - Règle du propriétaire du 21/10 : chaque construction est déployée puis
>   testée en production (sur « TEST UI » seulement).
>
> Effort : XS ≈ 1 h ou moins · S 1–4 h · M 4–12 h · L plus de 12 h
> (estimations). Priorité : **P1** avant que les essais du laboratoire
> continuent · **P2** avant la mise en service réelle · **P3** après.

---

## 0. Ce qui est revenu

- **Le scan** (04/11 12:36, 3 pages, sans e-mail d'accompagnement transmis),
  rangé hors du dépôt : `backups/reponses-labo-04-11-scan.pdf` (ignoré par
  git). Les trois pages de notre questionnaire, dans l'ordre, une seule
  écriture (stylo bleu) sauf quelques mots au crayon (Q10, Q11, Q16, fichiers).
- **Décompte des 18 questions** :
  - « Oui, d'accord » coché, sans réserve : **Q1** (avec une précision),
    **Q3, Q4, Q5, Q15, Q17** ;
  - « Oui » coché **avec une précision qui change ou complète** la
    proposition : **Q10** (d'autres paramètres plus tard), **Q12** (les
    jours corrigés), **Q14** (le moyen seulement pour l'air), **Q16**
    (« Acceptable » barré) ;
  - « Autre » coché : **Q8** (une unité au-dessus = « Non satisfaisant »),
    **Q9** (alerte seulement avec l'envoi, pas de renvoi par le commercial) ;
  - aucune case, mais un texte : **Q6** (« ça c'est faux », « le critère
    c'est la limite »), **Q7**, **Q11**, **Q13**, **Q18** (des taux) ;
  - **rien du tout : Q2** (seule question entièrement vide).
- **Fichiers à nous envoyer** (aucune case cochée, des dates écrites) :
  logo, logo d'accréditation, cachet, RIB, liste des paramètres accrédités
  « envoyé le 28/10 » ; adresse e-mail et contact du domaine : « À
  discuter » ; fiche de stock et journal des achats « envoyé le 27/10 »
  (lecture probable) ; canevas ONSSA « envoyé le 27/10 » (idem). Voir §3 : ce
  qui est réellement arrivé.

## 1. Les réponses, une par une

Nature : **confirmé** (rien à faire) · **à modifier** (changer un
comportement construit) · **à construire** · **réglage** / **donnée**
(propriétaire, sans code) · **en attente** (direction) · **à clarifier**.
« K7 »… = l'élément du plan (§5) ; « C-1 »… = la question de §7.

| # | Réf. | Écrit sur le scan | Lecture | En ligne aujourd'hui | Suite | Nature | Taille |
|---|---|---|---|---|---|---|---|
| 1 | R-7 (Q118) | « Oui, d'accord : elle reste modifiable » coché ; en marge « Suggère la vraie heure actuelle mais modifiable » | « Arrivé le » prérempli à l'heure du moment, modifiable : exactement ce qui est construit | `SerieReceptionForm.tsx` / `DepositForm.tsx` : l'arrivée enregistrée par le préleveur, sinon la minute courante, champ modifiable (`editedArrival`) | rien | confirmé | — |
| 2 | R-30, R-15 (Q71, 2.6) | rien | non répondue : en suspens de la direction | `OBSERVATION_ONLY_DELAY_AND_TEMPERATURE` = true, `UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE` = true ; « Autre » (tiers) : « Prélevé le » facultatif (`samplingTimeRequired`, sans interrupteur) | rien ; les interrupteurs restent allumés | en attente | — |
| 3 | R-8 (Q75) | « Oui » coché | l'accord du client s'ajoute ou se corrige après la réception, par la réception et l'administrateur, jusqu'à la validation technique, l'ancienne réponse tracée | I6 : `CONSULTATION_AFTER_RECEPTION` = true, `PUT /api/samples/[id]/consultation`, journal `CLIENT_CONSULTATION_UPDATED` | rien ; commentaire de l'interrupteur « confirmé le 04/11 » | confirmé | XS (commentaire) |
| 4 | R-9 (2.7) | « Oui » coché (coche appuyée) | « Rejeté » = refusé à l'arrivée et **rendu au client**, sans analyse et sans destruction par le laboratoire | n'existe pas : décisions « Analyser malgré tout », « En attente du client », « Détruire » (`RECEPTION_DECISION_LABELS`, `RELEASE_DECISIONS`) ; motif d'annulation `DETRUIT_A_RECEPTION` seulement | **I9** : « Rejeter (rendu au client) » | à construire | S–M |
| 5 | R-12 (2.12) | « Oui » coché | lecture 30 au 1/100 → « 3.10³ UFC/g » : juste | J4 : « Dilution lue » préremplie et modifiable, `Result.dilutionUsed`, notation du laboratoire (sans interrupteur) | rien | confirmé | — |
| 6 | R-28, R-29 (2.11, 2.3, 2.17) | aucune case ; dans la question, « pour un couteau » et « pour une boîte » **barrés** (« UFC/cm² » souligné) ; une coche en marge gauche de la ligne « (…) n'est pas appliqué : la ligne est sans interprétation » et « ça c'est faux » ; à droite « le critère c'est la limite. » ; suite en haut de la page 2 : « les résultats s'expriment de deux manières, quantitative ou qualitative : quantitatifs c'est des chiffres, qualitatifs s'expriment par détecté / non détecté, absence / présence, et l'expression s'applique par des normes » | (a) **la limite du catalogue est le critère** : une analyse sans critère de la famille mais avec une limite est jugée contre elle — R-28 (1re partie) **confirmée** ; (b) « ça c'est faux » vise la seconde phrase : écarter un critère exprimé dans une autre unité que le prélèvement ; les exemples barrés disent que nos exemples ne correspondent pas à leur pratique (un couteau ne se rend pas en UFC/cm², une boîte exposée pas en UFC/m³). **Ce qu'il faut faire à la place n'est pas écrit** | J3 : `NO_CRITERION_NO_INTERPRETATION` = true (la limite compte comme critère) ; J1 / J2 : `UNIT_MISMATCH_NOT_JUDGED` = true (`unitJudges`, `result-unit.ts`) | (a) rien, commentaire « confirmé le 04/11 » ; (b) **C-1** avec un exemple à l'écran ; selon la réponse : éteindre `UNIT_MISMATCH_NOT_JUDGED` (XS) ou saisir des critères par objet / par moyen dans le catalogue (donnée) | à clarifier | XS–S |
| 7 | R-28 (2e partie) | aucune case ; « Autre : Il n'y a pas de boîte avec lecture impossible ; quand il n'y a pas de critère : chiffre, ou on parle d'absence ou présence ; pas de boîte avec lecture impossible » | sans critère, le technicien écrit un chiffre, ou « Absence » / « Présence » ; le cas « lecture impossible » n'existe pas chez eux | O-12 + J3 : le technicien tranche « Présence » / « Absence » ou laisse « En cours » ; un texte illisible sur un germe sensible sans critère est refusé (`unreadableSensitiveReading`) | rien (comportement compatible) ; option XS : alléger la phrase « boîte contaminée » de la paillasse | confirmé | — (XS option) |
| 8 | Q131 | « Autre (une seule unité au-dessus = « Non satisfaisant », avec alerte) » **coché** ; en marge « Exemple pour vérifier. » | un critère repris avec n = 1 et c = 1 sur une limite unique : une unité au-dessus doit donner **« Non satisfaisant »** (et l'alerte pour un germe sensible), pas « Acceptable ». Le laboratoire demande un **exemple pour vérifier** | `judgeCounts` (`interpretation.ts`) : limite unique, c unités tolérées « Acceptable » quel que soit n ; la grille l'écrit sous la ligne (`wideToleranceNote`, `criteria-input.ts`) ; défaut du 19/10 | **J5** : c sans effet quand n = 1 sur une limite unique ; l'exemple chiffré (§7 C-5) | à modifier | S |
| 9 | R-13 (2.16 b, c) | « Oui » : une marque légère, non retenue ; « **Autre** (alerte seulement avec l'envoi du rapport / pas de renvoi par le commercial) » coché net ; dans la question « gestionnaire commercial » barré ; « Il ne doit pas envoyer de rapport » ; « Seul le validateur technique ou l'administration » | (c) l'alerte de contamination part **seulement avec l'envoi du rapport** ; (b) le gestionnaire commercial **n'envoie ni ne renvoie** ; envoient : le validateur technique et « l'administration » (Direction et administrateur, lecture : la validation administrative) | `ALERTS_AT_VALIDATION` = true (l'alerte part à la validation que dit le réglage ; S2 appliqué le 02/11 : la validation administrative) ; `COMMERCIAL_RESENDS_REPORTS` = true (`RESEND_REPORT_ROLES` = gestionnaire + `SEND_REPORT_ROLES`) ; `SEND_REPORT_ROLES` = VALIDATEUR, DIRECTION, ADMIN | **K7** : `ALERTS_AT_VALIDATION` → false ; **K8** : `COMMERCIAL_RESENDS_REPORTS` → false ; `SEND_REPORT_ROLES` inchangé (confirmé) | à modifier | XS |
| 10 | R-14 (2.21) | « Oui » coché : Listeria monocytogenes seule ; pour les comptages, alerte dès qu'on en trouve (plus de 0) ; + au crayon « d'autres paramètres, si on a besoin on en ajoute au futur » | Listeria = **L. monocytogenes seule** ; les dénombrements cités (E. coli surfaces et mains, E. coli « présumés », Listeria dans les eaux) alertent **dès 1 UFC** ; la liste pourra s'allonger (ils cocheront eux-mêmes « alerte » dans le catalogue) | S3 appliqué le 01/11 sans Listeria (`--listeria none`) ; dénombrements sans limite **non marqués** (« 2 dénombrements E. coli sans limite non marqués » en production) ; O-12 : un germe `alertOnExceed` **sans critère ni limite** alerte dès que la lecture est > 0 | **S10** : relancer `scripts/s3-contamination-alerts.mts --listeria monocytogenes` (essai, approbation, puis réel) et marquer les dénombrements cités (`alertOnExceed`, sans limite : O-12 donne « > 0 ») | réglage | XS |
| 11 | R-16 (Q93) | aucune case ; au crayon, sur deux lignes : « → choix des / client » et « adresses pour / des alertes + rapport » (lecture : « choix des client[s], adresses pour des alertes + rapport » ou « choix des adresses pour [le] client ») ; « + 2 adresses dans tous les envois » (dernier mot incertain) | (1) choisir, client par client, les adresses qui reçoivent les alertes et les rapports — ou choisir les clients concernés par les copies (les deux lectures mènent au même écran : adresses du client sur sa fiche, « clients choisis » de L5) ; (2) **deux adresses du laboratoire en copie de tous les envois** (alertes **et** rapports, tous les clients). Les adresses ne sont pas données | (1) existe : `ClientEmail.forReports` / `forAlerts` (et `siteId`) sur la fiche client ; (2) L5 « Copies internes des alertes » : alertes seulement, « tous les clients » ou « clients choisis » (`AlertCopyAddress`) | (1) rien ; (2) **L6** : les copies internes aussi pour les rapports ; les deux adresses : donnée (§8) | à construire + donnée | S |
| 12 | R-18 (Q8) | « Oui » coché ; microbiologie « 5 » barré → **« 8 »** jours ouvrés ; physico-chimie « 7 » barré → **« 10 ? 15 jours »** (un signe entre 10 et 15 : trait ou « = » mal formé, illisible) ; « du lundi au vendredi ; jours fériés non retirés ; pas de délai pour les autres » non barrés | microbiologie : 8 jours ouvrés ; physico-chimie : 10 jours ouvrés (≈ 15 jours calendaires), **ou** de 10 à 15 jours selon le type d'analyse — à préciser (C-2) | K5 : `LabSettings.dueDaysMicro` = 5, `dueDaysChimie` = 7 (valeurs de la migration, laissées le 02/11), `dueCalendarDays` **unique** pour tous les domaines ; **déjà construit** : un délai propre à chaque type d'analyse (`AnalysisNature.dueDays`, « Un délai propre à un type d'analyse » dans `DueDelaysForm.tsx`, /admin/reglages), qui l'emporte sur celui du domaine | **S9** : /admin/reglages → micro 8, physico-chimie 10, jours ouvrés (provisoire jusqu'à C-2). Si « 10 – 15 » = selon le type d'analyse : délais par type dans le même écran (réglage, sans code). Si la physico-chimie seule doit compter en jours calendaires : le drapeau ouvrés / calendaires devient propre à chaque domaine (K5 bis, XS–S, migration additive) | réglage + à clarifier | XS |
| 13 | R-18 (Q14) | aucune case ; « en microbiologie et histamine, ça dépend des cas » (flèche vers « astérisque ») ; sur la ligne « Autre » (case non cochée) : « ~~laisser~~ mettre le logo par défaut mais de laisser la main pour modifier. » | logo d'accréditation **par défaut** sur un rapport mixte (comme construit), mais **modifiable à la main** rapport par rapport ; leur accréditation porte sur la microbiologie et l'histamine | K4 : `ACCREDITATION_LOGO_ON_MIXED_REPORT` = true, automatique (au moins une analyse accréditée), aucun choix manuel ; statuts d'accréditation « à préciser » tant que la liste n'est pas saisie | **K10** : case « Logo d'accréditation » avant l'émission (défaut = la règle actuelle), figée avec la version ; qui la touche : C-4 | à construire | S–M |
| 14 | R-27 (Q104 d) | « Oui » coché ; « le moyen de prélèvement ne doit s'afficher dans le rapport que dans le cas de l'air (des prélèvements) » | les libellés conviennent, mais la ligne « Moyen de prélèvement » **n'apparaît que pour l'air** ; ni « Écouvillon », ni « Flacon stérile », ni « N/A » sur les autres rapports | K6 : `SAMPLING_MEANS_BY_KIND` = true → « Écouvillon » / « Flacon stérile » / « Sachet stérile… » quand le laboratoire prélève, « N/A » sinon ; l'air garde sa méthode (`samplingMeansText`, `samplingReferenceHtml`) | **K9** : la ligne seulement pour l'air (nouveaux rapports ; versions émises inchangées) | à modifier | XS–S |
| 15 | R-6, R-21 (Q115) | « Oui » coché (croix) | le récapitulatif par site tel que construit : une ligne par échantillon, une colonne par paramètre, valeur colorée, la réception ne voit que « C / NC » | L1 : `RECAP_DEFAULT_MODE` = "valeur", `recapAccess` (valeurs aux profils de `REPORT_READ_ROLES`, C / NC à la réception et à la programmation) | rien ; la décision du propriétaire sur les valeurs est confirmée par le laboratoire | confirmé | — |
| 16 | R-22 | « Oui » coché (croix) ; « Acceptable » barré d'une croix ; en marge « Conforme / non conforme » | comptage confirmé (reçus dans le mois ; surfaces, mains, air non déclarés ; Origine = Local / Importé / Destiné à l'export) ; dans le rapport ONSSA il n'y a que **Conforme / Non conforme** — « Acceptable » n'y existe pas : il y est compté conforme (lecture, §4) | N3 : `ONSSA_COUNT_BY` = "RECEPTION" ; « Acceptable » = conforme ; aucun groupe proposé pour surfaces, mains, air ; « Origine » par série (texte, trois valeurs proposées) | rien ; commentaires « confirmé le 04/11 » | confirmé | XS (commentaire) |
| 17 | R-4 (Q86 3) | « Oui » coché (croix) | reprendre les ≈ 6 700 prix propres à certains clients ; la facture propose le prix du client, toujours modifiable | **construit (lot 4H, local, non déployé)** — §5 « H5 — tel que construit » ; la facture propose le prix du client | **H5** : table des prix par client + reprise depuis l'ancienne base | construit (lot 4H, local, non déployé) | M–L |
| 18 | R-24 | aucune case (la proposition « attestation 3 mois, avertissement sans blocage » **non cochée**) ; « Taux avec attestation : 100 » ; « sans attestation : 10 » — le « % » imprimé après chaque nombre est repassé ou barré d'un trait de stylo, suivi d'un signe illisible (l'unité elle-même est donc incertaine) ; Base « TTC » coché ; « Fournisseurs concernés » vide ; « Autre » vide | des taux et une base, mais incohérents tels qu'écrits : **100 % du TTC** retiendrait toute la facture (le logiciel le refuse), et un taux plus fort **avec** attestation que sans est l'inverse de l'usage. Le reste (durée de l'attestation, avertissement ou blocage, fournisseurs) sans réponse | M7 : champ d'application, base (TVA par défaut), taux avec / sans attestation **vides** dans les réglages (`AchatStockSettings`) ; validité 3 mois ; `PAYMENT_REQUIRES_TAX_CERTIFICATE` = false (avertissement) ; « 100 % sur le TTC » refusé | **C-3** au comptable ; rien n'est saisi avant sa réponse ; puis réglage (S13) | à clarifier | XS (réglage) |

## 2. Les hypothèses du lot 3 — ce que la réponse en fait

| Hypothèse (interrupteur) | R-x | Réponse du 04/11 | Verdict | Suite |
|---|---|---|---|---|
| « Arrivé le » prérempli, modifiable (pas d'interrupteur) | R-7 | Oui, « suggère la vraie heure actuelle » | **confirmée** | rien |
| `OBSERVATION_ONLY_DELAY_AND_TEMPERATURE` (I7) | R-30 | vide | **en attente (direction)** | garder allumé |
| `UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE` (I3) ; tiers « Autre » facultatif | R-15 | vide | **en attente (direction)** | garder allumé |
| `CONSULTATION_AFTER_RECEPTION` (I6) | R-8 | Oui | **confirmée** | commentaire |
| « Rejeté » (I4, non construit) | R-9 | Oui : rendu au client | **à construire** | I9 |
| J4 — dilution saisie, « 3.10³ » | R-12 | Oui | **confirmée** | rien |
| `NO_CRITERION_NO_INTERPRETATION` (J3) — la limite du catalogue compte comme critère | R-28 | « le critère c'est la limite » | **confirmée** | commentaire |
| ligne en anomalie d'un germe sensible sans critère : Présence / Absence ou « En cours » | R-28 | « pas de boîte avec lecture impossible » ; chiffre ou absence / présence | **confirmée** (compatible) | rien |
| `UNIT_MISMATCH_NOT_JUDGED` (J1 / J2) | R-29 | « ça c'est faux », exemples barrés, pas de règle de remplacement | **contestée, à clarifier** | C-1 ; garder allumé d'ici là (comparer « UFC/couteau » à un chiffre en UFC/cm² donnerait des verdicts faux) |
| tolérance c avec n = 1 (défaut du 19/10) | Q131 | « une seule unité au-dessus = Non satisfaisant, avec alerte » | **changée** | J5 |
| `ALERTS_AT_VALIDATION` (K3) | R-13 (c) | alerte seulement avec l'envoi | **changée** | K7 (→ false) |
| `COMMERCIAL_RESENDS_REPORTS` (K2) | R-13 (b) | « pas de renvoi par le commercial », « il ne doit pas envoyer de rapport » | **changée** | K8 (→ false) |
| S3 sans Listeria ; dénombrements sans alerte faute de limite | R-14 | L. monocytogenes seule ; dénombrements dès > 0 | **répondue** | S10 |
| L5 — copies internes des alertes, « clients choisis » pour un client à sites | R-16 | adresses par client (alertes + rapport) ; 2 adresses du laboratoire dans tous les envois | **changée** (étendue aux rapports, tous les clients) | L6 + adresses (§8) |
| K5 — 5 / 7 jours ouvrés | R-18 (Q8) | 8 / « 10 – 15 » | **changée** | S9 ; C-2 |
| `ACCREDITATION_LOGO_ON_MIXED_REPORT` (K4) | R-18 (Q14) | logo par défaut, modifiable à la main | **confirmée comme défaut, complétée** | K10 |
| `SAMPLING_MEANS_BY_KIND` (K6) | R-27 | le moyen seulement pour l'air | **changée** | K9 |
| L1 — valeur colorée ; C / NC pour la réception | R-21 | Oui | **confirmée** | rien |
| N1 / N3 — reçus dans le mois, « Acceptable » = conforme, surfaces / mains / air non déclarés, Origine | R-22 | Oui, « Conforme / non conforme » | **confirmée** | rien |
| H5 — prix par client | R-4 | Oui | **construit (lot 4H, local, non déployé)** | H5 |
| M7 — retenue : base, taux, 3 mois, avertissement (`PAYMENT_REQUIRES_TAX_CERTIFICATE` = false) | R-24 | taux et base écrits, incohérents ; proposition non cochée | **à clarifier** | C-3 ; rien ne change |

Restent hors de ce questionnaire (exprès, 02/11) et donc **toujours
ouvertes** : R-1 à R-3 (19/10), R-10, R-11, R-14 (T° de la nature « Autre »,
T° ambiante de l'air), R-17, R-19, R-23, R-25 (**Q19 urgent**, Q98, Q20),
R-26, Q132, Q133.

## 3. Les fichiers

| Fichier demandé | Écrit sur le scan | Ce que nous avons réellement | Suite |
|---|---|---|---|
| Logo du laboratoire HD, logo d'accréditation, cachet, RIB, liste des paramètres accrédités | « envoyé le 28/10 » | **Retrouvés le 05/11 dans les téléchargements du poste** (téléchargés le 01/11 00:45 avec les copies des fichiers Excel du 28/10 — absents de l'inventaire de `RETOUR-LABO-28-10.md` §0) : (1) un document Word « logo et symboles » = le **logo d'accréditation** (organisme marocain d'accréditation, mention « Essais », la référence d'accréditation du laboratoire en légende — non recopiée ici), image 1119 × 899 en CMJN, 892 Ko ; (2) une **attestation de RIB** de la banque du laboratoire (16/07/2026). Rangés hors du dépôt : `backups/fichiers-labo-28-10/logo-accreditation-semac.docx`, `…/logo-accreditation-semac-560.png` (copie RVB 560 × 450, 55 Ko, sous la limite de 300 Ko de /admin/entreprise), `…/attestation-rib.pdf`. **Non reçus** : le logo du laboratoire en haute définition, le **cachet**, la **liste des paramètres accrédités** | S11 (téléverser le logo d'accréditation, saisir le RIB) ; le cachet, le logo HD et la liste : §8 |
| Adresse e-mail réelle qui envoie les rapports, nom affiché, contact du domaine | accolade « À discuter » | rien | en attente (direction) ; L4 garde `EMAIL_FROM` / l'identité ; envois toujours simulés tant que le domaine n'est pas vérifié |
| Fiche de stock et journal des achats remplis | « envoyé le 27/10 » (lecture probable, « 2?/10 ») | les deux fichiers reçus le 28/10 sont des **modèles vides** (en-têtes seulement, enregistrés le 27/10 par le poste « Qualité & Achat ») — `RETOUR-LABO-28-10.md` §3.3, §3.4 | le dire au laboratoire : il nous faut les fichiers **remplis** (articles, lots, prix, fournisseurs, statuts, modes de paiement) ; M8 (import) est prêt |
| Canevas ONSSA complet, un mois déclaré, liste des groupes de produits | « envoyé le 27/10 » (idem) | un **extrait vide** de trois feuilles (Feuil1–3), avec un lien vers le canevas complet resté sur leur serveur — §3.2 | le dire : il nous faut le canevas **complet** (toutes les feuilles, II-AT comprise), **un mois déjà rempli** et leur liste de groupes ; N3 exporte déjà au format de l'extrait |

## 4. Désaccords de lecture (scan relu le 05/11, pages agrandies)

Notre transcription de départ est **confirmée** partout, avec ces nuances :

- **Q1** : la note se lit « Suggère **la vraie** heure actuelle mais
  modifiable » (deux mots de plus) ; même sens.
- **Q4** : la coche est appuyée, sans texte ; rien d'autre.
- **Q6** : « UFC/cm² » est **souligné** (pas barré) ; ce sont « pour un
  couteau » et « pour une boîte » qui sont barrés. La coche de marge et « ça
  c'est faux » sont à la hauteur de la ligne « (…) n'est pas appliqué : la
  ligne est sans interprétation ». La note du haut de la page 2 se termine
  par « et l'expression s'applique par des normes » (un « se fait de
  manière » barré avant ; « normes » est la lecture probable du dernier
  mot). Nous la lisons comme la suite de Q6 (elle précède
  Q7 sur la page) : l'expression du résultat — chiffre ou détecté / non
  détecté, absence / présence — est fixée par la norme de la méthode.
- **Q9** : la case « Oui » porte une marque légère (un début de coche ?) ;
  « Autre » est coché net et les deux notes vont dans son sens : nous
  retenons « Autre ». « L'administration » est lu comme la validation
  administrative (Direction) et l'administrateur — c'est la liste actuelle
  `SEND_REPORT_ROLES` ; si le laboratoire voulait exclure la Direction, C-6
  le dira.
- **Q10** : la note au crayon se lit « + d'autres paramètres, si on a besoin
  on en ajoute au futur ».
- **Q11** (crayon, sur deux lignes) : « → choix des / client » au-dessus de
  « adresses pour / des alertes + rapport » ; le mot « chaque » de notre
  première transcription **n'est pas écrit**. Deux lectures : « choix des
  clients, adresses pour les alertes + rapport » ou « choix des adresses
  pour le client » — le plan (L6 : tous les clients ou des clients choisis ;
  adresses du client sur sa fiche) couvre les deux. Puis « + 2 adresses
  dans tous les envois » ; le dernier mot (« envois » ?) est incertain.
- **Q12** : la physico-chimie se lit « 10 ? 15 jours » : le signe entre 10
  et 15 (un trait, ou un « = » mal formé) ne se lit pas avec certitude —
  intervalle ou équivalence, d'où C-2. « jours ouvrés » imprimé après le 7
  barré n'est pas barré.
- **Q13** : la case « Autre » n'est pas cochée, le texte est écrit sur sa
  ligne ; le mot barré au début se lit « laisser » (lecture probable), puis
  « mettre le logo par défaut mais de laisser la main pour modifier » ; la
  flèche relie « en microbiologie et histamine, ça dépend des cas » et
  « astérisque ».
- **Q16** : le « Oui » est coché d'une croix ; « Acceptable » est barré
  d'une croix, « Conforme / non conforme » écrit en marge.
- **Q18** : les deux nombres se lisent « 100 » et « 10 » ; le « % »
  imprimé après chacun est repassé ou barré d'un trait de stylo et suivi
  d'un signe que nous ne savons pas lire (« s » ? « ? ») — l'unité même
  (pour cent ? autre chose ?) est incertaine, ce que C-3 demande ; « TTC »
  coché d'une croix. Aucun nom de fournisseur.
- **Fichiers** : les deux dates du bas se lisent « 27/10 » (le chiffre après
  le 2 est incertain) — cohérent avec les modèles enregistrés le 27/10.

## 5. Le plan — lot 4

Lettres du lot 3 reprises, numéros à la suite (**I** réception · **J**
paillasse et interprétation · **K** rapport, envoi, alertes · **L** exports
et exploitation) ; **H5** garde le nom de `RETOUR-LABO-19-10.md` ; **S9–S13**
sont des gestes du propriétaire (sans code). **Rien n'est construit.**

### Lot 4A — P1, ce que le laboratoire voit pendant ses essais

| # | Source | Ce qu'il faut faire | Où | Effort | Migration |
|---|---|---|---|---|---|
| K7 | Q9 — R-13 (c) | `ALERTS_AT_VALIDATION` → **false** : aucune validation n'envoie l'alerte, elle part une seule fois avec le premier envoi du rapport (« Valider et envoyer », « Envoyer au client » ; garde `alertsSentAt`, textes `alertWithSend` déjà construits) ; le réglage `alertAfterTechnicalValidation` (S2) devient sans effet : le dire sous le réglage dans /admin/reglages ; tests des deux positions relus | `src/lib/lab-proposals.ts` (la position « éteint » existe déjà : `alertsAtApproval`, `alertsAtTechnicalValidation` dans `alert-moment.ts`, `alertsLeaveAt` / `serieAlertNotice` dans `serie-validation.ts`, `sendReportWithAlerts` dans `validation-server.ts` ; `lab-proposals-off.test.ts` ne la couvre pas encore : l'y ajouter), `LabSettingsForm.tsx` (texte), tests qui figent `true` (`alert-moment.test.ts`) | XS | non |
| K8 | Q9 — R-13 (b) | `COMMERCIAL_RESENDS_REPORTS` → **false** : le gestionnaire commercial n'envoie ni ne renvoie (la route refuse, sa fiche client n'offre plus « Renvoyer ») ; `SEND_REPORT_ROLES` inchangé (validateur, Direction, administrateur) ; test de gardes | `lab-proposals.ts`, `src/lib/report-actions.ts`, tests de gardes | XS | non |
| K9 | Q14 — R-27 | « Moyen de prélèvement » imprimé **seulement pour l'air** (sa méthode, « Boîte exposée N min » / « Biocollecteur ») ; pour les autres natures la ligne disparaît, que le laboratoire ou le client ait prélevé ; « Référence prélèvement » inchangée ; nouveaux rapports seulement (les versions émises gardent leur texte) ; l'interrupteur `SAMPLING_MEANS_BY_KIND` est remplacé (ou redéfini) par « air seulement » | `src/lib/sampling-means.ts`, `src/lib/report-html.ts` (`samplingReferenceHtml`), `report-dispatch.ts`, `lab-proposals.ts`, tests | XS–S | non |
| J5 | Q8 — Q131 | limite unique (m seule, M seule, m = M) **avec n = 1** : c n'est plus appliqué — une unité au-dessus = « Non satisfaisant » (donc `conform = false` et l'alerte pour un germe `alertOnExceed`) ; n ≥ 2 inchangé (réponse Q31 du 30/09) ; la grille des critères remplace la note `wideToleranceNote` par « c sans effet quand n = 1 » ; les résultats déjà enregistrés gardent leur verdict jusqu'à une nouvelle saisie, les rapports émis sont figés ; compter sur la copie locale les critères concernés (n = 1, c ≥ 1, limite unique) ; préparer **l'exemple chiffré** demandé (C-5) et le montrer avant ou avec le déploiement | `src/lib/interpretation.ts` (`judgeCounts`), `src/lib/criteria-input.ts`, `interpretation.test.ts`, `criteria-input.test.ts` | S | non |
| — | Q3, Q6 (a), Q16 | commentaires « confirmé le 04/11 » : `CONSULTATION_AFTER_RECEPTION`, `NO_CRITERION_NO_INTERPRETATION`, `ONSSA_COUNT_BY` (et les lignes de `HANDOFF.md` §9) | `lab-proposals.ts` | XS | non |

Gestes du propriétaire avec ce lot (sans code, en production, journalisés) :

| # | Quoi |
|---|---|
| S9 | Q12 — /admin/reglages : « à rendre le » microbiologie **8**, physico-chimie **10**, jours ouvrés, autre vide (provisoire jusqu'à C-2) |
| S10 | Q10 — `npx tsx scripts/s3-contamination-alerts.mts --base <prod> --listeria monocytogenes --dry-run`, lecture du plan, approbation, puis sans `--dry-run`. Un Listeria **autre que monocytogenes** tombe dans la section « Listeria outside the scope … never set nor cleared », **qu'il soit déjà marqué ou non** (le script ne l'affiche pas et ne le décoche jamais, même avec `--unset-others`) : vérifier son drapeau dans /admin/parametres et le décocher à la main s'il est marqué. Les dénombrements cités (E. coli surfaces, E. coli mains, E. coli présumés, L. monocytogenes des eaux) sans limite sont listés « Enumeration without a limit … NOT flagged » : les marquer « alerte » **sans limite** dans /admin/parametres (J3 allumé : `sensitiveNeedsLimit` = false, la fiche l'accepte ; O-12 : alerte dès > 0), ou ajouter au script une option `--enumerations` (XS, code) |
| S11 | Fichiers retrouvés — /admin/entreprise : téléverser le logo d'accréditation (`backups/fichiers-labo-28-10/logo-accreditation-semac-560.png`) ; il ne s'imprime que sur un rapport portant une analyse **accréditée** (statuts encore « à préciser » : rien ne change tant que la liste n'est pas saisie) ; saisir le RIB depuis l'attestation (le numéro n'entre pas dans le dépôt) |

### Lot 4B — P2, avant la mise en service réelle

| # | Source | Ce qu'il faut faire | Où | Effort | Migration |
|---|---|---|---|---|---|
| I9 | Q4 — R-9 | décision **« Rejeter (rendu au client) »** à côté de « Détruire » : à la réception, au comptoir et à la libération d'un « en attente du client » ; l'échantillon est annulé avec le motif « Rejeté à réception — rendu au client » (nouvelle valeur de `CancelReason`), sans analyse ni destruction ; imprimé sur le bon de réception et dans le parcours, journalisé, hors des compteurs de paillasse et du rapport ONSSA ; un « Non exploitable » présélectionne toujours « Détruire » (modifiable) ; l'e-mail au client d'une ligne non analysée dit « rejeté — rendu » au lieu de « détruit » | `prisma/schema.prisma` (enum), `src/lib/labels.ts`, `release-rules.ts`, `reception-input.ts`, `reception-logic.ts`, `SerieReceptionForm.tsx`, `DepositForm.tsx`, `BlockedSamples.tsx`, `document-html.ts`, e-mail de ligne détruite, tests | S–M | oui (additive : une valeur d'enum) |
| K10 | Q13 — R-18 | **logo d'accréditation modifiable à la main** : par défaut la règle actuelle (au moins une analyse accréditée) ; une case « Logo d'accréditation » sur la validation administrative (rapport par rapport, et pour la série), visible seulement si le fichier existe ; le choix est figé avec la version émise et journalisé ; un amendement repart du défaut | `report-dispatch.ts`, `report-html.ts`, page et route de validation administrative, `ReportActions.tsx`, tests | S–M | à vérifier (le choix peut vivre dans les données figées de la version ; sinon une colonne additive) |
| L6 | Q11 — R-16 | **copies internes étendues aux rapports** : chaque adresse de « Copies internes » (/admin/entreprise) reçoit les alertes, les rapports ou les deux, pour tous les clients ou des clients choisis ; l'envoi d'un rapport (premier envoi et renvoi) l'ajoute en copie, sans doublon avec les adresses du client ; le libellé devient « Copies internes (alertes et rapports) » ; les deux adresses du laboratoire : tous les clients, les deux | `prisma/schema.prisma` (`AlertCopyAddress` : `forReports`, `forAlerts`), `report-dispatch.ts`, /admin/entreprise, `moveAlertCopies`, tests | S | oui (additive) |
| H5 | Q17 — R-4 | **prix propres à chaque client** : table (client, analyse ou service, prix HT, origine), écran de lecture et de correction sur la fiche client (profils qui voient les prix : comptabilité, administration, Direction, gestion commerciale), reprise des ≈ 6 700 prix depuis l'ancienne base (copie locale d'abord, rapport des prix sans analyse ou sans client correspondant), la facture propose le prix du client à la place du catalogue, toujours modifiable, l'origine du prix dite sur la ligne | `prisma/schema.prisma`, nouveau `src/lib/client-prices.ts`, reprise (script), facturation (`invoice-*`), fiche client, tests de gardes des prix | M–L | oui (additive) |

#### H5 — tel que construit (lot 4H, 05/11, branche `lot4h`, local, non déployé)

- **Table `ClientPrice`** (migration additive `20261105030000_lot4h_prix_clients`) : un
  prix HT par client et par analyse (`AnalysisParameter`) ou prestation du catalogue
  (`LabService`), origine « Repris de l'ancien logiciel » (REPRISE) ou « Saisi sur la
  fiche client » (SAISIE), date, auteur ; un prix saisi n'est jamais écrasé par une
  reprise.
- **Lecture et correction** : carte « Prix propres au client » sur la fiche client
  (gestion commerciale, administration) et page `/comptabilite/clients/[id]/prix`
  (comptabilité, administration, ouverte depuis la facture) ; API
  `/api/clients/[id]/prices` (GET, PUT, DELETE) pour COMPTABLE, GESTIONNAIRE, ADMIN ;
  tout autre profil reçoit 403 ; chaque changement est journalisé (avant / après).
  La Direction voit les prix par la règle du 25/10 mais n'a ni fiche client ni écran
  de facture : le propriétaire a décidé le 26/10 de la laisser ainsi (« DIRECTION left
  as is, no invoice screen », HANDOFF) ; elle ne reçoit donc pas cet écran
  (**C-8 (d)** demande seulement si H5 change cette décision).
- **Facture** : la proposition (échantillons à facturer, choix d'une prestation)
  prend le prix du client à la place du catalogue, toujours modifiable ; la ligne dit
  « Prix du client — repris de l'ancien logiciel (catalogue : …) », « Prix du
  catalogue », « Prix à saisir » ou « Prix modifié à la main ». Une prestation
  choisie à la main suit le même ordre que la proposition : le prix du client pour
  l'analyse facturée sous cette prestation (tous les prix de la reprise sont des prix
  par analyse), sinon pour la prestation, sinon le catalogue ; le choix attend que les
  prix du client soient chargés, et une ligne déjà remplie est reproposée au prix du
  client (jamais un prix tapé à la main).
- **Origine du prix enregistrée** : colonne additive `InvoiceItem.priceSource`
  (migration `20261105030001_lot4h_prix_retires_origine_ligne` ; prix du client repris
  ou saisi, catalogue, saisi à la main), écrite à l'enregistrement du brouillon, redite
  à sa réouverture et sur la fiche de la facture — jamais sur le PDF. Une ligne
  enregistrée avant la colonne n'a pas d'origine.
- **Fiche de programmation, section 7** (profils qui voient la facturation) : chaque
  analyse au prix que la facture proposera — le prix propre du client facturé
  (« Facturé à » du site, sinon le client) s'il en a un, sinon le catalogue —, avec
  « prix du client » / « prix du catalogue » sous le montant ; le total est celui de
  la proposition de facture.
- **Fusion, « Rattacher comme site de… » et import des sites** : les prix du client
  archivé passent au client conservé, sauf pour une analyse où celui-ci a déjà le sien
  (l'import des sites emporte aussi les adresses de copie interne, L5).
- **Prix retiré à la main** : un prix repris de l'ancien logiciel puis retiré sur la
  fiche n'est pas supprimé mais marqué (`ClientPrice.removedAt`, même migration) ;
  aucun écran ni aucune facture ne le lit, et la reprise suivante ne le remet pas
  (« Prix retirés à la main — non repris ») ; le saisir de nouveau sur la fiche
  efface la marque. Un prix saisi sur la fiche puis retiré est supprimé.
- **Sites facturés à un autre client** : la carte des prix le dit (« Les échantillons
  du site « X », facturés à Y, sont facturés aux prix de Y : les prix ci-dessous ne
  s'y appliquent pas ») — la facture va au client qui paie, à ses prix
  (**hypothèse, à confirmer par C-8 (b)**).
- **Reprise** : `scripts/legacy/extract-client-prices.py` (lecture seule de
  `qlabo-fb`) écrit `backups/prix-clients-ancienne-base.csv` (ignoré par git) ;
  « Importer les prix clients » (/admin/import, administrateur seul) : analyse
  (rapprochés / client introuvable / client ambigu / analyse introuvable / doublons /
  prix à 0), puis import en une transaction, journalisé (`CLIENT_PRICES_IMPORTED`,
  chaque passage), idempotent (`legacyPriceId` ; même fichier relancé : 0 écrit).
  Règles retenues (**hypothèses, à confirmer par C-8**) : un prix à 0 n'est pas un
  prix propre (le catalogue s'applique) ; le prix d'un site de l'ancien logiciel va
  au client qui paie ce site (son « Facturé à », sinon son client) ; deux prix pour
  le même client et la même analyse : le prix propre du client avant celui d'un de
  ses sites, puis le plus récemment modifié (interrupteur
  `CLIENT_PRICE_OWN_BEFORE_SITE`, allumé ; éteint : le plus récent seulement) —
  chaque conflit est listé sur l'écran d'analyse (client, analyse, les deux prix,
  client ou site, type d'analyse, date) ; un prix **égal au tarif de l'ancien
  logiciel** pour l'analyse (`PARAMETRES.PRIX`, colonne `tarifAncien` du fichier)
  n'est pas un prix négocié : compté à part (« Égaux à l'ancien tarif ») et non
  repris, le client suit le catalogue (interrupteur `CLIENT_PRICE_SKIP_LEGACY_TARIFF`,
  allumé ; éteint : repris comme les autres, figés à l'ancien tarif quand le
  catalogue change). Les dates de l'ancien logiciel sont lues à l'heure du
  laboratoire. `PRIX_ANALYSE_PARCLIENT` (18 lignes) n'est pas repris.

**Comptes de la reprise, 05/11** — sur une copie de la base locale (`qualilab_h5`)
où les clients (1 507 créés) et les sites (390) de l'ancien logiciel ont été repris
comme en production le 01/10 et le 07/10 ; la production, qui a fusionné des clients
depuis, donnera des chiffres voisins : l'écran d'analyse les montre avant l'import.

| | Lignes |
|---|---:|
| Prix dans l'ancienne base (`PRIX_PARAME_PARCLIENTS`, 305 clients) | 6 695 |
| Prix à 0 — le catalogue s'applique | 1 937 |
| Lignes illisibles (client sans nom : 11 ; prix vide : 1) | 12 |
| **Rapprochés** (client et analyse trouvés) | **4 016** |
| — dont prix créés | 3 125 (290 clients) |
| — dont doublons (même client et même analyse ; 186 à un autre prix) | 891 |
| Client introuvable (3 clients) | 58 |
| Client ambigu (5 clients : plusieurs fiches du même nom) | 207 |
| Analyse introuvable (19 analyses) | 465 |
| Relance du même fichier | 0 écrit, 3 125 inchangés |

Clients trouvés : 285 par le nom, 5 par l'ICE, 1 par le site. Les analyses
introuvables sont surtout des libellés de l'ancien logiciel absents du catalogue sous
ce nom : eaux « Coliformes à 36 °C » (134) et « Escherichia coli » (127), surfaces
« Coliformes totaux à 30 °C * » (100), effet aseptisant (Pseudomonas, Staphylococcus
aureus, Aspergillus niger, Candida albicans : 76). Les ajouter en alias de l'analyse
correspondante dans /admin/parametres (équivalence à confirmer par le laboratoire),
puis relancer l'import : seuls les prix nouveaux sont écrits. Recette locale
`h5-verify` 26/26 (gardes des neuf profils, pages, proposition de facture, saisie,
retrait, relance idempotente, prix saisi conservé par la reprise).

**Relecture du 05/11** : dans l'ancienne base, 3 007 des 3 490 prix propres non nuls
dont l'analyse a un tarif (`PARAMETRES.PRIX` > 0) **égalent ce tarif** (86 %) ; 136
seulement sont au-dessus, 42 à environ 1,2 fois. Ce sont les tarifs de l'ancien
logiciel recopiés, pas des prix négociés : d'où l'interrupteur
`CLIENT_PRICE_SKIP_LEGACY_TARIFF` (C-8 (e)). Le catalogue actuel ne vient pas de ces
tarifs : **avant l'import en production, comparer l'ancien tarif au catalogue de
production** (l'écran d'analyse le rappelle). Une copie de répétition déjà importée
garde ses prix égaux à l'ancien tarif (« déjà repris : laissé tel quel ») : les
retirer sur la fiche si le client doit suivre le catalogue.

### Après les clarifications (P2–P3)

| # | Après | Ce qui changerait | Effort |
|---|---|---|---|
| J6 | C-1 (R-29) | soit `UNIT_MISMATCH_NOT_JUDGED` → false (tout critère juge, quelle que soit l'unité), soit des critères par objet / par moyen saisis dans le catalogue (donnée, sans code) | XS (ou donnée) |
| K5 bis | C-2 (Q12) | si « 10 – 15 » dépend du type d'analyse : délais par type dans /admin/reglages (existe, réglage) ; si la physico-chimie seule est en jours calendaires : un drapeau « jours ouvrés / calendaires » propre à chaque domaine | — (réglage) ou XS–S (migration additive) |
| S13 | C-3 (R-24) | base, taux, champ d'application, durée de l'attestation dans les réglages Achat & Stock ; `PAYMENT_REQUIRES_TAX_CERTIFICATE` selon la réponse | XS (réglage) |
| S12 | §8 | la liste des paramètres accrédités saisie dans « Accréditation des paramètres » (/admin/parametres) ; le cachet téléversé | donnée |

### Rien à construire

Q1 (R-7), Q3 (R-8), Q5 (R-12), Q6 (a) (R-28, la limite), Q7 (R-28,
l'anomalie), Q15 (R-6, R-21), Q16 (R-22), Q9 « validateur technique ou
administration » (`SEND_REPORT_ROLES`), Q11 (1) (adresses par client, déjà
sur la fiche).

## 6. En attente de la direction (pas d'urgence — règle du propriétaire du 04/11)

Le comportement construit reste en place ; rien n'est relancé.

- **Q2 — R-30, R-15** : l'observation de réception (température, délai
  seulement) et le délai non évaluable d'un dépôt sans heure ; le tiers
  « Autre » sans « Prélevé le » obligatoire.
- **Fichiers — l'adresse d'expédition et le domaine** (« À discuter ») :
  R-20, L4.
- **Q11 — les deux adresses** à mettre en copie (données, §8).
- **Q18 — les fournisseurs concernés**, la durée de validité de
  l'attestation, avertissement ou blocage (avec C-3).
- Ce que le questionnaire ne reposait pas (§2, dernier paragraphe) — dont
  **Q19, toujours urgent pour le propriétaire (O-1)** : les numéros 2026 qui
  croiseront ceux de l'ancien logiciel.

## 7. À clarifier — une ligne chacune, avec un exemple (prochain échange, quand le propriétaire le décide)

- **C-1 — Q6 (R-29)** : « Vous avez écrit « ça c'est faux » à côté de notre
  règle. Exemple : un couteau prélevé à l'écouvillon, résultat
  « 120 UFC/couteau » ; la famille « Hygiène des surfaces » a un critère
  « ≤ 100 UFC/cm² ». Le logiciel affiche « sans interprétation ». Faut-il
  (a) le juger quand même contre 100 (non conforme), (b) un critère propre à
  l'objet (« ≤ … UFC/couteau ») que vous nous donnez, ou (c) autre chose ? Et
  pour l'air : un critère en UFC/m³ sur une boîte exposée ? » — à montrer à
  l'écran plutôt qu'à écrire.
- **C-2 — Q12** : « Physico-chimie « 10 – 15 jours » : 10 jours ouvrés
  (environ 15 jours calendaires), ou 10 à 15 jours selon l'analyse (le
  logiciel accepte déjà un délai par type d'analyse : lesquels à 15 ?) —
  et lequel le logiciel propose-t-il par défaut ? »
- **C-3 — Q18, pour le comptable** : « Retenue à la source : vous avez
  écrit 100 et 10 et repassé le « % » — s'agit-il bien de pourcentages ?
  Avec 100 % du TTC, la retenue serait égale à toute la facture. S'agit-il de la retenue
  sur la TVA (100 % ou un autre pourcentage **de la TVA**), et 10 % de quoi
  sans attestation ? Quels fournisseurs ? Combien de temps une attestation
  reste-t-elle valable ? Le paiement doit-il être bloqué sans attestation ? »
  — aucun taux n'est saisi avant sa réponse ; nous ne proposons pas de taux
  nous-mêmes.
- **C-4 — Q13** : « Qui peut retirer ou remettre le logo d'accréditation
  sur un rapport : la personne qui fait la validation administrative, le
  validateur technique, l'administrateur ? Et la liste de vos paramètres
  accrédités (la microbiologie et l'histamine ?) pour les marquer dans le
  logiciel. »
- **C-5 — Q8 (« Exemple pour vérifier »)** : leur envoyer l'exemple :
  « Critère repris de l'ancien logiciel : n = 1, c = 1, m = 100 UFC/g.
  Lecture 150 UFC/g. Aujourd'hui : « Acceptable », sans alerte. Après la
  correction : « Non satisfaisant », alerte si le germe est sous alerte.
  Lecture 80 : « Satisfaisant » dans les deux cas. » (une capture de la
  copie locale, après J5) ; et demander si un critère à deux limites m / M
  avec n = 1 reste « Acceptable » entre m et M.
- **C-6 — Q9** (seulement si utile) : « l'administration » comprend-elle la
  Direction (validation administrative) ? Lu ainsi par défaut.
- **C-7 — Q16** (une ligne) : « Conforme / non conforme » = le rapport ONSSA
  ne connaît que ces deux classes, un « Acceptable » y compte conforme
  (c'est ce que fait le logiciel) — ou souhaitez-vous ne plus voir
  « Acceptable » ailleurs non plus ?

- **C-8 — R-4, la reprise des prix clients** (H5, construit) : « (a) Dans l'ancien
  logiciel, 1 937 prix propres valent 0 : nous les lisons « pas de prix propre, le
  tarif s'applique » — d'accord ? (b) Un prix saisi pour un site va au client qui
  paie ce site, et les échantillons d'un site facturé à un autre client sont facturés
  aux prix de ce dernier — d'accord ? (c) Si un client a deux prix pour la même
  analyse (le sien et celui d'un de ses sites, ou deux types d'analyse — par exemple
  Salmonella sur viande et sur produit laitier), nous gardons son prix propre avant
  celui du site, puis le plus récent ; l'écran d'analyse liste les 186 cas — faut-il
  une autre règle ? (d) « E. coli » de l'eau = « Escherichia coli » de l'ancien
  logiciel, « Coliformes totaux » = « Coliformes à 36 °C » ? (e) 3 007 des prix
  propres sont égaux à l'ancien tarif de l'analyse : les garder figés à ce prix, ou
  ces clients suivent-ils le catalogue (notre choix par défaut) ? » — et pour le
  propriétaire : il a décidé le 26/10 de laisser la Direction sans écran de facture ;
  H5 change-t-il cette décision (aujourd'hui, ces prix se lisent et se corrigent par
  la comptabilité, le commercial et l'administrateur) ?

## 8. Fichiers et données qu'il nous faut encore

| Quoi | Pour | État |
|---|---|---|
| Le **cachet** (image nette, fond blanc ou transparent) | rapport, sous « Direction » (K4) | non reçu (annoncé « envoyé le 28/10 ») |
| Le **logo du laboratoire en haute définition** (PNG ou SVG) | en-tête des documents | non reçu ; l'actuel reste |
| La **liste des paramètres accrédités** (et sous-traités accrédités) | marques « * », logo (K4, K10) | non reçue |
| Les **deux adresses** du laboratoire à mettre en copie de tous les envois | L6 | non données (Q11) |
| L'**adresse d'expédition**, le nom affiché, le contact du domaine | L4, envoi réel des e-mails | « À discuter » (direction) |
| La **fiche de stock** et le **journal des achats remplis** | M8 (import), M5–M7 | reçus **vides** le 28/10 |
| Le **canevas ONSSA complet**, un **mois déjà déclaré**, la **liste des groupes** | N2, N3 | extrait **vide** reçu le 28/10 |
| Les **≈ 6 700 prix** par client | H5 | dans l'ancienne base (`qlabo-fb`, copie locale) : rien à demander, à extraire |

Le logo d'accréditation et l'attestation de RIB **sont arrivés** (§3) : ne
pas les redemander.

## 9. Ordre et recette

1. **Maintenant, sans code** : S11 (logo d'accréditation, RIB) ; S9
   (8 / 10 jours ouvrés) ; S10 (Listeria monocytogenes, dénombrements) après
   l'essai et l'approbation du propriétaire.
2. **Lot 4A** (P1, ≈ ½ journée, aucune migration) : K7, K8, K9, J5 et les
   commentaires ; contrôles (tsc, eslint, vitest, build), recette locale
   (alerte au premier envoi seulement et une seule fois ; gestionnaire
   refusé à l'envoi et au renvoi ; rapport d'eau / de surface sans ligne
   « Moyen de prélèvement », rapport d'air avec ; n = 1 c = 1 → « Non
   satisfaisant » + alerte) ; déployer ; tester en production sur « TEST UI »
   (règle du 21/10) ; envoyer l'exemple C-5.
3. **Lot 4B** (P2) : I9 et L6 (deux migrations additives), K10, puis H5
   (reprise sur la copie locale d'abord, relue par le propriétaire avant la
   production).
4. **Après les réponses** : J6, K5 bis, S12, S13.
5. **Prévenir le laboratoire au déploiement du lot 4A** : l'alerte part
   avec le rapport, le commercial n'envoie plus rien, le moyen de
   prélèvement n'est plus imprimé hors air, n = 1 et c = 1 : une unité
   au-dessus est « Non satisfaisant ».

## 10. Dépôt public

- Le scan et les fichiers restent dans `backups/` (ignoré par git) :
  `backups/reponses-labo-04-11-scan.pdf`,
  `backups/fichiers-labo-28-10/logo-accreditation-semac.docx`,
  `…/logo-accreditation-semac-560.png`, `…/attestation-rib.pdf`.
- Ici, aucun nom de membre du personnel, de client, de banque ni de numéro
  (RIB, référence d'accréditation).
