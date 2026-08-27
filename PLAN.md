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

## Where we are (2026-08-25)

Phases 1 to 3 are delivered and verified: a sample travels the whole circuit,
the report is produced and sent, and a contamination alert fires when a
sensitive parameter is over its limit. Two things run in a clearly-labelled
simulation until the laboratory answers — real email delivery (needs DNS) and
the official norm limits — both tracked in `NEEDEDINFO.md`. Phase 4 is next.

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
| **[alerts 18-08]** `Result.numericValue` (Float?) | the typed value stays as entered (`8,9.10²`), a parsed numeric copy enables threshold comparison |
| **[alerts 18-08]** `AnalysisParameter.alertOnExceed` (Bool) + `limitValue` (Float?) | flags the sensitive germs (E. coli, Salmonelle, Listeria) and their norm limit |
| **[alerts 18-08]** `Sample.produit` + `Sample.numeroLot` | both are columns in the client's alert table; not in the schema today |
| **[alerts 18-08]** `ClientEmail` (new) | a client has **several** recipient addresses; flags for reports vs alerts |
| **[alerts 18-08]** `EmailLog.type` | distinguishes RAPPORT from ALERTE_CONTAMINATION in the send journal |

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
- **Cursor pagination** (`lib/pagination.ts`) on every list that grows with
  time, plus composite indexes matching how the screens query. This is what
  keeps the system fast **after** the database fills up, not just on day one —
  see `CODE_QUALITY.md` §4b.

---

## Phases (each ends in a demo + client validation)

### Phase 1 — Foundation & roles ✅ DELIVERED 2026-07-29
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

### Phase 2 — LIMS core (the heart) ✅ DELIVERED 2026-08-25
- **Reception & conformity:** queue of `PRELEVE`, quick-verify screen, mark
  conform/non-conform (with reason), assign to a technician → `RECU`.
  - **[client 28-07 + 18-08] Numbering at reception — blind design:** two
    numbers per sample, generated here, never shown to the préleveur:
    `controlCode` (official, traceable, sequential e.g. `QLC-AAAA-NNNNN`) and
    `serialNumber` (**blind analysis code: crypto-random, non-sequential,
    unguessable** — the anti-cheating identifier technicians work with).
    Fields already exist in the schema; build the secure generator in
    `lib/sample-code.ts` (crypto.randomBytes-based, collision-checked).
- **Result entry (technician):** their assigned samples; per-parameter value /
  unit / threshold / conformity; work status incl. anomaly; save-in-progress;
  submit when complete → `EN_ANALYSE` → `RESULTATS_SAISIS`.
  - **[client 28-07 + 18-08] Auto-calculated results:** compute results from
    raw inputs via per-method formulas, with correction of erroneous entries.
    **Default units/thresholds from standard Moroccan norms (NM)**; the lab's
    official formulas arrive mid-project and slot into the same helper.
  - **[alerts 18-08] Numeric results are mandatory:** results must be stored
    numerically (`numericValue`) as well as displayed as typed, because the
    contamination alert compares the value against the norm limit. Accept
    scientific notation as the lab writes it (`8,9.10²` = 8.9×10²) and parse
    it — a display-only string cannot drive an automatic alert.
  - **[alerts 18-08] Capture `produit` and `N° de lot`** at prélèvement /
    réception: both appear in the alert email table.
- **Validation (validateur + admin):** review results vs thresholds + history.
  - **[client 18-08 CONFIRMED] Double validation on EVERY sample:** the
    VALIDATEUR validates technically first, then the ADMIN gives final
    approval — only after both does the sample become `VALIDE` and the
    report/email fire. Either can reject with a reason → back to technician.
    Model with `validatedById/validatedAt` (validateur) + a second admin
    approval field (e.g. `approvedById/approvedAt`) — design at build time.
- Full audit on every transition; state machine enforced.
- **Demo:** a sample travels `PRELEVE → VALIDE` through the right hands.

### Phase 3 — Reports & email ✅ DELIVERED 2026-08-25 (delivery simulated until DNS)
- **Official PDF report** (server-side Playwright, branded HTML): identity, code,
  client, place/date, préleveur, results table w/ thresholds + conformity,
  conclusion, technician + validator signatures, validation date. Archived +
  re-downloadable.
- **Auto email** to client on validation → `RAPPORT_ENVOYE`; `EmailLog` +
  manual resend (gestionnaire).
- **[client 28-07] Bench sheet (feuille de paillasse):** printable worksheet
  grouping samples/parameters **by date** for on-bench result entry, with a
  value/note column.

- **[client 18-08 NEW] Alertes de contamination automatiques** — separate from
  the report email, and business-critical:
  - **Trigger:** on result entry for a **sensitive microbiological parameter**
    (E. coli, Salmonelle, Listeria monocytogenes — admin-configurable via
    `alertOnExceed`), when the measured value **exceeds the norm limit**, and
    **after validation of the result**.
  - **Recipients:** the client's **list** of alert addresses, with the lab in
    copy (`direction@…` + the responsable technique) — CC list configurable.
  - **Content** (per the client's model email, subject `Alerte de
    contamination par <germe>`): intro line then a table —
    **Produit · Site de prélèvement · Date de réception · N° de lot · Le germe
    · Résultat UFC/g · Limite UFC/g** — one row per breaching result, followed
    by the lab signature block (responsable technique, tél, email, adresse).
  - **Grouping:** one email per client/germ listing every breaching product
    (the model email shows two products in a single alert), not one mail per
    result.
  - Logged in `EmailLog` with `type = ALERTE_CONTAMINATION`, resendable.
  - ⚠️ **Assumption to confirm:** "après validation" = after the sample is
    fully `VALIDE` (validateur **and** admin, per the 18-08 rule). If the lab
    wants the alert to leave earlier because contamination is urgent, say so —
    it is a one-line change to the trigger.
- **[client 28-07 + 18-08] Admin silent report edit:** the ADMIN can edit a
  validated report **without an audit-trail entry.** Client declined the
  optional internal safety-net log — zero trace, scoped strictly to ADMIN +
  report edits. **Build it now** (decision 18-08): keep it isolated behind a
  single route + guard so it can be removed in one commit if the client
  changes his mind.
- **Demo:** validating a sample emails the client a real PDF; it's re-sendable.

### Phase 4 — Clients, invoice link, administration ◀ NEXT
- **Clients:** full CRUD + archive + **360° view** (samples, reports, invoices,
  payments); reserved to gestionnaire + admin.
- **Invoicing from validated samples:** validated analyses become invoice lines
  at catalog prices (wire onto existing invoice plumbing); keep free lines.
  - **[client 28-07] Editable designations:** full control over product/service
    line labels and report designations on invoices (admin-configurable naming).
- **Admin config:** users & roles (create, disable, reset password), analysis
  parameters (per domain, units, thresholds), service catalog, document
  templates, company coordinates, audit-log viewer.
- **Demo:** lab is autonomous — configure everything, invoice from a validated
  sample.

### Phase 5 — Production hardening
- Per-role dashboards + **direction view** (samples by status, avg lead time,
  activity by domain, billed/collected) + global search.
- Domain + HTTPS, **daily DB backups** + tested restore, security pass.
- End-to-end tests, documentation (user-by-role, admin, ops), training.
- **[client 28-07] Legacy data migration:** import existing **clients, reports,
  invoices** from the lab's current systems (needs source access/exports +
  field mapping + validation — *formats to confirm*).
- **Demo:** official go-live.

---

## Extension modules — client meeting 2026-07-28 (beyond original scope)

> These came from the client's team meeting after the scope doc was signed off.
> They are **additional scope** — sequence after the core LIMS (Phases 1–5) and
> re-cost/replan. The client flagged Quality + Réclamations explicitly as a
> *"volet plus tardif"* (later track).

### Phase 6 — Achat & Stock ✅ CODE-COMPLETE (2026-08-27, hidden)
- Supplier base + per-supplier **payment conventions**; **payment-due alerts**. ✅
- Stock/inventory tracking (items, levels, movements) with low-stock alerts. ✅
- **[client 18-08 CONFIRMED]** dedicated **`MAGASINIER`** role operates this
  module (9th profile). ✅ Role live in roles.ts + users screen.
- **Kept invisible until Achraf prices/reveals it**: no admin nav entry, no
  demo account — the module only exists at `/magasin` for MAGASINIER (and
  ADMIN by URL). Revealing = create a MAGASINIER user in
  `/admin/utilisateurs` (+ optional admin nav links).
- Provisional assumptions flagged: stock granularity carries optional
  lot/expiry per movement (NEEDEDINFO 16); supplier list = data entry (17).

### Phase 7 — Système Qualité ✅ CODE-COMPLETE (2026-08-27)
- **Métrologie:** equipment register + calibration schedule + records. ✅
  (`calibrationDue()`: RETARD / BIENTOT ≤30 j / JAMAIS; records advance
  `lastCalibratedAt` only when newer — back-dating never rewinds.)
- **EIL:** campaign register (statut, organisme, portée, z-score, verdict). ✅
- **Températures:** per-equipment bounds, daily readings board, out-of-range
  stored at write time (bounds changes never rewrite history). ✅
- Space `/qualite` for **VALIDATEUR + ADMIN** (linked from both menus);
  temperature POST also open to TECHNICIEN for a future bench entry point.
- Provisional until NEEDEDINFO 13–15: equipment list, périodicités, bornes
  and EIL perimeter are data entry on the built screens.

### Phase 8 — Portail client & Réclamations *(later track)*
- **Client portal [client 18-08 CONFIRMED]:** `CLIENT` accounts are
  **created and managed by the ADMIN** (no self-signup — consistent with our
  disabled public sign-up). Each client logs into a scoped, read-only space:
  status tracking + results/reports of **their own** samples only.
- **Réclamations:** centralized complaints/claims tab linked to samples/clients.

**Roles impact [settled]:** 9 profiles total — the 7 core roles + `CLIENT`
(portal, already reserved in `lib/roles.ts`) + `MAGASINIER` (added at Phase 6).

---

## Definition of Done (per phase)

A phase is done only when: code meets `CODE_QUALITY.md` · `npm run build` passes ·
authorization verified server-side for every new surface · every mutation
audited · the demo flow runs end-to-end on the VPS · PROGRESS.md + HANDOFF.md
updated · committed.
