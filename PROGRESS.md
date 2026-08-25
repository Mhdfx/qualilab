# PROGRESS.md — live tracker

> The odometer. **Update this every session** (any platform). Tick items, move
> the NEXT ACTION line, add a Session Log entry. This is the first thing the
> next AI reads to know where to start.

---

## ▶ NEXT ACTION

**Phase 3 in progress.** The **official PDF report** is done and verified: the
admin's approval creates the report record (`RAP-YYYY-NNNNN`) with the names
frozen, and the PDF is rendered on demand by Chromium — branded, selectable
text, multi-page, three signatures. Build + lint pass.

Next, in order:
1. **Download button in the UI** — on the validation detail and, later, the
   client 360 view. The route exists (`GET /api/samples/[id]/report`).
2. **Automatic send** to the client's `ClientEmail` list (Resend) →
   `RAPPORT_ENVOYE`, logged in `EmailLog`, resendable.
   ⚠️ needs DNS access — see `NEEDEDINFO.md` item 2.
3. **Contamination alerts** — grouped mail per client for sensitive parameters
   over their limit. ⚠️ needs the official limits — `NEEDEDINFO.md` item 1.
4. **Feuille de paillasse** (printable by date) and the admin's silent edit.

Items 1 and 4 are not blocked. Do those first, then 2 and 3 when the lab
answers.

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

## Phase 3 — Reports & email
- [x] **Server-side PDF report** ✅ 2026-08-25 — `playwright-core` drives a
      browser already on the machine (no 150 MB download per environment);
      `RAP-YYYY-NNNNN`; rendered on demand from the approval snapshot, so there
      is no file to store or back up and a re-download is always identical
- [ ] Download button in the UI (route exists)
- [ ] Auto email on validation (`→ RAPPORT_ENVOYE`) + `EmailLog` + resend
- [ ] **[client 18-08] Alertes de contamination automatiques** (E. coli /
      Salmonelle / Listeria over limit → grouped mail to the client's address
      list + lab in copy, Produit/Site/Date/Lot/Germe/Résultat/Limite table)
- [ ] **[blocked-ish]** Resend needs DNS verification of
      `qualilabinternational.com` — client must add the DNS records
- [ ] **Demo:** validation emails a real PDF to the client

## Phase 4 — Clients, invoice link, admin
- [ ] Client CRUD + archive + 360° view
- [ ] Invoice generated from validated samples
- [ ] Admin: users/roles, parameters, catalog, templates, company, audit viewer
- [ ] **Demo:** configure everything + invoice from a validated sample

## Phase 5 — Production hardening
- [ ] Per-role dashboards + direction view + global search
- [ ] Domain + HTTPS + daily backups + tested restore
- [ ] E2E tests, docs (user/admin/ops), training
- [ ] **[client 28-07]** Legacy data migration (clients, reports, invoices)
- [ ] **Demo:** go-live

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
