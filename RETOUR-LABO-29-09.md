# RETOUR-LABO-29-09.md — the laboratory's answers of 29/09 and what they change

> **Status (2026-09-29, evening):** slices **A → F implemented, tested and
> verified in the browser on the dev server**, then deployed (§7 records what
> was decided while building). **Not implemented, on purpose:** Q31 — the rule
> of c stays as the engine applies it today (c tolerates units between m and
> M; a single limit tolerates none) until the laboratory answers. Q32–Q37 run
> on the documented defaults of §7. Remaining: slice G's recette with the lab.
>
> Input: the laboratory's
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

---

## 7. As built (2026-09-29) — decisions taken while implementing

| Point | What the code does | Where |
|---|---|---|
| Units taken ≥ plan's n | The plan is applied to **every** unit taken (9 taken for n = 5: a 9th unit above M still fails); c unchanged | `judgeUnits` in `src/lib/interpretation.ts` |
| Units taken < plan's n | `Result.interpretation = null`, `Result.informalInterpretation` = worst unit (≤ m satisfaisant, m–M acceptable, > M non satisfaisant, no c). The sample gets **no official conclusion** if one germ is only indicative; the report says why; the e-mail gives the indicative one, marked « indicative » | `informalVerdict`, `sampleVerdict`, `indicativeVerdict`, `NO_OFFICIAL_VERDICT` |
| A sensitive germ indicatively non satisfaisant | **Still raises the contamination alert** (the contamination is real) | `sendContaminationAlerts` |
| « Non spécifié » without M (101 imported criteria) | Found by the circuit test: the engine returned INCOMPLET for ever, so such a sheet could never be submitted. Now: read, printed « Non spécifié », **no verdict**; a sample with nothing judged concludes « sans interprétation » | `hasLimit`, `nothingJudged`, `NO_CRITERION` |
| Per-repetition reading | Every parameter of a line with n > 1, criterion or not; the line's value is the worst unit; the sheet cannot be submitted with a blank repetition | results route, submit route, `ResultEntryForm` |
| Ceiling | 999 units (technical); letters go on past ZZ (AAA…) | `MAX_UNITS`, `unitLetter` |
| Names (Q36 default) | Report and validation screen: **R1 … Rn**; bench: « R1 · A »; labels keep the letters — *superseded 2026-10-01: R1 … Rn everywhere (Q36 answered, `RETOUR-LABO-30-09.md` H4)* | `repetitionLabel` |
| Report | Header table « Réglementation en vigueur » with the X; Paramètres · Méthode · Unité · R1 … Rn · m · M (n, c beneath); « Non détecté » for an absence reading, « Non spécifié »; over-M units in red, m–M in amber; one page (three densities, tighter margins, a second band beyond ten repetitions); criterion and regulation **frozen** with the result / report | `report-html.ts`, `Result.criterion`, `Report.regulation`, `report-onepage.test.ts` |
| Regulation text (Q32 default) | Empty until the lab gives it: per product type (`/admin/types-produits/[id]`), else per family (`/admin/reglages`); empty prints « — » | `ProductType.regulation`, `LabSettings.regulationMicro/Chimie` |
| Alert timing | `alertAfterTechnicalValidation` = true (migration + schema default); units in the column headers | migration `20260929100000`, `alertEmail` |
| Destroyed at reception (Q35 default) | Received and numbered (prints « Détruite à réception » on the protocol / bon), then cancelled `DETRUIT_A_RECEPTION`, audited `SAMPLE_CANCELLED`; **not invoiced** (only validated samples are billable), client not notified — *since 2026-10-01 the client is told by e-mail (Q35, H3)*; « Réactiver » brings it back held in « Échantillons bloqués ». The global switch `blockNonConformAtReception` is gone from the screens (column kept) | `reception-input.ts`, `serie-create.ts`, reception route |
| One account per sampler | The visit form shows the signed-in sampler, locked; the API refuses another sampler's id from a PRELEVEUR (the réception still keys a paper protocol in a sampler's name) | `VisitForm`, `createSerie` |
| Search | `/recherche` for every lab role (the technician stays on his bench): client, période (réception / prélèvement), type d'analyse, état (en cours / terminées / annulées), text; paginated; report link | `sample-search.ts`, `sample-search-server.ts` |
| Export (Q37 default) | `GET /api/samples/export` with the search's filters: N° BC (= N° de série), N°, date de réception, nom produit, analyses, lot, conclusion; cancelled lines left out unless asked; audited `SAMPLES_EXPORTED`; client page « Synthèse des analyses » over a period | export route, `ClientSummary` |

---

## 8. The answers of 30/09 to Q31–Q37, and what they change

| # | Answer | Consequence | State |
|---|---|---|---|
| Q31 | 3-class plan (m < M): any unit above M fails; up to c units between m and M = acceptable, more = non satisfaisant. A single limit (m = M, or one limit only) tolerates c units above it, shown **Acceptable** | 3-class: the engine already does this. Single limit: `interpret` and `informalVerdict` must count c above the limit (today any unit above fails) | 🔧 to build |
| Q32 | Regulation depends on the sample; the technical validator selects it, « at least the first times » | A regulation catalogue (import the old software's 176 sources, editable), a choice on the validation screen proposed from the product type and the last choice for the same client product, frozen on the report. The per-type / per-family texts of slice C become the proposal | 🔧 to build · Q38 |
| Q33 | « Keep the 634, we can edit them » | Import the old software's 634 product types with their criteria (TYPENOURITURE_PARAMS + INTERVAL_PETITM) from the Firebird base — needs Docker running | 🔧 to build · Q39 |
| Q34 | Types are internal families; the client never sees them on the report nor the protocol | Visible to every client (already so); **remove « Type de produit » from the report** (the protocol never printed it) | 🔧 small |
| Q35 | Not invoiced (already so); the client **is** informed | An e-mail to the client's report recipients when a line is destroyed at reception (new e-mail type) | 🔧 small |
| Q36 | R1, R2, R3 everywhere, labels included | Labels, bench sheet, bench grid, reception screens: R1 … Rn instead of letters | 🔧 small |
| Q37 | N° BC = N° de série | Already so | ✅ |

Still open: Q38 (is the old regulation list current), Q39 (overlap between
the 634 and the September workbook; the 411 unused types), Q30 (billing
print models).

**The plan for this work is `RETOUR-LABO-30-09.md` (slices H → K).**

