# CRITERES.md — Phase 9, chantier 2 : catalogue, critères m/M et résultats par unité

> **The build spec for the second workstream** — read after `AGENTS.md`,
> `HANDOFF.md` and `WORKFLOW.md` (chantier 1, the série). It is written from
> the laboratory's own interpretation criteria — the workbook « critère
> d'interprétation des résultats » it provided on 2026-09-14 — and from the
> facts read in the old Firebird database. The workbook itself stays outside
> the public repository (it names clients); the structure and the counts
> below are what the code is built on.

---

## 1. What the laboratory gave us

One sheet, 1 493 rows, one block per **product type**: a title row
(« SALADES AVEC SOURCE PROTEIQUE », « PLATS CUISINÉS A BASE DE VIANDE »…),
a column-header row (Microorganismes · Norme · Unité · Plan
d'échantillonnage (n, c) · Limite (m, M)), then one row per parameter.

Read with a script (`Desktop\quali\analyse\criteres-parsed.json`, outside
the repo):

| Fact | Value | Consequence |
|---|---|---|
| Product types | **131** (one « AUTRES » catch-all of 56 parameters) | A `ProductType` catalogue; the old database had 634 — the workbook is the *current* list to confirm (Q27) |
| Types named after a client | **35** (a client's own products: yeasts, emulsifiers, glazes…) | Client-specific criteria: `ProductType.clientId`, proposed first to that client |
| Rows type × parameter × norm | **1 101** | ≈ 8 per type, up to 56 |
| Parameter labels | **62** distinct, ≈ 45 once naming variants merge (« Recherche des Salmonella » / « Recherche de Salmonella », « /375g » inside the label vs in the unit, « sulfito-réductrices » / « sulfito-réducteurs ») | An alias table at import; one canonical `AnalysisParameter` per germ |
| Norms | **44** (« NM ISO 6579-1:2017 », « NM ISO 4833-1:2014 »…), plus « calcul », « RT-PCR », « (MI)* » | A `Norm` with a **version** and an effective date |
| **Two norm versions side by side** | **128 of 131 types** list the same parameter twice (2017 + 2021 for Salmonella, 2014 + 2023 for the count at 30 °C, 2019 + 2022 for staphylococci) — 237 pairs | The criteria do not change between versions; the report must print the version in force at the analysis date (Q26) |
| Sampling plan | **n = 5 on every row**; c ∈ { ∅ (643), 1 (210), 2 (235), 3 (13) } | Results are read **per unit** (5 values), the conclusion follows the 3-class plan |
| Limits m / M | 658 + 672 in scientific notation written « 1.102 » = 1·10², « 1.5.106 » = 1,5·10⁶; 27 plain integers (« 1 », « 3 », « 6 »); 2 ambiguous (« 1.8 » on cereals for children, Q25) | A strict parser: `^(\d+(\.\d)?)\.10(\d)$` → mantissa × 10^exponent, plain integers as is, anything else flagged |
| « Valeur "m" absente » | 311 rows (all the *Recherche de …* : Salmonella /25 g, Listeria /25 g…) | **Absence** criterion: absent in the stated mass = satisfactory, present = unsatisfactory |
| « Valeur "m" non spécifiée » | 110 rows, M given | **M only**: ≤ M satisfactory, > M unsatisfactory |
| m given, M empty | 421 rows | **m only**: ≤ m satisfactory, > m unsatisfactory |
| m and M given | 668 rows (324 without c, 344 with c) | **3-class** when c is set; when c is empty the lab reads m as the target and M as the ceiling (Q25 confirms the reading) |
| Units | ufc/g (762), /25g (280), /375g, /10g, /1g, /250g, ufc/ml, « - » (a ratio « calcul », a stability test) | Unit on the criterion, not only on the parameter: the same germ is counted per g here and searched per 25 g there |

## 2. Design rules

1. **Criteria are data, never code.** A product type, a parameter, a norm
   version, an (n, c, m, M) plan are rows an ADMIN edits; the code only
   interprets. The workbook is imported by a script with a dry run and a
   human-readable diff, never retyped.
2. **The parameter is the germ; the norm is dated.** One `AnalysisParameter`
   per canonical germ (aliases merge at import), one `Norm` per code, its
   versions with an effective date. A result stores the norm version it was
   read under; the report prints it.
3. **Results are read per unit.** A line with `unitCount = 5` carries five
   values (A…E), each typed as on the bench sheet (« 0(-1) », « <10 »,
   « 1,2.10² », « Absence »). The final value per unit is derived; the
   conclusion per parameter is derived from the five; the conclusion per
   sample from all parameters. Nothing is recomputed by hand.
4. **One interpretation engine, pure and tested.** `interpret(plan, values)`
   returns SATISFAISANT · ACCEPTABLE · NON_SATISFAISANT · INCOMPLET with the
   counts that justify it. It is the same function on the bench, at
   validation and on the report.
5. **The report reads like the lab's reports.** Columns m / M / n / c next to
   the values, the norm version, the conclusion in the laboratory's own
   words (a `ConclusionScale` the admin edits), client-specific types named
   as the client names them.
6. **Additive, reversible.** New tables and nullable columns; today's single
   `limitValue` per parameter keeps working until a criterion exists for the
   sample's product type; restore point tagged before the first deploy.

## 3. Data model delta (Prisma sketch)

```prisma
model ProductType {
  id        String   @id @default(cuid())
  name      String                       // « SALADES AVEC SOURCE PROTEIQUE »
  family    Family                       // MICRO | CHIMIE (which criteria it carries)
  clientId  String?                      // 35 types belong to one client
  active    Boolean  @default(true)
  legacyId  Int?     @unique
  criteria  Criterion[]
  @@unique([name, clientId])
}

model Norm {                              // « NM ISO 6579-1 »
  id        String   @id @default(cuid())
  code      String   @unique
  versions  NormVersion[]
}
model NormVersion {                       // « :2021 », in force since …
  id        String   @id @default(cuid())
  normId    String
  version   String                       // « 2021 »
  label     String                       // « NM ISO 6579 - 1:2021 » as printed
  effectiveFrom DateTime? @db.Date
  supersededOn  DateTime? @db.Date
  @@unique([normId, version])
}

enum LimitKind { VALUE ABSENCE UNSPECIFIED }
enum Interpretation { SATISFAISANT ACCEPTABLE NON_SATISFAISANT INCOMPLET }

model Criterion {                         // one row of the workbook
  id            String   @id @default(cuid())
  productTypeId String
  parameterId   String
  normVersionId String?
  unit          String                   // « ufc/g », « /25g »
  n             Int      @default(5)
  c             Int?                     // null = 2-class plan
  mKind         LimitKind @default(VALUE)
  m             Float?                   // 1e2
  M             Float?                   // 1e4, null = m only
  active        Boolean  @default(true)
  @@unique([productTypeId, parameterId, normVersionId])
}

model ConclusionScale {                   // the words printed for each verdict
  interpretation Interpretation @id
  label          String                  // « Satisfaisant »
  sentence       String                  // « … conforme aux critères … »
}

// Sample: + productTypeId String?         (picked on the line, or at reception)
// Result: + normVersionId String?, interpretation Interpretation?,
//           units ResultUnit[]            (one per unit letter)
model ResultUnit {
  id        String  @id @default(cuid())
  resultId  String
  unitIndex Int                          // 1…n → letter A…
  rawValue  String                       // « 0(-1) », « <10 », « Absence »
  value     Float?                       // derived count, null for absence / < detection
  detected  Boolean?                     // absence tests
  @@unique([resultId, unitIndex])
}
// Report: + interpretation Interpretation, conclusionText String
```

`AnalysisParameter` gains `aliases String?` (the naming variants of the
workbook) and keeps `limitValue` as the fallback when no criterion exists.

## 4. The interpretation engine (`src/lib/interpretation.ts`, pure)

```ts
interpret(plan: { n, c, mKind, m, M }, units: UnitValue[]) →
  { verdict: Interpretation; countAboveM: number; countBetween: number;
    missing: number; reason: string }
```

- Fewer than `n` values → INCOMPLET (the bench is not finished).
- ABSENCE plan → any `detected` → NON_SATISFAISANT, else SATISFAISANT.
- m only (M null) → any value > m → NON_SATISFAISANT, else SATISFAISANT.
- M only (mKind UNSPECIFIED) → any value > M → NON_SATISFAISANT, else
  SATISFAISANT.
- 3-class (m, M, c) → any value > M → NON_SATISFAISANT; more than c values in
  ]m, M] → NON_SATISFAISANT; 1…c values in ]m, M] → ACCEPTABLE; all ≤ m →
  SATISFAISANT.
- Values « < x » count as x⁻ (below any limit ≥ x); a raw reading
  « 0(-1) » derives to « < 10 » through the dilution rule of Q9.
- Sample verdict = the worst of its parameters; the report prints the
  scale's sentence for it (Q28 for the exact wording).

Tests: one case per plan kind, the boundary (= m, = M), the c edge
(c and c + 1 values between), missing units, absence.

## 5. Import of the workbook (`scripts/import-criteres.ts`)

1. Parse the blocks (title row → header row → parameter rows); stop at the
   first empty title.
2. Normalise the parameter label through the alias table (case, accents,
   « /375g » moved to the unit, « Recherche de / des »); unknown labels are
   listed in the dry-run report, never created silently.
3. Parse the norm into `code` + `version` (« NM ISO 6579 - 1:2017 » →
   « NM ISO 6579-1 », « 2017 »); special methods (« calcul », « RT-PCR »,
   « (MI)* ») become norms without version.
4. Parse m / M with the strict pattern; « Valeur "m" absente » →
   ABSENCE, « Valeur "m" non spécifiée » → UNSPECIFIED; anything else →
   the dry-run report (the two « 1.8 » of Q25).
5. Client-named types → `clientId` through a mapping the admin confirms
   (the 35 names contain the client's short name).
6. Dry run prints: types created, parameters matched / unmatched, norms and
   versions, criteria per plan kind, rows refused with the reason. The real
   run is idempotent (upserts on the unique keys) and audited.

## 6. Screens and routes

| Role | Screen | Route | API |
|---|---|---|---|
| ADMIN | Types de produits (list, search, client filter, activate) | `/admin/types-produits` | `GET/POST /api/product-types`, `PATCH …/[id]` |
| ADMIN | Critères of a type (grid parameter × n / c / m / M / norm version) | `/admin/types-produits/[id]` | `PUT /api/product-types/[id]/criteria` (whole grid, one transaction) |
| ADMIN | Normes et versions | `/admin/normes` | `GET/POST /api/norms`, `PATCH …/[id]` |
| ADMIN | Échelle de conclusion (the words) | `/admin/reglages` | `PUT /api/admin/conclusion-scale` |
| PRELEVEUR, RECEPTIONNISTE | Type de produit on a line (search; the client's own types first; profile of the type pre-ticks the parameters) | line editor | `GET /api/product-types?q=&clientId=` |
| TECHNICIEN | Bench grid: one column per unit (A…E), raw reading + derived value, live verdict per parameter | `/technicien/[id]` | `PUT /api/samples/[id]/results` (units array) |
| VALIDATEUR, ADMIN | Verdict per parameter and per sample, editable conclusion text | `/validation/[id]` | existing routes + `interpretation` |
| all | Report with m / M / n / c, norm version, verdict per parameter, conclusion sentence | `/api/samples/[id]/report` | `report-html.ts` |

The existing single-value entry keeps working for a sample without product
type or with `unitCount = 1` (n = 1 plan).

## 7. Slices — each one deployed and tested in the browser

| # | Weeks | Content | Definition of done |
|---|---|---|---|
| 1 ✅ | 1–2 | Schema + migration; `Norm` / `NormVersion` / `ProductType` / `Criterion` / `ConclusionScale`; alias table; `scripts/import-criteres.ts` with dry run; admin screens for types, criteria, norms | The workbook imported on the dev database with 0 refused rows besides the ones the lab must settle (Q25); the admin edits a criterion without code |
| 2 ✅ | 3 | Product type on the line (préleveur, deposit, « Corriger la fiche »), the type's parameters as the line's default profile, client-specific types first | A visit line picks « Salades avec source protéique » and gets its parameters ticked |
| 3 ✅ | 4 | `ResultUnit` + bench grid per unit + `interpretation.ts` (tests) + live verdict | A sample with n = 5 read on the bench, the verdict changes as values are typed |
| 4 ✅ | 5 | Validation with verdicts, report with criteria columns, norm version and conclusion sentence; contamination alerts driven by the verdict | A report matches the lab's own layout for a 3-class case, an absence case and an M-only case |
| 5 ◀ | 6 | Recette on real product types with the lab; old `limitValue` path retired where a criterion exists; docs; sign-off | TESTPLAN checkpoint M signed |

### What was actually shipped (2026-09-18)

Slices 1–4 are code-complete and verified on the dev server (TESTPLAN
checkpoint M). Differences from the plan above, all deliberate:

- the import is **an admin screen**, not `scripts/import-criteres.ts`: the
  laboratory must be able to re-import a corrected workbook itself, and the
  same endpoint serves the dry run and the commit;
- the germ matching lives in `AnalysisParameter.aliases` (one spelling per
  line) plus a key that folds « Recherche de/des », the mass suffix, the
  « -1 / -2 » of two norm rows and the incubation temperature — the workbook
  writes one germ up to four ways;
- a germ **without** a criterion keeps the old `limitValue` path on the same
  sample; the sample's verdict then folds that boolean in, so a report can
  never conclude « conforme » above a line printed « Non conforme »
  (`sampleVerdict` in `src/lib/interpretation.ts`);
- changing the product type, the number of units or the analyses through
  « Corriger la fiche » deletes the results: a verdict read under other
  criteria must not reach the report.

## 8. Open questions (NEEDEDINFO Q25–Q29)

Q25 the m / M notation and the two « 1.8 »; Q26 which norm version is in
force per parameter and since when; Q27 is the workbook the complete
current list (131 types vs 634 in the old database) and which client each
client-named type belongs to; Q28 the exact conclusion wording per verdict
and whether the five values or only the verdict print on the report (Q10);
Q29 the dilution / detection rule to derive the final value from a raw
reading (Q9). None blocks slice 1 (the catalogue and the import); Q28–Q29
block slices 3–4.
