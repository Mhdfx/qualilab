# Retour du laboratoire du 05/10/2026 — demandes sur le formulaire du préleveur

> Analyse de faisabilité (code lu le 05/10, quatre lecteurs indépendants).
> Rien n'est encore construit : ce document sert à confirmer les lectures
> avec le laboratoire avant d'ouvrir les tranches. Chiffrage pour un
> développeur, recette comprise.

## 1. Verdict d'ensemble

Tout est faisable. Quatre demandes sont des retouches (≤ 2 h chacune),
trois sont des évolutions moyennes (3 à 8 h), deux déplacent une
responsabilité du terrain vers le laboratoire et demandent un nouveau bloc
à la réception (12 h et 14 h). Total ≈ **58 h**, soit un peu plus d'une
semaine, en quatre tranches livrables séparément.

| # | Demande | Faisable | Effort | Tranche |
|---|---|---|---|---|
| 1 | Le préleveur crée des clients (les sites : déjà possible) | oui, avec réserve (doublons) | 5 h | L1 |
| 2 | Cadre = Convention / Bon de commande / Devis validé / Autre | oui, avec migration | 7 h | L1 |
| 3 | Retirer « Service vétérinaire » de « Prélèvement effectué par » | oui | 1,5 h | L1 |
| 4 | « N° de factures » → « Référence client » | oui | 1 h | L1 |
| 5 | Texte libre quand « Autre » est choisi | oui (à préciser : cadre ou préleveur ?) | 3 h | L1 |
| 6 | Nature d'analyse → deux familles (micro / physico-chimie) par ligne | oui, avec réserve (natures fines) | 8 h | L2 |
| 7a | « Aire prélevée » → « Surface (cm²) », rien de tel sur une ligne Air | oui | 2 h | L2 |
| 7b | « Surface prélevée » choisie dans une liste gérée en base | oui, avec réserve (liste fermée) | 14 h | L3 |
| 8 | Analyses demandées facultatives / retirées du préleveur | oui, avec réserve (chaîne réception → rapport) | 12 h | L4 |
| 9 | Type de produit retiré du préleveur | oui | 5 h | L4 |

## 2. Ce que chaque demande change

**1 — Clients et sites depuis le terrain.** Les sites : déjà livré
(« + Nouveau site… » dans la visite). Les clients : ouvrir `POST /api/clients`
au rôle PRELEVEUR et ajouter « + Nouveau client… » avec un mini-formulaire
(raison sociale obligatoire, le reste facultatif), comme pour les sites.
Réserve : la base compte 1 516 clients repris de l'ancien logiciel ; un
client créé sur le terrain sans ICE ni adresse e-mail ne peut ni recevoir
son rapport ni être facturé proprement → prévoir le contrôle de
quasi-doublon et le passage du commercial derrière (journal `CLIENT_CREATED`).

**2 — Cadre.** Remplacer l'énumération Autocontrôle / Contrôle officiel par
Convention / Bon de commande / Devis validé / Autre ; supprimer la déduction
« le cadre suit qui prélève » ; migration MySQL en trois temps (ajout des
valeurs, conversion des séries existantes, retrait des anciennes). Le
protocole PDF imprime le cadre : document qualité versionné (PG04/EN01).

**3 — Service vétérinaire.** Retirer la puce des formulaires visite et
dépôt, refuser la valeur à la création ; garder la valeur en base pour les
séries déjà enregistrées. Un contrôle vétérinaire futur se saisit « Autre +
nom ». À livrer avec la demande 2 (c'était le seul chemin vers « Contrôle
officiel »).

**4 — Référence client.** Le champ existe déjà sous ce nom technique
(`clientReference`) : ne changent que les libellés des formulaires, de la
page visite, du protocole et du bon de réception.

**5 — Texte libre sur « Autre ».** Si c'est le cadre « Autre » : nouvelle
colonne `Serie.cadreNote`, obligatoire quand « Autre » est choisi, imprimée
« Cadre : Autre — texte ». Si c'est « Prélèvement effectué par : Autre » :
le nom est déjà saisi et imprimé, il manque seulement son affichage sur la
page de la visite (quasi gratuit).

**6 — Deux familles au lieu de seize natures.** Sur chaque ligne, deux
cases « Analyses microbiologiques » / « Analyses physico-chimiques » ; la
nature fine (celle qui alimente réception, paillasse, rapport, recherche)
est déduite du couple type de ligne × famille (aliment × micro →
Microbiologie des aliments, surface × micro → Microbiologie des surfaces,
eau × physico-chimie → Physico-chimie des eaux…). Rien ne change en base ni
pour les échantillons existants. Réserve : neuf natures fines deviennent
inaccessibles depuis le formulaire (cosmétiques, compléments alimentaires,
aliments liquides, produits de nettoyage, huiles, analyse sensorielle…) et
deux cases de la table n'ont pas de nature aujourd'hui (Air × physico-chimie,
Autre × micro).

**7a — Libellés surface.** « Aire prélevée (cm²) » devient « Surface (cm²) »
(formulaire, « Corriger la fiche », message d'erreur) ; une ligne de type Air
n'affiche plus de champ surface. Aucun changement de base.

**7b — Liste des surfaces.** Nouvelle table `SurfaceType` (libellé, actif,
surface par défaut en cm² en option), écran `/admin/surfaces`, API, sélecteur
avec recherche dans le formulaire, surfaces déjà prélevées chez le client
proposées en premier, migration des libellés existants comme liste de
départ. Réserve : une liste fermée bloque la visite quand la surface manque
→ garder « Autre (préciser) » ou autoriser l'ajout par le préleveur.

**8 — Analyses demandées.** Facultatives à la création d'une VISITE (le
bloc reste, sans astérisque) ; obligatoires au moment où la réception
attribue la ligne à un technicien, avec un nouveau bloc « Analyses à
effectuer » par ligne à la réception (profils, cases, type de produit) ;
garde-fou sur la paillasse (pas de saisie sans analyse). Le dépôt au comptoir
garde l'obligation (l'échantillon part aussitôt à la paillasse). Réserve : le
protocole signé par le client ne listera plus les analyses par ligne si le
préleveur ne coche rien.

**9 — Type de produit.** Le sélecteur quitte le formulaire préleveur (une
prop à vider, le code reste pour le dépôt) ; la réception pose le type dans
le même bloc que la demande 8, avant la paillasse (la grille R1 … Rn a besoin
des critères dès la première saisie). Les puces « Nombre d'unités (n) »
restent sur le terrain : les unités sont prélevées physiquement sur place.

## 3. Questions à poser au laboratoire avant de coder

1. Cadre : confirmer que les quatre valeurs **remplacent** Autocontrôle /
   Contrôle officiel (plus besoin de distinguer un contrôle officiel ?), et
   ce que deviennent les séries existantes (toutes « Autre » ?).
2. « Autre » : s'agit-il du cadre « Autre » (texte libre à créer) ou de
   « Prélèvement effectué par : Autre » (nom déjà saisi) ? Le numéro d'un
   bon de commande ou d'un devis va-t-il dans « Référence client » ?
3. Natures : les neuf natures fines qui ne seront plus proposées sont-elles
   abandonnées ? Que faire d'Air × physico-chimie et Autre × micro ?
4. Air : faut-il seulement supprimer le mot « Aire », ou une ligne Air
   porte-t-elle une information propre (volume aspiré, durée) ?
5. Surfaces : une liste unique pour le laboratoire ou par client ? Saisie
   « Autre (préciser) » autorisée sur le terrain ? Qui ajoute une surface ?
   Liste de départ et surfaces par défaut en cm² (couteau 25, plan 100…) ?
6. Analyses : qui fixe les analyses et le type de produit au laboratoire —
   la réception (proposé) ou le validateur ? Le protocole signé par le client
   doit-il encore lister les analyses ? Le dépôt au comptoir reste-t-il
   obligatoire ?
7. Clients : quels champs le préleveur saisit-il, et le commercial
   complète-t-il derrière (ICE, destinataires des rapports) ?

## 4. Ordre proposé

- **L1 (en-tête du protocole, ≈ 18 h)** : demandes 1, 2, 3, 4, 5 — une
  migration, un document qualité à re-versionner.
- **L2 (lignes, ≈ 10 h)** : demandes 6 et 7a — aucune migration.
- **L3 (surfaces, ≈ 14 h)** : demande 7b — nouvelle table et écran admin.
- **L4 (le laboratoire décide des analyses, ≈ 17 h)** : demandes 8 et 9 —
  nouveau bloc à la réception, garde-fous paillasse.

## 5. Nouveau rôle : technicien responsable des paramètres (demande orale du 05/10)

**Ce que le laboratoire décrit.** Après la réception, une personne dédiée
décide, pour chaque prélèvement, de ce qui doit être fait (paramètres,
type de produit, consignes) avant qu'un technicien de paillasse ne saisisse
les résultats. Dès que ce « programme d'analyse » est confirmé, la
comptabilité dispose de ce qu'il lui faut (les analyses à facturer) ; puis
paillasse → validateur → approbation → rapport, comme aujourd'hui.

**Lecture dans le circuit actuel.** Le circuit est PRELEVE → RECU →
EN_ANALYSE → RESULTATS_SAISIS → VALIDE → RAPPORT_ENVOYE (`sample-status.ts`).
Aujourd'hui les analyses et le type sont fixés par le préleveur et le
technicien est attribué par la réception ; la facturation ne voit un
échantillon qu'une fois VALIDE. La demande insère une étape entre RECU et
EN_ANALYSE et avance le moment où la facturation peut travailler. Elle
remplace la réponse proposée aux demandes 8 et 9 (le bloc « Analyses à
effectuer » à la réception devient l'écran du nouveau rôle).

**Proposition.**
- Rôle `PROGRAMMATEUR` (libellé « Responsable des paramètres ») dans l'enum
  `Role` ; espace `/programmation` : file « À programmer » (lignes RECU sans
  programme), fiche par ligne : type de produit (critères n, c, m, M),
  profil / paramètres, technicien de paillasse, priorité et délai,
  consignes ; bouton « Confirmer le programme ».
- Statut `PROGRAMME` entre RECU et EN_ANALYSE (`RECU → PROGRAMME` par le
  programmateur ou l'admin ; `PROGRAMME → EN_ANALYSE` par le technicien) ;
  la paillasse refuse de commencer une ligne non programmée ; la réception
  n'attribue plus le technicien (ou seulement à titre indicatif) ; la ligne
  détruite à la réception ne passe pas par là. Le programme est journalisé
  (`SAMPLE_PROGRAMMED`, avant/après) et modifiable par le programmateur
  tant que la paillasse n'a pas commencé, ensuite par « Corriger la fiche ».
- Facturation : la liste « à facturer » (`/api/clients/[id]/billable`)
  accepte les lignes PROGRAMME, VALIDE et RAPPORT_ENVOYE ; la facture peut
  donc être préparée dès le programme confirmé, aux prix du catalogue des
  analyses programmées. Une ligne annulée après facturation doit être
  signalée au comptable (avoir / facture à rouvrir) — nouveau cas à traiter.
- Dépôt au comptoir : même passage par le programmateur (la réception ne
  choisit plus les analyses) ; le préleveur garde le nombre d'unités.
- Effort : rôle et espace (12 h), statut, file, fiche et garde-fous (14 h),
  facturation (4 h), recette et docs (6 h) ≈ **36 h**, en remplacement des
  17 h de la tranche L4.

**Avis.** Cohérent avec le fonctionnement d'un laboratoire : une seule
personne connaît les contrats et les critères, les techniciens de paillasse
n'ont plus à choisir, et la facturation n'attend plus le rapport. Trois
points à trancher avec le laboratoire : (1) facturer avant le résultat
suppose de gérer l'annulation après facturation ; (2) qui remplace le
programmateur quand il est absent (l'admin, ou un second compte) sinon la
paillasse s'arrête ; (3) le protocole signé par le client n'engage plus sur
les analyses, seulement sur le prélèvement — à confirmer avec le responsable
qualité.
