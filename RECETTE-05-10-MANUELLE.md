# Recette navigateur manuelle — production, 5 octobre 2026

**Rapport 2 / 2.** Parcours fait à la main dans le navigateur, comme un
utilisateur du laboratoire, sur http://185.217.126.53, avec les comptes de
démonstration. Le rapport 1 (`RECETTE-05-10-AUTOMATIQUE.md`) couvre le
balayage automatique.

## 1. Le circuit complet, une visite de bout en bout

| Étape | Rôle | Ce qui a été fait | Résultat |
|---|---|---|---|
| Connexion | — | Mauvais mot de passe, puis pre1 | « Identifiants incorrects. », puis arrivée sur /preleveur ; déconnexion → /login ; page protégée après déconnexion → /login ; URL inconnue → « Page introuvable » |
| Nouvelle visite | pre1 | Client de test, interlocuteur, 3 lignes : aliment avec type « ABATS CRUS DE VOLAILLE… » (cherché par « abats »), surface 100 cm², mains ; faute de frappe « Cuisine centrle » | Le type coche ses 5 germes et met n = 5 ; « Vouliez-vous dire Cuisine centrale ? » corrige en un clic ; récapitulatif ; **série 7/26**, aucun N° de contrôle côté préleveur |
| Arrivée au labo | pre1 | Heure de fin avant le début, puis horaires corrects + 4 °C | Refus clair, puis « Enregistré. » ; protocole PDF réel (55 Ko) |
| Réception | recep1 | 7/26 en file avec la T° glacière pré-remplie ; 50 g → ligne forcée non conforme (motif obligatoire) ; 250 g ; heure d'arrivée dans le futur ; « Technicien pour toutes les lignes » | Règles d'acceptation en direct ; arrivée future refusée par le serveur ; **N° 13/26 à 15/26**, 7 étiquettes, étiquettes et protocole PDF |
| Paillasse | tech1 | 13/26 : Tab de R1 à R5, Absence ×5, un lot entre m et M, une unité au-dessus de M, une répétition laissée vide, « Anomalie » sans description | Verdicts Satisfaisant / Acceptable / Non satisfaisant en direct ; « 1 unité sur 5 non lue » et soumission bloquée ; anomalie refusée ; puis soumis. 15/26 (mains) saisi et soumis |
| Validation | valid1 | 13/26 : réglementation proposée, « Valider techniquement » ; 6/26 : « Renvoyer au technicien » sans motif puis avec motif | Validé, « 1 résultat non conforme… sans alerte de contamination » ; renvoi refusé sans motif, accepté avec |
| Approbation | admin | 13/26 « Approuver définitivement », « Renvoyer au client » ; 20/26 approuvé ; 15/26 (validé par l'admin lui-même) | **RAP-2026-00004**, envoi simulé, journal d'audit complet ; 15/26 : « Vous avez signé la validation technique : l'approbation finale revient à un autre administrateur », bouton absent |
| Rapport | — | PDF relu à l'image | En-tête réglementation avec la croix sous « Non satisfaisant », R1 … R5 par germe, unité entre m et M en bleu, dépassement en rouge, conclusion, trois signatures, une page |
| Dépôt | recep1 | « Nouveau dépôt » : client, déposant, avance 150 DH sans mode de paiement, T° à l'arrivée manquante, puis complet | « Indiquez le mode de paiement de l'avance. » ; « Température à l'arrivée obligatoire » ; **série 11/26, N° 21/26**, bon de réception et étiquettes PDF (bon relu à l'image : critères de recevabilité, avance, reste) |
| Facturation | compta1 | Client de test → 13/26 proposé ; « Ajouter 5 lignes » ; prix saisis ; TVA 20 % | **FAC-2026-0003** (972 DH TTC), PDF relu (montant en lettres, « PAYÉE » après « Marquer encaissée ») ; 13/26 n'est plus proposé |
| Clients | commercial1 | Fiche du client de test (synthèse, export, sites, rapports, factures) ; ICE invalide ; enregistrement ; nouveau client au même nom | « L'ICE doit comporter 15 chiffres. » ; retour à la fiche ; « Un client porte déjà cette raison sociale. » |
| Magasin | magasin1 | Article « TEST UI article » (seuil 5), entrée +10, sortie −3, historique ; fournisseur sans nom ; facture fournisseur vide | Niveau 10 puis 7, historique daté et signé ; « Le nom du fournisseur est obligatoire. » ; « Fournisseur invalide. » |
| Configuration | admin | Type « FARINE DE POISSONS » (quasi-doublon), « TEST UI TYPE » propre au client avec un critère E. coli n = 5, c = 2, m = 1.10², M = 1.10³ ; réglementation en double, archivage / rétablissement ; compte « zz » puis « zz-test-ui6 » ; compteurs : série à 5 | « Types existants très proches » + case de confirmation ; « 1 critère enregistré. » ; « Cette réglementation existe déjà. », compteurs 176 ↔ 177 ; « L'identifiant doit faire 3 à 30 caractères » ; **500 sur l'identifiant avec tiret (corrigé)** ; « Le numéro 11/26 est déjà attribué : le compteur ne peut pas descendre en dessous. » |
| Réactivation | admin | 14/26 annulée par un autre testeur : « Réactiver » sans motif puis avec | « Un motif est obligatoire pour cette action. », puis ligne de retour « Conforme » avec son N° |

## 2. Défauts trouvés à la main

| Gravité | Défaut | Sort |
|---|---|---|
| majeur | Création d'un compte dont l'identifiant contient un tiret (« zz-test-ui6 ») : HTTP 500 « Une erreur réseau est survenue » alors que l'écran annonce « lettres, chiffres, . _ - » | **Corrigé** — le tiret est accepté par la couche d'authentification ; un refus de cette couche devient un message 400 |
| majeur (hors application) | Les heures diffèrent d'une heure entre les pages rendues par le serveur et celles rendues par le navigateur (00:57 / 01:57), avec une erreur d'hydratation React | Le Maroc est revenu à l'heure GMT le 20/09/2026 (décret n° 2.26.530) ; le serveur a la donnée à jour, ce PC non. **Durci** : l'heure du laboratoire ne dépend plus des données de fuseau de l'appareil (affichage et saisies `datetime-local`). Reste à faire au laboratoire : mettre à jour Windows / Chrome sur les postes (voir `DEPLOY.md`) |
| mineur | Les liens vers les PDF étaient des liens Next.js : chaque affichage d'une page de visite faisait rendre un PDF inutilement | **Corrigé** — ancres simples, nouvel onglet |
| mineur | En-tête « VALIDATEUR · Dr. » : la civilité prise pour le prénom | **Corrigé** — « Nawal » |
| mineur | Badge « ADMINISTRATION » et titre d'onglet générique sur les pages de facturation et les fiches client | **Corrigé** (badge « Facturation », titres « Nouvelle facture », « Facture », « Fiche client »…) |
| à confirmer | Panneau « Comptes de démonstration » avec le mot de passe commun encore affiché sur la page de connexion de production | Étape de mise en service documentée (`DEPLOY.md` « Go-live ») : à faire le jour de la bascule, avec la création des vrais comptes |
| à confirmer | Salmonelles sur ABATS CRUS DE VOLAILLE : critère « Absence /1g », paramètre « /25 g » | Donnée du classeur → question Q40 au laboratoire |

## 3. Remarques d'usage (pas des défauts)

- Les listes de 1 518 clients sont des menus déroulants natifs sans
  recherche (visite, dépôt, facture) : utilisables, mais un champ de
  recherche serait plus confortable sur téléphone.
- Le récapitulatif de la visite ne rappelle pas le type de produit choisi.
- Une nouvelle ligne de visite hérite du lieu et des analyses de la ligne
  précédente (voulu) : le préleveur doit penser à corriger le lieu.
- Les 177 réglementations reprises de l'ancien logiciel contiennent des
  titres quasi identiques suffixés « (2) » … « (8) » (question Q38).
- Un rapport sans type de produit n'imprime pas la réglementation choisie
  (pas de verdict à imprimer) — à confirmer avec le laboratoire.
- L'archivage d'une réglementation ou d'un fournisseur est immédiat, sans
  confirmation (réversible par « Rétablir »).

## 4. Vérifié après le second déploiement

Les correctifs de ce rapport sont en production : lecture illisible bloquée
sur la paillasse (message visible, soumission grisée), feuille de paillasse
avec R1 … R5 et critères, titres d'onglet, prénom, liens PDF en ancres
simples, et la création d'un compte avec tiret.

## 5. État laissé sur la production

Identique au rapport 1 : clients de test purgés, compteurs à 0 / 0, objets
de test archivés ou désactivés, 1 516 clients réels intacts.
