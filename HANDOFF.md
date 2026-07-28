# HANDOFF.md — Qualilab LIMS

> **The canonical takeover document.** Behavior, intent, architecture, and the
> "where do I change X" map. Read after `AGENTS.md`. **Keep this current** — it
> is what lets any AI on any platform continue without archaeology.
>
> Last updated: **2026-07-27** · Branch: `master` · Remote:
> `github.com/Mhdfx/qualilab.git`

---

## 1. Current state (one screen)

| Block | Module | State |
|---|---|---|
| Préleveur | Field intake (mobile 3-step, auto code `QL-YYYY-NNNNN`, param by domain, history) | ✅ **Built & client-approved** |
| Facturation | Manual invoice: catalog, `FAC-YYYY-NNNN`, 20% VAT, statuses, PDF export, amount-in-words | ✅ **Built & client-approved** |
| Auth | `jose` JWT signed cookie + bcrypt | ⚠️ **Only 2 roles** (`PRELEVEUR`, `ADMIN`) |
| Clients | list API only | ⚠️ **Read-only**, no CRUD / 360 |
| LIMS core | reception, results, validation, report, email | ❌ **Not built** |
| Data model | 8 tables | ❌ No `Result` / `Report` / `AuditLog` / `EmailLog`; only `PRELEVE` status ever set |
| Infra | VPS + PM2 + `/api/health` + watchdog/autostart/backup scripts | ✅ **Working** (prototype) |

**Bottom line:** everything between *"sample arrives at the lab"* and *"report
emailed to client"* is unbuilt. That is the production project. Full breakdown in
`PLAN.md`; live tracker in `PROGRESS.md`.

## 2. Architecture map

```
src/
  app/
    layout.tsx, page.tsx, globals.css, login/
    api/
      auth/{login,logout}/     session cookie in/out
      samples/                 GET (role-scoped) · POST (PRELEVEUR creates)
      clients/  parameters/  lab-services/   read endpoints
      invoices/  invoices/[id]/   invoice CRUD
      health/                  liveness probe for PM2/watchdog
    preleveur/                 role space: dashboard + nouveau (3-step)
    admin/                     role space: dashboard + factures (list/new/[id])
  components/
    layout/  (AdminShell, PreleveurShell, Sidebar, *-nav.ts, nav-types.ts)
    ui/      (Card, StatCard, StatusBadge, TypeBadge, StepIndicator, PageHeader, LoadingState)
    + feature components (SampleTable, SampleDetailPanel, FactureDetail, ...)
  lib/
    auth.ts            session: hash/verify, createSession, getSession, clearSession, getDashboardPath
    prisma.ts          Prisma client (MariaDB adapter, singleton)
    database-url.ts    parse DATABASE_URL → mariadb config
    company.ts         ★ single source of truth for company/legal identity
    sample-code.ts     QL-YYYY-NNNNN generator
    invoice-number.ts  FAC-YYYY-NNNN generator
    invoice-math.ts / invoice-types.ts / lab-services.ts / labels.ts
    number-to-words-fr.ts   amount-in-words (FR) for invoices
    download-invoice-pdf.ts  ⚠️ CLIENT-side screenshot PDF (invoice demo only)
  generated/prisma/    ★ generated Prisma client — DO NOT edit, gitignored
prisma/
  schema.prisma  ·  seed.ts  ·  migrations/ (5 so far)
scripts/         VPS ops: deploy, wait-for-db, health-watchdog, setup-autostart, setup-database, start-production, vps-setup, check-db
```

No import cycles. Path alias: `@/*` → `src/*`.

## 3. Auth & authorization — the pattern to extend

Current pattern (works for 2 roles, must generalize to 7):

- **Session:** `src/lib/auth.ts` — `getSession()` reads the `qualilab_session`
  signed cookie and returns `{ id, username, name, role }` or `null`.
- **Page/layout guard:** each role layout calls `getSession()` and `redirect()`s
  on wrong/missing role. Example `src/app/admin/layout.tsx`:
  `if (!session) redirect("/login"); if (session.role !== "ADMIN") redirect("/preleveur");`
- **Route guard:** each route handler re-checks inline, e.g.
  `if (!session || session.role !== "PRELEVEUR") return 401;`

⚠️ **Debt:** role checks are hardcoded string comparisons scattered per file.
Before Phase 1 grows this to 7 roles, introduce **one central guard** in
`src/lib/auth.ts` (e.g. `requireRole(...roles)` / `requireSession()`) returning
the session or redirecting/401, and route every page and API through it. This is
the #1 correctness+security lever — do it before adding roles.

## 4. Data model (current) — see PLAN.md §Target model for what's added

`User`(role: PRELEVEUR|ADMIN) · `Client` · `AnalysisParameter`(category) ·
`LabService` · `Sample`(status enum has all 6 values but only `PRELEVE` is set) ·
`SampleParameter`(join) · `Invoice` · `InvoiceItem`.
Enums: `Role`, `SampleType`(ALIMENTAIRE|EAU|AMBIANCE), `SampleStatus`(6),
`InvoiceStatus`(EN_ATTENTE|PAYEE).

## 5. "Where do I change X?"

| I want to change… | Go to |
|---|---|
| Company name / ICE / RC / RIB / IBAN / bank | `src/lib/company.ts` (never hardcode elsewhere) |
| Sample code format | `src/lib/sample-code.ts` |
| Invoice number format | `src/lib/invoice-number.ts` |
| VAT / invoice totals math | `src/lib/invoice-math.ts` |
| Amount-in-words wording | `src/lib/number-to-words-fr.ts` |
| Analysis parameters / services / prices | `prisma/seed.ts` (and Admin config screen once built) |
| Session / login / roles | `src/lib/auth.ts` + `src/app/api/auth/*` |
| Add a DB field/table | `prisma/schema.prisma` → `npm run db:migrate` → client regenerates |
| Nav items per role | `src/components/layout/*-nav.ts` |
| Shared UI look | `src/components/ui/*` + design skills |
| Status/type badge labels | `src/lib/labels.ts`, `components/ui/StatusBadge.tsx`, `TypeBadge.tsx` |
| PM2 / restart behavior | `ecosystem.config.cjs`, `scripts/start-production.sh` |
| Health probe | `src/app/api/health/route.ts` |

## 6. Environment variables

| Var | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/db` | parsed by `database-url.ts` |
| `AUTH_SECRET` | JWT signing secret | ≥32 chars; `openssl rand -base64 32` |
| `NODE_ENV` | `development` / `production` | |
| `PORT` | prod port (default 3000) | |
| `AUTH_COOKIE_SECURE` | set `false` only for plain-HTTP testing | HTTPS in prod |

**To add (production):** `RESEND_API_KEY` (email), `EMAIL_FROM`, and any
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
| 2026-07-27 | **Server-side PDF via Playwright** for official reports | Pixel-perfect, selectable text, multi-page, reuses design-skill HTML. Client jsPDF stays for invoice demo only |
| 2026-07-27 | **Resend** for transactional email | Best deliverability; matches spec "service dédié" |
| 2026-07-27 | UI via **installed design skills**, top-tier per screen | Client-facing pro tool; brand-consistent |

## 9. Known debt / watch-outs

- Role checks hardcoded per file → centralize (see §3) **before** adding roles.
- Invoice PDF is a flattened client-side screenshot (no text, single page) — do
  **not** reuse it for official analysis reports.
- Sample status is a 6-value enum but nothing advances it past `PRELEVE`; the
  state machine must be enforced server-side (no skipping/reversing).
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

**Open items to confirm with client:** exact double-validation rule (#9);
control-code vs serial-number format (#8); result calculation methods (#5);
legacy data formats/access (#1); stock granularity + whether a `MAGASINIER`
role is needed (#2). These are listed in the client response PDF.
