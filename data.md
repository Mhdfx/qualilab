Projet : Qualilab International — Système LIMS, Facturation et Module Préleveur
Je développe une application web fullstack pour Qualilab International, un laboratoire d'analyses spécialisé dans trois domaines : le contrôle qualité des produits alimentaires, la vérification de la potabilité et de la conformité bactériologique des eaux, et le contrôle des ambiances (surfaces de travail et hygiène des manipulateurs d'aliments).
L'objectif est de remplacer un processus actuellement manuel par un système digital complet qui gère tout le cycle de vie d'un échantillon : depuis sa création sur le terrain par un préleveur, jusqu'à la validation des résultats, la génération du rapport PDF, son envoi automatique au client par email, et enfin la facturation associée.
C'est un projet petit/moyen, pour un laboratoire de 1 à 10 utilisateurs simultanés. Il n'y a pas besoin de gérer du offline ni de la très grosse charge. La priorité est : fiabilité, traçabilité, et simplicité d'usage pour des utilisateurs non-techniques (techniciens de labo, préleveurs sur le terrain).
Stack technique imposée :

Next.js (App Router) en fullstack — un seul repo, pas de séparation frontend/backend
Tailwind CSS pour tout le style
PostgreSQL hébergé via Supabase
Prisma comme ORM
Supabase Auth pour l'authentification et la gestion des rôles (avec RLS activé, car les données sont sensibles : résultats sanitaires + données clients)
@react-pdf/renderer pour générer les rapports PDF
Resend pour l'envoi automatique d'emails transactionnels
Déploiement prévu sur Vercel

Les 3 blocs fonctionnels du système (tout dans la même app, web responsive) :

LIMS (cœur du système) : saisie des échantillons, génération automatique d'un code et numéro de série unique, attribution des paramètres d'analyse à effectuer, saisie des résultats par les techniciens, validation des résultats par un responsable qualité, génération du rapport PDF, base de données clients, envoi automatique du rapport par email au client concerné.
Facturation : génération automatique des factures liées aux échantillons traités et au client concerné, suivi du statut de paiement.
Module préleveur (terrain) : une interface web responsive simple, utilisée sur smartphone par les préleveurs pour saisir les infos de l'échantillon directement au moment du prélèvement. Le but est de gagner du temps : à l'arrivée au labo, on fait juste une vérification rapide des données au lieu d'une saisie complète. Pas besoin d'app native — juste du web responsive, en assumant que les préleveurs ont du réseau sur le terrain.

Les 7 rôles utilisateurs et ce qu'ils font :

Préleveur : crée l'échantillon sur le terrain (client, lieu, date/heure, type), génère le code, sélectionne les paramètres d'analyse demandés, voit l'historique de ses propres prélèvements.
Réceptionniste : reçoit l'échantillon au labo, vérifie juste les infos déjà saisies (pas de ressaisie), valide la conformité, attribue l'échantillon à un technicien.
Technicien : voit les échantillons qui lui sont attribués, saisit les résultats par paramètre, met à jour le statut (en cours / terminé / anomalie).
Validateur (responsable qualité) : vérifie les résultats soumis, valide ou rejette avec commentaire, déclenche la génération du PDF et l'envoi automatique au client.
Gestionnaire commercial : gère la base clients, suit le statut des échantillons par client, peut renvoyer un rapport manuellement.
Comptable : génère les factures automatiquement à partir des échantillons validés, suit les paiements, exporte les factures en PDF.
Admin : gère les utilisateurs et leurs rôles, configure les paramètres d'analyse disponibles, configure les templates de PDF et d'email, supervise tout le système.

Entités principales à modéliser dans Prisma :

Sample (échantillon) — avec code/numéro unique généré automatiquement, et un statut qui évolue : prélevé → reçu → en analyse → résultats saisis → validé → rapport envoyé
Client — infos de l'entreprise/client, historique
AnalysisParameter — liste configurable des paramètres d'analyse par catégorie (alimentaire / eau / ambiance)
Result — lié à un échantillon + un paramètre, saisi par le technicien
Report — le PDF généré après validation
Invoice — facture générée automatiquement à partir des échantillons validés d'un client
User — avec un rôle parmi les 7 listés ci-dessus

Par où commencer :

D'abord le schéma Prisma complet avec toutes les entités et leurs relations
Ensuite Supabase Auth + les 7 rôles + RLS policies
Ensuite le CRUD des échantillons (le cœur du système)
Puis la saisie/validation des résultats
Puis la génération PDF et l'envoi email
Puis la facturation
Enfin l'interface préleveur (qui réutilise en grande partie les mêmes composants, en version simplifiée)