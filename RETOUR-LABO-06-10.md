# Retour du laboratoire du 06/10 — analyse de faisabilité et plan

Remarques reçues après le rendez-vous du 06/10, en deux lots, puis deux
ajouts le même jour (familles par échantillon) et le 07/10 (cadre, état de
la surface). Chaque point est vérifié dans le code, en production
(http://185.217.126.53, lecture seule) et dans la base de l'ancien logiciel
(copie locale, lecture seule). Plusieurs points confirment des demandes de
`RETOUR-LABO-05-10.md` : ce document les reprend et **remplace son plan
(§4) par le plan unique du §4 ci-dessous**.

## 1. Verdict d'ensemble

| # | Remarque | Faisable | Effort | Recoupe 05/10 | Tranche |
|---|---|---|---|---|---|
| 1 | Affecter les sites de prélèvement au client (ex. une chaîne de restauration) | oui — c'est une reprise de données | 10 h | — (sites reportés au chantier 6) | V5 |
| 2 | Retirer « Service vétérinaire » de « Prélèvement effectué par » | oui | 1,5 h | demande 3 (confirmée) | V1 |
| 3 | « Ligne 1 » → « Échantillon 1 » | oui | 3 h | — | V2 |
| 4 | « Surface prélevée » → « Désignation » | oui | 1,5 h | demande 7a | V2 |
| 5 | Masquer « Nature d'analyse » | oui, avec 7 | inclus dans 7 | demande 6 | V3 |
| 6 | Air : méthode « Boîte exposée 30 min » / « Biocollecteur » | oui, avec migration | 5 h (+ catalogue air) | question 4 | V4 |
| 7 | « Analyses microbiologiques » / « physico-chimiques » par échantillon | oui, avec migration légère | 10 h | demande 6 (confirmée) | V3 |
| 8 | Cadre : « Autocontrôle » / « Contrôle officiel » → Autre, Devis validé, BC, Convention | oui, avec migration | 9 h | demandes 2 et 5 (confirmées) | V1 |
| 9 | Surfaces : « Surface prélevée* » → « État de la surface » (Aseptique, En cours de travail, Nettoyé) | oui, avec migration | 3 h | — | V2 |

**Remarques du 06/10 et du 07/10 : ≈ 43 h.** Avec ce qui reste des demandes
du 05/10 (tranche V6 et deux points en attente de réponse), le plan complet
est au §4.

## 2. Ce que chaque remarque change

**1 — Sites des clients.** L'ancien logiciel range 426 sites sous 36 clients
« parents » (table CLIENTS, type 102, champ ID_HAUTE) : la plus grande
chaîne de restauration en compte 84, les suivantes 77, 55, 30, 30, 27, 17…
L'import du 01/10 a pris chaque site pour un client : en production, chaque
restaurant de la chaîne est un client à part, et le client « chaîne » n'a
**aucun site**. Le modèle
`Site` existe déjà (fiche client, cascade client → site de la visite,
« + Nouveau site… », destinataires par site) ; il manque la reprise :
- export des 426 sites depuis l'ancienne base (parent, nom, adresse, ville,
  téléphone, identifiant) ;
- import « Sites » dans `/admin` : création des `Site` sous le bon parent
  (`legacyId`), transfert de la mémoire lieux / produits du faux client vers
  le site, archivage du faux client s'il n'a ni série ni facture ;
- **le rapport n'imprime pas le site aujourd'hui** (seul le protocole le
  fait) : l'ajouter au bloc client du rapport et à l'objet de l'e-mail,
  indispensable pour 84 restaurants d'un même client ;
- filtre par site dans la recherche et l'export Excel.
Risques : rapprochement par nom (accents ; homonymes : un même nom de
quartier porté par les sites de deux chaînes) — l'import montre un aperçu à
valider avant d'écrire. La facturation par site (« forfait par site » de
l'ancien logiciel) n'est pas incluse.

**2 — Service vétérinaire.** Demandé une seconde fois. Retirer le bouton de
la visite et du dépôt, refuser la valeur à la création, la garder en base
pour l'historique ; un contrôle vétérinaire se saisit « Autre + nom ».
Cohérent avec la remarque 8 : « Contrôle officiel » disparaît, plus rien
n'est déduit de « qui prélève ». Dans l'ancien logiciel, 11 % des
échantillons (5 691) étaient prélevés par le service vétérinaire, surtout
déposés au comptoir : retiré aussi du dépôt sauf avis contraire (Q46).

**3 — « Échantillon » au lieu de « Ligne ».** Environ 80 libellés dans 20
fichiers du circuit : formulaire de visite et de dépôt, récapitulatif,
réception (« Valider la réception (1 échantillon) », « Technicien pour tous
les échantillons », « 1 échantillon numéroté »), programmation, paillasse,
messages d'erreur (« Échantillon 2 — indiquez… »). Restent « ligne » : les
lignes de facture, d'import Excel et de critères. Les noms techniques
(`lineNumber`, `lineKind`) ne changent pas. Tests des messages à mettre à
jour.

**4 + 9 — Désignation, état et surface d'une ligne Surface.** Le protocole
papier écrit « MS Planche vert » dans la colonne **Désignation** et
« 100 cm² » dans la colonne **Surface prélevée** ; le PDF le fait déjà.
L'ancien logiciel écrivait l'état dans la désignation (« Pince au cours du
travail », « Trancheuse tomate aseptisée », « Coupe filet aseptisé »). Le
formulaire devient, pour une ligne Surface :
- **« Désignation »*** — ce qui est prélevé (Planche verte, Pince) ; c'est
  l'ancien champ « Surface prélevée* » renommé (remarque 4) ;
- **« État de la surface »*** — trois boutons Aseptique / En cours de
  travail / Nettoyé (remarque 9), sur le modèle de « État des mains »
  (Lavées / Non lavées) : énumération `SurfaceState`, colonne
  `Sample.surfaceState` (migration additive), obligatoire sur une nouvelle
  ligne Surface ;
- **« Surface prélevée (cm²) »** — l'aire, ex-« Aire prélevée (cm²) ».
L'état s'imprime dans la colonne « Remarques » du protocole (comme
« Lavée » pour les mains), sur le bon, l'étiquette, la fiche de programme,
« Corriger la fiche » et le rapport (« Planche verte — nettoyée »). Sur une
ligne aliment / eau / air, le champ facultatif « Surface prélevée » ferait
doublon avec « Désignation » : retiré sauf avis contraire (Q47). Lecture à
confirmer : la remarque 9 ajoute l'état sans supprimer la désignation (Q51).

**5 + 7 — Deux familles par échantillon, la nature masquée.** Aujourd'hui
chaque échantillon porte **une** nature (16, en deux familles) et les deux
cases « Analyses microbiologiques / physico-chimiques » sont sur la série.
L'ancien logiciel faisait pareil : un échantillon, une nature ; un produit
analysé en micro et en physico-chimie y était **deux échantillons** (deux
N° de contrôle). Proposition, fidèle à cette pratique :
- sur chaque échantillon, deux cases à la place de la liste des natures ;
  la nature est déduite du type × famille (aliment × micro → Microbiologie
  des aliments, eau × physico-chimie → Physico-chimie des eaux…) ;
- les deux cases cochées créent **deux échantillons** au même numéro de
  ligne du protocole (même désignation, lot, lieu), chacun avec sa nature,
  son N° de contrôle, sa quantité minimale (100 g micro, 300 g
  physico-chimie), son technicien et son rapport — rien ne change en aval ;
- le protocole imprime une seule ligne et les analyses dans les deux
  colonnes ; les cases de la série deviennent un résumé calculé ;
- les natures fines (cosmétiques, compléments, aliments liquides,
  nettoyage, huiles, analyse sensorielle ≈ 6 % des échantillons 2025-26)
  ne sont plus proposées au préleveur : la réception ou le responsable des
  paramètres les choisit (aujourd'hui la fiche de programme ne sait pas
  changer la nature — à ajouter).
Risques : deux cases du tableau n'ont pas de nature (Air × physico-chimie,
Autre × micro) ; un mauvais défaut silencieux change la liste des analyses
et le titre du rapport.

**6 — Méthode de prélèvement de l'air.** L'ancien logiciel avait déjà
« méthode de prélèvement » et « durée » sur l'échantillon, et ses unités
distinguent ufc/boîte (boîte exposée) et ufc/m³ (biocollecteur, qui exige
le volume d'air aspiré). Changement : énumération `AirMethod`
(`BOITE_EXPOSEE_30MIN`, `BIOCOLLECTEUR`), colonne `Sample.airMethod`
(migration additive), obligatoire sur une ligne Air, deux boutons dans le
formulaire, affichée au récapitulatif, à la réception, sur la fiche de
programme, dans « Corriger la fiche », dans la colonne « Surface prélevée »
du protocole (vide pour l'air) et sur le rapport. **Constat en
production :** le catalogue Ambiance ne compte que 5 paramètres, tous en
UFC/cm² ; aucun paramètre d'air (945 échantillons d'air en 2025-26 dans
l'ancien logiciel) — à compléter avant toute ligne Air réelle (Q50).

**8 — Cadre.** Le laboratoire confirme les quatre valeurs de la demande 2
du 05/10, sous les libellés **Autre, Devis validé, BC, Convention**. Ce qui
change :
- énumération `Cadre` : `AUTRE`, `DEVIS_VALIDE`, `BON_COMMANDE` (libellé
  « BC »), `CONVENTION` ; migration MySQL en trois temps (ajout des valeurs,
  conversion des séries existantes en `AUTRE` — la production ne contient
  que des séries de test —, retrait d'`AUTOCONTROLE` et `OFFICIEL`) ;
- le cadre n'est plus déduit de « qui prélève » : quatre boutons dans la
  visite et le dépôt, choix obligatoire ;
- « Autre » demande un texte libre (`Serie.cadreNote`, demande 5 du 05/10),
  imprimé « Cadre : Autre — texte » ;
- le N° du BC ou du devis va dans « Référence client » (ex-« N° de
  factures », demande 4 du 05/10) ;
- protocole PDF, bon de réception, page de la visite, réception, recherche
  et export ; document qualité PG04/EN01 à re-versionner.
Question restante : valeur par défaut (aucune, ou celle de la dernière
visite du client ?) — Q52.

## 3. Questions au laboratoire (NEEDEDINFO Q45–Q52)

1. **Q45 — Sites.** On rattache les 426 sites de l'ancien logiciel à leurs
   36 clients (84 restaurants pour la plus grande chaîne…) et on archive les « clients » créés à tort
   pour chaque site ? Le rapport imprime « Client — Site » ; faut-il aussi
   envoyer les rapports par site et facturer par site ?
2. **Q46 — Service vétérinaire.** Retirer aussi du dépôt au comptoir
   (proposé) ?
3. **Q47 — Désignation.** Sur une ligne aliment, eau ou air, peut-on retirer
   le champ facultatif « Surface prélevée » ?
4. **Q48 — Deux familles.** Micro et physico-chimie cochées : deux N° de
   contrôle et deux rapports, comme dans l'ancien logiciel ?
5. **Q49 — Natures fines.** Qui choisit cosmétiques, compléments, produits
   de nettoyage, huiles, analyse sensorielle : la réception ou le
   responsable des paramètres ?
6. **Q50 — Air.** Durée fixe de 30 min ? Volume aspiré à saisir pour le
   biocollecteur ? Liste des paramètres d'air et unités (UFC/boîte,
   UFC/m³) à ajouter au catalogue.
7. **Q51 — État de la surface.** La désignation (« Planche verte »)
   reste, et l'état s'ajoute en choix obligatoire — c'est bien cela ?
8. **Q52 — Cadre.** Valeur par défaut ? Le N° du BC ou du devis va-t-il
   dans « Référence client » ?

## 4. Plan unique (06/10 + 07/10 + ce qui reste du 05/10)

| Tranche | Contenu | Effort | Attend |
|---|---|---|---|
| **V1 — En-tête de la visite** | Cadre : « Autocontrôle » / « Contrôle officiel » remplacés par Autre, Devis validé, BC, Convention + texte sur « Autre » (8) ; « Service vétérinaire » retiré (2) ; « Référence client » (05/10 n° 4) ; protocole PDF re-versionné | 11,5 h | rien (Q46, Q52 tranchées par défaut) |
| **V2 — Vocabulaire et surfaces** | « Échantillon » partout (3) ; « Désignation » et « Surface prélevée (cm²) » (4) ; « État de la surface » (9) | 7,5 h | rien (Q47, Q51 tranchées par défaut) |
| **V3 — Familles par échantillon** | « Analyses microbiologiques » et « Analyses physico-chimiques » sur chaque échantillon (7), « Nature d'analyse » masquée et déduite (5), deux échantillons quand les deux sont cochées, nature fine à la réception / au programme (5, 7) | 10 h | Q48, Q49 |
| **V4 — Air** | Microbiologie de l'air : « Méthode de prélèvement » Boîte exposée 30 min / Biocollecteur (6) ; paramètres d'air au catalogue | 5 h + catalogue | Q50 |
| **V5 — Sites des clients** | Sites de prélèvement affectés au client (ex. la chaîne de restauration aux 84 restaurants) : reprise des 426 sites, faux clients archivés, site sur le rapport et l'e-mail, filtre par site (1) | 10 h | Q45 |
| **V6 — Le laboratoire décide des analyses** | Analyses facultatives et type de produit retiré du préleveur (05/10 n° 8 et 9) : la fiche de programme fait déjà ce travail depuis le 05/10, il reste à lever l'obligation côté visite et à bloquer la programmation sans analyse | 6 h (au lieu de 17 h) | 05/10 Q6 |
| **V7 — Recette** | TESTPLAN V en production, documents | 3 h | V1 → V6 |

**Total V1 → V7 ≈ 53 h**, dont **19 h livrables sans attendre de réponse**
(V1, V2). Restent hors plan, en attente d'une réponse au questionnaire du
05/10 : le préleveur crée des clients depuis le terrain (05/10 n° 1, Q7,
5 h) et la liste gérée des surfaces (05/10 n° 7b, Q5, 14 h) — la remarque 9
ne la remplace pas : elle porte sur l'état, pas sur la désignation.

Ordre : V1 et V2 d'abord (une migration chacune, aucun choix en suspens),
puis V3 → V6 au fil des réponses, V7 à la fin.

## 5. Décisions de construction (07/10) — ce qui est construit maintenant

Construit tout ce qui ne dépend pas d'une donnée du laboratoire, avec les
choix par défaut ci-dessous (chacun réversible si la réponse diffère).
Hors construction : paramètres d'air et de physico-chimie au catalogue
(données du laboratoire, Q50 — le catalogue de production ne contient que de
la microbiologie), volume aspiré du biocollecteur (Q50), envoi et
facturation par site (Q45).

**Migration `20261007100000_retour_labo_v`** (une seule, additive sauf le
cadre) :
- `Cadre` : `AUTRE`, `DEVIS_VALIDE`, `BON_COMMANDE`, `CONVENTION` — ENUM
  élargi, séries existantes passées à `AUTRE`, puis ENUM réduit ; défaut
  `AUTRE` en base.
- `Serie.cadreNote` VARCHAR(191) NULL — précision libre, proposée quand le
  cadre est « Autre », facultative.
- `SurfaceState` (`ASEPTIQUE`, `EN_COURS_DE_TRAVAIL`, `NETTOYE`) et
  `Sample.surfaceState` NULL.
- `AirMethod` (`BOITE_EXPOSEE_30MIN`, `BIOCOLLECTEUR`) et `Sample.airMethod`
  NULL.
- `AnalysisParameter.family` (`Family`, défaut `MICRO`) : la famille d'un
  paramètre, réglable dans `/admin/parametres`.

**V1 — en-tête.** Le cadre est un choix obligatoire (quatre boutons, aucun
présélectionné) sur la visite et le dépôt ; « Autre » ouvre « Préciser
(facultatif) ». Libellés : Autre, Devis validé, BC, Convention. Plus aucune
déduction depuis « qui prélève ». « Service vétérinaire » disparaît de la
visite et du dépôt ; l'API refuse la valeur à la création (« choisissez
« Autre » et indiquez le nom ») ; les séries anciennes gardent leur libellé.
« N° de factures » devient « Référence client » partout.

**V2 — vocabulaire et surfaces.** « Ligne N » d'une série devient
« Échantillon N » sur tous les écrans du circuit et dans les messages
(« Échantillon 2 — … ») ; restent « ligne » les lignes de facture, d'import
et de critères ; les identifiants de code ne changent pas. Une ligne
Surface demande « Désignation »* (ex-« Surface prélevée », colonne
`surfaceLabel`), « État de la surface »* (trois boutons) et « Surface
prélevée (cm²) » (ex-« Aire prélevée »). Ces champs ne s'affichent plus sur
les autres types de ligne (Q47 par défaut) ; les données anciennes restent
lisibles. L'état s'imprime dans « Remarques » du protocole, sur le bon, la
fiche de programme, « Corriger la fiche », la validation et le rapport
(« Planche verte — nettoyée »).

**V3 — familles par échantillon.** Deux cases « Analyses microbiologiques »
et « Analyses physico-chimiques » par échantillon, au moins une cochée ; la
liste « Nature d'analyse » disparaît du formulaire. La nature est déduite
(type × famille) : aliment → MICRO_ALIMENTS / PC_ALIMENTS ; surface →
MICRO_SURFACES / PC_SURFACES ; mains → MICRO_SURFACES / — ; eau →
MICRO_EAUX / PC_EAUX ; air → MICRO_AIR / — ; autre → — / EFFET_ASEPTISANT
(« — » = case grisée). Les deux cases cochées créent **deux échantillons**
au même numéro de ligne (Q48 par défaut, comme l'ancien logiciel) : codes
« 1/26-1M » et « 1/26-1P » (un seul échantillon garde « 1/26-1 »), chacun
sa nature, son N° de contrôle, son programme et son rapport. Les analyses
proposées sont groupées par famille (`AnalysisParameter.family`) et partent
vers l'échantillon de leur famille. Le protocole imprime une ligne par
numéro et les analyses dans les deux colonnes ; les cases de la série sont
calculées. La nature fine (cosmétiques…) se change sur la fiche de
programme, dans la même famille (Q49 par défaut).

**V4 — air.** « Méthode de prélèvement »* (Boîte exposée 30 min /
Biocollecteur) sur une ligne Air ; affichée et imprimée là où la ligne
l'est (colonne « Surface prélevée » du protocole, vide pour l'air).

**V5 — sites.** Import « Sites de l'ancien logiciel » dans `/admin/import`
(CSV exporté de la base Firebird : `legacySiteId;site;adresse;ville;
telephone;email;obsolete;legacyClientId;client;clientObsolete`, fichier
hors dépôt), en deux temps analyse / écriture, idempotent (`Site.legacyId`).
Le parent est trouvé par son nom normalisé. Quand le nom d'un site désigne
**un seul** client actif et **un seul** site du fichier, ce client est le
site importé à tort : ses lieux et produits mémorisés et ses adresses passent
au site, puis il est archivé — sauf s'il porte des séries, échantillons ou
factures (alors seulement signalé). Les cas ambigus créent le site sans
toucher aux clients. Le rapport et l'objet de l'e-mail impriment « Client —
Site » ; la recherche filtre par site.

**V6 — le laboratoire décide des analyses.** Une visite s'enregistre sans
analyse ni type de produit (le sélecteur de type quitte le formulaire du
préleveur ; il reste sur le dépôt) ; un dépôt aussi peut s'enregistrer sans
analyse. La fiche de programme refuse déjà de confirmer sans analyse et la
paillasse n'ouvre qu'un échantillon programmé : rien à ajouter côté
laboratoire.

## 6. Livré et vérifié en production (07/10)

V1 → V6 sont en production (commits `e30c2b0` et `e83421c`, migration
`20261007100000_retour_labo_v`). Recette : TESTPLAN V (script d'API 29/29
et parcours réel au navigateur : visite → protocole → réception →
correction → programme → rapport), sur le client de test.

- **Fait :** cadre à quatre valeurs avec précision sur « Autre » ;
  « Service vétérinaire » retiré ; « Référence client » ; « Échantillon N »
  partout ; ligne Surface = Désignation, État de la surface, Surface prélevée
  (cm²) ; deux familles par échantillon (1M / 1P), nature masquée et déduite,
  nature fine sur la fiche de programme (même famille, même type
  d'échantillon) ; méthode de prélèvement de l'air ; analyses et type de
  produit facultatifs pour le préleveur ; site sur le rapport et filtre par
  site dans la recherche.
- **Sites :** import exécuté en production — 420 sites créés sous leurs
  36 clients, 345 clients créés à tort archivés (réversible), 75 noms
  douteux et 5 parents ambigus laissés tels quels (à rattacher à la main
  depuis la fiche client si besoin), 5 noms qui sont aussi de vrais clients
  protégés.
- **Reste au laboratoire :** les paramètres d'air et de physico-chimie au
  catalogue et la famille de chaque paramètre dans `/admin/parametres` (Q50) ;
  la nouvelle version des documents PG04/EN01 et PG05/EN04 dans
  `/admin/documents` ; les réponses Q45–Q52 (envoi et facturation par site,
  confirmation des choix par défaut).

## 7. Clients en double ou éclatés — analyse complète (07/10, après l'import des sites)

Lecture seule ; rien n'a été modifié en production. Fichier pour le
laboratoire : `legacy-export/doublons-clients.xlsx` (hors dépôt : noms de
clients). Scripts : `.ui-tests/dup-candidates.mjs`, `build-doublons-xlsx.py`.

- **Cause :** l'ancien logiciel a trois sortes de fiches — 1 022 clients,
  426 sites et **945 « clients facturés »** (la société qui reçoit les
  factures d'une chaîne : franchisé, holding, société de gestion). L'import
  du 01/10 a tout mis à plat en clients ; le laboratoire a aussi saisi
  certaines sociétés deux fois.
- **Méthode :** indices forts (même nom sans forme juridique ni accents,
  même ICE, rattachement de l'ancien logiciel, nom d'un site) et faibles
  (début de nom, téléphone, e-mail, adresse, orthographe voisine) ; chaque
  client classé, chaque fusion ou rattachement contre-vérifié, puis une
  réponse cohérente par groupe.
- **Résultat sur 1 172 clients actifs :** 355 examinés — 74 doublons à
  fusionner, 109 clients facturés à garder et à lier à leur client
  principal, 14 points de vente à rattacher comme sites (dont 2 chaînes sans
  fiche principale, à créer), 27 cas à confirmer par le laboratoire ;
  130 fiches principales et 1 fiche distincte restent telles quelles. Aucun
  doublon proposé n'a deux ICE différents.
- **À construire après validation du labo :** une action « Fusionner avec… »
  et une action « Rattacher comme site de… » (avec aperçu, journal, et
  transfert de l'historique), le lien **client facturé → client principal**
  (absent de l'application : la facture d'un site doit pouvoir aller au
  franchisé), et un avertissement de quasi-doublon à la création d'un
  client. Estimation : ≈ 12 h.

## 8. Retour du 08/10 — corrections décidées

1. **Heures saisies sur un appareil non mis à jour.** Cause : « Prélevé le »
   est proposé en heure légale, mais « Heure de fin » et « Arrivé au
   laboratoire » sont tapées à la main ; sur un appareil qui avance d'une
   heure, l'utilisateur tape l'heure qu'il lit, refusée « dans le futur »
   quand elle tombe dans l'heure écoulée — et enregistrée une heure trop
   tard, sans refus, quand elle est plus ancienne. Correction : un seul
   champ date-heure (`LabDateTimeInput`) partout ; l'écart de l'appareil est
   détecté, le champ affiche et lit l'heure **de l'appareil** et la convertit
   en heure légale (« = 18:06 heure légale ») ; bouton « Maintenant » sur la
   fin et l'arrivée ; contrôle « dans le futur » dès « Continuer », à côté du
   champ. L'état interne et le serveur restent en heure légale.
2. **Air et Autre : les deux familles.** Natures ajoutées : « Physico-chimie
   de l'air » (air × physico-chimie) et « Microbiologie — autres
   prélèvements » (autre × microbiologie). Mains : microbiologie seule.
3. **« Profil d'analyses » retiré du formulaire du préleveur** (les profils
   restent sur la fiche de programme et au dépôt). « Nombre d'unités (n) »
   reste.
4. **Bloc « Analyses à effectuer » de la visite retiré** : les cases sont sur
   chaque échantillon ; le protocole PDF garde ses deux cases, cochées
   d'après les échantillons.
5. Ligne Air : pas de « T° produit » ; l'aide « 5 pour la plupart des
   aliments, 9 pour l'histamine » seulement sur un aliment.

## 9. Retour du 08/10 (suite, en production) — corrections livrées le 08/10

Remarques envoyées le 08/10 pendant l'utilisation réelle (captures d'écran).

1. **« Arrivé au laboratoire » retiré de la création de la visite.** Le
   formulaire est rempli chez le client, avant le retour : une heure
   d'arrivée tapée d'avance est dans le futur et bloquait « Continuer ».
   L'heure d'arrivée et la température de la glacière se saisissent au
   retour, sur la fiche de la visite (« Maintenant ») ou par la réception,
   qui prend sa propre heure à défaut. Une ligne l'indique à la place des
   champs. **En production le 08/10** (`7612a18`).
2. **Mains du personnel : les deux familles.** La case « Analyses
   physico-chimiques » était grisée ; toutes les natures d'échantillon
   proposent maintenant les deux cases (mains = surface dans le catalogue :
   « Physico-chimie des surfaces »).
3. **Le réceptionniste n'affecte plus de technicien.** Le choix du
   technicien disparaît de la réception et du dépôt (et l'API de réception
   ne l'accepte plus) ; le responsable des paramètres l'attribue sur la
   fiche de programme, en choisissant dans la liste globale — la plus
   ancienne entrée en tête.
4. **Étiquettes : sans client ni site** (numérotation aveugle) ; nature,
   date, N° de contrôle et répétition, code-barres, désignation et série
   restent.
5. **Tableaux de bord : chaque bloc chiffré est cliquable** et affiche les
   éléments qu'il compte (filtre de la liste en dessous, ou liste filtrée).
   Restent simples, faute de liste : « Délai moyen », « Préleveurs actifs »,
   « Alertes de contamination ».

**Points 2 à 5 en production le 08/10** (`73d7119`, TESTPLAN V9). Le
programme ne se confirme plus sans technicien (conséquence du point 3).
Aucune analyse de physico-chimie d'ambiance (surfaces, mains, air) n'est
encore au catalogue (Q50) : ces échantillons se créent et se réceptionnent,
la programmation attend la liste du laboratoire.
