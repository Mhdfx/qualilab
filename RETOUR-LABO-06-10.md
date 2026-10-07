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
| 1 | Affecter les sites de prélèvement au client (ex. McDonald's) | oui — c'est une reprise de données | 10 h | — (sites reportés au chantier 6) | V5 |
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
« parents » (table CLIENTS, type 102, champ ID_HAUTE) : McDonald's 84
restaurants, Rezoroute 77, Sodexo 55, Delipat 30, Little Mamma 30, Acima 27,
La Grillardière 17… L'import du 01/10 a pris chaque site pour un client :
en production, « MARINA », « CASA PORT », « AGADIR DRIVE », « AIN SEBAA »
sont des clients, et le client « MC DONALDS » n'a **aucun site**. Le modèle
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
Risques : rapprochement par nom (accents : « AÏN SEBAÂ », « AIN SEBAA » ;
homonymes : « PAUL MARJANE CALIFORNIE ») — l'import montre un aperçu à
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
   36 clients (McDonald's 84…) et on archive les « clients » créés à tort
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
| **V1 — En-tête de la visite** | Cadre à quatre valeurs + texte sur « Autre » (8) ; « Service vétérinaire » retiré (2) ; « Référence client » (05/10 n° 4) ; protocole PDF re-versionné | 11,5 h | rien (Q46, Q52 tranchées par défaut) |
| **V2 — Vocabulaire et surfaces** | « Échantillon » partout (3) ; « Désignation » et « Surface prélevée (cm²) » (4) ; « État de la surface » (9) | 7,5 h | rien (Q47, Q51 tranchées par défaut) |
| **V3 — Familles par échantillon** | Deux cases par échantillon, nature masquée et déduite, deux échantillons quand les deux sont cochées, nature fine à la réception / au programme (5, 7) | 10 h | Q48, Q49 |
| **V4 — Air** | Méthode de prélèvement (6) ; paramètres d'air au catalogue | 5 h + catalogue | Q50 |
| **V5 — Sites des clients** | Reprise des 426 sites, faux clients archivés, site sur le rapport et l'e-mail, filtre par site (1) | 10 h | Q45 |
| **V6 — Le laboratoire décide des analyses** | Analyses facultatives et type de produit retiré du préleveur (05/10 n° 8 et 9) : la fiche de programme fait déjà ce travail depuis le 05/10, il reste à lever l'obligation côté visite et à bloquer la programmation sans analyse | 6 h (au lieu de 17 h) | 05/10 Q6 |
| **V7 — Recette** | TESTPLAN V en production, documents | 3 h | V1 → V6 |

**Total V1 → V7 ≈ 53 h**, dont **19 h livrables sans attendre de réponse**
(V1, V2). Restent hors plan, en attente d'une réponse au questionnaire du
05/10 : le préleveur crée des clients depuis le terrain (05/10 n° 1, Q7,
5 h) et la liste gérée des surfaces (05/10 n° 7b, Q5, 14 h) — la remarque 9
ne la remplace pas : elle porte sur l'état, pas sur la désignation.

Ordre : V1 et V2 d'abord (une migration chacune, aucun choix en suspens),
puis V3 → V6 au fil des réponses, V7 à la fin.
