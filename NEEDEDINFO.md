# NEEDEDINFO.md — what we still need from the laboratory

> **Purpose.** One running register of every question, document and figure we
> need from Qualilab. It is filled in **as we go**: whenever a phase raises
> something only the lab can answer, it is added here — so the questions can be
> sent **in one batch** (end of phase, or monthly) instead of one email at a
> time.
>
> **Rules**
> - **Add, never delete.** When an item is answered, move it to §3 with the
>   date and the answer. That history is what stops the same question being
>   asked twice.
> - Each item says **why** we need it and **what it blocks** — an item nobody
>   can act on is not a question, it is noise.
> - Mark **🔴 blocking** only when work genuinely stops without it.
> - §2 is the copy-paste list to send. Keep it in French — it goes to the client.

---

## 1. Open items

### 🔴 Blocking — needed to finish Phase 3 (rapports, emails, alertes)

| # | What we need | Why | Blocks |
|---|---|---|---|
| 1 | **Les limites normatives officielles par paramètre** (UFC/g, UFC/100 mL…), en particulier E. coli, Salmonelles et Listeria monocytogenes | Conformity and the contamination alert are decided by comparing a result to its limit. We currently use provisional Moroccan (NM) values; only E. coli at 1.10² UFC/g is confirmed, taken from your alert email of 17/08 | Alerts, and the accuracy of every conformity verdict |
| 2 | **Envoi des emails** — trois choses, détaillées ci-dessous | Everything is built; only the delivery hop is missing | Real sending of reports and alerts |
| 3 | **Coordonnées légales définitives** : ICE, RC, RIB/IBAN, adresse exacte — et le **logo en haute définition** | They are printed on every official report and invoice. Our current values are placeholders | Official report and invoice |

#### Détail de l'item 2 — ce qu'il faut pour activer les emails

1. **Le domaine à utiliser pour l'expéditeur** — nous partons du principe que
   ce sera `qualilabinternational.com`, avec une adresse du type
   `no-reply@qualilabinternational.com`. À confirmer.
2. **Un accès aux DNS de ce domaine** — soit un accès à l'interface
   (OVH, Cloudflare, l'hébergeur actuel…), soit le contact de la personne qui
   les gère. Nous fournirons **3 enregistrements à ajouter** (SPF, DKIM, DMARC) :
   ils prouvent que nos envois viennent bien de vous, sans quoi les rapports
   partent en spam ou sont refusés. Ils ne changent rien à vos emails existants.
3. **Un compte chez le service d'envoi** (Resend) — création gratuite pour le
   volume du laboratoire ; nous pouvons le créer et vous le transférer, ou vous
   le créez et nous transmettez la clé.

Sans ces éléments, tout fonctionne déjà mais les envois sont **enregistrés dans
le journal sans être réellement expédiés**, et l'interface l'indique clairement.

### 🟠 Needed soon — Phase 3 / Phase 4

| # | What we need | Why | Blocks |
|---|---|---|---|
| 4 | **Les méthodes et formules de calcul** par paramètre (facteur de dilution, unités de rendu…) | To compute results from raw bench readings automatically | **Mechanism built (2026-08-27)**: each parameter carries a *facteur de calcul* (`/admin/parametres`) — the technician types the raw reading, the system computes and prints the final value. Their formulas are data entry |
| 5 | **Un modèle de rapport d'analyse** que vous utilisez aujourd'hui (PDF ou Word) | To reproduce your layout, mentions légales and signature block exactly | Report template |
| 6 | **Le texte de l'email** accompagnant un rapport (objet, message, signature) | Sent with every report | Email template |
| 7 | **Un modèle de feuille de paillasse** | Ours is built and printable — we want to compare it with the one your technicians already use | Bench sheet (working, to confirm) |
| 8 | **Les adresses email par client** (qui reçoit les rapports, qui reçoit les alertes) | A client can have several recipients; alerts often go to the quality contact *and* the direction | Real sending |
| 9 | **La liste des comptes utilisateurs** : nom, fonction, rôle | To create the real accounts and close the demo ones | Go-live |

### 🟢 Built, waiting only on you to switch on

| # | What | State |
|---|---|---|
| A | **Envoi réel des emails** | The full chain works and is journalised; every send is currently marked `SIMULE`. It becomes real the moment we have the DNS records (item 2) and the provider key |
| B | **Limites des alertes** | Alerts fire correctly against provisional Moroccan (NM) limits. **The editing screen exists** (`/admin/parametres`): entering your official figures (item 1) is data entry by the admin, audited, no development |
| C | **Logo sur les documents** (2026-08-27) | Upload screen ready in `/admin/entreprise` — the HD file (item 3) lands there and every report, invoice and bench sheet prints it; the styled text brand is the fallback meanwhile |
| D | **Reprise des clients de l'ancien système** (2026-08-27) | Import wizard ready in `/admin/import`: analyse → column mapping → dry-run → import, audited, nothing written before confirmation. Whatever CSV shape their export takes (item 18), the adaptation is a mapping, not code |

### 🟡 Decisions we need from you (no document required)

| # | Question | Why it matters |
|---|---|---|
| 10 | Un échantillon déclaré **non conforme à réception** doit-il quand même être analysé, ou être bloqué ? | **Both behaviours built (2026-08-27)** — a switch in `/admin/reglages`. Blocked = received and numbered but held until an ADMIN releases it to a technician. Their answer is one click |
| 11 | L'**alerte de contamination** doit-elle partir dès la validation technique, ou seulement après l'approbation de l'administrateur ? | **Both behaviours built (2026-08-27)** — same switch screen. Early alerts carry an anti-duplicate guard: the approval never re-sends what the validation already dispatched. Their answer is one click |
| 12 | Sur le **portail client**, que doit voir le client exactement : uniquement les rapports finaux, ou aussi l'avancement des analyses en cours et ses factures ? | Defines the portal's scope |

### 🔵 Later — Phases 6 to 8 (needed before those modules start)

| # | What we need | For |
|---|---|---|
| 13 | **Liste des équipements** à suivre en métrologie + calendrier d'étalonnage | Module Qualité |
| 14 | **Quels équipements** font l'objet d'un relevé de température, et à quelle fréquence / quels seuils | Module Qualité |
| 15 | **Périmètre des EIL** : quelles campagnes, quels organismes | Module Qualité |
| 16 | **Niveau de détail du stock** : produits suivis, unités, gestion des lots et péremptions ? | Module Achat & Stock — **built 2026-08-27 (hidden)**: movements already carry optional lot + péremption, their answer selects what to fill |
| 17 | **Liste des fournisseurs** et leurs conventions de paiement | Module Achat & Stock — **built 2026-08-27 (hidden)**: the list is data entry in `/magasin/fournisseurs` |
| 18 | **Export de la base existante** (clients, rapports, factures) — format et accès | Reprise de données |

---

## 2. Ready to send — current batch

*Copy this into an email. Update the date when you send it.*

> **Dernier envoi : (aucun encore)**

**Objet : Développement terminé — éléments nécessaires pour la mise en service — LIMS Qualilab**

Bonjour,

Le développement du système est arrivé à son terme : le cycle complet de
l'échantillon fonctionne (prélèvement, réception avec numérotation, saisie des
résultats, double validation), le rapport d'analyse PDF est généré et envoyé
automatiquement, les alertes de contamination sont opérationnelles, la
facturation se génère depuis les analyses validées, et le laboratoire dispose
d'écrans d'administration complets (utilisateurs, paramètres d'analyse,
catalogue, coordonnées).

Pour passer à la mise en service, il ne nous manque plus que des éléments de
votre côté :

**Pour activer l'envoi réel des emails (rapports + alertes) :**
1. Confirmation du domaine expéditeur (nous proposons
   `qualilabinternational.com`, avec une adresse du type `no-reply@...`).
2. Un accès aux DNS de ce domaine, ou le contact de la personne qui les gère —
   nous fournirons 3 enregistrements à ajouter (ils ne changent rien à vos
   emails actuels).
3. Un compte chez le service d'envoi (gratuit à votre volume) — nous pouvons le
   créer et vous le transférer.
   *En attendant, les envois sont enregistrés dans le journal sans partir.*

**Pour que les documents officiels soient exacts :**
4. Les **limites normatives officielles** par paramètre (E. coli, Salmonelles,
   Listeria en priorité) — un écran est prêt pour les saisir ; nous utilisons
   des valeurs marocaines usuelles en attendant.
5. Vos **coordonnées légales définitives** (ICE, RC, RIB/IBAN, adresse) et
   votre **logo en haute définition** — un écran est prêt pour les saisir.
6. Les **méthodes de calcul** par paramètre (pour le calcul automatique).

**Pour préparer la bascule :**
7. L'**export de votre base actuelle** (clients, rapports, factures), dans le
   format disponible.
8. La **liste des comptes utilisateurs** : nom, fonction, rôle.
9. Les **adresses email par client** (qui reçoit les rapports, qui reçoit les
   alertes).

**Trois décisions de votre part :**
10. Un échantillon **non conforme à réception** doit-il être analysé malgré
    tout, ou bloqué ?
11. L'**alerte de contamination** doit-elle partir dès la validation technique,
    ou après l'approbation de l'administrateur (fonctionnement actuel) ?
12. Sur le futur **portail client**, le client verra-t-il uniquement ses
    rapports, ou aussi l'avancement des analyses et ses factures ?

Dès réception de ces éléments, nous planifions avec vous la recette (tests par
vos équipes), la formation, et la mise en service officielle.

Bien cordialement,

---

## 3. Answered — archive

| Date | Question | Answer |
|---|---|---|
| 2026-08-18 | Règle exacte de la double validation | **Chaque** échantillon requiert le validateur **et** l'admin |
| 2026-08-18 | Format du code contrôle et du n° de série | Laissé à notre conception ; exigence : le préleveur ne doit jamais pouvoir connaître ou prévoir le numéro |
| 2026-08-18 | Normes à utiliser en attendant | Normes marocaines standard ; les valeurs officielles seront fournies en cours de projet |
| 2026-08-18 | Reprise des données existantes | Import seul, méthode définie quand le labo fournira les données |
| 2026-08-18 | Qui gère le stock | Un profil dédié — rôle `MAGASINIER` |
| 2026-08-18 | Journal interne sur la modification admin d'un rapport | Non, pas de trace |
| 2026-08-18 | Gestion des comptes du portail client | Créés et gérés par l'administrateur |
