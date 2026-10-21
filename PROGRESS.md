# PROGRESS.md — live tracker

> The odometer. **Update this every session** (any platform). Tick items, move
> the NEXT ACTION line, add a Session Log entry. This is the first thing the
> next AI reads to know where to start.

---

## ▶ NEXT ACTION

**21/10 — dettes fermées avant le déploiement : le séparateur des milliers (bloquant de mise en ligne) et les dettes de `HANDOFF.md` §9, construits, testés en local, commités et poussés sur `lot2-retour-16-10` (`0c8bd0d`, `e224170`, `7c35cfe`, `7490af8`, `287ed6a`, `533d56c`, `e879e21`, `eeb9de6`, puis les documents) — NON déployés** (HANDOFF §8 « 2026-10-21 », TESTPLAN V18 ; aucune migration de plus : toujours six) : « 1 800,00 DH » partout (U+00A0), D-09 « Saisi par » (auteur gardé par lecture), D-19 modification concurrente d'un paramètre (409 + « Recharger »), borne d'inactivité du serveur Q82 (35 min, préleveur exempté), B2 « Renvoyé par … », alertes de la validation technique rattachées à leur échantillon, « Annuler » de la réception qui nomme la facture, a11y de `ReportDialog`. Gates : tsc 0, eslint 0, vitest 133 fichiers / 2 695 tests, build OK (94 pages) ; e2e locaux tous verts, `v18-local.mjs` 53/53. Présentation refaite : `backups/Qualilab-presentation-evolutions-2026-10-21-v2.pdf`.
**Owner's decision of 21/10: deploy after every build, then test on production** (it ends the « déploiement reporté » of 19/10; HANDOFF §9).
Next, in this order:
1. **Deploy lots 2A + 2C + the 21/10 batch — one deploy, six migrations** (`DEPLOY.md` « Lot 2 du 16/10 »): step 0's gates (the 19/10 decisions on the demo accounts, E4 and the reprise still hold; tell the laboratory, including « rechargez chaque onglet » for the 35-minute bound), step 1's restore point (tag `v1.4-avant-lot2-16-10` + labelled dump), step 2's `UPDATE Session SET updatedAt = UTC_TIMESTAMP(3) …` **while the app is stopped, right before `deploy.sh`**, step 3's checks, step 4's five-minute check with the V18 lines; then the production lines of TESTPLAN V16, V17 and V18 (« TEST UI » data only).
2. **D-19 in production** (step 6) after the owner's review of `backups/D-19-parametres-a-reclasser-2026-10-20.md`; reload every /admin/parametres tab opened before the deploy first.
3. Send the 20/10 re-ask with the v2 presentation (`NEEDEDINFO.md` §2 « Lot du 20/10 »).

_Previous next action:_ **20/10 — réponses du laboratoire du 19/10 (pages 9 et 10 de la relance du 18/10), lues et vérifiées dans le code : plan du lot 2C, `RETOUR-LABO-19-10.md`.** Réglées : Q11, Q45, Q54, Q81, Q82 ; en partie : Q30 (« Besoin par paramètres »), Q85 (IF et RC), Q86 ((2) « non » ; (1) et (3) à reposer) ; vides : Q104, Q93, Q103, Q105, Q97 ; la page 11 (Q19, Q98, Q20) et les parties 1, 2, 3, 5 ne sont pas revenues. Présentation des écrans du lot 2A (version de développement) : `backups/Qualilab-presentation-evolutions-16-10-2026-10-20.pdf` (28 pages, 35 écrans).
Next, in this order:
1. ~~**Build lot 2C**~~ ✅ **built 20/10 on branch `lot2-retour-16-10`, tested locally, committed (`7b1b540` H1, `f057892` H2 + H3, `a83ec7e` H4, `5666f3b` D-15–D-18, `1cb4a4f` D-19, then the docs), not pushed, not deployed** (`RETOUR-LABO-19-10.md` §3–§4, TESTPLAN V17): H1 password to change (Q81), H2 IF / RC on the client, in the invoice snapshot and the export (Q85), H3 the site of a client address (Q45), H4 « PDF par paramètre » as a print option (Q30, before R-1), D-15 / D-16 the programme sheet with « Analyse sensorielle », D-17 one criteria count, D-18 the family page at 1366 px, D-19's screen « Reclasser plusieurs paramètres ». One additive migration `20261020100000` (already applied locally). Gates: tsc 0, eslint 0, vitest 123 files / 2 479 tests, `npm run build` 94 pages; `.ui-tests/v17-local.mjs` 78/78; regressions v16-1 62/62, v16-2 109/109, v16-3 67/67, v16-4 73/73, v16-final 21/21 + 7/7, v15-lot1 24/24, v14-take 40/40. **Next for lot 2C:** the owner reviews the commits and pushes the branch when ready (nothing pushed); **D-19 data**: done on the local copy (293 food parameters MICRO → CHIMIE through the route, `.ui-tests/d19-apply.mjs`); the owner reads `backups/D-19-parametres-a-reclasser-2026-10-20.md` (62 rows not to tick locally — 59 in production —, 6 to confirm with the lab), then production by the operator through the screen (tag + dump) before go-live, `DEPLOY.md` « Lot 2 du 16/10 » step 6.
2. **Owner: send the short re-ask of 20/10** (`NEEDEDINFO.md` §2 « Lot du 20/10 »: R-1 Q30, R-2 Q85 address, R-3 / R-4 Q86, reminder of page 11 and parts 1, 2, 3, 5, Q131–Q133), with the presentation PDF if wanted.
3. After the answers: H4's per-client default layout if R-1 asks for it (the layout itself is built), H5 (client prices, R-4), the address in the export (R-2).
4. Deployment: still postponed by the owner (19/10) — one deploy, lot 2A + 2C (six migrations), the gates below plus lot 2C's (`DEPLOY.md` « Lot 2 du 16/10 » step 0: re-run the gates and the rehearsal with the six migrations, tell the laboratory of H1–H4; after the deploy, the named accounts each choose their password, and D-19 step 6).

_Previous next action:_ **19/10 — décisions du propriétaire :** **déploiement reporté** (phase de développement, il reste du travail) ; production, comptes et données inchangés. Pour le futur déploiement : les propositions 2.1 et 2.6 partent ; les comptes de démonstration restent actifs ce soir-là et seront désactivés dès que les comptes nominatifs existent ; aucune fusion réelle de clients avant la décision sur `Invoice.clientSnapshot` ; pas de reprise F3 ce soir ; noms des comptes de démonstration inchangés (HANDOFF §9). Présentation au laboratoire : PDF des écrans des nouveautés pris sur la version de développement.

**Lot 2A (réponses du 16/10, `RETOUR-LABO-16-10.md`) — construit et testé en local le 19/10 sur la branche `lot2-retour-16-10`, NON déployé.** Quatre vagues commitées sur `master` (`a1ad186`) : `9770bb0` (1 — corrections sûres), `d7b8750` (2 — terrain, comptoir, lot 1b ; 3 migrations), `124af3a` (3 — droits, envoi, clients ; 1 migration), `b898586` (4 — catalogue ; 1 migration) ; les dix corrections de la vérification finale sont **dans l'arbre de travail, pas commitées** (`src/lib/billing-hold.ts` non suivi). Gates green: tsc 0, eslint 0, vitest 117 files / 2 312 tests, `npm run build` (93 pages). Local recette (http://localhost:3210, TEST UI data only): v16-1 63/63, v16-2 109/109, v16-3 67/67, v16-4 73/73, v16-final-local 21/21, v16-final-ui 7/7, regressions v15-lot1 24/24 and v14-take 40/40. Deploy rehearsed on a local copy at the production schema: 5 additive migrations, 44 tables unchanged, 92 reports byte-identical. Production still runs `52e0d27`; nothing was run there.
Next, in this order:
1. ~~Owner: review and commit the working tree~~ — committed 19/10 (`d9dcd2d`, then docs `81de56d`, `f4e9140`); re-run the gates before the deploy (`npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run`, `npm run build`).
2. **Owner: the deploy gates** (`DEPLOY.md` « Lot 2 du 16/10 » §0, HANDOFF §9) — one deploy carries the four waves, so all of them:
   - wave 2: the lab's answers to the re-ask **2.1** (hands' states) and **2.6** (« Heure de prélèvement inconnue du client »), **or** a written decision to ship the proposals (record it in HANDOFF §9 and here);
   - D1: named accounts for the signatories + a real ADMIN, then `bash scripts/disable-demo-accounts.sh`, and `NEXT_PUBLIC_DEMO_MODE=false` in `.env` before the build;
   - E4: the `Invoice.clientSnapshot` decision (HANDOFF §9 « Billing »);
   - Q131 / Q132 / Q133: ship the built defaults or wait for the answers;
   - read-only on production: no criteria grid above 1000 rows (500 for a hands / surface / water / air family);
   - tell the laboratory in writing (required T° ambiante, « Prélevé le » + « Arrivé le », hands' state; no packaging question; « Valider » no longer sends; reload pages and phones, submit visits in progress first).
3. **Deploy outside lab hours**, `DEPLOY.md` « Lot 2 du 16/10 » §1–§3: tag `v1.4-avant-lot2-16-10` = `a1ad186` pushed → ff-merge into `master` and push → on the VPS: HEAD and last migration checked, eight row counts noted, `git pull --ff-only`, `docker compose build`, `docker compose stop app`, labelled dump `qualilab_avant-lot2-16-10.sql.gz` (gzip -t, « Dump completed »), `bash scripts/deploy.sh` → migrate exit 0 (six « Applying migration »: five `20261019…`, then lot 2C's `20261020100000`), health ok, the enum columns, the same row counts, no error in the log, tzdata check.
4. **Owner's 5-minute check and TESTPLAN V16 production lines** with their own accounts, TEST UI data only (old report and duplicata keep the 13/10 layout; old protocole / bon reprint with the new wording).
5. **Reprise F3 by the operator** (`DEPLOY.md` §5): second dump, Analyser, aliases for the look-alikes, in-flight samples checked with the bench, Importer, Analyser again = nothing planned; then the préleveurs' « Dénomination sur les documents » and the list of families still without criteria to the lab.
6. **Re-ask of 18/10**, if not sent yet: the PDF + the e-mail of `NEEDEDINFO.md` §2, which now carries Q131–Q133 in its body (they are not in the PDF).
7. Lot 2B as the re-ask answers come back (≈ 110–130 h if every proposal is accepted).
Rollback: `DEPLOY.md` « Point de retour — avant le lot 2 du 16/10 » — code only while no `ASEPTISEES` / `NON_RECU` row exists, else the tag then the dump.
Waiting on the lab: the re-ask of 18/10 (21 points, 6 blank questions, 16 questions of pages 7–9, 7 information items) + Q131–Q133.

_Previous next action:_ **Réponses du laboratoire du 16/10 (pages 1 à 6 du questionnaire du 14/10) — lues, vérifiées dans le code, plan complet écrit : `RETOUR-LABO-16-10.md`.** Rien n'est construit. 52 réponses (29 réglées, 19 en partie, 4 à reposer), 7 vides, 22 non revenues (pages 7 à 9). Changements majeurs : mains « Aseptisées ou désinfectées / En cours de travail / Lavées » (une valeur ajoutée, `NON_LAVEES` relu « En cours de travail »), T° ambiante obligatoire sur la visite, « Prélevé le » et « Arrivé le » obligatoires au comptoir, **pas de catégories**, **plus d'envoi automatique du rapport**, rouvrir / annuler ouverts au validateur et à la Direction, fusion ouverte au commercial, plus de client sur la feuille de paillasse.
Next, in this order:
1. **Owner reviews and sends the re-ask** — `backups/Qualilab-suite-reponses-16-10-2026-10-18.pdf` (11 pages, French) with the e-mail of `NEEDEDINFO.md` §2 « Lot du 18/10 ». Check the Q19 wording (duplicate numbers) before sending.
2. **Owner decisions, no code** (`RETOUR-LABO-16-10.md` §6): jump the SERIE / CONTROLE counters to a range the old software will not reach in 2026 (after the lab agrees; try it on the local copy first — the counter never goes back); check the bank details in /admin/entreprise before any real invoice; named accounts, then the demo accounts **disabled** (`scripts/disable-demo-accounts.sh`, not only the panel hidden) as soon as the lab's account list arrives — not tied to a wave, and required before wave 3; the `Invoice.clientSnapshot` decision before merges open.
3. **Build lot 2A in four waves** when the owner says go (`RETOUR-LABO-16-10.md` §4): wave 1 safe fixes (≈ 11 h, no migration) → wave 2 field and counter + lot 1b (≈ 56 h, one additive migration) → wave 3 rights, sending, clients (≈ 41 h) → wave 4 catalogue (≈ 43 h, legacy re-import on the local copy first). Restore point before each wave that carries a migration; TESTPLAN V16. **Deploy gate (wave 2):** in production only after the answers to the re-ask 2.1 (hands' states, A1) and 2.6 (« Heure de prélèvement inconnue du client », B1), or on the owner's explicit decision to ship the proposals — both are one-line switches (HANDOFF §9).
4. Lot 2B as the re-ask answers come back (≈ 110–130 h if every proposal is accepted).
Waiting on the lab: the re-ask of 18/10 (21 points to confirm, 6 blank questions, 16 questions of pages 7–9, 7 information items: accounts, signatories, bank details, e-mail domain / DNS / HTTPS, client recipients, logo / accreditation / stamp files, the « point 7 » of 13/10).

_Previous next action:_ **Remarques du laboratoire du 14/10 (`RETOUR-LABO-14-10.md`) — lot 1 en production depuis le 14/10 (`52e0d27`, TESTPLAN V15 : locale 23/23, production 24/24, navigateur en anglais).** Lot 1 = ce qui ne demandait aucune réponse : puces 100 / 1000 cm² (P7), heure saisie en 24 h (R7, `LabDateTimeInput` + `src/lib/wall-input.ts`), site toujours affiché au dépôt + recherche du client par site et par fiche archivée (R1, R10, `SitePicker`, `client-search.ts`, `site-creation.ts`), norme et unité sous chaque analyse (OLD29, `parameter-caption.ts`), nature à la paillasse (OLD40), « Non déclarée » au lieu de l'instant du comptoir (R6, `declaredSampledAt`), test des gardes du technicien + `GET …/programme` refusé au technicien (RP3, RP3c), nettoyage du dépôt public. **Aucune migration.** Point de retour : tag `v1.3-avant-retour-14-10` = `cd0054f` (poussé).
Also specified on 15/10, to build **with lot 2** (owner's decision): **lot 1b — rapport aligné** on a real report (`RETOUR-LABO-14-10.md` §8: sampler denomination « Technicien de QUALILAB 'X.NOM' », « N/A », their labels, « JJ/MM/AAAA HH:MM », one « Date d'analyse », the real arrival time).
Next, in this order:
1. ~~Lot 1 gates, local browser test, commit, deploy, production check~~ — **done 14/10**: tsc 0, eslint 0, vitest 1 796, build; adversarial review (17 findings, all fixed: half-typed hours never kept, « AM/PM » refused, saves refused while a date-time field is unfinished, a new-site name not created blocks « Continuer », search ranking); V15 locale 23/23 and production 24/24; restore point tag `v1.3-avant-retour-14-10` + dump `qualilab_avant-retour-14-10.sql.gz`. Remaining unticked V15 lines to run by hand (TESTPLAN V15 « Not yet run »). §3 statuses of `RETOUR-LABO-14-10.md` set to « en production ».
4. **Send the 14/10 questions** — `NEEDEDINFO.md` §2 « Lot du 14/10 » (Q109–Q130) — with the batches still unsent (13/10 soir, 13/10, 10/10).
5. **Lot 2 as the answers arrive**, in the order of `RETOUR-LABO-14-10.md` §4.10: « Arrivé le » (Q118), mains (Q109–Q111), températures + correction (Q112, Q113); then client creation (Q116, Q117); then the catalogue RP2a → RP2b (+ N2, local copy first) → RP2c / RP2d → RP1 / RP5 / RP6 → RP4 (Q120–Q126); RP3b, RP7, P6, R8, Q130 as answered. ≈ 116 h in all.
Still open from 13/10 (owner): before the deploy, confirm on the VPS that production runs `cd0054f` (the histamine change, step 1 of the 13/10 next action — the 14/10 batch was started from it as production); personal accounts per signatory (`DIRECTION`) and per technician, then the public demo panel off (`NEXT_PUBLIC_DEMO_MODE=false`); /admin/documents protocole G and bon H once dated (Q103); bank details in /admin/entreprise; the few V14 lines left to run by hand.
Waiting on the lab: **Q109–Q130**, plus Q2 (2e partie), Q64, Q67–Q98 (Q87 answered 14/10), Q100, Q101, Q103 (dates), Q104, Q105, Q106–Q108, Q50 / Q54–Q56; the technicians' names and the « 7e point » announced on 13/10.

_Previous next action:_ **Réponses du laboratoire du 13/10 (après-midi) — à appliquer.** Prise en charge libre **en production depuis le 13/10** (`9d338ae`, TESTPLAN V14 : 40/40 sur la copie locale puis 40/40 en production). Réponses reçues le 13/10 (archivées dans `NEEDEDINFO.md` §3) :
- **Q62 histamine** : moins de 9 unités n'est pas une non-conformité, analysé comme demandé (même n = 1), rapport sans interprétation ⇒ règle (7) informative, construit le 13/10 (à déployer avec le prochain lot).
- **Q99 mollusques** : oui, la note (8) remplace les 100 g de la note (2) — déjà en ligne.
- **Q102 Direction** : les quatre personnes de la liste, les deux validations possibles (jamais sur le même échantillon), « il faut avoir la main sur les signatures » ⇒ comptes nominatifs avec mots de passe personnels + retrait du panneau public de démonstration.
- **Q103 versions** : G (protocole) et H (bon) en vigueur, dates à confirmer par le laboratoire.
- Techniciens : noms promis pour l'après-midi du 13/10. Coordonnées bancaires : selon le courriel de la responsable du laboratoire (à transmettre). Un 7e point « à valider cet après-midi » avec le laboratoire.
Next, in this order:
1. Deploy the histamine change (rule (7) informative) — tests green; no migration.
2. Owner, in production /admin/utilisateurs: one personal account per signatory (role `DIRECTION`, strong password each) and per technician once the names arrive; then remove the public demo panel (`NEXT_PUBLIC_DEMO_MODE=false`) — the condition for « avoir la main sur les signatures ».
3. Owner, /admin/documents: protocole version G and bon version H once the lab gives the dates; /admin/entreprise: bank details from the lab's e-mail.
4. Remaining TESTPLAN V14 items by hand (users warning, bench sheet with `?date=`, a seeded legacy split line).
Waiting on the lab: Q103 dates, technicians' names, bank details, the 7th point, **Q106–Q108**, Q104 (c), Q64, Q67–Q98, Q100, Q101, Q104, Q105.

_Previous next action:_ **Prise en charge libre (13/10, `PROGRAMME.md` §10) : en production depuis le 13/10** (`9d338ae`). Plus d'affectation ; liste partagée « À prendre » ; « Prendre en charge » ou première saisie ; « Libérer » tant que rien n'est saisi ; collègues en lecture seule ; l'admin supplée sans prendre ; soumission refusée sans titulaire ; « Analysé par » ; « À prendre » et « qui tient quoi » au tableau de bord admin. Restore point: tag `v1.2-avant-sans-affectation` (`4b9c557`) + production dump `qualilab_avant-sans-affectation.sql.gz` (taken just before the deploy). Rollback: `git checkout v1.2-avant-sans-affectation` + `docker compose up -d --build` (DB restore optional — `DEPLOY.md`).

_Previous next action:_ **Réponses du laboratoire du 12/10 (`RETOUR-LABO-06-10.md` §12) : construites le 13/10, pas déployées.** Bon (version H) et protocole (version G) avec les notes (1)…(8) et sans « N° de factures », pied du protocole depuis /admin/entreprise ; règle (8) mollusques bivalves vivants ; température obligatoire pour aliment, eau, air et surface sauf l'aliment « Ambiant » ; un contenant par famille (« Quantité 1M / 1P ») ; rapport d'essai au modèle PG06/EN03 M (deux pages) ; IF / Patente / CNSS / Fax ; rôle `DIRECTION`. One additive migration `20261013100000_retour_labo_1210`. Gates green (prisma generate, tsc 0, eslint `src` 0, vitest 96 files / 1 590 tests); local recette **137/137** (TESTPLAN V13).
Next, in this order:
1. **Before 14/10 (ops):** confirm on the VPS that cron runs the new `scripts/backup-db.sh` (TESTPLAN V11.0 ops line is still unticked) — the old one prunes `qualilab_avant-phase-9.sql.gz` at the 02:00 run of ≈ 14–15/10.
2. Restart the shared dev server (:3210): it still holds the Prisma client from before the migration (« Unknown field molluscMinIndividuals » on settings, deposits and /validation/[id]).
3. Review the diff and commit (checked 13/10: no real name, no legal identifier in the changed files).
4. Deploy outside working hours after a labelled dump (`bash scripts/deploy.sh`; the `migrate` service applies the migration), refresh open pages, then **TESTPLAN V13-E** on production on « TEST UI 2026-10-06 Traiteur » only.
5. Owner, in production: type IF / Patente / CNSS / Fax (and check address, phone, e-mail, « Raison sociale ») in /admin/entreprise from the lab's template; protocole G and bon H in /admin/documents once dated (Q103); create the real accounts and give DIRECTION to the people the lab confirms, on their existing validator account when they have one (Q102).
Waiting on the lab: **Q99–Q105** (urgent Q99 — does note (8) replace 100 g / 300 g for molluscs —, Q102, Q103), Q62 (histamine, undecided), Q64, Q67–Q98.

_Previous next action:_ **Analyse des écarts du 10/10 (`RETOUR-LABO-06-10.md` §11) : construite le 10/10, pas déployée.** 37 items (reception controls C1–C7, observation and justification, client agreement / « en attente du client », « > x » / « Indénombrable » at the bench, resend / conclusion / e-mail identity / parcours / envois / historique, « Mon compte », attempt limit, idle sign-out, journal filters, accounting export, FAC / AV counters, frozen invoices, credit note per line, technician load, off-site backup, SSH hardening) in one additive migration `20261012100000_gaps_build`. Gates green: prisma generate, tsc 0, eslint 0, vitest 90 files / 1 396 tests, `npm run build`. **Nothing checked in a browser** (no local DB).
Next, in this order:
1. **Before 14/10 (ops, urgent):** deploy the new `scripts/backup-db.sh` on the VPS, or copy `/var/backups/qualilab/qualilab_avant-phase-9.sql.gz` off the server — the deployed script prunes it at the 02:00 run of ≈ 14–15/10 (HANDOFF §9).
2. Rotate the password of every demo account in use (`/admin/utilisateurs`): the shared one is in the repository.
3. Review the diff and commit; tell the reception what changes (C3 / C5 required, observation for an accepted doubt, « Prélevé le » asked of the client, sign-out after 30 min).
4. Deploy outside working hours after a labelled dump (`bash scripts/deploy.sh`, Docker mode; migration applied by the `migrate` service), refresh open pages, then **TESTPLAN V11** on production on « TEST UI 2026-10-06 Traiteur » only (invoice steps only with the owner's agreement).
5. Before any real client merge (Q54): decide the one-time `Invoice.clientSnapshot` backfill (HANDOFF §9).
Waiting on the lab: **Q67–Q98** (urgent Q67, Q69, Q71 — they set the daily reception work), Q57–Q66, Q50 / Q54–Q56.

_Previous next action:_ **Message du laboratoire du 08/10 (soir) (`RETOUR-LABO-06-10.md` §10) : en production depuis le 09/10** (`4a1c1e8`; TESTPLAN V10) — reception checklist (7 rules), paper cartouche, lab role wording, date-only fix (document dates restored in production). Waiting on the lab: Q57–Q66 (bon fields, protocol version, report reference, M+P weights, histamine, temperature, rule (1) shortcut, who signs the administrative validation, report signatures), Q50/Q54–Q56, real account names.

_Previous next action:_ **Retour du 08/10, suite (`RETOUR-LABO-06-10.md` §9) : en production depuis le 08/10** (`7612a18`, `73d7119`; TESTPLAN V9). Waiting on the lab: physico-chimie parameters for surfaces / hands / air (Q50, Q56 — those samples cannot be programmed yet), the bench sheet's client line (Q55), the duplicates file (Q54), Q45–Q53, legal details for documents; the lab's devices still need their clock update.

_Previous next action:_ **Retour du 08/10 (`RETOUR-LABO-06-10.md` §8) : en production depuis le 08/10** (`a5925b6` + `b0defab`, migration `20261010100000_natures_air_autre`; TESTPLAN V8 — recette-v8 27/27, recette-v8b 20/20 on an emulated device one hour ahead and an up-to-date one). Next, waiting on the lab: parameters / profiles for « Physico-chimie de l'air » and « Microbiologie — autres prélèvements » (Q50 — the samples can be created, not yet programmed), the merges of `doublons-clients.xlsx` (Q54), Q45–Q53, legal details for the documents. Every PC / phone of the lab should still be updated (zone data 2026c): the fields now cope with a device one hour ahead, but a correct clock is the real fix.

_Previous next action:_ **Retour du 08/10 (`RETOUR-LABO-06-10.md` §8) : construit, pas encore déployé.** Next: commit + deploy, then TESTPLAN V8 on production.

_Previous next action:_ **Facturation (cycle complet), amendement / duplicata des rapports et portail client : construits le 08/10, pas encore déployés** (`FACTURATION.md`, `AMENDEMENT.md`, `PORTAIL.md`). Next: commit + deploy (one migration, `20261009100000_facturation_rapports_portail`, with `prisma migrate deploy`), then **TESTPLAN X, Y, Z** on production on the kept test client « TEST UI 2026-10-06 Traiteur » and invented « TEST UI X / Z » clients only. To confirm with the lab: an invoice of 0,00 stored « Payée » at issue; « rapports amendés en tête de liste » on the portal read as the dashboard's « Rapports récents ».

_Previous next action:_ **Clients en double / sites / clients facturés : construits le 07/10, pas encore déployés** (`CLIENTS-FUSION.md`). Next: commit + deploy (migration `20261008100000_clients_fusion` with `prisma migrate deploy`), then **TESTPLAN W** on production with invented « TEST UI W … » clients only. The real duplicates, outlets and billing entities are processed only after the laboratory validates `doublons-clients.xlsx` (Q54).

_Previous next action:_ **Retours du laboratoire 05 → 07/10 : V1 → V6 construits le 07/10, pas encore déployés** (`RETOUR-LABO-06-10.md` §5). Next: commit + deploy (the migration `20261007100000_retour_labo_v` runs with `prisma migrate deploy`), then **TESTPLAN V** on production (V0 → V6), the « Sites de l'ancien logiciel » import (extract `sites.csv` with `scripts/legacy/extract-legacy.py`, analyse, commit), a new version of PG04/EN01 and PG05/EN04 in `/admin/documents`. Waiting on the lab: Q45 (sending by site), Q50 (air and physico-chemistry parameters in the catalogue).

_Previous next action:_ **Tranche PROGRAMME livrée (TESTPLAN T, 05/10 night).** Next: les tranches L1–L3 de `RETOUR-LABO-05-10.md` (en-tête du protocole, familles, surfaces) après les réponses du laboratoire.

_Previous next action, kept for context:_ **SLICE K of `RETOUR-LABO-30-09.md` — the recette and go-live, with the
laboratory** (spec §5 and §10). Slices H, I and J are done and in production
(2026-10-01, TESTPLAN Q-H, Q-I, Q-J). The go-live data is in
production too (1 516 clients, the client memory for 392 of them). Owed by the lab: the
recette (L6, M6, P, Q), Q38, Q39, Q30, DNS, real accounts; then
`scripts/disable-demo-accounts.sh`, `NEXT_PUBLIC_DEMO_MODE=false`; on
switch-over day the counters (`/admin/reglages`). Test data and demo
clients are already gone from production (2026-10-01).

## ▶ PREVIOUS ACTION (retour du 29/09)

Slices A → F of `RETOUR-LABO-29-09.md` built, verified and deployed
2026-09-29 (TESTPLAN checkpoint P, production included).

## ▶ PREVIOUS ACTION (chantier 2)

**PHASE 9 — CHANTIER 2 : CRITÈRES D'INTERPRÉTATION — code complete 2026-09-18.**
Spec: **`CRITERES.md`**. The catalogue (types de produits × germe × version de
norme), the workbook import, the bench per unit, the verdicts on validation and
on the report are built, tested and verified in the browser (TESTPLAN checkpoint
M1–M4). Deployed and imported on production the same day (TESTPLAN M5: 131 types, 1 075
critères, circuit complet vérifié sur le VPS). **Next: the recette with the
laboratory** (TESTPLAN M6 + chantier 1's L6) and the answers to NEEDEDINFO
Q25–Q29 — the code applies a documented default for each of them meanwhile.

## ▶ PREVIOUS ACTION

**PHASE 9 — CHANTIER 1 : LE CIRCUIT SÉRIE (prélèvement → réception).**
Spec: **`WORKFLOW.md`**. **Slice 1 shipped 2026-09-13** (schema + backfill,
natures, counters, `POST /api/series`, « Nouvelle visite » multi-line, « Mes
visites », visit detail with arrival panel, lab screens on N° de contrôle +
N° de série). **Slice 2 shipped 2026-09-13** (reception queue by série, série screen
with the seven acceptance rules computed live, `POST /api/series/[id]/reception`
in one transaction, coded non-conformity motifs, thresholds in
`/admin/reglages`, labels PDF with Code128). **Slice 3 shipped 2026-09-13** (« Nouveau dépôt » numbered and received in one
transaction with the rules, protocole / bon PDFs with the cartouche and page
numbers, `/admin/documents`). **Slice 4 shipped 2026-09-13** (profiles in one tap, client memory with
« déjà connu sous » canonical spelling, sampler kind on the visit, sites on
the client fiche — the legacy sites import waits for the client import of
chantier 6). **Slice 5 shipped 2026-09-13** (verbs Corriger / Annuler / Réactiver with
audit, lists grouped by série, old routes removed).

**Slice 1b shipped 2026-09-14 — « le protocole tel quel »** (the lab's
feedback of 14/09, `WORKFLOW.md` §13): the visit form is the paper sheet on
one screen — N° de série slot, site always shown and creatable inline,
cadre, interlocuteur, prélevé le / heure de fin, effectué par picked from
the PRELEVEUR accounts (+ fonction) or vétérinaire / autre, arrivée and T°
à l'arrivée, N° de factures; the line type first (« Surface prélevée » on
any line); n up to 50 with labels beyond Z; the two « Analyses à
effectuer » boxes saved on the série, printed on the PDF, flagged at
reception when no line matches. Verified with a client's paper protocol
(série 14/26) on the dev server and on the VPS (TESTPLAN L1b).
**NEXT: slice 6, the recette** with the lab's staff (three real visits +
one deposit on the VPS, sign-off in TESTPLAN L6 and HANDOFF) — it needs
their session; NEEDEDINFO Q21–Q24 settle the four choices left to them.
Then chantier 2 (catalogue & critères) opens.

Why (2026-09-13): the client's feedback (« multiple things are missing, above
all in the prélèvement ») was objectified against the old Firebird database
(252 tables, restored) and the four paper forms the lab still fills by hand.
The technical base stands; the business core was modelled on a simplified
picture: one sample instead of one **visit** (≈ 7 samples of mixed natures
per série), 3 types instead of **16 natures**, a single limit instead of
**m / M criteria**, one value instead of **one per unit**, invented ids
instead of the lab's **yearly sequences**. Six workstreams, ≈ 31 weeks; the
first (7 weeks) is the workflow. Restore point: tag **`v1.0-avant-phase-9`**
+ dump `qualilab_avant-phase-9.sql.gz` on the VPS (DEPLOY.md « Point de
retour »).

**Production runs slice 1 since 2026-09-13** (http://185.217.126.53 —
migration `20260913200000_phase9_serie` applied by the `migrate` service,
backfill checked from the browser: séries 1/26 … 15/26 backfilled and listed
for `pre1`, 16 natures, série 16/26 created through `POST /api/series` and
received as code contrôle 13/26). Restore point unchanged:
tag `v1.0-avant-phase-9` + the VPS dump.

**What remains outside the chantier:** domain + HTTPS (15 min once the
domain exists), the lab's answers to `NEEDEDINFO.md` Q1–Q20 (none blocks
slice 1), demo accounts closed at go-live.

---

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked (note why)

## Phase 0 — Groundwork
- [x] Analyze prototype vs client scope (`finalversion.xlsx`)
- [x] Lock the stack (see HANDOFF §8 decision log)
- [x] Write cross-platform docs (AGENTS, HANDOFF, PLAN, PROGRESS, CODE_QUALITY)
- [x] `npm run build` passes on current Next 16 code (clean baseline, exit 0)
- [x] Better Auth compatibility spike — GREEN (Next 16 + Prisma 7 + MySQL + driver adapter)
- [x] Confirm local DB connectivity (`npm run db:check`) and seed works

## Phase 1 — Foundation & roles ✅ COMPLETE (2026-07-29)
- [x] **Adopt Better Auth**: install 1.6.25 + config (prismaAdapter mysql, username + admin plugins, `role` field)
- [x] Mount `/api/auth/[...all]`; Better Auth tables migrated (User/Session/Account/Verification)
- [x] Reconcile existing `User` relations (`Sample.userId`, `Invoice.createdById`)
- [x] Rewrite login/logout + `getSession` call-sites; seed users via Better Auth
- [x] `trustedOrigins` CSRF config (env-driven prod, any localhost in dev)
- [x] Central guard `requireRole()` / `requireApiRole()` on top of Better Auth session
- [x] Refactor existing admin + préleveur layouts and all API routes onto it
- [x] Extend `Role` enum to 7 roles (+ `CLIENT` reserved for the future portal)
- [x] Add models: `Result`, `Report`, `AuditLog`, `EmailLog`
- [x] Add `Sample` actor fields (`receivedById`, `technicianId`, `validatedById`, `rejectionReason`, `receivedAt`, `conformity`) + `controlCode`/`serialNumber`
- [x] Migration created + applied; Prisma client regenerated
- [x] Update `prisma/seed.ts` for 7 demo users + richer sample data
- [x] `logAudit()` helper
- [x] Status state-machine helper (`canTransition`, only legal transitions)
- [x] 7 role dashboard shells + routing (`/reception`, `/technicien`, `/validation`, `/commercial`, `/comptabilite`)
- [x] **Demo:** each role logs into its own dashboard — verified in browser
- [x] `npm run build` + `npm run lint` pass clean

## Phase 2 — LIMS core ✅ COMPLETE (2026-08-25)
- [x] **Reception & conformity + assign to technician (`PRELEVE → RECU`)** ✅ 2026-08-23
  - [x] Blind numbering: sequential `controlCode` + crypto-random `serialNumber`
  - [x] `sample-select.ts` — numbering excluded from the préleveur's payload at the query
  - [x] Reception API with state machine + audit + concurrency guards (P2025/P2002)
  - [x] Queue, verify screen, conformity (+ motif), technician picker with workload
  - [x] Success panel showing both numbers, copiable, for labelling the sample
  - [x] `produit` + `N° de lot` captured at reception (needed by the alert email)
- [x] **[alerts] schema prep** ✅ 2026-08-25 — `Result.numericValue`,
      `AnalysisParameter.alertOnExceed` + `limitValue`, `Sample.produit` +
      `numeroLot`, `ClientEmail` model, `EmailLog.type`; seeded with provisional
      NM norms (⚠️ official limits still to come from the lab)
- [x] **Technician result entry (per-parameter) + save-in-progress** ✅ 2026-08-25
  - [x] `result-value.ts` parses the lab's notation (`8,9.10²`, `< 10`, `Absence`)
  - [x] Conformity computed automatically against the parameter limit
  - [x] Work status incl. anomaly (description mandatory)
  - [x] Technician isolation enforced server-side (`sample-access.ts`)
- [x] **Submit results (`RECU → EN_ANALYSE → RESULTATS_SAISIS`)** ✅ 2026-08-25
- [x] **Validation / rejection — double validation** ✅ 2026-08-25
  - [x] `canValidateTechnically()` + `canApprove()` guard the two steps
  - [x] Validateur signs off technically; ADMIN alone moves the sample to VALIDE
  - [x] Neither shortcut possible: validateur-alone and admin-without-technical both refused
  - [x] Rejection requires a motif, returns the sample to the technician and clears the technical sign-off
  - [x] "Attente admin" is a derived state — the six client-facing statuses are unchanged
- [x] Audit on every transition; state machine enforced server-side
- [x] **Demo:** sample travels `PRELEVE → VALIDE` ✅ verified end to end

## Phase 3 — Reports & email ✅ CODE-COMPLETE (2026-08-25)
- [x] **Server-side PDF report** — `playwright-core` drives a browser already on
      the machine; `RAP-YYYY-NNNNN`; rendered on demand from the approval
      snapshot, so nothing to store or back up
- [x] Download button on the validation screen
- [x] **Auto email on approval** (`→ RAPPORT_ENVOYE`) + `EmailLog` + resend
- [x] **Contamination alerts** — grouped per germ, client's address list + lab
      in copy, Produit/Site/Date/Lot/Germe/Résultat/Limite table
- [x] **Feuille de paillasse** printable by date, technician-scoped
- [x] Admin silent report edit (deliberately unaudited, isolated in one route)
- [x] Simulation mode: without a provider key, sends are journalised and the UI
      says so — the whole chain is demonstrable today
- [ ] 🔒 Real delivery — needs DNS (`NEEDEDINFO` item 2)
- [ ] 🔒 Official limits — needs the lab's figures (`NEEDEDINFO` item 1)
- [x] **Demo:** approving a contaminated sample produces the report, emails it
      and raises the E. coli alert
- [x] **Performance pass** ✅ 2026-08-25 — cursor pagination on `/api/samples`
      and `/api/invoices`, composite indexes matching the real queries
      (`[status, receivedAt]`, `[technicianId, status]`, `[userId, createdAt]`),
      and the first indexes ever on `Invoice`

## Phase 4 — Clients, invoice link, admin ✅ COMPLETE (2026-08-25)
- [x] **Client CRUD + archive + 360° view** ✅ 2026-08-25
  - [x] `client-validation.ts` — pure, tested rules shared by the API and the form
  - [x] Multi-address recipient list (reports / alerts), which the sending depends on
  - [x] Archive rather than delete: samples, reports and invoices still refer to the client
  - [x] Search, empty states, and a warning when no address is registered
- [x] **Invoice generated from validated samples (+ editable désignations)** ✅ 2026-08-25
  - [x] `billing.ts` — pure, tested: analyses → lines at catalogue prices, priced by domain
  - [x] An unpriced analysis is flagged, never invoiced at zero
  - [x] `InvoiceItem.sampleId` ties each line to its sample — what prevents double billing
  - [x] Server-side guards: wrong client, not validated, already invoiced
  - [x] The line désignation is a real editable field (it was a dropdown, so
        picker-added lines could not even be submitted)
- [x] **Comptable has their own invoice space** ✅ 2026-08-25 — shared
      components, links derived from the space they render in
- [x] **Invoice PDF rendered server-side** ✅ 2026-08-25 — selectable text,
      amount in words, RIB/IBAN, legal mentions; `html-to-image` and `jspdf`
      removed with the screenshot code
- [x] **Upgrade the invoice PDF to server-side rendering** (`/api/invoices/[id]/pdf`)
- [x] **Admin: paramètres d'analyse + journal d'audit** ✅ 2026-08-25
  - [x] `parameter-validation.ts` — pure, tested; a sensitive parameter must carry a limit
  - [x] Parameter edits audited with before/after values
  - [x] Journal: last 200 actions in plain French, read-only
- [x] **Admin: users, catalogue, entreprise** ✅ 2026-08-25 — Phase 4 complete
  - [x] Accounts created through Better Auth; disable revokes sessions now;
        self-modification blocked; all audited
  - [x] Catalogue prices in French decimals; deactivation propagates to the
        billable proposals
  - [x] Company identity in DB (`CompanySettings`), editable, `getCompany()`
        with static fallback — documents pick it up with no code change
  - [x] `company.ts` split pure-data vs `company-server.ts` (DB) so client
        bundles never drag the database driver
- [ ] **Demo:** configure everything + invoice from a validated sample

## Phase 5 — Production hardening ✅ CODE PORTION COMPLETE (2026-08-25)
- [x] **Direction view** on `/admin`: pipeline, turnaround, billed/collected,
      status distribution, month activity, alert count
- [x] **Global search in the database** (code, controlCode, serialNumber,
      produit, lot, lieu, client) — debounced from the dashboard
- [x] **Blind-numbering oracle closed**: the préleveur's search excludes the
      laboratory numbering, so a serial can never be mapped back to a field code
- [x] Production build + `next start` smoke: health OK, HSTS on
- [x] `Dockerfile` (standalone + Chromium, non-root) + `docker-compose.yml`
      (private network, migrations on boot)
- [x] `backup-db.sh` (verified dumps, retention) + `restore-db.sh` (guarded)
      + `DEPLOY.md` runbook
- [x] VPS: first deploy (Docker), cron backup, **tested restore 2026-08-26**, full
      TESTPLAN pass on the deployed system
- [ ] 🔒 Legacy data import (waits on the lab's export)

## Extensions — client meeting 2026-07-28 (after core; re-cost/replan)
Detail in PLAN "Extension modules"; scope note in HANDOFF §10.
- [x] Phase 6 — Achat & Stock: suppliers, payment-term alerts, inventory (2026-08-27)
- [x] Phase 7 — Qualité: métrologie, EIL, monitoring temp. (2026-08-27)
- [ ] Phase 8 (later) — Portail client (`CLIENT` role) + Réclamations
- [ ] Workflow changes folded into core: numbering at reception (P2), auto-calc
      results (P2), double validation (P2), bench sheet (P2/3), admin silent
      report edit (P3), editable designations (P4)
- [x] **Client answers received (2026-08-18)** — see HANDOFF sections 8/10:
      double validation (validateur + admin, every sample) · blind dual
      numbering · NM-norm defaults · legacy import-only · `MAGASINIER` role ·
      no internal log on silent edit · portal confirmed (admin-managed)
- [ ] Still pending from client: per-parameter formulas (mid-project) · legacy
      data files · Quality equipment list / EIL perimeter

---

## Phase 9 — Mise à niveau métier (analysis 2026-09-13) ◀ IN PROGRESS

Spec: `WORKFLOW.md` (chantier 1). Summary and the five other chantiers:
`PLAN.md` Phase 9. Questions for the lab: `NEEDEDINFO.md` Q1–Q20.

**Chantier 1 — circuit série (prélèvement → réception), 7 weeks**
- [x] Slice 1 (2026-09-13, commits d5069cb + ba9e688) — schema `Serie` / `Site` / `AnalysisNature` / `AnalysisProfile` / `ClientPlace` / `ClientProduct` / `Counter` / `DocumentReference`, `Sample` additions, `ANNULE`; backfill one série per existing sample; 16 natures seeded with `lineKind` + `legacyType`; `src/lib/counters.ts` (NNNN/AA, NNNNN/AA, `SELECT … FOR UPDATE`) + tests; `POST /api/series` (transaction série + lines); « Nouvelle visite » multi-line phone first; « Mes visites »; old `POST /api/samples` creates a one-line série
- [x] Slice 2 (2026-09-13) — reception queue by série; `POST /api/series/[id]/reception` (one transaction: N° de contrôle per line, temperatures, conformity + coded motif, technician by family); `src/lib/reception-rules.ts` + tests; labels PDF (Code128, one per unit)
- [x] Slice 3 (2026-09-13) — « Nouveau dépôt » (kind DEPOT, samplerKind CLIENT, samples born RECU); protocol and bon PDFs with the quality cartouche; `DocumentReference` admin
- [x] Slice 4 (2026-09-13) — analysis profiles per nature / per client; `ClientPlace` / `ClientProduct` pickers with quasi-duplicate refusal; sampler kind (Qualilab / client / service vétérinaire); sites imported from the old database
- [x] Slice 5 (2026-09-13) — verbs « Corriger la fiche » (`PATCH /api/samples/[id]/intake`) and « Annuler » (`ANNULE`, coded motif); technician and validation lists grouped by série; `unitCount` + unit letters on labels; photo of the signed protocol; old routes removed
- [x] Slice 1b (2026-09-14, retour labo 14/09, `WORKFLOW.md` §13) — the form reads like the paper: header complete on one screen (N° de série slot, site always shown + creatable, heure de fin, effectué par = PRELEVEUR account or vétérinaire / autre, arrivée date/heure, T° à l'arrivée), line type first with « Surface prélevée » on every line, `unitCount` ≤ 50 + `unitLetter` beyond Z, `Serie.analysesMicro` / `analysesChimie` boxes (form + PDF + reception flag); migration `phase9_protocole`; TESTPLAN L1b
- [ ] Slice 6 — recette with the lab on real visits (needs the lab's session); fixes; demo data reseeded on the VPS; sign-off in TESTPLAN L6 + HANDOFF

**Chantier 2 — catalogue & critères (6 w) — spec written 2026-09-14:
`CRITERES.md`**, from the lab's criteria workbook (131 product types, 1 101
criteria, n = 5, 3-class m/M plans, absence tests, two norm versions per
parameter). Slices: (1) schema + import with dry run + admin screens for
types / criteria / norms; (2) product type on the line + type profiles;
(3) results per unit + `interpretation.ts`; (4) verdicts on validation and
report; (5) recette. Opens after chantier 1's recette; Q25–Q29 asked,
Q28–Q29 block slices 3–4 only.
- [ ] Chantier 2 · slice 1 — schema (`ProductType`, `Norm`, `NormVersion`, `Criterion`, `ConclusionScale`), alias table, `scripts/import-criteres.ts` (dry run), admin screens
- [ ] Chantier 2 · slices 2–5 — product type on the line, per-unit results grid, interpretation engine, report with criteria, recette

**Chantiers 3–6** (analyse & résultats 5 w · validation, rapports, envoi
5 w · commercial & facturation 4 w — the old software's seven invoice
layouts noted in `PLAN.md`, Q30 · reprise, portail, bascule 4 w) — planned
in `PLAN.md`, opened one at a time.

## Session Log

### 2026-10-21 — open debts closed before the deploy: money's separator, D-09, D-19 concurrency, Q82 server bound, B2, early alerts, reception « Annuler », a11y — committed and pushed, not deployed
- Committed on `lot2-retour-16-10`, one commit per area with its tests, after the gates were re-run green on the integrated tree (tsc 0, eslint 0, vitest 133 / 2 695): `0c8bd0d` money, `e224170` D-09 (+ `benchStartingReadings`, « Saisi par »), `7c35cfe` the reception's « Annuler » (`summaryLineOf`; « Annuler » hidden once a report exists, the admin's billed-analyses warning shown there), `7490af8` D-19's concurrent edit, `287ed6a` Q82, `533d56c` B2, `e879e21` early alerts, `eeb9de6` a11y; then the documents (HANDOFF header, §1, §8, §9; TESTPLAN V18; DEPLOY « Lot 2 du 16/10 »; RETOUR-LABO-16-10 D-09 / C3; RETOUR-LABO-19-10 D-19; NEEDEDINFO → v2 PDF). Branch pushed; nothing merged into `master`; production not contacted.
- Owner's decision of 21/10: deploy after every build, then test on production — the deploy of lots 2A + 2C + this batch is next (NEXT ACTION).
- Six areas built in parallel, then integrated: gates green (tsc 0, eslint 0, vitest 133 / 2 695, build 94 pages); e2e v16-1 64/64, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40, v17 78/78, v17-h1 53/53, v17-h2-h3 31/31, new `v18-local.mjs` 53/53.
- Integrator's additions: « Saisi par » on /validation/[id]; `benchStartingReadings` (a line keeps its reading when the catalogue adds or withdraws a criterion); « / » shows the inactivity notice (`signedOutPath`); `typedAmountIsNone` (a typed 0 advance); 44 px paging on /reception/historique; docs (HANDOFF, TESTPLAN V18, DEPLOY step 6, RETOUR D-09 / C3, NEEDEDINFO → v2 PDF).
- Presentation v2: `c-h4-bouton` and `c-h4-pdf` retaken (« 2 160,00 DH »), the « défaut d'affichage » sentences removed.

### 2026-10-20 — lot 2C committed and documented — local, not pushed, not deployed
- Gates re-run on the integrated tree before committing: `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 123 files / 2 479 tests.
- Five code commits on `lot2-retour-16-10`, one per area, each with its tests: `7b1b540` H1 (Q81, mot de passe à changer), `f057892` H2 + H3 (Q85 IF / RC, Q45 an address's site — with the HANDOFF §9 backfill line its test reads), `a83ec7e` H4 (Q30, « PDF par paramètre »), `5666f3b` D-15–D-18 (programme sheet, criteria count, family page), `1cb4a4f` D-19 (« Reclasser plusieurs paramètres »); the client sheet's two changes split by hunk between H2 and H4. Then one documents commit.
- Docs: `RETOUR-LABO-19-10.md` (state of 20/10, every status « construit le 20/10 … testé en local » with its commit, R-1 asks to confirm the built layout, §6 H1 at go-live and D-19's production step, §7 results), HANDOFF (header, §1 rows, §4 the three columns, §8 H2 / H3 entry and « lot 2C … as built », §9 H1 at go-live, D-19's step and the « AUTRES » family point), TESTPLAN (sign-off row, V17 intro and commits, production lines for D-15–D-18 and the deploy), DEPLOY (six migrations, checks, rollback note, lot 2C's lines in step 0, new step 6 D-19, rollback now step 7), FACTURATION §6 (H2, H4 built), NEEDEDINFO (R-1 now asks to confirm the built « par paramètre » layout), AGENTS (reading order). No real client, site or staff name in any changed tracked file (checked on the diff).
- Nothing pushed; production never contacted.

### 2026-10-20 — lot 2C integrated: the five areas together, gates and every local e2e green — built locally, not deployed, not committed
- Integration of H1 (accounts), H2 + H3 (clients), H4 (invoice), D-15–D-18 (programme sheet and families) and D-19 (parameters), each built and reviewed by its own pass the same day. No regression in the application code; no migration beyond `20261020100000`.
- Gates: `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 123 files / 2 479 tests, `npm run build` 94 pages (the build restarts the `next dev` worker on :3210 — it rewrites `next-env.d.ts`; build first, then run e2e).
- New `.ui-tests/v17-local.mjs` (git-ignored) **78/78**: H1 in a headless browser (technician at 1366 px, préleveur at 390 px, portal; menu entry and typed URL back to « Mon compte », wrong password, own choice, admin reset closing the session), H2 through the test client's form + a real invoice + the parsed export + a merge, H3 through the form + a destruction notice per site + a report « Valider et envoyer » of one site (recipients read in EmailLog), H4 both layouts' totals + the credit note + the buttons, D-15–D-18 on the programme sheet and the family page, D-19 through the API and the screen; it cleans up after itself.
- Regressions on the same tree: v16-1 62/62, v16-2 109/109, v16-3 67/67, v16-4 73/73, v16-final-local 21/21, v16-final-ui 7/7, v15-lot1 24/24, v14-take 40/40 (`CANCEL=1`). Adapted to intended changes: v16-3 (a created account chooses its own password first, H1), v16-1 (D-04 binds its site address through the fiche, H3).
- Watch-out written down (HANDOFF §8 / §9): `PATCH /api/clients/[id]` replaces the whole fiche — the first v17 run emptied the test client's record e-mail with a partial PATCH; put back through the API, the script now sends the fiche as it is and checks it at the end. Demo accounts: none has « mot de passe à changer » (checked). Docs: TESTPLAN V17 (integration line, browser lines ticked, V17-D15–D19 added), `RETOUR-LABO-19-10.md` §4 / §7, HANDOFF header / §1 / §5 / §8 / §9. Nothing committed, production never contacted.

### 2026-10-20 — lot 2C, H1 : mot de passe à changer (Q81) — built locally, not deployed
- `User.mustChangePassword` (migration `20261020100000`, no UPDATE) set by the administrator's creation and reset, cleared by the person's own change; every guard of `auth.ts` (and the portal's) sends a flagged account to « Mon compte » / answers 403; the exemption (`passwordChangeGuards`, `requirePortalPage({ allowsPasswordChange: true })`) is pinned to 7 files; badge on /admin/utilisateurs; journal `USER_PASSWORD_CHANGE_REQUIRED { reason: CREATED | RESET }`. Review fixes: the Better Auth additional-field declaration pinned by a test; a failed clearing write answers `stillRequired` (form tells the person the new password is now the current one, journal `flagCleared: false`). Tests: `password-change*.test.ts`; local recette `.ui-tests/local-v17-h1.mjs` 53/53 (TESTPLAN V17-H1); browser click-through not run. Docs: HANDOFF §2 / §3 / §4 / §5 / §8 / §9, `RETOUR-LABO-19-10.md` H1. Nothing committed, production never contacted.

### 2026-10-20 — présentation des écrans du lot 2A, réponses du 19/10 (pages 9 et 10), plan du lot 2C
- Presentation PDF for the lab (French, 28 pages, 35 screens of lot 2A only, each framed with its link `http://185.217.126.53/<path>` and « version en développement »): captured on the LOCAL dev version (:3210) with the TEST UI client and the demo accounts, nothing deployed; `backups/Qualilab-presentation-evolutions-16-10-2026-10-20.pdf`. Capture scripts `.ui-tests/pres-*.mjs` (git-ignored); test samples created for it cancelled.
- Found while capturing (`RETOUR-LABO-19-10.md` §4): D-15 stale family notice after « Analyse sensorielle », D-16 sensory keeps the family's germs, D-17 two criteria counts for one family, D-18 family page truncated at 1366 px, D-19 355 ALIMENTAIRE / MICRO parameters incl. chemistry (reprise residue, D-13). Dev-server watch-out again: after a long idle, :3210 served every dynamic route as Next's 404 — restart the preview; a still-missing nested route comes back when its file is touched (mtime only).
- Lab's scan of 19/10 (pages 9 and 10 of the 18/10 re-ask; `backups/reponses-labo-19-10-scan-pages-9-10.pdf`) read and checked in the code: `RETOUR-LABO-19-10.md` (answers, H1–H5, D-15–D-19, re-ask R-1–R-5, order); `NEEDEDINFO.md` (Q11, Q45, Q54, Q81, Q82 archived; notes on Q30, Q85, Q86, Q93, Q97, Q103–Q105, Q19, Q20, Q98; §2 « Lot du 20/10 »); `FACTURATION.md` §6; `RETOUR-LABO-16-10.md` (pointer, stale « non commité » fixed); HANDOFF §8 / §9. No code changed.

### 2026-10-19 — lot 2A : quatre vagues construites et testées en local, déploiement répété, documentation (non déployé)
- Built `RETOUR-LABO-16-10.md` lot 2A on branch `lot2-retour-16-10` from `master` (`a1ad186`), one commit per wave, each with an adversarial review and a local recette: **wave 1** `9770bb0` (A2, A4, B5, C1, C4, C6, C7, F2, D-04, D-05; no migration; 15 findings fixed; vitest 1 861); **wave 2** `d7b8750` (A1, A5–A8, B1–B4, D5 + D6 = lot 1b; migrations `20261019100000` / `110000` / `120000`; 15 findings; vitest 2 001); **wave 3** `124af3a` (D1, D2, C5, F8, E1–E4; `Client.toComplete`; 26 findings; vitest 2 185); **wave 4** `b898586` (F1, F3–F7, F9; `ProductType.natureId`; 31 findings, the reprise replayed on a reconstituted production state; vitest 2 290). A1's list and B1's « heure inconnue » box are the re-ask's proposals (2.1, 2.6), switched on: production waits for the answers or the owner's decision.
- Cross-wave regression on :3210 only: every first-run failure was a later wave's intended change or test-data drift (no regression between waves); six scripts updated (`.ui-tests/`, git-ignored), final pass 63/63, 109/109, 67/67, 73/73, 24/24, 40/40. Two catalogue-data defects found (grid > 200 rows, imported c refused) → fixed by the final verification (entry below).
- Whole-branch review (read-only): guards exact, `migrate diff` empty, 39 migrations; 3 medium + 3 low findings → the final verification's ten fixes (below), Q132 / Q133 as defaults. Production build of `b898586`: 93/93 pages, route sizes within the existing range (/programmation/[id] 93.5 KB gzip, second largest).
- Deploy rehearsal on a throwaway local DB loaded from the 13/10 copy (production schema, 34 migrations): 5 migrations by `npx prisma migrate deploy` and by the Docker image's `migrate` command; 44 tables row-hashed identical; enum positions kept; 92/92 reports byte-identical master vs branch; 84 pages / PDFs 200 on a standalone build (:3240, stopped). Caveat written in DEPLOY: code-only rollback only while no `ASEPTISEES` / `NON_RECU` row exists. Throwaway DBs, image and server removed.
- Docs for lot 2: `RETOUR-LABO-16-10.md` (header state, a status per built item in §3 / §5, « État au 19/10 » in §4, §8), `HANDOFF.md` (header, §1 row, §2, §4 wave-2 migrations, §5 rows for every new module, §8 entry for waves 1–2 + checks + deploy gates, §9 gates and after-deploy watch-outs), `TESTPLAN.md` V16 (V16.0 added; lines seen locally ticked « local 19/10 », production lines unticked; sign-off row), `DEPLOY.md` « Lot 2 du 16/10 » (gates, order, checks, reprise F3), `NEEDEDINFO.md` (Q131–Q133 in the 18/10 e-mail, outside the PDF). Nothing committed, nothing deployed, production never contacted.

### 2026-10-19 — lot 2 : vérification finale des quatre vagues, dix constats appliqués (local, non déployé, non commité)
- Applied on branch `lot2-retour-16-10` (working tree): criteria grids up to 1000 rows, only changed rows written, the import's meaningless c tidied (never a « change by hand ») and planned for clean-up by the reprise (e); « Analyses modifiées après facturation » (intake / programme journal `billedOn`, invoice sheet, client fiche, notices on the correction screens and the programme sheet); « Annuler » says what stays on the invoice and with the client; the family of a water / surface / hands / air line correctable at the bench; « Rouvrir » of a never-sent report says so (NEEDEDINFO Q132); « Analyse sensorielle » → n = 1, family detached (Q133); client Excel export and /recherche print the arrival; DEPLOY.md « Point de retour — avant le lot 2 du 16/10 » (rollback rule for the appended enum values, openssl warning expected). Details: HANDOFF §8.
- Gates: tsc 0, eslint 0, vitest 117 files / 2 312 tests, `npm run build` (93/93 pages). E2E on http://localhost:3210: v16-1 63/63, v16-2 109/109, v16-3 67/67, v16-4 73/73, v15-lot1 24/24, v14-take 40/40; new `v16-final-local` 21/21 (API) and `v16-final-ui` 7/7 (browser).
- Watch-out: the dev server's child process restarted by itself during the pass (11:15); afterwards every route nested under another route (`…/results/submit`, `…/report/versions`, 55 in all) answered 404 until its file was touched (mtime only). If a run shows such 404s, touch those files or restart `next dev`.

### 2026-10-16 → 18/10 — réponses du laboratoire (pages 1 à 6), plan complet, relance
- The lab returned pages 1–6 of the 14/10 questionnaire, handwritten. Transcribed (`backups/reponses-labo-16-10-transcription.md`, git-ignored: a staff name in Q22), then every answer checked in the code by seven read-only analyses (préleveur, réception, clients, paillasse, validation/rapport, catalogue, remaining questions).
- Wrote `RETOUR-LABO-16-10.md`: each answer, its reading and status; what changes in the 14/10 plan; the full plan by chantier (A préleveur, B dépôt/réception, C paillasse, D validation/rapport + lot 1b, E clients, F catalogue, G old-software functions) with files, effort, migrations and production impact; four waves ≈ 150 h; 14 latent defects found on the way (D-01–D-14); the owner's operational items (duplicate numbering with the old software, placeholder bank details, demo panel, invoice snapshot).
- Built the re-ask in French: `backups/Qualilab-suite-reponses-16-10-2026-10-18.pdf` (11 pages: what we understood, 21 points to confirm, 6 blank questions, 16 questions of pages 7–9, 7 information items). Q84 kept as a default; Q94–Q96 left out (unpriced modules — owner's call).
- Docs: NEEDEDINFO (31 rows archived to §3, 51 rows annotated « 16/10 », batch « Lot du 18/10 »), RETOUR-LABO-14-10 (pointers, §8 corrected), HANDOFF (§1, §5, §8 entry, §9), TESTPLAN V16 (planned), AGENTS / WORKFLOW / PROGRAMME pointers and stale lines (technician export, DIRECTION in « Corriger la fiche »). No code changed.

### 2026-10-15 — extrait d'un rapport réel (préleveurs, dénomination)
- The lab sent the « Prélèvement et réception » block of a real report. Compared line by line with our PG06/EN03 M report: sampler denomination « Technicien de QUALILAB 'X.NOM' », « N/A » for empty fields, their labels (« Lieu de prélèvement », « Date Prod », « Date Exp »), « JJ/MM/AAAA HH:MM », one « Date d'analyse », the real arrival as reception time. Specified as « lot 1b — rapport aligné » (`RETOUR-LABO-14-10.md` §8); Q22 (1st part) and Q104 (d, f) updated in NEEDEDINFO. Owner's decision: build it with lot 2, after the lab's answers.

### 2026-10-14 — remarques du laboratoire du 14/10 : analyse, lot 1 construit (`RETOUR-LABO-14-10.md`, TESTPLAN V15, not deployed)
- The lab's WhatsApp message of 14/10 (16 lines: préleveur, « Nouveau dépôt », responsable des paramètres, AM/PM) and 14 screenshots of the old software were analysed read-only on `cd0054f` by four analysts (préleveur, réception, responsable des paramètres, old software) and a critic whose corrections win: hands state = one additive enum migration, no rewrite, `surfaceState` never reused; temperatures mandatory on the visit only, air = ambient only, counter optional; « Arrivé le » a real field, never a relabel of « Prélevé le »; the client search must find site names and archived merged fiches; N2 — the legacy criteria of hands / surface / water / air familles are bound to food parameters. One id scheme (P1–P10, R1–R10, RP1–RP7, OLD1–OLD50), questions Q109–Q130. Restore point first: tag `v1.3-avant-retour-14-10` = `cd0054f` (pushed); branch `retour-labo-14-10`.
- Lot 1 (no answer needed) built in parallel by file ownership, no migration: P7, R7, R1 + R10, OLD29, OLD40, R6 + C5, RP3 + RP3c, the public-repo cleanup (a person's name in `document-html.test.ts` → « Personne Test »).
- Docs: `RETOUR-LABO-14-10.md` (new: the message, coverage, vocabulary, the table of every item, lot 1, lot 2 design and order, Q109–Q130, public-repo rule); NEEDEDINFO Q109–Q130 + batch « Lot du 14/10 », Q2 (1re partie) and Q87 archived; HANDOFF drift fixed (10/10, 12/10, 13/10 builds and V14 deployed; the restore-point pruning watch-out resolved), 14/10 rows in §1 / §2 / §5, §8 entry, §9 watch-outs; TESTPLAN V15 + « V15 lot 2 — à venir » + sign-off row; AGENTS reading order (4d); WORKFLOW header pointer; PROGRAMME dated note; real names removed from WORKFLOW §10, TESTPLAN L1 / L1b / L4 and this file.
- Not done: gates on the merged tree, local browser test, commit, deploy, TESTPLAN V15. Lot 2 waits on Q109–Q130.

### 2026-10-13 — plus d'affectation : prise en charge libre (`PROGRAMME.md` §10, TESTPLAN V14, not deployed)
- The lab decided (13/10) that nobody assigns technicians any more. Restore point first: annotated tag `v1.2-avant-sans-affectation` on `4b9c557`, pushed; work on branch `prise-en-charge-libre`. The codebase was mapped spot by spot (programme, bench, reception lifecycle, downstream, docs / tests / seeds) and the map reviewed by a critic before any edit (contradictions settled: one « À prendre » predicate, one typed-result predicate, route `/take`, codes `SAMPLE_TAKEN` / `SAMPLE_UNTAKEN`, admin never takes, release while nothing is typed).
- Foundation: `bench-access.ts` rewritten around the holder (`UNCLAIMED_WHERE` / `isUnclaimed`, `TAKEN_WHERE`, `takenByOthersWhere`, `canEnterParameter`, `isHeldByOther`, `canReadAtBench`, `hasTypedResult` / `TYPED_RESULT_WHERE`, `takeRefusal` / `untakeRefusal`, `TAKE_MESSAGES`), `bench-take-server.ts` (`lockTakeState`), route `POST` / `DELETE /api/samples/[id]/take`; the results PUT takes implicitly under the row lock and moves PROGRAMME → EN_ANALYSE inside its transaction, only on typed content; submit refuses a free sample; `loadAssignedSample` answers 403 naming the holder; bench views gain « À prendre » (« Qui m'attendent » → « À commencer »); journal and parcours labels. On top of it, in parallel by file ownership: the bench screens, the programme route and sheet, the dashboards and users admin, the tests, the docs.
- Docs: PROGRAMME §1 / §3 / §4 / §5 / §6 / §8 + new §10; WORKFLOW header, §3.3, §3.4, §8, §16, new §19; AGENTS §3b rule 5; HANDOFF §1 / §2 / §4 / §5 / §8 / §9; TESTPLAN C4 / C5 / B3 annotated, V11 A14 withdrawn, new checkpoint V14 + sign-off row; NEEDEDINFO Q42 archived, Q76 default, Q104 (c) note, Q106–Q108 + batch; DEPLOY « Point de retour — avant la prise en charge libre »; RETOUR-LABO-06-10 new §13.
- Not done yet: full gates on the merged tree, the local browser test, commit, the labelled production dump, deploy, TESTPLAN V14.

### 2026-10-13 — réponses du laboratoire du 12/10 : built, local recette 137/137 (TESTPLAN V13, not deployed)
- The lab's answers of 12/10 (Q57–Q66, the annotated protocole and bon, the report template PG06/EN03 M) read as images. Foundation: one additive migration `20261013100000_retour_labo_1210` (company IF / Patente / CNSS / Fax, mollusc thresholds, temperature kinds default, RAPPORT cartouche, `Role.DIRECTION`), applied to the local DB only. Three streams built in parallel, each with a hostile reviewer: the report on template M (`report-template.ts`, `report-pdf.ts`, `printReport` re-prints denser while over two pages), the reception (rule (8), stable food, one container per family, bon / protocole notes and footer), the Direction role (46 guards, `validationControls`, menu, demo account).
- Integration: the shared dev server (:3210) still held the old Prisma client, so the end-to-end recette ran on an isolated copy (`next dev --webpack` on :3230, same local DB, `.ui-tests/e2e1210-*.mjs`): reception refusals and acceptances, deposit and visit reception through the forms, bon / protocole PDFs, programme → bench → valid1 → Direction, same-person refusal, report compared page by page with the template and checked with pdftotext, amendment « annule et remplace », portal, Direction redirects and 403s, /admin/entreprise and /admin/reglages — **137/137**, no defect in the build. Cosmetic fixes only: `ReportActions.tsx` comment (resend roles), AGENTS.md demo-login list. Invented identifiers typed for the check were cleared afterwards.
- Gates: prisma generate, tsc 0, eslint `src` 0, vitest 96 files / 1 590 tests. Docs: RETOUR-LABO-06-10 §12, NEEDEDINFO (Q57–Q66 archived except Q62 / Q64, Q99–Q105, batch du 13/10), HANDOFF §1 / §4 / §5 / §8 / §9, TESTPLAN V13 + sign-off, AGENTS §6.
- Not done: commit, deploy, production checks (V13-E). Local test data left in the local DB only: clients « TEST UI 1210 Traiteur … » (2), séries 632–643/26, accounts `test.dir1210a…` / `test.dir1210b…` (DIRECTION) and two `test.portail1210…` (CLIENT), a test regulation / norm / product type per run.

### 2026-10-12 — full-system test (TESTPLAN V12)
- Local copy, four testers + independent verification: about 240 checks over every module and role; 47 real bugs fixed (guards, double-submit races, merged-client invoicing, VAT validation, partial-PATCH wipes, bench-sheet day, error codes and wording). Gates: tsc 0, eslint 0, vitest 93 files / 1 450 tests, build. Production database checked read-only: consistent, migrations up to date, backup valid, tz data 2026c. Open, not blocking: see TESTPLAN V12.

### 2026-10-10 — analyse des écarts : 37 items built (`RETOUR-LABO-06-10.md` §11, not deployed)
- Gap analysis against the signed scope, the paper forms, the lab's feedback 29/09 → 09/10 and ISO 17025 §7.4: 37 items to build, 23 lab topics, 12 already done, 8 out of scope (the build plan of the session, kept outside the repository). Built in three parallel streams by file ownership — A reception and billing data (A1–A14, the only schema owner), B bench / validation / e-mail (B1–B10), C admin / security / ops (C1–C13) — each with a hostile reviewer (A: stale-page cancel fixed, ranges validated, 44 px links, legacy release body; B: invented « Prélèvement » step on undeclared deposits, dialog verb; C: tab-close bypass of the idle sign-out, focus trap, stale `.next` validator, rclone depth).
- Integration pass: full gates on the merged tree first (all green), then the post-merge items — the reception observation and the client's agreement on the bench and validation pages (shared `ReceptionObservation` / `ReceptionNonConformity`, `storedConsultation` + test, the bon route reads it too); the accounting export reads the frozen client (`invoiceClientIdentity`, source-guard test); `day-range.ts` moved to the lab clock so the four new lists cut days alike (tests now exact instants, green in three time zones); `Invoice.issuedAt` index added to the migration; `labDayOf` moved to `lab-time.ts` (it was written twice); the results route now stores its own conformity suggestion without a criterion (`benchConformity` + tests on the alert path — an old or forged request can no longer store « conforme » for an uncountable plate). Migration re-checked clause by clause against `prisma migrate diff` from the committed schema.
- Gates: prisma generate, tsc 0, eslint `src` 0, vitest 90 files / 1 396 tests, `npm run build` green. Docs: HANDOFF §1/§2/§3/§4/§5/§6/§8/§9, TESTPLAN V11 (+ sign-off row), NEEDEDINFO Q67–Q98 (+ batch in §2), RETOUR-LABO-06-10 §11, WORKFLOW §3.2/§3.3/§6/§18.
- Not done: browser / DB checks (no local DB, by instruction), the `Invoice.clientSnapshot` backfill (no data rewrite — owner decision before Q54), `EmailLog.sampleId` for early alerts, server-side idle bound, a few < 44 px targets. No commit, no deploy.

### 2026-10-09 — lab message of 08/10 (evening) live (TESTPLAN V10)
- Analysis workflow (3 read-only analysts) then build workflow (3 builders + 3 hostile reviewers). Reception: the 7 paper rules as a per-sample checklist, rule (1) required server-side, motif `NON_EXPLOITABLE`, histamine rule family-independent. Cartouche: Chromium header template reproducing the paper grid on protocol / bon / bench sheet; bon aligned on version G. Roles: lab vocabulary (labels only). Date-only parsing fixed (`date-only.ts`).
- Gates: tsc 0, eslint 0, vitest 70 files / 1059 tests, build. Deployed `4a1c1e8` with migration `20261011100000_reception_checklist`. Production recette V10 all green after the text-encoding fix of the test itself; the four cartouche dates that had slipped one day in production were restored to the paper values.

### 2026-10-08 — retour du 08/10, suite, live (TESTPLAN V9)
- Real samples are now entered on production. Five remarks from the lab's first day of use: arrival time no longer asked at visit creation (`7612a18`, deployed first: it blocked « Continuer »); Mains in both families; no technician at reception (and a programme cannot be confirmed without one; queue oldest first); labels without client / site; every dashboard tile clickable (`73d7119`).
- Built with two workflows (3 builders + 3 hostile reviewers; dashboards: scout of 55 tiles, foundation, 2 builders, 2 reviewers, completeness check). Gates: tsc 0, eslint 0, vitest 66 files / 990 tests, build. Production: recette-v9 + v9b 12/12, recette-v9-dash 51 tiles clicked (48 + 3 views whose page has no tile to highlight).
- Server health checked (read-only): disk 77 % (42.7 GB of Docker build cache reclaimable), SSH password login open with ~21 000 failed attempts a day, backups only on the same disk, reboot pending — reported to the user, nothing changed.

### 2026-10-08 — retour du 08/10 live (TESTPLAN V8)
- Deployed `a5925b6` (migration `20261010100000_natures_air_autre` applied), recette `.ui-tests/recette-v8.mjs` 27/27 with headless Chrome emulating a device one hour ahead and an up-to-date one: typed device hour stored as the legal hour, future end refused at « Continuer », Air with both boxes → `MICRO_AIR` + `PC_AIR`, « Autre » both → `MICRO_AUTRE` + `EFFET_ASEPTISANT`, Mains physico-chimie refused, no profile / no série analyses block on the visit.
- The screenshots showed « avance d'1 hsur » (the compiled JSX dropped the space after the expression — the sentence is now one string) and « Maintenant » spilling over the next column at 900 px (the native field kept its width; it now shrinks to 13rem and the button wraps). Fixed in `b0defab`, deployed; `.ui-tests/recette-v8b.mjs` 20/20 on the other screens: visit fiche (stored 00:22 shown 01:22, future arrival refused, « Maintenant » → stored 00:43), reception (future refused, série not received), deposit (future refused, profiles still offered), programme « Délai » hint, layout at 900 px.

### 2026-10-09 — retour du 08/10 corrections built (`RETOUR-LABO-06-10.md` §8, not deployed)
- §8.1: one date-time field, `LabDateTimeInput` (`src/lib/device-time.ts`), everywhere — visit, visit fiche, deposit, reception, programme « Délai ». A device still on UTC+1 types the hour it reads; the field converts it to the legal hour (« = 18:06 heure légale »), « Maintenant » on end / arrival, « dans le futur » caught next to the field before sending. `LegalTimeHint` deleted.
- §8.2–§8.5: Air and Autre take both families (migration `20261010100000_natures_air_autre`: `PC_AIR`, `MICRO_AUTRE`); « Profil d'analyses » and the série-level « Analyses à effectuer » card gone from the visit only; no « T° produit » on Air.
- Gate review fixed: `MICRO_AUTRE` was filed ALIMENTAIRE while `EFFET_ASEPTISANT` is AMBIANCE — an « Autre » line with both boxes loaded food analyses the server then refused (now AMBIANCE, invariant tested); `linePayload` sent a hidden « T° produit » on Air; client and server « dans le futur » wording aligned; field errors now set `aria-invalid` / `aria-describedby` (`errorId`); the field's two conversions extracted and tested (ahead, behind, midnight, pre-switch).
- Gates: prisma generate, tsc 0, eslint 0, vitest 62 files / 911 tests, `npm run build` green. Not deployed — TESTPLAN V8 is the checkpoint.

### 2026-10-09 — billing, report amendment and client portal live (TESTPLAN X, Y, Z)
- `FACTURATION.md`, `AMENDEMENT.md`, `PORTAIL.md` built in one workflow (foundation, four parallel builders, three hostile reviewers, gates — 878 tests) and deployed (`b938b10`, migration `20261009100000_facturation_rapports_portail`). The reviews fixed a money-rounding bug (half-centimes rounded down at 7/10/14 %), the invoice sheet recomputing totals, an empty role guard that would have admitted CLIENT, cancellation of a sample whose report is issued, page titles leaking the blind code, dashboards counting drafts.
- Production: billing 21/21 (draft → FAC-2026-0007, payments, AV-2026-0001, cancel FAC-2026-0008, PDFs read), amendment 11/11 (RAP-2026-00003-A1, duplicata, versions; reopen without reason now 400), portal 15/16 + checks (only the test client's samples, 19 lab routes refused, no self-escalation, password change). Portal demo account « portail.test » kept for the lab.

### 2026-10-08 — facturation, amendement / duplicata, portail client built (not deployed)
- `FACTURATION.md`: drafts without a number that reserve their samples, « Émettre » drawing `FAC-AAAA-NNNN` in the transaction, cancellation with reason, credit notes `AV-AAAA-NNNN`, settlements (`Payment`) with « Reste à payer », invoice PDF (watermark, stamp, « Réglé »), list filters by state and type, one source for « Facturé / Encaissé » (`billingFigures()`, now also on the vue direction and the commercial dashboard).
- `AMENDEMENT.md`: « Rouvrir pour amendement » (ADMIN), frozen `ReportVersion`s, `-A1` amended reports « annule et remplace », duplicata and version history, alerts re-sent only for changed results; a sample with an issued report can no longer be cancelled, and a reopened sample no longer reads « Facturé avant résultat ».
- `PORTAIL.md`: `CLIENT` accounts tied to a client from `/admin/utilisateurs`, `/portail` (dashboard, list, report PDF, password), lab routes closed to the role (guards with no roles admit lab roles only).
- Gate pass: shared label maps completed (`PAYMENT_MODE_LABELS` from `invoice-lifecycle.ts`, `INVOICE_STATUS_LABELS`), journal labels for every action written in the code, lab pages' titles no longer read a sample for another role, the users page selects the portal client, HANDOFF §1/§3/§4/§5/§8/§9 and TESTPLAN X / Y / Z written.
- Gates: prisma generate, tsc 0, eslint 0, vitest 61 files / 878 tests, `npm run build` green. Not deployed.

### 2026-10-08 — client tools live (TESTPLAN W), open checks of V closed
- `CLIENTS-FUSION.md` deployed (`722da85`, migration `20261008100000_clients_fusion`): merge, attach as site, billing entity (« client facturé ») with « Facturé à » per site, near-duplicate warning. Production recette 36/36 on invented TEST UI W clients (archived afterwards) plus the screens in the browser (actions, preview, banners — including the clients archived by the sites import —, near-duplicate hint). The gate review fixed a real double-invoicing path (a sample of a site billed to a franchisee was still accepted for the principal).
- Checkpoint V: cadre change on the visit page, wording of bench / validation / programmation / reception, bon de réception with twins, protocol with a cancelled twin, sampler form at phone width — all verified on production. The two « unused libraries » of HANDOFF §9 were already gone. The restore test was not re-run: ssh is limited to the deploy line.
- Real clients untouched: the merges wait for the lab's validation of `doublons-clients.xlsx` (Q54).

### 2026-10-07 (night) — clients en double, sites, clients facturés built (`CLIENTS-FUSION.md`)
- Schema + additive migration `20261008100000_clients_fusion` (`Client.mergedIntoId`, `Client.billedForId`, `Site.billingClientId`); pure rules `src/lib/client-identity.ts` (near-duplicates) and `src/lib/client-merge-rules.ts` (merge, attach, billing links, which client a sample is invoiced to), shared server moves `src/lib/client-transfer.ts` (also used by the sites import now).
- Routes: `POST /api/clients/[id]/merge`, `POST /api/clients/[id]/attach-as-site` (ADMIN, preview = the same writes rolled back), `PUT /api/clients/[id]/billed-for`, `GET /api/clients/similar`, « Facturé à » on `PATCH …/sites/[siteId]`, 409 `{ error, similar }` + `confirmDuplicate` on create and rename. Screens: « Actions sur la fiche », « Clients facturés », « Facturé à » per site, « Clients proches » in the client form, « via le site … » on the billable list, archived-fiche banner.
- Gate review fixes: a principal could invoice a sample of a site billed to its client facturé (now refused, one billing client per sample); archiving a client facturé gives its sites back; merge / attach repoint the fiches already merged into B; the sites import sets `mergedIntoId`, and the clients it archived on 07/10 find their parent in the journal.
- Gates: prisma generate, tsc 0, eslint 0, vitest 52 files / 674 tests, `npm run build` green. Not deployed; TESTPLAN W planned.

### 2026-10-07 (night) — clients en double : analyse complète
- Every active client checked against the old database (types client / site / client facturé, parents, ICE, e-mail, phone, city) with strong and weak evidence, three agent passes (classify, refute, consolidate): 355 clients concerned — 74 duplicates, 109 billing entities to link, 14 outlets to attach as sites, 27 to confirm. File for the lab: `legacy-export/doublons-clients.xlsx` (outside the repo). Nothing changed in production; merge / attach actions and the billing-entity link wait for the lab's validation (Q54). `RETOUR-LABO-06-10.md` §7.

### 2026-10-07 — tranches V1 → V6 en production (TESTPLAN V)
- Built in one workflow (foundation: schema + migration, série core, shared line editor, lab APIs; then préleveur, réception, documents, lab screens and sites import in parallel; then gates): 84 files, 616 tests. Deployed (`e30c2b0`), migration `20261007100000_retour_labo_v` applied.
- Recette on production: API script 29/29 and the real screens in the browser (série 6/26 typed as pre1, received as recep1, corrected, programmed as param1; report with its site, série 7/26). Five defects found and fixed the same day (`e83421c`): inherited physico-chimie box, programme natures of another kind, unlinked label, stale received summary, and the sites import that would have archived 4 real clients.
- Sites import run on production: 420 sites under 36 clients, 345 duplicate clients archived, idempotent. Real client names removed from the public docs. Left to the lab: air / physico-chimie parameters (Q50), document versions, Q45–Q52.

### 2026-10-07 (night) — V1 → V6 built (`RETOUR-LABO-06-10.md` §5)
- One migration (cadre widened → séries set to AUTRE → narrowed; `cadreNote`, `surfaceState`, `airMethod`, `AnalysisParameter.family`). Cadre required with four choices, « Service vétérinaire » refused at creation; « Échantillon N » on the circuit and in the messages; Désignation + « État de la surface »; two families per sample → twin samples « …M » / « …P »; air sampling method; sites import + site filter + « Client — Site » on the report and e-mail; analyses optional on visit and deposit.
- Gates green locally: prisma generate, `tsc --noEmit`, `eslint src --max-warnings=0`, vitest (49 files, 614 tests), `npm run build`. Not deployed, not tried in a browser: TESTPLAN V on production.

### 2026-10-07 — retours du laboratoire des 05 → 07/10 : un plan unique V1 → V7
- Nine remarks of 06 and 07/10 (sites of chain clients, no « Service vétérinaire », « Échantillon » instead of « Ligne », « Désignation », nature hidden, air sampling method, two analysis families per sample, cadre Autre / Devis validé / BC / Convention, « État de la surface ») analysed against the code, production and the old database: all feasible, ≈ 43 h. Merged with what is left of 05/10 into **one plan, V1 → V7 (≈ 53 h), 19 h deliverable without any answer (V1, V2)** — `RETOUR-LABO-06-10.md`, which replaces the plan of `RETOUR-LABO-05-10.md`.
- Found while checking: the old software's 426 sites (36 parent clients — the largest chains have 84, 77 and 55 sites) were imported as separate clients, so the largest chain client has no site on production; the report does not print the site; the catalogue has no air parameter. Questions Q45–Q52 in NEEDEDINFO; answers of 06–07/10 recorded. PLAN (V table), WORKFLOW §17, TESTPLAN V (planned), HANDOFF §1 updated. Nothing built yet.

### 2026-10-06 — recette « une journée du laboratoire » en production (TESTPLAN U)
- One prélèvement followed by hand from the visit to the invoice (series 1/26, RAP-2026-00001, FAC-2026-0001), every step re-read after a reload and matched with the audit journal (23 entries, hours and authors) — `RECETTE-06-10-PARCOURS.md`. A second line (2/26, RAP-2026-00002) proves the regulation chosen by the validator is recorded and shown ; yesterday's doubt was the test tool, not the app.
- Fixed and deployed the same day : reception no longer pre-selects a technician (« À attribuer à la programmation » by default on the série reception, the deposit and the bulk select). Questions Q43 (imported types without criteria) and Q44 (print the chosen regulation when a sample has no criteria plan) added to NEEDEDINFO. Test client kept on production for the lab.

### 2026-10-05 (night) — slice PROGRAMME live (TESTPLAN T)
- Built in four workflow phases (foundation, screens ∥ adaptations, gates), 77 files, 400 tests; deployed with migration 20261006100000_programme. Recette on production through the APIs (22 checks) and in the browser as param1: reception without technician, queue, draft / confirm / edit, billing before result, two technicians on one line with 403 and submit lock, dilution ×10 on the report, two technicians printed. One crash found and fixed the same night (verbsFor called from a server page).
- Test client purged, counters 0 / 0. Docs: WORKFLOW §16, DEPLOY, HANDOFF, TESTPLAN T.

### 2026-10-05 (night) — PROGRAMME.md written, slice started
- The lab's oral request detailed: a new role « Responsable des paramètres » (PROGRAMMATEUR) between reception and the bench, a complete programme d'analyse per sample (type and criteria, analyses, numbers, methods, technician per parameter, priority and deadline, instructions, billing preview), status PROGRAMME, billing possible from the programme. Spec: `PROGRAMME.md`; build in four slices P1–P4.

### 2026-10-05 (evening) — the laboratory's requests on the sampler form analysed
- Nine requests (clients from the field, contractual cadre, no more « Service vétérinaire », « Référence client », free text on « Autre », two analysis families per line, surface labels, surfaces as a managed list, analyses and product type decided by the lab): all feasible, ≈ 58 h in four slices — `RETOUR-LABO-05-10.md` (verdict, changes, risks, seven questions to confirm before coding).

### 2026-10-05 (afternoon) — « les prélèvements ne s'enregistrent pas »
- Reproduced on production: the sampler's PC shows one hour more than the legal time (Windows without the Morocco-to-GMT update); retyping that hour in « Prélevé le » makes the server refuse « L'heure du prélèvement est dans le futur » and the visit is never saved. The API and the form with the proposed time work (checked on production and on the local dev server).
- Fix: `LegalTimeHint` under every date-time field (legal time, and a warning when the device is one hour ahead: « gardez l'heure proposée ; mettez l'appareil à jour »), and the refusal messages now state the legal time and the cause (`futureMessage` in labels.ts).

### 2026-10-05 — recette navigateur en production (TESTPLAN S)
- Eight headless-Chrome role agents (interrupted twice, the technician's sweep complete) + a scripted sweep of 75 pages / 25 access rules / 13 documents / phone layout, and the whole circuit by hand in the browser pane (visit → reception → bench → validation → approval → report → deposit → invoice, plus clients, stock, configuration). Reports: `RECETTE-05-10-AUTOMATIQUE.md`, `RECETTE-05-10-MANUELLE.md`.
- Fixed and deployed the same day: unreadable bench readings accepted, sticky manual decision, bench sheet without R1 … Rn / criteria, phone grid, account creation with a hyphen (500), PDF links prefetching a render, tab titles, honorific as first name, badges and plurals. Hardened the laboratory clock against devices whose time-zone data predates Morocco's return to GMT (20/09/2026) — `src/lib/lab-time.ts`.
- Test clients purged, counters 0 / 0, test objects archived. Open for the lab: Q40 (Salmonelles /1g vs /25 g), demo panel until go-live, time-zone update of the lab's PCs.

### 2026-10-01 — recette technique complète en production (TESTPLAN R)
- 70 checks through the APIs on production, every role, every branch (visit, deposit, destroy, blind numbering, bench verdicts of every kind, rejection, regulation, alerts at technical validation, reports, invoice, search/export, role isolation, concurrency refusals): 70/70; nine documents read at the image, one page each.
- Found and fixed: the bon de réception did not say « Détruite » on a destroyed line. Test client purged afterwards, counters back to 0.

### 2026-10-01 (night) — production cleaned, testing moves to production
- The five demonstration clients and everything attached (24 test séries 1/26 → 24/26, 32 samples, 11 reports, 16 e-mail logs, 5 invoices, memory) removed from production with the new audited purge tool; yearly counters back to 0 (next: 1/26). 1 516 real clients remain.
- New in `/admin/reglages`: **Compteurs de numérotation** — on switch-over day the admin types the last N° de série / N° de contrôle issued by the old software.
- From now on verification is done on production (the user's instruction); local = build gate only.

### 2026-10-01 (later) — go-live data on production
- `clients.csv` imported (2 329 rows → 1 516 created; one row per name, 17 rows with a bad ICE / e-mail re-imported with the field blank), `memory.csv` imported (21 878 designations, 3 822 places, 392 clients, 0 unmatched).
- The client import now writes in slices of 200 (a 2 000-row file timed out as one transaction).

### 2026-10-01 — slice J (the old software's catalogue)
- Docker + the restored Firebird base: `scripts/legacy/extract-legacy.py` writes regulations / types / criteria / clients / memory CSV (mixed-charset decoding).
- `legacy-catalogue.ts` (pure, tested) + `/api/admin/import/legacy` + `ImportLegacy`; imported on dev and production: 175 regulations, 399 types (270 inactive), 1 945 criteria, 117 workbook types linked to their regulation; re-run idempotent.
- 299 tests, lint, build. Deployed (`fa3a42c`); production import: 175 regulations, 399 types, 1 945 criteria, 11 norms / 16 versions, 118 workbook types linked; re-run = 0 writes.

### 2026-10-01 — slice I (regulation per sample)
- `Regulation` catalogue + `/admin/reglementations`; defaults per type and per family as pickers; validation requires a regulation for a sample with a product type, proposed from the client product's last choice; frozen on the report. Migration `20261001120000_regulations`.
- 292 tests, lint, build; API circuit 11/11 on dev; validation panel and admin page checked at 1440×900.

### 2026-10-01 — slice H (RETOUR-LABO-30-09.md)
- H1 single limit (m alone, M alone, m = M) tolerates c units above → « Acceptable » (118 real criteria concerned); tolerated unit amber on the report.
- H2 product type removed from the report. H3 destruction e-mail to the client (visit reception and counter deposit), journal `DESTRUCTION_NOTIFIED`, migration `20261001100000_destruction_email`. H4 R1 … Rn everywhere, `unitLetter` deleted.
- 288 tests, lint, build; API circuit 9/9 on dev; labels, report, e-mail and screens checked. Deployed (`7a4494c`) and replayed on production: 9/9 (séries 22/26 and 23/26 = test data, report RAP-2026-00010 with the X under « Acceptable », no product type, labels up to R60).

### 2026-09-30 — answers Q31–Q37 analysed, plan H → K
- The lab's Word reply to the clarification PDF read and mapped: Q31 settled (single-limit tolerance → « Acceptable »), Q32 regulation chosen per sample by the validator, Q33 keep the old 634 types, Q34 types never printed, Q35 client informed, Q36 R1 … Rn everywhere, Q37 confirmed.
- New spec `RETOUR-LABO-30-09.md` (slices H → K); PLAN, HANDOFF, TESTPLAN (checkpoint Q), CRITERES, WORKFLOW, AGENTS, NEEDEDINFO (Q38, Q39 to send) updated. No code change.

### 2026-09-29 (evening) — retour du 29/09, tranches A → F
- A: fuzzy corrector (`similar.ts`) on designation, place and product types; client memory import (samples / legacy CSV).
- B: `judgeUnits` / `informalVerdict` — no official verdict below the plan's n, indicative one for the e-mail; every unit taken counts above n; per-repetition reading for every parameter of a multi-unit line; ceiling 999; R1 … Rn.
- Found by the circuit test and fixed: 101 « Non spécifié » criteria without M blocked their sheets for ever (INCOMPLET) → now read with no verdict.
- C: report on the lab's model, one page (test on 37 germs × 9), criterion and regulation frozen (`Result.criterion`, `Report.regulation`).
- D: report e-mail summary table; alert at technical validation; units in the alert headers; an indicative non-satisfaisant on a sensitive germ still alerts.
- E: « Analyser malgré tout / Détruire » per non-conform line (visit reception and counter deposit), `DETRUIT_A_RECEPTION`; sampler locked to his own account (UI + API).
- F: `/recherche`, client « Synthèse des analyses », Excel export (audited).
- Migrations `20260929100000_retour_labo_29_09`, `20260929110000_report_snapshot` (additive). 285 tests, lint, build green.
- Deployed 2026-09-29 (`0be8208`); API circuit replayed on production (série 21/26) and screens checked — TESTPLAN P-prod. Test séries 21/26 (prod) and 23/26–26/26 (dev) are test data.

- **2026-09-29 · Claude Code** · **Réponses du laboratoire du 29/09 —
  analyse et plan, pas de code.** Leur document répond aux quatorze
  questions du 19/09 : six points sont déjà conformes (notation, lignes
  « 1.8 », dernière version de norme, dilution, N° de série à
  l'enregistrement, non-conformité seulement sur le bon), sept demandent une
  modification (rapport au modèle du labo avec R1 … Rn et tableau de
  conclusion sur une page, pas de verdict officiel sous le n du plan,
  lecture par répétition pour tout paramètre, aucune limite d'unités, plus
  de saisie pour un collègue, destruction au cas par cas, alerte après
  validation technique), cinq sont nouveaux (tableau récapitulatif dans
  l'e-mail, texte de réglementation par type, résumé Excel par client,
  recherche par client / date / type, vrai correcteur). Diagnostic du
  correcteur : il n'accepte que des orthographes identiques et sa mémoire
  est presque vide en production. Spec `RETOUR-LABO-29-09.md`, PLAN,
  NEEDEDINFO Q31–Q37 et archive des réponses, TESTPLAN checkpoint P.

- **2026-09-19 · Claude Code** · **Retour du laboratoire du 19/09** (trois
  remarques sur « Nouvelle visite »). « Manque remarque par ligne » était déjà
  livré. Les deux autres le sont désormais : le **cadre** se choisit sur la
  visite et sur le dépôt (proposé d'après qui prélève, modifiable, verrouillé
  après réception, tracé au journal), et « **Surface prélevée** » avec son aire
  existe sur chaque type de ligne sauf Mains, obligatoire seulement sur une
  ligne Surface, imprimée dans la colonne du protocole. Audit adverse du diff :
  trois constats confirmés corrigés — la désignation d'une ligne mains que la
  surface écrasait, la sauvegarde du panneau d'arrivée qu'un cadre inchangé
  faisait échouer après réception, et le champ surface promis sur une ligne
  mains. TESTPLAN checkpoint O. 257 tests, lint et build verts.

- **2026-09-18 · Claude Code (soir)** · **Recette du circuit complet + audit
  adverse.** Une série menée de bout en bout sur le serveur de développement
  (visite 3 lignes → réception → paillasse par unité et valeur simple →
  validation à deux signatures → 3 rapports → alerte → facture), plus un audit
  multi-agents du circuit entier (8 angles, 24 constats triés). **Dix défauts
  réels corrigés**, dont une régression qui cassait le protocole et le bon de
  réception depuis le 14/09 (collision de la classe CSS `.box`), le critère
  imprimé au lieu du plan appliqué, l'alerte qui ne repartait jamais après un
  retour en paillasse, l'émission de facture non tracée, deux colonnes de 191
  caractères qui pouvaient faire échouer une écriture après l'envoi du mail,
  une ligne de dépôt sans technicien invisible de toutes les files, et le
  ré-import qui dupliquait un type de produit rattaché à un client. Quatre
  constats écartés après vérification au rendu. TESTPLAN checkpoint N.
  251 tests, lint et build verts.

- **2026-09-18 · Claude Code** · **Phase 9 chantier 2 delivered** (spec
  `CRITERES.md`): criteria are data now. New tables `ProductType`, `Norm`,
  `NormVersion`, `Criterion`, `ConclusionScale`, `ResultUnit` (+ `Sample.
  productTypeId`, `Result.normVersionId/interpretation`, `Report.
  interpretation`, `AnalysisParameter.aliases`), two additive migrations.
  Pure engine `src/lib/interpretation.ts` (3-class plans n/c/m/M, absence,
  m-only, M-only, dilutions, INCOMPLET) and workbook parser
  `src/lib/criteria-import.ts`, both tested. `POST /api/admin/import/criteres`
  (exceljs, analyse → commit, idempotent) with its section on `/admin/import`;
  admin screens `/admin/types-produits`, `/admin/types-produits/[id]`,
  `/admin/normes`, conclusion scale on `/admin/reglages`. Product type on the
  line (préleveur, dépôt, « Corriger la fiche »), bench grid per unit with the
  live verdict, verdicts on `/validation/[id]`, report with the criterion, its
  norm version, the readings A…E and the scale's conclusion. The lab's real
  workbook imports on dev: 1 075 criteria, 131 product types, 44 norm
  versions, 2 refused rows (the two « 1.8 » of Q25). Adversarial review of the
  diff: 3 confirmed defects fixed (mixed sample verdict, alert threshold,
  stale results after a correction) plus 12 triaged findings. 251 tests, lint
  and build green. Next: production import + recette.

- **2026-09-14 · Claude Code** · **Chantier 2 specified from the lab's
  criteria workbook (`CRITERES.md`, docs only).** The file « critère
  d'interprétation des résultats » (1 493 rows) parsed outside the repo:
  131 product types (35 client-named), 1 101 criteria, 62 parameter labels
  (aliases), 44 norms with old + new versions side by side, n = 5
  everywhere, c ∈ {∅,1,2,3}, « 1.102 » notation, absence / M-only / m-only
  / 3-class plans. Also a photo of the old software's invoice report picker
  (seven layouts) filed under chantier 5. PLAN, NEEDEDINFO (Q25–Q30),
  HANDOFF updated.

- **2026-09-14 · Claude Code** · **Phase 9 · chantier 1 · slice 1b
  shipped — « le protocole tel quel ».** `VisitForm` rewritten in the
  paper's order (N° de série slot, site select always shown with inline
  creation, cadre, fin, effectué par from `GET /api/preleveurs`, arrivée,
  T°, N° de factures, the two boxes at the foot); `LineEditor` puts the
  type first (`natureForKind` derives the nature) and accepts n 1–50 by
  number; `unitLetter` goes A…Z, AA…; `Serie.analysesMicro` /
  `analysesChimie` (migration `20260914100000_phase9_protocole`, backfilled)
  travel through `validateSerie` / `createSerie` (derived from the lines
  when not ticked), the selects, the protocol PDF (CSS boxes, « Fonction »)
  and the série reception page (flag when no line matches);
  `Serie.samplerUserId` may name a colleague; « Siège » always accepted;
  future end / arrival refused. Browser-verified (série 14/26, 36 labels,
  15/26 flag) on the dev server and on the VPS; TESTPLAN L1b.

- **2026-09-14 · Claude Code** · **Retour du laboratoire sur « Nouvelle
  visite » → slice 1b planned (docs only, no code).** Nine points checked
  one by one against the form, the visit page and the protocol PDF
  (`WORKFLOW.md` §13): all nine exist in the model and on the PDF; six are
  screen placement (end-of-visit fields on a second panel, site hidden when
  the client has none, N° de série only after save), two are rules (n ≤ 26
  → 50; « Surface prélevée » only under the surfaces nature), one is a
  missing série-level pair of boxes (analyses à effectuer). Spec, TESTPLAN
  L1b, NEEDEDINFO Q21–Q24, PROGRESS next action updated; the recette (slice
  6) follows slice 1b.

- **2026-09-13 · Claude Code** · **Phase 9 · chantier 1 · slice 5 shipped.**
  `sample-status.ts` gains the ANNULE transitions (+ `CORRECTABLE_STATUSES`,
  `reactivationTarget`); `intake-input.ts` (pure, tested) re-applies the
  protocol's line rules to a correction and keeps only real changes;
  routes `PATCH /api/samples/[id]/intake`, `POST …/cancel`, `POST
  …/reactivate` (all audited); `SampleVerbs` dialogs on the série reception
  page and the validation view; `serie-groups.ts` groups the technician and
  validation queues by série; old routes and components deleted
  (`POST /api/samples`, `…/reception`, `/reception/[id]`, `/preleveur/nouveau`,
  `ReceptionForm`, `PrelevementSuccess`); `TechnicianOption` moved to
  `reception/types.ts`. Browser-verified on the dev server and on the VPS;
  TESTPLAN L5.

- **2026-09-13 · Claude Code** · **Phase 9 · chantier 1 · slice 4 shipped.**
  `profile-input.ts` / `site-input.ts` (pure, tested); `/api/profiles`
  (+ `[id]`), `/api/clients/[id]/sites` (+ `[siteId]`),
  `/api/clients/[id]/memory`; `ProfilesManager` at `/admin/profils`,
  `SitesManager` on the client fiche; `LineEditor` shows the nature's
  profiles as chips (one tap = analyses + n) and the « déjà connu sous »
  hint; `createSerie` stores the memory's canonical spelling of a place or
  product; the visit form carries « prélèvement effectué par » (cadre
  derived). Seed: two generic profiles. Legacy sites import deferred to the
  reprise. Browser-verified on the dev server (série 12/26) and on the VPS;
  TESTPLAN L4.

- **2026-09-13 · Claude Code** · **Phase 9 · chantier 1 · slice 3 shipped.**
  `DepositForm` (`/reception/nouveau-depot`): the bon de réception at the
  counter — sampler kind, déposé par, advance (amount + mode, new columns
  on `Serie`), lines with temperature at arrival, live checklist, coded
  conformity and technician; `validateSerie` / `createSerie` carry the
  reception data of a DEPOT and the API re-runs the rules. Documents:
  `document-html.ts` builds the protocole (PG04/EN01) and the bon
  (PG05/EN04) like the paper, `GET /api/series/[id]/document` (préleveur:
  own visit only), cartouche + « Page x / y » footer (`renderPdf` option),
  bench sheet cartouche; `document-types.ts` / `document-reference.ts`,
  `/admin/documents` + `PUT /api/admin/documents` (audited). Migration
  `20260913230000_phase9_depot`. Browser-verified on the dev server (série
  11/26 → 9111/26) and on the VPS; TESTPLAN L3.

- **2026-09-13 · Claude Code** · **Phase 9 · chantier 1 · slice 2 shipped.**
  `reception-rules.ts` (the seven rules of the bon de réception, thresholds
  in `LabSettings`, defaults = the paper form) + `reception-input.ts`, both
  pure and tested; `POST /api/series/[id]/reception` numbers every line in
  one transaction (coded motif `conformityReason`, technician per line,
  série arrival + cooler temperature); `/reception` lists séries;
  `/reception/series/[id]` = live checklist per line, forced non-conformity
  under a blocking rule, read-only summary once received; labels PDF
  (`/api/series/[id]/labels`, A4 3 × 8, Code128 via `bwip-js`, one label per
  unit with its letter); `/admin/reglages` edits the thresholds. Migration
  `20260913220000_phase9_reception` (additive). Browser-verified on the dev
  server (séries 8/26 and 10/26) and on the VPS; TESTPLAN L2.

- **2026-09-13 · Claude Code** · **Phase 9 · chantier 1 · slice 1 shipped.**
  Schema + additive migration with backfill (one série per existing sample,
  16 natures, counters seeded), `counters.ts` / `series.ts` / `serie-input.ts`
  / `serie-create.ts`, routes `/api/natures`, `/api/series` (+ `[id]`),
  legacy `POST /api/samples` kept as a one-line série, reception drawing
  NNNNN/AA. Préleveur: « Nouvelle visite » multi-line, « Mes visites »,
  visit detail with « Arrivée au laboratoire ». Every lab screen and PDF now
  prints the N° de contrôle + the série number (the random serial is gone).
  Sidebar bug (wrong role nav after a click) fixed by `RoleShell` +
  `navFor(role)`. Browser-verified end to end on the dev server (série 9/26 →
  9103/26 → RAP-2026-00004) then deployed; TESTPLAN L1.

- **2026-09-13 · Claude Code** · **Analyse de l'ancienne base + formulaires papier → Phase 9.**
  Firebird `DBQLabo.fbk` restored in Docker (`qlabo-fb`), 252 tables read;
  four paper forms transcribed; 100 findings in 6 areas (workflow multi-agent,
  2 verifier passes completed); French report (28 p.) delivered outside the
  repo. Repo: `WORKFLOW.md` (chantier 1 spec), PLAN Phase 9, NEEDEDINFO
  Q1–Q20, DEPLOY « Point de retour », AGENTS §3b. Restore point: tag
  `v1.0-avant-phase-9` + VPS dump `qualilab_avant-phase-9.sql.gz`.

- **2026-09-09 · Claude Code** · **Recette navigateur du circuit complet en
  production.** Parcours repris entièrement à la main dans le navigateur sur
  http://185.217.126.53, en 1440×900, du prélèvement au rapport et à la
  facture encaissée, un compte après l'autre (QL-2026-00014 →
  QLC-2026-00010 / SN-M4N0-1Q4Q → RAP-2026-00004 → FAC-2026-0004). Tout le
  circuit tient : garde-fous de saisie, conformité calculée en direct,
  double validation, alerte de contamination, PDF, journal d'audit complet.
  **Trois défauts visibles par le client trouvés et corrigés le jour même** :
  les exposants au-delà de ³ disparaissaient des PDF (le conteneur n'a que
  Liberation Sans, sans U+2074 — un seuil « 1.10⁴ UFC/g » s'imprimait
  « 1.10 UFC/g ») → exposants convertis en `<sup>` + fonts-dejavu-core ; la
  feuille de paillasse était datée de la veille toute la journée (minuit
  local = 23 h UTC la veille) ; trois nombres non francisés (« 1030.00 DH »,
  « 5.5 % », « 9.4 °C »). L'espace comptabilité annonçait encore en
  « prochaines fonctionnalités » les écrans de la phase 4, livrés depuis.
  Déployé et revérifié en production. Détail : TESTPLAN checkpoint K.

- **2026-09-09 · Claude Code** · **Audit round 2 + recette de production
  avant la présentation client.** Second passage adversarial (5 relecteurs)
  lancé contre le commit du round 1 lui-même, puis 99 contrôles exécutés en
  direct sur http://185.217.126.53. **Une vraie régression trouvée et
  corrigée** : la revendication d'alerte marquait `alertsSentAt` avant de
  résoudre les destinataires, donc un client sans adresse d'alerte était
  enregistré comme alerté à jamais — destinataires résolus d'abord, claim
  relâchée sur exception, et `report/send` rejoue désormais les alertes.
  Deux pièges de démonstration fermés : l'admin qui signe l'étape 1 ne se
  voit plus proposer l'approbation (que l'API refusait de toute façon), et
  le conteneur tournait en UTC — toutes les heures affichées avaient une
  heure de retard → `TZ=Africa/Casablanca` + zone explicite dans les
  formateurs (supprime au passage un écart d'hydratation sur
  /qualite/temperatures). Aussi : rôle CLIENT non attribuable tant que le
  portail n'existe pas, fiche client du gestionnaire qui renvoyait ses
  factures dans l'espace admin, gardes de page sur réception et préleveur,
  normes et tarifs fermés aux rôles qui ne les consomment pas, longueurs de
  colonnes validées (400 au lieu de 500), `reject` en 409 sur course,
  suppression définitive de compte fermée, feuille de paillasse plus
  préchargée (c'était un rendu Chromium par affichage de page),
  `restore-db.sh` qui recrée la base et rejoue les migrations,
  `vps-first-deploy.sh` qui ne prend plus un échec de requête pour une base
  vide. **Ajout fonctionnel** : l'encaissement d'une facture client
  (`PATCH /api/invoices/[id]/payment`, COMPTABLE + ADMIN, journalisé) — le
  cycle s'arrêtait à « émise » et « Encaissé » restait à zéro. Données de
  démonstration créées en production : fournisseurs, stock avec alerte de
  seuil, factures d'achat, équipements + étalonnages + températures dont une
  hors plage, campagnes EIL, et une file d'échantillons à chaque étape du
  circuit. 137 tests, build + lint, déployé.

- **2026-09-07 · Claude Code** · **Full adversarial audit + fix round 1.**
  8 finders / refuters over security, correctness, data, ops, docs (69 raw
  findings; 4 confirmed above low, the rest judged by hand). Fixed: API
  guards (circuit roles only, technician bench isolation), logo data-URI
  whole-string validation, alerts claim-then-send, report creation retry +
  self-heal, approver ≠ validator, blocked samples refuse results, factored
  « Absence » kept, DB-aggregate stats endpoints, on-screen invoice identity,
  rounding at write, enum/length validation, P2025 → 409, TOCTOU guard,
  every page guarded itself, Escape closes the drawer, backup via temp file
  + completion marker, go-live demo shutdown script + DEPLOY.md section.
  Also: client « système livré » schema PDF and the 3-min role video.
  132 tests, build + lint green; deployed.

- **2026-08-27 (quater) · Claude Code** · **Phase 7 — Système Qualité,
  built and deployed.** `/qualite` space (VALIDATEUR + ADMIN, linked from
  both menus): métrologie (Equipment register, `calibrationDue()` judge —
  RETARD / BIENTOT ≤30 j / JAMAIS, records advance lastCalibratedAt only
  when newer), relevés de température (per-equipment bounds, verdict
  stored at write time so bound changes never rewrite history, board with
  live HORS PLAGE flags; POST also open to TECHNICIEN), EIL campaigns
  (statuts, z-score, verdict), quality dashboard rolling up étalonnages à
  traiter / excursions 7 j / campagnes ouvertes. Admin menu also gained
  the Achat & Stock link (full-visibility parity). 4 tables, 5 audited
  API routes, 16 new tests (128 total). Browser-verified as valid1: due
  date 2025-09-10 +12 mois → « Bientôt — dû 10 sept. », 4,2 °C conforme
  → 9,5 °C HORS PLAGE, BIPEA campaign to « Résultats reçus ·
  satisfaisant », dashboard counts exact. Also: parity decision honoured
  (magasin1 visible + created on prod, stale tech2 panel entry fixed).
- **2026-08-27 (ter) · Claude Code** · **Phase 6 — Achat & Stock, built and
  deployed HIDDEN.** New MAGASINIER role (9th; auto-appears in the users
  screen, excluded from the demo panel), `/magasin` space (dashboard, stock,
  fournisseurs, factures fournisseurs) behind
  `requireRole("MAGASINIER","ADMIN")` with NO admin-nav entry — invisible
  until Achraf prices/reveals it. Data model: Supplier (paymentTermDays),
  PurchaseInvoice (dueDate defaulted from the convention, status A_PAYER/
  PAYEE, [status,dueDate] index), StockItem (DECIMAL quantities, seuil),
  StockMovement (ENTREE/SORTIE/AJUSTEMENT, optional lot+péremption). Rules:
  quantity written ONLY by the movements route in a guarded transaction
  (concurrency-safe, refuses negative stock); dueState() single judge of
  lateness (RETARD / BIENTOT ≤7 j). 7 API routes, all audited; 17 new lib
  tests (112 total). Browser-verified full circuit: supplier 60 j → invoice
  without due date got +60 j; retard badge + dashboard alert; stock 0→25→7
  with lot, low-stock alert on/off/on, over-drain refused; mark-paid
  reversible. Migration casing-clean (new tables). Reveal = create a
  MAGASINIER user in /admin/utilisateurs.
- **2026-08-27 (bis) · Claude Code** · **Front & UX polish pass.** Sidebar:
  pinned brand/footer with a thin dark-friendly scrollbar (`.nav-scroll`)
  instead of the glaring native one, compact 38px items on desktop (44px
  kept on touch) — a 768px laptop now fits the admin menu without
  scrolling; fixed the double-active nav ("Prélèvements" anchors to
  `#prelevements` instead of duplicating `/admin`). Added `loading.tsx`
  skeletons for all 7 role spaces (navigation shows the page's anatomy
  instantly instead of freezing), per-page browser-tab titles via a
  metadata template, smooth anchor scrolling with reduced-motion respected
  globally, pointer cursors restored on buttons (Tailwind v4 preflight),
  skip-link « Aller au contenu », focus rings on sidebar links, aria-label
  on the icon-only logout, and the login form now welcomes password
  managers (`autocomplete username/current-password` — it actively blocked
  them). Dropped the never-used Poppins 300 weight. Verified in the
  browser at 1280×660 and 375×812: zero horizontal overflow on every main
  page, drawer intact. 95 tests, build+lint green.
- **2026-08-27 · Claude Code** · **Pack d'indépendance — the code is
  finished.** New `LabSettings` singleton + `/admin/reglages` (ADMIN):
  decision n°10 as a real blocking flow (non-conform → received, numbered,
  unassigned; « Bloqués » section on /reception; ADMIN-only release =
  assignment; amber banner on the direction view) and n°11 as early alerts
  at technical validation guarded by `Sample.alertsSentAt` (browser-proven:
  EmailLog +1 at validation, unchanged at approval). `calcFactor` on
  AnalysisParameter: raw reading × factor = final value everywhere
  (suggestion, saisie hint, report, alert); `Result.rawValue` keeps the
  bench entry. Logo upload in `/admin/entreprise` (data URI ≤300 Ko,
  double-validated) printed by all three PDF templates via shared
  `brand-html.ts`. `/admin/import`: CSV parser + header-guessing mapping +
  dry-run + audited create-only commit, reusing validateClient — verified
  in the browser (1 created with recipient email, 1 invalid with
  Excel-accurate line, 1 DB duplicate ignored). One migration
  (casing-checked!), 95 tests, build+lint green, full circuit re-run with
  blocking + factor + early alert. Local fixtures reset after testing.
- **2026-08-26 (bis) · Claude Code** · **Full circuit passed on production.**
  Walked QL-2026-00001 through the entire live system: réception (blind
  numbers QLC-2026-00001 / SN-03XP-7Q1W generated, technician assigned) →
  saisie (`8,9.10²` parsed to 890, auto-flagged non-conform vs the 1.10²
  E. coli limit) → technical validation (recorded with name/timestamp) →
  admin approval → report RAP-2026-00001 + PDF renders (59 KB) → EmailLog
  shows RAPPORT + ALERTE_CONTAMINATION both SIMULE → préleveur pages
  contain zero QLC-/SN- strings. TESTPLAN F4 fully ticked. What's left is
  no longer code: recette with the lab, domain→HTTPS, NEEDEDINFO items.
- **2026-08-26 · Claude Code** · **DEPLOYED — the system is live on
  http://185.217.126.53.** Audited the VPS (Ubuntu 24.04, healthy) and kept
  it instead of reformatting; dumped the old prototype's demo DB, retired
  PM2 + native MySQL, archived the old app, closed port 3000. First Docker
  deploy surfaced five real portability bugs, each fixed and pushed:
  fresh-clone Dockerfile break (gitignored src/generated), build-time env
  for page-data collection, table-name casing in ALL migrations (Windows
  MySQL hid it), missing dotenv then the whole Prisma-CLI tree in the
  runtime image (→ migrations + seed now run from the build stage via a
  one-shot `migrate` compose service), pruned playwright-core missing
  browsers.json (PDF 500). Also: `AUTH_COOKIE_SECURE` passed through
  compose (HTTP login), TCP-forced db healthcheck + migrate retries
  (first-volume init race), `NEXT_PUBLIC_DEMO_MODE` as build arg,
  `scripts/vps-first-deploy.sh` (idempotent one-liner deploy) and
  `scripts/seed-docker.sh`. Backup cron installed; **restore tested for
  real**; live smoke pass green (health, HTTP login admin + réception,
  dashboard, invoices, in-container PDF). Next: full circuit on the live
  server with Achraf, then domain → HTTPS.
Newest first. One line per session: date · platform · what changed · next.

- **2026-08-25 · Claude Code** · **Phase 5 code portion.** Built the direction
  view (pipeline, turnaround, billed/collected, status bars) and moved the
  dashboard search into the database so any code finds any sample from any
  year — and closed an oracle this created: a préleveur searching a serial
  number would have learned which of their samples carries it, so their search
  now excludes the laboratory numbering, verified both ways. Wrote the
  production artifacts: Dockerfile with Chromium, compose stack with private
  DB and boot-time migrations, guarded backup/restore scripts, DEPLOY.md
  runbook. Production build smoke-tested: health OK, HSTS present. What
  remains needs the VPS or the lab.

- **2026-08-25 · Claude Code** · **E3 part 2 — Phase 4 complete.** Users:
  accounts created through Better Auth's admin API, disabling revokes the
  sessions immediately and the next login is refused, the admin cannot touch
  their own account, everything audited. Catalogue: French-decimal prices,
  deactivation propagates to the billable proposals. Entreprise: the printed
  identity moved to the database with a static fallback — saving a new ICE is
  data entry and the very next document carries it, verified. One build break
  found and fixed properly: importing the DB accessor from a client component
  dragged the mariadb driver into the browser bundle, so company.ts is now
  pure data and company-server.ts (server-only) holds the query.

- **2026-08-25 · Claude Code** · **E3 part 1 — the norms screen and the
  journal.** `/admin/parametres` is where the laboratory's real limits will be
  entered: per-domain list, editing audited with before/after, provisional
  values labelled as such on the screen itself. The rule that a sensitive
  parameter must carry a limit is enforced and tested — without it the alert
  it promises could never fire. `/admin/journal` shows the last 200 actions in
  plain French, newest first, read-only. Both verified in the browser,
  including the guards. Next: users & catalogue.

- **2026-08-25 · Claude Code** · **Closed both gaps E2 surfaced.** The comptable
  now has their own invoice space rather than screens locked behind an
  admin-only route — the components are shared, and their links follow the
  space they are rendered in so nobody is bounced. The invoice is rendered
  server-side like the analysis report: selectable text, real page breaks, the
  amount in words and the RIB, instead of a flattened screenshot of the page.
  Removed the screenshot code and the two libraries it needed. Next: E3,
  administration — including the screen where the lab's real norm limits will
  be entered.

- **2026-08-25 · Claude Code** · **Phase 4 · E2 — invoicing from validated
  analyses.** A client's validated samples now become invoice lines at
  catalogue prices, priced by domain, with unpriced analyses flagged rather
  than billed at zero. Each line records the sample it bills, which is what
  makes double billing impossible — verified: the samples leave the list and a
  second attempt is refused by name. Fixed a real defect found while testing:
  the line désignation was a required dropdown, not a field, so lines added
  from analyses could not be submitted and the client's requirement to control
  the wording was unmet. Two gaps recorded for the next step: the comptable
  cannot reach the invoice screens, and the invoice PDF is still a screenshot.

- **2026-08-25 · Claude Code** · **Test suite, then Phase 4 · E1 — clients.**
  Added vitest and 55 tests over the rules that would be expensive to get
  wrong: reading a bench value, money, the state machine, and now client
  validation. `npm test` joins build and lint in the definition of done. Built
  the client base: creation, editing, archiving rather than deletion, the
  multi-address recipient list the alerts depend on, and the fiche 360° showing
  a client's samples, reports, invoices and totals on one screen. Two
  environment problems fixed on the way — a stale Prisma client in the running
  dev server, and a transitive dependency pruned by an earlier uninstall.
  Next: E2, invoicing from validated samples.

- **2026-08-25 · Claude Code** · **Audit of the inherited prototype before
  extending it.** The demo code stored every amount as `Float`, accepted a
  negative unit price, had no index on `Invoice`, generated sequential numbers
  unsafely, showed Next's raw error screen, sent no security headers, and
  carried three dead dependencies. All fixed and verified. Money is now
  `DECIMAL(12,2)` with conversion at every boundary — the type checker found
  each read site, and the JSON ones were handled explicitly since it cannot see
  those. Remaining debt is written down: the invoice PDF is still a client-side
  screenshot, and there are no automated tests.

- **2026-08-25 · Claude Code** · **Performance pass so the system stays fast as
  the database grows.** Added cursor pagination to the two lists that grow
  without bound (samples, invoices) and the composite indexes matching how the
  screens actually query; `Invoice` had no index at all. Fixed a bug this
  introduced in the invoice list, whose payload guard silently emptied the
  table. Also brought `PLAN.md` up to date — it had not been marked as phases
  were delivered.

- **2026-08-25 · Claude Code** · **Phase 3 delivered.** Approval now produces
  the official report (three signatures, selectable text, rebuilt on demand
  from a frozen snapshot), emails it to the client's address list, and fires
  the contamination alert — grouped per germ, lab in copy, reproducing the
  model the client sent on 17/08. Verified with their own figures: 8,9.10²
  against a limit of 1.10² on E. coli. Added the feuille de paillasse and the
  admin's unaudited edit. Where the lab still owes us something (DNS, official
  limits) the code is complete and runs in a clearly-labelled simulation mode
  rather than being left unwritten. Next: Phase 4.

- **2026-08-25 · Claude Code** · **Phase 2 · C3 delivered — double validation.
  Phase 2 is complete.** The two approvals the client confirmed are now
  enforced: the validateur signs off technically, the admin approves, and only
  the second step sets the status to VALIDE. Neither can act alone — both
  shortcuts are refused server-side with an explanatory message. Rejection
  requires a motif, returns the sample to the technician and clears the
  technical sign-off so corrected results are re-validated from scratch.
  "Attente admin" is modelled as a derived state rather than a seventh status,
  so the six statuses in the client's specification stay exactly as promised.
  Build + lint green, browser-verified. Next: Phase 3 reports and alerts.

- **2026-08-25 · Claude Code** · **Phase 2 · C2 delivered — saisie des
  résultats.** Applied the five schema additions the contamination alerts need
  and seeded provisional NM norms. Added `result-value.ts`, which reads the
  notation the lab actually writes (`8,9.10²` → 890, `< 10`, `Absence`) so a
  result can be compared to its limit — verified against the two values in the
  client's own alert email. Built the bench sheet: per-parameter entry with
  automatic conformity, anomaly descriptions, save-and-resume, and submission
  gated on completeness. Technician isolation is enforced server-side via
  `sample-access.ts`. `produit` + `N° de lot` are now captured at reception.
  Build + lint green, browser-verified end to end. Next: C3 double validation.

- **2026-08-23 · Claude Code** · **Phase 2 · C1 delivered — réception.** Built
  the blind numbering (sequential control code + crypto-random serial), the
  reception queue, the verify screen, conformity with mandatory motif, and
  technician assignment with workload. Closed a real leak found during the
  analysis: `/api/samples` returned the raw row, so the préleveur would have
  received the laboratory numbering — now every read goes through
  `sample-select.ts`, which omits it at the query. Fixed a UX bug caught in the
  browser (router.refresh destroyed the panel carrying the numbers) and
  deduplicated `SAMPLE_STATUS_LABELS`. Build + lint green, browser-verified
  end to end. Next: C2 result entry.

- **2026-08-18 · Claude Code** · Expanded `TESTPLAN.md` into the complete
  browser test path for every phase (A–G + regression suite + cross-cutting +
  sign-off log), with Phase 1 results kept. Logged the working method: build
  continuously, pause only when a task truly needs missing lab information.

- **2026-08-18 · Claude Code** · Client sent a model **contamination alert
  email**: new requirement added to PLAN (Phase 3) + HANDOFF (item 12). It
  forces 5 schema additions in Phase 2 (numeric results, alert flags + limits,
  produit/lot, multi-email clients, EmailLog type). Captured the lab's real
  contact details for `company.ts`. No code changes yet.

- **2026-08-18 · Claude Code** · Client answered the open questions; decisions
  locked in HANDOFF section 8 (double validation both-approve, blind dual
  numbering, NM-norm defaults, legacy import-only, MAGASINIER role, no
  silent-edit log, portal admin-managed). PLAN Phase 2 updated accordingly.
  No code changes.

- **2026-07-29 · Claude Code** · **Phase 1 delivered.** Installed Better Auth
  1.6.25 (username + admin plugins), replaced the custom jose/bcrypt auth,
  added the central `requireRole`/`requireApiRole` guard and moved every page
  and API route onto it. Extended Prisma: 7 roles + CLIENT, Result/Report/
  AuditLog/EmailLog, Sample actor + reception-numbering fields; migration
  applied; seed now creates one user per role. Added `logAudit()` and the
  sample status state machine. Built the 5 new role spaces with live
  indicators. Fixed a real CSRF/origin bug (`trustedOrigins`) that would have
  broken login on the VPS, and a pre-existing lint error. Build + lint green,
  browser-verified. Created `TESTPLAN.md`. Next: Phase 2 reception.
- **2026-07-27 · Claude Code** · Analyzed prototype against client scope; locked
  stack; created cross-platform doc system (AGENTS, CLAUDE, HANDOFF, PLAN,
  PROGRESS, CODE_QUALITY). Baseline `npm run build` GREEN. Ran Better Auth
  compatibility spike → GREEN; decision logged, adopting it as Phase 1 task 1.
  Next: install + integrate Better Auth.
