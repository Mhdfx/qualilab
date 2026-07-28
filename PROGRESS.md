# PROGRESS.md — live tracker

> The odometer. **Update this every session** (any platform). Tick items, move
> the NEXT ACTION line, add a Session Log entry. This is the first thing the
> next AI reads to know where to start.

---

## ▶ NEXT ACTION

**HOLD — do not start coding until the user explicitly says go.** When cleared:
Phase 1, task 1 — adopt Better Auth with the **username plugin** (username login,
not email) + admin plugin + `role` field. Baseline build is green and the
compatibility spike passed (Next 16 + Prisma 7 + custom client path + MySQL +
MariaDB driver adapter all supported — see HANDOFF decision log). Install
`better-auth`, wire `prismaAdapter(prisma,{provider:"mysql"})` + admin plugin +
`role` field, mount `/api/auth/[...all]`, generate + migrate its tables,
reconcile existing `User` relations, then rebuild. After that: central
`requireRole()` guard, then extend the `Role` enum to 7.

---

## Legend
`[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked (note why)

## Phase 0 — Groundwork
- [x] Analyze prototype vs client scope (`finalversion.xlsx`)
- [x] Lock the stack (see HANDOFF §8 decision log)
- [x] Write cross-platform docs (AGENTS, HANDOFF, PLAN, PROGRESS, CODE_QUALITY)
- [x] `npm run build` passes on current Next 16 code (clean baseline, exit 0)
- [x] Better Auth compatibility spike — GREEN (Next 16 + Prisma 7 + MySQL + driver adapter)
- [ ] Confirm local DB connectivity (`npm run db:check`) and seed works

## Phase 1 — Foundation & roles
- [ ] **Adopt Better Auth**: install + config (prismaAdapter mysql, admin plugin, `role` field)
- [ ] Mount `/api/auth/[...all]`; generate + migrate Better Auth tables
- [ ] Reconcile existing `User` relations (`Sample.userId`, `Invoice.createdById`)
- [ ] Rewrite login/logout + `getSession` call-sites; seed users via Better Auth
- [ ] Central guard `requireRole()` / `requireSession()` on top of Better Auth session
- [ ] Refactor existing admin + préleveur layouts and all API routes onto it
- [ ] Extend `Role` enum to 7 roles
- [ ] Add models: `Result`, `Report`, `AuditLog`, `EmailLog`
- [ ] Add `Sample` actor fields (`receivedById`, `technicianId`, `validatedById`, `rejectionReason`, `receivedAt`)
- [ ] Migration created + applied; Prisma client regenerated
- [ ] Update `prisma/seed.ts` for 7 demo users + richer sample data
- [ ] `logAudit()` helper
- [ ] Status state-machine helper (only legal transitions)
- [ ] 7 role dashboard shells + routing
- [ ] **Demo:** each role logs into its own dashboard

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
- [ ] **Confirm with client:** double-validation rule · code/serial format ·
      calc methods · legacy data formats · stock granularity + `MAGASINIER` role

---

## Session Log
Newest first. One line per session: date · platform · what changed · next.

- **2026-07-27 · Claude Code** · Analyzed prototype against client scope; locked
  stack; created cross-platform doc system (AGENTS, CLAUDE, HANDOFF, PLAN,
  PROGRESS, CODE_QUALITY). Baseline `npm run build` GREEN. Ran Better Auth
  compatibility spike → GREEN; decision logged, adopting it as Phase 1 task 1.
  Next: install + integrate Better Auth.
