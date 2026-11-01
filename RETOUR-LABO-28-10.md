# Réponses du laboratoire du 28/10 (le document du 18/10 annoté, l'e-mail, quatre fichiers Excel) — plan du lot 3

> **Le plan en cours pour ces réponses. État au 01/11 : analysé ; le lot 3C
> est construit sur la branche `lot3c` (§5, « Lot 3C — construit le 01/11 »).** Le 28/10, le laboratoire a renvoyé :
> (a) un scan de 14 pages — les 12 pages de notre document du 18/10
> « Suite de vos réponses du 16/10 »
> (`backups/Qualilab-suite-reponses-16-10-2026-10-18.pdf`) annotées à la
> main, puis une seconde copie des pages 9 et 10 annotée par le comptable ;
> (b) un e-mail : les réponses à nos questions du 12/10 (déjà traitées le
> 13/10, V13), la liste du personnel par fonction et un « NB » sur les
> factures des fournisseurs ; (c) quatre fichiers Excel, sans commentaire.
> Chaque réponse a été lue sur le scan (pages agrandies), puis vérifiée
> **dans le code** (branche `lot2-retour-16-10`, `a051ed7` ; la production
> tourne `e8cbfe1`, même code). Ce document complète `RETOUR-LABO-16-10.md`
> (lot 2) et `RETOUR-LABO-19-10.md` (lot 2C).
>
> - **Lot 3** = ce que ces réponses permettent de construire ou de corriger
>   (§5, lots 3A à 3E). **Relance** = ce qu'il faut reposer (§6).
>   **Propriétaire** = réglage, donnée ou décision, pas de code (§7).
> - Règle du propriétaire du 21/10 : chaque construction est déployée puis
>   testée en production (sur « TEST UI » seulement).
>
> Effort : XS ≈ 1 h ou moins · S 1–4 h · M 4–12 h · L plus de 12 h
> (estimations). Priorité : **P1** avant que les essais du laboratoire
> continuent (ce qu'il voit à l'écran tous les jours) · **P2** avant la mise
> en service réelle · **P3** après, ou quand le laboratoire aura répondu.

---

## 0. Ce qui est revenu

- **Le scan** (28/10 13:37, 14 pages), rangé hors du dépôt :
  `backups/reponses-labo-28-10-scan.pdf` (ignoré par git).
  - Pages 1 à 12 : notre document du 18/10, toutes les parties (1 « ce que
    nous avons compris », 2 « les 21 réponses à préciser », 3 « les
    questions restées vides », 4 « pages 7 à 9 du 14/10 », 5 « informations
    et documents »).
  - Pages 13 et 14 : un **nouveau scan des mêmes feuilles** que le 19/10
    (pages 9 et 10, annotées par le comptable) ; chaque marque est identique à
    `backups/reponses-labo-19-10-scan-pages-9-10.pdf` : **rien de nouveau**
    (traité dans `RETOUR-LABO-19-10.md` ; R-1 à R-4 restent ouverts).
- **L'e-mail** (capture) :
  - les réponses à nos questions du 12/10 (bon version H, protocole
    version G, rapport M, un contenant par famille, histamine, température,
    validation administrative) : **toutes appliquées le 13/10** (V13,
    `3bfa019` ; histamine `cd0054f`) ; restaient de V13 : les dates de
    Q103 et les comptes réels (ci-dessous) ;
  - un tableau « Fonction / Noms » (prélèvement, réception, enregistrement
    des paramètres, saisie, validation technique, validation administrative)
    : enregistré **hors du dépôt** dans
    `backups/comptes-et-signataires-labo-2026-10-28.md` — les comptes sont
    **parqués par le propriétaire** (§8) ;
  - un **NB** : « L'attestation de régularité fiscale devra obligatoirement
    être fournie par le fournisseur avec chaque facture, afin de permettre
    l'application correcte de la retenue à la source. » (§3.3, lot 3D).
- **Quatre fichiers Excel, sans commentaire**, copiés hors du dépôt dans
  `backups/fichiers-labo-28-10/` (noms neutres). **Tous les quatre sont des
  modèles vides** — des en-têtes, aucune ligne de données — créés ou
  enregistrés le 27/10 par un poste Windows nommé « Qualité & Achat ». Rien à
  importer ; chacun dit quelles colonnes le laboratoire attend (§3).
- **Décompte** :
  - partie 1 : 34 lignes (13 en page 1, 20 en page 2, Q92 en page 3) :
    26 cochées sans correction (accord), 4 corrigées (Q109, Q115, Q118, Q50),
    4 sans coche (Q117 « voir 2.5 », Q75, Q128, Q89/Q90) ;
  - partie 2 (21 propositions) : 6 « Oui » (2.4, 2.5, 2.7, 2.15, 2.16, 2.19 —
    trois avec un texte), 11 « Autre » ou texte seul (2.1, 2.2, 2.3, 2.6,
    2.10–2.13, 2.17, 2.18, 2.21), 2.20 répondue point par point, 3 sans
    réponse ou « ? » (2.8, 2.14, et 2.9 répondue en marge) ;
  - partie 3 : Q8 et Q76 cochées, Q71 et Q14 répondues en texte, Q73 et Q106
    un « ? » ;
  - partie 4 : Q104, Q93, Q103, Q105, Q97 répondues en marge ; Q82 cochée ;
    Q81 non cochée (la phrase entourée est contestée) ;
  - partie 5 : comptes « reçu », destinataires « reçu », fichiers « [prénom] transmet » (le prénom reste hors du dépôt : « une
    personne du laboratoire »), e-mails « Nous n'utilisons pas d'adresse no-reply ! »,
    signataires « ? », coordonnées bancaires, Q19, Q98, Q20 et le point 7 du
    13/10 **toujours sans réponse**.

> **La colonne « À corriger ? » de la partie 1** demandait de cocher une
> ligne **fausse**. Le laboratoire a coché presque toutes les lignes sans
> écrire de correction : nous lisons ces coches comme un **accord**. Les
> lignes où il a écrit quelque chose sont lues pour ce qu'elles disent. À
> dire une fois au laboratoire (§6).

## 1. Les réponses, une par une

Statut : **réglée** · **en partie** (une part réglée, le reste à reposer) ·
**à reposer** · **vide**. « I1 »… = l'élément du plan (§5) ; « R-6 »… = le
point de la prochaine relance (§6) ; « S1 »… = le geste du propriétaire (§7).

### 1.1 Partie 1 — « Ce que nous avons compris » (pages 1 et 2)

| Q | Écrit sur le scan | Lecture | Statut | Suite |
|---|---|---|---|---|
| Q109 | coché ; dans « Aseptisées ou désinfectées », « ou » barré et remplacé par « / » | le libellé devient « Aseptisées / désinfectées » ; le reste (trois états, obligatoire, plus de « non lavées ») est confirmé | réglée | I1 (libellé) |
| Q111, Q112, Q114, Q119–Q127, Q129, Q130, Q2/Q22, Q64, Q67/Q69, Q70, Q72, Q74, Q80, Q100/Q101, Q9, Q55, Q38/Q39, Q40, Q13, Q92 | coché, sans texte | accord avec ce que nous avions compris (tout est construit et en ligne) | réglée | rien |
| Q115 | case vide ; « Rien à changer. » non barré, suivi d'un mot manuscrit barré puis « avoir la possibilité par client et par site » | un ajout, pas une correction : le laboratoire garde « Rien à changer » et veut plus que le filtre par site du lot 1. Trois lectures : (a) chercher par client **et** par site (existe : comptoir, `/recherche`) ; (b) voir l'adresse ou la ville de chaque site dans la liste ; (c) un résultat **par site** — très probablement le récapitulatif par site du fichier Excel envoyé le même jour (§3.1) | à reposer | L1 construit (c) ; R-6 |
| Q117 | case vide, « voir 2.5 » | la réponse est en 2.5 (« Oui ») | réglée | I5 |
| Q118 | coché ; en marge de « Arrivé le prérempli » : « prérempli » puis un mot qui se lit plutôt **« pas modifiable »** (écrit d'un trait) que « modifiable » | incertain : (1) « prérempli, modifiable » = ce qui est construit ; (2) « prérempli, pas modifiable » = l'heure d'arrivée posée par le serveur à l'enregistrement | à reposer | défaut gardé ; R-7 |
| Q128 | case vide, sans texte (toutes les voisines cochées) | le 16/10 : « Oui » ; très probablement un oubli | réglée (16/10) | rien ; le dire dans la relance |
| Q89, Q90 | cases vides, sans texte | le 16/10 : « OK » ; oubli probable | réglée (16/10) | rien |
| Q50 | case vide ; « Cas de boîte exposée » à côté de « 30 minutes par défaut, modifiables » ; « Cas du biocollecteur » à côté de « UFC/m³ » | la durée vaut pour la boîte exposée, UFC/m³ pour le biocollecteur (détaillé en 2.17) | réglée | J2 |
| Q75 | case vide ; Q75 entouré ; sous le texte de la question, un mot court (« à cocher » ?) ; en marge : « Modifiable pouvant le [r]ajouter par la suite ? » | l'accord du client doit pouvoir être **ajouté ou corrigé après la réception** ; aujourd'hui il ne s'écrit qu'à la réception, au comptoir ou à la libération d'un « en attente du client » | en partie | I6 ; R-8 (le mot illisible) |

### 1.2 Partie 2 — les 21 réponses à préciser (pages 3 à 7)

| # | Écrit sur le scan | Lecture | Statut | Suite |
|---|---|---|---|---|
| 2.1 (Q110) | aucune case ; « Autre : L'imprimé après le nom juste sur le rapport » | un seul choix d'état (construit) : **confirmé**. L'état s'imprime après le nom **sur le rapport seulement** (pas sur l'étiquette ni l'e-mail) | réglée | K1 |
| 2.2 (Q113) | « Autre : Dans le cas d'un prélèvement d'aliment, de l'eau / surface / air, il faut toujours avoir la T° au prélèvement ; la différence c'est qu'on a besoin de la T° à la réception pour aliment / eau et non pour l'air et les surfaces » | (1) visite : « Température au prélèvement » **obligatoire** pour aliment, eau, surface ; l'air n'a pas ce champ — sa T° ambiante (déjà obligatoire) en tient lieu ; (2) réception : température d'arrivée exigée pour aliment et eau seulement | réglée | I2 + S1 ; R-14 (« Autre », air) |
| 2.3 (Q114) | « Autre : On exprime le résultat par UFC / surface prélevée, exemple UFC / couteau, UFC / poignée… » | refuse « par écouvillon » ; l'unité du résultat d'une surface décrite en texte est « UFC/<objet> » | réglée | J1 |
| 2.4 (Q116) | « Oui » + « le nom du client est obligatoire, et il faut avoir les autres informations » | confirme ce qui est construit (nom seul obligatoire, « Autres informations » facultatives) | réglée | rien (option XS : ouvrir « Autres informations » par défaut) |
| 2.5 (Q117) | « Oui » | fusion, rattachement comme site et « À compléter » pour l'administrateur **et** le gestionnaire commercial | réglée | I5 (le rattachement, aujourd'hui administrateur seul) |
| 2.6 (Q118) | « Autre : la date et l'heure de prélèvement sont obligatoires lors de notre prélèvement ; si un client ramène son échantillon, il n'est obligatoire que la date et l'heure de réception » | prélevé par le laboratoire → « Prélevé le » obligatoire ; apporté par le client → « Prélevé le » facultatif, « Arrivé le » obligatoire. Même partage que Q104 « 2 cas » | réglée | I3 |
| 2.7 (Q64) | « Oui » + « Autre : ou rejeté » | (a) un bouton « Tous exploitables et bien identifiés » ; (b) un échantillon non exploitable propose « Détruire »… « ou rejeté » | en partie | I4 ; R-9 (« rejeté ») |
| 2.8 (Q70, Q75) | aucune case ; un grand « ? » | pas compris | à reposer | défauts gardés ; R-8 |
| 2.9 (Q77) | aucune case ; en marge « PAS de mention sur le rapport ni sur la traçabilité » ✓ | aucune réserve ISO imprimée sur le rapport (déjà le cas) ; « la traçabilité » : quel document ? | en partie | rien pour le rapport ; R-10 |
| 2.10 (Q91) | « Autre : Tant qu'une analyse n'est pas faisable, nous ne faisons pas de rapport, mais nous faisons le reste » | deux lectures : (A) la ligne non faisable n'apparaît pas, le reste part (= proposition, construit, C5) ; (B) le reste est analysé mais le rapport attend (déjà le cas : la soumission est bloquée tant qu'une analyse est sans réponse) | à reposer | rien ; R-11 |
| 2.11 (Q78) | « Autre : le technicien va faire entrer les résultats adéquats ; si on n'a pas de critère, nous ne faisons pas d'interprétation » (un premier mot barré) | (1) « > x » indécidable : le technicien lit la bonne dilution — le blocage reste ; (2) **sans critère, pas d'interprétation** : plus de choix Conforme / Non conforme obligatoire pour ces lignes | réglée | J3 (avec la règle d'alerte, O-12) |
| 2.12 (Q79) | « Autre : le technicien va faire entrer les résultats avec les dilutions utilisées » | le technicien saisit sa lecture **et** la dilution qu'il a utilisée ; le logiciel calcule | en partie | J4 après R-12 (un exemple chiffré) |
| 2.13 (Q107) | « Autre : Tout technicien responsable de la tâche devra avoir l'accès à la saisie. (2) non, il y aura une seule saisie » | « Reprendre » par tout technicien, une seule saisie à la fois : **confirmé** | réglée | rien (interrupteur gardé ON) |
| 2.14 (Q108) | aucune case, un « ? » léger | pas compris (troisième fois) | à reposer | défaut gardé ; R-17 |
| 2.15 (Q55) | « Oui » | **confirmé** | réglée | rien |
| 2.16 (Q92) | (a) Oui ; (b) Oui, mais « le gestionnaire commercial » **barré** de ceux qui envoient ; (c) **Non** ; (d) Oui ; « Oui, d'accord avec la proposition » | (a)(d) et la validation par série **confirmées** ; (b) envoyer = validateur technique, Direction, administrateur ; (c) l'alerte de contamination **ne part plus seule** à la validation technique | en partie | K2, S2, K3 après R-13 |
| 2.17 (Q50) | « Autre : Pour biocollecteur : c'est le moyen de prélèvement, l'unité de lecture est UFC/m³. Pour boîte exposée : c'est le moyen de prélèvement, l'unité est boîte exposée pendant 30 min → doit s'afficher dans le rapport » | unité **par moyen de prélèvement** : UFC/m³ (biocollecteur), « UFC/boîte exposée N min » (boîte exposée) ; le volume en litres (1) n'est pas demandé ; la reprise des analyses d'air (3) sans réponse | réglée | J2 |
| 2.18 (Q88) | « Autre : On n'a pas de liste, le préleveur va les faire entrer manuellement » | pas de liste des surfaces : la désignation reste libre | réglée | rien (A10 abandonné) |
| 2.19 (Q43, Q56) | « Oui » | reprise des critères faite (F3, 23/10) ; « Hygiène des surfaces » telle quelle ; PC gardée sur mains et air | réglée | S6 (la liste des familles encore sans critère) |
| 2.20 (g) | Oui, « Indénombrable » barré | boutons de saisie rapide, sans « Indénombrable » | réglée | G1 |
| 2.20 (h) | Oui ; « Oui = la note devient interne » entouré, « Non = elle reste imprimée » barré | la note d'une analyse devient **interne** (plus imprimée sur le rapport) | réglée | G2 |
| 2.20 (i) | Non | un préleveur de Qualilab n'apporte pas d'échantillons au comptoir | réglée | rien (G3 abandonné) |
| 2.20 (j) | Oui | « Échantillon précédent / suivant » | réglée | G4 |
| 2.20 (k) | Oui | filtre « reçus depuis plus de N jours » | réglée | G5 |
| 2.21 | « Autre : Salmonella et Listeria et E. coli dans les aliments, Eaux et surfaces » (quelques mots barrés avant, illisibles) | les analyses qui déclenchent l'alerte : Salmonella, Listeria, E. coli, dans les aliments, les eaux et les surfaces ; ni entérocoques ni Pseudomonas | en partie | S3 ; R-14 (Listeria monocytogenes seule ?) |

### 1.3 Partie 3 — les questions restées vides (page 8)

| Q | Écrit sur le scan | Lecture | Statut | Suite |
|---|---|---|---|---|
| Q71 | case vide ; « Oui, voir les critères » | d'accord : l'observation n'est exigée que pour les écarts qui comptent (température C2, délai C1) ; quantité non pesée, DLC, mollusques deviennent de simples avertissements | réglée | I7 |
| Q73 | case vide ; un « ? » dans la marge | pas compris | à reposer | défaut gardé ; R-17 |
| Q76 | coché ; une note au crayon en partie illisible (« En attente jusqu'à … / … malgré le délai ») | la règle est confirmée ; la note semble dire que l'échantillon reste en attente jusqu'à la réponse du client, même au-delà du délai | réglée (la note à reposer) | rien ; R-17 |
| Q106 | case vide ; un « ? » dans la marge | pas compris | à reposer | défaut gardé ; R-17 |
| Q8 | coché ; « date à rendre le » entouré (« avec vos délais, la date à rendre le se remplit seule et reste modifiable ») ; les jours laissés vides | d'accord pour le mécanisme ; les délais en jours manquent | en partie | K5 ; R-18 (les jours) |
| Q14 | case vide ; « Oui … Logo → paramètre accrédité ; Pas de logo → paramètre (analyses) non accrédité(s) » | un seul modèle pour tous ; le logo d'accréditation est lié aux paramètres accrédités | en partie | K4 (bloqué par les fichiers) ; R-18 (rapport mixte) |

### 1.4 Partie 4 — rapport, alertes, comptes, serveur (pages 9 et 10)

| Q | Écrit sur le scan | Lecture | Statut | Suite |
|---|---|---|---|---|
| Q104 | case vide ; en marge, une flèche vers (d)/(e) : « 2 cas : le prélèvement effectué par nous ou par le client » | confirme (e) tel que construit (« N/A (prélèvement non effectué par le laboratoire) »). (d) **en partie seulement** : 2.17 ne répond que pour l'air ; pour les autres natures (proposition : surfaces et mains « Écouvillon », eaux « Flacon stérile », aliments « Sachet stérile ou emballage d'origine », sinon N/A) rien n'est ni répondu ni construit — le rapport imprime encore « Moyen de prélèvement : N/A » hors air (`report-html.ts`, `samplingReferenceHtml`). La flèche « 2 cas » se lit : le moyen quand nous prélevons, N/A quand le client prélève. Les autres défauts gardés | en partie | K6 ; R-27 |
| Q93 | case vide ; dans la question, « (direction) » entouré et « responsable technique, qualité » encerclés ; en marge : « Possibilité de mettre qualité dans les alertes [un client à sites] par défaut » | la question porte sur les adresses **du laboratoire**, et les marques entourées vont dans ce sens : plutôt les adresses du laboratoire (direction, qualité) en copie des alertes, par défaut pour ce client à sites (L5, lecture principale). Autre lecture : l'adresse qualité **du client** — déjà possible (une adresse du client, « Reçoit les alertes », au niveau du client = tous ses sites ; S8) | à reposer | L5 (sinon S8) ; R-16 |
| Q103 | case vide ; à l'encre « faut les mettre à jour » ; au crayon « Mettre à jour les versions — date début 01/01/26 » (l'année pourrait se lire 24) | dates des versions G (protocole) et H (bon) : 01/01/2026 | réglée (l'année à confirmer d'une ligne) | S4 |
| Q105 | case vide ; un mot, très probablement « Annulé » | probablement : la case « fax » du bon est supprimée | à reposer | R-17 ; I8 si « Annulé » |
| Q81 | case **vide** sur la copie principale (cochée sur la copie du comptable, p14) ; la phrase « chaque signataire est ainsi seul à connaître son mot de passe » est entourée, avec un trait vers « Admin a une vue globale sur les MDP » | le laboratoire conteste que seul le signataire connaisse son mot de passe ; le changement obligatoire (H1, en ligne, « OK » du comptable le 19/10) n'est pas refusé. Un mot de passe ne peut pas être affiché (il est enregistré sous une forme irréversible) : proposer la réinitialisation par l'administrateur (existe) et la vue d'ensemble de l'état des comptes (L3) | à reposer | O-5 ; L3 ; R-26 |
| Q82 | coché (les deux copies) | gardé | réglée | rien |
| Q97 | case vide ; « Est-ce qu'on peut récupérer un fichier de suivi de la sauvegarde ? » (une **question**, pas « c'est ce que… ») | oui : un journal des sauvegardes téléchargeable ; (1)–(3) toujours sans réponse | en partie | L2 ; R-19 |
| Q11, Q30, Q85, Q86, Q45, Q54 | vides sur la copie principale ; répondues par le comptable (pages 13–14, identiques au 19/10) | voir `RETOUR-LABO-19-10.md` | — | R-1 à R-4 restent ouverts |

### 1.5 Partie 5 — informations et documents (pages 11 et 12)

| Point | Écrit sur le scan | Suite |
|---|---|---|
| Q19 bascule, Q98 derniers numéros, Q20 historique et portail | rien (troisième fois) | **Q19 urgent** : O-1 ; R-25 |
| Comptes des utilisateurs | « Reçu » coché (le tableau de l'e-mail) | enregistré hors du dépôt ; **parqué** (§8) |
| Signataires Direction | un « ? » | parqué (§8) |
| Coordonnées bancaires | rien (troisième demande) | R-20 |
| Envoi des e-mails et adresse du logiciel | « Nous n'utilisons pas d'adresse no-reply ! » ; (2)–(5) sans réponse | l'expéditeur devient une vraie boîte du laboratoire (L4) ; R-20 |
| Destinataires de chaque client | « Reçu » coché | S7 (export des adresses pour relecture) |
| Fichiers pour les documents | coché, « [une personne du laboratoire] transmet » | attendus ; débloquent K4 |
| Point 7 du 13/10 | rien | à abandonner ou reposer une fois (R-25) |

## 2. Les propositions construites d'avance — ce que la réponse en fait

| Proposition | Ce qui est construit (interrupteur) | Réponse du 28/10 | Verdict | Suite |
|---|---|---|---|---|
| 2.1 — état des mains, un seul choix | `HANDS_STATE_CHOICES` (`src/lib/labels.ts`), obligatoire à la visite et au comptoir | un seul choix accepté ; l'état s'imprime après le nom sur le rapport seulement | **confirmée**, avec un ajout | K1 (rapport) ; I1 (libellé Q109) |
| 2.4 — création rapide d'un client | `QuickClientDialog` : nom obligatoire, « Autres informations » facultatives (pas d'interrupteur) | « Oui » ; « le nom du client est obligatoire, et il faut avoir les autres informations » | **confirmée** | rien (option XS) |
| 2.6 — « Heure de prélèvement inconnue du client » | `SAMPLING_TIME_UNKNOWN.allowed = true` (`serie-input.ts`) : « Prélevé le » obligatoire au comptoir, avec la case « heure inconnue » | « Prélevé le » obligatoire seulement quand **le laboratoire** prélève ; pour un dépôt du client, seulement « Arrivé le » | **changée** — l'interrupteur ne sait pas l'exprimer (`false` refuserait le dépôt) | I3 |
| 2.13 — « Reprendre » l'échantillon d'un collègue | `TAKE_OVER_COLLEAGUE = true` (`src/lib/lab-proposals.ts`) | « Tout technicien responsable de la tâche devra avoir l'accès à la saisie ; (2) non, une seule saisie » | **confirmée** | rien ; le commentaire de l'interrupteur dira « confirmé le 28/10 » au prochain passage dans le code |
| 2.15 — écrans du technicien sans client | `BLIND_BENCH_SCREENS = true` | « Oui » | **confirmée** | idem |
| 2.16 — validation et envoi | `SERIES_VALIDATION = true` ; `RESEND_REPORT_ROLES` = gestionnaire, validateur, Direction, administrateur (`src/lib/report-actions.ts`) ; `LabSettings.alertAfterTechnicalValidation = true` | (a)(d) Oui ; (b) le gestionnaire commercial **barré** ; (c) **Non** | **confirmée** pour la série ; **changée** pour (b) et (c) | K2 ; S2 maintenant, K3 après R-13 |

## 3. Les fichiers Excel

Tous vides (en-têtes seulement), créés le 27/10 par le poste « Qualité &
Achat ». Rien à importer ; chacun est la **spécification** d'un écran ou d'un
export.

### 3.1 Récapitulatif par site d'un client à sites (`recap-par-site-modele.xlsx`)

Le nom du fichier porte le nom d'un grand client (une chaîne de
restauration) : **jamais dans le dépôt** — ici « récapitulatif par site ».
Une feuille, 26 colonnes : Restaurant (= le site) | Produit | une colonne par
paramètre — FMAT, bactéries lactiques 30 °C, coliformes totaux, coliformes
fécaux, Staphylococcus aureus, Salmonella, moisissures, levures, E. coli,
Clostridium perfringens, Listeria monocytogenes, entérobactéries,
entérocoques intestinaux, Enterobacteriaceae (doublon d'entérobactéries),
anaérobies sulfito-réducteurs, Pseudomonas aeruginosa, Bacillus cereus, MOR
22 °C, MOR 36 °C, DBO5, DCO, MES, chlore — | Conformité. Sous FMAT, un
exemple « Conforme / non conforme ». Pas de date, pas de N° de contrôle.

Aujourd'hui : `/recherche` + `/api/samples/export` filtrent déjà par client,
site et période, mais l'export donne une ligne par échantillon avec les
analyses dans une seule cellule. Il manque **le tableau croisé** (une colonne
par paramètre) → L1, questions R-21. Très probablement la forme concrète de
Q115 « par client et par site ».

### 3.2 Rapport mensuel d'activité ONSSA (`onssa-rapport-activite-modele.xlsx`)

Trois feuilles extraites du canevas officiel mensuel de l'ONSSA pour les
laboratoires agréés (un lien externe pointe vers le canevas complet sur le
serveur du laboratoire, « NV CANEVAS RA LABO — Janvier 2026 », feuilles page
de garde, plan, tutoriel, I-AGL, II-AT, III-AD, IV) :
- **Feuil1** : groupe de produits × nombre d'analyses, « Contrôle officiel »
  (DR ONSSA / organisme préleveur agréé, nom de l'établissement, origine) et
  « Autocontrôle » (origine), total ;
- **Feuil2** : type de produits (lignes « Réalisées » / « NC ») × 23
  paramètres microbiologiques (C6 « Bacillus cereus » à Y6 « Clostridia »),
  chacun avec sa méthode en ligne 7 (NM ISO 7932 2021, NM ISO 6579-1 2021,
  NM ISO 6888-1 2022, NM ISO 16649-2, NM ISO 6222, NM ISO 16266…), plus une
  colonne « chimie alimentaires » (sans méthode) et un « Total » ;
- **Feuil3** : microbiologie alimentaire / des eaux / chimie alimentaire ×
  échantillons, analyses, conformes, non conformes (formules vers II-AT).

Le LIMS n'a aucun comptage de ce genre. **Conflit avec une décision
construite** : le 07/10 (V1), « Autocontrôle / Contrôle officiel » a été
retiré du cadre (remplacé par Autre / Devis validé / BC / Convention) et
« Service vétérinaire » de « Prélèvement effectué par ». Sans un indicateur
« contrôle officiel » séparé du cadre commercial, le rapport ONSSA ne peut pas
se construire (N1, O-6). Il faut aussi deux tables de correspondance
(famille → groupe ONSSA, paramètre → colonne ONSSA ; la norme seule ne suffit
pas : NM 08.0.123 sert aux levures et aux moisissures) (N2), puis l'export
(N3), après le canevas complet et un mois rempli (R-22). La liste des
méthodes donne aussi les versions de normes que le laboratoire déclare : à
comparer à notre catalogue en même temps que S4.

### 3.3 Journal des achats (`journal-achat-modele.xls`) et le « NB » de l'e-mail

13 colonnes avec un filtre : Fournisseurs | Délai de paiement | N° Facture |
Mois | Date | Échéance | Montant HT | TVA 20 % | Montant TTC | Euro | Statut |
Date paiement | Mode de paiement. Aujourd'hui (module Achat & Stock, montré
au laboratoire depuis le 26/10) : fournisseur, délai, numéro, date,
échéance, **un seul montant TTC**, statut À payer / Payée et une date de
paiement **forcée au clic**. Manquent : HT / TVA, la devise, le mode de
paiement, la vraie date de paiement, l'export, la correction d'une facture
saisie par erreur, et tout le « NB » : **attestation de régularité fiscale**
et **retenue à la source** (M1, M2, M6, M7 ; questions R-23, R-24).

### 3.4 Fiche de stock (`gestion-de-stock-modele.xlsx`)

Un registre chronologique **unique pour tous les articles** : Date |
Libellé | Lot | Expiration | Entrée | Sortie | Stock | Prix (DH HT, deux
sous-colonnes sans titre) | Lieu de stockage. Aujourd'hui : lot et péremption
existent (facultatifs, rien ne les lit) ; pas de date de mouvement (toujours
« maintenant »), pas de niveau après le mouvement, pas de prix, pas de lieu,
pas de journal de tous les articles (M1, M3, M4, M5). Répond en partie à
`NEEDEDINFO.md` item 16 (lots et péremptions suivis ; prix et lieu voulus ;
unité et seuil non cités).

## 4. Désaccords de lecture (scan relu le 01/11)

- **Q118** : le second mot se lit plutôt « pas modifiable » que
  « modifiable » — incertain : reposé (R-7), défaut gardé.
- **Q93** : la note nomme **un client précis** (« dans les alertes [client]
  par défaut ») ; dans la question, « (direction) » est entouré et
  « responsable technique, qualité » encerclés : plutôt les adresses **du
  laboratoire** en copie des alertes de ce client (L5) ; l'adresse qualité du
  client reste l'autre lecture (S8) — R-16.
- **Q97** : une **question** (« Est-ce qu'on peut récupérer un fichier de
  suivi de la sauvegarde ? »), pas « c'est ce que… ».
- **Q103** : deux écritures (encre : « faut les mettre à jour » ; crayon :
  « … date début 01/01/26 », l'année pourrait être 24).
- **Q71** : « Oui, voir les critères » (pluriel).
- **Q75** : Q75 est entouré ; le mot court est sous le texte de la question
  (colonne de gauche), pas sous la note de marge — toujours incertain
  (« à cocher » ?) ; la note se lit « Modifiable pouvant le [r]ajouter par la
  suite ? ».
- **Q105** : un seul mot, très probablement « Annulé ».
- **2.9** : « PAS de mention sur le rapport ni sur la traçabilité ».
- **2.14** : un « ? » léger, rien de coché.
- **2.21** : les mots barrés avant la réponse sont illisibles ; barrés, ils ne
  sont pas demandés.
- **Q81** : la case est **vide** sur la copie principale (p10) — seule Q82
  est cochée ; la phrase « chaque signataire est ainsi seul à connaître son
  mot de passe » est entourée, un trait la relie à « Admin a une vue globale
  sur les MDP ». La copie du comptable (p14, la même que le 19/10) coche Q81 :
  les deux copies divergent (R-26).
- **Q115** : « Rien à changer. » n'est **pas** barré ; c'est un mot manuscrit
  qui le suit qui est barré, puis vient « avoir la possibilité par client et
  par site » : un ajout, pas une correction.
- **Q104** : la flèche « 2 cas » vise (d) et (e) ; (d) n'est réglé que pour
  l'air (K6, R-27).
- Partout ailleurs, la lecture du scan confirme la transcription.

## 5. Le plan — lot 3 (3C construit le 01/11 ; le reste : voir `LOT3-AVANCEMENT.md`)

Lettres nouvelles : **I** réception, comptoir, terrain · **J** paillasse et
interprétation · **K** rapport, envoi, alertes · **L** exports et
exploitation · **M** Achat & Stock · **N** rapport ONSSA. **G1–G5** gardent
les noms donnés le 18/10 (`RETOUR-LABO-16-10.md`, 2.20).

### Lot 3A — P1, avant que les essais du laboratoire continuent

| # | Quoi | Ce qu'il faut faire | Où | Effort | Migration | Priorité |
|---|---|---|---|---|---|---|
| I1 | Q109 — libellé | « Aseptisées / désinfectées » (libellé) et « mains aseptisées / désinfectées » (phrase imprimée) ; tests qui citent l'ancien texte ; aucune ligne réécrite | `src/lib/labels.ts` (`HANDS_STATE_LABELS`, `HANDS_STATE_PHRASES`) + tests | XS | non | P1 |
| I2 | 2.2 — T° au prélèvement obligatoire sur la visite | `productTemperature` obligatoire pour ALIMENT, EAU, SURFACE à la visite (message, étoile, `lineDraftError`) ; l'air garde sa T° ambiante obligatoire ; mains : facultatif (Q101) ; comptoir inchangé ; « Corriger la fiche » ne bloque jamais une ancienne ligne. Avec S1 (réglage de la réception). Prévenir le laboratoire (nouvelle règle bloquante sur les téléphones) | `serie-input.ts` (`validateLine`), `visit-types.ts`, `LineEditor.tsx`, `VisitForm.tsx` | S | non | P1 |
| I3 | 2.6 — dates selon qui prélève | « Prélevé le » obligatoire si et seulement si `samplerKind === "QUALILAB"` (en pratique la visite ; le même prédicat que `sampledByLab`, `report-dispatch.ts`) — le comptoir n'offre que « Le client » et « Autre » ; CLIENT : facultatif, vide = « Non déclarée » (`samplingTimeDeclared = false`), « Arrivé le » obligatoire ; AUTRE (un tiers : service vétérinaire, autre organisme) : facultatif comme CLIENT par défaut (R-15) ; tests pour les trois cas ; la case « Heure de prélèvement inconnue du client » disparaît ; C1 (délai) d'une heure non déclarée : « délai non évaluable » sans observation obligatoire (à confirmer, R-15) | `serie-input.ts` (`validateSerie`, `SAMPLING_TIME_UNKNOWN`), `DepositForm.tsx`, `reception-rules.ts` (C1) | S | non | P1 |
| I4 | 2.7 — « Tous exploitables et bien identifiés » | le bouton répond aussi « identification correcte » sur les lignes sans réponse ; libellé « Tous exploitables et bien identifiés (N) » (réception et comptoir) ; un « Non exploitable » présélectionne « Détruire » (modifiable). « Rejeté » : après R-9 | `reception-logic.ts`, `reception-widgets.tsx`, `SerieReceptionForm.tsx`, `DepositForm.tsx` | S | non | P1 |
| I5 | 2.5 — rattacher comme site | « Rattacher comme site de… » ouvert au gestionnaire commercial (`ATTACH_ROLES`), garde de la route, page, journal, tests ; `CLIENTS-FUSION.md`. Préalable en production : la décision `Invoice.clientSnapshot` (`HANDOFF.md` §9) | `client-actions-logic.ts`, `api/clients/[id]/attach-as-site`, `commercial/[id]` | S | non | P1 |
| I7 | Q71 — observation exigée seulement pour C1 et C2 | l'« Observation de réception » reste obligatoire pour la température hors plage (C2) et le délai dépassé ou l'heure inconnue (C1) ; quantité non pesée, DLC, mollusques 25–50 g : avertissements seulement. Derrière un interrupteur de `lab-proposals.ts` | `reception-rules.ts` (`rowToJustify`), `serie-input.ts`, route de réception, tests | S | non | P1 |
| K1 | 2.1 — état des mains sur le rapport | sur le rapport seulement : « Nom — mains <état> » ; ni l'e-mail, ni l'alerte, ni l'étiquette, ni la paillasse, ni le portail ; nouveaux rapports seulement (versions figées inchangées) ; protocole et bon inchangés | `report-dispatch.ts`, `document-html.ts`, `report-html.ts` + tests | S | non | P1 |
| K2 | 2.16 (b) — qui envoie | `SEND_REPORT_ROLES` = validateur, Direction, administrateur (premier envoi, échantillon et série) ; le gestionnaire garde le **renvoi** d'un rapport déjà envoyé (V11) sauf si R-13 dit non ; boutons, tuile « Validés — à envoyer », tests de gardes | `report-actions.ts`, `api/samples/[id]/report/send`, `api/series/[id]/reports*`, `ReportActions.tsx` | S | non | P1 |
| G2 | 2.20 (h) — la note devient interne | « Ajouter une note » sur chaque analyse à la paillasse ; `Result.note` n'est plus imprimée sur les nouveaux rapports (versions figées inchangées) ; visible du validateur et dans le parcours ; ce qui est pour le client passe par la conclusion | `ResultEntryForm.tsx`, `api/samples/[id]/results`, `report-html.ts`, `report-dispatch.ts`, `validation/[id]` | S | non | P1 |

Avec ce lot, en production (propriétaire, §7) : S1, S2, S3 (la part sûre),
S4.

### Lot 3B — paillasse et interprétation (P2)

| # | Quoi | Ce qu'il faut faire | Où | Effort | Migration | Priorité |
|---|---|---|---|---|---|---|
| G1 | 2.20 (g) — boutons de saisie rapide | sous chaque case, selon le plan : « < 10 », « > », « .10² » … « .10⁶ », « Absence », « Présence » ; insérés au curseur ; pas de bouton « Indénombrable » (la valeur tapée reste acceptée) | `ResultEntryForm.tsx`, nouveau `src/lib/quick-entries.ts` + tests | S | non | P2 |
| G4 | 2.20 (j) — précédent / suivant | « Échantillon précédent / suivant » dans la même série, fiche de programme et paillasse, avec la garde des modifications non enregistrées | `ProgrammeSheet.tsx`, `programmation/[id]`, `technicien/[id]`, `ResultEntryForm.tsx` | S | non | P2 |
| G5 | 2.20 (k) — reçus depuis N jours | filtre « Reçus depuis plus de N jours » et « reçu il y a N j » sur chaque ligne (jours calendaires, heure du laboratoire) | `WorkQueue.tsx`, `technicien/page.tsx`, `serie-groups.ts` | S | non | P2 |
| J1 | 2.3 — UFC/<surface> | une surface décrite en texte (`surfaceAreaNote`) donne l'unité « UFC/<texte> » (UFC/couteau) : dérivée à l'enregistrement, montrée à la paillasse, à la validation, sur le rapport et l'e-mail ; un critère en UFC/cm² ne la juge pas → sans interprétation (cohérent avec J3) | `api/samples/[id]/results`, `report-dispatch.ts`, `technicien/[id]`, `validation/[id]`, `interpretation.ts` | M | non | P2 |
| J2 | 2.17 / Q50 — unité de l'air par moyen | biocollecteur : UFC/m³ ; boîte exposée : « UFC/boîte (exposée N min) », N = `airExposureMin` ; dans la colonne unité du rapport, la paillasse et la validation ; vérifier en lecture les unités des paramètres et critères d'air repris par F3. Pas de volume en litres | `api/samples/[id]/results`, `report-dispatch.ts`, `report-html.ts`, `labels.ts` (`airMethodText`) | M | non | P2 |
| J3 | 2.11 — sans critère, pas d'interprétation | les lignes sans critère : plus de Conforme / Non conforme à choisir (retirer `awaitsManualConformity` et le contrôle C7 pour elles), « sans interprétation » sur le rapport et dans la conclusion ; décider si la limite du catalogue (`limitValue`) compte comme critère. **Attention (leçon de l'audit)** : l'alerte de contamination repose sur `conform = false` — sans verdict, une Salmonella sur surface sans critère ne déclencherait plus d'alerte. Écrire une règle explicite (ex. « Présence » ou dépassement d'un germe `alertOnExceed` déclenche l'alerte même sans critère, O-12) et la tester avant tout le reste | `bench-reading.ts`, `results/submit`, `results`, `interpretation.ts`, `report-dispatch.ts`, `contamination-alert.ts`, `ResultEntryForm.tsx` | L | non | P2 |
| J4 | 2.12 — dilution saisie par le technicien | après R-12 : le technicien saisit sa lecture et la dilution utilisée (préremplie par le programme, modifiable) ; le logiciel calcule ; `Result.dilutionUsed` ; paillasse et validation (« lu à 1/100 ») | `schema.prisma`, `api/samples/[id]/results`, `ResultEntryForm.tsx`, `dilution.ts` | M | oui (additive) | P3 |

### Lot 3C — réception, rapport, exports, exploitation (P2)

| # | Quoi | Ce qu'il faut faire | Où | Effort | Migration | Priorité |
|---|---|---|---|---|---|---|
| I6 | Q75 — accord du client après la réception | sur un échantillon reçu non conforme, jusqu'à la validation : « Accord du client » ajouté ou corrigé (qui, comment, quand, note), réception et administrateur, journalisé (ancien → nouveau), visible du validateur | nouvelle route `api/samples/[id]/consultation`, `client-consultation.ts`, `ReceptionNonConformity.tsx`, `audit-labels.ts` | M | non | P2 |
| I8 | Q105 — le fax | si R-17 confirme « Annulé » : retirer la case fax du bon | `document-html.ts` | XS | non | P3 |
| K6 | Q104 (d) — moyen de prélèvement hors air | quand le laboratoire prélève (`sampledByLab`) : « Écouvillon » pour les surfaces et les mains, « Flacon stérile » pour les eaux, « Sachet stérile ou emballage d'origine » pour les aliments ; prélevé par le client ou un tiers : « N/A » ; l'air garde `airMethodText` ; nouveaux rapports seulement (versions figées inchangées) ; la liste confirmée par R-27 | `src/lib/report-html.ts` (`samplingReferenceHtml`), `report-dispatch.ts`, tests | XS–S | non | P2 |
| K3 | 2.16 (c) — l'alerte à l'envoi ? | si R-13 dit « seulement avec Valider et envoyer / Envoyer au client » : `sendContaminationAlerts` lié à l'envoi (garde `alertsSentAt` conservée). Sinon S2 suffit | `api/samples/[id]/validation`, routes d'envoi, `report-dispatch.ts` | S | non | P2 |
| K4 | Q14 — accréditation | statut d'accréditation par paramètre (accrédité / non / sous-traité accrédité / sous-traité non accrédité) dans /admin/parametres, prérempli depuis les marques « * » et « (SA) » de l'ancien logiciel, relu par le laboratoire ; marques imprimées après le nom ; logo d'accréditation dans l'en-tête quand le rapport porte au moins un paramètre accrédité (rapport mixte : R-18) ; cachet sous « Direction ». Bloqué par les fichiers | `schema.prisma`, `report-template.ts`, `report-html.ts`, /admin/parametres, /admin/entreprise | M | oui (additive) | P2 |
| K5 | Q8 — « à rendre le » calculée | un délai par type d'analyse dans /admin/reglages (jours, ouvrés ou calendaires) ; préremplit `dueAt` depuis l'arrivée à la confirmation du programme, toujours modifiable ; vide = rien ne change. Les jours : R-18 | `schema.prisma` (`LabSettings`), /admin/reglages, `ProgrammeSheet.tsx` + route du programme | S–M | oui (additive) | P2 |
| L1 | Q115 / fichier 3.1 — récapitulatif par site | export Excel « Récapitulatif par site » à côté de « Exporter » sur /recherche (mêmes filtres, mêmes rôles, journal `SAMPLES_EXPORTED` + mise en page) : une ligne par échantillon ; colonnes Site (« Siège » sans site) · Produit · une colonne par paramètre présent (ordre du catalogue, alias fusionnés) · Conformité ; ligne de titre (client, période) ; date et N° de contrôle en option ; valeur ou C/NC selon R-21 (défaut : la valeur, colorée par verdict). Fonction pure + tests | nouveau `src/lib/sample-recap.ts`, `api/samples/export` (ou `/recap`), `sample-search-server.ts`, page /recherche | M | non | P2 |
| L2 | Q97 — journal des sauvegardes | `backup-db.sh` ajoute une ligne par passage (date, fichier, taille, sha256, copie hors site) à un CSV monté en lecture ; page administrateur « Sauvegardes » (30 derniers passages, « Télécharger le suivi ») ; avertissement si le dernier passage a échoué ou date de plus de 26 h | `scripts/backup-db.sh`, `docker-compose.yml`, `src/app/admin/sauvegardes`, `DEPLOY.md` | S–M | non | P2 |
| L3 | Q81 — vue d'ensemble des comptes (option) | si le propriétaire le veut (O-5) ou si R-26 le demande : par compte, « provisoire, à changer » ou « choisi le JJ/MM/AAAA », dernière connexion, sessions ouvertes, la réinitialisation existante | `UsersManager.tsx`, `api/admin/users` | XS–S | non | P3 |
| L4 | Partie 5 — pas de « no-reply » | l'expéditeur est une vraie boîte du laboratoire (configuration `EMAIL_FROM`) ; `Reply-To` = l'adresse générale si elle diffère ; un transport SMTP par leur fournisseur si le domaine ne peut pas recevoir les enregistrements DNS (S de plus) | `src/lib/email.ts`, `.env.production.example`, `DEPLOY.md` | XS (S avec SMTP) | non | P2 |
| L5 | Q93 — copies internes des alertes | lecture principale de Q93 (« (direction) » et « qualité » entourés), à confirmer par R-16 : liste d'adresses du laboratoire dans /admin/entreprise, chacune « tous les clients » ou « clients choisis », ajoutée en copie des alertes | `report-dispatch.ts`, `schema.prisma`, `ClientForm.tsx`, /admin/entreprise | S | oui (additive) | P3 |

#### Lot 3C — construit le 01/11 (branche `lot3c`, local, non déployé)

Décision du propriétaire du 01/11 : tout construire maintenant. Ce qui
attendait une relance est construit avec le défaut le plus raisonnable,
écrit ci-dessous (« hypothèse, à confirmer par R-x ») et, quand cela change
un comportement que le laboratoire n'a pas confirmé, derrière un
interrupteur de `src/lib/lab-proposals.ts` (allumé = la lecture du plan).
Trois migrations additives : `20261101300000_lot3c_reception_rapport_exports`,
`20261101300001_lot3c_images_figees` (le logo d'accréditation et le cachet
gardés avec chaque version émise) et `20261101300002_lot3c_delai_par_type`
(un délai propre à un type d'analyse). **L3 (comptes) n'est pas construit** :
les comptes sont parqués (§8). Relecture hostile du 01/11 : ses dix constats
sont corrigés dans le tableau ci-dessous.

| # | Construit | Hypothèse, à confirmer | Interrupteur / réglage |
|---|---|---|---|
| I6 | « Accord du client » ajouté ou corrigé après la réception : `PUT /api/samples/[id]/consultation` (réception, administrateur), sur un échantillon reçu non conforme, ni en attente du client (sa libération l'enregistre) ni validé techniquement ; jamais effacé, seulement corrigé ; journal `CLIENT_CONSULTATION_UPDATED` (avant → après), parcours de l'échantillon ; éditeur sur la page de la série réceptionnée ; le validateur le lit sur sa page (déjà) ; l'heure comparée à la minute (celle de l'éditeur : même minute = l'instant enregistré gardé, rien de changé = refusé) ; deux corrections simultanées : la seconde reçoit « corrigé par quelqu'un d'autre » (409) | hypothèse, à confirmer par R-8 : qui (réception + administrateur) et jusqu'à quand (la validation technique) | `CONSULTATION_AFTER_RECEPTION = true` |
| I8 | Le bon de réception n'imprime plus la ligne « N° de fax : » | hypothèse, à confirmer par R-17 : le mot de Q105 est « Annulé » | `BON_WITHOUT_FAX = true` |
| K3 | Le moment des alertes : par défaut inchangé (à la validation que dit le réglage ; S2 reste le geste du propriétaire) ; éteint, aucune validation ne les envoie, elles partent avec le rapport (« Valider et envoyer », « Envoyer au client »), une seule fois (`alertsSentAt`) ; textes des panneaux alignés — et, éteint, chaque ligne de « Valider la série » dit que l'alerte part avec « Valider et envoyer » (`alertWithSend`) | hypothèse, à confirmer par R-13 : S2 suffit | `ALERTS_AT_VALIDATION = true` (`alert-moment.ts`) |
| K4 | Statut d'accréditation par paramètre (`AnalysisParameter.accreditation`, « à préciser » par défaut) dans /admin/parametres (« Accréditation des paramètres »), proposé d'après les marques « * », « (SA) », « (SN) » des noms de l'ancien logiciel, appliqué à la main et journalisé ; marque imprimée après le nom (page 1 et annexe) ; logo d'accréditation (cartouche, à côté du logo du laboratoire) et cachet (sous « Direction ») téléversés dans /admin/entreprise — imprimés seulement si le fichier existe à l'émission (et, pour le logo, si le rapport porte au moins une analyse accréditée) ; **l'image elle-même est figée avec chaque version émise** (son empreinte SHA-256 dans la version, l'image dans la table en ajout seul `ReportImageArchive`) : remplacer ou retirer un fichier ne change ni un duplicata, ni un téléchargement du portail, ni un renvoi ; une fois le statut enregistré, la marque de l'ancien logiciel restée dans le nom (« Chlore (SA) ») n'est plus imprimée — seule celle du statut (« Chlore » accrédité, « Chlore * » non accrédité), et /admin/parametres signale le nom contradictoire | hypothèse, à confirmer par R-18 : un rapport mixte porte le logo ; un nom sans marque n'est jamais proposé « accrédité » | `ACCREDITATION_LOGO_ON_MIXED_REPORT = true` ; les fichiers : en attente |
| K5 | Un délai par domaine du type d'analyse (microbiologie, physico-chimie, autre) dans /admin/reglages, jours ouvrés (lundi–vendredi) ou calendaires, **et, en option, un délai propre à un type d'analyse** (air, aliments, effet aseptisant…, `AnalysisNature.dueDays`) qui l'emporte sur celui de son domaine ; la fiche de programme d'un échantillon reçu, sans date promise, propose « Délai de rendu promis » depuis l'arrivée (jamais une date passée), modifiable ou effaçable, enregistrée avec le programme | hypothèse, à confirmer par R-18 : 5 jours ouvrés en microbiologie, 7 en physico-chimie, rien pour « autre », aucun type n'a de délai propre (la réponse peut venir par domaine ou par type : les deux se saisissent) ; les jours fériés ne sont pas décomptés. **Au déploiement, les valeurs 5 et 7 de la migration allument la proposition** (DEPLOY « Lot 3C ») | réglage `LabSettings.dueDays*` + `AnalysisNature.dueDays` |
| K6 | « Moyen de prélèvement » quand le laboratoire prélève : « Écouvillon » (surfaces, mains), « Flacon stérile » (eaux), « Sachet stérile ou emballage d'origine » (aliments) ; « N/A » quand le client ou un tiers prélève ; l'air garde sa méthode ; figé à l'émission (les versions émises avant gardent « N/A ») | hypothèse, à confirmer par R-27 : la liste des moyens | `SAMPLING_MEANS_BY_KIND = true` |
| L1 | « Récapitulatif par site » sur /recherche, à côté de « Exporter en Excel » : mêmes filtres, mêmes rôles, journal `SAMPLES_EXPORTED` (`kind`) ; une ligne par échantillon, groupées par site (« Siège » d'abord) — sans client choisi, d'abord par client, avec une colonne « Client » (les sites de deux clients ne se mélangent jamais) ; une colonne par paramètre présent (ordre du catalogue, alias et jumeaux fusionnés) ; « Conformité » ; titre (client, site, période) ; options : date de réception et N° de contrôle, C / NC au lieu de la valeur ; les valeurs n'apparaissent qu'une fois l'échantillon validé | hypothèse, à confirmer par R-21 : la valeur colorée par verdict par défaut ; « acceptable » compte comme C ; un résultat sans verdict garde sa valeur ; sans client choisi, une colonne « Client » en tête et les lignes regroupées par client (lecture du constructeur, R-21 « pour qui ») — **décision du propriétaire à confirmer** : les valeurs sont le contenu du rapport, réservées aux profils qui lisent les rapports (`REPORT_READ_ROLES` : validation, Direction, gestion commerciale, comptabilité, administration) ; la réception et la programmation reçoivent C / NC seulement (« — » pour un résultat sans verdict), sans choix offert sur /recherche (`recapAccess`) | `RECAP_DEFAULT_MODE = "valeur"` (`sample-recap.ts`) |
| L2 | `backup-db.sh` écrit une ligne par passage (réussi ou non) dans `journal/backup-journal.csv` ; le répertoire est monté en lecture seule dans l'application ; page administrateur « Sauvegardes » (30 derniers passages, « Télécharger le suivi »), rouge si le dernier passage a échoué, orange au-delà de 26 h ; un journal impossible à écrire (répertoire créé par Docker en root) ne change jamais le code de sortie du passage : un avertissement seulement (vérifié sous WSL, répertoire en lecture seule) | la copie hors site, la clé, le créneau : R-19 | `DEPLOY.md` « Backups » (créer le répertoire avant le premier `docker compose up`) |
| L4 | L'expéditeur est une vraie boîte : « Envoi des e-mails » dans /admin/entreprise (adresse, nom affiché, adresse de réponse), sinon `EMAIL_FROM`, sinon l'e-mail de l'identité ; une adresse « no-reply » est refusée — et un `EMAIL_FROM` encore en « no-reply » est ignoré au profit de l'e-mail de l'identité ; jamais d'expéditeur « Nom <> » ; `Reply-To` envoyé au fournisseur ; plus d'expéditeur de test | la boîte, le domaine et le DNS : R-20 ; le transport SMTP n'est pas construit (Resend reste le fournisseur) | réglage `CompanySettings.emailSender*` |
| L5 | « Copies internes des alertes » dans /admin/entreprise : des adresses du laboratoire, chacune « tous les clients » ou « clients choisis » (tous leurs sites), ajoutées en copie des alertes à côté de l'e-mail de l'identité (sans doublon) ; une adresse choisie pour un client fusionné ou rattaché comme site suit la fiche gardée (`moveAlertCopies`, compté dans l'aperçu et le journal) | hypothèse, à confirmer par R-16 : les adresses du laboratoire (sinon S8, l'adresse du client) | aucune adresse = rien ne change |
| L3 | **non construit** — comptes parqués par le propriétaire (§8) | — | — |

### Lot 3D — Achat & Stock (fichiers 3.3, 3.4 et le « NB »)

| # | Quoi | Ce qu'il faut faire | Où | Effort | Migration | Priorité |
|---|---|---|---|---|---|---|
| M1 | Un lot de champs, une migration | stock : `StockMovement.movementDate` (jour du mouvement, défaut aujourd'hui, jamais futur), `levelAfter` (niveau après le mouvement, écrit dans la transaction gardée), `StockItem.location` (lieu, texte avec suggestions) ; achats : `amountHT`, `vatRate` (défaut 20), `vatAmount` (TTC = HT + TVA, au centime), date de paiement choisie (défaut aujourd'hui, ni future ni avant la facture), `paymentMethod` + `paymentReference`, correction journalisée d'une facture **non payée** et « Annuler la saisie » (règle §8 du 27/08 à mettre à jour) | `schema.prisma`, `api/stock/*`, `api/purchase-invoices/*`, `achat-validation.ts`, `StockManager.tsx`, `PurchaseInvoicesManager.tsx` | M | oui (additive) | P2 |
| M2 | Export « Journal des achats » | .xlsx : leurs 13 colonnes dans leur ordre (+ RAS, net à payer, attestation après M7), filtre par mois / année, totaux HT / TVA / TTC, filtre automatique ; liste sans plafond de 200 (filtres + pages). Fonction pure + test, sur le modèle de `sales-journal.ts` | nouveau `src/lib/purchase-journal.ts`, `api/purchase-invoices/export` | M | non | P2 |
| M3 | Journal des mouvements de stock | une vue de **tous** les articles par date (filtres période, article, type), colonnes du modèle, export Excel ; historique sans plafond de 50 | `api/stock/movements`, nouveau `src/lib/stock-journal.ts`, `magasin/stock` | M | non | P2 |
| M4 | Péremption | « expire bientôt / périmé » (fenêtre de N jours, défaut 30, dans les réglages) sur le tableau de bord du magasin et la liste ; stock par lot seulement si R-23 le demande (table `StockLot`, M de plus) | `stock.ts`, `magasin/page.tsx`, `StockManager.tsx` | S (M par lot) | non (oui par lot) | P2 |
| M5 | Prix du stock | après R-23 (les deux sous-colonnes) : `unitPriceHT` sur l'entrée, dernier prix, valeur du stock ; prix réservés au magasinier et à l'administrateur (décision du 26/10) ; test de gardes des prix | `schema.prisma`, `api/stock/*`, `magasin/page.tsx`, `price-access-guards.test.ts` | M | oui | P3 |
| M6 | Devise (« Euro ») | après R-23 : `currency`, `amountForeign`, `exchangeRate` ; les montants en DH restent la base | `schema.prisma`, `achat-validation.ts`, `PurchaseInvoicesManager.tsx` | S | oui | P3 |
| M7 | Attestation de régularité fiscale, retenue à la source | après R-24 (le comptable) : par fournisseur « soumis à la retenue » + date de la dernière attestation ; par facture : attestation fournie (oui/non, date, scan facultatif), taux appliqué (prérempli, modifiable), montant retenu, net à payer = TTC − retenue ; avertissement (ou blocage du paiement) sans attestation ; colonnes dans M2 ; état mensuel des retenues. **Aucun taux codé en dur** : les taux viennent du comptable, dans les réglages | `schema.prisma`, nouveau `src/lib/withholding.ts`, `api/purchase-invoices/*`, `api/suppliers/*`, écrans du magasin | L | oui | P3 |
| M8 | Imports articles et fournisseurs | quand le laboratoire envoie ses listes remplies : import « créer seulement » (analyse → essai → import, journalisé), stock d'ouverture en mouvement d'entrée | `csv.ts`, nouveau `stock-import.ts`, /admin/import | M | non | P3 |

### Lot 3E — rapport ONSSA (fichier 3.2) — P3, après O-6 et R-22

| # | Quoi | Ce qu'il faut faire | Où | Effort | Migration | Priorité |
|---|---|---|---|---|---|---|
| N1 | Contrôle officiel / autocontrôle | après O-6 : `Serie.controleOfficiel` (faux par défaut) + organisme préleveur + établissement, séparés du cadre commercial ; `Sample.origine` après R-22 ; saisis à la visite, au comptoir et à la réception ; imprimés nulle part tant que le laboratoire ne le demande pas | `schema.prisma`, `VisitForm.tsx`, `DepositForm.tsx`, `serie-input.ts`, `intake-input.ts`, panneau de réception | S–M | oui (additive) | P3 |
| N2 | Correspondances ONSSA | `ProductType.onssaGroup` et `AnalysisParameter.onssaColumn`, modifiables dans l'administration, « non déclaré » par défaut, préremplis par nom / alias ; la liste des non-correspondants affichée sur l'écran ONSSA | `schema.prisma`, /admin/parametres, familles, `family-catalogue.ts` | M | oui (additive) | P3 |
| N3 | L'export mensuel | écran « Rapport ONSSA » (Direction, administrateur, validateur), choix du mois, Excel au format du canevas (trois feuilles), règles de comptage confirmées par R-22 ; de préférence, remplir leur vrai canevas (feuille II-AT) pour garder leurs formules. Fonction d'agrégation pure + tests | nouveau `src/lib/onssa-report.ts`, `api/reports/onssa`, page | L | non | P3 |

### Rien à construire

Q111–Q130 cochées (partie 1), Q128, Q89/Q90, 2.4, 2.13, 2.15, 2.16 (a)(d),
2.18 (A10 abandonné), 2.20 (i) (G3 abandonné), Q104 (e), Q82, Q76 (la règle),
les réponses du 12/10 (déjà appliquées), les pages 13–14.

## 6. La prochaine relance (courte, dans le corps d'un e-mail ; quand le propriétaire le décide)

Le brouillon est dans `NEEDEDINFO.md` §2 (« Lot du 28/10 »). Une ligne par
point ; dire d'abord merci, que les coches de la partie 1 sont lues comme un
accord, et ce qui est confirmé.

- **R-6 — Q115** : « par client et par site » : le récapitulatif par site
  (fichier Excel envoyé, L1) ? ou l'adresse / la ville de chaque site dans la
  liste ? (la recherche par client et par site existe déjà).
- **R-7 — Q118** : « Arrivé le » prérempli : modifiable, ou pas modifiable ?
- **R-8 — Q75 / 2.8** : l'accord du client doit-il pouvoir être ajouté ou
  corrigé après la réception, et par qui ? (le mot sous la ligne est
  illisible).
- **R-9 — 2.7** : « ou rejeté » : en quoi diffère-t-il de « Détruire »
  (rendu au client ? refusé sans destruction ?).
- **R-10 — 2.9** : « la traçabilité » : quel document (bon de réception,
  protocole, parcours) ? La non-conformité elle-même reste enregistrée
  (ISO 17025).
- **R-11 — 2.10** : la ligne non faisable est-elle simplement absente du
  rapport (le reste part), ou le rapport attend-il qu'elle soit faite ?
- **R-12 — 2.12** : un exemple : lecture 30 au 1/100 → le technicien tape
  « 30 » et « 1/100 », le rapport imprime « 3,0·10³ » : est-ce cela ?
- **R-13 — 2.16** : (c) l'alerte part-elle seule à la validation
  administrative, ou seulement avec « Valider et envoyer » / « Envoyer au
  client » ? (b) le gestionnaire commercial garde-t-il le **renvoi** d'un
  rapport déjà envoyé ?
- **R-14 — 2.21 et 2.2** : « Listeria » = Listeria monocytogenes seulement,
  ou aussi Listeria spp. ? La T° au prélèvement pour la nature « Autre » ?
  Pour l'air, la T° ambiante tient-elle lieu de T° au prélèvement ?
- **R-15 — 2.6** : un dépôt sans heure de prélèvement : le délai
  d'acheminement n'est pas évaluable — d'accord pour ne pas exiger
  d'observation ? Et un prélèvement fait par un tiers (service vétérinaire,
  autre organisme) : la date et l'heure de prélèvement sont-elles
  obligatoires ?
- **R-16 — Q93** : les adresses de votre direction et de votre qualité en
  copie des alertes : pour tous les clients, ou seulement pour ce client à
  sites ? Ou bien l'adresse qualité du client ?
- **R-17 — à reformuler** : Q73, Q106, 2.14 (simplifiées) ; Q76 (la note) ;
  Q105 (le mot : « Annulé » ?) ; Q103 (01/01/2026, bien 2026 ?) ; Q128,
  Q89/Q90 (non cochées : un oubli ?).
- **R-18 — Q8 et Q14** : les délais en jours (ouvrés ou calendaires) — un
  par domaine (microbiologie, physico-chimie, autre), et ceux des types
  d'analyse qui font exception (air, aliments, effet aseptisant…) ; un rapport mixte (accrédité + non accrédité) porte-t-il le
  logo ? Les fichiers : logo HD, logo d'accréditation, cachet.
- **R-19 — Q97** : oui au fichier de suivi (L2) ; où envoyer la copie hors
  site, qui détient la clé et l'accès, quel créneau de maintenance ?
- **R-20 — e-mails** : quelle boîte d'expéditeur (pas de no-reply) ; qui
  gère votre domaine (DNS) ; le sous-domaine https ; vos textes d'e-mail ;
  vos coordonnées bancaires (troisième demande).
- **R-21 — récapitulatif par site** : par paramètre, la valeur ou
  « C / NC » ? La réception doit-elle voir les valeurs (aujourd'hui : C / NC
  seulement, les valeurs aux profils qui lisent les rapports) ? Quelle période et pour qui (envoyé au client ?) ? Ajouter la
  date et le N° de contrôle ? Une ligne par échantillon ou par unité ?
  Colonnes fixes pour ce client, ou les paramètres réellement analysés ?
- **R-22 — rapport ONSSA** : le canevas complet (toutes les feuilles) et un
  mois rempli ; la liste des groupes de produits ; l'unité et la date de
  comptage ; « acceptable » = conforme ? surfaces, mains, air, eaux usées
  déclarés ? « Origine » : que veut dire ce mot, et qui note « contrôle
  officiel » ? Quelles feuilles le logiciel doit remplir, par qui et pour
  quel jour du mois ?
- **R-23 — stock et achats** : les deux sous-colonnes de « Prix (dh/ht) » ;
  stock et lieu par lot ou par article ; un seuil d'alerte ? « Euro » : le
  montant en euros, à quel taux ? les valeurs de « Statut » et les modes de
  paiement ; des paiements partiels ? plusieurs taux de TVA sur une facture ?
  vos listes remplies (fournisseurs, articles).
- **R-24 — retenue à la source (pour le comptable)** : laquelle (TVA,
  autre), sur quelle base, à quels taux (avec et sans attestation), quels
  fournisseurs, durée de validité d'une attestation, qui la déclare ?
- **R-25 — rappel** : **Q19 (urgent : numéros en double avec l'ancien
  logiciel)**, Q98, Q20 ; R-1 à R-4 du 19/10 ; Q131–Q133 ; le point 7 du
  13/10 (à abandonner sans réponse).
- **R-26 — Q81** : un mot de passe ne peut pas être affiché, même par
  l'administrateur (il est enregistré sous une forme irréversible).
  L'administrateur doit-il pouvoir réinitialiser un compte et voir l'état des
  comptes (L3 : mot de passe provisoire ou choisi, dernière connexion) ?
- **R-27 — Q104 (d)** : quand nous prélevons, le rapport imprimera le moyen :
  « Écouvillon » (surfaces, mains), « Flacon stérile » (eaux), « Sachet
  stérile ou emballage d'origine » (aliments) ; « N/A » quand le client ou un
  tiers prélève : d'accord ?

Les comptes et les signataires ne sont **pas** dans la relance (parqués, §8).

## 7. Décisions et gestes du propriétaire (pas de code)

| # | Quoi | Quand |
|---|---|---|
| O-1 | **Q19 — numéros en double** : la numérotation nouvelle repart à 1/26 alors que l'ancien logiciel est dans les milliers pour 2026. Décider seul ou sur réponse : sauter SERIE / CONTROLE à une plage que l'ancien logiciel n'atteindra pas (écran « Compteurs », copie locale d'abord ; un compteur ne recule jamais) | urgent, P1 |
| S1 | 2.2 — `LabSettings.temperatureRequiredKinds` → « ALIMENT,EAU » dans /admin/reglages (journalisé) | avec le déploiement de I2 |
| S2 | 2.16 (c) — `alertAfterTechnicalValidation` → faux dans /admin/reglages : l'alerte part à la validation administrative | maintenant (P1) |
| S3 | 2.21 — `alertOnExceed` sur Salmonella, E. coli (et Listeria après R-14) des catégories aliments, eaux, surfaces dans /admin/parametres, jumeaux créés par F3 compris ; lire d'abord la liste en production | P1 (Salmonella, E. coli), Listeria après R-14 ; à revoir avec J3 |
| S4 | Q103 — /admin/documents : protocole PG04/EN01 version G, bon PG05/EN04 version H, date 01/01/2026 ; réimprimer un bon et un protocole ; comparer en même temps les versions de normes du canevas ONSSA au catalogue | P1 (l'année : une ligne dans R-17) |
| O-5 | Q81 — « Admin a une vue globale sur les MDP », la phrase « seul à connaître son mot de passe » contestée (case vide sur la copie principale) : expliquer au laboratoire qu'un mot de passe ne s'affiche pas (enregistré sous une forme irréversible) ; proposer la réinitialisation par l'administrateur (existe) et la vue d'ensemble des comptes L3 (R-26) ; garder H1 ; construire L3 ou non | P3 |
| O-6 | Fichier ONSSA — réintroduire un indicateur « contrôle officiel » séparé du cadre (contredit en partie la décision du 07/10, V1) ? | avant N1 |
| O-7 | Achats — le COMPTABLE (et la Direction) lisent-ils les factures fournisseurs et l'export du journal des achats (lecture seule ; la saisie reste au magasinier) ? | avant M2 / M7 |
| S6 | 2.19 — envoyer au laboratoire la liste des familles encore sans critère (hors dépôt) | P2 |
| S7 | Destinataires — exporter en lecture les adresses des clients actifs (client, site, adresse, rapports, alertes) en .xlsx dans `backups/`, l'envoyer, appliquer leurs corrections par la fiche client (copie locale d'abord) | avant l'activation des envois |
| S8 | Q93 — si R-16 dit « l'adresse du client » : l'ajouter sur la fiche de ce client, « Reçoit les alertes », au niveau du client (tous ses sites) | après R-16 |
| O-12 | 2.11 — la règle d'alerte sans critère (proposée : présence ou dépassement d'un germe `alertOnExceed` déclenche l'alerte, même sans verdict) | avant J3 |
| — | Toujours ouvertes : la décision `Invoice.clientSnapshot` (préalable à I5 en production), le départage de `pickCriterion`, la destination de la sauvegarde hors site (`HANDOFF.md` §9) | — |

## 8. Comptes et signataires — parqués

Le tableau « Fonction / Noms » de l'e-mail est enregistré **hors du dépôt**
dans `backups/comptes-et-signataires-labo-2026-10-28.md` (ignoré par git),
avec une proposition de rôles (3 préleveurs, 1 réception, 1 validateur, 4
Direction — deux personnes figurent dans les deux validations : un seul
compte Direction chacune) et ce qui manque (les techniciens, le comptable, le
gestionnaire commercial, le magasinier, l'administrateur ; 2 ou 4
signataires « Direction » ; le nom imprimé). **Décision du propriétaire : rien
n'est créé tant qu'il ne l'a pas dit.** Ce n'est pas un travail du lot 3.

## 9. Ordre et recette

1. **Maintenant, sans code** : S2 ; O-1 (Q19) ; la relance (§6) quand le
   propriétaire le décide.
2. **Lot 3A** (P1, ≈ 2 jours, aucune migration) : I1, I2, I3, I4, I5, I7,
   K1, K2, G2 ; puis déployer, S1, S3 (part sûre), S4, et tester en
   production sur « TEST UI » (règle du 21/10). Prévenir le laboratoire :
   T° au prélèvement obligatoire sur la visite (aliment, eau, surface), plus
   de « Prélevé le » obligatoire pour un dépôt du client, le commercial
   n'envoie plus les rapports, la note d'analyse n'est plus imprimée.
3. **Lot 3B** (P2) : G1, G4, G5, J1, J2, puis J3 seul, avec la règle O-12 et
   les tests d'alerte écrits **avant** le changement.
4. **Lot 3C** (P2) : L1, L2, L4, I6, K5, K6 ; K4 dès les fichiers reçus ; K3, L3,
   L5, I8 selon les réponses.
5. **Lot 3D** (P2 puis P3) : M1 (une migration), M2, M3, M4 ; M5–M8 après
   R-23 / R-24.
6. **Lot 3E** (P3) : après O-6 et R-22.
7. **Recette** : un checkpoint par lot dans `TESTPLAN.md` (V21 pour le lot
   3A), écrit quand le lot est construit.

## 10. Dépôt public

- Le scan et les quatre fichiers restent dans `backups/` (ignoré par git) :
  `backups/reponses-labo-28-10-scan.pdf`,
  `backups/fichiers-labo-28-10/` (le récapitulatif renommé sans le nom du
  client).
- Ici, aucun nom de membre du personnel, de client ni de site : le client du
  récapitulatif et de Q93 est « un client à sites (chaîne de restauration) » ;
  la personne qui transmet les fichiers, « une personne du laboratoire ».
