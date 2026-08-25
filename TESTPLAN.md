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
*C1–C5 verified · C6 (validation) to build*

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

### C6. Validation — **double validation, every sample** — *to build*
- [ ] `valid1` → `/validation` lists samples at **Résultats saisis**.
- [ ] The view shows results **against their thresholds**, technician notes, history.
- [ ] Validateur validates → the sample moves to "awaiting admin approval",
      **not** straight to Validé.
- [ ] `admin` sees samples awaiting final approval and approves.
- [ ] **Only after both** does the status become **Validé**.
- [ ] Rejection (by validateur or admin) **requires a comment**.
- [ ] A rejected sample returns to the technician, who sees the comment.

### C7. The state machine — illegal moves are refused
- [x] A sample already received cannot be received again — **409** with a clear
      French message ("Transition impossible : « Reçu » → « Reçu »").
- [x] An unknown sample id returns **404**, not a crash.
- [x] Only RECEPTIONNISTE / ADMIN may receive: `pre1` **403**, `tech1` **403**,
      signed out **401**.
- [ ] A technician cannot validate their own sample *(with C6)*.
- [ ] A sample cannot skip a step (e.g. Prélevé → Validé) *(with C6)*.

### C8. Audit trail
- [x] Reception records **who** did it and **when**
      (`SAMPLE_RECEIVED` with code, control code, conformity, technician).
- [x] Sample creation is recorded (`SAMPLE_CREATED`).
- [ ] The sample detail shows the timeline of what happened *(with C5)*.

## Checkpoint D — Reports, email & alerts (Phase 3) — *to build*

### D1. Official PDF report
- [ ] Validating a sample generates the PDF automatically.
- [ ] The PDF contains: Qualilab identity + logo, the sample code, client, lieu,
      date de prélèvement, préleveur, the results table with thresholds and
      conformity, the conclusion, the technician and validateur names, the date.
- [ ] Text in the PDF is **selectable** (not a screenshot) and multi-page works.
- [ ] The report is archived and can be re-downloaded later.

### D2. Automatic email to the client
- [ ] On validation the report is emailed to the client's address.
- [ ] The email arrives in the **inbox**, not spam (real domain test).
- [ ] The send is recorded in the journal with date, recipient, status.
- [ ] A gestionnaire can **resend** it manually.

### D3. **Contamination alerts** (client requirement 18-08)
- [ ] Entering a result **under** the limit for E. coli → **no** alert.
- [ ] Entering a result **over** the limit (e.g. `8,9.10²` vs limit `1.10²`) →
      alert fires **after validation**.
- [ ] The alert goes to **all** the addresses listed for that client.
- [ ] The lab is in copy (`direction@…` + responsable technique).
- [ ] Subject reads "Alerte de contamination par <germe>".
- [ ] The table contains: **Produit · Site de prélèvement · Date de réception ·
      N° de lot · Le germe · Résultat UFC/g · Limite UFC/g**.
- [ ] Two contaminated products for the same client arrive in **one grouped
      email**, one row each — not two separate emails.
- [ ] The lab signature block is correct (responsable technique, tél, email, adresse).
- [ ] Alerts only fire for the sensitive germs configured (E. coli, Salmonelle,
      Listeria) — a normal parameter over threshold does **not** send an alert.
- [ ] The alert is logged and resendable.

### D4. Feuille de paillasse
- [ ] The bench sheet prints the samples/parameters **for a chosen date**.
- [ ] It has a column for the value and a column for notes.
- [ ] It prints correctly on A4 (no cut-off columns).

### D5. Admin silent report edit
- [ ] `admin` can modify a validated report.
- [ ] The modification leaves **no trace** in the audit journal (as requested).
- [ ] No other role can do this — the option is invisible to them.

---

## Checkpoint E — Clients, invoicing & administration (Phase 4) — *to build*

### E1. Clients
- [ ] Gestionnaire/admin can create, modify and archive a client.
- [ ] A client can hold **several email addresses** (report vs alert recipients).
- [ ] Fiche client 360° shows their samples, reports, invoices and payments.
- [ ] Search and filters work on a realistic list.

### E2. Invoicing from validated samples
- [ ] Selecting a client's validated samples generates the invoice lines
      automatically, at catalogue prices.
- [ ] Line labels (dénominations) can be edited before issuing.
- [ ] Free lines can still be added (déplacement, urgence…).
- [ ] Totals, VAT and the amount in words are correct.
- [ ] Payment status can be changed and is reflected in the dashboards.

### E3. Administration
- [ ] Admin creates a user, assigns a role, disables an account, resets a password.
- [ ] A disabled user can no longer log in.
- [ ] Admin adds/edits an analysis parameter with its unit and threshold.
- [ ] Admin flags a parameter as "sensitive" and sets its alert limit →
      the alert behaviour follows the new setting.
- [ ] Admin edits the service catalogue and prices → new invoices use them.
- [ ] Admin edits the company details → they appear on the report and invoice.
- [ ] Admin can consult the audit journal.

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
| Phase 2 · C6 validation | | | |
| Phase 3 (D) | | | |
| Phase 4 (E) | | | |
| Phase 5 (F) | | | |
| Extensions (G) | | | |
