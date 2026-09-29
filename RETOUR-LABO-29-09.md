# RETOUR-LABO-29-09.md — the laboratory's answers of 29/09 and what they change

> **Status (2026-09-29):** planned, not started. Input: the laboratory's
> written answers to the fourteen questions of 19/09 (a Word document with
> seven screenshots, kept outside the public repo), plus a message after
> they re-tested the platform: « le correcteur pour la désignation des
> échantillons n'est pas encore actif ? ». Seven slices, **A → G**, each
> deployed and verified in the browser before the next. Slice B's first rule
> waits on **Q31** (§6); everything else can start now.

This batch touches three existing specs: the série circuit (`WORKFLOW.md`),
the criteria and their engine (`CRITERES.md`), and the report and its e-mail
(Phase 3). Where a rule here contradicts one of them, **this file wins** and
the older spec gets a pointer.

---

## 1. What the laboratory answered (one line each, with the decision)

| # | Topic (question of 19/09) | Answer | Status |
|---|---|---|---|
| 1 | Notation « 1.102 » = 1·10², « 1.5.106 » = 1,5·10⁶ | Confirmed, with a table of their notations (counts, plain integers, « Absence », a single limit, « Non spécifié ») | ✅ already so |
| 2 | The two « 1.8 » limits (cereals for children, coliforms) | « Vous pouvez enlever cette catégorie de critère » | ✅ already refused at import, not in the database |
| 3 | m and M without c | A criterion without m/M is **one value not to exceed**; c is **the number of repetitions allowed above the limit**. Their example (n = 5, c = 2, « 2 au-dessus ⇒ non conforme ») contradicts the regulatory reading — see **Q31** | ❓ Q31 |
| 4 | Units taken below the plan's n | A sample done once instead of five times gets **no interpretation on the report**; the **e-mail** carries an unofficial one (satisfaisant < m, acceptable between m and M, non satisfaisant > M) | 🔧 slice B + D |
| 5 | Norm versions | Always the latest; changing a norm must not alter old reports | ✅ already so |
| 6 | The 131 product types | Not understood (« C'est quoi les 131 ? »). They want to **add or remove types easily**, with **a corrector against near-duplicates** | 🔧 slice A; ❓ Q33 |
| 7 | Types named after a client | Not understood (« C'est quoi les types ? ») | ❓ Q34 |
| 8 | Conclusion wording | A **table**: Satisfaisant (< m) / Acceptable (m < X < M) / Non satisfaisant (> M), under a « Réglementation en vigueur » text; **always one page per sample** | 🔧 slice C |
| 9 | Print every unit | Yes: **one column per repetition, R1 … Rn** (their histamine example has R1 … R9 in mg/kg) | 🔧 slices B + C |
| 10 | Dilution rule | « 3(-2) » = 300, « 0(-1) » = « < 10 », the parameter's factor multiplies the reading | ✅ already so |
| 11 | Beyond 26 units | Possible and maybe frequent: **no limit** | 🔧 slice B |
| 12 | Série number | Given at registration, never visible to the sampler before | ✅ already so |
| 13 | Sampler's function / entry for a colleague | **Each sampler has his own account, no shared account**, for traceability | 🔧 slice E |
| 14 | Non-conform at reception | Optional, **case by case: analysed anyway or destroyed**; printed **only on the bon de réception** | 🔧 slice E (the report already omits it) |
| 15 | Contamination alert timing | **After technical validation**, well before the final approval, in the format of their example | 🔧 slice D (the format already matches their model of 17/08) |
| 16 | *New* — data exploitation | Per client, a **summary over a period, exported to Excel**: N° BC, N°, date de réception, produit, analyse, lot, conclusion | ➕ slice F |
| 17 | *New* — search | Search the analyses **done or in progress** by **client**, by **date**, by **analysis type** | ➕ slice F |
| 18 | *Message* — the designation corrector | « pas encore actif ? » — see §2 | 🔧 slice A |

---

## 2. The designation corrector — diagnosis

It exists (`knownTwin` in `src/components/preleveur/LineEditor.tsx`, the
client memory `ClientProduct` / `ClientPlace`, `resolveProduct` in
`src/lib/serie-create.ts`), which is why nothing was flagged as missing. It
does far less than the laboratory expects:

1. **It only matches identical spellings** once case, accents and spaces are
   folded (`normalizeLabel`). « Salde composée » is not recognised as
   « Salade composée ». The laboratory asks for a corrector against **typing
   errors**.
2. **Its memory is nearly empty in production.** It only learns from visits
   entered in the new system; checked on 29/09: two known products for two
   clients (test entries), zero for the others. The history of the old
   software was never loaded.
3. **It does not exist on product types**, where they ask for it too.

---

## 3. Design rules for this batch

1. **The report follows the laboratory's model, not ours.** Their screenshots
   are the specification: header table, R1 … Rn columns, a « Méthode »
   column, m / M with « n = … c = … » beneath, « Non spécifié » and
   « Absence » in the criteria column, one page per sample.
2. **No official verdict on too few units.** When the units read are fewer
   than the plan's n, the report prints results and criteria without a
   verdict; the unofficial verdict lives only in the e-mail body.
3. **A corrector proposes, never imposes.** « Vouliez-vous dire … ? » with
   one click to accept; typing a genuinely new designation stays possible.
4. **One account per person.** Nothing in the sampler's screens lets him act
   in someone else's name.
5. **Every per-case decision is traced.** Destroying a sample at reception
   is a coded, audited action, like every other correction verb.
6. **Unchanged:** blind numbering, double validation, audit, frozen reports,
   dated norm versions.

---

## 4. Slices — each one deployed and verified in the browser

### A — The corrector, and a memory that knows the history *(starts now)*

- A pure similarity function (`src/lib/similar.ts`, tested): normalised
  Damerau–Levenshtein distance plus a token check, returning the best
  candidates above a threshold (« Salde composée » → « Salade composée »,
  « Poulet roti » → « Poulet rôti », no false match between two genuinely
  different products).
- **Visit and deposit forms:** under « Désignation » and « Lieu / section »,
  « Vouliez-vous dire « … » ? » with a one-click accept, fed by the client's
  memory; the existing exact-match rewrite stays.
- **Product types:** creating a type whose name is close to an existing one
  shows the near-duplicates and asks for confirmation; the line's product
  type picker gets a search box with the same tolerance.
- **Memory backfill:** an admin import (`/admin/import`, same analyse →
  import pattern as the criteria workbook) that loads, per client, the
  designations and places of the old software, from a CSV exported from the
  legacy database on the developer's machine. Plus a one-off backfill from
  the samples already in the new database. Nothing is written before
  confirmation; re-running is idempotent.

### B — The interpretation engine, per repetition for every parameter

- **Rule of c** (after Q31): on a single limit, or when m = M, c counts the
  units allowed above the limit — today it is ignored there, so a plan like
  m = M = 1.10², c = 1 wrongly fails on one unit.
- **Too few units:** units read < plan's n ⇒ `interpretation = null` on the
  result (no official verdict), plus an `informalVerdict` computed on the
  units read, for the e-mail. Replaces today's `effectivePlan`, which caps n
  and prints a verdict.
- **Per-repetition reading for every parameter** when the line's n > 1,
  criteria or not: the bench grid and `ResultUnit` stop being reserved to
  germs with a product-type criterion (histamine, n = 9, mg/kg, decimals).
  The line's summary value stays the worst unit.
- **No limit on units:** `MAX_UNITS` 50 → a technical ceiling of 999;
  repetitions named **R1 … Rn** on the bench and the report (labels: see
  Q36); `unitLetter` no longer caps at 702.

### C — The report on the laboratory's model

- **Header table** « Réglementation en vigueur » | Satisfaisant (< m) |
  Acceptable (m < X < M) | Non satisfaisant (> M), with an X in the verdict's
  column; left blank when rule 2 applies.
- **Regulation text** per product type (new nullable field
  `ProductType.regulation`, admin-editable, with a default per family in
  `/admin/reglages`) — content per Q32.
- **Results table:** Paramètres | Méthode (the norm version) | Unité |
  R1 … Rn | Critères (m | M, and « n = … c = … » beneath); « Non spécifié »
  when the germ has no criterion; « Absence » for an absence test, whose
  readings print « Non détecté ».
- **One page per sample, always:** compact rows, a font that steps down with
  the number of parameters and repetitions, a second band of R columns
  beyond a width threshold; a test renders the heaviest real case (all germs
  of the largest product type, n = 9) and asserts one page.

### D — The report e-mail and the alert

- **Report e-mail:** the summary table of their model — N° dossier (série),
  N° de contrôle, date de prélèvement, date de réception, analyse (nature),
  produit, lot, **conclusion**, lieu de prélèvement. The conclusion is the
  official verdict, or the unofficial one of rule 2 when the report has none.
- **Alert after technical validation:** switch
  `alertAfterTechnicalValidation` on (production and seed default). The
  e-mail already carries their columns; units move into the column headers
  as in their example.

### E — Reception case by case, one account per sampler

- **Non-conform line:** the réceptionniste chooses « Analyser malgré tout »
  or « Détruire ». Destroy = the line is cancelled with a new coded motif
  `DETRUIT_A_RECEPTION` (audited, no analysis; invoicing per Q35). The
  global switch `blockNonConformAtReception` is retired (migration keeps the
  column, the screen stops using it). The non-conformity keeps printing on
  the bon de réception only.
- **No entry in a colleague's name:** « Prélèvement effectué par » is the
  signed-in sampler, locked; the external kinds (service vétérinaire, autre)
  stay. `samplerUserId` from another sampler is refused server-side.

### F — Finding and exporting the analyses

- **Search** (`/recherche`, all laboratory roles; the sampler keeps his own
  blind search): filters **client**, **période** (réception or prélèvement),
  **type d'analyse** (the 16 natures), **état** (terminée / en cours), plus
  the existing free text. Server-side, paginated.
- **Per-client summary over a period** on the client's page, with an
  **Excel export** (`exceljs`, already a dependency): N° BC (série — see
  Q37), N° (contrôle), date de réception, produit, analyse, lot, conclusion;
  one row per sample, sorted by date. Audited download.

### G — Recette and documents

TESTPLAN checkpoint P (one box per point above, observed in the browser on
the dev server and in production), docs, and a one-page summary for the
laboratory.

---

## 5. Order and effort

A (corrector) first — it is the laboratory's direct question. Then C + D
(what they see in the recette), B (needed by C for R1 … Rn and rule 2), E,
F. Rough effort for one developer: A 2 days, B 2 days, C 3 days, D 1 day,
E 1 day, F 2 days, G 1 day — about **two and a half weeks**.

---

## 6. Open questions (NEEDEDINFO Q31–Q37)

Q31 the rule of c (their example vs the regulation); Q32 the regulation text
per product family; Q33 what the « types de produits » are, and whether the
131 of their workbook is the complete list; Q34 whether a type named after a
client is reserved to that client; Q35 whether a destroyed sample is
invoiced and whether the client is told; Q36 R1 … Rn everywhere including the
labels, or letters kept on the labels; Q37 whether « N° BC » in their export
is the série number. Only Q31 blocks code (slice B's first rule).
