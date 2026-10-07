# Portail client — spec (08/10/2026)

Confirmé par le client le 18/08 (PLAN Phase 8) : comptes `CLIENT` créés et
gérés par l'administrateur, pas d'inscription libre ; un espace en lecture
seule pour suivre ses échantillons et télécharger ses rapports. L'ancien
logiciel avait 456 comptes et 1 049 téléchargements de rapports.

## 1. Comptes

`User.clientId` (nullable, FK `Client`, `onDelete: SetNull`) : obligatoire
pour le rôle `CLIENT`, interdit pour les autres. `/admin/utilisateurs`
propose le rôle « Client (portail) » avec un sélecteur de client ; le
reste (mot de passe initial, désactivation) comme pour les autres comptes.
Un client archivé (ou fusionné) n'ouvre plus le portail.

## 2. Ce que voit un compte client (`/portail`)

Uniquement les échantillons de **son** client (`Sample.clientId`), jamais
d'un autre — chaque requête filtre par `session.user.clientId`, et toute
ressource d'un autre client répond 404.
- Tableau de bord : nombre d'échantillons reçus, en analyse, rapports
  disponibles, sur les 12 derniers mois.
- Liste : N° de contrôle, N° de série, site, désignation, lot, date de
  prélèvement, date de réception, état (« Reçu », « En analyse »,
  « Rapport disponible », « Annulé »), date d'envoi du rapport ; filtres :
  période, site, état, recherche ; 50 par page.
- Rapport PDF : seulement à l'état `RAPPORT_ENVOYE` (version courante ; les
  rapports amendés en tête de liste) ; journal `REPORT_DOWNLOADED` avec
  `portal: true`.
- Jamais : résultats avant l'envoi du rapport, prix et factures, noms du
  personnel en dehors du rapport, autres clients, écrans du laboratoire.
- « Mon compte » : changer son mot de passe.

## 3. Sécurité

Le rôle `CLIENT` n'accède qu'à `/portail` et aux routes `/api/portail/**`
et au PDF de ses rapports ; toute autre route lui répond 403. Tests :
l'accès croisé entre deux clients, les routes du laboratoire, un compte
`CLIENT` sans client.
