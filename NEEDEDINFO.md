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
| 4 | **Les méthodes et formules de calcul** par paramètre (facteur de dilution, unités de rendu…) | To compute results from raw bench readings automatically | Automatic calculation (manual entry works without it) |
| 5 | **Un modèle de rapport d'analyse** que vous utilisez aujourd'hui (PDF ou Word) | To reproduce your layout, mentions légales and signature block exactly | Report template |
| 6 | **Le texte de l'email** accompagnant un rapport (objet, message, signature) | Sent with every report | Email template |
| 7 | **Un modèle de feuille de paillasse** | Ours is built and printable — we want to compare it with the one your technicians already use | Bench sheet (working, to confirm) |
| 8 | **Les adresses email par client** (qui reçoit les rapports, qui reçoit les alertes) | A client can have several recipients; alerts often go to the quality contact *and* the direction | Real sending |
| 9 | **La liste des comptes utilisateurs** : nom, fonction, rôle | To create the real accounts and close the demo ones | Go-live |

### 🟢 Built, waiting only on you to switch on

| # | What | State |
|---|---|---|
| A | **Envoi réel des emails** | The full chain works and is journalised; every send is currently marked `SIMULE`. It becomes real the moment we have the DNS records (item 2) and the provider key |
| B | **Limites des alertes** | Alerts fire correctly against provisional Moroccan (NM) limits. Replacing them with your official figures (item 1) needs no development |

### 🟡 Decisions we need from you (no document required)

| # | Question | Why it matters |
|---|---|---|
| 10 | Un échantillon déclaré **non conforme à réception** doit-il quand même être analysé, ou être bloqué ? | Today he is received, flagged and analysed anyway. Blocking him is a one-line change — but it is your call |
| 11 | L'**alerte de contamination** doit-elle partir dès la validation technique, ou seulement après l'approbation de l'administrateur ? | A contamination is urgent; waiting for the second signature may delay it by hours |
| 12 | Sur le **portail client**, que doit voir le client exactement : uniquement les rapports finaux, ou aussi l'avancement des analyses en cours et ses factures ? | Defines the portal's scope |

### 🔵 Later — Phases 6 to 8 (needed before those modules start)

| # | What we need | For |
|---|---|---|
| 13 | **Liste des équipements** à suivre en métrologie + calendrier d'étalonnage | Module Qualité |
| 14 | **Quels équipements** font l'objet d'un relevé de température, et à quelle fréquence / quels seuils | Module Qualité |
| 15 | **Périmètre des EIL** : quelles campagnes, quels organismes | Module Qualité |
| 16 | **Niveau de détail du stock** : produits suivis, unités, gestion des lots et péremptions ? | Module Achat & Stock |
| 17 | **Liste des fournisseurs** et leurs conventions de paiement | Module Achat & Stock |
| 18 | **Export de la base existante** (clients, rapports, factures) — format et accès | Reprise de données |

---

## 2. Ready to send — current batch

*Copy this into an email. Update the date when you send it.*

> **Dernier envoi : (aucun encore)**

**Objet : Éléments nécessaires pour la suite du développement — LIMS Qualilab**

Bonjour,

Le développement avance bien : le cycle complet de l'échantillon est désormais
opérationnel (prélèvement, réception avec numérotation, saisie des résultats,
double validation). Pour poursuivre sur les rapports, les emails et les alertes
de contamination, nous aurions besoin des éléments suivants :

**Prioritaire (bloquant) :**
1. Les **limites normatives officielles** par paramètre, en particulier E. coli,
   Salmonelles et Listeria monocytogenes.
2. Pour activer l'envoi réel des emails : **confirmation du domaine
   expéditeur**, un **accès aux DNS** (ou le contact de la personne qui les
   gère) pour y ajouter 3 enregistrements d'authentification, et un **compte
   chez le service d'envoi**. Tout le reste est déjà opérationnel — les envois
   sont actuellement enregistrés sans être expédiés.
3. Vos **coordonnées légales définitives** (ICE, RC, RIB/IBAN, adresse) et votre
   **logo en haute définition**.

**Souhaitable rapidement :**
4. Les **méthodes de calcul** par paramètre.
5. Un **modèle du rapport d'analyse** que vous utilisez aujourd'hui.
6. Le **texte de l'email** qui accompagne un rapport.
7. Un **modèle de feuille de paillasse**.
8. Les **adresses email par client** (rapports / alertes).

**Trois décisions de votre part :**
9. Un échantillon **non conforme à réception** doit-il être analysé malgré tout,
   ou bloqué ?
10. L'**alerte de contamination** doit-elle partir dès la validation technique,
    ou après l'approbation de l'administrateur ?
11. Sur le **portail client**, le client verra-t-il uniquement ses rapports, ou
    aussi l'avancement des analyses et ses factures ?

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
