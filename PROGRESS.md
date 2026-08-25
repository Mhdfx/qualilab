# PROGRESS.md — live tracker

> The odometer. **Update this every session** (any platform). Tick items, move
> the NEXT ACTION line, add a Session Log entry. This is the first thing the
> next AI reads to know where to start.

---

## ▶ NEXT ACTION

**Phase 5's code portion is complete (2026-08-25).** The direction view, the
database-backed global search (blind numbering excluded from the préleveur's
search), the production build with HSTS, the Docker image with Chromium, the
compose stack, the backup/restore scripts and `DEPLOY.md` are all in place and
verified locally.

**What remains needs things only the outside world can provide:**
1. **The VPS**: first deploy per `DEPLOY.md`, certbot HTTPS, cron the backup,
   one real restore (date it in DEPLOY.md), full TESTPLAN pass on the deployed
   system.
2. **The lab** (`NEEDEDINFO.md`): DNS + Resend key → flip real email on;
   official norm limits → enter in `/admin/parametres`; real ICE/RC/RIB + logo
   → enter in `/admin/entreprise`; legacy export → import; real user list →
   create accounts, set `NEXT_PUBLIC_DEMO_MODE=false`.
3. Then: **recette** with the lab's team, formation, go-live.

Extensions (Phases 6–8: Achat/Stock, Qualité, Portail client) start after
go-live, each with its own scoping — see PLAN.

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
- [ ] **Upgrade the invoice PDF to server-side rendering** (still a screenshot)
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
- [ ] 🔒 VPS: first deploy, HTTPS, cron backup, **tested restore**, full
      TESTPLAN pass on the deployed system
- [ ] 🔒 Legacy data import (waits on the lab's export)

## Extensions — client meeting 2026-07-28 (after core; re-cost/replan)
Detail in PLAN "Extension modules"; scope note in HANDOFF §10.
- [ ] Phase 6 — Achat & Stock: suppliers, payment-term alerts, inventory
- [ ] Phase 7 (later) — Qualité: métrologie, EIL, monitoring temp.
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

## Session Log
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
