# WORKFLOW.md — Phase 9, chantier 1 : le circuit de prélèvement et de réception

> **The build spec for the workstream the laboratory asked for first.** Read
> after `AGENTS.md` and `HANDOFF.md`, before touching `prisma/schema.prisma`
> or any préleveur / réception screen. Every rule here comes from the
> laboratory's own practice — the four paper forms it fills today and ten
> years of data in its previous software — compared with this codebase on
> 2026-09-13 (full report outside the repo; summary in `PLAN.md` Phase 9,
> questions in `NEEDEDINFO.md` Q1–Q20).
>
> Restore point before this work: git tag **`v1.0-avant-phase-9`** (branch
> `stable/v1.0-avant-phase-9`) and the production dump
> `qualilab_avant-phase-9.sql.gz` on the VPS — see `DEPLOY.md`, « Point de
> retour ».

---

## 1. Why the circuit changes

The laboratory does not work one sample at a time. A technician visits a
client, fills **one protocole de prélèvement** for the visit and lists up to
eight lines on it: a salad, a chicken dish, a cutting board (surface, 100 cm²),
the chef's hands (personne, lavées), a tank of water… The whole visit travels
under **one N° de série** (« 2754/26 »), arrives in one cooler whose
temperature is read on arrival, and is received in one go. A quarter of the
samples come the other way: the client brings them to the counter and the
receptionist fills a **bon de réception** with the same line structure plus
acceptance rules. Every sample then gets its own **N° de contrôle**
(« 20459/26 »), a yearly sequence, and often consists of **n units** (5 for
most foods, 9 for histamine) that are read separately.

Today's LIMS creates, receives, analyses, validates, sends and invoices **one
sample at a time**, knows **three sample types**, types the site and the place
as free text, holds **no temperatures, dates, quantities or units**, and prints
a **random serial number** per sample. That is the gap the client called
« multiple things missing in the prélèvement ».

Volumes to design for (read from the old database): ≈ 30 000 samples and
≈ 4 300 séries a year, ≈ 7 samples per série, up to 135; 61 % sampled by the
lab, 26 % brought by the client, 11 % by the veterinary service.

## 2. Six design rules (non-negotiable for this chantier)

1. **The série is the unit of work; the sample stays the unit of analysis and
   report.** Every list and every screen operates on a série. **A série has no
   status of its own** — it is derived from its samples (`min`/`max` of their
   statuses). No second state machine, ever.
2. **The nature drives the line form.** Each nature carries a `lineKind`
   (ALIMENT, SURFACE, MAINS, EAU, AIR, AUTRE). Picking the nature shows only
   the fields that exist for it. Temperatures and remarks are optional on
   every kind (a hand swab on the paper carries « T°p 25 °C »).
3. **Everything is picked or derived, nothing is typed twice.** Client → site
   from lists; lieu from the site's memory; product from the client's memory;
   analyses from a profile; numbers from counters; cadre from the sampler
   kind; dates and times typed once in the header. Free text survives only in
   remarks and in the creation of a new list entry.
4. **One transaction per step.** Create the visit with all its lines. Receive
   the série with one button that numbers every sample, records temperatures
   and conformity, and prints labels. (Validate and send the série in one go
   comes with chantier 4.)
5. **Four correction verbs, each with a reason and an audit line.**
   *Corriger la fiche* (identification fields, until approval), *Renvoyer au
   technicien* (exists), *Annuler* (coded motif, terminal), *Amender*
   (chantier 4). Nothing else touches a sample after reception.
6. **Additive migration.** New tables and nullable columns first; a backfill
   that creates one série per existing sample; old routes kept alive during
   the transition; then the switch. Production stays usable at every deploy.

Everything built in Phases 1–7 stays: the state machine and its concurrency
guards, double validation by two people, `logAudit()` on every mutation, blind
numbering towards the préleveur, alerts, the PDF pipeline, invoicing hooks.

## 3. The target circuit

### 3.1 Protocole de prélèvement (préleveur, on site, phone first)

1. **Header, once**: client (search), site (list of the client's sites,
   « Siège » when none), interlocuteur, préleveur (the account, pre-filled),
   `startedAt` (now, editable), client reference (« N° de factures » on the
   paper). `cadre` is derived: SERVICE_VETERINAIRE → OFFICIEL, else
   AUTOCONTROLE; the réception may change it.
2. **Lines** (« + Ajouter une ligne », « Dupliquer la ligne », no limit):
   nature → fields by `lineKind`; désignation from `ClientProduct` (create if
   absent); lieu / section from `ClientPlace` of the site (create if absent,
   quasi-duplicate refused); N° du lot; DLC production / expiration (dates);
   quantité + unité (`UNITE` by default on the field form: the paper says
   « 01 »); T°p / T°a; remarques; number of units `unitCount` (1 by default,
   5 or 9 proposed by the profile); analyses by **profile** of the nature,
   adjustable per line, the last profile used for this client proposed first.
3. **End of visit**: `endedAt`; then on arrival `arrivedAt` and
   `coolerTemperature`. The protocol PDF (cartouche PG04/EN01) prints for the
   interlocutor's signature; the préleveur may attach a **photo of the signed
   sheet** to the série (one tap). Tactile signature is a later option (Q1).
4. The préleveur sees the **N° de série** of the visit (it is on the signed
   protocol) and the line numbers, **never** the N° de contrôle. The blind
   rule of `sampleSelectFor()` is kept.

### 3.2 Bon de réception (réceptionniste, at the counter)

« Nouveau dépôt »: same line structure, `kind = DEPOT`, `samplerKind =
CLIENT` (or SERVICE_VETERINAIRE), `arrivedAt = now`, temperature at arrival
per line (mandatory, rule 6), quantity in grams or litres, analyses by
profile, acceptance checklist, optional advance with receipt (Q4). The
deposit obtains its N° de série and its N° de contrôle immediately and its
samples start at `RECU`. The bon PDF (cartouche PG05/EN04, the seven rules
printed, two signature boxes) prints.

### 3.3 Réception of a série

The reception queue lists **séries** (client · site · préleveur · lines ·
arrived at), not samples, plus an « À corriger » lane. The screen shows the
header (cooler temperature, times) and every line: reception temperature
(pre-filled with the cooler's), quantity, the **computed acceptance
checklist**, conformity with a coded motif, technician proposed by family
(micro / chimie) and editable per line. **One button** « Valider la
réception » runs a single transaction: N° de contrôle for each line, status
`RECU`, audit. Then « Imprimer les étiquettes »: one label per unit
(N° de contrôle + unit letter, Code128 barcode, nature, short product,
client / site, reception date).

### 3.4 After reception

Technician and validation lists are **grouped by série** (the per-sample
screens are unchanged in this chantier; the grid with one column per unit is
chantier 3). The série detail page shows every sample with its status and the
four verbs the role is allowed.

## 4. Data model delta (Prisma sketch)

```prisma
enum SerieKind    { VISITE DEPOT }
enum SamplerKind  { QUALILAB CLIENT SERVICE_VETERINAIRE AUTRE }
enum Cadre        { AUTOCONTROLE OFFICIEL }
enum LineKind     { ALIMENT SURFACE MAINS EAU AIR AUTRE }
enum QuantityUnit { UNITE G ML L }
enum HandsState   { LAVEES NON_LAVEES }
enum SampleStatus { PRELEVE RECU EN_ANALYSE RESULTATS_SAISIS VALIDE RAPPORT_ENVOYE ANNULE }

model Serie {
  id                String   @id @default(cuid())
  kind              SerieKind
  serialNumber      String   @unique          // « 2780/26 » — counter SERIE
  year              Int
  clientId          String
  siteId            String?
  interlocutor      String?
  samplerKind       SamplerKind
  samplerUserId     String?                   // required when QUALILAB
  samplerName       String?                   // when SERVICE_VETERINAIRE / AUTRE
  cadre             Cadre
  clientReference   String?                   // « N° de factures » on the paper
  startedAt         DateTime
  endedAt           DateTime?
  arrivedAt         DateTime?
  coolerTemperature Float?
  signedProtocolData String?  @db.LongText    // photo of the signed sheet (data URI)
  advanceAmount     Decimal? @db.Decimal(12, 2)
  advanceMode       PaymentMode?
  notes             String?  @db.Text
  createdById       String
  createdAt         DateTime @default(now())
  receivedById      String?
  receivedAt        DateTime?
  samples           Sample[]
  @@index([clientId, createdAt])
  @@index([kind, receivedAt])
}

model Site {                                   // a client's sampling site
  id        String  @id @default(cuid())
  clientId  String
  code      String?
  name      String
  address   String?
  city      String?
  phone     String?
  contact   String?
  active    Boolean @default(true)
  legacyId  Int?    @unique
  emails    ClientEmail[]                      // ClientEmail.siteId nullable
  @@unique([clientId, name])
}

model AnalysisNature {
  id        String   @id @default(cuid())
  code      String   @unique                   // MICRO_ALIMENTS, MICRO_SURFACES, PC_ALIMENTS…
  label     String
  labelEn   String?
  family    Family                             // MICRO | CHIMIE | AUTRE
  lineKind  LineKind
  legacyType SampleType                        // ALIMENTAIRE | EAU | AMBIANCE — keeps today's screens alive
  minQuantity     Decimal? @db.Decimal(10, 2)  // acceptance rules (g or ml)
  minQuantityUnit QuantityUnit?
  sortOrder Int
  active    Boolean @default(true)
  legacyId  Int?    @unique
}

model AnalysisProfile {                        // « Micro aliments standard », « Surfaces », « Histamine n = 9 »
  id         String  @id @default(cuid())
  natureId   String
  clientId   String?                           // contractual panel of one client
  name       String
  unitCount  Int     @default(1)
  parameters AnalysisProfileParameter[]
  active     Boolean @default(true)
}

model ClientPlace   { id, clientId, siteId?, label, normalizedLabel, active, usageCount, legacyId? ; @@unique([siteId, normalizedLabel]) }
model ClientProduct { id, clientId, label, normalizedLabel, active, usageCount, legacyId? ; @@unique([clientId, normalizedLabel]) }

model Counter {                                // yearly sequences, locked in the transaction
  kind  String                                 // SERIE | CONTROLE | FACTURE | AVOIR (later)
  year  Int
  last  Int
  @@id([kind, year])
}

model DocumentReference {                      // the quality cartouche of every printed document
  docType   String  @id                        // PROTOCOLE | BON_RECEPTION | FEUILLE_PAILLASSE | RAPPORT | FACTURE | ETIQUETTE
  reference String                             // « PG04/EN01 »
  version   String                             // « F »
  createdOn DateTime?
  updatedOn DateTime?
}

// Sample — additions (all nullable or defaulted, filled by kind)
//   serieId String, lineNumber Int
//   natureId String            (type SampleType kept as a derived copy until chantier 2)
//   productId String?, placeId String?, produit String?, lieu String   (labels copied at creation)
//   productionDate DateTime?, expiryDate DateTime?
//   quantity Decimal?, quantityUnit QuantityUnit?
//   productTemperature Float?, ambientTemperature Float?, receptionTemperature Float?
//   surfaceLabel String?, surfaceAreaCm2 Int?
//   personName String?, personRole String?, handsState HandsState?
//   remarks String? @db.Text
//   unitCount Int @default(1)
//   controlCode String? @unique     → « 20353/26 » (format changes; QLC-… kept on old rows)
//   serialNumber                      → dropped (was random; the série carries the N° de série)
//   code                              → dropped after backfill (the préleveur sees serialNumber + lineNumber)
//   cancelledAt DateTime?, cancelledById String?, cancelReason CancelReason?
```

`Family`, `CancelReason` (NON_EXPLOITABLE, QUANTITE_INSUFFISANTE, DOUBLON,
ANNULATION_CLIENT, AUTRE) and `PaymentMode` are small enums. Money stays
`DECIMAL(12,2)`, temperatures `Float` in °C rounded to one decimal at write.

## 5. Numbering

- `SERIE`: « NNNN/AA », one per série, assigned **at creation** (visit or
  deposit). It is on the signed protocol; it is not secret.
- `CONTROLE`: « NNNNN/AA », one per sample, assigned **at reception** in the
  reception transaction. Never returned to a PRELEVEUR session.
- Implementation: `src/lib/counters.ts` — `nextNumber(tx, kind, year)` does
  `SELECT … FOR UPDATE` on `Counter`, inserts the row on first use, returns
  `${last}/${AA}`. Format helpers and parsers live there with unit tests.
- Seeding at switch-over: `/admin/reglages` exposes « prochain N° de série »
  and « prochain N° de contrôle » so the lab continues its sequences
  (2780/26 and 20353/26 were the next ones on 2026-09-07). Existing rows keep
  their old codes; nothing is renumbered.
- Labels: `20353/26 – A` … for units; the letter is printed, never stored as
  a number.

## 6. Acceptance rules engine

`src/lib/reception-rules.ts` — pure, tested:

```ts
evaluateReception(line: { nature, family, parameterCodes, quantity, quantityUnit,
                          receptionTemperature, unitCount }, settings) → Check[]
Check = { rule: string; level: "OK" | "AVERTISSEMENT" | "BLOQUANT"; message: string }
```

Thresholds in `LabSettings` (defaults from the paper form PG05/EN04):
`minFoodMicroG = 100`, `minFoodChemG = 300`, `minWaterMicroL = 1`,
`minWaterSalmonellaL = 6`, `minWaterChemL = 2`, `histamineUnits = 9`,
`histamineUnitG = 100`, `temperatureRequiredForKinds = [ALIMENT, EAU]`,
`coldChainMaxC = 8` (warning). Whether a failing rule blocks the reception or
opens a non-conformity is the existing `blockNonConformAtReception` switch
(Q3 refines it).

## 7. Screens and routes

| Role | Screen | Route | API |
|---|---|---|---|
| PRELEVEUR | Mes visites (séries, progress per sample) | `/preleveur` | `GET /api/series?mine=1` |
| PRELEVEUR | Nouvelle visite (header + lines) | `/preleveur/nouvelle-visite` | `POST /api/series` (transaction: série + samples) |
| PRELEVEUR | Visite (read, add a photo of the signed sheet, close) | `/preleveur/visites/[id]` | `PATCH /api/series/[id]` (endedAt, arrivedAt, coolerTemperature, photo) |
| RECEPTIONNISTE | À réceptionner / À corriger (by série) | `/reception` | `GET /api/series?status=PRELEVE` |
| RECEPTIONNISTE | Nouveau dépôt | `/reception/nouveau-depot` | `POST /api/series` with `kind = DEPOT` |
| RECEPTIONNISTE | Réception de la série | `/reception/series/[id]` (`/reception/[sampleId]` stays for the transition) | `POST /api/series/[id]/reception` (one transaction) |
| RECEPTIONNISTE | Étiquettes | button on the received série | `GET /api/series/[id]/labels` (PDF, A4 3 × 8, Code128 via `bwip-js`) |
| RECEPTIONNISTE, PRELEVEUR (own visit) | Protocole / bon PDF | links on the visit, the série reception and the deposit success | `GET /api/series/[id]/document` (PDF, kind-aware, cartouche + page numbers) |
| all lab roles | Corriger la fiche | dialog on série / sample | `PATCH /api/samples/[id]/intake` |
| RECEPTIONNISTE, ADMIN | Annuler | dialog | `POST /api/samples/[id]/cancel` |
| TECHNICIEN, VALIDATEUR | lists grouped by série | `/technicien`, `/validation` | existing routes, `groupBy serie` |
| ADMIN | Cartouches (Réf / version / dates) | `/admin/documents` | `GET/PUT /api/admin/documents`, audited |
| ADMIN | Profils d'analyses (per nature, optionally per client) | `/admin/profils` | `GET/POST /api/profiles`, `PATCH /api/profiles/[id]`, audited |
| GESTIONNAIRE, ADMIN | Sites of a client | client fiche `/commercial/[id]` | `GET/POST /api/clients/[id]/sites`, `PATCH …/sites/[siteId]`, audited |
| forms | Client memory (places per site, products) | datalists + « déjà connu sous » hint | `GET /api/clients/[id]/memory?siteId=` |
| ADMIN | Natures, lieux, produits, compteurs | `/admin/...` | later (chantier 2 / 6) |

Old routes (`POST /api/samples`, `POST /api/samples/[id]/reception`) keep
working during slices 1–2 by creating a one-line série implicitly; they are
removed in slice 6.

## 8. The four verbs

| Verb | Who | From → to | Reason | Effect |
|---|---|---|---|---|
| Corriger la fiche | RECEPTIONNISTE, VALIDATEUR, ADMIN | any status before VALIDE | coded + text | edits identification fields with before/after audit; if the parameter list changes the sample returns to EN_ANALYSE with empty lines |
| Renvoyer au technicien | VALIDATEUR, ADMIN | RESULTATS_SAISIS → EN_ANALYSE | text (exists) | unchanged |
| Annuler | RECEPTIONNISTE (before analysis), ADMIN | PRELEVE / RECU / EN_ANALYSE / RESULTATS_SAISIS → ANNULE | coded motif | terminal; out of queues, reports, invoicing; ADMIN may reactivate |
| Amender | ADMIN, VALIDATEUR | VALIDE / RAPPORT_ENVOYE → EN_ANALYSE | text | chantier 4 (new report version « annule et remplace ») |

## 9. Migration and backfill

1. Migration `phase9_serie` (Capitalized table names, hand-checked): new
   tables, new nullable columns on `Sample`, `ANNULE` added to the enum.
2. Backfill script `prisma/backfill-series.ts`: one `Serie` per existing
   sample (kind VISITE, samplerKind QUALILAB, samplerUserId = `Sample.userId`,
   startedAt = `sampledAt`, serialNumber from the counter), `Sample.serieId`
   and `lineNumber = 1`, `natureId` from `type` via `legacyType`.
3. Then a second migration makes `serieId` and `natureId` required and drops
   `serialNumber` / `code` from `Sample`.
4. Reference data seeded by migration script, not by hand: the 16 natures
   (with `legacyType` and `lineKind`), the `DocumentReference` rows for the
   four known forms (PG04/EN01 F, PG05/EN04 G, PG06/EN01 G, PG06/EN06 C), the
   default profiles per nature. Sites, places and products come from the old
   database through `scripts/migrate-legacy/*.ts` (chantier 6 owns the
   scripts; slice 5 uses the first three).

## 10. Slices — each one deployed and tested in the browser

| # | Weeks | Content | Definition of done |
|---|---|---|---|
| 1 | 1–2 | Schema + backfill; natures seeded; counters; `POST /api/series`; « Nouvelle visite » multi-line, phone first; « Mes visites » | A real visit of 6 mixed lines entered once on a phone; every field of the protocol has a home; 0 regression on the existing circuit; TESTPLAN L1 |
| 2 | 3 | Grouped reception, rules engine, temperatures, N° de contrôle NNNNN/AA, labels PDF with barcodes | **Shipped 2026-09-13** — a série received in one transaction; a failing rule shows its message; labels print with letters; TESTPLAN L2 |
| 3 | 4 | « Nouveau dépôt »; protocol and bon PDFs with the cartouche; `DocumentReference` admin | **Shipped 2026-09-13** — a walk-in deposit numbered at once; both PDFs match the paper layout; TESTPLAN L3 |
| 4 | 5 | Profiles; `ClientPlace` / `ClientProduct` pickers with quasi-duplicate refusal; sampler kind; sites imported from the old database | **Shipped 2026-09-13** (sites created on the client fiche; the legacy import waits for the client import of chantier 6) — no field typed twice on a second visit to the same site; TESTPLAN L4 |
| 5 | 6 | The verbs Corriger / Annuler; lists grouped by série for technician and validation; `unitCount`; photo of the signed sheet; old routes removed | An intake error fixed with a trace; a cancelled sample leaves every queue; TESTPLAN L5 |
| 6 | 7 | Recette with the lab on real visits; fixes; docs; demo data reseeded on the VPS | Sign-off of chantier 1 recorded in TESTPLAN and HANDOFF |

Tests: `src/lib/counters.test.ts`, `src/lib/reception-rules.test.ts`,
`src/lib/serie-status.test.ts` (derived status), plus the existing suites
green at every slice. Speed: the série lists are paginated by cursor and
indexed on `[clientId, createdAt]` and `[kind, receivedAt]`; the reception
transaction touches at most 135 rows.

## 11. Field mapping — the paper forms are the acceptance test

### Protocole de prélèvement (PG04/EN01, version F)

| Paper | Model | Filled by |
|---|---|---|
| N° de Série | `Serie.serialNumber` | system |
| N° de factures | `Serie.clientReference`; invoice number derived later | préleveur / system |
| Site de prélèvement | `Serie.siteId` | préleveur |
| Cadre | `Serie.cadre` (derived) | system |
| Interlocuteur | `Serie.interlocutor` | préleveur |
| Prélevé le … à … | `Serie.startedAt` | préleveur |
| Heure de la fin | `Serie.endedAt` | préleveur |
| Prélèvement effectué par / Fonction | `Serie.samplerKind` + user (function from the account) | préleveur / system |
| Arrivé le … à … | `Serie.arrivedAt` | préleveur or réception |
| Température à l'arrivée | `Serie.coolerTemperature` | préleveur or réception |
| Line 1…8 | `Sample.lineNumber` | system |
| Désignation | `Sample.produit` via `ClientProduct` | préleveur |
| Surface prélevée (100 cm² / MAIN) | `surfaceLabel` + `surfaceAreaCm2` / lineKind MAINS | préleveur |
| Personne, fonction, lavée | `personName`, `personRole`, `handsState` | préleveur |
| N° du lot | `numeroLot` | préleveur |
| DLC P / E | `productionDate` / `expiryDate` | préleveur |
| Quantité | `quantity` + `quantityUnit` (UNITE by default) | préleveur |
| Lieu / Section | `placeId` via `ClientPlace` | préleveur |
| T°p / T°a | `productTemperature` / `ambientTemperature` | préleveur |
| Remarques / Compositions | `remarks` | préleveur |
| Analyses micro / physico-chimie | profile per nature, per line | préleveur |
| Signature QUALILAB | the account; box printed | system |
| Signature et cachet Interlocuteur | printed box; `signedProtocolData` photo | client / préleveur |
| Cartouche Réf / Version / dates | `DocumentReference` | admin |

### Bon de réception (PG05/EN04, version G)

| Paper | Model |
|---|---|
| N° de série, Date, Heure, Reçu par | `Serie.serialNumber`, `arrivedAt`, `receivedById` |
| N° de factures | `Serie.clientReference` |
| Client, adresse, tél, fax | `Client` |
| Désignation, N° lot, DLC P/E, Quantité/poids (g), T° à l'arrivée, Analyses demandées | `Sample` fields, `receptionTemperature`, profile |
| Rules 1–7 | `reception-rules.ts` + `LabSettings` |
| Avance / Reste | `Serie.advanceAmount` + mode; « reste » computed |
| Signatures | printed boxes |

## 12. Open questions that touch this chantier

Q1 (phone on site or paper first), Q2 (surface areas, employee names on the
report), Q3 (block or non-conformity; cold-chain bounds), Q4 (advances),
Q18 (« N° de factures » meaning) in `NEEDEDINFO.md`. None blocks slice 1:
the defaults above are the paper form's own values.
