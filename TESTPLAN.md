# TESTPLAN.md — browser test path

> **What this is.** Everything that must be clicked through in a browser to
> prove the system works, phase by phase. At the end of the project this file
> *is* the acceptance test: someone non-technical can run it top to bottom.
>
> **Rules**
> - When a phase is finished, **fill in / extend its section** and tick what was
>   actually verified. Never delete an earlier section.
> - Only tick `[x]` for what you **saw working in the browser**. Not "should work".
> - If something fails, leave it `[ ]` and write the problem underneath.
> - Anything not yet built stays `[ ]` — the list is written in advance on
>   purpose, so nothing is forgotten.
>
> **Demo accounts** (all password `password`):
> `pre1` (préleveur) · `recep1` (réception) · `tech1` (technicien) ·
> `valid1` (validateur) · `commercial1` (commercial) · `compta1` (comptable) ·
> `admin` (administrateur)
>
> **Run the app:** `npm run dev` → http://localhost:3000
> **Reset the data:** `npm run db:seed` (wipes and re-creates the demo data)
>
> Legend: `[ ]` to test · `[x]` verified · `[!]` failed (explain below the line)
> · `[–]` withdrawn (the rule changed — the line says when and what replaces it)

---

## 0. Regression suite — run before **every** client demo

The short list that proves nothing broke. ~5 minutes.

- [ ] Log in as `admin`, then log out. No error in the page.
- [ ] Log in as `pre1` → create a prélèvement end-to-end → success screen shows.
- [ ] `admin` → `/admin/factures` → open an invoice → download the PDF.
- [ ] Open the app on a phone-sized window: login + préleveur form usable.
- [ ] No red error overlay anywhere during the run.

---

## Checkpoint A — Authentication & access control
*Phase 1 · Status: ✅ verified 2026-07-29*

### A1. Login
- [x] `/login` shows the Qualilab form (username + password).
- [x] Wrong password → French error, stays on the page.
- [x] Correct credentials → lands on that role's dashboard.
- [ ] Empty fields → browser blocks submission.

### A2. Session
- [x] Refreshing the page keeps you signed in.
- [x] Visiting `/login` while signed in → redirected to your dashboard.
- [x] "Déconnexion" → back to `/login`.
- [x] After logout, opening a protected page → `/login`.
- [ ] Session survives closing and reopening the tab (7-day cookie).

### A3. Access control — the security check
- [x] `tech1` opening `/admin` → sent back to `/technicien` (no blank page).
- [x] `tech1` calling `/api/invoices` → **403 "Accès refusé."**
- [x] Signed out, calling `/api/samples` → **401 "Non autorisé."**
- [x] `pre1` opening `/comptabilite` → sent back to `/preleveur`.

### A4. No regression on the approved prototype
- [x] `admin` → `/admin/factures` lists the 2 seeded invoices, totals correct.
- [x] `pre1` → `/preleveur/nouveau` loads clients, parameters, timestamp.
- [ ] `/admin/factures/nouvelle` creates an invoice end-to-end.
- [ ] Invoice PDF downloads from the invoice detail page.

---

## Checkpoint B — 7 roles, data model & dashboards
*Phase 1 · Status: ✅ verified 2026-07-29*

### B1. Every role reaches its own space

| Account | Lands on | Sidebar label |
|---|---|---|
| `pre1` | `/preleveur` | Préleveur |
| `recep1` | `/reception` | Réception |
| `tech1` | `/technicien` | Analyses |
| `valid1` | `/validation` | Validation qualité |
| `commercial1` | `/commercial` | Gestion commerciale |
| `compta1` | `/comptabilite` | Comptabilité |
| `admin` | `/admin` | Administration |

- [x] All 7 accounts log in and land on the correct dashboard.
- [x] Each dashboard shows the signed-in user's name (top right).
- [ ] Each sidebar shows that role's menu; "Phase 2/3/4" items are not clickable.

### B2. Dashboard indicators show real data
- [x] `/comptabilite` → Factures **2**, En attente **2**, Payées **0**, Encaissé **0,00 DH**.
- [x] `/reception` → "À réceptionner" = **1** (the seeded sample).
- [x] `/commercial` → Clients **5**, Échantillons **1**.
- [x] `/validation` → all counters **0**.
- [x] `/technicien` → counters render.

### B3. Data isolation
- [ ] `pre1` sees only their own prélèvements.
- [ ] `tech1`'s counters only count samples assigned to them. *(13/10: « À
      commencer » / « En analyse » count the samples tech1 holds; « À
      prendre » counts the shared list — V14)*

### B4. Responsive & accessibility
- [x] Mobile (375px): sidebar becomes a burger menu, dashboards readable.
- [ ] Tab through the login form: focus visible on every field and button.
- [ ] Text contrast readable on mobile.

---

## Checkpoint C — LIMS core (Phase 2)
*C1–C8 verified — Phase 2 complete*

### C1. Réception — the queue
- [x] `recep1` → `/reception` lists every sample at status **Prélevé**.
- [x] Each row shows client, lieu, type, date, and the préleveur's name.
- [x] The queue count matches the dashboard indicator.
- [x] Empty state is shown when nothing is waiting (not a blank page).
- [x] The queue empties after a reception and the counters update.

### C2. Blind numbering — **the anti-cheating rule**
- [x] Before reception, the sample has **no** control code and **no** serial number.
- [x] `pre1` (the préleveur) **never** sees a control code or serial number —
      verified at the API: `/api/samples` returns neither field, even for a
      sample that has already been received.
- [x] On reception, the system generates **both**: `controlCode` (official) and
      `serialNumber` (blind analysis code).
- [x] Serial numbers are **non-consecutive and unpredictable**
      (observed: SN-7QEG-KZG5 · SN-19GJ-ATEY · SN-KNB6-D1XC).
- [x] Control codes are sequential and unique (QLC-2026-00001 → 00003).
- [x] Both numbers are shown to the réceptionniste after reception, large and
      copiable, to label the physical sample.

### C3. Conformity
- [x] Réceptionniste can mark a sample **conforme**.
- [x] Marking **non-conforme** requires a reason — refused without one, both in
      the form and at the API (400).
- [x] The reason is stored and the sample is flagged non-conforme.
- [ ] The reason is displayed on the sample detail screen *(screen arrives with C5)*.

### C4. Assignment to a technician *(remplacé le 13/10 — V14)*
- [x] Réceptionniste assigns the sample to a technician in the same action.
- [x] The technician list shows each technician's current workload.
- [x] After reception the status becomes **Reçu** and the technician's
      dashboard count increases (verified: 3 samples → "Qui m'attendent 3").

### C5. Result entry (technicien)
*verified 2026-08-25*
- [x] `tech1` sees **only** the samples assigned to them — a second technician
      (`tech2`) gets **403** on the API, is redirected away from the page, and
      the sample does not appear in their queue. *(remplacé le 13/10 — V14:
      tech2 sees a colleague's sample read-only, still 403 on typing)*
- [x] The sample opens with **one line per requested parameter**.
- [x] For each parameter: value, unit, reference threshold, conformity.
- [x] Scientific notation as the lab writes it (`8,9.10²`) is accepted, stored
      as typed **and** parsed to 890 for the comparison.
- [x] Conformity is computed live: `8,9.10²` vs limit 100 → "Non conforme —
      lu 890 UFC/g · limite 100 UFC/g · Dépassement"; `50` vs 1000 → Conforme;
      `Absence` → Conforme.
- [x] A value that cannot be read as a number asks the technician to decide.
- [x] A partially filled sheet **saves and reopens** without data loss; the
      first save moves the sample to **En analyse**.
- [x] Work status per result: en cours / terminé / anomalie — an anomaly
      without a description is refused (400).
- [x] `produit` and `N° de lot` are captured at reception and shown here.
- [x] Submitting is blocked until every parameter is filled — the API names the
      missing ones.
- [x] After submission the status is **Résultats saisis** and the bench empties.
- [x] Once submitted the sheet is read-only: inputs disabled, no submit button,
      values still visible.
- [x] A parameter that does not belong to the sample is refused (400).
- [x] Mobile (375px): the sheet stacks, no horizontal overflow.

### C6. Validation — **double validation, every sample**
*verified 2026-08-25*
- [x] `valid1` → `/validation` lists samples at **Résultats saisis**.
- [x] The view shows each result **against its threshold**, technician notes and
      the sample's context (produit, lot, technicien, non-conformité à réception).
- [x] Sensitive parameters are marked, and a non-conform result warns that a
      contamination alert will be sent after approval.
- [x] Validateur validates → the sample moves to "attente admin",
      **not** straight to Validé; the status stays *Résultats saisis*.
- [x] The validateur then sees a locked message: the final approval belongs to
      the administrator.
- [x] `admin` sees the samples awaiting approval (menu "Approbations") and approves.
- [x] **Only after both** does the status become **Validé** — both signatures
      stored with name, role and timestamp.
- [x] A validateur trying to approve alone → **409** "Seul un administrateur
      peut donner l'approbation finale."
- [x] An admin trying to approve without technical validation → **409**
      "La validation technique du validateur est requise avant l'approbation."
- [x] Rejection **requires a comment** — refused without one, in the form and
      at the API.
- [x] A rejected sample returns to the technician at **En analyse**, carrying
      the motif and the name of who sent it back; the technical validation is
      **cleared**, so corrected results must be validated again.

### C7. The state machine — illegal moves are refused
- [x] A sample already received cannot be received again — **409** with a clear
      French message ("Transition impossible : « Reçu » → « Reçu »").
- [x] An unknown sample id returns **404**, not a crash.
- [x] Only RECEPTIONNISTE / ADMIN may receive: `pre1` **403**, `tech1` **403**,
      signed out **401**.
- [x] A technician cannot validate their own sample — validation is restricted
      to VALIDATEUR / ADMIN (`tech1` → **403**).
- [x] A sample cannot skip a step: neither approval alone moves it to Validé,
      and `RESULTATS_SAISIS → VALIDE` is admin-only in the state machine.

### C8. Audit trail
- [x] Reception records **who** did it and **when**
      (`SAMPLE_RECEIVED` with code, control code, conformity, technician).
- [x] Sample creation is recorded (`SAMPLE_CREATED`).
- [x] The full chain is recorded end to end: `SAMPLE_RECEIVED →
      SAMPLE_ANALYSIS_STARTED → RESULTS_SAVED → RESULTS_SUBMITTED →
      SAMPLE_VALIDATED_TECHNICAL → SAMPLE_APPROVED` (and `SAMPLE_REJECTED`).
- [ ] The sample detail shows this timeline visually *(Phase 5 dashboards)*.

## Checkpoint D — Reports, email & alerts (Phase 3)
*verified 2026-08-25 · real delivery pending the client's DNS*

### D1. Official PDF report
- [x] Approval generates the report automatically (`RAP-YYYY-NNNNN`).
- [x] The PDF contains: Qualilab identity, control code **and** blind serial
      number, client, produit, n° de lot, lieu, dates, préleveur, the results
      table with thresholds and conformity, the conclusion, and **three
      signatures** (technicien, validateur, admin).
- [x] Text is **selectable** (rendered by a browser, not a screenshot).
- [x] The report is re-downloadable at any time and identical each time —
      it is rebuilt from the snapshot frozen at approval.
- [x] "Télécharger le rapport" appears on the validation screen once approved.
- [ ] Multi-page: check with a sample carrying 15+ parameters.

### D2. Automatic email to the client
- [x] Approval sends the report to the client's `ClientEmail` list.
- [x] The send is journalised (`EmailLog`): type, recipients, subject, status.
- [x] The sample moves to **Rapport envoyé**; a resend does not move it back.
- [x] "Renvoyer au client" works from the validation screen.
- [x] Without `RESEND_API_KEY` the send is recorded as **SIMULE** and the
      screen says so plainly, so a demo never implies a real delivery.
- [ ] 🔒 **Real delivery** — needs the client's DNS (`NEEDEDINFO` item 2):
      the mail arrives in the inbox, not spam.

### D3. **Contamination alerts**
- [x] A result **under** the limit sends no alert.
- [x] `8,9.10²` against a limit of `1.10²` on E. coli → alert fires on approval.
- [x] Subject reads **"Alerte de contamination par E. coli"**.
- [x] It goes to **all** the client's alert addresses, with the laboratory in copy
      (verified: contact@ + direction@ + the lab).
- [x] The table carries **Produit · Site · Date de réception · N° de lot ·
      Le germe · Résultat · Limite**, as in the client's model.
- [x] Alerts are **grouped by germ** — one message listing every product
      concerned, not one per result.
- [x] Only parameters flagged sensitive raise an alert.
- [x] Each alert is journalised and audited (`CONTAMINATION_ALERT_SENT`).
- [ ] 🔒 Confirm against the lab's **official limits** (`NEEDEDINFO` item 1) —
      the seeded values are provisional Moroccan (NM) criteria.

### D4. Feuille de paillasse
- [x] Prints the samples **on the bench for a chosen date** (`?date=YYYY-MM-DD`).
- [x] One block per sample (blind serial number, client, produit, lot,
      technicien), one line per parameter with its unit and threshold.
- [x] Blank **valeur mesurée** and **note** columns to write in, plus a
      signature line.
- [x] A technician only gets their own samples.
- [x] Reachable from the technician's menu.
- [ ] Print it on real A4 and confirm nothing is cut off.

### D5. Admin silent report edit
- [x] `admin` can modify a validated report's conclusion.
- [x] The modification leaves **no trace** in the audit journal, as requested.
- [x] No other role can reach it (route restricted to ADMIN).
- [ ] Expose it in the admin interface (currently API-only, kept isolated so
      the feature stays cheap to remove if the client changes their mind).

## Checkpoint E — Clients, invoicing & administration (Phase 4)

### E1. Clients
*verified 2026-08-25*
- [x] Gestionnaire/admin can **create** a client; a technician gets **403**.
- [x] The raison sociale is required; a duplicate name is refused (**409**),
      since two identical names are indistinguishable in every picker.
- [x] A malformed **ICE** is refused (15 digits), and spaces are normalised away
      — it is printed on the invoice.
- [x] An invalid **email** is refused rather than silently dropped.
- [x] A client can hold **several email addresses**, each flagged for reports
      and/or alerts; addresses are lowercased and duplicates refused.
- [x] Editing updates both the record and the address list in one action.
- [x] **Archiving** hides the client from the pickers but keeps its history;
      `?archived=true` still lists it, and it can be reactivated.
- [x] **Fiche client 360°** shows coordinates, recipients, recent samples with
      their status and a link to each report, invoices with their payment
      status, and the billed / collected totals.
- [x] Search filters by raison sociale, contact, ICE or email.
- [x] Empty states: no client, no result for a search, no address registered
      (which warns that nothing can be sent).
- [ ] Check the fiche on mobile with a client holding many samples.

### E2. Invoicing from validated samples
*verified 2026-08-25*
- [x] Choosing a client lists their **validated analyses not yet invoiced**,
      with the number of analyses and the amount per sample.
- [x] Selecting samples fills the invoice lines **at catalogue prices**
      (verified: 5 lines, 1 650,00 DH HT → 1 980,00 DH TTC).
- [x] The price follows the **domain**: E. coli costs one price on food and
      another on water.
- [x] An analysis missing from the catalogue is flagged **"prix à saisir"**
      rather than silently invoiced at zero.
- [x] A deactivated catalogue entry counts as missing.
- [x] **The désignation of every line is editable** — the client's requirement.
      Verified: an edited wording survives to the issued invoice.
- [x] Picking a catalogue entry prefills wording and price; clearing the picker
      does **not** wipe a wording that was edited on purpose.
- [x] Free lines can still be typed by hand alongside billed analyses.
- [x] A sample **cannot be invoiced twice**: once billed it leaves the list, and
      a second attempt is refused (**409**, naming the sample).
- [x] A sample belonging to another client is refused (**400**).
- [x] A sample that is not validated is refused (**409**).
- [x] **Invoice PDF is rendered server-side** like the analysis report:
      selectable text, real page breaks, the amount in words, the RIB/IBAN and
      the legal mentions. The screenshot machinery is gone.
- [x] **The comptable reaches the invoice screens** in their own space
      (`/comptabilite/factures`), from the shared components — links follow the
      space they are rendered in, so nobody is bounced to an admin-only route.

### E3. Administration
*parameters + journal verified 2026-08-25 · users & catalogue verified in the Phase 4/5 passes*

**Paramètres d'analyse (`/admin/parametres`)**
- [x] Lists every parameter by domain with unit, displayed threshold, numeric
      limit, and an **"alerte"** badge on sensitive germs.
- [x] A banner says plainly that the current limits are **provisional Moroccan
      norms**, and that editing them here is all it takes — no code.
- [x] Admin can **edit** unit, threshold, limit and the sensitive flag; the
      change is audited with before/after values.
- [x] Admin can **create** a parameter; a duplicate name in the same domain is
      refused (409).
- [x] A **sensitive parameter without a limit is refused** with an explanation —
      the alert it promises could never fire.
- [x] A limit typed with a comma (`1,5`) is read correctly; empty means "no
      limit defined".
- [x] Only the admin: a validateur is redirected from the page and gets **403**
      on the API.
- [ ] After the lab sends its official limits, enter them here and re-run the
      alert tests in D3.

**Journal d'audit (`/admin/journal`)**
- [x] Shows the last 200 actions, newest first, in plain French: who, what,
      which reference, when.
- [x] The chain of a sample reads end to end (réception → analyse → validation
      → approbation → alerte → rapport).
- [x] Parameter edits appear with the actor.
- [x] Read-only: the interface offers no way to alter or delete an entry.
- [ ] Admin-only access re-checked when the users screen lands.

**Utilisateurs (`/admin/utilisateurs`)** — *verified 2026-08-25*
- [x] Admin creates an account (nom, identifiant, mot de passe initial, rôle)
      through Better Auth — the new account logs in immediately.
- [x] Bad inputs refused by name: identifiant too short / malformed, password
      under 8 characters, duplicate identifiant (**409**).
- [x] Role change from the list; **the admin cannot modify their own account**
      (no self-demotion, no lab without an administrator).
- [x] **Disabling kicks the user out now**: sessions revoked, and the next
      login attempt is refused (**403**).
- [x] Re-enabling restores access; password reset revokes sessions too.
- [x] Every action audited (`USER_CREATED`, `USER_ROLE_CHANGED`,
      `USER_DISABLED`, `USER_PASSWORD_RESET`).

**Catalogue (`/admin/catalogue`)** — *verified 2026-08-25*
- [x] Labels and prices editable per domain; a price typed `350,50` is read as
      French decimal.
- [x] **Deactivating an entry stops it pricing new invoice lines** — the
      billable proposals flag those analyses "prix à saisir" instead.
- [x] Reactivation restores pricing; changes audited with before/after.
- [x] Invalid price (negative, non-numeric) refused.

**Entreprise (`/admin/entreprise`)** — *verified 2026-08-25*
- [x] The identity printed on documents is editable: raison sociale, adresse,
      ICE, RC, banque, RIB, IBAN, SWIFT…
- [x] Every field required — a half-empty identity can never reach a document.
- [x] **Saved identity reaches the documents**: an invoice rendered after the
      change carries the new ICE. Deleting the row falls back to the defaults.
- [x] Changes audited with the list of modified fields.
- [ ] Enter the real ICE/RC/RIB here when the lab sends them (NEEDEDINFO item 3).

---

## Checkpoint F — Production readiness (Phase 5)
*code portion verified 2026-08-25 · deployed live 2026-08-26 (F4)*

### F1. Direction view & global search
- [x] `/admin` opens on the direction view: samples in the pipeline, average
      turnaround (réception → validation), billed and collected totals.
- [x] Samples by status as a bar list; activity by domain this month; the
      month's contamination-alert count.
- [x] **The dashboard search runs in the database**: a serial number, control
      code, produit, lot, lieu or client name finds a sample from any year,
      not only the newest page (verified: SN-…, QLC-…, produit).
- [x] **The préleveur's search cannot resolve laboratory numbering**: searching
      a serial or control code returns nothing for them, while their
      legitimate searches still work — the blind numbering stays blind.
- [ ] Re-check turnaround once real (multi-day) data exists — demo data shows
      0 h because samples were approved minutes after reception.

### F2. Production build
- [x] `next build` (standalone) compiles clean; `next start` serves.
- [x] `/api/health` answers `{status: ok, database: connected}`.
- [x] Security headers present in production mode, **including HSTS**.
- [x] Login page serves on the production build.

### F3. Deployment artifacts (to exercise on the VPS)
- [x] `Dockerfile` — 3-stage, standalone output, Chromium in-image, non-root.
- [x] `docker-compose.yml` — app + MySQL, private network, DB not exposed,
      migrations on boot, healthchecked.
- [x] `scripts/backup-db.sh` — daily dump, gzip-verified, 30-day retention,
      refuses suspiciously small files.
- [x] `scripts/restore-db.sh` — destructive restore behind a typed confirmation.
- [x] `DEPLOY.md` — first deploy, updates, rollback, the 5-minute post-deploy
      check.
- [x] **On the VPS**: first deploy done 2026-08-26 (`scripts/vps-first-deploy.sh`),
      backup cron installed, **one real restore performed and dated in
      DEPLOY.md**. HTTPS/certbot waits on the domain (NEEDEDINFO item 1).
- [ ] 🔒 Full `TESTPLAN` pass against the deployed system (see F4 for the
      smoke pass already done).
- [ ] 🔒 Legacy data import — waits on the lab's export (NEEDEDINFO item 18).

### F4. Live-server smoke pass — observed 2026-08-26 on http://185.217.126.53
- [x] `/api/health` → `{status: ok, database: connected}` through nginx.
- [x] Login **over plain HTTP** works (admin) — the `AUTH_COOKIE_SECURE`
      pass-through fix proving itself; demo-accounts panel visible
      (`NEXT_PUBLIC_DEMO_MODE=true`).
- [x] Direction dashboard renders the seeded data (1 sample, 2 724,00 DH
      facturé, statuses, domains).
- [x] Réceptionniste login lands on ESPACE RÉCEPTION with QL-2026-00001
      awaiting reception — role routing intact.
- [x] `/admin/factures` lists both seeded invoices with correct totals.
- [x] **Invoice PDF renders in-container**: 200, `application/pdf`, 56 KB,
      `%PDF-` magic (Chromium in the image works).
- [x] Firewall: SSH/80/443 only; app bound to 127.0.0.1; PM2 + native MySQL
      retired.
- [x] **Full multi-role circuit on the live server** (2026-08-26): recep1
      received QL-2026-00001 (conformity, produit, lot) → blind numbers
      generated (QLC-2026-00001 / SN-03XP-7Q1W) and technician assigned →
      tech1 entered `4,0.10²` / `8,9.10²` / `2,1.10³` (parser → 400/890/2100;
      E. coli 890 vs limit 100 auto-flagged **Non conforme**) → submitted →
      valid1 validated technically (name + timestamp recorded) → admin
      approved → report **RAP-2026-00001** created, sample RAPPORT_ENVOYÉ.
- [x] Report PDF renders on the live server (200, application/pdf, 59 KB).
- [x] EmailLog after approval: `RAPPORT · SIMULE` + `ALERTE_CONTAMINATION ·
      SIMULE` (E. coli) — the alert chain fires, held in simulation until
      the Resend key exists.
- [x] **Blind numbering verified end-to-end**: after the whole circuit, the
      préleveur's pages contain zero occurrences of `QLC-` or `SN-` while
      still showing the sample and its progress.

## Checkpoint G — Extensions (Phases 6–8) — *G1 + G2 built and verified 2026-08-27*

### G1. Achat & Stock (Phase 6) — verified in the browser 2026-08-27
- [x] The `/magasin` space exists behind `requireRole("MAGASINIER","ADMIN")`
      — verified as ADMIN; no admin-nav entry and no demo account, so the
      module stays invisible until revealed (create a MAGASINIER user then).
- [x] Supplier created with its payment convention (BioMérieux, 60 j); an
      invoice recorded WITHOUT a due date got issueDate + 60 j automatically.
- [x] Stock item created (seuil 10 boîtes) → ENTREE 25 (lot L-2408) → 25,
      alert cleared → SORTIE 18 → 7, « sous le seuil » back. History lists
      both movements with lot and author.
- [x] Over-drain refused: SORTIE 100 on a stock of 7 → 400 « Stock
      insuffisant : 7 en stock, sortie de 100 demandée. »
- [x] Low-stock alert on the magasin dashboard (7 / seuil 10).
- [x] Payment-due alerts: overdue invoice shows « En retard — 20 août » on
      the dashboard and a red badge in the list; « Marquer payée » clears it
      (Payée le …, reversible via the reopen button).
- [ ] 🔒 Re-verify as a real MAGASINIER account at reveal time.

### G2. Qualité (Phase 7) — verified in the browser 2026-08-27, as valid1
- [x] The « Système Qualité » link appears in the validateur's and admin's
      menus; `/qualite` is guarded VALIDATEUR/ADMIN.
- [x] Equipment registered with schedule and bounds (Étuve 37 °C, E-001,
      12 mois, [35;39]); a calibration record (LNM, cert C-2025-4411) set
      the next due date → « Bientôt — dû le 10 sept. 2026 ».
- [x] An unscheduled equipment (Réfrigérateur R2) shows no calibration
      badge; a scheduled-but-never-calibrated one is flagged « jamais
      étalonné » (unit-tested).
- [x] Temperature readings on the board: 4,2 °C in range (green), then
      9,5 °C → **HORS PLAGE** immediately, journalised
      TEMPERATURE_OUT_OF_RANGE.
- [x] EIL campaign created (BIPEA S2-2026) then updated to « Résultats
      reçus » with z-score 0,8 · satisfaisant.
- [x] The quality dashboard rolls it all up: 2 équipements, 1 étalonnage à
      traiter, 1 excursion (7 j), 1 campagne ouverte.

### G3. Portail client & Réclamations (Phase 8)
- [ ] Admin creates a client account (no self-signup possible).
- [ ] The client logs in and sees **only their own** samples and reports.
- [ ] The client **cannot** reach any lab screen or another client's data
      (try editing the URL — it must be refused).
- [ ] The client can follow the progress of an analysis in real time.
- [ ] A réclamation can be filed and linked to a sample.

---

## Checkpoint H — Pack d'indépendance (2026-08-27)
*Everything still awaited from the client became a toggle or data entry.
Verified in the browser on the dev server, full circuit, on 2026-08-27.*

### H1. Réglages du circuit (/admin/reglages — decisions n°10 & n°11)
- [x] The two switches render with both behaviours explained; saving persists
      (`GET /api/admin/lab-settings` reflects it) and is audited.
- [x] **Blocking ON + non-conform reception**: the technician selector is
      replaced by the hold notice; submitting numbers the sample
      (QLC/SN generated) but assigns nobody; success panel says
      « bloqué en attente de libération ».
- [x] The blocked sample appears in « Bloqués — non-conformité » on
      /reception: réceptionniste sees it read-only, ADMIN gets the
      technician picker + « Libérer pour analyse ».
- [x] Admin dashboard shows the amber banner linking to /reception while
      anything is blocked.
- [x] Release assigns the technician, clears the hold, and the sample flows
      through the normal circuit afterwards.
- [x] **Early alerts ON**: the contamination alert left at the TECHNICAL
      validation (EmailLog +1 while the sample was still unapproved), and
      the admin approval did NOT resend it (alert count unchanged, report
      still sent). `alertsSentAt` is the guard.

### H2. Facteur de calcul (item 6)
- [x] `/admin/parametres` takes a per-parameter factor (rejects 0 and
      negatives; empty = 1) and shows « facteur ×N » in the list.
- [x] Saisie shows the badge and the live computed final value
      (raw 50 ×10 → « Valeur finale : 5.10² UFC/g »); the conformity
      suggestion uses the FINAL value (500 vs 100 → non conforme).
- [x] Stored result: `value` = final (printed on the report),
      `rawValue` = bench entry preserved, `numericValue` = 500.
- [x] Report PDF renders with the computed value.

### H3. Logo (item 5)
- [x] `/admin/entreprise` uploads a logo (type/size checked twice — client
      and server), previews it, removes it; report/invoice/bench-sheet
      templates print it, styled text brand as fallback.

### H4. Import de données (/admin/import — item 7 scaffolding)
- [x] Analyse detects columns and guesses the mapping from real-world
      headers (Raison sociale / ICE / E-mail / Téléphone).
- [x] Dry-run classifies precisely: 1 to create, 1 invalid (missing name,
      Excel-accurate line number), 1 duplicate against the existing DB —
      nothing written.
- [x] Commit creates the client with its ICE/phone AND registers its email
      as report+alert recipient; `CLIENTS_IMPORTED` in the audit journal.
- [ ] 🔒 Re-run against the lab's REAL export when it arrives (item 18) —
      adapt the mapping, not the code.

## Cross-cutting — check once per phase

### Security
- [ ] For every new screen: a role that shouldn't see it is redirected.
- [ ] For every new API route: signed out → 401, wrong role → 403.
- [ ] No sensitive data visible in the URL.

### Responsive
- [ ] Mobile (375px), tablet (768px), desktop: no horizontal scrolling.
- [ ] Tables scroll inside their own container on mobile.

### Accessibility
- [ ] Every form field has a visible label.
- [ ] Keyboard navigation reaches every action; focus is always visible.
- [ ] Error messages are readable and in French.

### Performance — check on every new screen
- [ ] The screen appears in **under 1 second** (production build, real domain).
- [ ] A save / submit acknowledges in **under 500 ms**, or shows a busy state.
- [ ] Nothing jumps or reflows while the page loads.
- [ ] The screen still feels instant with **realistic data**, not three demo rows
      (a few hundred samples, a full year of invoices).
- [ ] No list loads every row ever recorded — long lists are paginated.

### Robustness
- [ ] Every screen has a loading state, an empty state and an error state.
- [ ] Double-clicking a submit button does not create two records.

---

## Checkpoint M — Phase 9, chantier 2 : critères d'interprétation (dev server 2026-09-18 at 1440×900, `admin` / `valid1`; production after deploy)

Tick only what was seen in the browser or in an API/PDF answer of the
running server. Spec: `CRITERES.md`.

### M1 — Le catalogue et l'import du classeur — dev server 2026-09-18, `admin`
- [x] `/admin/import` shows two sections; « Critères d'interprétation (classeur Excel) » accepts the .xlsx and the analysis reads the real workbook: **1 075 lignes, 131 types de produits, 44 normes (versions), 1 075 critères importables, 24 doublons signalés, 2 lignes refusées** (les deux « 1.8 » de CEREALES POUR ENFANTS — Q25).
- [x] Nothing is written before « Importer »: the analysis leaves the catalogue empty, the commit creates **131 types, 38 paramètres, 39 normes (44 versions), 1 075 critères**.
- [x] Re-running the same import writes nothing (« 0 créé, 0 mis à jour », 131 types « connus », 1 075 critères « déjà en base ») — the import is idempotent.
- [x] Germs are matched through the parameters' aliases: « Recherche des Salmonella », « Escherichia coli », « Coliformes à 30°C », « Recherche de Listeria monocytogenes » fall on the catalogue's Salmonelles / E. coli / Coliformes totaux / Listeria; 38 unknown germs are created in microbiologie alimentaire with the workbook's other spellings as aliases.
- [x] `/admin/types-produits` lists the 131 types with their criteria count, the search filters them (« salades » → 2), the Catalogue / Par client / Inactifs filters count correctly.
- [x] `/admin/types-produits/[id]` shows the grid of « SALADES AVEC SOURCE PROTEIQUE »: 9 criteria, one line per norm version (NM ISO 4833-1:2023 « en vigueur » and :2014, NM ISO 6579-1:2021 and :2017, NM ISO 6888-1:2022 and :2019), limits in the lab's notation (m = 1.10², M = 1.10⁴), « Absence exigée » for Salmonelles and Listeria.
- [x] Editing a criterion saves and reloads from the server (« 9 critères enregistrés. », c changed 1 → 0 → 1 and read back each time).
- [x] `/admin/normes` lists the 38 norms with their dated versions; ticking « En vigueur » on another version moves it (NM ISO 4833-1: 2014 in force, then 2023 again) and no norm ever keeps two.
- [x] `/admin/reglages` carries « Échelle de conclusion des rapports » with the four verdicts; saving answers « Échelle enregistrée. ».
- [x] Admin navigation shows « Types de produits & critères » and « Normes »; the journal labels the new actions.

### M2 — Le type de produit sur la ligne — dev server 2026-09-18, `admin`
- [x] A deposit line of kind « Aliment » carries the product type (« SALADES AVEC SOURCE PROTEIQUE »), stores it on the sample and the bench reads it back (« 6 critères · n = 5 »).
- [x] The picker adds the type's germs to what is already ticked and raises n; it never removes an analysis the préleveur asked for.
- [x] The picker on `/preleveur/nouvelle-visite` (2026-09-18, `pre1`): choosing « SALADES AVEC SOURCE PROTEIQUE » ticks its 6 germs, raises n from 1 to 5 and explains itself (« Le rapport interprétera ce produit selon ses 9 critères… »); the visite **19/26** is stored with the type, n = 5 and 6 germs. « Corriger la fiche » exercised through the API: changing the product type deletes the 6 results and their 30 unit readings and sends the sample back to EN_ANALYSE.

### M3 — La paillasse par unité — dev server 2026-09-18, `admin`
- [x] A sample with a product type shows one grid per germ, A…E for n = 5, with the criterion and its norm version above (« m = 10 · M = 1.10² ufc/g · c = 1 · NM ISO 16649-2:2007 »).
- [x] The verdict appears as the units are typed: « < 10 · 50 · < 10 · < 10 · < 10 » → **Acceptable — 1 unité entre m = 10 et M = 1.10² (c = 1)**.
- [x] The six germs of the test sample gave the six expected verdicts: Micro-organismes SATISFAISANT, E. coli ACCEPTABLE, Staphylocoques NON_SATISFAISANT (1 unité > M), Salmonelles / Listeria SATISFAISANT (absence ×5), Clostridium SATISFAISANT.
- [x] Submitting is refused while a grid is incomplete (INCOMPLET) and accepted once every unit is read.
- [x] A germ without a criterion (2026-09-18, série **18/26**): line 1 read per unit against its criteria, lines 2 and 3 (surface, mains) read as single values on the same série — three reports, the first with « CRITÈRE (m · M · c) » and « VERDICT », the other two with « SEUIL DE RÉFÉRENCE » and « CONFORMITÉ ».

### M4 — Validation et rapport — dev server 2026-09-18, `valid1` / `admin`
- [x] `/validation/[id]` shows the sample's verdict in the header (**Non satisfaisant**), and per germ: the readings A…E, the criterion, its norm version and the verdict.
- [x] The two signatures still apply (the technical validator may not approve: 409 « deux signataires différents »); `valid1` validates, `admin` approves, the report is created (RAP-2026-00005).
- [x] Report PDF (pdftotext): columns « CRITÈRE (m · M · c) » and « VERDICT », the readings A…E under each result, the norm version under each criterion, the header « Type de produit · 5 unités analysées », conclusion « Les résultats obtenus ne sont pas conformes aux critères microbiologiques applicables au produit analysé. » from the scale.
- [x] Contamination alert on a criteria sample (2026-09-18): Salmonelles read « présence » on 18/26-1 → `CONTAMINATION_ALERT_SENT` for the client's two alert addresses, status SIMULÉ (no mail provider on dev).

### M5 — Production (http://185.217.126.53, deployed 2026-09-18)
- [x] Workbook imported on the VPS: dry run first (1 075 lignes, 131 types, 43 versions de normes, 2 refusées), then commit — **131 types, 38 paramètres, 38 normes (43 versions), 1 075 critères** créés; re-running it writes nothing.
- [x] `/admin/types-produits` lists the 131 types with their criteria counts; `/admin/normes` shows the 38 norms, the six with two dated versions (NM ISO 4833-1, 4833-2, 6579-1, 6888-1, 7932, 21527-2) keeping one « en vigueur »; `/admin/reglages` carries the four conclusion sentences; `/admin/import` shows the workbook section.
- [x] Full circuit on production: dépôt **18/26** « Salade composée test » with the product type → bench read per unit through the API → verdicts ACCEPTABLE / SATISFAISANT / NON_SATISFAISANT → `valid1` validates, `admin` approves → report **RAP-2026-xxxxx** with the criteria columns, the readings A…E, the norm versions and the scale's conclusion (« Les résultats obtenus ne sont pas conformes… »).
- [x] `/validation/[id]` on production shows the sample verdict « Non satisfaisant » and each germ's verdict beside its criterion.
- [ ] Recette with the laboratory on its own product types (M6, with chantier 1's L6).

## Checkpoint N — Recette du circuit complet après chantier 2 (dev server 2026-09-18, `pre1` / `recep1` / `tech1` / `valid1` / `admin` / `compta1`)

One série carried through every desk, plus an adversarial audit of the whole
circuit (8 lenses, 24 findings triaged).

- [x] **Prélèvement** : visite de 3 lignes (aliment avec type de produit, surface, mains) créée par `pre1` — n° de série **18/26**, aucun `controlCode` dans la charge utile du préleveur.
- [x] **Réception** : la série est réceptionnée en une fois → 9117/26, 9118/26, 9119/26, technicien attribué ; refus correct quand le technicien manque (« Ligne 1 : attribuez un technicien »).
- [x] **Étiquettes** : PDF de 7 étiquettes (5 unités + 1 + 1), 3 colonnes de 70 mm sur la pleine largeur A4, code-barres Code128 lisible.
- [x] **Protocole / bon de réception** : PDF rendus et **relus à l'image** — un défaut de style a été trouvé et corrigé (voir ci-dessous).
- [x] **Paillasse** : grille par unité sur la ligne à critères, valeur simple sur les deux autres ; soumission acceptée une fois les cinq unités lues.
- [x] **Validation** : `valid1` signe techniquement, `admin` approuve (la double signature refuse le même signataire) ; 3 rapports PDF produits.
- [x] **Alerte** : alerte de contamination déclenchée sur la ligne à critères.
- [x] **Facture** : facture FAC-2026-0004 émise depuis les analyses validées (970 DH HT, TVA 194, total 1 164) et son PDF ; l'émission est désormais tracée au journal.
- [x] **Écrans** : files réception / analyses / approbations, catalogue des types, grille de critères, normes, réglages — rendus à 1440×900 ; catalogue et grille vérifiés aussi en 768 px (la grille défile dans son cadre, la page ne défile pas).

### Défauts trouvés par cette recette et corrigés le jour même
1. **Protocole et bon de réception cassés** (régression du 14/09) : la classe `.box` servait à la fois aux panneaux d'information et aux cases à cocher « Analyses à effectuer » ; la règle des cases écrasait les panneaux, les listes d'analyses et les cadres de signature s'effondraient sur deux pages. Cases renommées `.case`, documents re-rendus et relus à l'image.
2. **Rapport et alerte imprimaient le critère du catalogue** au lieu du plan appliqué (n plafonné aux unités réellement prélevées).
3. **La valeur de synthèse imprimait la notation de paillasse** (« 0(-1) ») au lieu de « < 10 ».
4. **Une alerte de contamination ne repartait jamais** après un retour en paillasse (`alertsSentAt` jamais remis à zéro).
5. **Le panneau de validation promettait une alerte** pour tout résultat non conforme, alors que seuls les paramètres sensibles en déclenchent une.
6. **L'émission d'une facture n'était pas tracée** au journal d'audit, contrairement aux autres écritures d'argent.
7. **Destinataires longs** : `EmailLog.to` et `Report.sentTo` (191 caractères) pouvaient faire échouer l'écriture *après* l'envoi du mail — tronqués désormais.
8. **Une ligne de dépôt sans technicien** partait en RECU invisible de toutes les files : elle est maintenant retenue dans « Échantillons bloqués », d'où on l'attribue.
9. **Ré-import du classeur** : un type de produit rattaché à un client était recréé en double ; l'appariement couvre désormais tous les types.
10. **Lignes annulées** : elles restent imprimées sur le protocole et le bon, marquées « Ligne annulée » ; la liste des échantillons bloqués affiche le motif codé et non plus seulement la précision libre.

11. **La signature technique survivait à une annulation** : la validation du validateur est portée par l'échantillon, pas par un statut ; annuler puis réactiver la rendait donc réutilisable pour approuver d'autres résultats. Vérifié : signature présente avant l'annulation, absente après la réactivation.
12. **Une analyse facturée à 0 DH** consommait l'échantillon en silence : refusée désormais (« Tarif manquant pour … »), tandis qu'une ligne manuelle offerte reste possible. Le catalogue de démonstration nommait « Listeria monocytogenes » là où le paramètre s'appelle « Listeria » : la facturation ne pouvait jamais le tarifer.
13. **Une ligne qui cesse d'être un aliment** gardait son n° de lot et sa quantité ; à la réception, « unité(s) » du terrain était pris pour un poids et la première règle d'acceptation ne pouvait pas passer.

Écartés après vérification : la marge de 14 mm supposée sur les étiquettes (le PDF rendu occupe bien la pleine feuille), et trois constats dont le rendu ou le code montrait l'inverse.

## Checkpoint O — Retour du laboratoire du 19/09 (dev server 2026-09-19 à 1440×900, `pre1` / `recep1` / `admin` ; production après déploiement)

Trois remarques du laboratoire sur « Nouvelle visite ». La troisième était
déjà satisfaite ; les deux autres ont été livrées.

### O1 — « Cadre n'est pas modifiable » → livré
- [x] Deux puces **Autocontrôle / Contrôle officiel** sur « Nouvelle visite » et sur « Nouveau dépôt », proposées d'après « Prélèvement effectué par » et modifiables ; changer le préleveur rend la main à la déduction.
- [x] Visite **22/26** créée avec « Contrôle officiel » : le récapitulatif, la base et le protocole PDF portent bien le cadre choisi.
- [x] Le préleveur corrige le cadre depuis sa visite tant que le laboratoire n'a pas réceptionné (200) ; après réception c'est refusé (« La série est réceptionnée : le laboratoire seul peut changer le cadre. ») et les puces sont verrouillées à l'écran, tandis que l'administrateur, lui, peut encore (200).
- [x] Enregistrer le panneau d'arrivée d'une série déjà réceptionnée reste possible : le cadre n'est envoyé que s'il change.
- [x] Le changement est tracé au journal avec la valeur avant / après ; le cadre figure aussi dans l'audit de création.

### O2 — « Manque Surface prélevée par ligne » → livré
- [x] « Surface prélevée » et « Aire prélevée (cm²) » sur **chaque type de ligne** sauf Mains (où la colonne du protocole imprime « MAIN ») ; obligatoire seulement sur une ligne Surface.
- [x] Ligne aliment de la visite 22/26 : « Plan de travail inox », 50 cm² — stockés, et imprimés « Plan de travail inox · 50 cm² » dans la colonne SURFACE PRÉLEVÉE du protocole (relu à l'image).
- [x] L'aire de 100 cm² est proposée en entrant sur une ligne Surface et retirée en en sortant, sur les deux formulaires.
- [x] « Corriger la fiche » ouvre la surface et l'aire sur n'importe quelle ligne.
- [x] La désignation de l'échantillon ne se prend plus la surface : une ligne mains garde le nom de la personne (test + base).

### O3 — « Manque remarque par ligne » → déjà en place
- [x] Champ « Remarques / composition » au bas de chaque ligne, sur la visite comme sur le dépôt ; imprimé dans la colonne REMARQUES / COMPOSITIONS du protocole (« Produit posé sur le plan inox » sur la visite 22/26). Rien à ajouter.

### O4 — Production (http://185.217.126.53, déployé le 19/09)
- [x] Visite **20/26** créée en production avec « Contrôle officiel » et une ligne aliment portant « Plan de travail inox », 50 cm² et sa remarque.
- [x] Protocole PDF de production relu à l'image : « Cadre : Contrôle officiel », colonne SURFACE PRÉLEVÉE « Plan de travail inox · 50 cm² », colonne REMARQUES « Produit posé sur le plan inox ».
- [x] Le préleveur corrige le cadre de sa visite non réceptionnée (200, valeur relue en base).

## Checkpoint P — Retour du laboratoire du 29/09 (spec `RETOUR-LABO-29-09.md`) — dev server 2026-09-29, 1440×900

Ticked when observed in the browser on the dev server (`pre1`, `recep1`,
`tech1`, `valid1`, `admin`, `commercial1`), plus the API circuit
`circuit-2909` (23/23). Production: see P-prod below.

### P-A — Le correcteur
- [x] « Écran — indicatf » tapé sur une ligne propose « Écran — indicatif » ; un clic l'accepte (valeur relue) ; un produit nouveau reste possible (la suggestion n'impose rien).
- [x] Même chose sur « Lieu / section » (« Cuisne — écran 29/09 » → « Cuisine — écran 29/09 »).
- [x] Un nom de type à une lettre près d'un type existant, en création : « Types existants très proches : … » et la case « Ce n'est pas une faute de frappe ».
- [x] Mémoire depuis les échantillons : Analyser → Importer → Analyser à nouveau = 0 nouvelle désignation, 0 nouveau lieu (pas de doublon).
- [ ] Mémoire depuis le CSV de l'ancien logiciel — couvert par `memory-import.test.ts`, en attente de l'extraction (Docker / base Firebird).

### P-B — Le moteur
- [ ] m = M avec c = 1 — **attend Q31**, la règle de c n'est pas modifiée.
- [x] Deux unités pour un plan n = 5 : aucun verdict officiel à l'enregistrement, « Sans interprétation officielle » et « Indicatif » par germe à la validation, rapport sans croix avec la phrase du nombre d'unités.
- [x] Lecture R1 … R3 sans type de produit (22,8 / 27,1 / 31,5) ; à la paillasse « R1 · A », la valeur retenue est la plus défavorable (150 lu sur « 1,5.10² ») ; une répétition vide bloque la soumission.
- [x] 999 unités acceptées par la validation d'une ligne, 1 000 refusées (`serie-input.test.ts`) ; lettres au-delà de ZZ (`series.test.ts`).
- [x] Critère « Non spécifié » sans M : lu, soumis, imprimé « Non spécifié », sans verdict (défaut trouvé et corrigé par ce test).

### P-C — Le rapport
- [x] Tableau « Réglementation en vigueur » : croix sous « Satisfaisant » (plan complet), aucune croix (unités insuffisantes) ; le texte saisi sur le type de produit est imprimé et figé dans le rapport.
- [x] Colonnes Paramètres, Méthode, Unité, R1 … Rn, m / M avec n et c ; « Non spécifié » ; « Absence » et « Non détecté » ; unité au-dessus de M en rouge.
- [x] Le cas le plus lourd réel (le plus gros type du classeur : 37 germes × 9 répétitions) tient sur une page (pdfinfo : 1 page) ; test automatique `report-onepage.test.ts`.

### P-D — E-mails
- [x] L'e-mail du rapport porte le tableau récapitulatif (N° dossier, N° de contrôle, dates, analyse, produit, lot, lieu) et la conclusion, « (indicative) » avec la phrase explicative quand il n'y a pas de verdict officiel (rendu relu à l'image).
- [x] L'alerte part à la validation technique (`alertAfterTechnicalValidation` activé, réglage affiché) ; unités dans les en-têtes « Résultat (/25g) », « Limite (/25g) ».

### P-E — Réception et comptes
- [x] Ligne non conforme : « Analyser malgré tout » / « Détruire » ; « Détruire » masque le technicien ; après validation « Annulé · Détruit à réception », N° de contrôle attribué, « Réactiver » proposé ; « Détruite à réception » sur le protocole ; entrée `SAMPLE_CANCELLED` au journal.
- [x] Le préleveur voit son propre nom verrouillé (« votre compte ») ; l'API refuse un autre préleveur (400 « Chaque préleveur saisit ses prélèvements avec son propre compte. »).

### P-F — Recherche et export
- [x] `/recherche` : client + période + état → les lignes du jour, conclusion par ligne (Satisfaisant, Non satisfaisant (indicatif), En cours, Annulé), lien Rapport ; « annulées » trouve la ligne détruite ; la recherche du préleveur ne trouve jamais un N° de contrôle.
- [x] Fiche client « Synthèse des analyses » (période, compteurs par conclusion) et export Excel relu : N° BC, N°, Date de réception, Nom produit, Analyses, N° de lot, Conclusion ; technicien refusé (403).

### P-prod — Production (http://185.217.126.53)
- [x] Déployé le 29/09 (commit `0be8208`), migrations appliquées ; `alertAfterTechnicalValidation` = vrai relu par l'API.
- [x] Circuit API rejoué en production (série **21/26**) : refus du collègue, destruction à réception (N° 20/26, `DETRUIT_A_RECEPTION`), pas de verdict officiel sous n, plan complet « Satisfaisant », R1 … R3 sans critère, trois rapports d'une page (RAP-2026-00007 … 00009), recherche, export Excel, technicien refusé à l'export. Le seul écart du script (« recherche du préleveur ») est une collision de numéros — N° de contrôle 20/26 = N° de la série 20/26 du 19/09, que le préleveur voit légitimement ; la ligne détruite n'est pas trouvée.
- [x] Rapport de production relu à l'image (croix sous « Satisfaisant », R1 … R5, m / M avec n et c, « Non détecté »).
- [x] `/recherche?etat=annulees` en production : la ligne détruite 20/26, « Annulé ».

## Checkpoint Q — Réponses du 30/09 (spec `RETOUR-LABO-30-09.md`) — Q-H, Q-I et Q-J vérifiés le 01/10

Ticked only when observed in the browser at 1440×900, on the dev server and
then in production.

### Q-H — Petits changements
- [x] Micro-organismes à 30 °C, m = M = 5.10⁴, c = 1 : une unité au-dessus ⇒ « Acceptable », deux ⇒ « Non satisfaisant » ; rapport avec la croix sous « Acceptable », l'unité tolérée en ambre (dev série 27/26 ; production, voir Session Log).
- [x] Le rapport n'imprime plus le type de produit (texte du PDF relu) ; le protocole et le bon ne l'imprimaient pas.
- [x] Ligne détruite à la réception d'une visite (27/26) et au dépôt (28/26) : e-mail « Échantillon non analysé — dossier … » au destinataire des rapports, statut SIMULE, entrée « Client informé d'une destruction » au journal ; rendu de l'e-mail relu à l'image.
- [x] R1 … Rn : étiquettes (PDF de 3 pages, « R44 » … « R60 » sans débordement, code-barres « 9135/26-R60 »), paillasse (60 champs R1 … R60, aucune lettre), réception « 60 unités (R1–R60) ».

### Q-I — Réglementation par échantillon
- [x] `/admin/reglementations` : liste (en vigueur / toutes), création, modification, archivage ; « …2073/2006 » près de « …2073/2005 » ⇒ quasi-doublon signalé, confirmation demandée.
- [x] Validation technique refusée sans réglementation (« Choisissez la réglementation en vigueur… »), réglementation inconnue ou archivée refusée ; le second échantillon du même produit du client arrive avec la réglementation déjà proposée, validé depuis l'écran (dev série 30/26).
- [x] Le rapport imprime le texte choisi ; texte modifié ensuite ⇒ rapport re-téléchargé inchangé.

### Q-J — Catalogue de l'ancien logiciel
- [x] Import analysé puis confirmé (dev puis production) : 175 réglementations, 530 types distincts (131 du classeur, 399 créés dont 270 inactifs), 1 945 critères, 11 normes / 16 versions ; 890 lignes de paramètres inconnus listées (chimie, eau), 800 obsolètes et 29 sans limite ignorées.
- [x] « LÉGIONELLE DANS L'EAU » (ancien logiciel seul) porte ses critères et sa réglementation ; « ABATS CRUS… » (classeur) garde ses 8 critères de septembre et reçoit sa réglementation ; `/admin/types-produits` : Tous 260 · Inactifs 270.
- [x] Ré-import : 0 réglementation, 0 type, 0 critère écrits.

### Q-K — Recette
- [ ] Recette avec le personnel du laboratoire (L6, M6, P, Q) — ligne de signature remplie.

## Checkpoint R — Recette technique complète en production (2026-10-01)

Run on **production** (http://185.217.126.53) through the public APIs with
the eight demo accounts, on a dedicated test client created for the run and
purged afterwards (`POST /api/admin/maintenance/purge-clients`): **70
checks, 70 passed** (one re-checked by hand: the sampler's blind search,
first tried with a control code equal to a série number). Documents read
at the image: protocole, étiquettes, bon de réception, feuille de
paillasse, four rapports, facture — one page each. Script:
`recette-prod.mjs` (session scratchpad); numbers below are those of the run.

### R-A Préleveur (pre1)
- [x] Saisie au nom d'un collègue refusée (400).
- [x] Visite de 8 lignes créée en 611 ms (aliment × 6 dont un type à 3 classes, un type m = M, un type avec 2 unités pour n = 5 ; surface 100 cm² ; mains) — série 1/26.
- [x] Aucun N° de contrôle dans la charge utile du préleveur ; « Mes visites » ; protocole PDF ; cadre / arrivée / T° glacière complétés avant réception.

### R-B Réception (recep1)
- [x] Série en file ; réception en une fois (3,1 s) : 8 N° de contrôle 1/26 … 8/26 ; ligne 6 non conforme → « Détruire » : numérotée, annulée `DETRUIT_A_RECEPTION`, sans technicien ; e-mail de destruction au client (SIMULE).
- [x] Seconde réception refusée (409) ; étiquettes R1 … R5 ; protocole réimprimé ; le préleveur ne change plus le cadre (400).
- [x] Dépôt au comptoir : reçu et numéroté sur-le-champ (série 2/26, N° 9/26), avance 300 DH espèces, seconde ligne détruite ; bon de réception PDF.
- [x] « Corriger la fiche » avec motif ; annulation (DOUBLON) puis réactivation par l'admin avec son N° de contrôle ; une ligne détruite réactivée revient bloquée, libérée vers un technicien.

### R-C Technicien (tech1 / tech2)
- [x] Paillasse d'un autre technicien refusée (403) ; la liste ne montre que ses échantillons.
- [x] Répétition vide : enregistrée, soumission refusée ; anomalie sans description refusée.
- [x] Plan 3 classes (m = 1,5·10⁶, M = 5·10⁶, c = 2) : 3 unités entre m et M ⇒ non satisfaisant ; lecture « 3(-2) » acceptée.
- [x] m = M, c = 1 : une unité au-dessus ⇒ acceptable.
- [x] 2 unités pour n = 5 ⇒ aucun verdict officiel.
- [x] Surface, salade en 3 répétitions sans critère, E. coli 5·10² hors limite, mains : enregistrés ; 7 lignes soumises ; feuille de paillasse PDF.

### R-D Validateur (valid1)
- [x] Validation refusée sans réglementation / avec une inconnue ; validée avec « Arrêté conjoint n° 624-04 » ; seconde validation refusée ; le validateur ne peut pas approuver.
- [x] Renvoi au technicien avec motif → en analyse → corrigé et resoumis → validé.
- [x] Alertes de contamination dès la validation technique : Salmonelles « Présence » (indicatif, 2 unités) ⇒ 1 alerte ; E. coli hors limite sans type ⇒ 1 alerte ; germe non sensible hors critère ⇒ 0.
- [x] L'admin qui a signé la validation technique ne peut pas approuver lui-même (409).

### R-E Administrateur
- [x] 7 approbations ⇒ RAP-2026-00001 … 00007, envoi simulé ; les alertes déjà parties ne repartent pas ; seconde approbation refusée.
- [x] Rapports relus à l'image : L1 croix sous « Non satisfaisant », unités entre m et M en ambre ; L2 « Acceptable » ; L3 « Détecté » en rouge, aucune croix, phrase « nombre d'unités inférieur au plan » ; L5 sans critère « Non spécifié » ; un page chacun.
- [x] Renvoi du rapport par le gestionnaire ; recherche par N° de contrôle (laboratoire : trouvé ; préleveur : rien) ; recherche client + période + « terminées » = 7 ; export Excel sans la ligne détruite ; journal : réception, destruction notifiée, réglementation choisie, réactivation, fiche corrigée.

### R-F/G/H Gestionnaire, comptable, magasinier
- [x] Fiche client avec synthèse ; gestionnaire refusé sur les comptes.
- [x] Échantillons approuvés facturables ; facture FAC-2026-0001 et son PDF ; double facturation refusée ; ligne détruite non facturable ; comptable refusé sur le catalogue.
- [x] Magasinier refusé sur échantillons et clients ; technicien sur les factures ; préleveur sur les comptes.
- [x] Listes sous 300 ms (`/api/samples` 212 ms, stats 226 ms, séries 91 ms, types 250 ms).

### Défaut trouvé et corrigé le jour même
- Le bon de réception imprimait la non-conformité d'une ligne détruite sans la décision « Détruite » (le protocole l'imprimait). Corrigé.

### Après la recette
- Client de test et tout ce qui s'y rattache supprimés de la production avec l'outil de purge ; compteurs revenus à 0.

## Sign-off log

| Phase | Tested by | Date | Result |
|---|---|---|---|
| Phase 1 (A + B) | Claude Code | 2026-07-29 | ✅ passed |
| Phase 2 · C1–C4 réception | Claude Code | 2026-08-23 | ✅ passed |
| Phase 2 · C5 saisie résultats | Claude Code | 2026-08-25 | ✅ passed |
| Phase 2 · C6 double validation | Claude Code | 2026-08-25 | ✅ passed |
| Phase 3 (D) | Claude Code | 2026-08-25 | ✅ passed (delivery pending DNS) |
| Phase 4 · E1 clients | Claude Code | 2026-08-25 | ✅ passed |
| Phase 4 · E2 facturation | Claude Code | 2026-08-25 | ✅ passed |
| Phase 4 · E3 administration | Claude Code | 2026-08-25 | ✅ passed |
| Phase 5 · F1–F3 code portion | Claude Code | 2026-08-25 | ✅ passed (VPS steps pending) |
| Phase 5 · F3 VPS deploy + backup/restore | Claude Code | 2026-08-26 | ✅ passed (HTTPS waits on domain) |
| Phase 5 · F4 live smoke pass | Claude Code | 2026-08-26 | ✅ passed |
| **Full circuit on production** | Claude Code | 2026-08-26 | ✅ passed — réception → saisie → double validation → rapport + alerte, all live |
| Pack d'indépendance (H) | Claude Code | 2026-08-27 | ✅ passed — toggles, blocage/libération, alerte anticipée sans doublon, facteur, logo, import (dev server, circuit complet) |
| Phase 6 · G1 Achat & Stock | Claude Code | 2026-08-27 | ✅ passed (now visible; magasin1 exists locally and on prod) |
| Phase 7 · G2 Qualité | Claude Code | 2026-08-27 | ✅ passed — métrologie, températures hors plage, EIL, dashboard |
| Audit round 1 (I) | Claude Code | 2026-09-07 | ✅ fixes verified (132 tests, build, lint, browser smoke); go-live shutdown to run at recette |
| Audit round 2 + recette production (J) | Claude Code | 2026-09-09 | ✅ passed — 99 contrôles en direct sur http://185.217.126.53 (2 circuits complets, 9 comptes, 25 pages, sondes d'habilitation), 137 tests, build + lint |
| Analyse des écarts du 10/10 (V11) — build | Claude Code | 2026-10-10 | ⏳ code gates green (tsc 0, eslint 0, vitest 90 files / 1 396 tests, build); not deployed — production recette V11 pending |
| Réponses du 12/10 (V13) — build + local recette | Claude Code | 2026-10-13 | ✅ 137/137 on an isolated local copy (:3230, local DB); gates green (prisma generate, tsc 0, eslint `src` 0, vitest 96 files / 1 590 tests); not deployed — V13-E pending |
| Prise en charge libre (V14) | Claude Code | 2026-10-13 | ✅ deployed 13/10 (`9d338ae`) — tsc, lint, vitest 1 632/1 632, build; adversarial review (18 findings fixed); `v14-take.mjs` 40/40 local and 40/40 on production; remaining unticked V14 items (users warning, `?date=` bench sheet, legacy split line) to run by hand |
| Remarques du 14/10, lot 1 (V15) | Claude Code | 2026-10-14 | ✅ deployed 14/10 (`52e0d27`) — tsc, lint, vitest 1 796, build; adversarial review (17 findings fixed); browser in English: local 23/23, production 24/24; V14 regression 40/40; remaining unticked V15 lines to run by hand |
| Lot 2 + lot 1b, réponses du 16/10 (V16) — local | Claude Code | 2026-10-19 | ⏳ built and tested **locally only**, not deployed (branch `lot2-retour-16-10`: `9770bb0`, `d7b8750`, `124af3a`, `b898586` + final fixes, committed `d9dcd2d`) — tsc 0, eslint 0, vitest 117 files / 2 312 tests, build 93/93; adversarial reviews per wave (15, 15, 26, 31 findings) + a whole-branch review (6, fixed); local recette v16-1 63/63, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40; deploy rehearsed on a copy at the production schema; every production line pending (the owner, after the deploy gates) |
| Lot 2C, réponses du 19/10 (V17) — local | Claude Code | 2026-10-20 | ⏳ built and tested **locally only**, not deployed (branch `lot2-retour-16-10`: migration `c5db24e`, then `7b1b540` H1, `f057892` H2 + H3, `a83ec7e` H4, `5666f3b` D-15–D-18, `1cb4a4f` D-19) — tsc 0, eslint 0, vitest 123 files / 2 479 tests, build 94 pages; a review per area, every finding fixed (accounts 3, clients 5, programme 5, invoice 4, parameters 6); local recette `v17-local.mjs` 78/78 (+ `local-v17-h1.mjs` 53/53, `local-v17-clients-h2-h3.mjs` 31/31), regressions v16-1 62/62, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40; every production line pending (the owner, after the deploy) |
| Dettes fermées avant le déploiement (V18) — local | Claude Code | 2026-10-21 | ⏳ built and tested **locally only**, committed and pushed, not deployed (branch `lot2-retour-16-10`: `0c8bd0d` money, `e224170` D-09, `7c35cfe` reception « Annuler », `7490af8` D-19 concurrent edit, `287ed6a` Q82, `533d56c` B2, `e879e21` early alerts, `eeb9de6` a11y; no migration) — tsc 0, eslint 0, vitest 133 files / 2 695 tests, build 94 pages; `v18-local.mjs` 53/53; regressions v16-1 64/64, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40, v17-local 78/78, v17-h1 53/53, v17-h2-h3 31/31; every production line pending (the owner, after the deploy — next, by the decision of 21/10) |
| Lot 2E — propositions 2.13 / 2.15 / 2.16, numéros de rapport, scission, lignes supprimées de l'ancien logiciel (V19) — local | Claude Code | 2026-10-24 | ⏳ built and tested **locally only**, committed and pushed, not deployed (branch `lot2-retour-16-10`: `236bf44` counter, `552c656` bench, `504f17f` series, `b1b8978` misc, `1130492` split, `8ad569f` OBSOLETE = 2; no migration) — tsc 0, eslint 0, vitest 149 files / 2 971 tests, build OK; a hostile review per area, every finding applied; `v19-local.mjs` 72/72, `v19-paillasse-local` 70/70, `v19-serie-local` 50/50 + 18/18 in the browser, `v19-misc-local` 56/56; regressions v16-1 64/64, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40, v17-local 78/78, v17-h1 53/53, v17-h2-h3 31/31, v18-local 53/53; the reprise (f) and the splits rehearsed on the local copy; every production line pending (after the deploy) |
| Extensions (G3) | | | |

## Checkpoint I — Audit round 1 (2026-09-07)

- [x] `GET /api/samples` / `GET /api/clients` refuse MAGASINIER; TECHNICIEN's
      list is their bench only.
- [x] Logo upload refuses a data URI with anything after the base64 body
      (400); a clean PNG uploads and prints.
- [x] Double validation: the same user cannot validate AND approve
      (unit-tested; 409 on the API).
- [x] Dashboard / factures / client 360 headline figures come from
      `/api/samples/stats` and `/api/invoices/stats` (verified on the dev DB:
      7 samples, 3 invoices, 4 704,00 DH — independent of the page).
- [x] On-screen invoice shows the identity saved in /admin/entreprise
      (verified: identity, IBAN, TVA recap).
- [x] Every space page renders with its own `requireRole`; 132 tests,
      build + lint green.
- [ ] 🔒 Go-live: `scripts/disable-demo-accounts.sh` refuses until a real
      ADMIN exists, then bans the 9 demo accounts; set
      `NEXT_PUBLIC_DEMO_MODE=false`, rebuild, confirm demo logins fail.
- [ ] Next 02:00 backup logs « backup ok » (temp-file path + completion
      marker).


## Checkpoint J — Audit round 2 + recette de production (2026-09-09)

Second passage adversarial (5 relecteurs) lancé **contre le commit du round
1 lui-même**, puis recette exécutée sur le système déployé, la veille de la
présentation client. Tout ce qui suit a été observé en direct sur
http://185.217.126.53, pas déduit du code.

**Comptes** — les 9 comptes de démonstration se connectent et arrivent sur
leur espace. Better Auth limite les connexions rapprochées : trois réponses
429 pendant la première passe, toutes vertes en espaçant. À savoir pendant
la démonstration : ne pas enchaîner plus de trois connexions en dix
secondes.

- [x] Circuit complet n°1 (alimentaire, E. coli hors seuil) : prélèvement →
      réception (QLC-2026-00002 / SN-VQZM-KKVK) → saisie → soumission →
      validation technique (valid1) → approbation (admin) → rapport
      RAP-2026-00002 + 1 alerte de contamination → PDF 58 Ko → feuille de
      paillasse 48 Ko → facture FAC-2026-0003 → PDF 61 Ko.
- [x] Circuit complet n°2 après correctifs (eau) : QLC-2026-00003, rapport
      RAP-2026-00003, renvoi au client sans doublon d'alerte.
- [x] Le préleveur ne voit jamais le code de contrôle ni le numéro de série
      (payload de l'API vérifié) ; le sérial respecte l'alphabet Crockford.
- [x] Un second technicien est refusé sur la paillasse d'un collègue (403)
      et ne voit pas son échantillon dans sa liste.
- [x] Le validateur ne peut pas approuver (409) ; une seconde validation
      technique est refusée ; l'admin qui a signé l'étape 1 ne se voit plus
      proposer l'approbation.
- [x] Facturer deux fois le même échantillon est refusé (409).
- [x] Habilitations sondées en direct : magasin1 → `/api/samples`,
      `/api/clients`, `/api/parameters` refusés ; tech1 → `/api/invoices`,
      `/api/lab-services` refusés ; pre1 → `/api/admin/users` refusé ;
      compta1 → création de paramètre refusée.
- [x] Le rôle CLIENT n'est plus attribuable tant que le portail n'existe pas
      (400 à la création comme à la modification).
- [x] La suppression définitive d'un compte est fermée (404) : signatures et
      journal d'audit resteraient orphelins.
- [x] Saisies trop longues (lieu, adresse client) : 400 avec message, plus
      de 500.
- [x] 25 pages des 8 espaces répondent 200 ; page la plus lente 718 ms
      (/qualite), médiane ~170 ms.
- [x] Mobile 375 px : aucun débordement horizontal sur la connexion, le
      tableau de bord direction et le relevé de températures ; aucune erreur
      console.
- [x] Heure du laboratoire : le conteneur tourne en Africa/Casablanca, le
      journal d'audit imprime l'heure locale.
- [x] Encaissement d'une facture client (nouveau) : bouton « Marquer
      encaissée », journalisé, l'indicateur « Encaissé » suit.
- [ ] 🔒 Go-live : `scripts/disable-demo-accounts.sh` puis
      `NEXT_PUBLIC_DEMO_MODE=false` + rebuild.
- [ ] Copie hors site des sauvegardes (le VPS sauvegarde sur lui-même).

## Checkpoint K — Recette navigateur en production (2026-09-09)

Parcours refait entièrement à la main dans le navigateur sur
http://185.217.126.53, en 1440×900, un compte après l'autre. Seules les
lignes ci-dessous ont été **vues à l'écran** ; rien n'est coché sur la foi
du code.

- [x] Connexion : les 9 comptes de démonstration sont listés, un clic
      remplit le formulaire, chaque rôle atterrit sur son espace
      (préleveur, réception, technicien, validation, direction,
      comptabilité, commercial, magasin).
- [x] Préleveur : QL-2026-00014 créé en deux étapes ; la liste des
      paramètres se recharge à chaque domaine (5 en alimentaire, 5 en eau,
      5 en ambiance) ; formulaire incomplet refusé avec un message ;
      récapitulatif fidèle ; écran de succès + suivi en 5 étapes.
- [x] Aucun code de contrôle ni numéro de série nulle part chez le
      préleveur (tableau de bord et écran de succès).
- [x] Réception : file de 5 échantillons ; « Non conforme » réclame un
      motif et refuse la validation sans lui ; réception conforme →
      QLC-2026-00010 et SN-M4N0-1Q4Q affichés, technicien attribué avec
      sa charge en cours (« Yassine Amrani — 3 en cours »).
- [x] Technicien : paillasse par numéro de série ; conformité calculée en
      direct à la saisie — « 4,5.10² » lu 450 contre une limite de 100
      → non conforme, « Absence » reconnue comme telle ; enregistrement
      intermédiaire puis soumission ; feuille de paillasse PDF (47 Ko).
- [x] Validation : tableau résultat/seuil/conformité, germes sensibles
      marqués ; renvoi au technicien sans motif refusé ; validation
      technique signée et horodatée à l'heure de Casablanca ; le
      validateur ne se voit pas proposer l'approbation finale.
- [x] Direction : approbation → rapport RAP-2026-00004, envoi enregistré à
      qualite@agromaroc.ma, alerte de contamination partie, bandeau « mode
      démonstration » explicite ; la page reste sur l'échantillon avec le
      rapport et le renvoi à portée.
- [x] Rapport PDF (61 Ko) : en-tête laboratoire, client, échantillon,
      traçabilité, tableau des résultats, conclusion nommant le germe non
      conforme, trois signatures (technicien, validateur, direction).
- [x] Journal d'audit : les onze actions du circuit, chacune avec son
      auteur, son rôle et son heure locale.
- [x] Comptabilité : le client sélectionné propose ses analyses validées ;
      3 lignes reprises au tarif du catalogue ; TVA 20 % → 1 236,00 DH ;
      FAC-2026-0004 générée, PDF (61 Ko), « Marquer encaissée » →
      « Encaissée ».
- [x] Commercial : fiche client 360 — 3 échantillons, 1 rapport, facturé
      et encaissé à jour, destinataires par usage (rapports / alertes),
      lien facture ouvrant bien le PDF pour ce rôle.
- [x] Cloisonnement re-sondé en direct depuis le navigateur (gestionnaire) :
      `/api/admin/users`, `/api/stock/items`, `/api/equipments` refusés,
      `/admin` et `/qualite` redirigés.
- [x] Achat & Stock : 4 articles, 1 sous le seuil, 3 factures fournisseurs,
      échéances « en retard » / « bientôt » correctes.
- [x] Système Qualité : 3 équipements, 2 étalonnages à traiter (retard et
      bientôt), 1 excursion de température, 2 campagnes EIL.

### Défauts trouvés par cette recette et corrigés le jour même

- [x] **Exposants perdus dans les PDF** — le conteneur n'a que Liberation
      Sans, sans U+2074 : un seuil « 1.10⁴ UFC/g » s'imprimait « 1.10 UFC/g »
      sur le rapport du client. Exposants convertis en `<sup>`, plus
      fonts-dejavu-core dans l'image.
- [x] **Feuille de paillasse datée de la veille** toute la journée (minuit
      à Casablanca = 23 h UTC la veille) : le jour vient désormais du fuseau
      du laboratoire.
- [x] **Nombres non francisés** à trois endroits : « 1030.00 DH » dans le
      panneau des analyses à facturer, « 5.5 % » de TVA, « 9.4 °C ».
- [x] **Espace comptabilité** : le bloc « prochaines fonctionnalités »
      annonçait encore les trois écrans de la phase 4, livrés depuis.

## Checkpoint S — Recette navigateur en production (2026-10-05)

Two reports at the repo root: `RECETTE-05-10-AUTOMATIQUE.md` (headless
Chrome: 8 role agents, then a scripted sweep of every page / access rule /
document / phone layout — `.ui-tests/sweep-all.mjs`, gitignored folder) and
`RECETTE-05-10-MANUELLE.md` (the circuit by hand in the browser pane). Test
client « TEST UI 2026-10-05 » seeded by the API, purged afterwards,
counters back to 0 / 0.

### S-1 Circuit by hand (pre1 → recep1 → tech1 → valid1 → admin → compta1)
- [x] Visit 7/26 (type search, corrector « Vouliez-vous dire … ? », recap, no control number for the sampler), arrival panel (end before start refused), protocol PDF.
- [x] Reception 7/26: cooler temperature pre-filled, 50 g forces non-conform with a motif, future arrival refused by the server, technician for all lines, N° 13/26 – 15/26, labels and protocol PDF.
- [x] Bench 13/26: Tab across R1 … R5, verdicts satisfaisant / acceptable / non satisfaisant live, blank repetition blocks the submit, anomaly without note refused, submit; 15/26 submitted.
- [x] Validation: regulation proposed and recorded, « Renvoyer au technicien » needs a motif; admin approves 13/26 → RAP-2026-00004 (read at the image), resend; the admin who validated 15/26 cannot approve it.
- [x] Deposit 11/26 (advance without payment mode refused, missing arrival temperature refused) → N° 21/26, bon de réception PDF read at the image.
- [x] Invoice FAC-2026-0003 from the approved sample (prices typed, « Marquer encaissée », PDF read), the sample no longer billable.
- [x] Clients (invalid ICE, duplicate name), stock (item, +10 / −3, history), suppliers and purchase-invoice validation, product type with near-duplicate guard and a criterion, regulation duplicate / archive / restore, user form, counters floor, reactivation with a motif.

### S-2 Scripted sweep on the deployed fixes
- [x] 75 pages over 9 accounts: all 200, no console error, no failed request; 25 cross-role URLs redirected; 13 PDF / Excel documents real; unknown URLs → 404 « Page introuvable ».
- [x] Phone 390 × 844: login, sampler dashboard / form / visit, bench n = 3 — no horizontal overflow, R cells 93 px.
- [~] Scripted login-form check inconclusive (sign-in rate limit saturated by the agents) — done by hand in S-1.

### Défauts trouvés par cette recette et corrigés le jour même
- Unreadable reading (« abc ») in a repetition grid accepted and submitted; manual decision sticking after the reading was corrected (« Dépassement » without a limit); bench sheet without R1 … Rn cells and without the m / M / c criteria; 5-cell grid unreadable on a phone; « 5 unités non lues » for an unreadable value.
- Account creation with a hyphen in the username → 500 (Better Auth's default validator refused it; the auth layer now follows the screen's rule and refuses with a 400 message).
- Hour shown one hour apart between server- and browser-rendered pages on a device whose time-zone data predates Morocco's return to GMT (20/09/2026): `lab-time.ts` makes the laboratory's clock independent of the device (formatting and `datetime-local`).
- PDF links as Next `<Link>` (a prefetch rendered a PDF on every page view); bench sheet in the same tab; honorific shown as first name; generic tab titles; « Administration » badge on billing pages; search subtitle promising an export to the technician; plural « saisi »; closed sample still showing the entry instructions.

### S-3 Afternoon — « les prélèvements ne s'enregistrent pas » (reproduced, fixed, deployed)
- [x] A visit typed with the hour of a device one hour ahead of the legal time (un-updated Windows) → `POST /api/series` 400 « L'heure du prélèvement est dans le futur » and nothing saved; the same visit with the proposed time → 201. Same through the local dev server.
- [x] After the fix: the legal time is printed under the date-time fields with an amber warning on such a device; the refusal message states the legal time and the cause.

### Left for the laboratory
- Q40 Salmonelles « Absence /1g » vs parameter « /25 g » (ABATS CRUS DE VOLAILLE); the demo-accounts panel and the shared password until go-live (`DEPLOY.md`); Windows / Chrome time-zone update on the lab's devices.

## Checkpoint T — Le programme d'analyse en production (2026-10-05, night)

Spec `PROGRAMME.md`. Built in four phases (P1 fondation, P2 écrans, P3
adaptations, P4 gates), gates green (tsc, eslint, 400 tests, build), migration
`20261006100000_programme` applied on production by the deploy. Recette through
the APIs (`.ui-tests/recette-programme.mjs` + `-2.mjs`, 22 checks) and in the
browser pane as `param1`, on a client « TEST UI 2026-10-06 » purged afterwards
(counters back to 0 / 0).

### T-1 Circuit
- [x] Account `param1` (Responsable des paramètres) created through `/api/admin/users`; its space `/programmation` opens with the menu of §2; the header reads « Responsable des paramètres · Rachid ».
- [x] Visit 1/26 (2 lines), received by `recep1` **without technician** → lines RECU 1/26, 2/26; the bench (`/api/samples` as tech1) does not list them; a result PUT on a RECU line is refused: « En attente de programmation : le responsable des paramètres doit confirmer le programme ».
- [x] Queue `/api/programmation/queue` lists the série; the referential of a line carries 260 types, 43 parameters, 2 technicians, norm versions and catalogue prices.
- [x] Draft saved (status stays RECU); confirming without analysis refused (« Choisissez au moins une analyse avant de confirmer le programme ») ; confirmed with the type ABATS CRUS DE VOLAILLE, 5 analyses, n = 5, prise d'essai 25 g, Coliformes to tech2 with dilution ×10, priority urgente, délai → status PROGRAMME, programmedAt set; edited after confirmation (stays PROGRAMME); `param1` cannot validate (403).
- [x] Billing: the PROGRAMME line is proposed to `compta1` in `/api/clients/[id]/billable` before any result.
- [x] Bench: tech1 and tech2 both see the line; tech1 types his four germs; tech1 refused on Coliformes (« Le paramètre Coliformes thermotolérants à 44°C est attribué à Imane Cherkaoui : vous ne pouvez pas le saisir ») ; submit refused « Il reste 1 paramètre à d'autres techniciens » ; tech2 types Coliformes 2.10², 1.10², 3.10² → the report prints 2.10³, 1.10³, 3.10³ (dilution ×10 applied) ; tech2's submit closes the line (RESULTATS_SAISIS) ; bench sheet PDF per technician.
- [x] valid1 validates, admin approves → RAP-2026-00001 read at the image: « Analyses réalisées par : Yassine Amrani · Imane Cherkaoui », method column NM ISO per germ, criteria n / c / m / M.
- [x] Browser (param1): dashboard indicators (À programmer 1, Programmées aujourd'hui 2, En retard 0, En attente de paillasse 0), queue grouped by série with « Programmer » ; sheet of 3/26 with the seven sections (type with search and the criteria table, profile chip, units chips, prise d'essai, dilution, norm versions, technicians, priority, délai, consignes, vérification d'entrée, facturation) ; type « SALADES AVEC SOURCE PROTEIQUE » + profile « Micro aliments standard » + Yassine + urgente + 25 g → « Programme confirmé le 5 oct. 2026, 20:48 par Rachid Alaoui », badge Programmé, button « Enregistrer les modifications ».

### Défaut trouvé par cette recette et corrigé le jour même
- The programme sheet crashed on production (« Une erreur est survenue ») : `verbsFor` was exported from the "use client" module `SampleVerbs.tsx` and called from the server page — a runtime error that tsc cannot see. Moved to `src/lib/sample-verbs.ts`, redeployed, verified.

### Left
- The germs of a chosen type are listed « non programmé » when a profile chip replaces the ticked analyses afterwards: visible and deliberate, but the lab may prefer the type's germs to stay ticked (to confirm).
- Q41 (« les nombres », numbering) and Q42 (one sample split between technicians) in NEEDEDINFO.

## Checkpoint V17 — Lot 2C (plan du 19/10, `RETOUR-LABO-19-10.md` §3–§4) — built and tested locally 20/10, **not deployed**

Built 20/10 on branch `lot2-retour-16-10`: the migration `c5db24e` (`20261020100000`), then `7b1b540` (H1), `f057892` (H2, H3), `a83ec7e` (H4), `5666f3b` (D-15–D-18), `1cb4a4f` (D-19). One deploy carries lot 2A (V16) and lot 2C — `DEPLOY.md` « Lot 2 du 16/10 ».

Local copy only (http://localhost:3210 on `qlab-local-db` / `qualilab_local`), client « TEST UI 2026-10-06 Traiteur » and « TEST UI V17 … » data only. **Production: nothing run** — every production line is the owner's, with their own accounts, after the deploy. A line is ticked only for what a local run checked, marked « Local 20/10 »; `[~]` = partly checked, the rest named.

**Integration run (20/10, the whole lot 2C together):** gates green — `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 123 files / 2 479 tests, `npm run build` OK; **`.ui-tests/v17-local.mjs` 78/78** (git-ignored; API + served pages + headless Chrome, H1–H4 and D-15–D-19 end to end; it cleans up after itself: samples cancelled, « TEST UI V17 » clients archived, accounts disabled, family deactivated, the test client's fiche put back); regressions on the same tree: v16-1 62/62, v16-2 109/109, v16-3 67/67, v16-4 73/73, v16-final-local 21/21, v16-final-ui 7/7, v15-lot1 24/24, v14-take 40/40 (`CANCEL=1`). Two scripts were adapted to an intended change of lot 2C: v16-3 (an account it creates now chooses its own password first, H1) and v16-1 (D-04 binds its address to a site through the fiche, H3, instead of an UPDATE).

### V17-H1 — Mot de passe à changer (Q81)
API and served pages through `.ui-tests/local-v17-h1.mjs` (git-ignored; 53/53 on 20/10, three « TEST UI V17 H1 … » accounts per run — TECHNICIEN, PRELEVEUR, CLIENT on « TEST UI 2026-10-06 Traiteur » — disabled at the end). Rules pinned by `password-change.test.ts`, `password-change-flag.test.ts`, `password-change-guards.test.ts`.
- [x] admin creates a TECHNICIEN, a PRELEVEUR and a CLIENT → 201 `mustChangePassword: true`, the column set; journal `USER_CREATED` then `USER_PASSWORD_CHANGE_REQUIRED { reason: CREATED }`. *Local 20/10.*
- [x] Signed in with the administrator's password: « / » and /login land on « Mon compte » (/compte; /portail/compte for the client); /technicien, /reception, /admin/utilisateurs, /preleveur lead back there; any API answers 403 « Choisissez d'abord votre mot de passe (Mon compte). » (`/api/samples`, `/api/portail/tableau-de-bord`). *Local 20/10. The portal pages (under their `loading.tsx`) redirect by streaming — 200 with `NEXT_REDIRECT` to /portail/compte, nothing of the client's in the page; /compte sends the client to /portail/compte.*
- [x] « Mon compte » shows « Choisissez votre mot de passe avant de continuer », the form first, button « Choisir ce mot de passe ». *Local 20/10, read in the served page.*
- [x] Each password route keeps its own accounts: the technician on the portal's → 403 « Accès refusé. », the client on the staff's → 403. *Local 20/10.*
- [x] A wrong current password → 400 « Le mot de passe actuel est incorrect. », the flag kept, the APIs still 403. *Local 20/10.*
- [x] Own change → 200 `redirectTo` /technicien, /preleveur, /portail; the column cleared; the renewed cookie opens the dashboard and the APIs; « / » then lands on the dashboard; « Mon compte » without the notice; journal `USER_PASSWORD_CHANGED { required: true, flagCleared: true }` (portal: `portal: true`). *Local 20/10.*
- [x] The administrator's reset sets the flag again and signs the person out (401); the old own password no longer signs in; with the reset one, « / » lands on « Mon compte » again; journal `USER_PASSWORD_RESET` then `USER_PASSWORD_CHANGE_REQUIRED { reason: RESET }`. *Local 20/10.*
- [x] /admin/utilisateurs shows the badge « Mot de passe à changer »; `GET /api/admin/users` lists the flag. *Local 20/10, read in the served page.*
- [x] No demo account has the flag (admin, tech1, pre1, recep1, valid1, param1, commercial1, compta1): no UPDATE. *Local 20/10.*
- [x] The clearing write fails after Better Auth changed the password → 200 `stillRequired`, cookie handed back, journal `flagCleared: false`; the form shows « Votre mot de passe est enregistré, mais votre espace n'a pas pu s'ouvrir. Saisissez ce nouveau mot de passe comme mot de passe actuel… » and the hint « Celui que vous venez d'enregistrer ». *Unit tests only (`password-change-flag.test.ts`, `passwordChangeNext`): a database failure is not provoked on the local copy.*
- [x] Browser: sign in as a freshly created account, read the amber notice, open a menu entry (back to « Mon compte »), choose the password, land on the dashboard; the same on a phone (390 px) as a préleveur, and on the portal. *Local 20/10, `v17-local.mjs` (headless Chrome, its own contexts — the shared browser profile untouched): technician at 1366 px — the sidebar's « /technicien » and a typed /reception lead back to /compte, a wrong current password is refused in the form, « Choisir ce mot de passe » opens /technicien; the admin's reset closes the browser's session (→ /login), the reset password leads to the notice again; préleveur at 390 px — no sideways scroll, /preleveur/nouvelle-visite → /compte, the choice opens /preleveur; portal — /portail/echantillons → /portail/compte, the API 403 then 200, a reset closes the session (401).*
- [ ] Production (the owner, after the deploy): the named accounts are created after the deploy, so each one chooses its password at its first sign-in; one reset on a test account. The demo accounts are disabled, not reset (`scripts/disable-demo-accounts.sh`).

### V17-H2 — IF et RC du client (Q85)
API and served pages through `.ui-tests/local-v17-clients-h2-h3.mjs` (git-ignored; 31/31 on 20/10, « TEST UI V17 Clients … » records).
- [x] `POST /api/clients` as commercial1 with IF « 4012 3456 » and RC « 12345   Ville » → 201, IF « 40123456 » (spaces dropped, as for the ICE), RC « 12345 Ville » (spaces collapsed, the city kept). *Local 20/10.*
- [x] `PATCH /api/clients/[id]`: an IF longer than 30 characters → 400 « L'IF (identifiant fiscal) est trop long (30 caractères maximum). »; tech1 → 403; admin saves « 40 12 34 56 » / « RC 12345 Ville » → 200; a body without the two fields (an older screen) leaves them as they were. *Local 20/10.*
- [x] The fiche (`/commercial/[id]`) shows « IF (identifiant fiscal) » and « RC (registre de commerce) »; the form (`/commercial/[id]/modifier`) has both fields next to the ICE. *Local 20/10, read in the served page.*
- [x] Merge (commercial1): the preview lists the IF and the RC among the fields it fills; the commit fills the kept client's empty IF / RC from the merged fiche. *Local 20/10.*
- [x] Every issue path freezes them in `Invoice.clientSnapshot`: `POST /api/invoices` with `issue: true`, `POST /api/invoices/[id]/issue`, and a credit note (its invoice's). *Local 20/10: FAC-2026-0181, FAC-2026-0182, AV-2026-0103.*
- [x] « Export comptable » (compta1): « Journal des ventes » reads … « Client », « ICE », « IF », « RC » … and no address; an invoice keeps its frozen IF / RC after the client changed them; a snapshot without the two keys (removed by SQL on the local test invoice) exports them empty; the credit note carries its invoice's; an invoice without snapshot (before 10/10, simulated) reads the live client's; « Règlements » names the client only. *Local 20/10.*
- [x] H2 (5): the old software's base holds no client IF / RC (ICE only) — nothing to take over (`RETOUR-LABO-19-10.md` H2). *Local copy `qlabo-fb`, read only, 20/10.*
- [x] Browser: type an IF and an RC in the form, save, read them on the fiche. *Local 20/10, `v17-local.mjs` on « TEST UI 2026-10-06 Traiteur » (commercial1): « dddd dddd » / « RC  ddddd   Ville Test » typed → stored « dddddddd » / « RC ddddd Ville Test », read on the fiche; then an invoice of two analyses of the test client issued → IF / RC frozen; the client's IF changed afterwards → the export (parsed with ExcelJS) keeps the frozen ones; the fiche put back at the end.* Opening the file in Excel itself: not run (the parsed workbook only).
- [ ] Production (the owner): the IF / RC of one client, one invoice issued, the period exported. Before any real merge, the snapshot backfill of `HANDOFF.md` §9 (eight keys, after the lot 2C migration) if the owner decides it.

### V17-H3 — L'adresse propre à un site (Q45)
Same script, same records.
- [x] `POST /api/clients` ignores a `siteId` sent with an address (a new client has no site yet): stored for the whole client. *Local 20/10.*
- [x] `PATCH /api/clients/[id]` with « Site : Site Test Nord », « Tout le client », « Site : Site Test Sud » → each address stored with its site. *Local 20/10.*
- [x] Another client's site or an unknown id → 400 « Le site choisi pour … n'appartient pas à ce client. »; a site that is not an id → 400 « … n'est pas valide. »; a refused save writes nothing. *Local 20/10.*
- [x] A row without `siteId` (an older screen) keeps its address's site; `siteId: null` gives it back to the whole client. *Local 20/10.*
- [x] `CLIENT_UPDATED` carries `emailSites`: the addresses whose site changed, `site: null` for one given back to the whole client. *Local 20/10.*
- [x] A deactivated site: refused while no address of the client uses it (400 « Le site « Site Test Sud » est désactivé : choisissez un site actif ou « Tout le client » pour … »); while one does, kept on that address retyped (a typo fixed) and accepted for a new address, as the form offers it on every row (review of 20/10). *Local 20/10.*
- [x] The form (`/commercial/[id]/modifier`) shows « Tout le client » and « Site : Site Test Nord » in the addresses' select. *Local 20/10, read in the served page.*
- [x] Browser: choose « Site : X » on an address, save, read « (site X) — reçoit les rapports et les alertes de ce site seulement. »; give it back to « Tout le client » and read the warning before saving. *Local 20/10, `v17-local.mjs` (commercial1, a « TEST UI V17 Sites … » client with two sites and three addresses): the select offers « Tout le client » and both sites, the hint under the address, saved → general / Nord / Sud stored, the fiche reads « site … Nord … — ce site seulement », `CLIENT_UPDATED.emailSites` names the two bound addresses; back to « Tout le client » → « Adresse générale : elle ne sera plus réservée au site … » (not saved).*
- [x] The send rule (D-04) is unchanged — a report of a sample of site X goes to the whole client's addresses and X's, never another site's (`email-recipients.test.ts`). *Local 20/10, `v17-local.mjs`: a visit of site Nord received, programmed, analysed, « Valider et envoyer » → EmailLog RAPPORT (SIMULE) to the general address + Nord's, not Sud's; a deposit of site Sud destroyed at the counter → the destruction notice to the general address + Sud's, not Nord's; a deposit without site → the general address only.*
- [ ] Production (the owner): give one site its own address, then validate and send one report of that site.

### V17-H4 — Facture « par paramètre » (Q30)
- [x] An issued invoice of the test client, `?modele=parametre` as compta1 → 200 PDF « FAC-…-par-parametre.pdf »: « Présentation par paramètre » above the table, one line per parameter and price (quantity = number of analyses, unit price, amount), « Échantillons : … » under it; Total HT, TVA, TTC as on the per-line PDF. *Local 20/10: FAC-2026-0176, « Absorbance K 232 nm (Alimentaire) 2 × 100,00 DH », « Échantillons : 851/26-2, 851/26-3 », 200,00 / 40,00 / 240,00 DH.*
- [x] A credit note, `?modele=parametre` → its lines (stored without a sample) grouped through the invoice lines they take back; still « Avoir N° AV-… ». *Local 20/10: AV-2026-0100, two lines → « Absorbance K 232 nm (Alimentaire) 2 × 10,00 DH », « Échantillons : 798/26-2, 798/26-3 », 20,00 / 4,00 / 24,00 DH.*
- [x] Without the parameter, the per-line PDF, unchanged (file name without suffix). *Local 20/10: both documents → 200, one line per stored line; the default HTML compared byte for byte with the previous renderer on five kinds of document.*
- [x] `?modele=foo` → 400 « Modèle de facture inconnu. »; tech1 → 403; commercial1 (gestionnaire) → 200. *Local 20/10.*
- [x] Client sheet as commercial1: each invoice opens its PDF and has « PDF par paramètre » under it; as admin, the rows still open `/admin/factures/…` and the button is on the invoice screen. *Local 20/10, read in the served page.*
- [~] Browser: the « PDF par paramètre » button on the invoice screen (compta1, admin) and on the client sheet (commercial1) opens the PDF in a new tab; a draft keeps its « BROUILLON » watermark, a cancelled invoice its « ANNULÉE » stamp. *Local 20/10, through the API: a draft of the test client → « brouillon-…-par-parametre.pdf », « FACTURE — BROUILLON », watermark, « N° non attribué — brouillon », grouped line. `v17-local.mjs` (headless Chrome): /comptabilite/factures/[id] (compta1) carries the link « PDF par paramètre » (`?modele=parametre`, `target="_blank"`), fetched with the page's session → 200 application/pdf; the client sheet (commercial1) carries it under the invoice. Same run, an invoice of two analyses of the test client: « … (Alimentaire) / Échantillons : a, b / 2 / P.U. », Total HT / TVA / TTC and the amount in words identical on both layouts; its credit note (both lines taken back through `invoiceItemId`) → one line « … 2 × 10,00 DH », 20,00 / 4,00 / 24,00 DH. Not run: the admin's button, a cancelled invoice (covered by `invoice-html.test.ts`).*
- [ ] Production (the owner): one issued invoice and one credit note of the test client, both layouts.

### V17-D15 / D16 — La fiche de programme quand la nature détache la famille
Rules pinned by `programme-sheet-logic.test.ts` (`natureChangeOutcome`, `natureDetachNotice`, the source scan of `changeNature`).
- [x] A family chosen on a received food sample → « Famille « … » choisie ; n : 1 → 5. Enregistrez le programme pour l'appliquer. » *Local 20/10, `v17-local.mjs` (param1, headless Chrome, a « TEST UI V17 Famille … » of three germs).*
- [x] Then the nature « Analyse sensorielle »: the « choisie » notice is gone (D-15); in its place, in amber, « Famille « … » retirée avec la nature « Analyse sensorielle » : n ramené à 1 (au lieu de 5) ; 2 analyses venues de cette famille ont été retirées (« E. coli », « Listeria »). Enregistrez le programme pour l'appliquer. » (D-16); « Aucune famille — lecture en valeur simple. » under it; E. coli and Listeria no longer ticked. Nothing saved: the sample stays « Reçu » (cancelled at the end). *Local 20/10, `v17-local.mjs`.*
- [ ] With the laboratory (Q133): whether a sensory analysis keeps any microbiology at all — the built default removes what came only from the family.
- [ ] Production (the owner, with a named « responsable des paramètres » account): on a « TEST UI » food sample, choose a family, then « Analyse sensorielle » — the amber notice, the family's analyses unticked; cancel the sample without saving.

### V17-D17 — Un seul compte de critères par famille
Rules pinned by `family-list.test.ts` (`germCount`, `criteriaCountLabel`, `criteriaGridCountLabel`, `criteriaGridSavedNotice`).
- [x] A family of four rows and three germs (Coliformes under two norm versions): « 3 critères » in « Familles & critères », in the « Choisir une famille de produits » dialog, in the programme sheet's referential and in `GET /api/product-types`; « 3 critères · 4 lignes » on the family's grid only. *Local 20/10, `v17-local.mjs`.*
- [ ] Production (the owner): one family under two norm versions shows the same « N critères » in the list, the picker and the sheet.

### V17-D18 — La page d'une famille à 1366 px
- [x] /programmation/familles/[id] at 1366 × 900: the headers read « n », « c », « m », « M » (case kept under the uppercase header); every select of the page is a `WrappingSelect` (15 on the test family, none native), no chosen text cut, no sideways scroll. *Local 20/10, `v17-local.mjs`; the programme agent's own check on « TEST UI FULL Plat cuisiné » (13 selects) the same day.*
- [x] An empty grid saved → « Critères enregistrés : la famille n'a aucun critère et sera lue en valeur simple, sans verdict. » *Local 20/10, programme agent's browser check.*
- [ ] Production (the owner): a family's page on the 1366 px laptop — nothing cut, no sideways scroll (read only, nothing saved).

### V17-D19 — Reclasser des paramètres (données)
Rules pinned by `parameter-reclassify.test.ts`; the reading list and the production procedure in `backups/D-19-parametres-a-reclasser-2026-10-20.md` (git-ignored), the name check `.ui-tests/d19-compare-names.mjs`.
- [x] `POST /api/parameters/reclassify` (admin): `preview: true` → the plan, nothing written; `preview: "true"` → 400; param1 → 403; a water parameter to « Autres analyses » (no such nature for water) in the same request → 409 « Aucun paramètre reclassé (« … » refusé). … », nothing written, not even the other one; a replay → 400 « Aucun paramètre à reclasser : il est déjà en « Physico-chimie ». » *Local 20/10, `v17-local.mjs` on « TEST UI V17 Paramètre … » rows (no route deletes a parameter: they stay, outside the food microbiology list).*
- [x] Through /admin/parametres: search, « Reclasser plusieurs paramètres », tick, « Passer en Physico-chimie (1) », the dialog lists the parameter « Microbiologie → Physico-chimie », « Confirmer (1) » → « 1 paramètre passé en « Physico-chimie » … »; journal `PARAMETER_UPDATED` before MICRO / after CHIMIE, `reclassification: { count: 1 }`. *Local 20/10, `v17-local.mjs`.*
- [x] The local copy reclassified through the route (`.ui-tests/d19-apply.mjs`, admin): 293 food parameters MICRO → CHIMIE in one request, one `PARAMETER_UPDATED` each (`reclassification: { count: 293 }`); 62 left in microbiology (56 germs incl. 3 local test rows, 6 to confirm with the lab). *Local 20/10 (parameters pass); ALIMENTAIRE now MICRO 62 / CHIMIE 524 / AUTRE 8 on the local copy.*
- [ ] The owner reviews the list (`backups/D-19-parametres-a-reclasser-2026-10-20.md`, 62 rows not to tick locally — 59 in production, the other 3 are local test germs), then production by the operator after tag + dump, through the screen (`DEPLOY.md` « Lot 2 du 16/10 » step 6; procedure in the same file, names checked with `.ui-tests/d19-compare-names.mjs`: same catalogue → 352 listed, 59 unticked, 293 moved). *Not run: production, the owner's review first.*

### V17 — The deploy (production, the owner)
- [ ] `docker compose logs migrate`: six « Applying migration » (five `20261019…`, then `20261020100000_retour_labo_19_10_comptes_clients`); `_prisma_migrations` holds the six, finished, none rolled back; `User.mustChangePassword`, `Client.fiscalId`, `Client.tradeRegister` exist; no account flagged (`DEPLOY.md` step 3).
- [ ] The laboratory told beforehand (`DEPLOY.md` step 0): first sign-in → choose a password; IF / RC on the fiche; an address per site; « PDF par paramètre ».
- [ ] The named accounts created after the deploy; each one's first sign-in lands on « Mon compte »; the demo accounts disabled, not reset (V17-H1).

## Checkpoint V18 — dettes fermées avant le déploiement (le séparateur des milliers et les dettes de `HANDOFF.md` §9) — built and tested locally 21/10, committed, **not deployed**

Built 21/10 on branch `lot2-retour-16-10`, on top of `d4bff04`, committed and pushed: `0c8bd0d` (A, money), `e224170` (B, D-09), `7c35cfe` (C, the reception's « Annuler »), `7490af8` (D, D-19's concurrent edit), `287ed6a` (E, Q82), `533d56c` (F, B2), `e879e21` (G, early alerts), `eeb9de6` (H, a11y); no migration. Ships with lot 2A and lot 2C in one deploy (`DEPLOY.md` « Lot 2 du 16/10 ») — the next step, by the owner's decision of 21/10 (deploy after every build, then test on production). Local copy only (http://localhost:3210 on `qlab-local-db` / `qualilab_local`), client « TEST UI 2026-10-06 Traiteur » and « TEST UI V18 … » records only. **Production: nothing run.**

**Integration run (21/10):** `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 133 files / 2 695 tests, `npm run build` OK (94 pages); **`.ui-tests/v18-local.mjs` 53/53** (git-ignored; `npx tsx .ui-tests/v18-local.mjs` — API, served pages and a headless Chrome; one visit of 4 samples cancelled at the end except the one whose report was issued, one invoice issued then cancelled with a motif, one parameter and its journal rows deleted, its own sessions deleted); regressions v16-1 64/64, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40, v17-local 78/78, local-v17-h1 53/53, local-v17-clients-h2-h3 31/31.

### V18-A — Le séparateur des milliers (go-live blocker of 21/10)
- [x] An invoice of 1 800,00 DH HT issued by compta1: its page shows « 1 800,00 DH » and « 2 160,00 DH » with U+00A0 between thousands, never U+202F. *Local 21/10 (`v18-local`).*
- [x] Its PDF, per line and `?modele=parametre`: « Total HT 1 800,00 DH », « 2 160,00 DH », never « 1800,00 » nor U+202F (pdftotext). *Local 21/10 (`v18-local`).*
- [x] Unit rules: `formatCurrency` / `formatDecimal` (negatives, zero, millions, NaN), the PDF's `money` is `formatCurrency`, `formatTypedAmount` (« 1800 » → « 1 800,00 DH », refused text as typed), `typedAmountIsNone` (a typed 0 asks for no payment mode and shows no « Avance » line), « Délai moyen » « 2,5 j ». *`labels.test.ts`, `invoice-html.test.ts`.*
- [ ] Production (the owner, after the deploy): one invoice above 1 000 DH, its page and both PDFs.

### V18-B — Qui a saisi chaque lecture (D-09, C3 « Avec lui »)
- [x] tech1 types Coliformes « 50 » → author tech1, the empty E. coli has none; the administrator saves the sheet with E. coli « 20 » → Coliformes keeps tech1 and its time, E. coli is the administrator's; journal `RESULTS_SAVED` `changed` = [E. coli], `replaced` = {}. *Local 21/10 (`v18-local`).*
- [x] tech1 retypes E. coli → his again, `replaced` = { E. coli: the administrator }; the unchanged line keeps its author and time. *Local 21/10.*
- [x] /validation/[id] (valid1): « Saisi par … le … » under each typed result, one per reading. *Local 21/10.*
- [x] The bench opens a line with what was typed after a criterion was added (the single value becomes R1) or withdrawn (R1 becomes the single value, never the figure × factor) — `benchStartingReadings`. *`bench-reading.test.ts`.*
- [ ] Production (the owner): two people type on one sample; the validation page names each.

### V18-C — « Annuler » à la réception nomme la facture (D1)
- [x] /reception/series/[id] as admin, « Annuler » on a sample on an issued invoice: « Déjà facturé (FAC-…) : sa ligne reste sur la facture, la comptabilité établira un avoir. », never the neutral « s'il est déjà facturé… »; Escape closes it, nothing cancelled. *Local 21/10 (`v18-local`, headless Chrome).*
- [ ] Production (the owner): the same on a « TEST UI » sample, dialog closed without confirming.

### V18-D — Un paramètre modifié entre-temps (D-19, point ouvert)
- [x] A form opened, then « Reclasser plusieurs paramètres » → CHIMIE, then the form saves → 409 « Ce paramètre a été modifié entre-temps… » with the stored row; the domain stays CHIMIE; « Recharger » then save → 200, CHIMIE kept. *Local 21/10 (`v18-local`).*
- [x] A tab opened before the deploy (the nine fields, no `version`) → 409 « Cette page date d'avant la dernière mise à jour… », no `current`; a one-field script without `version` → 200, the other fields kept. *Local 21/10.*
- [x] Lock held by another MySQL session, collation-equal corrections (« 10² », case), the drift warning and focus in the browser. *Local 21/10 (`param-race-lock.mts`, `param-race-ui.mjs`, `parameter-edit-conflict.test.ts`).*
- [ ] Production (the owner): before D-19's step 6, reload every /admin/parametres tab (`DEPLOY.md`).

### V18-E — La borne d'inactivité du serveur (Q82)
- [x] A tech2 session aged 40 min (SQL on the local copy, `updatedAt` and `expiresAt` moved together): « / » and /technicien → 307 `/login?motif=inactivite`, the Session row deleted, GET /api/auth/get-session → `null`, an API → 401 « Non autorisé. »; the login page says « Session fermée après inactivité. ». *Local 21/10 (`v18-local`).*
- [x] Aged 10 min → /technicien 200 and stamped again (`updatedAt` < 1 min); pre1 aged 3 days → /preleveur 200, the session kept; a fresh session → 200. *Local 21/10.*
- [ ] Production (the owner): the C3 lines of V11 plus « C3 — the server's bound » above, on a test account.

### V18-F — « Renvoyé par … » (B2)
- [x] Submitted then sent back by valid1 → EN_ANALYSE, tech1's sheet shows « Renvoyé par … »; resubmitted, cancelled, reactivated (PROGRAMME, `rejectedAt` kept) and typed again → EN_ANALYSE without the banner. *Local 21/10 (`v18-local`).*
- [x] The queue's « Renvoyé » chip follows the same rule (`isCurrentSendBack`, one grouped read of the journal); the cancel and reactivate routes never write `RESULTS_SUBMITTED` nor `rejectedAt`. *`send-back.test.ts`.*
- [ ] Production (the owner): a « TEST UI » sample sent back by the validation shows « Renvoyé par … » at the bench; resubmitted, the banner and the chip are gone.

### V18-G — Les alertes envoyées à la validation technique
- [x] E. coli « 1000 » (limit 100), technical validation by valid1 → one alert (SIMULE), its journal row names the send (`emailLogId`), no `reportId`; /admin/envois links it to the sample (« alerte à la validation technique ») and the validation page's « Envois » card lists it — before the report and once the administrator approved (report issued). *Local 21/10 (`v18-local`).*
- [ ] Production (the owner): /admin/envois filtered on « Alerte de contamination » after the next real alert.

### V18-H — Accessibilité des actions du rapport (`ReportDialog`) et des listes d'envois
- [x] Tab and Shift+Tab loop inside the report actions' dialog (rendered controls only), Escape closes it and the focus returns to its opener; the cross is 44 px; the compact « Renvoyer au client » is 40 px tall; /admin/envois and /reception/historique filter and paging buttons are 44 px. *`report-dialog-logic.test.ts` (`focusTrapTarget`); the sizes read in the source.*
- [ ] Production (the owner): on a validated « TEST UI » sample, open « Versions du rapport » and Tab through it — the focus never leaves the dialog.

### V18 — The deploy (production, the owner)
- [ ] `DEPLOY.md` « Lot 2 du 16/10 » step 2: the `UPDATE Session SET updatedAt = UTC_TIMESTAMP(3) …` ran while the app was stopped, right before `deploy.sh` — a staff member signed in before the deploy is still signed in after it (if they reload within 35 minutes).
- [ ] Still six migrations applied (none added on 21/10); the laboratory told to reload every tab (the 35-minute bound).
- [ ] Then the production lines of V18-A to V18-H above, on « TEST UI » data only.

## Checkpoint V20 — Prix et factures par profil (la règle du propriétaire, 24–25/10) — built locally 25/10, integrated 26/10, **deployed 26/10 (`e8cbfe1`), production 57/57**

Prices, amounts, invoices and billing status for COMPTABLE, ADMIN, DIRECTION, GESTIONNAIRE only; the réception keeps the counter's advance (`src/lib/price-access.ts`, `HANDOFF.md` §3 « Prices and invoices »). Committed on `lot2-retour-16-10` on top of `1b01a85`: `fee0b1d` (code + tests), `22fbc53` (the CRLF-only test of HANDOFF §9), then the documents; **no migration**. Covered by vitest (`price-access-guards.test.ts`, `price-access.test.ts`, `price-access-routes.test.ts`, `price-access-clients-routes.test.ts`, `serie-document-advance.test.ts`, `programme-referential-prices.test.ts`).

**Integration run (26/10, local):** `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 155 files / 3 024 tests, `npm run build` OK (94 pages); **`.ui-tests/v20-prix-local.mjs` 99/99** (git-ignored; `export BASE=http://localhost:3210 && node .ui-tests/v20-prix-local.mjs` — API, served pages and their payload, PDFs through `pdftotext`, a headless Chrome for the dialogs; it creates two programmed samples of « TEST UI 2026-10-06 Traiteur », an issued invoice and a draft, a deposit with an advance of 300 DH, then cancels the invoice, deletes the draft, cancels its samples, bans `test.direction.v16` again and deletes its own sessions); regressions on the same tree: v16-3 67/67, v17 78/78, v18 53/53, v19 71/71, v19-serie 50/50 + 18/18 (browser). Local copy only (http://localhost:3210 on `qlab-local-db` / `qualilab_local`); no `direction1` exists locally — the DIRECTION lines ran as `test.direction.v16`.

Local (26/10, by `v20-prix-local.mjs`):
- [x] `pre1`, `recep1`, `param1`, `tech1`, `valid1`, `magasin1`: their menu has no entry towards /comptabilite, /commercial, /admin/factures, /admin/catalogue or /api/invoices; their pages (home, deposit form, historique, the deposit's and the visit's série, /recherche of the billed sample, /programmation and both sheets, /technicien and its temperatures, /validation and both samples, /qualite, /magasin, stock, suppliers) show no DH amount, no FAC/AV number, no « Prix catalogue » / « prix à saisir » / « Facturé à » / « Reste à payer »; the issued invoice's number is absent even from the pages' payload. (`magasin1`'s supplier invoices set aside — owner decision, below.)
- [x] Same six accounts and DIRECTION: the five billing pages redirect; `/api/invoices`, `/api/invoices/[id]`, its PDF, `/api/invoices/stats`, `/api/invoices/export`, `/api/lab-services`, `/api/clients/[id]/billable` answer 403 (DIRECTION: today's state, see the open decision).
- [x] `param1` on /programmation/[id] of a programmed « TEST UI » sample: no section 7 « Facturation », no « Prix catalogue », no « prix à saisir », no DH amount; « Consignes » reads « Lues par la paillasse. »; the nature hint says « recharge les analyses et les profils »; the dashboard subtitle has no « La facturation se prépare ».
- [x] `param1`: the page's payload and `GET /api/samples/[id]/programme` (and `?natureId=`) carry `"prices":{}`, no `unitPrice`; `tech1` 403 on that GET; `admin` gets the prices (597 parameters, 5 priced) and still sees section 7 with « Prix catalogue (HT) » and its total.
- [x] A sample on a draft and one on an issued invoice (`compta1`): `param1`'s sheet foot says « Échantillon sur un brouillon de facture : … » and « Échantillon déjà facturé : un changement d'analyses est à signaler à la comptabilité. » (no FAC number); `admin` reads « Échantillon déjà facturé (FAC-…) ».
- [x] Analyses changed on the billed samples: `param1`'s `PUT …/programme` answers `billing: { notice: « Échantillon déjà facturé : prévenez la comptabilité. » }` (no `invoice`, no FAC anywhere), the draft's notice its own sentence; `admin`'s answer carries `invoice` = the number (« brouillon » for the draft).
- [x] `param1` « Corriger les analyses » at the bench (EN_ANALYSE) on the issued sample: the dialog's warning (browser) and the PATCH answer say « Échantillon déjà facturé : prévenez la comptabilité. » — no number; `admin` (« Corriger la fiche ») reads the number in both; the dialogs closed unsaved.
- [x] `valid1` « Annuler » on the issued sample (/validation/[id], browser): « Déjà facturé : la comptabilité établira un avoir. », no number in the DOM or the payload; DIRECTION and `admin` read « Déjà facturé (FAC-…) : sa ligne reste sur la facture, la comptabilité établira un avoir. »; closed unsaved.
- [x] Bon de réception of a deposit with an advance (300, Espèces, typed by `recep1` — the response carries no advance): `recep1`, `admin`, DIRECTION and `commercial1` print « Avance : 300,00 DH — Espèces »; `valid1` (by its URL) prints « Avance : » empty, no « Espèces »; `pre1` is refused the deposit's bon (not his série); `GET /api/series/[id]` carries no advance to anyone; the deposit form shows « Avance encaissée (DH) » and its mode.
- [x] `pre1` / `recep1` / `valid1`: `GET /api/clients?q=` and `GET /api/clients/[id]/sites` (403 for `valid1`) carry neither `billedFor` / `billedForId` nor `billingClient`; `commercial1`, `compta1`, `admin` and DIRECTION still do.
- [x] No regression: `compta1` invoice list, sheet (450,00 HT / 540,00 TTC), PDF, a payment of 100,00 recorded (« 440,00 » left) then removed with a reason, the invoice cancelled; `commercial1` dashboard (« Factures émises »), client sheet with the invoice and its figures, invoice PDF, `/api/lab-services`; `admin` /admin/factures and /admin/catalogue; `recep1` deposit with an advance. Credit notes: v17 (H4) 78/78 on the same tree.
- [x] `magasin1`: « Factures fournisseurs » still in his menu (pinned — the owner's decision, HANDOFF §3).

Production (26/10 ~02:25 server time, after the deploy of `e8cbfe1` — owner's rule of 21/10; « TEST UI » data only, every role signed in by clicking its demo account, nothing typed as a password; `.ui-tests/v20-prix-prod.mjs` **57/57**, screenshots and PDFs in `backups/recette-prod-v20/`; then `.ui-tests/v20-prix-sweep-prod.mjs`: 61 JSON answers of every GET route the six accounts reach walked for money keys — none, the only hits were `total` counts of samples):
- [x] `param1` on a programmed « TEST UI » sample: no section 7, no « Prix catalogue », no DH amount, no « La facturation se prépare »; no `unitPrice` and no loaded price in the page's payload; `GET …/programme` `"prices":{}`; `tech1` 403; `admin` gets the prices (347 parameters) and section 7.
- [ ] **Not run on production on purpose:** an issued test invoice would use a real FAC number. Covered locally (`v20-prix-local.mjs` E/F) and by `price-access-routes.test.ts`. A « TEST UI » sample on an issued test invoice: `param1`'s sheet foot and « Corriger les analyses » without the number; `valid1` « Annuler » « Déjà facturé : la comptabilité établira un avoir. » (closed unsaved); `admin` reads the number. Then the test invoice cancelled with a motif.
- [x] A « TEST UI » deposit with an advance (série 49/26, 300 DH Espèces, typed by `recep1` — the answer carries no advance): `recep1`, `admin` and `commercial1` print « Avance : 300,00 DH — Espèces »; `valid1` prints it empty; `GET /api/series/[id]` carries no advance; the deposit's sample then cancelled by `admin` (motif « Autre »). `recep1`'s deposit form shows « Avance encaissée (DH) » + « Mode de paiement ». (COMPTABLE opens no bon — the route never admitted it, unchanged.)
- [x] `pre1`, `recep1`, `param1`, `tech1`, `valid1`, `magasin1`: their pages show no DH amount, no FAC/AV number, no price wording; no menu entry towards the billing spaces; the five billing pages redirect; `/api/invoices`, `/api/invoices/stats`, `/api/invoices/export`, `/api/lab-services` 403; `GET /api/clients?q=` without `billedFor` (pre1, recep1, valid1).
- [x] No regression: `compta1` invoice list with amounts and `/api/invoices`; `commercial1` dashboard « Factures émises » and `/api/lab-services` with prices; `admin` `/admin/catalogue` and `/admin/factures`; `billedFor` for commercial1, compta1, admin. `magasin1` keeps « Factures fournisseurs ».
- [x] The owner's two answers written in HANDOFF §3 (26/10: the MAGASINIER keeps the supplier invoices; DIRECTION unchanged).


## Checkpoint V19 — Lot 2E (propositions 2.13 / 2.15 / 2.16 de la relance, numéros de rapport, scission des familles, lignes supprimées de l'ancien logiciel) — built and tested locally 23–24/10, committed, **not deployed**

Built 23–24/10 on branch `lot2-retour-16-10`, on top of `8454894` (production's `4946ec3` + documents), committed and pushed: `236bf44` (B, report counter), `552c656` (C, bench), `504f17f` (A, « toute la série »), `b1b8978` (D, misc), `1130492` (E, « Scinder par domaine »), `8ad569f` (F, the reprise's step (f)); **no migration**. The three re-ask proposals sit behind the switches of `src/lib/lab-proposals.ts` (`HANDOFF.md` §9). Local copy only (http://localhost:3210 on `qlab-local-db` / `qualilab_local`), client « TEST UI 2026-10-06 Traiteur » and « TEST UI V19 … » records only. **Production: nothing run.**

**Integration run (24/10):** `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 149 files / 2 971 tests (four runs in a row, two at once), `npm run build` OK; **`.ui-tests/v19-local.mjs` 72/72** (git-ignored; the whole lot through the API, the served pages and headless Chrome; run 3, after the local operations, with `EXPECT_RETIRED=0`; it cancels its samples without a report, archives its families, disables its test account and deletes its sessions); `v19-paillasse-local` 70/70, `v19-serie-local` 50/50 (API, with the regulation scenario) + 18/18 (`node .ui-tests/v19-serie-local.mjs browser`), `v19-misc-local` 56/56; regressions v16-1 64/64, v16-2 109/109, v16-3 67/67, v16-4 73/73, final 21/21 + 7/7, V15 24/24, V14 40/40, v17-local 78/78, local-v17-h1 53/53, local-v17-clients-h2-h3 31/31, v18-local 53/53.

### V19-A — « Toute la série » (re-ask 2.16, `SERIES_VALIDATION`)
- [x] valid1, /validation: « Valider techniquement la série (3) » on the série's group → « 3 validés techniquement », the three signed at step 1/2. *Local 24/10 (`v19-local`).*
- [x] admin, /validation/[id]: the card « Toute la série » with « Valider la série (3) »; the dialog says each line's « Conclusion : … »; « 3 validés », the reports issued, « à envoyer ». *Local 24/10.*
- [x] valid1 at 375 px: « Envoyer la série au client (3) », no horizontal scroll; « 3 envois simulés »; three RAPPORT_ENVOYE; three `REPORT_SENT` and the six signatures carry `viaSerie`; the timeline reads « (toute la série …) ». *Local 24/10.*
- [x] Set aside with their reason, never touched: wrong step, amendment pending, report already sent, the same signer at step 2, a regulation to choose (none, or archived); each line records the regulation its own panel would preselect, no second `SAMPLE_REGULATION_SET` at step 2; one refused or failing sample never undoes the others; a send already in flight set aside. *`v19-serie-local` 50/50 + 18/18; `serie-validation.test.ts`, `validation-server.test.ts`.*
- [x] Switch off: the four série routes answer 404 before reading anything, the pages hide the buttons. *`serie-validation.test.ts`.*
- [ ] Production (the owner, after the deploy): **one 2-sample « TEST UI V19 » série only** — step 1, step 2 « Valider », « Envoyer la série » → « 2 envois simulés ». Each approval uses up a real number of the laboratory's RAP sequence: write the two numbers down.

### V19-B — Numéros de rapport (compteur `RAPPORT`)
- [x] Four simultaneous approvals → 200 ×4, RAP-2026-00204 … 00207, distinct and consecutive; no other duplicate in `Report`; the counter equals the highest number; each version 0 keeps its number; four `SAMPLE_APPROVED`, each with its number. *Local 24/10 (`v19-local`).*
- [x] Seated at the highest report, a burst of 60 approvals with no sample left report-less, the same sample approved twice at once (one report, no number burnt), a rolled-back issue burns nothing, a deadlock of the counter's statements run again, 1st January at 00001. *`report-number.race.test.ts` (local database), `report-number.test.ts`, `retry-unique.test.ts`, `counters.test.ts`.*
- [ ] Production (the owner): the first approval after the deploy takes the number after the highest RAP-2026 there; `full-db-integrity.mjs` reports no `counter.rapport-below-highest` and no `dup.report-number`.

### V19-C — La paillasse : « Saisi par », écrans sans client (2.15), « Reprendre » (2.13)
- [x] « Saisi par <tech1> le … » under Coliformes, once. *Local 24/10 (`v19-local`).*
- [x] tech1's /technicien lists « Série NN » without the client's name (neither on screen nor in the RSC payload), the admin's names it; tech2's /technicien/[id] has no « Client »; tech1's /recherche finds the sample with no client column or name; tech1's `GET /api/samples` returns no client, `lieu` nor site, and `?q=<client>` finds nothing; the admin's names the client. *Local 24/10.*
- [x] tech2: « Reprendre cet échantillon à <tech1> ? », then his sheet opens for entry; `assignedAt` unchanged (the report's « Date d'analyse »); `SAMPLE_TAKEN_OVER` (tech2, previous holder tech1, 1 reading); tech1's reading keeps its author and time; tech1 saves → 403 naming tech2, nothing written; tech1's /technicien reads « Repris par <tech2> · <heure> »; tech2 saves: Coliformes stays tech1's, E. coli is tech2's; the sheet shows both « Saisi par »; the validation timeline reads « Repris à un collègue ». *Local 24/10.*
- [x] The refusals before a take-over; a holder changed meanwhile → 409, nothing journalled; a non-string `holderId` or no body → 400; a take-over between the save and the submission; a sheet opened before a colleague's save (A → B → A) → 409, reloaded with their readings, the typing kept; a legacy « réservé à » 403 reloads the sheet without freezing it. *`v19-paillasse-local` 70/70 (API and browser); `take-over.test.ts`, `take-over-sheet.test.ts`.*
- [ ] Production (the owner): two technicians on one « TEST UI » sample — « Reprendre », then each reading names its author; a technician's /technicien and /recherche show no client.

### V19-D — Divers : session fermée exprès, « Précision », chiffres, image
- [x] A click on « Précision » puts the cursor in its text box, named « Précision »; a TEST UI V19 sample cancelled with a précision typed after a click on its label. *Local 24/10 (`v19-local`).*
- [x] The bench reads « lu 1 800 ufc » with U+00A0, never U+202F. *Local 24/10; `screen-figures.test.ts` (no `toLocaleString` left).*
- [x] The administrator resets a TEST UI V19 account's password → its next « / » lands on `/login?motif=reinitialisation` with « Votre mot de passe a été réinitialisé par l'administrateur… », not « inactivité ». *Local 24/10.* The disabling, the portal access, the own password change, a re-enabling and a forged cookie: *`v19-misc-local` 56/56; `session-revocation*.test.ts`.*
- [ ] Production (the owner): on a « TEST UI » account with an open page (never a demo account), a reset, then a disabling → `/login?motif=reinitialisation`, then `desactivation`, each with its notice (the `__Secure-` cookie is covered by unit tests only); then `node .ui-tests/v15-lot1-prod.mjs` (production default, `TEST_SITE` = « Site démo recette »).
- [ ] Production: the build and `migrate` logs of the deploy hold no « prisma:warn … openssl » line.

### V19-E — « Scinder par domaine »
- [x] On a « TEST UI V19 … Famille mixte »: the preview as param1 → 403; as admin, one group « physico-chimie », the proposed name « … — physico-chimie » and type d'analyse; POST « Autres analyses » → 400; the dialog « 1 critère actif « Physico-chimie » (1 germe) quitte … », « Scinder (1 critère) »; then « Famille « … — physico-chimie » créée avec 1 critère »; the new family: same client, « Physico-chimie des aliments », active, the row copied active; the source keeps Coliformes, its physico row deactivated (not deleted); journal `PRODUCT_TYPE_CREATED` + two `CRITERIA_UPDATED`; a second confirmation with the old preview → 409; a new preview: nothing left to split. *Local 24/10 (`v19-local`).*
- [x] A criteria grid opened before the split → 409, the moved rows stay inactive, nothing journalled; open samples refuse the split (listed); the amber warnings; the lock order. *`criteria-grid-route.test.ts`, `family-split.test.ts`, `family-split-route.test.ts`.*
- [x] The local copy (24/10, after V19-F): HUILE, FARINE DE POISSON and the three client-named families split through the route, 43 rows copied, still 5 066 active criteria; AUTRES was split on 23/10 (« AUTRES — physico-chimie », 299 rows). *`backups/operations-locales-2026-10-24.md` (outside the repo).*
- [ ] Production (the operator, after the deploy and **after V19-F**): the six families split through the screen, each preview read before « Scinder » (`DEPLOY.md` « Lot 2E »); then the reprise's analysis = 0 with no family « laissée telle quelle »; regulation 1895 on « AUTRES — physico-chimie » only if the laboratory confirms.

### V19-F — La reprise : lignes supprimées de l'ancien logiciel (étape (f))
- [x] Local: the analysis « 344 à désactiver dans 303 familles »; the commit deactivates 344 rows (5 410 → 5 066 active criteria) and clears 899 meaningless c, nothing else; the next analysis 0; the Listeria row (NM ISO 11290-2:2017, m = 100) deactivated; 467 `LEGACY_CATALOGUE_REPRISE`, 303 with `retired`. *24/10, `backups/operations-locales-2026-10-24.md`.*
- [x] The API's analysis and the « Importer le catalogue » screen show the same count (« 0 à désactiver · 1 famille laissée telle quelle » after); « supprimé dans l'ancien logiciel » among the rows not imported. *Local 24/10 (`v19-local`, run 3).*
- [x] OBSOLETE 2 / 3 / empty → « supprimé dans l'ancien logiciel »; the rows kept (a germ × norm version still in service); the twins of (b) retired; hand-edited and split families left alone and listed; the journal; a second plan empty. *`legacy-catalogue.test.ts`.*
- [ ] Production (the operator, after the deploy, **before** V19-E's splits): a labelled dump; the analysis (≈ 268 rows expected), « Importer » with its `planHash`, the analysis again = 0 (`DEPLOY.md` « Lot 2E »).

### V19 — The deploy (production, the owner)
- [ ] `docker compose logs migrate`: « No pending migrations to apply. » (lot 2E adds none); health ok; the eight row counts of the last deploy unchanged; no « prisma:warn … openssl ».
- [ ] Then V19-F, then V19-E, then the production lines of V19-A to V19-D, on « TEST UI » data only.

## Checkpoint V16 — Lot 2 et lot 1b (plan du 16/10, `RETOUR-LABO-16-10.md` §3–§4) — built and tested locally 19/10, **not deployed**

Built 19/10 on branch `lot2-retour-16-10`: `master` (`a1ad186`) + `9770bb0` (wave 1), `d7b8750` (wave 2), `124af3a` (wave 3), `b898586` (wave 4); the final verification's fixes were in the working tree (V16-F), committed the same day as `d9dcd2d`. One section per wave. One deploy carries the four waves and their five migrations, after a restore point (tag + labelled dump outside the rotation) — `DEPLOY.md` « Lot 2 du 16/10 ».

**Run 19/10 — local copy only** (http://localhost:3210 on `qlab-local-db` / `qualilab_local`; scripts in `.ui-tests/`, git-ignored, each run with `BASE=http://localhost:3210`; client « TEST UI 2026-10-06 Traiteur » and « TEST UI V16 … » data only, test samples cancelled at the end). Final sequential pass, last line of each script: `v16-1-local` **63/63**, `v16-2-local` **109/109**, `v16-3-local` **67/67**, `v16-4-local` **73/73**, `v15-lot1` **24/24** (V15 regression), `v14-take` **40/40** (V14 regression, `CANCEL=1`); final verification `v16-final-local` **21/21** (API + SQL) and `v16-final-ui` **7/7** (headless Chrome: dialogs opened, never submitted; fixtures `v16-final-ui-setup.mjs`, cancelled by `v16-final-cleanup.mjs`). A line is ticked only for what these runs checked, marked « local 19/10 »; `[~]` = partly checked, the rest named. **Production: nothing run** — every « Production » line stays unticked until the owner runs it after the deploy.

Rules for the production run — production holds real laboratory data:
- Work **only** on the test client « TEST UI 2026-10-06 Traiteur » (and invented « TEST UI V16 … » clients, sites or familles); create new test séries on it, cancel them at the end. Never create, rename, merge or attach a real client or site; never type on a real sample; **never edit a real famille or criterion** (the catalogue is shared and bench plans read live criteria).
- The demo accounts are disabled before this deploy (D1), so **every production line is run by the owner with their own accounts**; an agent never types a password on production.
- Refresh every page opened before the deploy.

### V16.0 — Gates, review, rehearsal, deploy
- [x] Gates on the branch with the final fixes — local 19/10: `npx tsc --noEmit -p .` 0, `npx eslint src` 0, `npx vitest run` 117 files / 2 312 tests, `npm run build` (Prisma Client 7.8.0, 93/93 static pages, standalone output).
- [x] Whole-branch review, read-only — local 19/10: every API route behind `requireApiRole` or the portal guard (`/api/health` excepted), every page behind `requireRole` or a redirect, no new API route; the guard tests exact; `prisma migrate diff` (local DB vs schema) empty, `migrate status` 39 migrations up to date. 3 medium + 3 low findings → V16-F.
- [x] Deploy rehearsal — local 19/10, throwaway DBs on `qlab-local-db` loaded from the 13/10 copy (production schema, 34 migrations, `migrate diff` against `master`'s schema empty): `npx prisma migrate deploy`, and the compose `migrate` command run from an image built out of `git archive HEAD` (Linux `next build` 93/93), both apply the 5 migrations, exit 0; a second run « No pending migrations »; the 44 tables row-hashed identical before / after; `handsState` and `EmailLog.type` keep their stored positions, a `NON_LAVEES` fixture survives, an invalid value is refused; the 92 reports render byte-identical through `master`'s code and the branch's; on a standalone production build (:3240, stopped afterwards) 67 pages and 17 PDFs answer 200 for seven roles, no error digest; old reports keep the 13/10 layout, old protocoles and bons reprint with the new wording.
- [x] V14 and V15 regressions on the branch — local 19/10: `v14-take` 40/40, `v15-lot1` 24/24.
- [ ] The final verification's fixes and the docs committed on `lot2-retour-16-10` (`src/lib/billing-hold.ts` added); gates re-run on the commit.
- [ ] The gates recorded (HANDOFF §9): the answers 2.1 / 2.6 or the owner's written decision (wave 2); named accounts, `disable-demo-accounts.sh`, `NEXT_PUBLIC_DEMO_MODE=false` (D1); the `Invoice.clientSnapshot` decision (E4); the laboratory told; production's largest criteria grid ≤ 1000 rows (≤ 500 for a hands, surface, water or air family).
- [ ] Production: tag `v1.4-avant-lot2-16-10` on origin = `a1ad186` (`git ls-remote --tags origin v1.4-avant-lot2-16-10`); labelled dump `qualilab_avant-lot2-16-10.sql.gz` taken with the app stopped, `gzip -t` passes, the last line reads « -- Dump completed ».
- [ ] Production, after the deploy: `migrate` exited 0 after five « Applying migration `20261019…` »; 5 rows `20261019%` finished, none rolled back; `handsState` and `EmailLog.type` show the appended values; the eight row counts unchanged; `/api/health` ok; no error in the app's log; tzdata check.
- [ ] Production, the owner's 5-minute check: demo panel absent and demo accounts refused; every dashboard opens; an old report and its duplicata keep the 13/10 layout; an old protocole and bon reprint with the new wording.

### V16-1 — Vague 1 : corrections sûres (no migration) — `9770bb0`
- [~] A2: the « Fonction » input is gone at the visit, the deposit and « Corriger la fiche »; an old sample with a function still prints it on its protocole. *Local 19/10 (`v16-1-local`): the visit's hands line has no « Fonction » field and saves without one (`personRole` empty). Not run: the deposit, « Corriger la fiche », an old sample's protocole.*
- [~] A4: « Température au prélèvement » on food, water, other, surface and hands lines (phone width), absent on air; reception card « T° au prélèvement … · T° ambiante … »; protocole and report unchanged. *Local 19/10: « Température au prélèvement (°C) » on the visit's food and hands lines, no « T° relevée » / « T° produit » left; the visit's detail « T° au prélèvement 5 °C »; the reception card « T° au prélèvement 5 °C · T° ambiante 22 °C », no « T°p / T°a ». Not run: water, other and surface lines, the air line, phone width, protocole and report.*
- [~] B5: the bon of a non-conforming deposit analysed with the client's agreement no longer prints « analysé avec l'accord de … »; « en attente de l'avis du client » still prints. *Local 19/10: such a deposit → its bon prints « Non conforme — Emballage ou contenant non conforme » and no « accord de » nor the consulted person's name; the agreement is still stored. Not run: « en attente de l'avis du client ».*
- [~] C1: the bench sheet (tech1, then admin) carries no client name; control number, nature, designation, série and lot remain. *Local 19/10: tech1's sheet and param1's day sheet list the test samples by control number, without the client's name. Not run: the admin's sheet; nature, designation, série and lot read one by one.*
- [~] C4: « 3(-2) » on a single-value line → stored and printed « 3.10² »; the « Facteur ×N » chip shows on single-value lines. *Local 19/10: « 3(-2) » → stored « 3.10² » (the typed « 3(-2) » kept), numeric value 300, the factor applied once, conform; the entry screen reads it back. Not run: the « Facteur ×N » chip, the printed report.*
- [~] C6: a « TEST UI » sample with the « Abats crus de volaille… » family shows « /1 g » on the entry screen, the sheet and the report. *Local 19/10: a TEST UI family of that name created (absent from the local copy) with Salmonelles « absence /1g » → the entry screen shows « /1 g », no longer « /25 g ». Not run: the bench sheet, the report.*
- [x] C7: a submit with a required manual conformity left empty → 400. *Local 19/10: « Présence » saved without a choice → submit 400 « Paramètres incomplets : E. coli. », the sample stays at the bench; with « Non conforme » chosen → 200.*
- [x] F2 (local copy): a family with an imported limitless criterion saves in the criteria grid. *Local 19/10: the unchanged grid → 200, same rows; a limit « 1(-2) » and a m sent with « m non spécifiée » → 400, nothing written; m only, n = 1, c = 1 → 200, the row noted « … sera « Acceptable » » (Q131); M emptied on « m et M chiffrés », or the kind changed → c cleared.*
- [x] D-04: a site-bound address shows its site in the client form and never receives another site's reports. D-05: a QUALILAB deposit without a sampler from a non-PRELEVEUR account → 400. *Local 19/10: an address of the TEST UI client bound to site A, ticked « rapports »: a destruction notice on site B or on the siège does not reach it, one on site A does; with the same address also « Email principal », site B reaches nobody and the refusal says « … appartiennent à d'autres sites. Ajoutez une adresse générale sur la fiche client. »; the form and the fiche read « site … — ce site seulement ». D-05: recep1 → 400 « Indiquez le préleveur Qualilab qui a effectué le prélèvement. », the receptionist naming herself → 400 « Préleveur invalide. », nothing created; with pre1 → 201, `samplerUserId` = pre1.*
- [ ] Production (after the deploy, TEST UI only, the owner): the lines above; F2 on production: open the grid of such a family, do not save.

### V16-2 — Vague 2 : terrain, comptoir, lot 1b (three additive migrations) — `d7b8750`
- [~] A1: a hands line requires one of « Aseptisées ou désinfectées » / « En cours de travail » / « Lavées » (visit, deposit, correction); an old « Mains non lavées » sample reprints « mains en cours de travail » on its protocole and stays correctable; no row rewritten (`_prisma_migrations` + a count before / after). *Local 19/10 (`v16-2-local`): on a phone (390 px) the visit's hands line offers the three chips, starred, none pre-chosen, no horizontal scroll; a visit hands line without a state → 400 « … choisissez l'état des mains. », nothing created; a `NON_LAVEES` line prints « (mains en cours de travail) » on the protocole, never « non lavées »; the visit's fiche reads « mains en cours de travail · T° ambiante 0 °C ». Rehearsal (V16.0): no row rewritten, a `NON_LAVEES` row survives the migration. Not run: the deposit, « Corriger la fiche ».*
- [~] A5 / A6: « Continuer » refused on a visit line without T° ambiante (air included), « 0 » accepted; a deposit without temperatures accepted; « Corriger la fiche » offers both temperatures, a set value cannot be emptied. *Local 19/10: a visit food line and an air line without T° ambiante → 400 « … indiquez la T° ambiante : elle est obligatoire sur la visite. », spaces refused, « 0 » stored 0; a deposit without temperatures → 201; PATCH intake (recep1) « 4,5 » and « 21 » stored, without a reason → 400, emptying either → 400, 500 °C → 400, the refusals change nothing. Not run: the « Continuer » button itself, the dialog's fields.*
- [~] A7: « Autre » on a surface line saves a text (« couteau entier ») with no area; protocole, reception, programme and bench show the text. *Local 19/10: « couteau entier » → `surfaceAreaNote`, area NULL (no default 100); an area and a text together → 400; the protocole prints « couteau entier » under « Surface prélevée »; at the visit the « Autre » chip opens an empty « Préciser » (`v15-lot1` B6b). Not run: the reception, programme and bench screens.*
- [~] A8: « Boîte exposée » with 45 min prints « Boîte exposée 45 min » (protocole, report « Moyen de prélèvement »); an old air sample prints 30 min. *Local 19/10: 45 min → protocole « Boîte exposée 45 min »; a line without minutes → 30 and « Boîte exposée 30 min »; an emptied duration → 400. Rehearsal: an old air line reprints « Boîte exposée 30 min ». Not run: the report's « Moyen de prélèvement ».*
- [~] B1: deposit with « Prélevé le » 07:00 and « Arrivé le » 08:30 saved at 09:40 → C1 1 h 30, bon « Heure 08h30 », report « Date et heure de réception » 08:30; « Prélevé le » empty → refused (or the « heure inconnue » box, per the re-ask → « Non déclarée » + observation); a visit with an emptied « Prélevé le » refused. *Local 19/10: a deposit 07:00 / 08:30 the day before → `samplingTimeDeclared` 1, `arrivedAt` 08:30, bon « Date : … Heure : 08h30 »; no « Prélevé le » → 400 naming the box, nothing created; the box without an observation → 400 (C1 à vérifier), with one → 201, `startedAt` = `arrivedAt`, `samplingTimeDeclared` 0; a visit with an emptied « Prélevé le » → 400; the deposit screen: « Arrivé le » prefilled and starred, « Prélevé le » starred and empty, the box disables it and announces « Non déclarée »; the report's reception = the arrival (checked on a visit, D5). Not run: the C1 figure, the deposit's own report.*
- [x] B1 (wave review): the arrival typed by the préleveur before the reception is kept; once received, the préleveur can neither change nor empty it (400 « … le laboratoire seul peut corriger l'heure d'arrivée. »), the same hour sent again is not a change; the laboratory cannot empty it and corrects it (journal `SERIE_UPDATED` before / after); the received visit's fiche shows « Arrivée au laboratoire » locked with the reason; a reception without any arrival takes the reception's instant. *Local 19/10.*
- [~] B2: a 5-sample visit → « Tous exploitables » → one switched to « Non exploitable » → received; the journal shows 4 true and 1 false. *Local 19/10: « Tous exploitables (5) » → the five cards « Exploitable », the confirmation read, the button « (0) » disabled; sample 2 switched to « Non exploitable » on its card, the others kept, the count stays 0. Not run: the reception's journal.*
- [x] B3: no « emballage » question at reception or at the counter; the motif « Emballage ou contenant non conforme » still selectable. *Local 19/10: no « emballage » on the deposit and reception screens nor on the bon, except the motif; a deposit and a visit reception without `packagingOk` → 201 / 200, `receptionPackagingOk` NULL.*
- [x] B4: « Non reçu » on a TEST UI visit sample → one EmailLog row type NON_RECU (SIMULE while sending is off); the « Annuler » dialog says « Un e-mail est adressé au client » before, and after a simulated send « … n'a pas quitté le laboratoire. Prévenez le client par téléphone. » — never « Client prévenu » (wording changed by the wave's review). *Local 19/10: one new NON_RECU row, SIMULE, subject « Échantillon non reçu — dossier N° … », journal `NOT_RECEIVED_NOTIFIED`; a « Doublon » cancellation writes none; « Fermer » has the focus, described by the notice.*
- [x] D5 / D6: a TEST UI report compared line by line with the lab's excerpt of 15/10 (« Technicien de QUALILAB 'I.NOM' », « N/A », « Lieu de prélèvement », « Date Prod », « Date Exp », « JJ/MM/AAAA HH:MM », one « Date d'analyse », reception = arrival); the protocole header prints the denomination without « — Fonction : »; **a report issued before the deploy re-downloads unchanged** (frozen-first); still two pages. *Local 19/10: a TEST UI visit taken to the approval → the version frozen with the marker `layout: 2`; the PDF prints the demo préleveur's denomination and not his full name, « Lot / Date Prod / Date Exp : N/A », « Moyen de prélèvement : N/A », « Lieu de prélèvement », « JJ/MM/AAAA HH:MM », reception = the arrival typed, one « Date d'analyse » (the take), two pages (pdfinfo); the protocole « Prélèvement effectué par : » the denomination, without « Fonction : », also in the signature box; two old reports (frozen after and before 13/10) keep the 13/10 layout. Rehearsal: 92/92 reports byte-identical master vs branch.*
- [x] D5: « Modifier la conclusion » (admin) shows on the re-downloaded report and on its duplicata, the aligned layout kept. *Local 19/10.*
- [x] D6: « Dénomination sur les documents » in /admin/utilisateurs: PATCH stores it, journal `USER_DOCUMENT_NAME_CHANGED`, a new protocole prints it, a report already issued keeps the previous one (frozen). *Local 19/10.*
- [ ] Production (after the deploy, TEST UI only, the owner): the lines above — the deploy's own checks are V16.0.

### V16-3 — Vague 3 : droits, envoi, clients (`Client.toComplete`) — `124af3a`
- [ ] Preconditions (production gate): named DIRECTION accounts exist and the demo accounts are disabled (`scripts/disable-demo-accounts.sh`, not only the panel hidden) (D1); the owner's `Invoice.clientSnapshot` decision is recorded (E4).
- [x] D1: valid1 reopens a TEST UI report with a reason, two different people sign again, « -A1 annule et remplace » issued; direction1 cancels an EN_ANALYSE TEST UI sample; recep1 gets 409 on a PROGRAMME sample. *Local 19/10 (`v16-3-local`): without a reason → 400, recep1 → 403; valid1 reopens a RAPPORT_ENVOYE report, signs the technical step again and cannot approve (403); the admin approves → « RAP-…-A1 », « RAPPORT AMENDÉ — annule et remplace … », two signatories; a local test DIRECTION account (created for the run, banned afterwards) cancels an EN_ANALYSE sample, journal role DIRECTION; recep1 → 409 on a PROGRAMME sample; valid1 cannot reactivate (403).*
- [x] D2: « Valider » leaves the sample VALIDE (portal « En analyse », no RAPPORT EmailLog); « Envoyer au client » → RAPPORT_ENVOYE; « Valider et envoyer » path; an amended -A1 not sent reads « Envoyer », not « Renvoyer »; the contamination alert still leaves at the technical validation. *Local 19/10: approve without `send` → VALIDE, report NON_ENVOYE, no RAPPORT row, journal `send=false`, portal stage EN_ANALYSE and its report 409; listed in « Validés — à envoyer » (valid1); « Envoyer au client » (commercial1) → RAPPORT_ENVOYE, one EmailLog SIMULE, the portal serves the PDF; `send: "yes"` → 400, nothing written; `send: true` → RAPPORT_ENVOYE at once; the unsent « -A1 » offers « Envoyer », not « Renvoyer »; E. coli 1000 → the alert leaves at the technical validation; the first send from /validation/[id] keeps its outcome on screen after the refresh.*
- [~] E1–E3: « + Nouveau client » at the deposit (recep1) and the visit (pre1, phone width) with only a name starting « TEST UI V16 … », then with address, site and two places (every client created is archived at the end); the places are offered on the next line; a typed e-mail is not stored; a near-duplicate offers « Utiliser ce client »; « À compléter » shown to commercial1 and cleared by « Enregistrer »; TECHNICIEN → 403. *Local 19/10: recep1 POST /api/clients (name, address, site, three places with a duplicate, an e-mail) → 201, `toComplete` 1, no e-mail stored, two places under the site, journal `recipientsIgnored`; without a name → 400; the same exact name → 409 with the existing client; the exact name of a merged archived fiche → 409 naming its live client; pre1 → 201; tech1 → 403; recep1 PATCH → 403; phone 390 × 844: « + Nouveau client » at the deposit opens full screen (« Nom du client (société ou particulier) », no e-mail field; Tab and Maj+Tab stay inside); « À compléter (2) » for commercial1 with the badge and what is missing, cleared by a full save (journal `completed`). Not run: creation from the visit screen (pre1 through the API), the places offered on the next line, « Utiliser ce client » on a near-duplicate.*
- [x] E2: « + Nouveau site… » is a sub-form (name required, address, city, phone, contact); the site created keeps them and is selected; a site named « Siège » → 400, nothing created. *Local 19/10.*
- [~] E4: commercial1 merges two « TEST UI V16 … » fiches created for the test — a merge cannot be undone, never a real fiche (preview, commit, journal names the gestionnaire); RECEPTIONNISTE / PRELEVEUR / TECHNICIEN → 403 on merge. *Local 19/10: recep1 → 403; commercial1's preview writes nothing and counts and warns about the merged fiche's portal account; the commit archives and merges it, `CLIENT_MERGED` ×2 role GESTIONNAIRE, the portal account not moved; commercial1 → 403 on « Rattacher comme site ». Not run here: PRELEVEUR and TECHNICIEN on merge (pinned by `client-merge-guards.test.ts`).*
- [x] C5 + F8: param1 withdraws one analysis of an EN_ANALYSE TEST UI sample: the other results stay, the status stays; recep1 changing analyses after the programme → 403, changing the lot → 200; « NE » typed as a value refused. *Local 19/10: the kept analysis's result stays (same row, same value), the withdrawn one goes, EN_ANALYSE kept, journal `resultsRemoved`; recep1 → 403 with « Après la confirmation du programme, les analyses se changent par le responsable des paramètres. », the lot → 200; param1 correcting the lot → 403; « NE », « non effectué », « N.E. » → 400, the stored value unchanged; /programmation/[id] offers « Corriger les analyses »; /recherche opens the sample there for param1.*
- [ ] Production (after the deploy, TEST UI only, the owner): the lines above.

### V16-4 — Vague 4 : catalogue (`ProductType.natureId`) — `b898586`
- [x] F1: families carry a type d'analyse, the domain follows it; `GET /api/product-types?natureId=` / `?category=` filter as the SQL counts. *Local 19/10 (`v16-4-local`): 560 families, `natureId` on 532, 28 « à préciser »; 0 family whose domain disagrees with its nature; `?natureId=PC_SURFACES` → « HYGIÈNES DE SURFACES »; `?category=ALIMENTAIRE` (with and without the client) = the SQL count, no non-food nature; `?category=XYZ` → 400.*
- [~] F3 on the local copy first: the measurement (families by type d'analyse, criteria re-bound, families still empty) read before the run; a second run plans nothing (production: the next line). The analysis also lists the samples in progress whose verdicts change (start to be judged / lose their criteria, by status), the parameters to create (alert, « sans prix », look-alikes of an existing one), the families changed by hand left alone, the food parameters left without criteria; « Importer… » opens a confirmation naming them; a commit without the analysis's fingerprint → 409 « relancez l'analyse », nothing written. (19/10: the whole path replayed once on a throwaway local schema — pre-F3 dump → September workbook → HEAD's slice J → F3: `created` = the analysis, second analysis empty, a hands sample's bench plan on the copies; `HANDOFF.md` §8.) *Local 19/10: « HYGIÈNES DE SURFACES » → PC_SURFACES / CHIMIE, its 13 active criteria on AMBIANCE parameters; no active criterion of a non-food family on another category's parameter; the analysis after the local run plans 0 writes and writes nothing; it returns the fingerprint, the samples in progress touched, the families changed by hand and the parameters without criteria; « Importer » without, or with another, fingerprint → 409 « relancez l'analyse », base and journal unchanged; param1 → 403. Not run: the « Importer… » confirmation dialog in a browser.*
- [ ] F3, production — the operator, after the deploy (`DEPLOY.md` « Lot 2 du 16/10 » §5): tag + second labelled dump; Analyser; aliases for the look-alikes; the samples in progress checked with the bench; Importer; Analyser again plans nothing.
- [x] F4: param1 opens « Familles & critères », filters « Sans critère », edits a criterion of a « TEST UI V16 … » famille created for the test; tech1 → 403 on every catalogue route; parameters, norms, profiles, regulations stay ADMIN. *Local 19/10: the menu entry; the list grouped by type d'analyse; « Sans critère » changes the count to the badge's (and the SQL's); a family opens on its detail; « HYGIÈNES DE SURFACES » shows « Physico-chimie des surfaces »; at 390 px no horizontal scroll; param1 creates a « TEST UI V16 Famille … » (domain deduced from the nature) and saves its grid; tech1 → redirected from the page and 403 on POST / PUT / PATCH, recep1 → 403 on PATCH; param1 → 403 on parameters, norms, profiles, regulations; the test families deactivated at the end.*
- [~] F5 / F6 (on a TEST UI sample; on production only TEST UI familles are edited): on a hands sample the picker is preset to its type d'analyse and lists the personnel-hygiene families first; choosing it prints UFC/mains on the sheet and the report; changing family removes the old family's germs and keeps the hand-ticked ones, said in section 1 under the family (amber when an analysis leaves or n goes down, « n : 9 → 3 »); « Cocher tout » / « Décocher tout » / counter. « Analyses hors famille »: untick its last analysis (it opened by itself) — the panel and the focus stay. The picker: Tab / Shift+Tab stay in the dialog, Échap closes without changing anything and the focus returns to « Changer de famille… », Entrée after a search goes to the first family found without choosing it (a second Entrée chooses), at 375 px the title has the focus and the form is the only scroller. *Local 19/10: the picker preset to the sample's nature (food: its families + « à préciser » = SQL; hands: MICRO_SURFACES, 9 families = SQL, no « à préciser »); « Tous » = SQL; an accent-free search; the family preview leaves the sheet intact; family A ticks its 3 germs, « 3 paramètres cochés sur 3 », the criterion's unit shown; « Décocher tout » / « Cocher tout »; family B removes A's own germ and keeps the hand-ticked ones, said in section 1 (polite live region, amber); confirm → the stored analyses = the screen; « Analyses hors famille » stays open with the focus; Tab / Maj+Tab, Échap, the focus back, Entrée on the first family; 390 px: full screen, focus on the title, one scroller. Not run: UFC/mains on the sheet and the report.*
- Local copy, 19/10: the wave-4 builders' test families were renamed « TEST UI V16 F1 famille … » / « TEST UI V16 F4 famille de test … » (inactive, through PATCH as admin, journalled); later measurements of F3 / F4 count them as test data. `.ui-tests/v16-4-local.mjs` (73 checks) is the local recette of this wave.
- [x] F9: « Analyse sensorielle » chosen on a food sample's programme sheet; code and control number unchanged; a « …M » goes back to microbiology only, a « …P » to physico-chemistry only, a single sample (bare code) only to the domain it came from (MICRO → sensorielle → PC refused). *Local 19/10: the « …M » referential offers « Analyse sensorielle », not the PC natures; …M → sensorielle → back to MICRO, to PC → 400; …P likewise; the single sample likewise (`natureHome`); a hands sample cannot take the sensorielle (400); code and control number unchanged; the phone sheet's hint says « domaine ».*
- [~] F7 last: « Famille de produits » and « Domaine » on every screen; nothing printed changes. Look at: the visit / deposit line (« Famille de produits », « Familles du client », « — aucune — », « Cochez au moins un domaine d'analyses »), the programme sheet (section 1, the badge « autre domaine que l'échantillon », the nature hint « Dans le même domaine … », on a read-only sheet « Domaine : … », the footer « sans famille », « Analyses hors famille »), « Corriger la fiche », the bench card (« Famille de produits »), the validation page, admin « Familles de produits & critères » and the journal (« Famille de produits créée / modifiée »), « Paramètres d'analyse » (filter « Domaine » · « Tous », empty sections « … dans cette catégorie »), « Recherche » (filter « Catégorie » for Alimentaire / Eau / Ambiance). A report, a bon / protocole de réception, a bench sheet and labels printed before and after read the same (`src/lib/vocabulary.test.ts` holds the words). *Local 19/10: « Famille de produits » / « Domaine » and never « Type de produit » on the programme sheet, a read-only sheet (« Domaine : analyses microbiologiques. »), /admin/types-produits and its detail, /programmation/familles and its detail, the deposit line; the report and the protocole left by v16-2 / v16-3 print no family word. Not run: « Corriger la fiche », the bench card, the validation page, the journal, « Paramètres d'analyse », « Recherche », bench sheet and labels.*
- [ ] Production (after the deploy, the owner): the lines above — only « TEST UI V16 … » familles created for the test are edited, never a real famille, and they are archived afterwards.

### V16-F — Vérification finale (19/10, working tree, not committed)
- [x] F2 grids: a grid of 250 rows saves; above 1000 → 400 « Trop de lignes (1000 maximum). »; a c on an absence criterion is still refused by the API; a grid shown with meaningless imported c saves as shown — 10 c cleared, journalled `tidied`, none « à la main », no c left on the family; one changed cell writes one row and one journal line; the reprise's analysis lists the c to clear (rows, families) and writes nothing. *Local 19/10 (`v16-final-local`).*
- [x] Analyses changed on a billed sample: the programme sheet of a sample on a draft and « Corriger la fiche » on an invoiced one name the draft / the invoice (« Échantillon déjà facturé (FAC-…) »); a correction without an analyses change says nothing; journal `billedOn` = the invoice; « Analyses modifiées après facturation » with the reference on the issued invoice, the same on the draft, the badge on the client fiche. *Local 19/10 (`v16-final-local`, `v16-final-ui`).*
- [x] « Annuler » after the programme: /validation/[id] passes the invoice; the dialog says « Déjà facturé (FAC-…) : sa ligne reste sur la facture »; the cancellation journals `billedOn`. *Local 19/10.*
- [x] « Annuler » on /reception/series/[id] (admin): draft → « Il est sur un brouillon de facture… », none → « …du rapport et de la facturation. »; recep1's payload carries neither `invoiced` nor `alertsSentAt`. *Local 21/10.*
- [x] Receive a série → « Annuler » one line in the summary (« Doublon »): after the refresh the line shows « Annulé · Doublon », no « Annuler », « Réactiver » for the administrator, and the label count drops by one (`summaryLineOf`). *Local 21/10.*
- [x] « Rouvrir pour amendement » of a validated, never-sent report says the client never received the version replaced (Q132); of a sent report, no such warning. *Local 19/10 (`v16-final-ui`).*
- [x] The family of a water sample at the bench: « Corriger les analyses » offers « Famille de produits (critères) » with the water families. *Local 19/10 (`v16-final-ui`).*
- [x] « Analyse sensorielle » sets n = 1 and detaches the family, said on the sheet (Q133). *Local 19/10 (`v16-final-ui`).*
- [x] The client Excel export's « Date de réception » and /recherche « Reçu » = the arrival (sampled two days before, arrived the day before, received today), not the reception's instant. *Local 19/10 (`v16-final-local`).*
- [x] No page error in the browser run. *Local 19/10.*
- [ ] Production (after the deploy, TEST UI only, the owner): the lines above, invoices only on the TEST UI client.

### V16-2B — après la relance du 18/10
- [ ] One line per accepted re-ask point (A3, A9, A10, B2 (a)(b), B6, C2, C3, D3, D4, D7–D9, E4 rattachement, E5, G1–G5), written when the answers arrive.

## Checkpoint V15 — Remarques du 14/10, lot 1 (built 14/10, **not deployed** — `RETOUR-LABO-14-10.md` §3)

Spec `RETOUR-LABO-14-10.md` §3: what the laboratory's message of 14/10 asked that needs no answer — P7 (100 / 1000 cm²), R7 (24 h input), R1 + R10 (sites at the counter, search by site and by archived fiche), OLD29 (norm and unit under an analysis), OLD40 (nature on the bench), R6 + C5 (« Non déclarée »), RP3 + RP3c (technician rights), the public-repo cleanup. Built on branch `retour-labo-14-10` from `cd0054f`, **no migration**. Restore point: tag `v1.3-avant-retour-14-10` = `cd0054f`. Run it first on the local copy (Docker `qlab-local-db`), then on production after the deploy.

Rules for the production run — production holds real laboratory data:
- Work **only** on the test client « TEST UI 2026-10-06 Traiteur » (and invented « TEST UI … » sites or clients); create new test séries on it, cancel them at the end. Never create, rename or attach a real client or site; never type on a real sample.
- The steps name the roles by their demo account (`pre1`, `recep1`, `param1`, `tech1`, `admin`, `portail.test`).
- Refresh every page opened before the deploy.

**Run 14/10 — local copy 23/23, then production 24/24** (`.ui-tests/v15-lot1.mjs` locally, `.ui-tests/v15-lot1-prod.mjs` on production; browser in **English (US)**; on production every role signs in by clicking its demo account, nothing typed; one test deposit on the TEST UI client, cancelled at the end; no site created). Checked: 24 h day and hour on the visit (phone width) and the deposit, « 1405 » → « 14:05 », impossible hours refused on the spot, « Maintenant » replacing an impossible hour, « 2:30 PM » refused (« sans AM/PM »), « Continuer » refused while an hour is unfinished and while a new-site name is typed but not created, the site field always shown (disabled before a client; « Siège », sites, « + Nouveau site… »), search by an active site name → « Client — Site » with the site preselected (visit), search by an archived fiche → its parent (local copy), « 100 cm² » / « 1000 cm² » on a deposit Surface line, norm and unit under the analyses (deposit), the nature on the bench rows and the sheet, « Non déclarée » in /recherche and on the client fiche, technician 403 on the programme referential, no console error. Gates: tsc 0, eslint `src` 0, vitest 1 796, `npm run build`; V14 scenario re-run 40/40 locally (no regression); production smoke of every role 18/18. Production after the deploy (`52e0d27`): health 200, app 0 restarts, latest migration unchanged, the one real sample untouched; one « Failed to find Server Action "x" » line in the log = an external probe, not an app error. Restore point: tag `v1.3-avant-retour-14-10` + dump `qualilab_avant-retour-14-10.sql.gz` (gzip -t ok). Not yet run: the remaining unticked lines (visit chips and captions, « Corriger la fiche » chips, site creation and the bon PDF with the site, fiche de visite / réception / programme / accord date fields in English, portal and e-mail « Non déclarée », tech1 API refusals beyond the GET).

### V15.0 — Gates, restore point, deployment
- [x] Gates on the merged tree: `prisma generate`, tsc 0, eslint `src` 0, vitest green (with `wall-input.test.ts`, `client-search.test.ts`, `site-creation.test.ts`, `parameter-caption.test.ts`, `technician-guards.test.ts`, `jsx-entity-space.test.ts`), `npm run build`.
- [x] No migration folder added (`git diff --stat cd0054f -- prisma/migrations` empty); no model or field change in `prisma/schema.prisma` (the only diff is the `ClientProduct` `///` comment example, public-repo cleanup).
- [x] Tag `v1.3-avant-retour-14-10` on origin = `cd0054f` (`git ls-remote --tags origin v1.3-avant-retour-14-10`); a labelled production dump taken just before the deploy (`DEPLOY.md`), `gzip -t` passes, the last line reads « -- Dump completed ».
- [x] After the deploy: `_prisma_migrations` unchanged, `/api/health` 200, app container 0 restarts, no error in its log after the first deposit.

### V15-A — L'heure en 24 h (R7)
- [ ] **Browser in English (US)** (Chrome / Edge display language English, Windows region English (United States)): every date-time field shows a day « JJ/MM/AAAA » and an hour « HH:MM », never AM/PM — Nouvelle visite « Prélevé le … à … » and « Heure de fin »; fiche de visite « Fin du prélèvement » and « Arrivée au laboratoire »; Nouveau dépôt « Prélevé le »; réception « Arrivée au laboratoire »; « Date et heure de l'accord » (dépôt, réception, « Bloqués »); fiche de programme « Délai de rendu promis ».
- [ ] Typing 14:05 on a test visit stores 14:05 legal time (série page, protocol PDF « 14h05 »); 00:30 and 23:59 accepted.
- [ ] « 24:00 », « 9:75 » and « 31/04/2026 » are refused next to the field (« Heure invalide (00:00 à 23:59) » / « Date invalide (JJ/MM/AAAA) »), never reinterpreted, and nothing is sent: a half-typed value (« 14:7 » on the way to « 14:75 ») is never kept; « 2:30 PM » is refused (« sans AM/PM »); « Enregistrer » / « Continuer » / « Valider » refuse while a date-time field is unfinished (message, field shown).
- [ ] « Maintenant » fills the laboratory's hour; « dans le futur » is still refused next to the field; on a device one hour ahead the hint « = HH:MM heure légale » still shows and the stored value is the legal hour (V8 behaviour kept).
- [ ] Keyboard and phone: clicking the label focuses the day; Tab moves through the day, the hour and « Maintenant » in that order; the calendar button opens the browser's date picker where it has one; the error is read through `aria-describedby`; the numeric keypad opens on a phone (pre1) and the targets are ≥ 44 px.
- [ ] A page opened before the deploy still saves (the value sent is the same « AAAA-MM-JJTHH:mm »).

### V15-B — Surface 100 / 1000 cm² (P7)
- [ ] Nouvelle visite (pre1), Surface line: chips « 100 cm² » and « 1000 cm² » beside the number field; « 100 cm² » pressed on a new line; « 1000 cm² » fills 1000 and is pressed; typing 250 presses neither; the saved test série stores 100 / 1000 / 250 (`Sample.surfaceAreaCm2`) and the protocol PDF prints « 100 cm² », « 1000 cm² », « 250 cm² ».
- [x] Nouveau dépôt (recep1): the same chips on a Surface line.
- [ ] « Corriger la fiche » of a received test surface sample (recep1): the chips are there; « 1000 cm² » with a reason → saved, journal entry.
- [ ] A Surface line left on 100 cm² switched to another type and back to Surface starts on 100 again; a line on 1000 or on a typed area (250) keeps that area through the round trip, its chip or value still shown (`kindPatch` drops only the default 100; the area is never sent on a non-surface line — unchanged rule).

### V15-C — Sites au comptoir, recherche par site (R1, R10)
- [x] Nouveau dépôt: « Site de prélèvement » is always shown, disabled until a client is picked; for a test client without any site it offers « Siège (adresse du client) » and « + Nouveau site… ».
- [ ] « + Nouveau site… » as recep1 on the test client creates « TEST UI Site V15 », selected at once; /admin/journal « Site créé » (`SITE_CREATED`); the site is active on the client fiche. Typing the name of a site already listed (other case or accents) selects it instead of creating a second one.
- [ ] A new-site name typed but not created blocks « Continuer » at the counter and at the visit (« Créez le nouveau site ou annulez sa saisie. », the site field shown); the série is never saved on the siège by mistake.
- [ ] The exact name of a client is found first even when 20 other clients contain the same word; a plain `GET /api/clients` (no `q`, admin tools) still returns every client.
- [ ] A name already used by a deactivated site of the test client → the message under the field says it is deactivated and to ask the gestionnaire commercial to reactivate it; nothing created.
- [ ] The chosen site shows on the step-2 recap and on the confirmation (step 3), and the bon de réception PDF prints « client — site ».
- [ ] Nouvelle visite (pre1) uses the same field: « + Nouveau site… » still creates and selects the site.
- [ ] Typing the name of an active test site (≥ 2 characters) lists « TEST UI … — <site> »; choosing it picks the client and preselects that site, at the deposit and at the visit.
- [ ] Typing the name of an archived test fiche now part of another test client (local copy: attach a « TEST UI » client as a site with « Rattacher comme site de… » first; production: only if such a TEST UI pair exists) returns the live client with the site made from the fiche preselected — never the archived fiche.
- [ ] `GET /api/clients?q=…` answers at most 20 rows and no archived client; a plain search by name, ICE or contact still works; the invoice, merge and attach pickers still show one row per client; changing the client still resets site and memory (V11 A10).

### V15-D — Norme et unité des analyses (OLD29)
- [ ] Nouvelle visite and Nouveau dépôt: under each analysis to tick, a muted line « norme en vigueur · unité » (e.g. « NM ISO 6579 - 1:2021 · /25g » for Salmonella), the unit alone when no norm version is in force; what is sent is unchanged.
- [ ] The programme sheet (param1) shows the same « norme en vigueur · unité » line under each analysis of §2, and its criteria table is unchanged.
- [ ] `GET /api/parameters` carries `normLabel` (null when unknown).

### V15-E — Nature à la paillasse (OLD40)
- [x] tech1: each row of « À prendre », « À commencer » and « En analyse » shows the sample's nature first (« Microbiologie des aliments », « Microbiologie des surfaces »…); the sheet `/technicien/[id]` shows « Nature d'analyse »; a « …P » twin shows its physico-chimie nature.

### V15-F — « Non déclarée » (R6, C5)
- [ ] A test deposit saved with « Prélevé le » left empty (DB `Serie.samplingTimeDeclared = 0`): /recherche column « Prélevé » reads « Non déclarée »; so do the test client's commercial fiche, the admin dashboard's sample table and its detail panel (`SampleTable` / `SampleDetailPanel`), the portal home and « Mes échantillons » (`portail.test`), the report e-mail (`EmailLog` body, SIMULE) and the destruction notice; the report still prints « Non déclarée » (unchanged).
- [ ] A deposit with a typed « Prélevé le » and a visit print their date everywhere (unchanged).
- [ ] The « date de prélèvement » filter of /recherche and the portal's « du / au » still find the undeclared deposit by its entry day, and sort it the same way (documented behaviour).

### V15-G — Droits du technicien (RP3, RP3c)
- [x] `src/lib/technician-guards.test.ts` green in the vitest run.
- [ ] As tech1: `GET /api/samples/<id>/programme` → 403; `PUT` same → 403; `PATCH /api/samples/<id>/intake` → 403; `POST /api/product-types` → 403; `PUT /api/product-types/<id>/criteria` → 403; `/programmation` and `/admin/types-produits` redirect to /technicien.
- [ ] param1 still opens a programme sheet (GET 200) and confirms it; tech1's bench is unchanged (take, results, submit, temperatures).

### V15-H — Dépôt public
- [x] The diff of the batch (code, tests, docs, commit message) carries no real client, site, staff or employee name; `src/lib/document-html.test.ts` reads « Personne Test »; no screenshot of the old software and no `backups/` file is staged (`git status`).

### V15 lot 2 — à venir (après les réponses Q109–Q130, `RETOUR-LABO-14-10.md` §4)
> **16/10 — remplacé par le Checkpoint V16** (plan `RETOUR-LABO-16-10.md`) : les lignes ci-dessous gardent le plan du 14/10 pour l'histoire ; les catégories, les trois nouveaux états des mains et la T° relevée obligatoire n'y sont plus.
- [ ] Lot 1b, rapport aligné (`RETOUR-LABO-14-10.md` §8), built with lot 2: a test report compared with the lab's real excerpt of 15/10 — « Préleveur : Technicien de QUALILAB 'I.NOM' » from the account's « Dénomination sur les documents » (prefilled, editable in /admin/utilisateurs), « N/A » for an empty « Moyen de prélèvement », « Lieu de prélèvement », « Date Prod », « Date Exp », date-times « JJ/MM/AAAA HH:MM », one « Date d'analyse », « Date et heure de réception » = the arrival typed; still two pages; an older report's duplicata unchanged.
- [ ] Mains (Q109–Q111): one required « État des mains » Aseptique / En cours de travail / Nettoyé on a Mains line (visit, deposit), « Mains non lavées » no longer offered; an old « Mains lavées » sample reprints unchanged and stays correctable; the state printed where Q111 says; migration additive, no row rewritten.
- [ ] Températures (Q112, Q113): « Continuer » refused on a visit sample without T° relevée or T° ambiante (air: T° ambiante only), « 0 » accepted; a deposit without them accepted; « Corriger la fiche » offers both temperatures; an old sample without temperature stays correctable; the agreed wording on screen.
- [ ] Surface (Q114): the text box beside the area, if asked, saved and printed where agreed.
- [ ] « Arrivé le » (Q118): a real arrival field at the deposit (prefilled, « Maintenant », future refused), stored as `Serie.arrivedAt` and printed on the bon; an arrival typed before the save accepted for a deposit without sampling time; C1 and the report's reception time as agreed.
- [ ] Clients (Q116, Q117): « + Nouveau client » at the deposit (recep1) and the visit (pre1, phone width) creates a « TEST UI » client with its sites and selects it; a near-duplicate offers « Utiliser ce client »; the exact name of an archived merged test fiche proposes its client and site, never a new client; TECHNICIEN → 403; « À compléter » for the gestionnaire if agreed.
- [ ] Dates seules (Q119): the agreed fields in JJ/MM/AAAA on an English (US) browser.
- [ ] Catégories et familles (Q120–Q126): catégories created, re-imported and editable by param1 under /programmation; « Familles & critères »; the famille picker with its filters; a famille's parameters as a checklist with « Cocher tout » and replace-on-change; hands / surface / water / air familles applying their criteria on those samples (local copy first); technician refused everywhere.
- [ ] Analyses after the programme (Q128), « Analyse sensorielle » (Q129), old-software functions asked in Q130.

## Checkpoint V14 — Prise en charge libre (13/10)

Spec `PROGRAMME.md` §10 (summary `WORKFLOW.md` §19, decision `RETOUR-LABO-06-10.md` §13): nobody assigns technicians any more; a confirmed programme joins the shared « À prendre » list and the technician who takes the sample is the only one who types on it. Built 13/10 on branch `prise-en-charge-libre`, **deployed 13/10** (commit `9d338ae`), no migration. Run it first on the local copy, then on production after the deploy.

Rules for the production run — production holds real laboratory data:
- Work **only** on the test client « TEST UI 2026-10-06 Traiteur »; create new test séries on it. Never take, release or type on a real sample: on production, « À prendre » and colleagues' lists show real samples — read them, do not touch them.
- The steps name the roles by their demo account (`param1`, `tech1`, `tech2`, `valid1`, `direction1`, `admin`); `tech2` stands for any second technician account.
- Refresh every page opened before the deploy.

**Run 13/10 — local copy 40/40, then production 40/40** (`.ui-tests/v14-take.mjs`: on production each role signs in by clicking its demo account, nothing typed; a new série of 6 samples on the TEST UI client, cancelled at the end). Checked: programme sheet without technician, confirm free, old `technicianId` ignored, both technicians see « À prendre », take / double click / 409 « Déjà pris par … » / simultaneous take and simultaneous first save (one winner), read-only colleague sheet and 403, valid1 / param1 / admin / recep1 refused (403), « Libérer » by the holder and by the admin, refused to a colleague (403) and after a typed result (409), implicit take, empty save, admin save not taken and free submit refused (409), programme edit after the take keeps the holder, a sheet older than its programme refused (409) then saved, validation « Analysé par », parcours « Pris en charge », bench sheet without date, admin dashboard and programmation queue wording. Production DB after the run: bench counts unchanged (16 programmed samples still with their holder), the 6 test samples ANNULE, latest migration unchanged; app container 0 restarts, no error in its log. 8 programmed demo samples (TEST UI) released to « À prendre » for the presentation (`v14-demo-a-prendre.mjs`).

### V14.0 — Restore point and deployment
- [x] Tag `v1.2-avant-sans-affectation` on origin = commit `4b9c557` (`git ls-remote --tags origin v1.2-avant-sans-affectation`).
- [x] Labelled production dump `/var/backups/qualilab/qualilab_avant-sans-affectation.sql.gz` taken **just before** the deploy (`DEPLOY.md`): `gzip -t` passes, the last line reads « -- Dump completed », and the name is outside the rotation pattern `qualilab_????-??-??_????.sql.gz` (never pruned).
- [x] After the deploy: no migration applied (`_prisma_migrations` unchanged), `/api/health` 200, app container 0 restarts, no error in its log after the first take.

### V14-A — The programme sheet (param1)
- [x] The programme sheet of a test sample has no technician field, no « Tous à ce technicien » / micro-chimie shortcut and no load (« Nom — N éch. »); « Organisation » = priorité, délai, consignes; the page has no `#programme-technician`.
- [x] « Confirmer le programme » with no technician → 200, status PROGRAMME, `technicianId` and `assignedAt` NULL, no `SampleParameter.technicianId` written; journal « Programme d'analyse confirmé ».
- [x] An old body carrying `technicianId` (default and per analysis — curl, or a page opened before the deploy) → 200, the technician **ignored**: the sample stays free.
- [ ] The programme of a test sample already taken but still PROGRAMME can be edited (stays taken: `technicianId` / `assignedAt` unchanged); once EN_ANALYSE it is refused (409).

### V14-B — « À prendre » and the take (tech1, tech2)
- [x] tech1 and tech2 both see the confirmed sample in « À prendre » (tile count = list); urgent samples first, then the oldest reception, grouped by série (a série placed by its most urgent / oldest sample).
- [x] tech1 « Prendre en charge » (« Prise en charge… » while sending) → 200; the sample leaves « À prendre » for tech1's « À commencer »; status still **PROGRAMME**; DB `technicianId` = tech1, `assignedAt` set; journal « Échantillon pris en charge ».
- [x] tech2 takes the same sample (at the same instant, or after) → 409 « Déjà pris par … » naming tech1; exactly one `SAMPLE_TAKEN` row.
- [ ] Implicit take: tech2 types a first value on another free test sample and saves → 200 with `taken: true`, holder tech2, status EN_ANALYSE; the parcours reads « Pris en charge » with « À la première saisie de résultat ».
- [x] Empty save: « Enregistrer » with nothing typed on a free test sample → the sample stays free and PROGRAMME (`taken: false`, still in « À prendre »).
- [x] tech2 opens tech1's sample → read-only, « Pris par un collègue » with tech1's name and the time, no field, no « Enregistrer »; `PUT /api/samples/<id>/results` as tech2 → 403 « Cet échantillon est pris en charge par … : vous ne pouvez pas y saisir de résultats. »

### V14-C — Libérer
- [ ] tech1 « Libérer » before any typed result → confirmation « Remettre cet échantillon dans « À prendre » ? Vos collègues pourront le prendre. » → 200; back in « À prendre » for tech1 and tech2; DB `technicianId` / `assignedAt` NULL; journal « Échantillon remis dans « À prendre » »; parcours « Remis dans « À prendre » » with « Était pris par … ».
- [x] After a typed result, « Libérer » is refused: 409 « Des résultats sont déjà saisis sur cet échantillon : il ne peut plus être libéré. » (the button is gone; the API refuses too).
- [x] tech2 cannot release tech1's sample: `DELETE /api/samples/<id>/take` → 403 « Seul … ou un administrateur peut libérer cet échantillon. »
- [x] admin releases a test sample taken by tech1 with nothing typed → 200 (journal row by admin, previous holder in its metadata).

### V14-D — The administrator and the other roles
- [ ] admin types and saves on a free test sample → saved, **not taken** (`taken: false`, still in « À prendre »); admin saves on tech1's sample → holder unchanged.
- [x] Submitting a free test sample → 409 « Personne n'a pris cet échantillon en charge : un technicien doit le prendre avant la soumission. », for admin as for a technician.
- [ ] `POST /api/samples/<id>/take` as valid1 (VALIDATEUR), direction1 (DIRECTION), param1 (PROGRAMMATEUR) and admin → 403.
- [ ] Admin dashboard: the « À prendre » tile (count = the list) and « qui tient quoi » (bench samples per holder) agree with the bench.
- [ ] /admin/utilisateurs: disabling a technician who holds bench samples (or changing their role) warns how many samples they hold (test account only).

### V14-E — Bench sheet, validation, parcours
- [ ] Bench sheet as tech1 without a date → every sample tech1 holds now (no colleague's, nothing from « À prendre »); with `?date=` → those of that reception day.
- [ ] tech1 submits; valid1's validation page shows « Analysé par » = tech1; double validation unchanged (two different signatories); the PG06/EN03 report still prints no « Analyses réalisées par ».
- [ ] The parcours lists « Pris en charge » and « Remis dans « À prendre » » in order; /admin/journal shows « Échantillon pris en charge » and « Échantillon remis dans « À prendre » ».

### V14-F — Samples from before 13/10
- [ ] A TEST UI sample assigned before the deploy stays on its technician's bench (« À commencer » / « En analyse »), is not in « À prendre », can be typed by that technician only, and can be released by them while nothing is typed on it; its parcours keeps « Attribué à un technicien ».
- [ ] *(local copy, seeded legacy line)* A line split per parameter before 13/10: not in « À prendre »; each technician types only their own parameter (403 « Le paramètre … est réservé à … : vous ne pouvez pas le saisir. »); submit waits until both are done; tech1 cannot release it (403), the admin can.

## Checkpoint V13 — Réponses du laboratoire du 12/10 (built 13/10, **not deployed** — `RETOUR-LABO-06-10.md` §12)

**Production, real screens (13/10):** `.ui-tests/recette-prod-ui.mjs` — each role signs in by clicking its demo account on the login page, then drives the screens: **41/42**. Visit typed in the préleveur form (6 kinds, twins, 32/26); protocole PDF with the 8 notes; reception screen: (3) non conforme for the P twin at 250 g, (2) conforme for M at 120 g, (8) non conforme for mussels at 20 g with (2) « sans objet », accepted at 60 g, (6) non conforme for a surface without temperature — recorded non conformes with their motif (QUANTITE_INSUFFISANTE ×2, TEMPERATURE_MANQUANTE); labels without client; the série keeps its decided checklist; counter deposit with two weighings (33/26) and its bon (8 notes, no « N° de factures »); programme refused without technician then confirmed; bench results submitted; bench sheet PG06/EN01; technical validation (valid1, no administrative button), administrative validation by another person (admin); report on the PG06/EN03 template (cartouche, 2 pages, annex, signatures); every role's screens open and the wrong role is sent back; no console error. The one miss: the report's legal footer — production's /admin/entreprise still holds placeholder company details (address, phone, e-mail, RC) and no IF / Patente / CNSS: the owner types the real ones. **Same day:** the laboratory's identity was entered in /admin/entreprise from its own documents (report template and protocole footers), the report footer checked against the template, and the run repeated: **42/42**.


**Local recette 13/10 — 137/137.** Where: a copy of the working tree served by `next dev --webpack` on **localhost:3230** against the local MySQL 8.4 (`qlab-local-db`, migration `20261013100000_retour_labo_1210` applied) — the shared dev server on :3210 still held the Prisma client from before the migration and was left running (HANDOFF §8, 13/10). Scripts `.ui-tests/e2e1210-{a…g}-*.mjs` (gitignored), playwright-core with the system Chrome (fr-FR, Africa/Casablanca) plus API calls; test client « TEST UI 1210 Traiteur … », two test Direction accounts, invented catalogue (regulation, norm, product type with m / M), invented IF / Patente / CNSS / Fax typed in /admin/entreprise. Never production.

### V13-A — Réception (recep1, a visit by pre1 of 6 échantillons + a counter deposit)
- [x] A two-family food line becomes 1M + 1P; 1P declared conforme at 250 g → 400 « Échantillon 1P : Quantité 250 g < 300 g requis » (rule (3) on the P container); 1M at 120 g passes rule (2); each sample stores its own weight (M 120 g, P 250 g).
- [x] « Moules de bouchot » 40 g → stored checklist row (8) « à vérifier » (« Poids 40 g : au moins 50 g, 25 g pour les animaux de petite taille · au moins 10 individus : à vérifier ») beside row (2) non conforme; « Moules petites » 20 g → row (8) non conforme; the plat cuisiné → row (8) « sans objet ».
- [x] Air without temperature declared conforme → 400 « Température à l'arrivée obligatoire pour un air » (rule (6)); surface → same « pour une surface »; a food on its default class without temperature → same; the same food « Ambiant » without temperature → accepted, row (6) « Sans objet : aliment stable (conservé à température ambiante) »; air and surface with a temperature → row (6) conforme. Every stored checklist has 8 rows.
- [x] In the browser: the visit reception lists « (8) Pour le cas des mollusques bivalves vivants… »; twin cards « Quantité reçue (2M) » / « (2P) » with « Un contenant par famille : pesez la part de chaque famille »; typing 40 g / 20 g on « Huîtres creuses » turns row (8) to « à vérifier » / « Poids 20 g < 25 g requis »; « Conservation » offers « Ambiant — aliment stable (conserve, sec, UHT…) ».
- [x] A visit received **through the form** (« Valider la réception ») sends and stores 1M 130 g / 1P 320 g and the stable food « AMBIANT » without temperature — 200, all RECU.
- [x] Counter deposit (API): 2P at 250 g conforme refused (rule (3)); 2M 150 g + 2P 350 g accepted, each sample its weight. **Through the form**: « Quantité 1M » / « Quantité 1P » with the hint, no « dupliquez l'échantillon », recap « 1M : 110 g · 1P : 310 g », « Enregistrer et réceptionner le dépôt » → 201 with `quantityChimie` 310 g, stored M 110 g / P 310 g.
- [x] Bon de réception PDF (deposit): notes (1)…(8), (8) word for word with 10 / 50 g / 25 g; no « N° de factures »; « Référence client » kept; both containers listed; cartouche PG05/EN04 (still version G until the owner types H — V13-E).
- [x] Protocole PDF (visit): the eight notes under the table; no « N° de factures »; footer = name in capitals, « Tél. : … - Fax : <typed fax> - E-mail : … », « ICE : … » from /admin/entreprise; cartouche PG04/EN01.

### V13-B — Circuit to the report (param1 → tech1 → valid1 → Direction)
- [x] 1M programmed with the test type (two criteria m / M, n = 5), R1…R5 entered and submitted by tech1.
- [x] valid1 asked for the administrative validation → 403 « Seule la direction ou un administrateur peut donner la validation administrative. »; valid1 validates technically (200); Direction A approves (200), report issued (`RAPPORT_ENVOYE`, e-mail simulated).
- [x] Same person: Direction A signs step 1 of another sample, then step 2 → 409 « La double validation exige deux signataires différents… »; Direction B approves (200); report B signed « Responsable Technique » = Direction A, « Direction » = Direction B.
- [x] Report PDF (Direction A): exactly two pages; rendered with pdftoppm and compared page by page with the template (`rapport.pdf` of 12/10) — same blocks in the same places. pdftotext finds the cartouche (« Rapport d'essai », « Réf : PG06/EN03 », « Version M », « Page 1 sur 2 » / « Page 2 sur 2 », 05/01/2006, 18/12/2023), every page-1 field (RAPPORT D'ANALYSES, N° de série, Client, Produit (IC), Prélèvement et réception, Préleveur, Référence prélèvement PG04/EN01 & PG04/IT03, Moyen de prélèvement, Site / Lieu du prélèvement, « Lieu d'exécution : Laboratoire permanent Casablanca », Date d'analyse, Date d'édition de rapport, Données fournies par le client (IC), Lot, Dates Prod / Exp, Information sur l'échantillon, temperatures, N° de contrôle, Paramètres | Méthode | Unité | Résultats R1…R5), « -ANNEXE- », « Interprétation des résultats », « (Nombre d'analyse/échantillon = 5) », the verdict table ticked « Satisfaisant », « Réglementation en vigueur », criteria « m M » (E. coli 10 / 1.10², n = 5 · c = 2), the conclusion, the legend and the N.B. on both pages, the legal footer on both pages with the typed IF / Patente / CNSS / Fax, « Responsable Technique » + valid1's name and « Direction » + Direction A's name; no « Analyses réalisées par ».
- [x] Stable food report: « Température … à la réception : — » (none typed).
- [x] Amendment: Direction refused « Rouvrir » (403); admin reopens (200), valid1 + Direction B re-sign → « RAPPORT D'ANALYSES RAP-…-A1 (VC) », « RAPPORT AMENDÉ — annule et remplace le rapport RAP-… du … », still two pages; `?version=0` renders on the new template; duplicata carries its mark.
- [x] The portal account of the test client downloads the same amended report (PG06/EN03, -A1, annule et remplace, two pages); the bench sheet (PG06/EN01 cartouche) and the blind labels still render.

### V13-C — The Direction role (two test accounts « TEST UI 1210 Direction A / B »)
- [x] Admin creates a DIRECTION account (201, stored role DIRECTION). It lands on /validation; menu « Tableau de bord, Validation technique, Validation administrative, Recherche des analyses » + Système qualité, no administration; role caption « Direction ».
- [x] Redirected to /validation: /admin, /admin/utilisateurs, /admin/reglages, /admin/entreprise, /admin/documents, /admin/journal, /comptabilite, /reception, /programmation, /technicien. Open (200): /validation?vue=attente_admin, /recherche, /qualite, /compte.
- [x] 403 « Accès refusé. »: GET / POST /api/admin/users, PUT /api/admin/lab-settings, PUT /api/admin/company, POST /api/clients/[id]/merge, GET / PATCH /api/reports/[id]/admin-edit (conclusion), POST /api/samples/[id]/reopen, POST /api/samples/[id]/cancel, GET / POST /api/invoices, POST /api/parameters.
- [x] In the browser: Direction A clicks « Valider techniquement » (200); the panel then reads « …la validation administrative revient à une autre personne de la direction » with no approve button; step-2 chip « Direction »; valid1 reads « La validation administrative revient à la direction »; Direction B clicks « Valider administrativement » (200); the sample records A then B.

### V13-D — Administration
- [x] /admin/entreprise: « Identifiants légaux » with IF, Patente, CNSS and Fax; typed and saved through the form (PUT 200), returned by `GET /api/admin/company`; a CNSS « <script> » refused with its French label (400).
- [x] /admin/reglages: rule (8) in the lab's words; three inputs « Mollusques bivalves — individus / poids minimal / animaux de petite taille » at 10 / 50 / 25; temperature required ticked for Produit alimentaire, Surface, Eau, Air (Mains, Autre unticked); the stable-food exception explained; saving 55 g through the form stores it (others kept), put back to 50 g; a small-animal minimum above the normal one refused (400).
- [x] No console error on any screen opened (admin, reception, deposit, Direction, validation, programme).

### V13-E — After the deploy (production, owner)
- [ ] `migrate` exits 0; `_prisma_migrations` lists `20261013100000_retour_labo_1210`; `CompanySettings` has `fiscalId`, `patente`, `cnss`, `fax` (NULL); `LabSettings` has `molluscMinIndividuals` 10, `molluscMinG` 50, `molluscSmallMinG` 25 and `temperatureRequiredKinds` `ALIMENT,EAU,AIR,SURFACE` (unless the administrator had changed it); /admin/documents shows RAPPORT « Rapport d'essai » PG06/EN03 M 05/01/2006 18/12/2023.
- [ ] The owner types IF, Patente, CNSS, Fax (and checks address, phone, e-mail, « Raison sociale ») in /admin/entreprise from the lab's template; a report downloaded on « TEST UI 2026-10-06 Traiteur » prints them in its footer.
- [ ] Protocole G and bon H typed in /admin/documents once the lab gives their dates (Q103).
- [ ] The real accounts created and DIRECTION given to the people the lab confirms (Q102) — on their existing validator account when they have one.
- [ ] One reception of a two-family line and one approval by a Direction account on the test client, in the browser.

## Checkpoint V12 — Test complet du système (12/10)

**Local copy** (localhost + MySQL 8.4 with the demo seed, `.ui-tests/full-*.mjs`), four testers + an independent verification, every role:
the whole sample circuit (visit with every line kind and twins → reception with the checklist and the three decisions → counter deposit → programme → bench incl. « > x », « Indénombrable », per-unit n = 5, dilution → send-back → both validations → report → sending → amendment -A1 → client portal), clients and billing (duplicates, merge / attach, invoices, payments, credit notes per line, cancellation, PDFs, export), administration / quality / stock / security (every page and API route per role, accounts, journal, catalogue, equipment, EIL, stock, supplier invoices) and the database (schema vs migrations: no drift; integrity queries; simultaneous duplicate requests; malformed payloads; date edges).
- [x] About 240 checks; **47 real bugs fixed** and re-verified — among them: a technician could read série details (blind bench), double-clicks could send a report twice or create two clients with the same name, an invoice could still be issued to a merged / attached client, an invalid VAT rate was silently clamped, partial PATCHes on equipment / EIL / suppliers / stock items wiped the other fields, a 100 000-character supplier note gave a 500, the bench sheet printed the previous day, a validator's approval answered 409 instead of 403, the portal said « pas encore disponible » for a cancelled sample.
- [x] Gates after the fixes: tsc 0, eslint 0, vitest 93 files / 1 450 tests, build green; no console error.
- [x] Production database, read-only (12/10): 33/33 migrations, schema up to date; 0 status / date inconsistency; no duplicate série, invoice or report number; counters = highest numbers issued (FAC 8, AV 1, série 29, contrôle 42); every invoice total, line, VAT and payment consistent; all tables CHECK OK; no DB error in 7 days; nightly backup valid (45 tables, dump completed); production Node tz data 2026c (day cuts right).
- [ ] Open (not blocking): /recherche and « aujourd'hui » day cuts depend on the runtime's tz data (right in production, wrong on a machine with tz < 2026c); /programmation renders the whole queue (slow only with hundreds of queued samples); early contamination alerts not shown in « Envois » (needs EmailLog.sampleId); report numbers drawn read-max-then-insert with retries; DB pool limit 5; lab questions (non-conform calibration, centimes in words, cancelled samples counted in /recherche).

## Checkpoint V11 — Analyse des écarts du 10/10 (built 10/10, **not deployed** — `RETOUR-LABO-06-10.md` §11)

**Status 12/10:** local recette (copy on localhost + fresh MySQL 8.4 with the demo seed, `.ui-tests/local-v11-*.mjs`) **37/37** — 30 pass, 7 fixed during the recette and re-tested (C3 refusal wording, report « Indénombrable » cell, timeline order, two table wrappers, the demo seed's invoice counter, the SSH-hardening key check); full gates green (tsc 0, eslint 0, vitest 90 files / 1 398 tests, build). **Deployed 12/10 (`1229862`)** — verified read-only on the server: migration `20261012100000_gaps_build` applied (0 failed), new columns / enum value / indexes present, LabSettings defaults (24 h, 0–8 °C, −15 °C), real data intact, app 0 restarts / 0 errors, the new `backup-db.sh` keeps the 13/09 restore point. Production click-through: `.ui-tests/recette-v11-prod.mjs`, run by the owner (Claude does not sign in to the live site); its dry run on the local copy passed every check that does not need a production record.


**Built 10/10, gates green** (prisma generate · tsc 0 · eslint 0 · vitest 90
files / 1 396 tests · `npm run build`). **Nothing below was seen in a
browser**: there is no local database, so every check is to run on production
after the deploy of migration `20261012100000_gaps_build`.

Rules for this recette — production holds real laboratory data:
- Work **only** on the test client « TEST UI 2026-10-06 Traiteur » (and its
  séries); create new test séries on it, never touch a real client's
  sample, invoice or report. Scripts print counts, never real names.
- Rotate the demo accounts' passwords first (`/admin/utilisateurs`): the
  shared one is written in the repository. The steps name the roles by their
  demo account (`pre1`, `recep1`, `param1`, `tech1`, `valid1`, `admin`,
  `compta1`, `commercial1`).
- A change in `/admin/reglages` applies to the whole laboratory at once: do
  it outside working hours and put the value back immediately.
- Issuing an invoice or a credit note **consumes a number of the legal
  sequence**: run V11-A12/A13/C8 only with the owner's agreement (before the
  switch-over the counters can be reset, C10), otherwise on a local copy.
- Refresh every page opened before the deploy.

### V11.0 — Deployment
- [ ] `migrate` container exits 0; `_prisma_migrations` lists `20261012100000_gaps_build` finished, none failed; `Sample` has `receptionPackagingOk`, `receptionIdentificationOk`, `storageClass`, `receptionTemperatureSource`, `receptionNote`, `awaitingClientSince`, `clientConsulted*`; `Sample.cancelReason` ENUM ends with `NON_RECU`; `LabSettings` has the 7 new columns at their defaults (24, NULL, 0, 0, −15, 8, 0); `Invoice.clientSnapshot`, `InvoiceItem.creditedItemId`; `SHOW INDEX` lists `Sample_sampledAt_idx`, `Sample_receivedAt_idx`, `Sample_clientId_sampledAt_idx`, `Serie_receivedAt_idx`, `EmailLog_createdAt_idx`, `AuditLog_action_createdAt_idx`, `Invoice_issuedAt_idx`, `InvoiceItem_creditedItemId_idx` (read-only queries).
- [ ] `/api/health` 200; app container 0 restarts; no error in its log after the first reception.
- [x] (13/10: the 02:00 run of 13/10 logged « backup ok » then « offsite skipped (BACKUP_REMOTE not set) »; `qualilab_avant-phase-9.sql.gz` still present; nginx sets X-Real-IP — checked 12/10) Ops (operator, VPS): the new `scripts/backup-db.sh` is the one cron runs **before 14/10** (it must not prune `qualilab_avant-phase-9.sql.gz`); the next 02:00 run logs « offsite skipped (BACKUP_REMOTE not set) »; `grep -n "X-Real-IP" /etc/nginx/sites-enabled/*` shows `proxy_set_header X-Real-IP $remote_addr` (read-only).

### V11-A — Réception (recep1, on a new visit of 3 samples by pre1 for the test client: food micro, water micro, surface)
- [ ] **A1** — The reception screen shows, under the 7 rules, « Contrôles complémentaires (hors bon) » with C1, C2, C3, C5 (and C7 on the food sample); C3 hint on the water micro sample reads « flacon stérile ; au thiosulfate si eau traitée (chlorée) »; Oui / Non chips are 44 px and keyboard-operable. « Valider la réception » without C3 / C5 → refused next to the card; an old payload without `packagingOk` (curl) → 400 « … rechargez la page si elle date d'avant la mise à jour ». C3 « Non » → card switches to non conforme with motif « Emballage »; sending it « conforme » by API → 400.
- [ ] **A1** — On a not-yet-received sample of another test visit, « Annuler » offers « Non reçu au laboratoire »; on a received sample it is not offered and the API answers 400; the protocol PDF of that visit prints « Non reçu ».
- [ ] **A2** — Arrival typed before the end of sampling → « L'arrivée au laboratoire précède la fin du prélèvement. » next to the field, nothing sent; `PATCH /api/series/[id]` with an arrival before the start of a série without end → 400; an empty arrival is accepted (reception instant used).
- [ ] **A3** — Visit sampled more than 24 h before the arrival: C1 « Délai 27 h > 24 h » à vérifier; within 24 h « Délai 3 h 30 » conforme; the reception queue shows « délai X h », amber above 24 h. `/admin/reglages` « Contrôles complémentaires (hors bon) » shows the micro / physico-chimie delays and « Délai dépassé = non conforme » (off). Counter deposit (« Nouveau dépôt ») with « Prélevé le » left empty → C1 « Heure de prélèvement non déclarée » à vérifier; DB `Serie.samplingTimeDeclared = 0`.
- [ ] **A4** — « Conservation » select on each card, default Réfrigéré for food / surface / water micro; cooler 10 °C → amber hint under « T° de la glacière »; C2 « à vérifier » with « (glacière) »; a temperature typed on the sample → « (mesurée sur l'échantillon) »; water line offers « Flacon témoin » under « Température relevée sur »; Congelé at −20 °C conforme, at −10 °C à vérifier; Ambiant → sans objet. `/admin/reglages`: saving « Réfrigéré — T° minimale » above the maximum is refused with a French message (nothing saved).
- [ ] **A5** — Food sample with a DLC before today → C7 « DLC dépassée le JJ/MM/AAAA » à vérifier; « Non conforme » pre-fills motif « Autre » and « DLC dépassée le … »; DLC today or later → conforme; no DLC → « DLC non indiquée ».
- [ ] **A6** — pre1 visit page: with a photo, « Photo du protocole signé : Voir » opens the image; choosing another photo asks « Remplacer / Garder l'actuelle ». Reception of a visit: C6 row above the samples (« Photo jointe » + « Voir », or « Protocole papier signé reçu ? » Oui / Non, « Non » amber, never blocking); a deposit has no C6 row. `GET /api/series/<id>/protocol-photo` as tech1 → 403, as pre1 on another préleveur's visit → 404, as valid1 → image with `Cache-Control: private, no-store`; journal « Photo du protocole signé consultée ».
- [ ] **A7** — Accept conforme a sample whose C1 or C2 is « à vérifier » without an observation → « Échantillon N : justifiez l'acceptation (C… à vérifier). », field focused; with an observation → received; the observation prints under the line of the bon, shows in the reception summary, on the programme sheet, on the technician sheet and on the validation page (« Observation de réception »).
- [ ] **A8** — The received série shows « Checklist à la réception » per sample (collapsible, both groups, exactly what was decided); a sample received before 09/10 reads « Réceptionné avant la checklist »; a sample cancelled « Non reçu » reads « Annulé avant la réception : pas de checklist » and is not counted as numbered.
- [ ] **A9** — Non-conform sample: three decisions « Analyser malgré tout » / « En attente du client » / « Détruire ». « En attente du client » → received, numbered, listed in « Bloqués — non-conformité » with « En attente du client depuis … »; journal « Échantillon en attente de l'avis du client »; bon « en attente de l'avis du client ». From « Bloqués », recep1 « Analyser l'échantillon » with the agreement (name, channel, « Maintenant ») → the sample appears in the programmation queue with **no technician**; bon « analysé avec l'accord de … (tél., JJ/MM HH:MM) »; programme, bench and validation pages print « Analysé avec l'accord de … ». A reactivation hold stays admin-only for recep1 (403). « Détruire » → cancelled `DETRUIT_A_RECEPTION`, e-mail logged (SIMULE without key). Outside working hours only: switch on « Accord du client obligatoire… », analyse a non-conform test sample without the agreement → refused; switch back off.
- [ ] **A10** — « Nouveau dépôt »: the client is a search field (2 characters, ICE / contact match); the sites are the picked client's; changing the client resets site and memory; the network tab shows no `GET /api/clients` without `q`.
- [ ] **A11** — Indexes present (V11.0); « Ce mois-ci » on the direction view and the portal list answer in under a second.
- [ ] **A12** — *(owner's agreement — consumes a number)* Issue a TEST UI invoice; rename the test client; the issued PDF and fiche keep the old name, address and ICE; a draft of the same client shows the new name; a credit note on that invoice prints the frozen client; the rename is undone afterwards. An invoice issued before the deploy follows the live name (no backfill).
- [ ] **A13** — *(owner's agreement)* On a TEST UI invoice: credit half of one line, then « Créer un avoir » shows « Déjà repris : X HT · reste Y HT » under that line and caps the default quantity; crediting more than the rest is refused before sending and by the API (« Ligne N : la reprise … dépasse ce qui reste à reprendre … »); a fully credited line reads « Déjà entièrement repris » and cannot be ticked.
- [–] **A14** — *retiré le 13/10 : plus de technicien ni de charge sur la fiche de programme (prise en charge libre — V14 ; « qui tient quoi » au tableau de bord admin).* param1, programme sheet of a test sample, section « Organisation »: each technician option reads « Nom — N éch. · M en retard » (the late part only when there are late samples), the default technician shows « Charge de X : … »; the counts match the technician's queue.

### V11-B — Paillasse, validation, envois
- [ ] **B1** — tech1 on a test food sample with a criterion (n = 5): « Indénombrable » in one R → Non satisfaisant, « Soumettre » enabled; « > 50 » against m = 10² → « Incomplet » with « > 50 ne permet pas de conclure face à m = … : lire une dilution supérieure », submit disabled; « > 1.10² » → Non satisfaisant; « TNTC », « indenombrable », « T.N.T.C. » accepted. Single value with a limit: « > 3.10⁵ » → Non conforme; « > 5 » → warning + manual choice. The help line lists the accepted notations. After validation and approval the report prints « Indénombrable » in red and, on a sensitive germ, the contamination alert is logged. A request forcing `conform: true` on « Indénombrable » (curl, no criterion) is stored non conforme.
- [ ] **B2** — valid1 « Renvoyer au technicien » with a motif → tech1's sheet shows the amber « Renvoyé par … le … : … »; the queue line shows « Renvoyé »; after resubmission and validation the badge is gone.
- [ ] **B3** — A test sample received non conforme with a motif: technician and validation pages print « Non conforme à réception — <motif>. <précision> »; the validation page shows « Protocole signé (photo) » for a série with a photo (opens the image); the technician page never does.
- [ ] **B4** — commercial1 on the test client's fiche: « Renvoyer au client » under a report number → confirmation → dialog lists the recipients and says « Envoi simulé » without a RESEND key; the compact action shows on /recherche for commercial1, valid1, admin but not compta1; `POST /api/samples/<id>/report/send` as compta1 → 403; hidden during « Amendement en cours ».
- [ ] **B5** — admin, test report: « Modifier la conclusion » → prefilled, counter ≤ 2 000 → saved → the duplicata PDF prints the new text; no new row in `/admin/journal`; PATCH as valid1 → 403; 2 001 characters → 400; after « Rouvrir pour amendement » the action is hidden and PATCH → 409. Put the conclusion back afterwards.
- [ ] **B6** — Resend a test report: the `EmailLog` row (SIMULE) and the dev console show the subject with the name saved in `/admin/entreprise` and a signature with its phone / e-mail / address (no placeholder).
- [ ] **B7** — valid1 on a test sample that was sent back then revalidated: « Parcours de l'échantillon » lists reception, programme (with technician — since 13/10 the take « Pris en charge » instead, V14), both submissions, the send-back with its motif, both validations, the report sent; no download or duplicata; a deposit with « Prélevé le » left empty shows no « Prélèvement » step.
- [ ] **B8** — admin `/admin/envois`: filters type / statut / du / au, 50 per page with « Envois plus anciens », a row opens `/validation/<id>`, « non rattaché » for an early alert; the validation page's « Envois » card lists the report's e-mails with their status.
- [ ] **B9** — recep1 menu « Historique des réceptions » → `/reception/historique`: newest first, du / au and client filters (« TEST UI »), a row opens the received série, counts match.
- [ ] **B10** — tech1 menu « Relevés de température » → the board; record a reading on a monitored equipment; out of range flagged; with no monitored equipment the empty state reads « Aucun équipement surveillé — à déclarer par le validateur dans Qualité ».

### V11-C — Administration, sécurité, facturation, exploitation
- [ ] **C1** — Each lab role clicks its name in the header → `/compte` (name, username, role, « Changer mon mot de passe »); a test account changes its password → its other session is signed out; journal « Mot de passe modifié par l'utilisateur » (`USER_PASSWORD_CHANGED`, `portal: false`); a CLIENT account is redirected to `/portail`. pre1's menu shows « Mon compte ».
- [ ] **C2** — On a test account, 5 wrong current passwords → the 6th answers 429 « Trop de tentatives, réessayez dans N minutes. » (portal and staff); a correct one after 15 min works.
- [ ] **C3** — On a lab PC, idle 28 min → « Vous allez être déconnecté pour inactivité » with a countdown; « Rester connecté » closes it in every open tab; idle 30 min → `/login` « Session fermée après inactivité. »; a tab closed and reopened after 30 min lands on the login page; a fresh sign-in is not signed out; pre1 on a phone is never signed out.
- [ ] **C3 — the server's bound (since 21/10, lot 2C)** — a non-préleveur session stamped (`Session.updatedAt`) 40 min ago: its page → 307 `/login?motif=inactivite` (« Session fermée après inactivité. »), the row deleted; GET /api/auth/get-session → 200 `null`; an API → 401 « Non autorisé. »; stamped 10 min ago → served and stamped again (once a minute at most); pre1 stamped 3 days ago → kept; the row locked by another connection (the delete fails) → still `null`, the row not refreshed, deleted at the next request. Browser: opening a page (Back included) sends one GET /api/auth/get-session; « Rester connecté » sends one at once. *Local 21/10: over HTTP on the dev server 16/16, through the application's own Better Auth instance 13/13; in the browser, /technicien → /compte → Back (restored with no `?_rsc` request) sent its own get-session.*
- [ ] **C4** — admin `/admin/journal`: filters Action / Utilisateur (disabled accounts and « Système » included) / Du / Au / Référence; a test N° de contrôle, a test série « NN/26 » and a test invoice number each list their entries (« Référence X : 1 échantillon (et son rapport) »); an unknown reference shows the « Aucun … ne porte la référence » message; « Actions plus anciennes » / « Revenir aux plus récentes »; 50 per page.
- [ ] **C5** — admin menu: « Enregistrement des paramètres », « Historique des réceptions », « Envois d'e-mails » open their pages and light up.
- [ ] **C6** — pre1 dashboard: tiles count every visit (not the last 50); « Mes visites » search (série, client « TEST UI », site), status filter and « Voir plus » append the next page.
- [ ] **C7** — « Nouvelle visite » and « Nouvelle facture »: client search instead of a dropdown; creating a site on the visit adds it to the picked client; a draft invoice keeps its client and reloads « Analyses à facturer » when the client changes.
- [ ] **C8** — *(owner's agreement)* An issued TEST UI invoice of 0,00 offers « Annuler »; a paid invoice with a settlement or a credit note is still refused.
- [ ] **C9** — compta1 « Export comptable » (Mois en cours) downloads `journal-des-ventes-<période>.xlsx` with « Journal des ventes » (credit notes negative, cancelled listed, totals « hors factures annulées ») and « Règlements »; client name / ICE as printed; a bad date → error shown in red; commercial1 → 403; journal « Export du journal des ventes ».
- [ ] **C10** — `/admin/reglages` « Compteurs de numérotation » → « Factures et avoirs » with « Prochain : FAC-2026-… » and the highest number used; a value below it is refused (409, nothing saved). **Do not set a real jump before the switch-over.**
- [ ] **C11** — `PATCH /api/invoices/<id>/payment` → 404 (route deleted); `GET /api/invoices` and `/api/invoices/stats` still 200 for compta1.
- [ ] **C12** — (operator) `BACKUP_REMOTE` unset → « offsite skipped »; once a destination is chosen (Q97): « offsite ok: <name> », size checked, restore-from-remote line of `DEPLOY.md` tried once on a scratch database.
- [ ] **C13** — (operator, maintenance window) `bash scripts/deploy.sh` → healthy → build cache pruned, volumes untouched; `harden-ssh.sh` run only after a key login was tested (refuses otherwise), `sshd -T` shows `passwordauthentication no`, `fail2ban-client status sshd` lists the jail; the tzdata check of `DEPLOY.md` gives ≥ 2026c.

### V11-I — Integration pass (10/10)
- [ ] **I1** — The technician and validation pages show « Observation de réception » and, for a non-conform sample analysed with the client's agreement, « Analysé avec l'accord de … »; the programme sheet shows the same paragraph.
- [ ] **I2** — `/admin/envois` and `/reception/historique` filtered on one day list the entries printed on that day (lab clock), like `/admin/journal`.

## Checkpoint V10 — Message du 08/10 (soir) : checklist de réception, cartouche, rôles (live 09/10 — `RETOUR-LABO-06-10.md` §10)

**Production 09/10 (`4a1c1e8`):** `.ui-tests/recette-v10.mjs` + `recette-v10b.mjs`, test client only (visits 26/26, 28/26, deposit 27/26 kept).

- [x] V10.1 — Reception without a rule-(1) answer → 400 « Échantillon 1 : indiquez s'il est exploitable (règle 1). Si les boutons … n'apparaissent pas, rechargez la page. »; « non exploitable » declared conform → 400; answered → 200; stored per sample (26/26-1, -2M, -2P true; 26/26-3 false with motif `NON_EXPLOITABLE`).
- [x] V10.2 — Deposit without the answer → 400; with it → 201 (27/26).
- [x] V10.3 — PDFs (pdftotext UTF-8): bon of 27/26 « Réf : PG05/EN04 », « Version G », « Page 1 sur 1 », « Date de création 05/01/2006 », « Dernière mise à jour 01/10/2024 », notes (1)…(7), « N° de fax », « Date : », « Heure : », « Avance : », « Reste : », both signatures; protocol 26/26 PG04/EN01 F 26/11/2007 · 01/10/2024; bench sheet PG06/EN01 G 05/01/2006 · 08/10/2024. Rendered page compared with the scan.
- [x] V10.3 — `/admin/documents`: the four last-update dates had slipped one day in production (30/09/2024, 07/10/2024, 10/10/2019) — restored to the paper values; a second identical save leaves them unchanged.
- [x] V10.4 — Reception screen (28/26): the 7 rules listed with « Recevabilité : … », statuses in words, « Sans objet » rows greyed; « Valider la réception » refused while rule (1) is unanswered; no console error.
- [x] V10.5 — `/validation` reads « Validation administrative » (no « Approbation finale », « Attente admin »); `/admin/utilisateurs` shows the lab's functions.
- [x] V10.6 — Browser pass (`.ui-tests/recette-v10-browser.mjs`, headless Chrome, real clicks, 18/18): reception of 28/26 (T°, 250 g, cooler, « Maintenant », « Exploitable » → « Recevabilité : 3 conformes · 4 sans objet », N° 41/26); a counter deposit from scratch (refused at « Continuer » until rule (1) is answered, then 29/26 saved, bon PDF opens); programme sheet of 41/26 (row (1) shown, « Confirmer » refused without technician, then confirmed); validation page step names; /admin/documents shows the paper dates; /admin/reglages lists (1)…(7); /admin/utilisateurs functions; new visit without arrival; no console error on any page.
- [x] V10.7 — Database (read-only, 09/10): every migration applied, none failed (latest `20261011100000_reception_checklist`); `Sample.receptionExploitable` tinyint NULL; `conformityReason` ENUM ends with `NON_EXPLOITABLE`; `PC_AIR`, `MICRO_AUTRE`, `PC_SURFACES`, `MICRO_SURFACES` active; the four cartouches at the paper values; app container 0 restarts, no error in its log since the deploy.

## Checkpoint V9 — Retour du 08/10, suite (live 08/10 — `RETOUR-LABO-06-10.md` §9)

**Production 08/10 (`7612a18`, `73d7119`):** test client « TEST UI 2026-10-06 Traiteur » only (visit 23/26 kept); real clients are on production now — the scripts print counts, never their names.

- [x] V9.1 — New visit (`.ui-tests/v9-arrival.mjs`): no « Arrivé au laboratoire » nor « Température à l'arrivée » field; the line « L'arrivée au laboratoire (heure et température de la glacière) se saisit au retour… » instead. The visit fiche keeps both, with « Maintenant » (TESTPLAN V8b).
- [x] V9.2 — « Mains du personnel » with both boxes → 201, 23/26-1M `MICRO_SURFACES` + 23/26-1P `PC_SURFACES`. Catalogue: 0 CHIMIE × AMBIANCE parameter — the PC sample is received, not programmable yet (Q50, Q56).
- [x] V9.3 — Reception sent with a technician (an old tab) → 200 and no technician on any sample; reception screen (19/26) and deposit screen offer no technician and say « Le technicien est attribué par le responsable des paramètres »; programme confirmed without technician → 400 « Choisissez le technicien (par défaut ou pour chaque analyse) avant de confirmer le programme. », with tech1 → 200; programmation queue: 17 samples to programme in 8 séries, oldest reception first.
- [x] V9.4 — Labels PDF of 23/26: nature, date, 32/26 … 34/26, designation, « série 23/26 »; no client, no site.
- [x] V9.5 — `.ui-tests/recette-v9-dash.mjs`, 12 dashboards × their role (réception, programmation, technicien, validation, qualité, préleveur, admin, comptabilité, factures, commercial, fiche client, magasin): 51 tiles, every link opens (no error, no console error); in-page views show « Filtre : … » and highlight their tile; every /recherche link lists exactly the tile's number (7/7 reçus aujourd'hui, 17/17 à programmer, 40/40 en cours, 44/44, 3/3 rapports, 32/32 and 3/3 on the fiche client…); plain on purpose: « Délai moyen », « Préleveurs actifs », gestionnaire « Factures émises ». The EIL and supplier-invoice views open list pages without tiles (chip shown, nothing to highlight). Not checked on production: the portal tiles (unchanged links).

## Checkpoint V8 — Corrections du 08/10 (live 08/10 — `RETOUR-LABO-06-10.md` §8)

**Production 08/10 (`a5925b6`, then `b0defab`):** `.ui-tests/recette-v8.mjs`
27/27 and `.ui-tests/recette-v8b.mjs` 20/20, headless Chrome emulating a
device **one hour ahead** (zone Africa/Lagos = a Moroccan PC that missed the
return to GMT) and an up-to-date device (Africa/Abidjan), on the test client
« TEST UI 2026-10-06 Traiteur » only (visits 18/26 and 19/26 kept). The
screenshots showed two display defects, fixed in `b0defab` and re-checked:
« avance d'1 hsur » (the compiled JSX lost a space) and the « Maintenant »
button spilling over the next column at 900 px.

- [x] V8.0 — Migration `20261010100000_natures_air_autre` applied (migrate container exited 0): an air line with both boxes gets `PC_AIR`, an « Autre » line `MICRO_AUTRE`.
- [x] V8.1 — Up-to-date device: « Heure légale (GMT) : HH:MM » under the visit fields, no console error. Device one hour ahead: the amber hint on every date-time field — new visit (start / end / arrival), visit fiche (end / arrival), deposit « Prélevé le », reception « Arrivée au laboratoire », programme « Délai » — no console error on any of the five screens.
- [x] V8.2 — Device one hour ahead: « Prélevé le » proposed at the device's hour (01:32 for a legal 00:32); typing the device's 01:22 shows « = 00:22 heure légale » and is stored 00:22 (start 23:52); the visit fiche shows the stored legal end 00:22 as 01:22 with « = 00:22 heure légale »; « Maintenant » (fiche, reception) fills the device's 01:43 and the fiche stores 00:43. Correct device: typed 00:22, stored 00:22. _Not checked on production: a September date shown unshifted (unit-tested), the protocol PDF's printed hours._
- [x] V8.3 — An hour 40 min ahead is refused next to the field with « … est dans le futur : il est 00:43 (heure légale du Maroc). Vérifiez l'heure saisie. »: visit « Continuer », visit fiche « Enregistrer l'arrivée » (nothing stored), deposit « Continuer », reception « Valider la réception » (série stays « À réceptionner »); « Maintenant » clears the reception error. _Not checked: a future « Délai » accepted on the programme sheet._
- [x] V8.4 — Air: « Analyses physico-chimiques » available; both boxes → 18/26-1M and 18/26-1P, natures `MICRO_AIR` + `PC_AIR`. « Autre » with both boxes (API) → `MICRO_AUTRE` + `EFFET_ASEPTISANT` (201). « Mains » with physico-chimie (API) → 400 « Échantillon 1 — « Analyses physico-chimiques » ne s'applique pas à un échantillon « Mains du personnel ». »
- [x] V8.5 — Visit form: no « Profil d'analyses », no série-level « Analyses à effectuer » card; the deposit still offers the profiles. _Recap line and protocol PDF not re-read._
- [x] V8.6 — Air line: no « T° produit », no « … 9 pour l'histamine » help (the payload drops a T° typed before switching to Air: unit test).

## Checkpoint X — Facturation : brouillon, émission, annulation, avoirs, règlements (live 09/10 — `FACTURATION.md`)

**Production 09/10 (`b938b10`):** `.ui-tests/recette-x.mjs` 21/21 on the test client « TEST UI 2026-10-06 Traiteur » — gestionnaire refused (403); draft without number, its sample reserved and refused elsewhere, edited; issue → FAC-2026-0007 (the counter continued after FAC-2026-0006); an issued invoice refuses edits; partial payment → « Partiellement payée », overpayment refused, credit note AV-2026-0001 (reste 280), oversized credit note refused, payment deleted with reason (reste 480), balance paid → « Payée »; a paid invoice refuses cancellation; FAC-2026-0008 cancelled with reason, its sample billable again; a deleted draft releases its sample; status filter; stats. PDFs read at the image: « AVOIR N° AV-2026-0001 … se rapporte à la facture FAC-2026-0007 », « ANNULÉE » stamp with date and reason, « Avoirs − 120 / Réglé 480 / Reste à payer 0,00 ». Screens fetched as compta1: invoice page (payments, credit note, « Montant encore créditable », cancel refusal explained), list with state and type filters and « Facturé (net d'avoirs) / Encaissé / Reste à payer ».

Built 08/10, **not deployed**. To run on production after the deploy of
migration `20261009100000_facturation_rapports_portail`, as `compta1` (writes),
`commercial1` (read only) and `admin`, **on test clients only**: the kept
client « TEST UI 2026-10-06 Traiteur » (sample 2/26 is approved and not
invoiced yet; 1/26 is on FAC-2026-0001) and a new « TEST UI X Facturation »
(one série of two samples programmed, so billable). Never touch a real
client's invoice. Afterwards: cancel or credit every TEST UI X invoice and
archive « TEST UI X Facturation ».

### X0 — Deployment
- [x] The migration applies (migrate container exits 0); `/comptabilite/factures` lists the same invoices as before; FAC-2026-0001 reads « Émise » (or « Payée » if it was marked paid) and its PDF opens.
- [x] An invoice that was `PAYEE` before shows one settlement « Autre » with the note « Repris : facture marquée encaissée avant le 09/10/2026. », « Reste à payer » 0,00.
- [x] The next issued number continues after the highest `FAC-2026-…` already issued (no gap, no duplicate).

### X1 — Brouillon (compta1, « TEST UI 2026-10-06 Traiteur »)
- [x] « Nouvelle facture », sample 2/26 added from « Analyses à facturer », « Enregistrer le brouillon » → fiche « Brouillon », no number, PDF with the « BROUILLON » watermark and no number.
- [x] A second « Nouvelle facture » for the same client no longer offers 2/26; `POST /api/invoices` naming it answers 409 « … est déjà réservé par un brouillon de facture. »
- [x] « Modifier » → remove the 2/26 line, save, add it back from « Analyses à facturer », save: one line, no error.
- [x] « Supprimer le brouillon » → 2/26 is offered again; journal « Brouillon de facture enregistré / modifié / supprimé ».

### X2 — Émettre
- [x] New draft with 2/26 → « Émettre » → confirmation → number `FAC-2026-…`, state « Émise », date = today; journal « Facture émise » with the number.
- [x] « Modifier » is gone; `PATCH` and `DELETE /api/invoices/[id]` answer 409.
- [x] « Émettre » directly from « Nouvelle facture » (no draft step) on « TEST UI X Facturation » gives a number at once.
- [x] An invoice at 10 % VAT with a subtotal of 145,00 HT reads 14,50 VAT and 159,50 TTC on the fiche and on the PDF.

### X3 — Règlements
- [x] « Enregistrer un règlement » is pre-filled with the balance; record half of it (mode Chèque, reference) → « Partiellement payée », « Reste à payer » = the other half; the list shows the same balance.
- [x] An amount above the balance is refused with a French message; mode « Effet » is offered, « Autre » is not.
- [x] Record the rest → « Payée », reste 0,00. Delete one settlement with a reason → back to « Partiellement payée »; journal « Règlement enregistré » / « Règlement supprimé » with the reason.

### X4 — Avoirs
- [x] On an issued invoice of « TEST UI X Facturation »: « Créer un avoir » on one line with a lower price → `AV-2026-…`, its PDF titled « AVOIR N° AV-… » and « se rapporte à la facture FAC-… du … »; the invoice's « Reste à payer » drops by its total.
- [x] A credit note above the remaining creditable amount is refused; a line price above the invoice's is refused.
- [x] A credit note never gives a sample back: its samples stay off « Analyses à facturer ».

### X5 — Annuler
- [x] An issued invoice without settlement → « Annuler la facture » with a reason → « Annulée », number kept, PDF stamped « ANNULÉE » with the date and the reason; its samples are offered again in « Analyses à facturer ».
- [x] « Annuler » on an invoice with a settlement or a credit note is refused (409) with the advice to make a credit note.

### X6 — Liste, tableaux de bord, droits
- [x] The list filters by état (Brouillon, Émise, Partiellement payée, Payée, Annulée) and by type (Facture, Avoir); « Reste à payer » column.
- [x] « Facturé » and « Encaissé » read the same on `/comptabilite`, the admin's vue direction and the fiche of « TEST UI X Facturation »: issued − credit notes, drafts and cancelled invoices left out; the « Factures émises » card of `/commercial` counts issued invoices only.
- [x] The fiche client: a cancelled invoice reads « Annulée », a draft « Brouillon »; a sample of a cancelled invoice is no longer flagged billed.
- [x] `commercial1` opens an invoice PDF; any write (`POST /api/invoices/[id]/payments`…) answers 403.

## Checkpoint Y — Amendement et duplicata (live 09/10 — `AMENDEMENT.md`)

**Production 09/10:** `.ui-tests/recette-y.mjs` 10/11 then 11/11 after the fix — duplicata PDF (« DUPLICATA — édité le … » top and footer); reopen refused to valid1 (403) and without reason (now 400; was 409, fixed); reopened by admin with reason → RESULTATS_SAISIS, version 0 frozen, amendment pending, next number RAP-2026-00003-A1; valid1 validates, admin approves → RAP-2026-00003-A1, two versions; amended PDF « RAPPORT AMENDÉ — annule et remplace le rapport RAP-2026-00003 du 7 oct. 2026. Motif … »; version 0 PDF; a technician cannot read the duplicata (403). Validation page as admin shows « Duplicata (PDF) », « Versions du rapport », « Rouvrir pour amendement ».

Built 08/10, **not deployed**. On production after the deploy, on the kept test
client « TEST UI 2026-10-06 Traiteur » only: série 1/26 · contrôle 1/26,
report **RAP-2026-00001** (approved 06/10, invoiced on FAC-2026-0001). As
`admin`, `valid1`, `tech1`, `commercial1`.

### Y1 — Duplicata and versions (before any amendment)
- [x] On `/validation/[id]` and in `/recherche`: « Duplicata (PDF) » → the PDF carries « DUPLICATA — édité le … » at the top and in the footer; journal « Duplicata de rapport édité ».
- [x] « Versions du rapport » lists the version in force RAP-2026-00001 (no frozen version yet for a report issued before this feature).

### Y2 — Rouvrir pour amendement (admin)
- [x] « Rouvrir pour amendement » appears for `admin` only; an empty or too short reason is refused; with a reason → the sample reads « Résultats saisis », the report « Amendement en cours »; `/validation` lists it with the badge « Amendement ».
- [x] « Versions du rapport » now lists version 0 « reconstituée »; a second reopen is refused (« Un amendement de ce rapport est déjà en cours. »).
- [x] During the amendment: the report download still serves RAP-2026-00001 as issued; « Annuler » is not offered and `POST /api/samples/[id]/cancel` answers 409 (« … terminez-le … »); FAC-2026-0001 shows no « Facturé avant résultat » banner.

### Y3 — Approve the amendment
- [x] Correct a result (« Renvoyer au technicien », `tech1` saves and submits), `valid1` validates, `admin` approves → **RAP-2026-00001-A1**, header « Rapport amendé — annule et remplace le rapport RAP-2026-00001 du 06/10/2026 » with the reason; e-mail « Rapport amendé … » (simulated); journal « Rapport rouvert pour amendement » and « Rapport amendé approuvé ».
- [x] The same person cannot sign both steps.
- [x] « Versions du rapport »: version 0 opens marked « Version remplacée par RAP-2026-00001-A1 »; `?version=1` and the plain download render the same document. `/recherche` and the fiche client print RAP-2026-00001-A1.
- [x] Contamination alerts: only a germ whose result changed is re-alerted (none if no exceeding result changed).

## Checkpoint Z — Portail client (live 09/10 — `PORTAIL.md`)

**Production 09/10:** `.ui-tests/recette-z.mjs` 15/16 (the 16th expected 404 where the API answers 409 « Le rapport de cet échantillon n'est pas encore disponible. » — a refusal, no data) — gestionnaire cannot create a portal account (403), CLIENT without client refused, account « portail.test » created for the test client; dashboard and list show exactly the test client's 20 samples (checked against the admin list) with only id, N° de contrôle, série, site, désignation, lot, dates, état and report — no result, price or staff; sent report downloadable (current version RAP-…-A1); another client's sample and report → 404; 19 lab API routes refuse the account and a lab page redirects to /portail; `update-user` cannot change role or client; password change (wrong current refused, changed, changed back). Pages fetched as portail.test: dashboard, list with site / état filters and « Rapport amendé », « Mon compte ». Note: a sample still PRELEVE (sampled by the lab, on its way) shows as « Reçu » (deliberate mapping, `portal-status.ts`). The account « portail.test » stays for the lab's demo; its password is set from `/admin/utilisateurs`.

Built 08/10, **not deployed**. On production after the deploy, with a portal
account « TEST UI Z Portail » created by `admin` for the kept test client
« TEST UI 2026-10-06 Traiteur » (password typed at creation, not written
here). Afterwards: disable the account.

### Z1 — Compte (admin, `/admin/utilisateurs`)
- [x] Role « Client (portail) » opens a client search that offers active, non-merged clients only; creating the account without a client is refused.
- [x] The row shows « Portail de TEST UI 2026-10-06 Traiteur »; « Client » moves it to another TEST UI client and back (journal « Client d'un compte portail modifié »); changing its role to a lab role clears the client.

### Z2 — Ce que voit le client
- [x] Sign in as the portal account → `/portail`: the 12-month counts (reçus, en analyse, rapports disponibles) match the client's samples.
- [x] « Échantillons »: 1/26 and 2/26 « Rapport disponible » with their report number (RAP-2026-00001-A1 if Y ran first, with the « Rapport amendé » badge), 3/26 « Reçu » without results or PDF; filters période, site, état and the search work; no price, no invoice, no staff name anywhere.
- [x] The PDF of 1/26 downloads; journal « Rapport téléchargé » with `portal: true`.
- [x] During an amendment (Y2), the sample reads « En analyse » and its PDF is refused.

### Z3 — Sécurité
- [x] The id of a sample of another client (a « TEST UI W » sample) in `/api/portail/echantillons/[id]` and its `/rapport` → 404.
- [x] `/reception`, `/commercial`, `/admin` redirect to `/portail`; `/api/samples`, `/api/invoices`, `/api/samples/[id]/report` answer 403.
- [x] « Mon compte » changes the password (wrong current password refused, confirmation must match); journal « Mot de passe modifié par l'utilisateur »; the new password signs in.
- [x] Archiving the client (then restoring it) closes the portal with a clear message; disabling the account signs it out at once.

## Checkpoint W — Clients : fusion, site, client facturé, quasi-doublon (live 08/10 — `CLIENTS-FUSION.md`)

Deployed 08/10 (`722da85`, migration `20261008100000_clients_fusion` applied). Verified on production with `.ui-tests/recette-w.mjs` (36/36, run « TEST UI W2 … ») and in the browser as admin; every TEST UI W / W2 fiche archived afterwards.
`admin` (merge, attach) and as a gestionnaire (links, near-duplicates),
**on invented test clients only** — create them first, never touch a real
client (the real duplicates wait for `doublons-clients.xlsx`, Q54):
« TEST UI W Client Démo SARL » (ICE 001234567000089, contact, two addresses),
« TEST UI W Client Demo » (no ICE, one site « Agence Nord », one série with
two samples, one invoice), « TEST UI W Chaîne Test » (one site « Agence
Nord »), « TEST UI W Chaîne Test Agence Sud » (one série, one invoice),
« TEST UI W Franchisé Démo ». Afterwards: archive every TEST UI W fiche.

### W0 — Deployment
- [x] The migration applies (migrate container exits 0); `/commercial` still lists the same active clients; a fiche opens.
- [x] A client archived by the sites import of 07/10 (before the column) reads « Rattachée comme site de X » with the link (journal fallback).

### W1 — Quasi-doublon (gestionnaire)
- [x] Typing « TEST UI W Client Demo SA » in « Nouveau client » lists « TEST UI W Client Démo SARL » and « TEST UI W Client Demo » under « Clients proches », each with its reason and a link (new tab).
- [x] « Créer le client » → the amber box « Ces clients ressemblent beaucoup à celui-ci », the button disabled until « Ce n'est pas le même client » is ticked; then « Créer quand même » creates it; `/admin/journal` « Client créé » carries `confirmedNotDuplicate`. Archive it.
- [x] The exact name « TEST UI W Client Demo » (any case or accent) is still refused outright: « Un client porte déjà cette raison sociale. »
- [x] Same ICE under another name → reason « même ICE ». Renaming a fiche to a near name asks the same confirmation; changing only case or accents does not.

### W2 — Fusionner avec… (admin, on « TEST UI W Client Demo », keep « TEST UI W Client Démo SARL »)
- [x] « Actions sur la fiche » appears for `admin` only, never on an archived fiche; the picker hides this fiche and archived clients.
- [x] « Voir l'aperçu » writes nothing (reload both fiches: unchanged) and reads « 2 échantillons, 1 série et 1 facture passeront à … », « 1 site déplacé », the warning about the missing ICE; the red box « La fiche … sera archivée et renverra vers … » and « Cette opération ne se défait pas depuis l'application. »
- [x] Changing the target clears the preview. Picking a client with another ICE is refused (« … deux ICE différents : ce sont deux sociétés … »).
- [x] « Fusionner dans … » opens the kept fiche: the série, the samples, the invoice (now in its name, PDF re-rendered with that name), the site « Agence Nord », the addresses (no duplicate) are there; empty fields completed, nothing overwritten.
- [x] The archived fiche reads « Fusionnée dans … » with the link, has no « Réactiver », and `PATCH archived:false` answers 409; it is gone from `/commercial` and from the pickers.
- [x] `/admin/journal`: « Clients en double fusionnés » on both fiches with the counts.

### W3 — Rattacher comme site de… (admin, « TEST UI W Chaîne Test Agence Sud » → « TEST UI W Chaîne Test »)
- [x] Preview: « Le site « TEST UI W Chaîne Test Agence Sud » sera créé chez … », « 1 facture reste au nom de … », the addresses' boxes unticked; choosing the existing site « Agence Nord » says « existe déjà … il sera utilisé ».
- [x] Commit: the série has the site, the sample shows in the parent's search with the site filter; the moved addresses have « Rapports » and « Alertes » unticked; **the invoice stays on the archived fiche**.
- [x] A client that has sites is refused (« … un client qui a des sites ne devient pas un site. Fusionnez-le plutôt. »).
- [x] The archived fiche reads « Rattachée comme site de … »; journal « Client rattaché comme site d'un autre client ».

### W4 — Client facturé (gestionnaire, « TEST UI W Franchisé Démo » for « TEST UI W Chaîne Test »)
- [x] On the principal: « Clients facturés » → « Lier un client facturé » → the franchisé; on the franchisé: « Client facturé de … » and « Retirer le lien ».
- [x] Refused: linking a client to itself, to an archived client, to a client that is itself a client facturé, or a client facturé that has its own.
- [x] « Facturé à » on the site « Agence Nord » offers the principal and the franchisé; choosing the franchisé is journalled « « Facturé à » d'un site modifié ».
- [x] New invoice for the franchisé: the samples of « Agence Nord » are offered with the badge « via le site Agence Nord de … »; the principal's billable list no longer offers them; `POST /api/invoices` for the principal with one of them is refused (« … est facturé à … : son site lui est attribué »); invoicing it twice is refused.
- [x] « Retirer le lien » (or archiving the franchisé) gives « Agence Nord » back to the principal: its samples reappear in the principal's billable list.
- [x] The reports and their recipients do not change (no report code touched).
- Observed in the browser: the archived fiche of a merged test client reads « Fusionnée dans … »; a client archived by the sites import of 07/10 reads « Rattachée comme site de … » (journal fallback); an active fiche shows « Fusionner avec… », « Rattacher comme site de… », « Lier un client facturé », « Lier à un client principal »; the merge preview reads the counts, the missing-ICE warning, « La fiche … sera archivée … » and « Cette opération ne se défait pas depuis l'application. » (cancelled, nothing written); typing a near name in « Nouveau client » lists « Clients proches » with links.
- Also verified: an invoice can be created for a sample at the PROGRAMME stage (FAC-2026-0004, before any result), as PROGRAMME.md §6 intends.

## Checkpoint V — Retours du laboratoire des 05 → 07/10 (live 07/10 — `RETOUR-LABO-06-10.md` §5, §6)

Built on 07/10 with the defaults of §5 (V1 → V6), deployed (commits
`e30c2b0`, then `e83421c` for the five defects found by this recette),
migration `20261007100000_retour_labo_v` applied. Verified on production on
the test client « TEST UI 2026-10-06 Traiteur »: an API script
(`.ui-tests/recette-v.mjs`, 29/29) and the real screens in the browser pane
(pre1 → recep1 → param1 → admin). Séries 4/26 → 8/26 are test séries.

### V0 — Deployment
- [x] The migration applied (migrate container exited 0); the old séries read cadre « Autre »; the 43 food parameters come back with family MICRO.
- [ ] `/admin/documents`: PG04/EN01 (protocole) and PG05/EN04 (bon) get a new version and date — the laboratory's quality decision, left to it.

### V1 — En-tête de la visite
- [x] « Cadre »* offers Autre / Devis validé / BC / Convention on the visit and the deposit, none preselected; the API refuses a missing cadre and the old value (« Choisissez le cadre de l'analyse. »).
- [x] « Autre » opens « Préciser (facultatif) »: série 6/26 typed in the browser prints « Autre — Contrôle trimestriel » on the recap, the reception side panel and the protocol PDF; the lab changes the cadre (PATCH Convention, then back to Autre + note).
- [x] Changing the cadre on the visit page until reception (08/10, série 9/26: « Devis validé » → « BC », saved, read back after reload; « Modifiable tant que le laboratoire n'a pas réceptionné la série »).
- [x] « Service vétérinaire » absent (visit: Qualilab / Autre; deposit: Le client / Autre); the API refuses it (« … choisissez « Autre » et indiquez le nom. »).
- [x] « Référence client » on the form, the recap, the reception panel and the protocol (REF-0710-NAV).

### V2 — Vocabulaire et surfaces
- [x] Phone width (375 px, 08/10): the new sampler form has no horizontal scroll; the surface state chips wrap (40 px targets), Désignation / Surface prélevée fill the width, the air method chips fit one line, physico-chimie greyed on Air.
- [x] « Échantillon N » on the visit form (cards, buttons « Ajouter un échantillon », « Continuer — Vérifier (3 échantillons) »), the success screen, the reception (« Valider la réception (4 échantillons) », « 4 échantillons numérotés »), the programmation queue and sheet; form error « Échantillon 3 — choisissez la méthode de prélèvement de l'air. » with the card ringed red.
- [x] Bench, validation, programmation and reception screens (lists and detail pages) fetched as tech1 / valid1 / param1 / recep1 on 08/10: no « Ligne » left, « échantillon » throughout.
- [x] A Surface sample asks « Désignation »*, « État de la surface »* (three buttons) and « Surface prélevée (cm²) » (100 by default), absent on the other types; the state prints in the protocol's « Remarques » (« Nettoyé »), the reception card, the programmation queue, « Corriger la fiche » and the report (« Plan de travail — surface aseptique »).
- [x] 08/10: the bon of deposit 5/26 prints rows « 1M » / « 1P » with their N° de contrôle and family, « Cadre : BC », « Référence client »; after cancelling 6/26-1P the protocol prints « 1M : — / 1P : Échantillon annulé » in red and the corrected surface state.

### V3 — Familles par échantillon
- [x] Two boxes per sample instead of the nature select; physico-chimie greyed on an Air sample (« Non proposées pour ce type »).
- [x] Both ticked → 6/26-1M and 6/26-1P (natures MICRO_ALIMENTS / PC_ALIMENTS, the micro analyses on 1M only), two cards at reception with 100 g / 300 g minimums, N° de contrôle 11/26 and 12/26, two programme sheets; the protocol prints one row « 1 » and ticks both boxes.
- [x] Deposit (API, BC) with both ticked → 5/26-1M / 5/26-1P with their N° de contrôle.
- [x] Programme sheet « Nature d'analyse »: after the fix, a food sample is offered the food natures of its family only (aliments, cosmétiques, compléments, aliments liquides, nettoyage); an air nature is refused (« … concerne un autre type d'échantillon … »); the referential is recomputed for a fine nature (GET ?natureId).

### V4 — Air
- [x] An Air sample requires « Méthode de prélèvement »* (form and API); « Biocollecteur » prints in the protocol's « Surface prélevée » column, on the reception card and the programmation queue; « Corriger la fiche » refuses a method on a surface sample.
- [ ] Air parameters in the catalogue — waiting for Q50.

### V5 — Sites des clients
- [x] Import « Sites de l'ancien logiciel » (same endpoint as the /admin/import card, posted by `.ui-tests/import-sites.mjs` — the browser pane cannot upload a file): analyse → 420 to create, 345 clients to attach and archive, 75 doubtful names untouched, 5 rows with an ambiguous parent, 1 duplicate; commit → 420 sites, 345 clients archived, 1 address moved; a second analysis → 0 to create, 420 present.
- [x] The largest chain client offers its 84 restaurants in the visit's client → site cascade; its restaurants are gone from the client list (1 517 → 1 172 active clients).
- [x] Five site names that are also real clients of the old software are never archived (column `alsoClient`, fix of this recette): 4 were planned for archiving before the fix.
- [x] The report prints « Site : Site démo recette » (série 7/26, RAP-2026-00003, read at the image); `/admin/journal` reads « Sites de l'ancien logiciel rattachés », « Site créé », « Client archivé »; `/recherche` has the « Site » filter (enabled once a client is chosen).
- [ ] E-mail subject with the site — delivery simulated until DNS.

### V6 — Le laboratoire décide des analyses
- [x] A visit saves with no analysis on the surface and air samples and no product-type selector (it stays on the deposit); a deposit saves with no analysis (API); the programme sheet refuses to confirm without analysis (« Choisissez au moins une analyse avant de confirmer le programme. »).

### Défauts trouvés par cette recette et corrigés le jour même (`e83421c`)
- A new sample inherited « Analyses physico-chimiques » from the previous one (a surface became two samples) → a new sample starts on microbiology; « Dupliquer » still copies all.
- The programme sheet offered water and air natures to a food sample → same family **and** same kind of sample.
- « Corriger la fiche »: the reason's label was not linked to its field.
- The received série's summary kept the reception's answer after a correction → it reads the database after the refresh.
- The sites import would have archived 4 real clients whose name is also a site's (merged by the import of 01/10) → `alsoClient` column, never archived; the extraction adds the city (VILLES).

## Checkpoint U — « Une journée du laboratoire » en production (2026-10-06)

One prélèvement followed by hand in the browser pane, in the lab's order, every
step re-read after a reload and checked against the audit journal. Full
report: `RECETTE-06-10-PARCOURS.md`.

### U-1 Circuit of série 1/26 · contrôle 1/26 (client « TEST UI 2026-10-06 Traiteur »)
- [x] commercial1 creates the client (13:58) ; pre1's « Nouvelle visite » with the proposed legal time (13:59, hint under the field) → série 1/26, no N° de contrôle on the préleveur's side, protocol PDF 200.
- [x] recep1 receives it (14:01) : 5 °C, 300 g, conform, **no technician** → N° de contrôle 1/26, RECU, labels PDF 200.
- [x] param1 confirms the programme (14:03) : type « PLAT CUIT PRÊT À CONSOMMER » (6 germs with criteria), n = 5, 25 g, Salmonelles to Imane, délai 07/10 16:00 → PROGRAMME.
- [x] tech1 types R1 … R5 for his five germs with the keyboard and saves (14:06) → EN_ANALYSE ; tech2 types Salmonelles « Absence » ×5, saves and submits (14:07) → RESULTATS_SAISIS.
- [x] valid1 validates technically with the proposed regulation (14:08) ; the badge stays « Résultats saisis » and the panel shows step 1 signed (double validation, by design).
- [x] admin approves (14:10) → RAPPORT_ENVOYE, **RAP-2026-00001**, e-mail simulated ; PDF re-read at the image : regulation table with the X under « Satisfaisant », R1 … R5, n / c / m / M, two technicians, three signatures, one page.
- [x] compta1 invoices the validated analysis (14:16) : **FAC-2026-0001**, 6 lines, 1 250 DH HT / 1 500 TTC, PDF ; 1/26 no longer proposed. Search : « Rapport envoyé · Satisfaisant ».
- [x] Database evidence : `GET /api/samples?limit=50` as admin lists the sample RAPPORT_ENVOYE after sign-out / sign-in ; the journal holds the 23 entries with their hours and authors ; counters série 2 · contrôle 2 · rapport 2 · facture 1.

### U-2 Regulation chosen by the validator (série 2/26 · contrôle 2/26)
- [x] Received without technician (14:12), programmed with E. coli alone, < 10 typed and submitted (14:13).
- [x] valid1 replaces « — aucune — » by « Arrêté conjoint n° 624-04 du 8 avril 2004 » **with a real keystroke** and validates (14:20) : « Réglementation choisie pour un échantillon » in the journal, the chosen text shown after reload and as admin.
- [x] admin approves (14:22) → **RAP-2026-00002** ; the PDF prints no « Réglementation en vigueur » table because the sample has no criteria plan and no official verdict (CRITERES §3) — question Q44 to the lab.
- [x] Yesterday's « regulation not applied » was the test tool (value set by script, unseen by React), not the application.

### Found and fixed the same day
- Reception pre-selected the first technician although the field is optional since the programme : `SerieReceptionForm` and `DepositForm` now default to « À attribuer à la programmation » (also the « Technicien pour toutes les lignes » select). Gates : tsc, eslint, vitest 400, build.
- [x] **Production after deploy (14:38) :** série 3/26 (« Tajine de légumes ») opened at `/reception/series/[id]` in a fresh tab — both selects read « À attribuer à la programmation » (value empty) ; 4 °C, 250 g, « Maintenant », « Conforme », « Valider la réception » → `POST /api/series/[id]/reception` 200, N° de contrôle 3/26, 5 labels, technician « — » on the summary ; `GET /api/programmation/queue` lists it (« à programmer » 1, technician null). Left at RECU for the lab to programme.

### Left
- Q43 : types imported without any criterion (« PLATS CUISINÉS-VOLAILLES » …) ; Q44 : print the chosen regulation on a report judged without criteria ?
- Test client kept on production for the lab to replay the circuit ; purge with `.ui-tests/purge-c.mjs`.

## Checkpoint L — Phase 9, chantier 1 : circuit série (L1–L5 verified 2026-09-13, L1b verified 2026-09-14, all on the dev server at 1440×900 and on the VPS after deploy; L6 = recette with the laboratory, pending)

Tick only what was seen in the browser. One sub-checkpoint per slice of
`WORKFLOW.md`.

### L1 — Nouvelle visite (slice 1) — dev server 2026-09-13, `pre1` / `recep1` / `tech2` / `valid1` / `admin`
- [x] Header once: client → site cascade, interlocuteur, préleveur pre-filled, start time editable (série **9/26**, Restaurant Le Palmier, created through the real form).
- [ ] Cadre derived — not on the préleveur form (lab-side field, `PATCH /api/series/[id]`), to observe in L2.
- [~] Lines of mixed natures on one visit — observed with **two** lines (aliment « Suprême de poulet » lot LOT-0913, mains of a person (name removed from the public repository 14/10) under MICRO_SURFACES): the fields shown change with the nature and the kind chips (SURFACE / MAINS), temperatures optional, unit count chips. Six-line mix and quantity « 01 » in `UNITE` not yet exercised.
- [x] The visit gets a N° de série NNNN/AA at creation (9/26 shown on the success screen and on « Mes visites »); the préleveur never sees a N° de contrôle — `/api/series/[id]` and `/api/samples?q=9/26` payloads checked as `pre1`: no `controlCode`, no `receivedBy`, no « 9103 ».
- [x] « Mes visites » lists séries with the progress of each sample (« 2 échantillons · 1 en cours · 1 terminé », status « En cours » derived).
- [x] Visit detail: « Arrivée au laboratoire » panel saves fin / arrivée / T° glacière (chronology enforced: an end before the start is refused with the French message).
- [ ] Old single-sample creation (`POST /api/samples` → one-line série) — covered by `serie-input` / `serie-create` tests, not yet observed in a browser.
- [x] Lab screens identify the sample by its N° de contrôle and show the série: réception success (« Code contrôle 9103/26 · N° de série 9/26 »), technician list + sheet, validation list + control view (« 9103/26 · série 9/26 »), bench sheet PDF (`9104/26 AMBIANCE · Série 9/26 · …`), report PDF RAP-2026-00004 (« Code contrôle 9103/26 · N° de série 9/26 »).
- [~] Existing circuit on a backfilled sample: QL-2026-00001 (pre-phase-9) received → « 9105/26 · N° de série 1/26 » (backfilled série). Rapport and facture on a backfilled sample not yet observed.
- [x] **Production (185.217.126.53, after deploy):** `pre1` sees the 15 backfilled séries (1/26 … 15/26) with derived statuses; série **16/26** created (2 lines: aliment + surface) with no `controlCode` in the payload; `recep1` receives 16/26-1 → « Code contrôle 13/26 · N° de série 16/26 »; `tech2` list shows « 13/26 · série 16/26 » with the technician sidebar.

### L2 — Réception groupée (slice 2) — dev server 2026-09-13, `recep1` / `admin`
- [x] The queue lists séries, not samples (« 8/26 · Visite · 3 lignes à réceptionner · arrivée 18:24 · 1,5 °C »); the série screen shows every line with what the préleveur wrote (lot, DLC, T°p/T°a, units, analyses) and the cooler pre-fills each line's temperature.
- [x] Rules computed live: « Quantité non renseignée — minimum 100 g » (warning), « Volume 0,5 L < 1 L requis » and « Température à l'arrivée obligatoire pour un produit alimentaire » (blocking → « Conforme » disabled, motif pre-set: TEMPERATURE_MANQUANTE / QUANTITE_INSUFFISANTE); typing the cooler temperature lifts the temperature block (série 10/26).
- [x] « Valider la réception » numbers every line in one transaction (série 8/26 → 9106/26, 9107/26, 9108/26, technician on each; série 10/26 → line 1 conform, line 2 non conform « Quantité insuffisante »); the received série re-opens as a read-only summary; the queue empties; `/api/series/[id]/labels` on a série not yet received answers 409.
- [x] Labels PDF: 7 labels for 5 + 1 + 1 units on one A4 sheet, « 9106/26 A … E », nature, date, product, client, série number (pdftotext).
- [x] `/admin/reglages` shows the seven thresholds + the kinds requiring a temperature; saving them answers « Réglages enregistrés » and the API returns the values.
- [ ] Second click on « Valider la réception » (409) — not exercised in the browser; covered by the status re-check in the transaction (P2025 → 409) and `reception-input` tests.

### L3 — Dépôt client et documents (slice 3) — dev server 2026-09-13, `recep1` / `admin` / `pre1`
- [x] « Nouveau dépôt » (button on `/reception` + sidebar): client, « prélèvement effectué par » (client / service vétérinaire / autre), déposé par, avance 350 DH — espèces, one aliment line 250 g at 4 °C with its live checklist (« Quantité 250 g ≥ 100 g », « Température relevée : 4 °C »), technician; recap; save → **série 11/26 born RECU, N° de contrôle 9111/26**, bon + labels buttons (both 200).
- [x] A deposit line under a blocking rule is forced « non conforme » with its motif (same widgets as the série reception); the API re-runs the rules (`POST /api/series` kind DEPOT).
- [x] Bon de réception PDF (pdftotext): cartouche « PG05/EN04 · G · 05/01/2006 · 01/10/2024 », N° de série, date/heure, reçu par, client address/phone, the line with lot / quantity / T° / N° de contrôle / analyses, the seven rules with the lab's thresholds, « Avance 350,00 DH — Espèces / Reste », the two signature boxes, footer « Page 1 / 1 ».
- [x] Protocole de prélèvement PDF of série 8/26: cartouche « PG04/EN01 · F », header (site, cadre, interlocuteur, prélevé le / fin, effectué par, arrivée, T°), the eight-line table (surface « 100 cm² » / « MAIN », lot, DLC P/E, quantity, lieu, T°p/T°a, remarks), analyses micro / physico-chimie per line, signature boxes; no N° de contrôle; printable from the préleveur's visit page and from the série reception.
- [x] Blind rule: `pre1` gets 200 on their own protocol and 404 on a deposit's bon.
- [x] `/admin/documents` lists the six documents with their cartouche (four seeded from the paper forms); editing « Rapport d'analyse » and saving answers « Cartouches enregistrés » and the API returns the new values; the bench sheet now prints « Réf. PG06/EN01 · version G ».
- [x] **Production (185.217.126.53, after deploy):** `recep1` enters a deposit through the real form (Pastilla au poulet, 300 g, 5 °C, avance 200 DH — chèque) → **série 17/26 · N° de contrôle 15/26**, bon PDF and labels answer 200; `admin` sees the six cartouches at `/admin/documents` and the protocol of série 16/26 renders.

### L4 — Rien n'est tapé deux fois (slice 4) — dev server 2026-09-13, `admin` / `pre1`
- [x] A second visit to the same client proposes its places and products (datalists fed by `/api/clients/[id]/memory`: « Poste salades », « Chef cuisine », « Chambre froide », a salad named after the client (name removed 14/10), « Tajine de poulet »…); typing « poste salades » shows « Déjà connu sous « Poste salades » — cette orthographe sera utilisée »; the saved line takes the memory's spelling of the product (série 13/26 via the API: that salad typed in lower case was saved in the memory's spelling); places are memorised per site, a client-wide place being reused when the site has none of that name.
- [x] `/admin/profils`: « Micro aliments standard » (n = 5, Coliformes totaux + E. coli) created for Microbiologie des aliments; on the visit form the chip « Micro aliments standard · n = 5 » ticks both analyses and sets n = 5 in one tap. Client-specific profiles are listed first by the API (`clientId` desc) — not exercised with a contractual client yet.
- [x] Sites: « Cuisine centrale » added on the client fiche (« Sites de prélèvement » card, gestionnaire / admin) and proposed in the visit's client → site cascade; the série records it.
- [x] « Prélèvement effectué par » on the visit: Service vétérinaire + name → the série carries samplerKind SERVICE_VETERINAIRE, the name and cadre OFFICIEL.
- [ ] Sites imported from the old database — deferred to the reprise (chantier 6): the legacy sites hang off legacy clients, which are imported together at go-live.
- [x] **Production (185.217.126.53, after deploy):** `admin` creates « Micro aliments standard » (n = 5) and the site « Cuisine centrale » (API 201, listed at `/admin/profils`); `pre1`'s « Nouvelle visite » shows the site in the cascade, the profile chip and the client's memory (« Pastilla au poulet », « Tajine de poulet », « Cuisine chaude »…).

### L5 — Corrections (slice 5) — dev server 2026-09-13, `recep1` / `admin` / `tech2` / `valid1`
- [x] « Corriger la fiche » on the série reception page (9107/26): the dialog shows the fields of the kind (surface, area, lieu, remarks), asks a reason, saves « Poste salades — planche verte » (API confirms; audit `SAMPLE_INTAKE_CORRECTED` with before/after). Refused once approved (`CORRECTABLE_STATUSES`) — enforced in the route.
- [x] « Annuler » (9108/26, motif « Doublon ») → status ANNULE, the line shows « Annulé · Doublon » in the série summary, the technician's bench no longer lists it (`tech2`: séries 9/26, 8/26 with 2 samples left, 11/26); the billable and report queries only take VALIDE / RAPPORT_ENVOYE.
- [x] « Réactiver » (`admin`, written reason) → 9108/26 back to RECU with its N° de contrôle, cancel fields cleared.
- [x] Technician and validation lists grouped by série (« Série 8/26 · Restaurant Le Palmier · 2 échantillons »); the validation view shows « Corriger la fiche » to `valid1` and no « Annuler » (the state machine keeps cancellation for the réception and the admin).
- [x] Old routes removed: `/reception/<sampleId>` → 404, `POST /api/samples` → 405.
- [x] Photo of the signed protocol from the phone — exists since slice 1 (visit detail, `signedProtocolData`).
- [x] **Production (185.217.126.53, after deploy):** `/reception/<sampleId>` → 404, `POST /api/samples` → 405; `recep1` corrects the lot of 13/26 (série 16/26) from the série page (« L-0913-B », API confirms); `tech2`'s bench is grouped by série (8/26, 4/26, 5/26, 16/26, 17/26).

### L1b — Le protocole tel quel (retour du laboratoire 14/09 — WORKFLOW.md §13) — dev server 2026-09-14, `pre1` / `recep1`
- [x] The header shows, in the paper's order: N° de série slot (« attribué à l'enregistrement »), client, site (always shown — « Siège (adresse du client) » by default; « + Nouveau site… » created « Site démo » inline and selected it), cadre (derived, shown), interlocuteur, prélevé le … à … + heure de fin, effectué par (« Karim Benali (moi) » picked from the PRELEVEUR accounts, « Fonction : Préleveur »; vétérinaire / autre with a name), arrivé le … à …, T° à l'arrivée, N° de factures — read in that order from the labels of the page.
- [x] Every line starts with its type (Produit alimentaire / Surface / Mains du personnel / Eau / Air / Autre): choosing « Mains du personnel » on line 2 and « Surface » on line 3 switched their nature to Microbiologie des surfaces and showed the person / « Surface prélevée » + « Aire (100 cm²) » fields; the nature select stays editable.
- [x] Nombre d'unités: the number input accepted 30 on line 3 (chips 1/3/5/9 kept); the recap and the série page print « 30 unités (A–AD) »; after reception the sheet holds 36 labels (5 + 1 + 30) on two A4 pages, « 9114/26 AA » … « 9114/26 AD » among them (pdftotext); the validator refuses 51 (unit test).
- [x] The two « Analyses à effectuer » boxes at the end of the form were pre-ticked from the lines (micro), editable, saved on série 14/26 (`analysesMicro: true`, `analysesChimie: false`) and printed as boxes on the protocol PDF (« ANALYSES À EFFECTUER : [x] Analyses microbiologiques [ ] Analyses physico-chimiques », drawn in CSS); série 15/26 created with « physico-chimie » ticked and no chimie line shows at reception « Demandé sur le protocole sans ligne correspondante : analyses physico-chimiques — à programmer ».
- [~] A client's paper protocol (client and person names removed from the public repository 14/10) entered on one screen: 3 of its 6 lines (a salad « 01 » T°p 1 / T°a 2 with the profile in one tap, MP <person> — Chef cuisine, mains lavées, T°p 25, MS Planche verte 100 cm²), fin, arrivée and 1 °C typed on the form → série **14/26**, the protocol PDF prints them field for field (site « Site démo », « Prélevé le … — fin … », « Arrivé au laboratoire », « T° à l'arrivée : 1 °C », « Fonction : Préleveur », MAIN / 100 cm² / n = 30). Entered from the desktop pane, not a phone; the three remaining lines (Suprême de poulet, Zaalouk, Plan travail) are the same kinds.
- [x] The visit page still completes what was not typed on site (end, arrival, temperature, photo) and the reception still overrides arrival and temperature: the série page came pre-filled with the form's fin / arrivée / 1 °C on every line; an arrival typed in the future is refused (« L'heure d'arrivée est dans le futur ») both on the form and at reception; « Maintenant » then « Valider la réception » numbered the three lines 9112/26 – 9114/26.
- [x] **Production (185.217.126.53, after deploy):** the migration backfilled the boxes of the existing séries (14/26, 15/26, 16/26 → micro ticked); `pre1`'s « Nouvelle visite » shows the header in the paper's order, the six type chips, « Siège » + « Nouveau site… », the n input and the pre-ticked boxes; série **18/26** created with « Siège », fin / arrivée / 1 °C, a 30-unit surface line and both boxes, its protocol PDF renders (200); `GET /api/preleveurs` lists the préleveur accounts.

### L6 — Recette (slice 6)
- [ ] Three real visits and one real deposit entered by the lab's own staff; sign-off row filled below.
