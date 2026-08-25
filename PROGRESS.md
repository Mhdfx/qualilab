# PROGRESS.md — live tracker

> The odometer. **Update this every session** (any platform). Tick items, move
> the NEXT ACTION line, add a Session Log entry. This is the first thing the
> next AI reads to know where to start.

---

## ▶ NEXT ACTION

**Phase 2 · C1 (Réception & numérotation aveugle) is complete and verified
(2026-08-23).** Queue, verify screen, conformity, technician assignment and the
blind numbering all work end to end; build + lint pass; browser-tested (see
`TESTPLAN.md` C1–C4, C7, C8).

Next: **Phase 2 · C2 — Saisie des résultats (technicien).** Add the schema the
contamination alerts need (`Result.numericValue`, `AnalysisParameter.alertOnExceed`
+ `limitValue`, `Sample.produit` + `numeroLot`, `ClientEmail`, `EmailLog.type`),
then build the per-parameter entry sheet: value / unit / threshold / conformity,
work status incl. anomaly, save-in-progress, and submit
(`RECU → EN_ANALYSE → RESULTATS_SAISIS`) through `canTransition()` + `logAudit()`.
Accept scientific notation as the lab writes it (`8,9.10²`) and store it
numerically.

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

## Phase 2 — LIMS core
- [x] **Reception & conformity + assign to technician (`PRELEVE → RECU`)** ✅ 2026-08-23
  - [x] Blind numbering: sequential `controlCode` + crypto-random `serialNumber`
  - [x] `sample-select.ts` — numbering excluded from the préleveur's payload at the query
  - [x] Reception API with state machine + audit + concurrency guards (P2025/P2002)
  - [x] Queue, verify screen, conformity (+ motif), technician picker with workload
  - [x] Success panel showing both numbers, copiable, for labelling the sample
- [ ] **[alerts]** schema prep: `Result.numericValue`, `AnalysisParameter.alertOnExceed` + `limitValue`, `Sample.produit` + `numeroLot`, `ClientEmail` model, `EmailLog.type`
- [ ] Technician result entry (per-parameter) + save-in-progress
- [ ] Submit results (`EN_ANALYSE → RESULTATS_SAISIS`)
- [ ] Validation / rejection (`→ VALIDE` or back to technician) — **double validation**
- [ ] Audit on every transition; state machine enforced server-side
- [ ] **Demo:** sample travels `PRELEVE → VALIDE`

## Phase 3 — Reports & email
- [ ] Server-side PDF report (Playwright, branded HTML) + archive + re-download
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
