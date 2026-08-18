# HANDOFF.md — Qualilab LIMS

> **The canonical takeover document.** Behavior, intent, architecture, and the
> "where do I change X" map. Read after `AGENTS.md`. **Keep this current** — it
> is what lets any AI on any platform continue without archaeology.
>
> Last updated: **2026-08-18** · Branch: `master` · Remote:
> `github.com/Mhdfx/qualilab.git`

---

## 1. Current state (one screen)

| Block | Module | State |
|---|---|---|
| Préleveur | Field intake (mobile 3-step, param by domain, history) | ✅ **Built & client-approved** |
| Facturation | Manual invoice: catalog, `FAC-YYYY-NNNN`, 20% VAT, statuses, PDF export | ✅ **Built & client-approved** |
| Auth | **Better Auth** (username + admin plugins), 7 roles + `CLIENT` | ✅ **Phase 1 done** |
| Authorization | Central `requireRole()` / `requireApiRole()` on every page + route | ✅ **Phase 1 done** |
| Role spaces | 7 dashboards with live indicators | ✅ **Phase 1 done** |
| Data model | 13 tables incl. `Result`/`Report`/`AuditLog`/`EmailLog` | ✅ **Phase 1 done** |
| Foundations | `logAudit()`, sample status state machine | ✅ **Phase 1 done** |
| Clients | list API only | ⚠️ **Read-only**, no CRUD / 360 |
| LIMS core | reception, results, validation, report, email | ❌ **Phase 2–3** |
| Infra | VPS + PM2 + `/api/health` + watchdog/autostart/backup scripts | ✅ **Working** (prototype) |

**Bottom line:** the foundation (auth, roles, guards, data model, audit, state
machine, dashboards) is in place. What remains is the workflow itself —
everything between *"sample arrives at the lab"* and *"report emailed to
client"*. Full breakdown in `PLAN.md`; live tracker in `PROGRESS.md`; browser
test path in `TESTPLAN.md`.

## 2. Architecture map

```
src/
  app/
    layout.tsx, page.tsx (role-aware redirect), globals.css, login/
    api/
      auth/[...all]/           ★ Better Auth handler (sign-in/out, session, admin)
      samples/                 GET (role-scoped) · POST (PRELEVEUR creates)
      clients/  parameters/  lab-services/   read endpoints
      invoices/  invoices/[id]/   invoice CRUD (COMPTABLE + ADMIN)
      health/                  liveness probe for PM2/watchdog
    preleveur/                 role space: dashboard + nouveau (3-step)
    reception/                 role space (Phase 2 screens to come)
    technicien/                role space (Phase 2 screens to come)
    validation/                role space (Phase 2 screens to come)
    commercial/                role space (Phase 4 screens to come)
    comptabilite/              role space (Phase 4 screens to come)
    admin/                     role space: dashboard + factures (list/new/[id])
  components/
    layout/  AdminShell, PreleveurShell, RoleShells.tsx (5 role shells),
             DashboardShell, Sidebar, admin-nav / preleveur-nav / role-navs.ts
    ui/      Card, StatCard, StatusBadge, TypeBadge, StepIndicator, PageHeader, LoadingState
    RoleDashboard.tsx          shared role landing page (stats + mission + next steps)
    + feature components (SampleTable, SampleDetailPanel, FactureDetail, ...)
  lib/
    auth-server.ts     ★ Better Auth instance (username + admin plugins, trustedOrigins)
    auth.ts            ★ getSession + requireRole / requireApiRole guards
    auth-client.ts     client-side authClient (signIn/signOut)
    roles.ts           ★ ROLES, ROLE_LABELS, ROLE_HOME, getDashboardPath
    audit.ts           ★ logAudit() — call on every mutation
    sample-status.ts   ★ canTransition() state machine + status labels
    prisma.ts          Prisma client (MariaDB adapter, singleton)
    database-url.ts    parse DATABASE_URL → mariadb config
    company.ts         ★ single source of truth for company/legal identity
    sample-code.ts     QL-YYYY-NNNNN generator
    invoice-number.ts / invoice-math.ts / invoice-types.ts / lab-services.ts / labels.ts
    number-to-words-fr.ts   amount-in-words (FR) for invoices
    download-invoice-pdf.ts  ⚠️ CLIENT-side screenshot PDF (invoice demo only)
  generated/prisma/    ★ generated Prisma client — DO NOT edit, gitignored
prisma/
  schema.prisma  ·  seed.ts (7 role users)  ·  migrations/ (6)
scripts/         VPS ops: deploy, wait-for-db, health-watchdog, setup-autostart, setup-database, start-production, vps-setup, check-db
```

No import cycles. Path alias: `@/*` → `src/*`.

## 3. Auth & authorization — **the pattern to follow**

**Authentication = Better Auth. Authorization = our guard.** Never mix them.

- **Instance:** `src/lib/auth-server.ts` — Better Auth with the **username**
  plugin (lab staff sign in with `admin`, `tech1`, … — no email needed; a
  synthetic `<username>@qualilab.local` address is stored and never mailed) and
  the **admin** plugin (`adminRoles: ["ADMIN"]`) for user management.
  Public sign-up is disabled: accounts are provisioned by the admin.
- **CSRF/origins:** `trustedOrigins` — in production it reads
  `BETTER_AUTH_TRUSTED_ORIGINS`; in development any localhost port is accepted.
  ⚠️ Set `BETTER_AUTH_URL` + `BETTER_AUTH_TRUSTED_ORIGINS` on the VPS or
  sign-in fails with `INVALID_ORIGIN`.
- **Session:** `getSession()` in `src/lib/auth.ts` returns
  `{ id, username, name, role }` or `null`.

**Guards — use these everywhere, no inline role checks:**

```ts
// page / layout (server component): returns session or redirects
const session = await requireRole("TECHNICIEN", "ADMIN");

// route handler: returns session OR the response to return as-is
const guard = await requireApiRole("COMPTABLE", "ADMIN");
if (guard instanceof NextResponse) return guard;
```

Wrong role on a page → redirected to **their own** dashboard (never a dead end).
API → `401 Non autorisé.` when signed out, `403 Accès refusé.` when the role is
wrong. Role → landing page mapping lives in `src/lib/roles.ts` (`ROLE_HOME`).

**Client components** use `authClient` from `src/lib/auth-client.ts`
(`signIn.username(...)`, `signOut()`).

## 3b. Traceability & workflow foundations

- **`logAudit({actorId, action, entity, entityId, metadata})`** (`lib/audit.ts`)
  — call on **every** mutation. Never lets an audit failure break the action.
- **`canTransition(from, to, role, reason?)`** (`lib/sample-status.ts`) — the
  only place allowed to authorise a `Sample.status` change. Encodes who may do
  what, and requires a reason for the validator's rejection (backwards move).
  Use it before every status write, then `logAudit()`.

## 4. Data model

**Auth (Better Auth):** `User` · `Session` · `Account` (credentials) ·
`Verification`.
`User` carries `username`, `role` (string, mirrors the `Role` enum), `banned`.

**LIMS:** `Client` · `AnalysisParameter`(category, unit, threshold) ·
`LabService` · `Sample` · `SampleParameter`(join) · `Result` · `Report` ·
`EmailLog` · `AuditLog` · `Invoice` · `InvoiceItem`.

`Sample` now carries the full workflow: `controlCode` + `serialNumber`
(assigned **at reception**, never shown to the préleveur), `receivedById` /
`receivedAt` / `conformity` / `conformityNote`, `technicianId` / `assignedAt`,
`validatedById` / `validatedAt` / `rejectionReason`.

Enums: `Role`(7 + `CLIENT`) · `SampleType`(ALIMENTAIRE|EAU|AMBIANCE) ·
`SampleStatus`(6) · `ResultWorkStatus`(EN_COURS|TERMINE|ANOMALIE) ·
`ReportSendStatus` · `InvoiceStatus`.

## 5. "Where do I change X?"

| I want to change… | Go to |
|---|---|
| Company name / ICE / RC / RIB / IBAN / bank | `src/lib/company.ts` (never hardcode elsewhere) |
| Sample code format | `src/lib/sample-code.ts` |
| Invoice number format | `src/lib/invoice-number.ts` |
| VAT / invoice totals math | `src/lib/invoice-math.ts` |
| Amount-in-words wording | `src/lib/number-to-words-fr.ts` |
| Analysis parameters / services / prices | `prisma/seed.ts` (and Admin config screen once built) |
| Login / session behaviour | `src/lib/auth-server.ts` (Better Auth config) |
| Access rules for a page or route | `requireRole` / `requireApiRole` in `src/lib/auth.ts` |
| Add a role / change a role's landing page | `src/lib/roles.ts` + Prisma `Role` enum |
| Who may move a sample to a status | `src/lib/sample-status.ts` (`TRANSITIONS`) |
| What gets audited | `logAudit()` calls + `src/lib/audit.ts` |
| Add a DB field/table | `prisma/schema.prisma` → `npm run db:migrate` → client regenerates |
| Nav items per role | `src/components/layout/admin-nav.ts`, `preleveur-nav.ts`, `role-navs.ts` |
| A role's dashboard content | `src/app/<role>/page.tsx` + `components/RoleDashboard.tsx` |
| Shared UI look | `src/components/ui/*` + design skills |
| Status/type badge labels | `src/lib/labels.ts`, `components/ui/StatusBadge.tsx`, `TypeBadge.tsx` |
| PM2 / restart behavior | `ecosystem.config.cjs`, `scripts/start-production.sh` |
| Health probe | `src/app/api/health/route.ts` |

## 6. Environment variables

| Var | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/db` | parsed by `database-url.ts` |
| `AUTH_SECRET` | Better Auth signing secret | ≥32 chars; `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public origin of the app | **Required in production** (e.g. `https://app.qualilab.ma`). Unset in dev |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated origins allowed to call auth (CSRF) | **Required in production**; dev trusts any localhost |
| `NODE_ENV` | `development` / `production` | |
| `PORT` | prod port (default 3000) | |
| `AUTH_COOKIE_SECURE` | set `false` only for plain-HTTP testing | HTTPS in prod |

**To add later:** `RESEND_API_KEY` + `EMAIL_FROM` (Phase 3 email), and any
Playwright/Chromium path config for server-side PDF. Log new vars here **and** in
`.env.example` / `.env.production.example` the moment they're introduced.

## 7. Deployment (VPS, current)

`build → prisma generate → next build`; served by PM2 (`ecosystem.config.cjs`,
fork mode, autorestart, 512M cap). `scripts/` cover DB wait, watchdog,
autostart-on-reboot, DB setup. `/api/health` is the liveness probe. Client's
final hosting is TBD — **we build and test on our VPS for now.**

## 8. Decision log (append-only — never rewrite history)

| Date | Decision | Why |
|---|---|---|
| 2026-07-27 | Keep **MySQL/MariaDB + Prisma** (not Postgres) | Already working on VPS; low value in migrating |
| 2026-07-27 | Stay on **Next.js 16.2.9** | Code already written for it; downgrading risks breakage. Mitigate AI risk via `node_modules/next/dist/docs/` |
| 2026-07-27 | ~~Keep custom session auth~~ → **superseded** (see next row) | — |
| 2026-07-27 | **Adopt Better Auth** for authentication + user/session management (app-layer, not Supabase RLS) | Production scope needs admin user-mgmt, password reset, disable-on-role — vetted library beats hand-rolled for sensitive data. Spike GREEN: Next 16 + Prisma 7 + custom client path + MySQL + our MariaDB driver adapter all supported. Baseline `npm run build` passes. Authorization (7-role `requireRole`) still ours on top |
| 2026-07-27 | **Username-based login** (Better Auth username plugin), not email | Lab staff/field techs log in with usernames (`admin`, `pre1`); no personal emails required. Use username + admin plugins, `role` as additional user field |
| 2026-07-28 | **Scope expanded** — client meeting additions (see PLAN "Extension modules" + §10 below) | Client added Purchasing/Stock, Quality (metrology/EIL/monitoring), Client portal, Réclamations, plus workflow changes (numbering at reception, auto-calc results, bench sheet, admin silent report edit, double validation, legacy data migration). Sequenced after core Phases 1–5; Quality + Réclamations are a "later track" |
| 2026-07-28 | Sample **control code + serial generated at RECEPTION**, not by préleveur | Client requirement. Moves `sample-code.ts` generation from the field POST to reception; préleveur never sees the number. Add distinct `controlCode` + `serialNumber` fields |
| 2026-08-18 | **Double validation confirmed: EVERY sample needs BOTH Validateur AND Admin** approval before the report is emitted | Client answer. Design: VALIDATEUR performs technical validation, then ADMIN gives final approval -> only then `VALIDE` + report/email. Rejection by either returns the sample to the technician with a reason |
| 2026-08-18 | **Dual numbering, blind-analysis design** | Client answer: each sample carries 2 numbers assigned at reception — `controlCode` (official traceable, sequential) + `serialNumber` (**blind analysis code, crypto-random, non-sequential**). Purpose: the préleveur/sample collector can never know or predict which number a sample gets, so results cannot be targeted or faked. Format is ours to design; security requirement is the client's |
| 2026-08-18 | **Analysis parameters/thresholds: default to standard Moroccan norms (NM)** | Client will provide the official per-parameter methods/formulas mid-project; until then seed units/thresholds from Moroccan standards (NM food-micro / drinking-water norms) |
| 2026-08-18 | **Legacy data: import-only, method decided when the company hands over the data** | We only fetch/import what they provide (clients, reports, invoices); no live integration with old systems |
| 2026-08-18 | **Stock gets its own role (`MAGASINIER`)** | Client confirms a dedicated person handles stock/purchasing. Add the role + enum value at Phase 6 (documented reserve, like `CLIENT`) |
| 2026-08-18 | **Admin silent report edit: NO internal log** ("no for now") | Client declined the optional discreet safety-net log. Zero trace, scoped strictly to ADMIN + report edits |
| 2026-08-18 | **Silent-edit feature: BUILD it** (user decision) | Ambiguity resolved: the feature ships in Phase 3 as requested. If the client later drops it, removal is trivial (delete the edit route + button); retrofitting it after delivery would not be. Keep it isolated behind one route + one guard so it stays cheap to remove |
| 2026-08-18 | **Client portal confirmed** (Phase 8): `CLIENT` accounts are **created/managed by the ADMIN** (no self-signup); each client sees the status and results/reports of their own samples only | Client answer. `CLIENT` role already reserved in `lib/roles.ts` |
| 2026-07-27 | **Server-side PDF via Playwright** for official reports | Pixel-perfect, selectable text, multi-page, reuses design-skill HTML. Client jsPDF stays for invoice demo only |
| 2026-07-27 | **Resend** for transactional email | Best deliverability; matches spec "service dédié" |
| 2026-07-27 | UI via **installed design skills**, top-tier per screen | Client-facing pro tool; brand-consistent |

## 9. Known debt / watch-outs

- ~~Role checks hardcoded per file~~ → **resolved:** everything now goes through
  `requireRole` / `requireApiRole`. Keep it that way; never re-introduce an
  inline `session.role === "..."` check in a page or route.
- Invoice PDF is a flattened client-side screenshot (no text, single page) — do
  **not** reuse it for official analysis reports.
- Sample status still only ever reaches `PRELEVE` in practice — Phase 2 wires the
  transitions. The state machine (`canTransition`) already exists: **use it**,
  never write `status` directly.
- `bcryptjs` and `jose` are still in package.json but unused by the app since
  Better Auth took over hashing/sessions — remove when convenient.
- `src/generated/prisma/` is gitignored — regenerated by `prisma generate` on
  install/build. Never edit or import it as if hand-written source.
- **Sample numbering moves to reception** (client 28-07): don't wire the
  préleveur POST to generate the official code anymore — see §10.
- **Admin silent report edit** (client 28-07) intentionally bypasses the audit
  trail for ADMIN only. This is a deliberate client choice; keep it scoped to
  ADMIN + report edits and nothing else.

## 10. Scope additions — client meeting 2026-07-28

New requests on top of the signed `finalversion.xlsx` scope (full detail in
PLAN "Extension modules"; also captured in the Excel sheet **"Demandes v2"** and
the client response PDF `reponse-demandes-client-2026-07-28.pdf`):

| # | Request | Where it lands |
|---|---|---|
| 1 | Legacy data migration (clients, reports, invoices) | Phase 5 |
| 2 | **Achat & Stock** module + supplier payment alerts | Phase 6 (new) |
| 3 | Editable invoice product/report designations | Phase 4 |
| 4 | **Quality**: métrologie / EIL / monitoring (temp.) | Phase 7 (later) |
| 5 | Auto-calculated results + correction | Phase 2 |
| 6 | Bench sheet (feuille de paillasse) by date + notes | Phase 2/3 |
| 7 | Admin silent report edit (no trace) | Phase 3 — ⚠️ traceability trade-off |
| 8 | Control code + serial at **reception**, hidden from préleveur | Phase 2 — workflow change |
| 9 | Double validation (technique + admin) — *confirm* | Phase 2 |
| 10 | **Client portal** (8th role `CLIENT`) | Phase 8 (later) |
| 11 | **Réclamations** tab (complaints) | Phase 8 (later) |

**Client answers received 2026-08-18** (full decisions in the section 8 log):
double validation = both Validateur AND Admin on every sample (#9) - dual
numbering with a blind crypto-random serial, format ours to design (#8) -
default thresholds to Moroccan NM norms, official formulas arrive mid-project
(#5) - legacy data = import-only once handed over (#1) - dedicated `MAGASINIER`
role for stock (#2) - silent admin edit stays with NO internal log (#7) -
client portal confirmed, admin-managed accounts (#10).
**Still open:** exact per-parameter formulas (mid-project) - legacy data files
(when provided) - Quality-module equipment list & EIL perimeter (Phase 7).
