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
| Q43 | Des types repris de l'ancien logiciel n'ont **aucun critère** (ex. « PLATS CUISINÉS-VOLAILLES ») : la fiche de programme les propose sans tableau n / c / m / M et le rapport n'imprime alors ni critère ni verdict. Quels types doivent être complétés avant le go-live, et avec quels critères ? | Critères (chantier 2) — `RECETTE-06-10-PARCOURS.md` §3 |
| Q44 | Un échantillon jugé sans critère (seulement une limite du catalogue) n'imprime pas la ligne « Réglementation en vigueur », même si le validateur en a choisi une. Faut-il l'imprimer quand même, sans la croix Satisfaisant / Acceptable / Non satisfaisant ? | Rapport — `RECETTE-06-10-PARCOURS.md` §3 |
| Q45 | Sites : rattacher les 426 sites de l'ancien logiciel à leurs 36 clients (84, 77, 55 sites pour les trois plus grands…) et archiver les « clients » créés pour chaque site à l'import ? Rapports et factures par site ? | Clients — `RETOUR-LABO-06-10.md` §2.1 |
| Q46 | « Service vétérinaire » : le retirer aussi du dépôt au comptoir (11 % des échantillons de l'ancien logiciel) ? Proposé : oui — « Contrôle officiel » disparaît avec le nouveau cadre (07/10). | Série — `RETOUR-LABO-06-10.md` §2.2 |
| Q47 | Sur une ligne aliment, eau ou air, retirer le champ facultatif « Surface prélevée » (doublon de « Désignation ») ? | Visite — `RETOUR-LABO-06-10.md` §2.4 |
| Q48 | Micro et physico-chimie cochées sur un échantillon : deux N° de contrôle et deux rapports, comme dans l'ancien logiciel ? | Visite — `RETOUR-LABO-06-10.md` §2.5 |
| Q49 | Natures fines (cosmétiques, compléments, nettoyage, huiles, sensorielle) une fois la liste retirée du préleveur : choisies par la réception ou le responsable des paramètres ? | Visite / programme — `RETOUR-LABO-06-10.md` §2.5 |
| Q50 | Air : durée fixe de 30 min ? volume aspiré pour le biocollecteur ? paramètres d'air et unités (UFC/boîte, UFC/m³) à ajouter au catalogue (aucun aujourd'hui) ? | Visite / catalogue — `RETOUR-LABO-06-10.md` §2.6 |
| Q51 | Ligne Surface : la désignation (« Planche verte ») reste et « État de la surface » (Aseptique / En cours de travail / Nettoyé) s'ajoute en choix obligatoire — c'est bien la lecture ? | Visite — `RETOUR-LABO-06-10.md` §2.4 |
| Q52 | Cadre (Autre / Devis validé / BC / Convention) : valeur par défaut (aucune ou celle de la dernière visite du client) ? Le N° du BC ou du devis va-t-il dans « Référence client » ? | Série — `RETOUR-LABO-06-10.md` §2.8 |
| Q53 | Sites : 75 noms de site douteux (même nom chez plusieurs clients, ex. une ville) et 5 sites dont le client parent existe en double n'ont rien archivé ; faut-il les rattacher à la main depuis la fiche client, ou fusionner les clients en double ? (liste dans l'analyse de l'import, `/admin/import`) | Clients — `RETOUR-LABO-06-10.md` §6 |
| Q54 | Clients en double : valider le fichier `doublons-clients.xlsx` (colonne « Décision du labo ») — 74 fusions, 109 clients facturés à lier, 14 sites, 27 cas à trancher. Un client facturé (franchisé) doit-il recevoir les rapports, les factures, ou les deux ? | Clients — `RETOUR-LABO-06-10.md` §7 |
| Q55 | Numérotation aveugle : les étiquettes n'affichent plus le client ni le site (08/10). La feuille de paillasse imprime encore « Série NN · client » : faut-il l'enlever aussi ? | Paillasse — `RETOUR-LABO-06-10.md` §9.4 |
| Q56 | Physico-chimie des surfaces / mains / air : quelles analyses (et unités) ajouter au catalogue ? Aucune aujourd'hui : ces échantillons se créent et se réceptionnent mais ne se programment pas encore (complète Q50). | Catalogue — `RETOUR-LABO-06-10.md` §9.2 |
| Q64 | Réception — règle (1) : une réponse par échantillon (actuel), ou un bouton « tous exploitables » par série ? Un échantillon non exploitable : « Détruire » par défaut ? | Réception — règle (1) — **sans réponse le 12/10**, toujours ouverte |

> **Q57–Q66 : réponses du laboratoire du 12/10** (`RETOUR-LABO-06-10.md` §12) — Q57, Q58, Q59, Q60, Q61, Q63, Q65 et Q66 répondues, archivées au §3 ; Q62 (histamine) laissée en suspens par le laboratoire et Q64 sans réponse restent ci-dessus ; les suites sont Q99–Q105.

Analyse des écarts du 10/10 (`RETOUR-LABO-06-10.md` §11) : chaque question
ci-dessous a reçu une **valeur par défaut déjà construite** (indiquée dans la
colonne de droite), modifiable sans développement quand c'est un réglage. Les
questions Q1–Q66 encore ouvertes qu'elles complètent sont citées.

| # | Question | Ce que la réponse décide (défaut construit le 10/10) |
|---|---|---|
| Q67 | **C1 — délai prélèvement → arrivée au laboratoire.** Quel délai maximal par type : aliments en microbiologie, eaux en microbiologie (Légionelles, Pseudomonas…), surfaces et mains, air, physico-chimie ? Un délai dépassé rend-il l'échantillon non conforme, ou seulement « à vérifier » ? | Réglages « Contrôles complémentaires (hors bon) ». Défaut : 24 h en microbiologie, aucun en physico-chimie, dépassement = « à vérifier » (interrupteur « Délai dépassé = non conforme » éteint) |
| Q68 | **C1 — dépôt au comptoir.** Faut-il toujours demander au client l'heure de prélèvement ? Laissée vide, le contrôle affiche « Heure de prélèvement non déclarée » (à vérifier) : est-ce le bon traitement ? | Défaut : « Prélevé le » vide au départ, avec une invite à demander l'heure au client ; vide = à vérifier |
| Q69 | **C2 — température de transport** (complète Q63). Bornes par classe : réfrigéré 0–8 °C, eau en microbiologie ≤ 8 °C, congelé ≤ −15 °C ? Classe par défaut : réfrigéré pour les aliments, surfaces, mains et eaux en microbiologie ; aucune pour l'air, l'eau en physico-chimie et « Autre » — est-ce juste ? Une glacière au-dessus de 8 °C met-elle toute la série « à vérifier » ? Un thermomètre étalonné dédié est-il utilisé à la réception (il serait noté sur la série) ? | Réglages (bornes) ; jamais un refus, toujours « à vérifier » ; origine de la mesure : glacière, mesurée sur l'échantillon, flacon témoin |
| Q70 | **C3 / C4 / C5 — emballage et identification.** Les critères d'emballage par type sont-ils justes (aliment : emballage d'origine fermé ou sachet stérile ; surface et mains : écouvillon dans son tube avec diluant ; air : boîte fermée, gélose intacte ; eau en microbiologie : flacon stérile, au thiosulfate si l'eau est traitée) ? Un contenant abîmé ou un échantillon mal identifié : non conforme, ou « à vérifier » ? | Défaut : réponse Oui / Non obligatoire par échantillon ; « Non » = non conforme, motif Emballage ou Identification |
| Q71 | **Justification d'une acceptation** (complète Q63, Q64). Accepter conforme un échantillon dont une ligne est « à vérifier » exige aujourd'hui une « Observation de réception » écrite : quantité non pesée (règles 2 à 5), heure de prélèvement non déclarée, délai dépassé (toute visite reçue le lendemain), température hors plage, DLC dépassée. Lesquelles de ces lignes doivent rester de simples avertissements, sans observation obligatoire ? | Défaut : observation obligatoire pour toute ligne « à vérifier » acceptée (1 000 caractères), imprimée sur le bon |
| Q72 | **C7 — DLC dépassée** (aliments). Un aliment reçu après sa DLC est un avertissement ; s'il est déclaré non conforme, le motif proposé est « Autre » avec « DLC dépassée le … ». Voulez-vous un motif codé dédié, ou une non-conformité automatique ? | Défaut : avertissement seulement (les essais de fin de vie restent possibles) |
| Q73 | **C6 — protocole signé par l'interlocuteur** (visites). Sans photo jointe, la réception peut indiquer « Protocole papier signé reçu ? » Oui / Non ; « Non » s'affiche en orange sans bloquer. Faut-il bloquer, imprimer une mention sur le rapport, ou l'appliquer aussi aux dépôts ? La photo du protocole est visible du préleveur (ses visites), de la réception, du validateur, du gestionnaire commercial et de l'administrateur, jamais du technicien, du responsable des paramètres ni du comptable : à confirmer | Défaut : facultatif, avertissement seulement, visites uniquement |
| Q74 | **Avis écrit au client** (complète Q35). Aujourd'hui le client n'est prévenu que d'une destruction. Faut-il lui écrire quand un échantillon de la visite n'est jamais arrivé (« Non reçu au laboratoire »), quand un échantillon est mis « en attente du client », ou un seul e-mail par série listant toutes les non-conformités (analysé, en attente, détruit, non reçu) ? | Défaut : aucun envoi en dehors de la destruction |
| Q75 | **Accord du client pour analyser un non-conforme** (ISO 17025 §7.4.3). Qui peut accepter au nom du client (l'interlocuteur du protocole ?) ? Un accord permanent dans la convention ou le devis suffit-il ? L'enregistrement de l'accord doit-il être obligatoire ? Combien de temps attendre la réponse avant de détruire ? Quand le client demande lui-même la destruction, faut-il aussi enregistrer son accord ? | Défaut : accord facultatif (nom, canal, date-heure, note) ; interrupteur « Accord du client obligatoire pour analyser un non-conforme » éteint ; aucun délai automatique |
| Q76 | **Libérer un échantillon « en attente du client »** : la réceptionniste et l'administrateur, comme construit ? Les autres blocages (échantillon détruit puis réactivé) restent réservés à l'administrateur | Défaut : réception + administrateur ; aucun technicien n'est attribué : l'échantillon libéré repasse par la programmation, puis rejoint « À prendre » (prise en charge libre du 13/10, `PROGRAMME.md` §10) |
| Q77 | **Réserve sur le rapport** (complète la décision du 29/09, point 14). Pour un échantillon reçu non conforme et analysé avec l'accord du client, la norme demande une réserve sur le rapport. Faut-il l'imprimer, avec quels mots ? Elle ne figurerait que sur les rapports émis après le changement | Défaut : rien sur le rapport ; l'accord est imprimé sur le bon de réception et visible du validateur |
| Q78 | **Lecture « > x » sous la limite** (ex. « > 50 » face à m = 10²). La fiche reste « Incomplet » et demande de lire une dilution supérieure. Faut-il pouvoir soumettre quand même, avec une réserve, quand l'échantillon est épuisé ? Sans critère, le technicien choisit la conformité après l'avertissement, et décide aussi pour « Indénombrable » sur un paramètre sans limite : à confirmer | Défaut : soumission bloquée avec un critère ; choix du technicien sans critère |
| Q79 | **« > x » et dilution ; impression.** « > x » est-il bien la lecture brute de la boîte (le facteur de dilution la multiplie : « > 300 » au 1/10 devient « > 3.10³ ») ? Le rapport et l'alerte impriment « Indénombrable », « TNTC » ou « > x » tels que saisis : préférez-vous une formule fixe (toujours « Indénombrable ») ou « > 3.10⁵ UFC/g » calculé ? | Défaut : facteur appliqué ; impression telle que saisie |
| Q80 | **File « À corriger » à la réception.** Quels cas doivent y figurer : non conforme reçu et pas encore programmé, données d'arrivée manquantes, case « analyses » cochée sans échantillon correspondant… ? | Non construit ; défaut proposé : les non-conformes pas encore programmés |
| Q81 | **Premier mot de passe.** Chacun peut maintenant changer son mot de passe (« Mon compte », en cliquant sur son nom). Faut-il obliger chaque nouveau compte à changer le mot de passe donné par l'administrateur à la première connexion ? | Défaut : pas de changement forcé |
| Q82 | **Déconnexion après inactivité.** 30 minutes sans activité, avertissement 2 minutes avant (« Rester connecté »), pour tous les postes du laboratoire et les comptes du portail ; le préleveur (téléphone sur le terrain) n'est jamais déconnecté automatiquement. Ces durées et cette exception vous conviennent-elles ? | Défaut construit (constantes, pas un réglage) |
| Q83 | **Numérotation des factures et avoirs** (complète Q17). Continuez-vous la numérotation de l'ancien logiciel ? Si oui, à partir de quels derniers numéros (facture et avoir), et le format FAC-AAAA-NNNN / AV-AAAA-NNNN vous convient-il ? Le saut se règle dans Réglages « Compteurs », le jour de la bascule, avant la première vraie facture | Défaut : format FAC- / AV-, numérotation continue depuis le dernier numéro émis dans le LIMS |
| Q84 | **Facture émise à 0,00** (« Payée » sans règlement) : peut-elle être annulée comme une facture impayée (son numéro reste dans la séquence, ses échantillons redeviennent facturables) ? | Défaut construit : oui |
| Q85 | **Export comptable** (Excel, Factures → « Export comptable »). Une ligne par document émis à sa date d'émission, avoirs en négatif, factures annulées listées mais hors totaux, « reste à payer » au jour de l'export, feuille « Règlements » par date d'encaissement : est-ce le format attendu par votre cabinet comptable ? Un classeur à deux feuilles ou deux fichiers ? Faut-il plus que le nom et l'ICE du client (adresse, IF, RC) ? | Défaut : un classeur, deux feuilles, nom et ICE tels qu'imprimés sur la facture |
| Q86 | **Facturation, compléments** (complète Q4, Q16, Q30). Délai de paiement par défaut (« à réception », 30 ou 60 jours) ? Une avance encaissée au comptoir doit-elle solder la facture ? Que signifie « avec remise » dans l'ancien logiciel ? Faut-il reprendre les 6 695 prix clients de l'ancien logiciel ? | Facturation (chantier 5) |
| Q87 | **Création d'un client sur le terrain ou au comptoir.** Quels champs le préleveur saisit-il sur place ? Le gestionnaire complète-t-il ensuite l'ICE et les destinataires des rapports ? Le comptoir doit-il pouvoir créer un client ? (risque de doublons dans une base d'environ 1 516 clients) | Non construit ; aujourd'hui la recherche de client remplace les listes complètes (visite, dépôt, facture) |
| Q88 | **Liste des surfaces.** Une liste commune au laboratoire ou une par client ? « Autre (préciser) » autorisé sur place ? Qui ajoute une surface ? Liste de départ, avec la surface par défaut en cm² ? | Non construit |
| Q89 | **Familles des analyses** (complète Q8). Une fois la vraie famille (microbiologie / physico-chimie) de chaque paramètre saisie dans `/admin/parametres`, faut-il interdire sur un échantillon les analyses de l'autre famille ? | Aujourd'hui proposées, regroupées et signalées, jamais refusées |
| Q90 | **Feuille de paillasse** (complète Q9, Q10, Q29, Q55). Doit-elle suivre le papier (une par série, deux boîtes B1/B2, RD/RF, liste du matériel, visa) ? C'est un document maîtrisé : valider la mise en page ou émettre une nouvelle version. Physico-chimie : un document par famille ? Envoyez le scan d'une page remplie du PG06/EN06 | Paillasse (chantier 3) |
| Q91 | **Paramètre « non effectué »** (complète Q11). Que faut-il imprimer sur le rapport (« Non effectué », « NE », avec la raison ?) et faut-il prévenir le client ? Aujourd'hui un tel paramètre bloque tout l'échantillon | Résultats, rapport |
| Q92 | **Validation** (complète Q13). Le validateur technique peut-il modifier la conclusion imprimée (journalisé) ? Quelqu'un peut-il forcer un verdict contraire au calcul, avec quel motif ? Le rapport part-il automatiquement à la validation administrative ou après un envoi manuel ? Peut-on valider une série entière d'un coup, toujours avec deux signataires ? | Défaut actuel : conclusion calculée, envoi automatique à la validation administrative, validation échantillon par échantillon ; l'administrateur dispose de « Modifier la conclusion » (non journalisé, décision du 18/08) |
| Q93 | **Copies internes des alertes** (complète Q45, Q54). Quelles adresses du laboratoire doivent être en copie de chaque alerte de contamination (direction, responsable technique, qualité) ? | Destinataires des e-mails |
| Q94 | **Réclamations clients** (volet ultérieur). Qui enregistre une réclamation : le personnel seulement, ou le client depuis le portail ? Quels statuts et champs (gravité, fondée ou non) ? Lien avec un registre des non-conformités / actions correctives, et qui est prévenu ? | Phase 8 |
| Q95 | **Alertes automatiques Achat & Stock et Qualité.** Qui les reçoit (les comptes du personnel n'ont pas d'e-mail réel) ? Par e-mail ou à l'écran, à quelle heure ? Faut-il ouvrir le module Achat & Stock, aujourd'hui caché ? | Phases 6–7 |
| Q96 | **Pièces jointes** au-delà de la photo du protocole signé (photos d'échantillons, documents du client) : en voulez-vous ? | Non construit (hors périmètre signé) |
| Q97 | **Exploitation du serveur.** Où envoyer la copie hors site des sauvegardes (stockage chiffré S3 / B2 / SFTP, ou un serveur à vous), qui la paie et la détient, et qui garde la clé de chiffrement hors du serveur ? Qui sont les détenteurs d'une clé SSH (une par personne) et quel créneau de maintenance (jour et heure hors activité) pour les redémarrages ? | Défaut : copie hors site désactivée (« offsite skipped » chaque nuit) ; connexion SSH par mot de passe encore ouverte jusqu'au passage de `harden-ssh.sh` |
| Q98 | **Mise en service.** Les derniers N° de série et de contrôle de l'ancien logiciel le jour de la bascule ; confirmation que le client « TEST UI 2026-10-06 Traiteur » et le compte « portail.test » peuvent être supprimés à la mise en service | Bascule ; nettoyage des données de test |

Réponses du laboratoire du 12/10 (`RETOUR-LABO-06-10.md` §12) : ce qui reste à
trancher. Chaque question a, elle aussi, un **défaut déjà construit** (13/10).

| # | Question | Ce que la réponse décide (défaut construit le 13/10) |
|---|---|---|
| Q100 | **Reconnaître un mollusque bivalve vivant.** Aujourd'hui par les mots de la désignation, du type ou de la nature : huître, moule, palourde, coque, praire, clam, pétoncle, coquille, mollusque, bivalve. Faut-il ajouter tellines, couteaux, amandes de mer, coquillages… ou plutôt une case « mollusques bivalves vivants » / un indicateur sur le type de produit ? Les 10 individus doivent-ils être comptés à la réception (un champ « Nombre d'individus ») ? | Défaut : la liste de mots ; « au moins 10 individus : à vérifier » toujours affiché |
| Q101 | **Aliments stables et mains.** Un aliment reçu « Ambiant — aliment stable (conserve, sec, UHT…) » n'a pas de température obligatoire : ce choix de la réception est-il le bon critère, ou faut-il un indicateur sur le type de produit ? Les écouvillons de mains comptent-ils comme « surface » (température obligatoire) ? | Défaut : le choix « Ambiant » à la réception ; mains facultatives |
| Q103 | **Dates des nouvelles versions** : protocole PG04/EN01 version G et bon de réception PG05/EN04 version H (date de mise à jour de chacun). | **13/10 : G (protocole de prélèvement) et H (bon de réception) sont en vigueur ; les dates restent à confirmer par le laboratoire** — dès qu'elles arrivent, l'exploitant les saisit dans `/admin/documents` ; d'ici là les cartouches impriment F et G |
| Q104 | **Rapport, là où le modèle M ne dit rien.** (a) Le modèle n'a que « Satisfaisant » / « Non satisfaisant » : une colonne « Acceptable » apparaît pour un échantillon acceptable — d'accord ? (b) Le pied du modèle n'a pas d'ICE : le rapport n'imprime plus l'ICE du laboratoire ni celui du client — d'accord ? (c) « Analyses réalisées par » n'est plus imprimé — d'accord ? (d) « Moyen de prélèvement » hors air (écouvillon, flacon stérile, sachet) : que mettre ? (e) Prélèvement fait par le client : « Référence prélèvement : N/A (prélèvement non effectué par le laboratoire) » — le bon libellé ? (f) « Date d'analyse » = de la confirmation du programme au dernier résultat, et « Nombre d'analyse/échantillon » = n : d'accord ? (g) La conclusion est imprimée dans l'annexe sous les critères, et « (VC) » suit le numéro d'un rapport amendé : d'accord ? (h) Quels paramètres sont accrédités ou sous-traités (la légende « * », SA, SN, DPC n'est encore appliquée à aucun) ? | Rapport PG06/EN03 M — défauts construits comme décrit. (c) depuis le 13/10 : le nom serait celui du technicien qui a pris l'échantillon en charge (prise en charge libre) ; il est affiché « Analysé par » à la validation, jamais imprimé tant que vous ne le demandez pas |
| Q105 | **Restes de Q58 / Q60.** Le « N° de fax » du client sur le bon : saisi sur la fiche client ou rempli à la main ? Facture, avoir et étiquettes restent-ils sans cartouche qualité ? | Défaut : fax du client rempli à la main ; facture, avoir, étiquettes sans cartouche |

Décision du laboratoire du 13/10 — **plus d'affectation, prise en charge
libre** (`PROGRAMME.md` §10, `RETOUR-LABO-06-10.md` §13) : personne n'attribue
plus de technicien ; un programme confirmé rejoint la liste « À prendre » et
le technicien qui prend l'échantillon le saisit seul. Q42 (répartition entre
techniciens) est répondue par cette décision et archivée au §3. Ce qui reste
à préciser, chaque fois avec un **défaut déjà construit** (13/10). La
mention « Analysé par » sur le rapport n'est pas une nouvelle question : c'est
Q104 (c).

| # | Question | Ce que la réponse décide (défaut construit le 13/10) |
|---|---|---|
| Q106 | **Ordre de la liste « À prendre ».** Les échantillons urgents d'abord, puis la réception la plus ancienne — ou strictement la plus ancienne réception d'abord, urgences comprises ? La liste reste-t-elle groupée par série comme les autres (une série est alors placée à son échantillon le plus urgent ou le plus ancien, ses autres échantillons suivent), ou faut-il une liste échantillon par échantillon ? | Défaut : urgentes d'abord, puis la plus ancienne réception ; groupée par série, comme toutes les listes |
| Q107 | **Un technicien part avec des résultats saisis** (compte désactivé, absence longue, changement de poste). Un échantillon ne peut être remis dans « À prendre » que tant que rien n'y est saisi ; ensuite il reste à son titulaire et l'administrateur le termine à sa place (il saisit et soumet ; « Analysé par » nomme toujours le titulaire). Faut-il permettre à l'administrateur de le **libérer quand même** (les résultats déjà saisis restent, journalisé) pour qu'un collègue le reprenne et le signe ? | Défaut : libération refusée dès qu'un résultat est saisi, à tous ; l'administrateur termine l'échantillon |
| Q108 | **Recherche des échantillons des collègues.** Sur la paillasse, chaque technicien voit les échantillons pris par ses collègues en lecture seule (« Pris par un collègue »). Dans « Recherche des analyses » et son export, un technicien ne trouve aujourd'hui que les échantillons qu'il tient : doit-il pouvoir rechercher aussi ceux de ses collègues ? | Défaut : la recherche et l'export d'un technicien = ses échantillons |

## 2. Ready to send — current batch

*Copy this into an email. Update the date when you send it.*

> **Lot du 13/10 (soir) — prise en charge libre — à envoyer avec les deux lots ci-dessous :**
> Objet : Plus d'affectation des techniciens — ce qui change, 3 précisions (Q106–Q108)
>
> Bonjour,
>
> Comme convenu le 13/10, plus personne n'attribue de technicien. Dès que
> le programme d'analyse est confirmé, l'échantillon rejoint la liste
> « À prendre » que voient tous les techniciens ; le premier qui clique
> « Prendre en charge » (ou qui saisit le premier résultat) devient
> responsable de tout l'échantillon et lui seul y saisit. Ses collègues le
> voient en lecture seule (« Pris par un collègue »). Il peut le remettre
> dans « À prendre » tant qu'aucun résultat n'est saisi ; l'administrateur
> peut le remplacer mais ne prend jamais d'échantillon. Le validateur voit
> « Analysé par » avec le nom du technicien. Les échantillons déjà attribués
> restent à leur technicien. Il nous reste trois précisions : l'ordre de la
> liste « À prendre » (Q106), le cas d'un technicien qui part avec des
> résultats saisis (Q107) et la recherche des échantillons des collègues
> (Q108). La question Q104 (c) — imprimer ou non le nom du technicien sur le
> rapport — vaut aussi pour « Analysé par ».
>
> Bien cordialement,

> **Lot du 13/10 (suites des réponses du 12/10) — à envoyer avec le lot du 10/10 :**
> Objet : Vos réponses du 12/10 — ce qui est fait, 7 précisions (Q99–Q105)
>
> Bonjour,
>
> Merci pour vos réponses du 12/10. Le logiciel les applique : bon de
> réception et protocole avec la note (8) et sans « N° de factures », rapport
> au modèle PG06/EN03 version M (deux pages, annexe d'interprétation), un
> contenant par famille au comptoir et à la réception, température obligatoire
> pour les aliments, eaux, air et surfaces sauf les aliments stables, rôle
> « Direction » pour la validation administrative. Il nous reste sept
> précisions (Q99 à Q105), surtout : la note (8) remplace-t-elle les 100 g /
> 300 g pour les mollusques (Q99), à qui donner le rôle Direction (Q102), et
> les dates des versions G du protocole et H du bon (Q103). La question de
> l'histamine (Q62) attend votre décision.
>
> Bien cordialement,

> **Lot du 10/10 (analyse des écarts) — à envoyer avec Q62, Q64 et Q99–Q105 :**
> Objet : Réception, paillasse, facturation — 32 points à valider (Q67–Q98)
>
> Bonjour,
>
> Nous avons complété le logiciel sur les points relevés lors de l'analyse
> du 10/10 : contrôles de réception hors bon (délai, température de transport,
> emballage, identification, protocole signé, DLC), observation de réception,
> accord du client pour un échantillon non conforme, lecture « > x » et
> « Indénombrable » à la paillasse, renvoi des rapports, changement de mot de
> passe par chacun, déconnexion après inactivité, export comptable. Chaque
> point fonctionne déjà avec une valeur par défaut raisonnable ; vos réponses
> aux questions Q67 à Q98 (tableau joint, colonne « défaut construit ») ne
> demandent le plus souvent qu'un réglage. Les plus urgentes : Q67, Q69, Q71
> (elles changent le travail quotidien de la réception), Q75 et Q77 (accord du
> client et réserve sur le rapport), Q83 (numérotation des factures avant la
> bascule).
>
> Bien cordialement,


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
| 2026-10-07 | Cadre (RETOUR-LABO-05-10 question 1) | « Autocontrôle » et « Contrôle officiel » remplacés par **Autre, Devis validé, BC, Convention** ⇒ tranche V1 de `RETOUR-LABO-06-10.md` |
| 2026-10-06 | Service vétérinaire (05/10 demande 3) | Confirmé une seconde fois : à retirer de « Prélèvement effectué par » ⇒ V1 |
| 2026-10-06 | Deux familles par ligne (05/10 demande 6) | Confirmé : « Analyses microbiologiques » et « Analyses physico-chimiques » sur chaque échantillon ⇒ V3 (Q48, Q49) |
| 2026-10-07 | Surfaces | « Surface prélevée* » devient « État de la surface » : Aseptique / En cours de travail / Nettoyé ⇒ V2 (Q51) |
| 2026-10-12 | Q57 — bon de réception | Version **H** (date à venir) : « N° de factures » barré, « Référence client » gardée ⇒ construit le 13/10 (`RETOUR-LABO-06-10.md` §12) |
| 2026-10-12 | Q58 — ajouts du LIMS sur le bon | N° de contrôle, cadre et site **restent** ; note (8) mollusques bivalves vivants ajoutée (10 individus, 50 g, 25 g pour les animaux de petite taille). Le fax du client : → Q105 |
| 2026-10-12 | Q59 — protocole | Version **G** (date à venir) : « N° de factures » barré, « + les modifications du 05/10 », les huit notes du bon ajoutées ⇒ construit le 13/10 |
| 2026-10-12 | Q60 — rapport | Modèle **PG06/EN03, version M**, créé le 05/01/2006, mis à jour le 18/12/2023, deux pages (rapport + « -ANNEXE- Interprétation des résultats ») ⇒ cartouche RAPPORT remplie par la migration du 13/10. Documents sans cartouche : → Q105 |
| 2026-10-12 | Q61 — échantillon M + P | **Un contenant par famille** : 100 g sur l'échantillon micro, 300 g sur l'échantillon physico-chimie, chacun son poids ⇒ « Quantité 1M / 1P » au comptoir, « Quantité reçue (1M) / (1P) » à la réception |
| 2026-10-12 | Q63 — température obligatoire | Aliment, eau, air et surface, **sauf les aliments stables** ⇒ défaut `ALIMENT,EAU,AIR,SURFACE`, aliment « Ambiant » exempté. Mains et critère de stabilité : → Q101 |
| 2026-10-12 | Q65 — validation administrative | « **Directeur et son suppléant** » ; quatre personnes, dont deux font aussi la validation technique ⇒ rôle `DIRECTION` (13/10). Comptes et droits exacts : → Q102 |
| 2026-10-12 | Q66 — signatures du rapport | Celles du modèle M : « **Responsable Technique** » (validation technique) et « **Direction** » (validation administrative), avec le nom du signataire |
| 2026-10-13 | Q42 — un même échantillon réparti entre plusieurs techniciens (micro à l'un, chimie à l'autre) ? qui soumet ? | **Non** : l'échantillon entier est pris en charge par un seul technicien (la micro et la physico-chimie sont déjà deux échantillons « …M » / « …P ») ; **plus d'affectation** — prise en charge libre depuis la liste « À prendre », le titulaire soumet (`PROGRAMME.md` §10). Les lignes réparties avant le 13/10 gardent leur règle. Suites : Q106–Q108 |
| 2026-10-13 | Q62 — histamine : moins de 9 unités | **Pas une non-conformité** : l'échantillon est analysé comme le client le demande (même n = 1) et le rapport donne les résultats **sans interprétation**. ⇒ règle (7) : moins de 9 unités = ligne « conforme » informative (« analysée telle que demandé, résultats sans interprétation sur le rapport »), plus de « à vérifier » ni d'observation obligatoire ; le rapport imprimait déjà « communiqués sans interprétation » quand n est inférieur au plan |
| 2026-10-13 | Q99 — note (8), mollusques bivalves vivants | **Oui** : la note (8) **remplace** les 100 g de la note (2) en microbiologie (au moins 50 g, 25 g pour les animaux de petite taille) — c'est ce qui est en ligne depuis le 13/10 ; la physico-chimie garde ses 300 g |
| 2026-10-13 | Q102 — rôle « Direction » | **Les quatre personnes de la liste** ; elles peuvent faire **les deux validations** (jamais les deux sur le même échantillon, règle conservée), « **mais il faut avoir la main sur les signatures** » ⇒ chaque signataire a son compte nominatif avec son propre mot de passe (rôle `DIRECTION`, créé par l'exploitant dans `/admin/utilisateurs`) et le panneau public « Comptes de démonstration » est retiré avant que ces comptes signent — sinon n'importe qui peut signer à leur place |
