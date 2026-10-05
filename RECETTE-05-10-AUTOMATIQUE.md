# Recette navigateur automatisée — production, 5 octobre 2026

**Rapport 1 / 2.** Ce rapport couvre ce que des navigateurs pilotés
automatiquement (Chrome sans tête, Playwright) ont vérifié sur la
production http://185.217.126.53. Le rapport 2 (`RECETTE-05-10-MANUELLE.md`)
couvre le parcours fait à la main, comme un utilisateur.

## 1. Comment la recette a tourné

1. **Jeu d'essai** — un client de test « TEST UI 2026-10-05 » créé par l'API
   avec des séries garées à chaque étape du circuit (à réceptionner, sur la
   paillasse, à valider, à approuver, approuvée, dépôt avec une ligne
   détruite), ré-alimenté une fois (8/26 à réceptionner, 9/26 validée).
2. **Huit agents en parallèle, un par espace** (connexion et navigation,
   préleveur, réception, technicien, validation, administrateur sur le
   circuit, administrateur configuration, commercial / comptabilité /
   magasin), chacun devant ouvrir chaque page, cliquer chaque bouton,
   soumettre chaque formulaire une fois invalide et une fois valide,
   télécharger chaque document, relire chaque capture d'écran, puis un
   vérificateur indépendant par défaut signalé.
   Le lancement a été interrompu deux fois (limite de session, puis arrêt
   volontaire) : **seul l'agent technicien est allé au bout** (21 pages,
   42 actions, 12 défauts signalés, 1 confirmé par le vérificateur avant
   l'arrêt, les 11 autres triés et reproduits à la main ci-dessous).
3. **Balayage complet par script** (`.ui-tests/sweep-all.mjs`), sur la
   version déployée avec les correctifs, pour couvrir ce que les sept
   autres agents n'ont pas fini : chaque page du menu de chaque rôle, les
   pages de détail du jeu d'essai, les règles d'accès entre rôles, les
   documents PDF / Excel, les URL inconnues, la mise en page téléphone.

## 2. Résultats du balayage (version corrigée, déployée)

| Rôle | Pages ouvertes | Contrôles d'accès | Documents | Anomalies |
|---|---|---|---|---|
| pre1 (préleveur) | 4 | 4 | — | 0 · aucun N° de contrôle visible |
| recep1 (réception) | 7 | 3 | 4 (étiquettes, protocole, bon, export Excel) | 0 |
| tech1 / tech2 (techniciens) | 6 + 2 | 4 + 1 | 1 (feuille de paillasse) | 0 · tech2 ne voit que sa ligne |
| valid1 (validateur) | 9 | 3 | 2 (rapport, paillasse) | 0 |
| admin | 32 | — | 5 (export Excel ×2, rapport, protocole, paillasse) | 0 (les deux URL inconnues répondent bien 404 « Page introuvable ») |
| commercial1 | 6 | 3 | 1 (rapport) | 0 |
| compta1 | 5 | 3 | — | 0 |
| magasin1 | 4 | 4 | — | 0 |

- 75 pages : toutes en 200, sans erreur JavaScript ni requête en échec ;
  un rôle qui ouvre l'espace d'un autre est renvoyé vers son tableau de
  bord, jamais une page d'erreur.
- 13 documents : tous de vrais PDF (40 à 65 Ko) ou classeurs Excel.
- Téléphone (390 × 844) : connexion, tableau de bord et formulaire de
  visite du préleveur, fiche de visite, paillasse à 3 répétitions —
  aucun débordement horizontal ; les cellules R1 … Rn font 93 px (52 px
  avant correction).
- Formulaire de connexion par script : non concluant (la limite de
  3 connexions / 10 s était saturée par les agents) ; vérifié à la main
  dans le rapport 2.

## 3. Défauts signalés par l'agent technicien et leur sort

| Gravité | Défaut | Sort |
|---|---|---|
| majeur | Grille à répétitions sans critère : une lecture illisible (« abc ») n'est ni signalée ni bloquée et part à la validation | **Corrigé** — message « R1 : lecture non reconnue… », soumission bloquée à l'écran et refusée par l'API |
| majeur | Décision manuelle « Non conforme » qui colle aux lectures suivantes, avec « Dépassement » sans aucune limite | **Corrigé** — la décision ne survit pas à la correction de la lecture ; « Dépassement » seulement face à une limite |
| majeur | Feuille de paillasse sans colonnes R1 … Rn ni critères m / M / c | **Corrigé** — une cellule par répétition et le critère du type (vérifié à l'image) |
| mineur | « 5 unités sur 5 non lues » quand une valeur illisible est tapée | **Corrigé** (même message que ci-dessus) |
| mineur | Salmonelles : critère « Absence /1g » mais lecture « /25 g » (type ABATS CRUS DE VOLAILLE) | **Question au laboratoire** (NEEDEDINFO Q40) : donnée du classeur, pas un bug |
| mineur | Grille à 5 répétitions illisible sur téléphone (cellules de 52 px) | **Corrigé** — cellules de 4,75 rem minimum, défilement latéral |
| mineur | Page Recherche du technicien : « Exportez le résultat en Excel » sans bouton (API 403) — confirmé par le vérificateur | **Corrigé** — la phrase n'apparaît que pour les rôles qui exportent |
| mineur | « Feuille de paillasse » du menu ouvre le PDF dans le même onglet | **Corrigé** — nouvel onglet, et plus de préchargement (un PDF était rendu à chaque affichage de page) |
| cosmétique | Échantillon inexistant servi en HTTP 200 avec la page « introuvable » | Comportement de Next.js en diffusion progressive ; le contenu est correct — laissé |
| cosmétique | « 0 / 5 paramètres saisi » | **Corrigé** |
| cosmétique | Titre d'onglet générique sur la paillasse | **Corrigé** — « Analyse 13/26 », « Contrôle 13/26 », « Fiche client », « Facture »… |
| cosmétique | Échantillon clôturé : consigne de saisie encore affichée | **Corrigé** — « Résultats soumis — consultation en lecture seule » |

## 4. Ce que l'agent technicien a confirmé comme solide

Notation du laboratoire reconnue (1,2.10², < 10, Absence, Présence,
3(-2), 0(-1), 1,5 x 10^4) ; verdicts n / c / m / M calculés en direct avec
leur raison ; pire valeur retenue sur 3 répétitions ; « Dépassement » sur
valeur unique ; soumission bloquée tant qu'une répétition manque ; anomalie
sans note refusée ; isolation stricte tech1 / tech2 (écran et API) ;
échantillon clôturé en lecture seule ; indicateurs du tableau de bord
cohérents avec la base.

## 5. État laissé sur la production

Tout ce que la recette a créé a été supprimé ou désactivé : les deux clients
de test purgés (11 séries, 27 échantillons, 6 rapports, 3 factures, 11
e-mails simulés), compteurs de numérotation revenus à 0 / 0, type de
produit « TEST UI TYPE » désactivé, réglementation de test archivée,
fournisseurs, article de stock et équipement de test archivés, comptes de
test désactivés. 1 516 clients réels intacts.
