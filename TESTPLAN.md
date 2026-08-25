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

## Checkpoint E — Clients, invoicing & administration (Phase 4) — *to build*

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
*parameters + journal verified 2026-08-25 · users & catalogue to build*

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

## Checkpoint F — Production readiness (Phase 5) — *to build*

- [ ] Dashboards per role + direction view (samples by status, average delays,
      activity per domain, billed / collected).
- [ ] Global search by code, client, date, status returns the right sample.
- [ ] The app is reachable on the real domain over **HTTPS** (padlock, no warning).
- [ ] Logging in over the real domain works (no origin/CSRF error).
- [ ] A database backup exists and a **restore has been tested**.
- [ ] Imported legacy data (clients, reports, invoices) displays correctly.
- [ ] The app restarts by itself after a server reboot.
- [ ] Full end-to-end run on the production server: prélèvement → réception →
      analyse → validation → rapport → email → facture.

---

## Checkpoint G — Extensions (Phases 6–8) — *to build*

### G1. Achat & Stock (Phase 6)
- [ ] Magasinier logs into their own space.
- [ ] Supplier created with its payment convention.
- [ ] Stock item in/out movement updates the quantity.
- [ ] Low-stock alert appears.
- [ ] Supplier payment-due alert fires on the convention's terms.

### G2. Qualité (Phase 7)
- [ ] Equipment registered with its calibration schedule.
- [ ] An overdue calibration is flagged.
- [ ] Temperature reading recorded; an out-of-range value raises an alert.
- [ ] EIL campaign tracked.

### G3. Portail client & Réclamations (Phase 8)
- [ ] Admin creates a client account (no self-signup possible).
- [ ] The client logs in and sees **only their own** samples and reports.
- [ ] The client **cannot** reach any lab screen or another client's data
      (try editing the URL — it must be refused).
- [ ] The client can follow the progress of an analysis in real time.
- [ ] A réclamation can be filed and linked to a sample.

---

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
| Phase 5 (F) | | | |
| Extensions (G) | | | |
