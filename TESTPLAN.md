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
- [ ] `tech1`'s counters only count samples assigned to them.

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

### C4. Assignment to a technician
- [x] Réceptionniste assigns the sample to a technician in the same action.
- [x] The technician list shows each technician's current workload.
- [x] After reception the status becomes **Reçu** and the technician's
      dashboard count increases (verified: 3 samples → "Qui m'attendent 3").

### C5. Result entry (technicien)
*verified 2026-08-25*
- [x] `tech1` sees **only** the samples assigned to them — a second technician
      (`tech2`) gets **403** on the API, is redirected away from the page, and
      the sample does not appear in their queue.
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
- [~] Lines of mixed natures on one visit — observed with **two** lines (aliment « Suprême de poulet » lot LOT-0913, mains « Hamza Bassou » under MICRO_SURFACES): the fields shown change with the nature and the kind chips (SURFACE / MAINS), temperatures optional, unit count chips. Six-line mix and quantity « 01 » in `UNITE` not yet exercised.
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
- [x] A second visit to the same client proposes its places and products (datalists fed by `/api/clients/[id]/memory`: « Poste salades », « Chef cuisine », « Chambre froide », « Salade Gaillardière », « Tajine de poulet »…); typing « poste salades » shows « Déjà connu sous « Poste salades » — cette orthographe sera utilisée »; the saved line takes the memory's spelling of the product (série 13/26 via the API: « salade gaillardière » → « Salade Gaillardière »); places are memorised per site, a client-wide place being reused when the site has none of that name.
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
- [~] The Gaillardière protocol entered on one screen: 3 of its 6 lines (Salade Gaillardière « 01 » T°p 1 / T°a 2 with the profile in one tap, MP Hamza Bassou — Chef cuisine, mains lavées, T°p 25, MS Planche verte 100 cm²), fin, arrivée and 1 °C typed on the form → série **14/26**, the protocol PDF prints them field for field (site « Site démo », « Prélevé le … — fin … », « Arrivé au laboratoire », « T° à l'arrivée : 1 °C », « Fonction : Préleveur », MAIN / 100 cm² / n = 30). Entered from the desktop pane, not a phone; the three remaining lines (Suprême de poulet, Zaalouk, Plan travail) are the same kinds.
- [x] The visit page still completes what was not typed on site (end, arrival, temperature, photo) and the reception still overrides arrival and temperature: the série page came pre-filled with the form's fin / arrivée / 1 °C on every line; an arrival typed in the future is refused (« L'heure d'arrivée est dans le futur ») both on the form and at reception; « Maintenant » then « Valider la réception » numbered the three lines 9112/26 – 9114/26.
- [x] **Production (185.217.126.53, after deploy):** the migration backfilled the boxes of the existing séries (14/26, 15/26, 16/26 → micro ticked); `pre1`'s « Nouvelle visite » shows the header in the paper's order, the six type chips, « Siège » + « Nouveau site… », the n input and the pre-ticked boxes; série **18/26** created with « Siège », fin / arrivée / 1 °C, a 30-unit surface line and both boxes, its protocol PDF renders (200); `GET /api/preleveurs` lists the préleveur accounts.

### L6 — Recette (slice 6)
- [ ] Three real visits and one real deposit entered by the lab's own staff; sign-off row filled below.
