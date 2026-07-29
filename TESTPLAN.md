# TESTPLAN.md — browser test path

> **Purpose.** One place listing what to click through in the browser after each
> checkpoint, so at the end of the project we have a complete, repeatable manual
> test path.
>
> **Rules for any AI/developer:** when you finish a checkpoint, *append* its
> section here — never rewrite earlier ones. Every item must be checkable in a
> browser by a non-technical person.
>
> **Demo accounts** (all password `password`):
> `pre1` · `recep1` · `tech1` · `valid1` · `commercial1` · `compta1` · `admin`
>
> **Start the app:** `npm run dev` → http://localhost:3000
> (during development we also use port 3210)
>
> Legend: `[ ]` to test · `[x]` verified

---

## Checkpoint A — Authentication (Better Auth) & access guard
*Status: ✅ verified 2026-07-29*

### A1. Login
- [x] `/login` displays the Qualilab login form (username + password).
- [x] Wrong password → French error "Identifiants incorrects.", stays on page.
- [x] Correct credentials → redirected to the role's own dashboard.
- [ ] Empty fields → the browser blocks submission (required).

### A2. Session
- [x] After login, refreshing the page keeps you signed in.
- [x] Visiting `/login` while signed in → redirects to your dashboard.
- [x] "Déconnexion" → returns to `/login`.
- [x] After logout, opening a protected page (e.g. `/technicien`) → `/login`.
- [ ] Session survives closing/reopening the browser tab (7-day cookie).

### A3. Access control — the security check
- [x] Signed in as `tech1`, open `/admin` → redirected back to `/technicien`
      (never a blank page or an error).
- [x] Signed in as `tech1`, call `/api/invoices` → **403 “Accès refusé.”**
- [x] Signed out, call `/api/samples` → **401 “Non autorisé.”**
- [x] Signed in as `pre1`, open `/comptabilite` → redirected to `/preleveur`.

### A4. No regression on the approved prototype
- [x] `admin` → `/admin/factures` lists the 2 seeded invoices with correct totals.
- [x] `pre1` → `/preleveur/nouveau` loads clients, parameters and the timestamp.
- [ ] `/admin/factures/nouvelle` still creates an invoice end-to-end.
- [ ] Invoice PDF download still works from the invoice detail page.

---

## Checkpoint B — 7 roles, data model & dashboards
*Status: ✅ verified 2026-07-29*

### B1. Every role reaches its own space
Log in with each account and confirm the landing page and sidebar label:

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
- [ ] Each sidebar shows that role's menu, with "Phase 2/3/4" badges on the
      items that are not built yet (they must not be clickable).

### B2. Dashboard indicators show real data
- [x] `/comptabilite` → Factures **2**, En attente **2**, Payées **0**,
      Encaissé **0,00 DH** (matches the seeded invoices).
- [x] `/technicien` → counters render (all 0 until Phase 2 assigns work).
- [x] `/reception` → "À réceptionner" equals the number of samples still at
      status *Prélevé* (**1** with the default seed).
- [x] `/commercial` → Clients **5**, Échantillons **1**.
- [x] `/validation` → all counters **0** (nothing submitted yet).

### B3. Data isolation
- [ ] `pre1` sees only their own samples in `/preleveur`.
- [ ] `tech1`'s dashboard counts only samples assigned to them.

### B4. Responsive & accessibility
- [x] Resize to mobile (375px): the sidebar collapses to a burger menu and the
      dashboards stay readable.
- [ ] Tab through the login form: focus is visible on every field and button.
- [ ] Dashboard headings and stat labels are legible (contrast) on mobile.

---

## Checkpoint C — LIMS core (Phase 2) — *not built yet*
To be filled when reception, result entry and validation land. Expected path:
préleveur creates → réception numbers & assigns → technicien enters results →
validateur validates/rejects → status advances at each step and the audit log
records who did what.
