# HANDOFF.md — Qualilab LIMS

> **The canonical takeover document.** Behavior, intent, architecture, and the
> "where do I change X" map. Read after `AGENTS.md`. **Keep this current** — it
> is what lets any AI on any platform continue without archaeology.
>
> Last updated: **2026-08-23** · Branch: `master` · Remote:
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
| Clients | CRUD, archive, recipient lists, fiche 360° | ✅ **Phase 4 · E1 done** |
| LIMS core — **réception** | queue, verify, conformity, assignment, **blind numbering** | ✅ **Phase 2 · C1 done** |
| LIMS core — **saisie résultats** | bench sheet, automatic conformity, submit | ✅ **Phase 2 · C2 done** |
| LIMS core — **validation** | double validation (validateur + admin), rejet motivé | ✅ **Phase 2 · C3 done** |
| LIMS core — **rapport PDF** | official report, 3 signatures, on-demand render | ✅ **Phase 3 · started** |
| LIMS core — **email, alertes** | auto send, grouped contamination alerts, bench sheet | ✅ **Phase 3 done** (delivery simulated until DNS) |
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
      samples/                 GET (audience-scoped) · POST (PRELEVEUR creates)
      samples/[id]/reception/  ★ PRELEVE → RECU: numbering, conformity, assignment
      samples/[id]/results/    ★ PUT save (RECU → EN_ANALYSE) · submit/ POST (→ RESULTATS_SAISIS)
      samples/[id]/validation/ ★ POST validate | approve (→ VALIDE) | reject (→ EN_ANALYSE)
      samples/[id]/report/     ★ GET — renders the official PDF on demand
      samples/[id]/report/send/ POST — send or resend to the client
      bench-sheet/             GET ?date= — printable feuille de paillasse
      reports/[id]/admin-edit/ ⚠️ PATCH — admin edit, deliberately NOT audited
      clients/                 GET (searchable) · POST (GESTIONNAIRE/ADMIN)
      clients/[id]/            GET · PATCH (edit, archive, recipient list)
      clients/[id]/billable/   GET — validated analyses not yet invoiced
      parameters/              GET · POST (ADMIN) — where the norms are entered
      parameters/[id]/         PATCH (ADMIN) — audited with before/after
      lab-services/            read endpoint
      invoices/  invoices/[id]/   invoice CRUD (COMPTABLE + ADMIN)
      invoices/[id]/pdf/       GET — the invoice rendered server-side
      health/                  liveness probe for PM2/watchdog
    preleveur/                 role space: dashboard + nouveau (3-step)
    reception/                 queue + [id] verify screen ✅
    technicien/                bench queue + [id] result entry sheet ✅
    validation/                queue + [id] control view (two-step approval) ✅
    commercial/                client base + [id] fiche 360° + nouveau + [id]/modifier ✅
    comptabilite/              dashboard + factures (list/nouvelle/[id]) ✅
    admin/                     dashboard + factures + parametres + journal
  components/
    layout/  AdminShell, PreleveurShell, RoleShells.tsx (5 role shells),
             DashboardShell, Sidebar, admin-nav / preleveur-nav / role-navs.ts
    ui/      Card, StatCard, StatusBadge, TypeBadge, StepIndicator, PageHeader, LoadingState
    RoleDashboard.tsx          shared role landing page (stats + mission + next steps)
    reception/  ReceptionQueue, ReceptionForm (conformity + assignment + numbers)
    technicien/ WorkQueue, ResultEntryForm (per-parameter entry + live conformity)
    validation/ ValidationQueue, ValidationPanel (the two approvals + rejection)
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
    sample-code.ts     ★ QL (field) · QLC (control, sequential) · SN (blind, crypto-random)
    sample-select.ts   ★ audience-scoped Prisma selects — hides numbering from the préleveur
    sample-access.ts   ★ loadAssignedSample() — a technician only touches their own samples
    result-value.ts    ★ parses the lab's notation (8,9.10² / < 10 / Absence) + conformity
    report-html.ts     ★ the official report as HTML + the auto conclusion
    report-number.ts   RAP-YYYY-NNNNN
    pdf.ts             ★ HTML → PDF via playwright-core (CHROMIUM_PATH)
    email.ts           ★ sendEmail() + recipientsFor() — journalises every send
    emails/templates.ts  the report mail and the contamination alert
    report-dispatch.ts ★ what happens on approval: report, send, alerts
    bench-sheet-html.ts  the printable worksheet
    pagination.ts      ★ cursor paging — use it on any list that grows
    money.ts           ★ toMoney() — every DECIMAL crossing a boundary
    invoice-serialize.ts  shapes an invoice for the wire (Decimal → number)
    retry-unique.ts    retries a sequential-number collision
    client-validation.ts  ★ client + recipient-list rules (pure, tested)
    billing.ts         ★ analyses → invoice lines at catalogue prices (pure, tested)
    parameter-validation.ts ★ the norms rules — a sensitive parameter needs a limit
    invoice-html.ts    ★ the invoice as a printable document
    invoice-paths.ts   useInvoiceBasePath() — invoice links follow the role's space
    invoice-number.ts / invoice-math.ts / invoice-types.ts / lab-services.ts / labels.ts
    number-to-words-fr.ts   amount-in-words (FR) for invoices
  generated/prisma/    ★ generated Prisma client — DO NOT edit, gitignored
prisma/
  schema.prisma  ·  seed.ts (7 role users)  ·  migrations/ (13)
  ⚠️ the VPS needs a Chromium for the PDF: `apt install chromium`
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
| Sample numbering (field / control / blind serial) | `src/lib/sample-code.ts` |
| What each role may SEE of a sample | `src/lib/sample-select.ts` (never hide fields in the UI only) |
| Invoice number format | `src/lib/invoice-number.ts` |
| VAT / invoice totals math | `src/lib/invoice-math.ts` |
| Amount-in-words wording | `src/lib/number-to-words-fr.ts` |
| Analysis parameters / services / prices | `prisma/seed.ts` (and Admin config screen once built) |
| Login / session behaviour | `src/lib/auth-server.ts` (Better Auth config) |
| Access rules for a page or route | `requireRole` / `requireApiRole` in `src/lib/auth.ts` |
| Add a role / change a role's landing page | `src/lib/roles.ts` + Prisma `Role` enum |
| Who may move a sample to a status | `src/lib/sample-status.ts` (`TRANSITIONS`) |
| The two-approval rule | `canValidateTechnically()` / `canApprove()` in `sample-status.ts` |
| How a typed result is read / conformity computed | `src/lib/result-value.ts` |
| The report's layout, wording or conclusion | `src/lib/report-html.ts` |
| The email wording (report / alert) | `src/lib/emails/templates.ts` |
| What is sent on approval | `src/lib/report-dispatch.ts` |
| How a growing list is paged | `src/lib/pagination.ts` (cursor, not page numbers) |
| Client / ICE / email validation | `src/lib/client-validation.ts` |
| How an analysis becomes an invoice line | `src/lib/billing.ts` |
| **Enter the lab's official norm limits** | `/admin/parametres` (data entry, audited — no code) |
| How money crosses a boundary | `src/lib/money.ts` + `invoice-serialize.ts` |
| Which parameters raise a contamination alert | `AnalysisParameter.alertOnExceed` + `limitValue` (seeded in `prisma/seed.ts`) |
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
| `NEXT_PUBLIC_DEMO_MODE` | `false` hides the demo-accounts panel on the login page | **Set to `false`** once the lab's real accounts exist |
| `CHROMIUM_PATH` | browser used to render report PDFs | Optional. On the VPS: `apt install chromium` — the default paths are tried first |
| `RESEND_API_KEY` | mail provider key | **Absent → sends are journalised as `SIMULE`, not delivered.** Needs the client's DNS first |
| `EMAIL_FROM` | sender address | e.g. `Qualilab International <no-reply@qualilabinternational.com>` |

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
| 2026-08-18 | **NEW REQUIREMENT: automatic contamination alert emails** (client model email received) | On sensitive micro parameters (E. coli, Salmonelle, Listeria), when a result exceeds the norm limit and the result is validated, an automatic mail goes to the client's listed addresses with a Produit/Site/Date/Lot/Germe/Résultat/Limite table + lab signature. Distinct from the report email. Forces 5 schema additions — see PLAN data-model table |
| 2026-08-18 | **Results must be stored numerically** (`Result.numericValue`) | Direct consequence of the alert feature: threshold breach cannot be detected from a display string. Keep the value as typed (scientific notation `8,9.10²`) **and** a parsed numeric for comparison |
| 2026-08-18 | **Working method: build continuously, pause at the point of need** | We do not wait for every unknown up front. Build until a task genuinely requires missing information (norms, formulas, legacy files, equipment list), then stop, ask the lab for exactly that, and resume. Anything blocked goes to PROGRESS as `[!]` with what is needed |
| 2026-08-25 | **Speed is a stated requirement** | The lab works in this tool all day. Targets and rules in `CODE_QUALITY.md` §4b; checks in `TESTPLAN.md`. Treat a slow screen as a defect |
| 2026-08-25 | **No Redis for now** | At 1–10 concurrent users it would add a service to run, deploy, monitor and back up for no measurable gain: sessions live in MySQL and pages are server-rendered. **Revisit when** we add scheduled jobs (Phase 6/7 alerts) or if a measurement — not a hunch — shows a real bottleneck |
| 2026-08-25 | **Money is `DECIMAL(12,2)`, never `Float`** | The prototype stored every amount as Float. An invoice is a legal document; floating point drifts. Prisma returns `Decimal` and JSON would serialise it as a string, so everything crossing a boundary goes through `toMoney()` / `serializeInvoice()` |
| 2026-08-25 | **Sequential numbers retry on collision** | Invoice/sample numbers are read-then-incremented, so two users at the same instant pick the same one. The unique constraint is the real guard; `retryOnDuplicate()` turns the clash into a second attempt instead of a 500 |
| 2026-08-25 | **Security headers + error boundaries added** | The system holds health data: no framing, no MIME sniffing, no referer leaking a sample id, HSTS in production. `error.tsx` / `not-found.tsx` replace Next's raw screens with something a technician can act on |
| 2026-08-25 | **"Attente admin" is a derived state, not a seventh status** | The client's specification promises exactly six tracked statuses. The technical validation is recorded on the sample (`validatedById`), and the sample stays `RESULTATS_SAISIS` until the admin approves — so the two-step rule is enforced without changing the status model the client validated. Use `approvalState(sample)` to read it |
| 2026-08-25 | **Containers at Phase 5, not before** | docker-compose (app + MySQL + volume), Next `output: "standalone"`, Chromium for the PDF, nginx for HTTPS. Gives a reproducible deploy; switching mid-build would cost time without changing a feature |
| 2026-08-18 | **Client portal confirmed** (Phase 8): `CLIENT` accounts are **created/managed by the ADMIN** (no self-signup); each client sees the status and results/reports of their own samples only | Client answer. `CLIENT` role already reserved in `lib/roles.ts` |
| 2026-07-27 | **Server-side PDF via Playwright** for official reports | Pixel-perfect, selectable text, multi-page, reuses design-skill HTML. Client jsPDF stays for invoice demo only |
| 2026-07-27 | **Resend** for transactional email | Best deliverability; matches spec "service dédié" |
| 2026-07-27 | UI via **installed design skills**, top-tier per screen | Client-facing pro tool; brand-consistent |

## 8b. Audit of the inherited prototype (2026-08-25)

The first prototype was built to demonstrate, not to run a laboratory. Before
extending the invoicing in Phase 4 it was audited across backend, frontend and
data. What was found and fixed:

| Finding | Severity | Fixed |
|---|---|---|
| **All money stored as `Float`** (7 columns) | 🔴 an invoice is a legal document | → `DECIMAL(12,2)` + `toMoney()` at every boundary |
| **No validation of amounts** — a negative unit price was accepted | 🔴 | Rejected with a named message; VAT clamped to 0–100 |
| **`Invoice` had no index at all** | 🟠 would scan as invoices accumulate | `[clientId]`, `[status]`, `[createdAt]` |
| **Unbounded lists** (`/api/samples`, `/api/invoices`) | 🟠 slows as data grows | Cursor pagination |
| **Sequential numbering racy** | 🟠 a 500 on simultaneous creation | `retryOnDuplicate()` |
| **No error boundary, no 404 page** | 🟠 raw Next error screen | French pages that offer a way out |
| **No security headers** | 🟠 health data | Frame/sniff/referer/permissions + HSTS |
| **Dead dependencies** (`bcryptjs`, `jose`, `html2canvas`) | 🟡 | Removed |

Clean on the rest: no `any`, no stray `console.log`, no `@ts-ignore`, no dead
nav links, all 10 screens render without error.

**Still open** — see §9: the invoice PDF is a client-side screenshot while the
report is rendered server-side, and there is no automated test suite.

## 9. Known debt / watch-outs

- ~~Role checks hardcoded per file~~ → **resolved:** everything now goes through
  `requireRole` / `requireApiRole`. Keep it that way; never re-introduce an
  inline `session.role === "..."` check in a page or route.
- ~~The comptable cannot reach the invoice screens~~ → **resolved 2026-08-25**:
  `/comptabilite/factures` reuses the same components, and
  `useInvoiceBasePath()` makes their links follow the space they render in.
  **A shared invoice component must never hardcode `/admin/...`.**
- ~~Invoice PDF is a client-side screenshot~~ → **resolved 2026-08-25**: it is
  rendered by Chromium from `invoice-html.ts`, like the report.
- ~~No automated tests~~ → **resolved 2026-08-25.** `npm test` runs vitest over
  the rules the laboratory depends on (value parser, money, state machine,
  client validation). **Anything new in `lib/` that decides a value, a verdict,
  a permission or an amount ships with its test** — see `CODE_QUALITY.md` §4c.
- ⚠️ **Restart the dev server after a schema change.** Prisma's client is loaded
  into the running Node process, so new fields produce "Unknown field" until the
  server is restarted — it is not a code error.
- Sample status still only ever reaches `PRELEVE` in practice — Phase 2 wires the
  transitions. The state machine (`canTransition`) already exists: **use it**,
  never write `status` directly.
- `bcryptjs` and `jose` are still in package.json but unused by the app since
  Better Auth took over hashing/sessions — remove when convenient.
- `src/generated/prisma/` is gitignored — regenerated by `prisma generate` on
  install/build. Never edit or import it as if hand-written source.
- ~~Sample numbering moves to reception~~ → **done (2026-08-23).** The official
  numbering is minted only by `POST /api/samples/[id]/reception`, and
  `sample-select.ts` keeps it out of the préleveur's payload. If you add a new
  sample read, go through `sampleSelectFor(role)` — a raw `findMany` would leak it.
- **Open question for the lab:** a sample marked *non conforme* is still received
  and assigned today. Confirm whether it should instead be blocked from analysis.
- ⚠️ **Emails are not really sent yet.** Without `RESEND_API_KEY` every send is
  recorded in `EmailLog` with the status `SIMULE` and the UI says so. The whole
  chain — recipients, subject, body, PDF attachment, journal, resend — is real;
  only the last hop is missing. Setting the key and the DNS records turns it on.
- ✅ The provisional limits now have their editing screen: entering the lab's
  official values is data entry on `/admin/parametres`, audited. The seed only
  matters for a fresh database.
- ⚠️ **The seeded analysis limits are provisional.** `prisma/seed.ts` carries
  usual Moroccan (NM) criteria as defaults; only the E. coli figure (1.10² UFC/g)
  is confirmed, from the client's alert email. Replace them when the lab sends
  its official methods — they drive both conformity and the alerts.
- Results are stored twice on purpose: `value` as typed, `numericValue` parsed.
  Never compare against `value`.
- ~~No pagination~~ → **resolved 2026-08-25.** `/api/samples` and
  `/api/invoices` are cursor-paginated (`lib/pagination.ts`), and the composite
  indexes match how the screens query. **Any new list that grows with time must
  use the same helper**, and any new filter or sort column needs its index —
  the system has to stay fast once the database is full, not only when it is
  empty. The queues are naturally bounded by status, so they were left direct.
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
| 12 | **[18-08] Alertes de contamination automatiques** (E. coli / Salmonelle / Listeria over limit → mail to the client's address list) | Phase 3 — with data-model prep in Phase 2 |

**Client answers received 2026-08-18** (full decisions in the section 8 log):
double validation = both Validateur AND Admin on every sample (#9) - dual
numbering with a blind crypto-random serial, format ours to design (#8) -
default thresholds to Moroccan NM norms, official formulas arrive mid-project
(#5) - legacy data = import-only once handed over (#1) - dedicated `MAGASINIER`
role for stock (#2) - silent admin edit stays with NO internal log (#7) -
client portal confirmed, admin-managed accounts (#10).
**Still open:** exact per-parameter formulas (mid-project) - legacy data files
(when provided) - Quality-module equipment list & EIL perimeter (Phase 7) -
**alert trigger timing** (before or after full double validation) - **the norm
limits per sensitive germ** (the model email shows E. coli limit 1.10² UFC/g).

**Real company details** appeared in the client's model email (2026-08-17) and
should replace the placeholders in `src/lib/company.ts` once confirmed:
Laboratoire Qualilab International - Tél 0522-470-083/086 -
info@qualilabinternational.com - 6, rue Ibn Al Jaouzi (Ex Colonel Gros),
Quartier des Hôpitaux, 20360 - Responsable technique: Boutiri Abdellah -
direction@qualilabinternational.com (alert CC). ICE/RC/RIB still needed.
