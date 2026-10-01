# RETOUR-LABO-30-09.md — the answers of 30/09 (Q31–Q37) and the work they create

> **Status (2026-10-01):** **slices H, I and J done** — built, tested,
> verified on dev and in production (TESTPLAN Q-H, Q-I, Q-J). The old
> software's catalogue is imported in production. **Left: slice K**, the
> recette with the laboratory and the go-live steps (§10).
>
> The previous batch (`RETOUR-LABO-29-09.md`,
> slices A → F) is live in production. The laboratory then answered the seven
> clarification questions; this file turns the answers into four slices,
> **H → K**, in the order they must be built. Each slice is deployed and
> verified in the browser (1440×900, dev then production) before the next,
> and ticked in `TESTPLAN.md` checkpoint **Q**.
>
> Where this file contradicts `CRITERES.md`, `WORKFLOW.md` or
> `RETOUR-LABO-29-09.md`, **this file wins**; the older specs carry a pointer.

---

## 1. The answers, one line each

| # | Their answer (verbatim where it matters) | Decision | Slice |
|---|---|---|---|
| Q31 rule of c | « Acceptable, et non satisfaisant si 2 au-dessus de M. Si 2 sont entre m et M, qui sont deux valeurs distinctes, alors c'est acceptable ; si plus que 2 dépasse alors c'est non satisfaisant. » | **3-class plan (m < M):** any unit above M ⇒ non satisfaisant; ≤ c units in ]m, M] ⇒ acceptable; > c ⇒ non satisfaisant — *already the engine*. **Single limit (m = M, m alone, or M « non spécifié m »):** ≤ c units above the limit ⇒ **Acceptable**, > c ⇒ non satisfaisant — *to build* | H |
| Q32 regulation | « Cela dépend de l'échantillon … le validateur technique doit avoir la main pour sélectionner la réglementation pour l'échantillon les premières fois » | A **catalogue of regulations**; the technical validator **chooses one per sample**; the screen proposes the last choice for the same client product, else the product type's default. Frozen on the report | I |
| Q33 the 131 types | « Garde 634 et on peut les modifier » | Import the old software's **634 product types with their criteria**; all editable in `/admin/types-produits` | J |
| Q34 client-named types | « Ce sont des familles pour faciliter les paramétrages à l'interne ; le client ne le voit pas sur le rapport ni sur le protocole » | Types stay visible to every client (already so); **the type never prints** on the report (today it does) nor the protocol (already not) | H |
| Q35 destroyed sample | « Non il n'est pas facturé, oui il est informé » | Not invoiced (already so); **an e-mail tells the client** | H |
| Q36 repetitions | « R1, R2, R3 partout, étiquettes comprises » | **R1 … Rn everywhere**: labels, bench, reception, deposit — no more letters | H |
| Q37 N° BC | « Oui il s'agit du même numéro » | N° BC = N° de série — already so | ✅ |

**New questions** (NEEDEDINFO): **Q38** — is the old software's list of 176
regulation sources current? **Q39** — when a type exists both in the old
software and in the September workbook, whose criteria win; and the 411 types
unused since 2025, active or archived? Still open from before: **Q30**
(invoice print models). None blocks slice H; I runs on a seeded list until
Q38; J runs on the defaults of §4.

---

## 2. Slice H — the small changes *(≈ 1 day, starts now, no dependency)*

### H1 — Tolerance c on a single limit (Q31)
- `interpret()` in `src/lib/interpretation.ts`: when the plan is a single
  limit (`mKind UNSPECIFIED` with M, `bigM === null` with m, **or m = M**),
  count the units above the limit: 0 ⇒ SATISFAISANT, 1 … c ⇒ ACCEPTABLE,
  > c ⇒ NON_SATISFAISANT (c null = 0). Reason sentence names c.
- m = M must take this path (today it falls into the 3-class branch, where
  nothing can sit in ]m, M] and every unit above fails).
- `informalVerdict()` is unchanged (no c on too few units, answer of 29/09).
- 3-class plans (m < M) unchanged.
- Tests: m = M = 100, c = 1 — one unit above ⇒ acceptable, two ⇒ non
  satisfaisant; m alone c = 0 ⇒ one above fails; UNSPECIFIED M with c = 2;
  the existing 3-class cases stay green.
- Stored verdicts of old results are not recomputed (a re-save recomputes).

### H2 — The product type never prints (Q34)
- `src/lib/report-html.ts`: remove the « Type de produit » row from the
  Traçabilité box (keep `ReportData.productType` for the screens, or drop it
  from the report data).
- Check the protocol, bon de réception, labels, bench sheet and both e-mails
  never print it (they do not today — keep a test on the report HTML).
- Screens (bench, validation, admin) keep showing it: it is internal.

### H3 — The client is told when a line is destroyed (Q35)
- New `EmailType` value `DESTRUCTION` (additive migration).
- `src/lib/emails/templates.ts`: `destructionEmail()` — the model of the
  report e-mail: N° dossier (série), N° de contrôle, date de prélèvement,
  date de réception, produit, lot, lieu, **motif de non-conformité** (coded
  label + note), sentence « L'échantillon n'a pas pu être analysé et a été
  détruit à la réception. »
- Sent to `recipientsFor(clientId, "reports")` after the transaction, from
  both paths: `POST /api/series/[id]/reception` and the counter deposit
  (`createSerie` via `POST /api/series`). One e-mail per série listing its
  destroyed lines. No recipient ⇒ the reception still succeeds, the audit
  says `notified: false`.
- Audited as its own journal entry `DESTRUCTION_NOTIFIED` (série, lines,
  N° de contrôle, recipients, status) — `src/lib/destruction-notice.ts`.

### H4 — R1 … Rn everywhere (Q36)
- Replace `unitLetter()` by `repetitionLabel()` in `src/lib/labels-html.ts`
  (one label per unit: « 9131/26 R3 »), `ResultEntryForm` (« R1 » instead of
  « R1 · A »), `SerieReceptionForm.unitsLabel` (« 5 unités (R1–R5) »),
  `DepositForm`, and any text still saying « A…E ».
- `unitLetter()` deleted (nothing needs it); `repetitionRange()` added
  (« R1–R5 »). The label barcode now reads « 9135/26-R3 ».
- Label layout: « R12 » is wider than « L » — check the label PDF at 60
  units renders without overflow.
- The bench sheet PDF prints no repetitions today; leave it (question for the
  recette: should it list R1 … Rn per sample?).

**Definition of done H:** tests + lint + build; TESTPLAN Q-H ticked on dev
and production; `CRITERES.md` §4 rule of c updated; deployed.

---

## 3. Slice I — The regulation chosen per sample (Q32) *(≈ 2 days)*

### Data (additive migration)
- `Regulation` — `id`, `title` (short, for the picker: « Arrêté conjoint
  624-04 »), `text` (printed in the report's first cell), `active`,
  `legacyId Int? @unique` (for the import of slice J), `sortOrder`,
  timestamps.
- `ProductType.regulationId String?` — the type's default (replaces the free
  text `ProductType.regulation` of slice C; the column stays, unused, its
  content migrated into a `Regulation` row when not empty).
- `Sample.regulationId String?` — the choice for this sample.
- `ClientProduct.regulationId String?` — the last choice for this client's
  product: « les premières fois » the validator chooses, afterwards it is
  proposed.
- `LabSettings.regulationMicro/Chimie` (slice C) become the family defaults as
  `regulationMicroId` / `regulationChimieId`; migrate their text too.
- Seed: one row, « Arrêté conjoint n° 624-04 du 8 avril 2004 » (the text on
  their report model), until slice J imports the old list.

### Screens and routes
- `/admin/reglementations` (ADMIN): list, create, edit, archive — same
  pattern as `/admin/normes`; near-duplicate check with `similarLabels`.
- `/admin/types-produits/[id]`: the regulation editor becomes a picker of the
  catalogue (default of the type). `/admin/reglages`: the two family
  defaults become pickers.
- Validation screen (`/validation/[id]`): a « Réglementation » select above
  the results, **required for a sample with criteria before « Valider
  techniquement »**. Proposal order: sample's own choice → client product's
  last choice → product type default → family default → none.
- `POST /api/samples/[id]/validation` `action: "validate"` accepts
  `regulationId`; refuses 400 when missing on a sample with criteria;
  stores it on the sample and on its `ClientProduct`; audit metadata
  `regulationId` + title. The admin approval can change it (same field) until
  the report exists.
- `createReportFor` freezes `Report.regulation` = the chosen regulation's
  `text` (the column of slice C) — an edited or archived regulation never
  changes an issued report.
- Report e-mail unchanged.

### Tests
Pure proposal function (`proposeRegulation(sample, clientProduct, type,
settings)`) tested; validation refusal without regulation; report freezes the
text.

**Definition of done I:** a validator chooses « Arrêté 624-04 » on a first
sample, the next sample of the same client product proposes it, the report
prints it, editing the regulation afterwards leaves that report unchanged.

---

## 4. Slice J — The old software's catalogue (Q33, Q38, Q39) *(≈ 2–3 days)*

**Needs Docker Desktop running** the restored Firebird base (container
`qlabo-fb`, see the legacy notes in the project memory / `faits-base-legacy.md`).
**The extracted data never enters the repo** (public): extraction SQL and
import code are committed, the CSV files are not.

### J1 — Extraction (scripts only in the repo)
`scripts/legacy/` — SQL + a small runner that writes CSV (UTF-8, `;`):
- `types.csv` — TYPE_NOURITURE (634): legacy id, name, group / family,
  regulation source id, client id, last use date.
- `criteria.csv` — TYPENOURITURE_PARAMS × INTERVAL_PETITM (5 776 / 7 565):
  type id, parameter name, n, class 2 / 3, m and M with exponents, kind of m
  (absent / non spécifiée / spécifiée), unit, c where derivable from the
  intervals.
- `regulations.csv` — GLF_CRITERES (176) + LISTE_REGLEMENTATIONS: id, title,
  text.
- `memory.csv` — client, designation, lieu per sample since 2023 (the client
  memory of slice A, already importable at `/admin/import`).

### J2 — Import (`/admin/import`, analyse → commit, idempotent, audited)
- Regulations first (→ `Regulation.legacyId`).
- Types: matched to the existing 131 by normalised name. **Default for Q39:**
  a type present in both keeps the **workbook's criteria** (September, newer)
  and gains the legacy regulation and legacy id; a type only in the old
  software is created with its legacy criteria under a norm version
  « Ancien logiciel » (so the workbook's versions stay distinguishable); the
  **411 types unused since 2025 are imported inactive** (admin reactivates in
  one click). All editable.
- Parameters matched with the existing alias matcher (`criteria-match.ts`);
  unmatched parameters listed on screen, never created silently.
- The analyse step shows: types new / matched / inactive, criteria new,
  parameters unmatched, regulations new.

**Definition of done J:** on dev then production, the catalogue shows 634
types (223 active), a legacy-only type carries its criteria and its
regulation, the 131 workbook types kept their criteria, re-running the
import changes nothing.

---

## 5. Slice K — Recette and go-live preparation *(with the laboratory)*

- Recette with the lab's own staff: TESTPLAN L6 (visits and deposits), M6
  (criteria), P and Q (this batch) — sign-off rows filled.
- Delete the test data on production (séries 16/26 → 21/26 and their
  reports / audit kept as history per the lab's choice), demo accounts off
  (`scripts/disable-demo-accounts.sh`), `NEXT_PUBLIC_DEMO_MODE=false`.
- DNS / e-mail (Resend) when the lab gives access — until then every e-mail
  is `SIMULE`.
- Q30 (invoice print models) when answered.

---

## 6. Order, effort, dependencies

| Slice | Effort | Depends on | Blocks |
|---|---|---|---|
| H — small changes | 1 day | nothing | — |
| I — regulation per sample | 2 days | nothing (seeded list; Q38 only confirms the list) | J's regulation import plugs into it |
| J — old catalogue | 2–3 days | Docker running the Firebird base; Q39 defaults | — |
| K — recette, go-live | with the lab | H, I, J | go-live |

Build **H → I → J → K**. Every slice: tests, lint, build, browser at
1440×900 on dev, deploy, browser on production, docs (PROGRESS, HANDOFF,
TESTPLAN, this file's status), commit, push.

---

## 7. As built — slice H (2026-10-01)

| Point | What the code does | Where |
|---|---|---|
| H1 | `singleLimit()` covers m alone, M alone and **m = M** (360 criteria, 118 of them with c ≥ 1); up to c units above ⇒ ACCEPTABLE. On the report a tolerated unit prints amber, not red | `interpretation.ts`, `report-html.ts` |
| H2 | « Type de produit » removed from the report; no other document printed it | `report-html.ts` |
| H3 | `EmailType.DESTRUCTION` (migration `20261001100000`); `notifyDestroyed()` after the reception of a série and after a counter deposit — one e-mail per série, to the report recipients, journal `DESTRUCTION_NOTIFIED`; a failure never undoes the reception | `destruction-notice.ts`, `destructionEmail()` |
| H4 | R1 … Rn on labels (checked at 60 units: « R60 » fits), bench, reception, deposit | `labels-html.ts`, `series.ts` |

Note for the recette: the default sentence of the scale for ACCEPTABLE
speaks of « unités comprises entre m et M »; with a single limit the
tolerated unit is above the limit. The laboratory can reword it in
`/admin/reglages` → Échelle de conclusion.

## 8. As built — slice I (2026-10-01)

| Point | What the code does | Where |
|---|---|---|
| Catalogue | `Regulation` (title, text, active, order, `legacyId`); `/admin/reglementations` (create, edit, archive, near-duplicate check); seeded « Arrêté conjoint n° 624-04 du 8 avril 2004 »; slice C's free texts migrated into entries | migration `20261001120000_regulations`, `api/regulations` |
| Defaults | `ProductType.regulationId` (picker on the type page), `LabSettings.regulationMicroId / regulationChimieId` (pickers in Réglages) | `RegulationEditor`, `LabSettingsForm` |
| Choice | Validation screen: « Réglementation en vigueur » select; proposal = sample's own → client product's last choice → type → family (`proposeRegulation`); **required** for a sample with a product type — the API refuses validate / approve without one (400); the admin may change it until approval | `ValidationPanel`, validation route, `regulation.ts` |
| Memory | The choice is written on the sample and on its `ClientProduct.regulationId`; journal `SAMPLE_REGULATION_SET` | validation route |
| Report | `Report.regulation` = the chosen text, frozen at approval; a sample without choice takes the proposal | `createReportFor` |

## 9. As built — slice J (2026-10-01)

| Point | What the code does | Where |
|---|---|---|
| Extraction | `scripts/legacy/extract-legacy.py` runs isql in the Docker container of the restored base and writes `legacy-export/` (ignored by git): `regulations.csv` (176), `types.csv` (634, with the last use), `criteria.csv` (5 776, intervals flattened), `clients.csv` (2 329 active clients, one e-mail), `memory.csv` (76 198 samples since 2023). The base mixes UTF-8 and cp1252 in one column: decoded byte run by byte run | `scripts/legacy/` |
| Parsing | `derivePlan`: TYPE_PM 1 → ABSENCE; 2 or qualitative → UNSPECIFIED (one limit at most); 3 → VALUE with m = line « satisfaisant », M = line « acceptable »; value = MAXVAL × 10^EXP_MAX; n = NBR when set, **else 1** (the units are the sample's); c = CONTROL (null when unknown — 41 three-class criteria, listed) | `src/lib/legacy-catalogue.ts` + tests |
| Import | `/admin/import` → « Catalogue de l'ancien logiciel », analyse then commit, one transaction, idempotent (re-run writes nothing). Types matched by name to the 131 of the workbook keep the workbook's criteria and gain the legacy regulation (117 linked); the other 399 are created with their criteria, **270 inactive** (unused since 2025); duplicates by name in the old base (634 → 530) merged on the most recently used. Parameters matched through the alias matcher; unknown ones listed (890 rows, chemistry mostly), created only on request | `api/admin/import/legacy`, `ImportLegacy` |
| Result on dev and production | 530 types (260 active), 3 020 criteria, 178 regulations, 11 norms / 16 versions added | — |

Known limits: the 41 three-class criteria without c read as c = 0 until the
admin fills c (`/admin/types-produits/[id]`); 890 criteria rows of unknown
parameters (pH, metals, mycotoxins, water chemistry…) wait for those
parameters to exist in the catalogue — a re-import then adds them; 13
regulation texts the old base held several times are kept apart, titled
« … (2) », « … (3) » (each still proposed by the types that pointed at it),
for the laboratory to merge (Q38).

## 10. Slice K — what is ready, what the laboratory does

Ready now, in `legacy-export/` on the development machine (never in the
repo): `clients.csv` and `memory.csv`. At go-live, in this order, in
`/admin/import`: **Clients** (clients.csv) → **Mémoire des clients**
(memory.csv, matches the clients by name) → then the sampler's corrector
knows the history. The catalogue (regulations, types, criteria) is already
imported in production.

Still the laboratory's: the recette (TESTPLAN L6, M6, P, Q), Q38 (is the
old regulation list current — 175 texts are in `/admin/reglementations`,
editable), Q39 confirmation of the defaults above, Q30, DNS for the e-mails,
real user accounts (then `scripts/disable-demo-accounts.sh`,
`NEXT_PUBLIC_DEMO_MODE=false`), and the deletion of the test séries on
production (16/26 → 23/26 and their reports).

