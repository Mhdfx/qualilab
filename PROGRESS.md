# PROGRESS.md — live tracker

> The odometer. **Update this every session** (any platform). Tick items, move
> the NEXT ACTION line, add a Session Log entry. This is the first thing the
> next AI reads to know where to start.

---

## ▶ NEXT ACTION

**Phase 1 is complete and verified (2026-07-29).** Better Auth (username login),
the central `requireRole()` guard, the 7 roles, the extended data model and the
7 role dashboards are all live; build + lint pass; browser-tested (see
`TESTPLAN.md` Checkpoints A & B).

Next: **Phase 2, task 1 — Reception & conformity.** Build the `/reception`
queue of samples at status `PRELEVE`, the quick-verify screen, conformity
(with reason), assignment to a technician, and — per the client's 28-07 request
— generate the official **control code + serial number at reception** (never
visible to the préleveur). Use the `canTransition()` state machine for
`PRELEVE → RECU` and call `logAudit()` on the change.

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
- [ ] Reception & conformity + assign to technician (`PRELEVE → RECU`)
- [ ] Technician result entry (per-parameter) + save-in-progress
- [ ] Submit results (`EN_ANALYSE → RESULTATS_SAISIS`)
- [ ] Validation / rejection (`→ VALIDE` or back to technician)
- [ ] Audit on every transition; state machine enforced server-side
- [ ] **Demo:** sample travels `PRELEVE → VALIDE`

## Phase 3 — Reports & email
- [ ] Server-side PDF report (Playwright, branded HTML) + archive + re-download
- [ ] Auto email on validation (`→ RAPPORT_ENVOYE`) + `EmailLog` + resend
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
