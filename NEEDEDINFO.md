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
| 13 | **Liste des équipements** à suivre en métrologie + calendrier d'étalonnage | Module Qualité — **built 2026-08-27**: the register is data entry in `/qualite/metrologie` (périodicité par équipement, certificats) |
| 14 | **Quels équipements** font l'objet d'un relevé de température, et à quelle fréquence / quels seuils | Module Qualité — **built 2026-08-27**: bounds per equipment, readings board with HORS PLAGE flags; their list = data entry |
| 15 | **Périmètre des EIL** : quelles campagnes, quels organismes | Module Qualité — **built 2026-08-27**: campaign register in `/qualite/eil`; their campaigns = data entry |
| 16 | **Niveau de détail du stock** : produits suivis, unités, gestion des lots et péremptions ? | Module Achat & Stock — **built 2026-08-27 (hidden)**: movements already carry optional lot + péremption, their answer selects what to fill |
| 17 | **Liste des fournisseurs** et leurs conventions de paiement | Module Achat & Stock — **built 2026-08-27 (hidden)**: the list is data entry in `/magasin/fournisseurs` |
| 18 | **Export de la base existante** (clients, rapports, factures) — format et accès | Reprise de données |

---

## 1b. Questions issues de l'analyse du 13/09/2026 (ancienne base + formulaires papier)

À poser au laboratoire avant d'ouvrir les chantiers de mise à niveau (PLAN.md,
Phase 9). Numérotées Q1–Q20 ; les réponses deviennent des données ou des
réglages, pas des développements.

| # | Question | Ce que la réponse décide |
|---|---|---|
| Q1 | Le préleveur saisit-il le protocole sur site (téléphone) ou au retour depuis le papier ? La signature de l'interlocuteur reste-t-elle sur papier ? | Écran mobile vs desktop du protocole ; signature tactile ou non |
| Q2 | Autres aires que 100 cm² pour les surfaces ? Le nom des employés prélevés figure-t-il sur le rapport ? | Champ aire ; protection des données |
| Q3 | Une règle de recevabilité en défaut bloque-t-elle la réception ou ouvre-t-elle une non-conformité ? Bornes de chaîne du froid ? | Réglage LabSettings |
| Q4 | Encaissez-vous des avances au comptoir, sous quelle forme ? | Bloc avance + reçu |
| Q5 | Règle à trois classes : ≤ m / entre m et M / > M, ou < 3m / 3m–10m / > M ? Utilisez-vous c ? | Moteur de critères |
| Q6 | Parmi les 634 types de produits, lesquels garder ? Quels clients ont des critères propres ? | Reprise du catalogue |
| Q7 | Portée d'accréditation par paramètre et matrice ; mention à imprimer ; écriture des unités | Catalogue et rapport |
| Q8 | Délais contractuels par famille de paramètres ; jours ouvrés | Échéances et retards |
| Q9 | Deux boîtes lues ? Moyenne pondérée ISO 7218 ? Volume ensemencé par paramètre ? Seuil de détection imprimé ? | Calcul du résultat final |
| Q10 | Imprimer les n valeurs ou seulement la conclusion ? Feuille papier conservée ou saisie sur tablette ? | Rapport et paillasse |
| Q11 | Un paramètre non effectué est-il facturé ? | Facturation |
| Q12 | Pourquoi 94 000 dévalidations dans l'ancien logiciel : corrections par lots ou résultats tardifs ajoutés après coup ? | Validation par paramètre ou par échantillon |
| Q13 | Qui peut amender, forcer un verdict, annuler ? Le rapport amendé garde-t-il son numéro avec suffixe ? | Droits et numérotation |
| Q14 | Fournir trois rapports réels récents, les modèles des grands comptes, le texte d'e-mail, les références/versions de tous les documents, le logo d'accréditation et les cachets | Maquette du rapport, cartouches |
| Q15 | Signataires autorisés et délégués « par ordre », titre exact à imprimer | Comptes et signatures |
| Q16 | Le forfait mensuel couvre-t-il un maximum d'échantillons ? Liste du mois sur la facture ? Causes des 264 avoirs de 2025 ? | Facturation forfaitaire |
| Q17 | En janvier, la numérotation repart-elle à 1/27 ? Une facture annulée garde-t-elle son numéro ? | Compteurs |
| Q18 | Que contient « N° de factures » sur le protocole ? | Référence client sur la visite |
| Q19 | Date de bascule, durée de cohabitation avec l'ancien logiciel, sort des ≈ 8 000 dossiers en cours | Plan de bascule |
| Q20 | Le partage des PDF contient-il tous les rapports depuis 2017 ? Années d'historique sur le portail ? Factures visibles sur le portail ? | Reprise de l'historique, portail |
| Q21 | Le N° de série doit-il être **réservé dès l'ouverture** de la visite sur le téléphone (il apparaît alors avant l'enregistrement, mais une visite abandonnée consomme un numéro) ou **attribué à l'enregistrement** (affiché ensuite, aucun trou dans la séquence) ? | Formulaire « Nouvelle visite » (retour du 14/09, point 1) |
| Q22 | Sur le protocole, « Prélèvement effectué par … Fonction … » : la fonction est-elle celle du compte (Préleveur, Technicien…) ou un intitulé libre par personne (ex. « Technicienne préleveuse ») ? Un préleveur peut-il saisir une visite au nom d'un collègue (tablette partagée) ? | Comptes, formulaire (retour du 14/09, point 4) |
| Q23 | Au-delà de 26 unités, comment nommer les unités sur les étiquettes et la feuille de paillasse : lettres AA, AB… ou numéros 01…50 ? Un même échantillon de 50 unités est-il courant (histamine, autre) ? | Étiquettes, paillasse (retour du 14/09, point 8) |
| Q24 | Les cases « Analyses à effectuer : microbiologiques / physico-chimiques » en bas du protocole : cocher « physico-chimie » sans ligne physico-chimique signifie-t-il que la réception ajoute les analyses, ou qu'une ligne doit exister ? Qui décide du panel physico-chimique quand il n'est pas au catalogue ? | Formulaire, réception (retour du 14/09, point 9) |
| Q25 | Fichier des critères (14/09) : « 1.102 » se lit bien 1·10² et « 1.5.106 » 1,5·10⁶ ? Que valent les deux « 1.8 » (céréales pour enfants, coliformes) ? Quand m et M sont donnés sans c, la lecture est-elle « m cible, M plafond » ? | Critères m/M (`CRITERES.md`) |
| Q26 | Chaque type liste l'ancienne et la nouvelle version de norme (6579-1:2017 et :2021, 4833-1:2014 et :2023…) : laquelle est en vigueur, depuis quand, et faut-il imprimer la version en vigueur à la date d'analyse ? | Normes datées |
| Q27 | Les 131 types du fichier sont-ils la liste complète et à jour (l'ancienne base en compte 634) ? À quel client appartient chacun des 35 types nommés d'après un client ? | Catalogue des types de produits |
| Q28 | Les mots exacts du rapport pour Satisfaisant / Acceptable / Non satisfaisant, et le rapport imprime-t-il les cinq valeurs ou seulement le verdict (cf. Q10) ? | Échelle de conclusion, rapport |
| Q29 | Règle de passage de la lecture brute (« 0(-1) », dilution) à la valeur finale et au « < seuil » (cf. Q9) ; comment sont lues les deux boîtes B1/B2 ? | Résultats par unité |
| Q25 → **implémenté par défaut** (18/09) : « 1.102 » = 1·10², « 1.5.106 » = 1,5·10⁶ ; les deux « 1.8 » sont **refusés à l'import** et listés à l'écran ; m et M sans c ⇒ aucune tolérance. Le laboratoire tranche, puis corrige le classeur ou la grille. | | |
| Q26 → **implémenté par défaut** (18/09) : la version la plus récente de chaque norme est « en vigueur » ; l'ancienne reste en base. `/admin/normes` permet d'en changer et de dater. Le rapport imprime la version sous laquelle le résultat a été lu. | | |
| Q28 → **implémenté par défaut** (18/09) : quatre phrases modifiables dans `/admin/reglages` → Échelle de conclusion ; le rapport imprime les cinq lectures A…E **et** le verdict. | | |
| Q29 → **implémenté par défaut** (18/09) : « 3(-2) » = 3 × 10² = 300, « 0(-1) » = « < 10 », « < x » compte comme 0, le facteur de dilution du paramètre multiplie la lecture. | | |
| Q38 | *(à envoyer — voir `RETOUR-LABO-30-09.md` ; les 175 textes sont importés dans `/admin/reglementations`, 13 doublons de l'ancien logiciel suffixés « (2) », « (3) »… à fusionner par le laboratoire)* **Réglementation par échantillon.** L'ancien logiciel contient 176 sources réglementaires (arrêté conjoint 624-04 du 08/04/2004, Règlement UE 2073/2005, FCD, critères du Luxembourg, canadiens, NM 03.7.001, critères client…) et en rattache une à chaque type de produit. Nous proposons de reprendre cette liste telle quelle, le validateur technique choisissant la réglementation de chaque échantillon (proposée d'après le type et le dernier choix pour ce produit). Cette liste est-elle à jour ? | Rapport, validation (réponse Q32) |
| Q39 | *(défauts appliqués le 01/10 : le classeur l'emporte, les types inutilisés depuis 2025 importés inactifs)* **Les 634 types de l'ancien logiciel.** Quand un type existe à la fois dans l'ancien logiciel et dans le classeur de critères de septembre, quels critères gardent-on : ceux du classeur (plus récents, notre proposition) ou ceux de l'ancien logiciel ? Et les 411 types non utilisés depuis 2025 : repris actifs ou archivés ? | Catalogue (réponse Q33) |
| Q30 | Facturation : parmi les sept modèles d'impression de l'ancien logiciel (par paramètres groupés, par paramètres et produit, par paramètres par produit, par échantillon, par échantillon et nom de produit, sites au forfait, forfaits), lesquels sont utilisés et pour quels clients ? Un PDF de chacun ; sens de « avec remise », « forfaits / mois », « INTSTAT » | Facturation (chantier 5) |

Retour du laboratoire du 14/09 sur l'écran « Nouvelle visite » (neuf points,
analysés dans `WORKFLOW.md` §13, traités par la tranche 1b) : tout existe
dans les données et sur le PDF, mais le formulaire doit reprendre le
protocole papier champ par champ, sur un seul écran ; Q21–Q24 fixent les
quatre choix qui restent au laboratoire.

Précisions du 13/09 tirées de la lecture du protocole rempli (elles sont
prises comme défauts dans `WORKFLOW.md`, à confirmer avec Q1–Q4) : les
températures sont saisissables sur toute nature (une main prélevée porte
« T°p 25 °C ») ; la quantité du protocole est un nombre d'unités (« 01 »),
les grammes et litres servent au bon de réception et aux règles de
recevabilité ; la signature de l'interlocuteur reste sur papier, le
préleveur photographie la feuille signée depuis le téléphone.
| Q40 | Salmonelles sur « ABATS CRUS DE VOLAILLE AUTRES QUE LE FOIE GRAS… » : le critère repris du classeur dit « Absence /1g » alors que le paramètre est lu « /25 g ». Laquelle des deux prises d'essai doit figurer sur la paillasse et le rapport ? (même question pour tout type dont l'unité du critère diffère de celle du paramètre) | Critères (chantier 2) |

| Q41 | Programme d'analyse : « les nombres » = unités à lire, prise d'essai et dilutions ? Les N° de contrôle restent-ils attribués à la réception ? | Programme (`PROGRAMME.md`) |
| Q42 | Un même échantillon peut-il être réparti entre plusieurs techniciens (micro à l'un, chimie à l'autre) ? Si oui, qui soumet à la validation : le dernier qui termine ? | Programme (`PROGRAMME.md`) |
| Q43 | Des types repris de l'ancien logiciel n'ont **aucun critère** (ex. « PLATS CUISINÉS-VOLAILLES ») : la fiche de programme les propose sans tableau n / c / m / M et le rapport n'imprime alors ni critère ni verdict. Quels types doivent être complétés avant le go-live, et avec quels critères ? | Critères (chantier 2) — `RECETTE-06-10-PARCOURS.md` §3 |
| Q44 | Un échantillon jugé sans critère (seulement une limite du catalogue) n'imprime pas la ligne « Réglementation en vigueur », même si le validateur en a choisi une. Faut-il l'imprimer quand même, sans la croix Satisfaisant / Acceptable / Non satisfaisant ? | Rapport — `RECETTE-06-10-PARCOURS.md` §3 |
| Q45 | Sites : rattacher les 426 sites de l'ancien logiciel à leurs 36 clients (McDonald's 84, Rezoroute 77, Sodexo 55…) et archiver les « clients » créés pour chaque site à l'import ? Rapports et factures par site ? | Clients — `RETOUR-LABO-06-10.md` §2.1 |
| Q46 | « Service vétérinaire » : le retirer aussi du dépôt au comptoir (11 % des échantillons de l'ancien logiciel) ? Le « Contrôle officiel » doit-il encore exister ? | Série — `RETOUR-LABO-06-10.md` §2.2 |
| Q47 | Sur une ligne aliment, eau ou air, retirer le champ facultatif « Surface prélevée » (doublon de « Désignation ») ? | Visite — `RETOUR-LABO-06-10.md` §2.4 |
| Q48 | Micro et physico-chimie cochées sur un échantillon : deux N° de contrôle et deux rapports, comme dans l'ancien logiciel ? | Visite — `RETOUR-LABO-06-10.md` §2.5 |
| Q49 | Natures fines (cosmétiques, compléments, nettoyage, huiles, sensorielle) une fois la liste retirée du préleveur : choisies par la réception ou le responsable des paramètres ? | Visite / programme — `RETOUR-LABO-06-10.md` §2.5 |
| Q50 | Air : durée fixe de 30 min ? volume aspiré pour le biocollecteur ? paramètres d'air et unités (UFC/boîte, UFC/m³) à ajouter au catalogue (aucun aujourd'hui) ? | Visite / catalogue — `RETOUR-LABO-06-10.md` §2.6 |

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
| 2026-09-29 | Q25 — notation des limites | « 1.102 » = 1·10², « 1.5.106 » = 1,5·10⁶ ; les deux « 1.8 » : « vous pouvez enlever cette catégorie de critère » (déjà écartées à l'import) |
| 2026-09-29 | Q25 — m et M sans c | Un critère sans m/M est une seule valeur à ne pas dépasser ; c = nombre de répétitions tolérées au-dessus de la limite. L'exemple donné contredit la lecture réglementaire → Q31 |
| 2026-09-29 | Q10 — moins d'unités que le plan | Pas d'interprétation sur le rapport ; interprétation non officielle dans le corps de l'e-mail (acceptable entre m et M) |
| 2026-09-29 | Q26 — versions de norme | Toujours la dernière ; modifier une norme ne touche pas les anciens rapports (déjà le cas) |
| 2026-09-29 | Q27 — les 131 types | Question non comprise → Q33 ; ils veulent ajouter / retirer des types facilement, avec un correcteur contre les doublons |
| 2026-09-29 | Q28 — mots de la conclusion | Un tableau Satisfaisant (< m) / Acceptable (m < X < M) / Non satisfaisant (> M) sous le texte de la réglementation en vigueur ; toujours une page par échantillon |
| 2026-09-29 | Q10 — imprimer chaque unité | Oui : une colonne par répétition, R1 … Rn |
| 2026-09-29 | Q29 — dilution | « 3(-2) » = 300, « 0(-1) » = « < 10 », le facteur du paramètre multiplie la lecture (déjà le cas) |
| 2026-09-29 | Q23 — au-delà de 26 unités | Possible et peut-être courant : aucune limite |
| 2026-09-29 | Q21 — N° de série | Attribué à l'enregistrement, jamais visible du préleveur avant (déjà le cas) |
| 2026-09-29 | Q22 — comptes des préleveurs | Un compte par préleveur, pas de partage, pour la traçabilité : pas de saisie au nom d'un collègue |
| 2026-09-29 | Non-conforme à réception | Au cas par cas : analysé malgré tout ou détruit ; mention sur le bon de réception seulement |
| 2026-09-30 | Q31 — la règle de c | « Acceptable, et non satisfaisant si 2 au-dessus de M. Si 2 sont entre m et M (deux valeurs distinctes) : acceptable ; plus de 2 : non satisfaisant. » ⇒ plan à 3 classes = lecture réglementaire (déjà le cas) ; limite unique (m = M ou une seule limite) : jusqu'à c unités au-dessus ⇒ **Acceptable**, au-delà ⇒ non satisfaisant (à implémenter) |
| 2026-09-30 | Q32 — réglementation en vigueur | « Cela dépend de l'échantillon ; le validateur technique doit avoir la main pour sélectionner la réglementation pour l'échantillon les premières fois » ⇒ choix par échantillon à la validation technique → Q38 |
| 2026-09-30 | Q33 — les 131 types | « Garde 634 et on peut les modifier » ⇒ reprendre les 634 types de l'ancien logiciel avec leurs critères, modifiables → Q39 |
| 2026-09-30 | Q34 — types au nom d'un client | « Ce sont des familles pour faciliter les paramétrages à l'interne ; le client ne le voit pas sur le rapport ni sur le protocole » ⇒ visibles pour tous, **jamais imprimés** |
| 2026-09-30 | Q35 — échantillon détruit | Non facturé ; **le client est informé** |
| 2026-09-30 | Q36 — nom des répétitions | R1, R2, R3 partout, étiquettes comprises |
| 2026-09-30 | Q37 — N° BC | Oui, c'est le N° de série (déjà le cas) |
| 2026-09-29 | Moment de l'alerte | Après la validation technique, bien avant l'approbation finale, au format de leur exemple |
| 2026-09-29 | *Nouveau* — exploitation | Résumé par client sur une période, exportable en Excel ; recherche par client, date, type d'analyse |
