# PLAN.md — Qualilab LIMS production roadmap

> The phased build plan to take the approved prototype to the full production
> LIMS. Scope is fixed by `finalversion.xlsx`. Live status lives in
> `PROGRESS.md` — **this file is the map, PROGRESS is the odometer.**

---

## Delivery goal

One web app, three blocks (LIMS · Facturation · Module préleveur), **7 roles**,
**6 tracked sample statuses**, official PDF reports auto-emailed to clients,
invoices generated from validated samples, full admin configuration, complete
audit trail — running on the VPS with HTTPS + daily backups.

## The sample lifecycle (the spine of the whole system)

```
PRELEVE → RECU → EN_ANALYSE → RESULTATS_SAISIS → VALIDE → RAPPORT_ENVOYE
  Préleveur  Réceptionniste  Technicien  Technicien   Validateur   System(auto)
```
Every transition is **timestamped, attributed, and audited.** No sample may skip
a step or move backward without a recorded reason. Enforced **server-side.**

## The 7 roles (target)

`PRELEVEUR` · `RECEPTIONNISTE` · `TECHNICIEN` · `VALIDATEUR` ·
`GESTIONNAIRE` (commercial) · `COMPTABLE` · `ADMIN`. Each sees only its own
screens and data; enforced by the central guard on every page and route.

## Target data model (additions to today's 8 tables)

| Change | Shape (indicative — confirm against Prisma docs) |
|---|---|
| `Role` enum → 7 values | add RECEPTIONNISTE, TECHNICIEN, VALIDATEUR, GESTIONNAIRE, COMPTABLE |
| **`Result`** (new) | `sampleId`, `parameterId`, `value`, `unit`, `threshold`, `conform: Boolean`, `workStatus`(EN_COURS/TERMINE/ANOMALIE), `note`, `enteredById`, timestamps |
| **`Report`** (new) | `sampleId`, `pdfPath/blob`, `conclusion`, `technicianId`, `validatorId`, `validatedAt`, `sentStatus`, `sentAt`, `sentTo` |
| **`AuditLog`** (new) | `actorId`, `action`, `entity`, `entityId`, `metadata`(JSON), `createdAt` |
| **`EmailLog`** (new) | `reportId`, `to`, `subject`, `status`, `providerId`, `error?`, `createdAt` |
| `Sample` fields (new) | `receivedById?`, `technicianId?`, `validatedById?`, `rejectionReason?`, `receivedAt?`, plus status transitions |
| Config (new, optional) | `DocumentTemplate` (report/email templates) if admin editing is in scope |

All changes go through `prisma/schema.prisma` → migration → regenerate. Keep the
seed (`prisma/seed.ts`) in step so a fresh DB always demos end-to-end.

## Cross-cutting foundations (build once, use everywhere)

- **`requireRole(...roles)` / `requireSession()`** central guard in `lib/auth.ts`
  — every page + route goes through it. (Retire the scattered inline checks.)
- **`logAudit(actor, action, entity, id, meta)`** helper — called from every
  mutation. Non-negotiable for traceability.
- **Status state-machine** helper — the only place allowed to change
  `Sample.status`; rejects illegal transitions.
- **Server-side PDF renderer** (Playwright/Chromium) rendering branded HTML.
- **Email sender** (Resend) with `EmailLog` write + resend support.

---

## Phases (each ends in a demo + client validation)

### Phase 1 — Foundation & roles
- **Adopt Better Auth** (task 1): install, `prismaAdapter(prisma,{provider:"mysql"})`,
  email/password + admin plugin, `role` as an additional user field; mount the
  handler at `/api/auth/[...all]`; generate + migrate its tables; reconcile the
  existing `User` relations (`Sample.userId`, `Invoice.createdById`); rewrite
  login/logout + `getSession` call-sites; update the seed to create users via
  Better Auth. (Spike GREEN — see HANDOFF decision log.)
- Central auth guard (`requireRole`) on top of the Better Auth session + refactor
  existing pages/routes onto it (retire scattered inline checks).
- Extend Prisma: 7 roles + `Result`/`Report`/`AuditLog`/`EmailLog` + Sample
  actor fields → migration → regenerate → update seed.
- `logAudit` helper + status state-machine helper.
- 7 role dashboard shells (each role logs into its own space).
- **Demo:** every profile logs in and lands on its own dashboard.

### Phase 2 — LIMS core (the heart)
- **Reception & conformity:** queue of `PRELEVE`, quick-verify screen, mark
  conform/non-conform (with reason), assign to a technician → `RECU`.
- **Result entry (technician):** their assigned samples; per-parameter value /
  unit / threshold / conformity; work status incl. anomaly; save-in-progress;
  submit when complete → `EN_ANALYSE` → `RESULTATS_SAISIS`.
- **Validation (validateur):** review results vs thresholds + history; validate
  → `VALIDE`; reject with comment → back to technician.
- Full audit on every transition; state machine enforced.
- **Demo:** a sample travels `PRELEVE → VALIDE` through the right hands.

### Phase 3 — Reports & email
- **Official PDF report** (server-side Playwright, branded HTML): identity, code,
  client, place/date, préleveur, results table w/ thresholds + conformity,
  conclusion, technician + validator signatures, validation date. Archived +
  re-downloadable.
- **Auto email** to client on validation → `RAPPORT_ENVOYE`; `EmailLog` +
  manual resend (gestionnaire).
- **Demo:** validating a sample emails the client a real PDF; it's re-sendable.

### Phase 4 — Clients, invoice link, administration
- **Clients:** full CRUD + archive + **360° view** (samples, reports, invoices,
  payments); reserved to gestionnaire + admin.
- **Invoicing from validated samples:** validated analyses become invoice lines
  at catalog prices (wire onto existing invoice plumbing); keep free lines.
- **Admin config:** users & roles (create, disable, reset password), analysis
  parameters (per domain, units, thresholds), service catalog, document
  templates, company coordinates, audit-log viewer.
- **Demo:** lab is autonomous — configure everything, invoice from a validated
  sample.

### Phase 5 — Production hardening
- Per-role dashboards + **direction view** (samples by status, avg lead time,
  activity by domain, billed/collected) + global search.
- Domain + HTTPS, **daily DB backups** + tested restore, security pass.
- End-to-end tests, data migration/import, documentation (user-by-role, admin,
  ops), training.
- **Demo:** official go-live.

---

## Definition of Done (per phase)

A phase is done only when: code meets `CODE_QUALITY.md` · `npm run build` passes ·
authorization verified server-side for every new surface · every mutation
audited · the demo flow runs end-to-end on the VPS · PROGRESS.md + HANDOFF.md
updated · committed.
