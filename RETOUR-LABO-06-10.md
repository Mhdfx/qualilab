# Retour du laboratoire du 06/10 — analyse de faisabilité

Remarques reçues après le rendez-vous du 06/10, en deux lots, plus un ajout
le même jour. Chaque point est vérifié dans le code, en production
(http://185.217.126.53, lecture seule) et dans la base de l'ancien logiciel
(copie locale, lecture seule). Trois d'entre eux recoupent
`RETOUR-LABO-05-10.md` : le laboratoire les confirme.

## 1. Verdict d'ensemble

| # | Remarque | Faisable | Effort | Recoupe 05/10 |
|---|---|---|---|---|
| 1 | Affecter les sites de prélèvement au client (ex. McDonald's) | oui — c'est une reprise de données | 10 h | — (sites reportés au chantier 6) |
| 2 | Retirer « Service vétérinaire » de « Prélèvement effectué par » | oui | 1,5 h | demande 3 |
| 3 | « Ligne 1 » → « Échantillon 1 » | oui | 3 h | — |
| 4 | « Surface prélevée » → « Désignation » | oui | 1,5 h | demande 7a |
| 5 | Masquer « Nature d'analyse » | oui, avec 7 | inclus dans 7 | demande 6 |
| 6 | Air : méthode « Boîte exposée 30 min » / « Biocollecteur » | oui, avec migration | 5 h (+ catalogue air) | question 4 |
| 7 | « Analyses microbiologiques » / « physico-chimiques » par échantillon | oui, avec migration légère | 10 h | demande 6 |

**Total ≈ 31 h**, soit lot 1 ≈ 14,5 h et lot 2 ≈ 16,5 h. Les points 5 et 7
forment une seule tranche : la case « famille » remplace la liste des natures.

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

**2 — Service vétérinaire.** Déjà demandé le 05/10 (demande 3). Retirer le
bouton de la visite et du dépôt, refuser la valeur à la création, la garder
en base pour l'historique ; un contrôle vétérinaire se saisit « Autre + nom ».
Effet de bord : le cadre « Contrôle officiel » n'est plus déduit (il l'était
du service vétérinaire) — à livrer avec la refonte du cadre (05/10, demande
2). Dans l'ancien logiciel, 11 % des échantillons (5 691) étaient prélevés
par le service vétérinaire, surtout déposés au comptoir : confirmer qu'il
faut aussi le retirer du dépôt (Q46).

**3 — « Échantillon » au lieu de « Ligne ».** Environ 80 libellés dans 20
fichiers du circuit : formulaire de visite et de dépôt, récapitulatif,
réception (« Valider la réception (1 échantillon) », « Technicien pour tous
les échantillons », « 1 échantillon numéroté »), programmation, paillasse,
messages d'erreur (« Échantillon 2 — indiquez… »). Restent « ligne » : les
lignes de facture, d'import Excel et de critères. Les noms techniques
(`lineNumber`, `lineKind`) ne changent pas. Tests des messages à mettre à
jour.

**4 — « Désignation ».** Le protocole papier écrit « MS Planche vert » dans
la colonne **Désignation** et « 100 cm² » dans la colonne **Surface
prélevée** ; le PDF le fait déjà. Seul le formulaire diverge : le champ du
libellé s'appelle « Surface prélevée » et l'aire « Aire prélevée (cm²) ».
Changement : « Désignation » pour le libellé, « Surface prélevée (cm²) »
pour l'aire, dans le formulaire, « Corriger la fiche » et les messages.
Sur une ligne aliment / eau / air, le champ facultatif « Surface prélevée »
ferait doublon avec « Désignation » : proposé de le retirer (Q47).

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
le volume d'air aspiré). Changement : énumération `BOITE_EXPOSEE_30MIN` /
`BIOCOLLECTEUR`, colonne `Sample.airMethod` (migration additive),
obligatoire sur une ligne Air, deux boutons dans le formulaire, affichée au
récapitulatif, à la réception, sur la fiche de programme, dans « Corriger la
fiche », dans la colonne « Surface prélevée » du protocole (vide pour l'air)
et sur le rapport. **Constat en production :** le catalogue Ambiance ne
compte que 5 paramètres, tous en UFC/cm² ; aucun paramètre d'air (945
échantillons d'air en 2025-26 dans l'ancien logiciel) — à compléter avant
toute ligne Air réelle (Q50).

## 3. Questions au laboratoire (NEEDEDINFO Q45–Q50)

1. **Q45 — Sites.** On rattache les 426 sites de l'ancien logiciel à leurs
   36 clients (McDonald's 84…) et on archive les « clients » créés à tort
   pour chaque site ? Le rapport imprime « Client — Site » ; faut-il aussi
   envoyer les rapports par site et facturer par site ?
2. **Q46 — Service vétérinaire.** Retirer aussi du dépôt au comptoir ? Un
   « Contrôle officiel » doit-il encore exister ?
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

## 4. Ordre proposé

- **Lot 1 (≈ 14,5 h)** : 2 et 3 tout de suite (libellés, sans attendre de
  réponse) ; 1 après Q45 (export, import avec aperçu, site sur le rapport).
- **Lot 2 (≈ 16,5 h)** : 4 tout de suite ; 5 + 7 après Q48–Q49 ; 6 après
  Q50, avec le catalogue air.
