import { describe, expect, it } from "vitest";
import type { Family } from "@/generated/prisma/enums";
import {
  SPLIT_JOURNAL_LIST_MAX,
  SPLIT_STALE_ERROR,
  copiedCriterion,
  decideSplit,
  movedCriteria,
  planFamilySplit,
  proposedSplitName,
  splitJournal,
  splitNameCheck,
  splitNatureOptions,
  splitVersion,
  validateSplitRequest,
  type SplitCriterion,
  type SplitNature,
  type SplitSample,
  type SplitSource,
} from "./family-split";
import {
  SKIP_EDITED,
  criteriaEditedByHand,
  planLegacyCatalogue,
  type CatalogueSnapshot,
  type LegacyCriterion,
  type LegacyType,
} from "./legacy-catalogue";

// The natures of the local copy (code, domain, category, order) — enough to
// check which type d'analyse each half of a merged family is proposed.
const nature = (id: string, code: string, label: string, family: Family, legacyType: SplitNature["legacyType"], sortOrder: number, active = true): SplitNature => ({
  id, code, label, family, legacyType, sortOrder, active,
});
const NATURES: SplitNature[] = [
  nature("n-micro-aliments", "MICRO_ALIMENTS", "Microbiologie des aliments", "MICRO", "ALIMENTAIRE", 10),
  nature("n-micro-surfaces", "MICRO_SURFACES", "Microbiologie des surfaces", "MICRO", "AMBIANCE", 20),
  nature("n-pc-aliments", "PC_ALIMENTS", "Physico-chimie des aliments", "CHIMIE", "ALIMENTAIRE", 30),
  nature("n-micro-eaux", "MICRO_EAUX", "Microbiologie des eaux", "MICRO", "EAU", 40),
  nature("n-micro-cosmetiques", "MICRO_COSMETIQUES", "Microbiologie des produits cosmétiques", "MICRO", "ALIMENTAIRE", 50),
  nature("n-pc-eaux", "PC_EAUX", "Physico-chimie des eaux", "CHIMIE", "EAU", 70),
  nature("n-micro-complements", "MICRO_COMPLEMENTS", "Microbiologie des compléments alimentaires", "MICRO", "ALIMENTAIRE", 80),
  nature("n-pc-complements", "PC_COMPLEMENTS_COSMETIQUES", "Physico-chimie des compléments alimentaires, cosmétiques", "CHIMIE", "ALIMENTAIRE", 100),
  nature("n-pc-ancien", "PC_ANCIEN", "Physico-chimie ancienne", "CHIMIE", "ALIMENTAIRE", 5, false),
  nature("n-sensoriel", "ANALYSE_SENSORIELLE", "Analyse sensorielle", "AUTRE", "ALIMENTAIRE", 150),
  nature("n-pc-huiles", "PC_HUILES", "Physico-chimie des huiles", "CHIMIE", "ALIMENTAIRE", 160),
];
const natureById = (id: string) => NATURES.find((n) => n.id === id)!;

const source = (over: Partial<SplitSource> = {}): SplitSource => ({
  id: "t-autres",
  name: "AUTRES",
  clientId: null,
  regulationId: "reg-criteres-client",
  active: true,
  nature: natureById("n-micro-aliments"),
  ...over,
});

let seq = 0;
const row = (parameterId: string, parameterName: string, parameterFamily: Family, over: Partial<SplitCriterion> = {}): SplitCriterion => ({
  id: `k-${String(++seq).padStart(3, "0")}`,
  parameterId,
  parameterName,
  parameterFamily,
  parameterCategory: "ALIMENTAIRE",
  normVersionId: null,
  unit: null,
  n: 1,
  c: null,
  mKind: "UNSPECIFIED",
  m: null,
  bigM: null,
  active: true,
  ...over,
});

// « AUTRES » as the import left it: microbiology and physico-chemistry together.
const AUTRES: SplitCriterion[] = [
  row("p-salm", "Salmonelles", "MICRO", { mKind: "ABSENCE", n: 5, unit: "/25g", normVersionId: "v-6579" }),
  row("p-staph", "Staphylocoques à coagulase positive", "MICRO", { mKind: "VALUE", n: 5, c: 2, m: 100, bigM: 1000, unit: "ufc/g", normVersionId: "v-6888-2008" }),
  row("p-staph", "Staphylocoques à coagulase positive", "MICRO", { mKind: "VALUE", n: 5, c: 2, m: 100, bigM: 1000, unit: "ufc/g", normVersionId: "v-6888-2022" }),
  row("p-ph", "pH", "CHIMIE", { unit: "—" }),
  row("p-plomb", "Plomb", "CHIMIE", { unit: "mg/kg", normVersionId: "v-plomb", c: 1 }),
  row("p-plomb", "Plomb", "CHIMIE", { unit: "mg/kg", normVersionId: "v-plomb-old", active: false }),
  row("p-tvo", "TVO", "CHIMIE", { mKind: "VALUE", n: 1, c: 0, m: 25, bigM: 35, unit: "mg/100g" }),
];

const plan = (over: Partial<Parameters<typeof planFamilySplit>[0]> = {}) =>
  planFamilySplit({ source: source(), criteria: AUTRES, natures: NATURES, samples: [], closedSamples: [], ...over });

describe("planFamilySplit — the preview", () => {
  it("sorts the active rows of another domain than the type d'analyse's out of « AUTRES »", () => {
    const preview = plan();
    expect(preview.refusal).toBeNull();
    expect(preview.source).toEqual({ id: "t-autres", name: "AUTRES", domain: "MICRO", natureLabel: "Microbiologie des aliments", activeRows: 6, ownRows: 3 });
    expect(preview.groups).toHaveLength(1);
    const [group] = preview.groups;
    // The inactive Plomb row stays out: only active rows move.
    expect(group).toMatchObject({ domain: "CHIMIE", label: "Physico-chimie", rows: 3, proposedName: "AUTRES — physico-chimie", natureId: "n-pc-aliments", refusal: null });
    expect(group.parameters).toEqual([
      { id: "p-ph", name: "pH", rows: 1 },
      { id: "p-plomb", name: "Plomb", rows: 1 },
      { id: "p-tvo", name: "TVO", rows: 1 },
    ]);
    // Active, of that domain, of the family's category; the archived one and the water one never.
    expect(group.natures.map((n) => n.id)).toEqual(["n-pc-aliments", "n-pc-complements", "n-pc-huiles"]);
  });

  it("never takes « Autres analyses » out — HUILE offers microbiology only, its « Goût » stays", () => {
    const huile = [
      row("p-acidite", "Acidité", "CHIMIE"),
      row("p-ecoli", "E. coli", "MICRO"),
      row("p-gout", "Détermination du goût", "AUTRE"),
    ];
    const preview = plan({ source: source({ id: "t-huile", name: "HUILE", nature: natureById("n-pc-huiles") }), criteria: huile });
    expect(preview.groups.map((g) => [g.domain, g.rows, g.proposedName, g.natureId])).toEqual([["MICRO", 1, "HUILE — microbiologie", "n-micro-aliments"]]);
    expect(preview.groups[0].parameters.map((p) => p.name)).toEqual(["E. coli"]);
    // Once its microbiology is out, nothing is offered: the sensory row is the family's own.
    const after = plan({ source: source({ id: "t-huile", name: "HUILE", nature: natureById("n-pc-huiles") }), criteria: huile.filter((r) => r.parameterFamily !== "MICRO") });
    expect(after.groups).toEqual([]);
    expect(after.refusal).toBe(
      "Aucun critère actif de « HUILE » n'est du domaine « Microbiologie » : rien à scinder (domaine de son type d'analyse : « Physico-chimie » ; les « Autres analyses » restent avec la famille)."
    );
  });

  it("lets a family of an « Autres analyses » type give up its microbiology and its physico-chemistry", () => {
    const sensory = [row("p-gout", "Goût", "AUTRE"), row("p-ecoli", "E. coli", "MICRO"), row("p-ph", "pH", "CHIMIE")];
    const preview = plan({ source: source({ name: "PANEL", nature: natureById("n-sensoriel") }), criteria: sensory });
    expect(preview.groups.map((g) => g.domain)).toEqual(["MICRO", "CHIMIE"]);
    expect(preview.source.ownRows).toBe(1);
  });

  it("refuses when the family has no type d'analyse, or nothing of another domain", () => {
    expect(plan({ source: source({ nature: null }) })).toMatchObject({ groups: [], refusal: expect.stringContaining("« à préciser »") });
    const micro = AUTRES.filter((r) => r.parameterFamily === "MICRO" || !r.active);
    expect(plan({ criteria: micro })).toMatchObject({ groups: [], refusal: expect.stringContaining("rien à scinder") });
  });

  it("refuses a domain without a type d'analyse of the family's category", () => {
    const preview = plan({ natures: NATURES.filter((n) => n.family !== "CHIMIE" || n.legacyType !== "ALIMENTAIRE") });
    expect(preview.groups[0]).toMatchObject({ natureId: null, natures: [], refusal: expect.stringContaining("Aucun type d'analyse actif du domaine « Physico-chimie » pour la catégorie") });
  });

  it("refuses a domain carrying a germ of another category — the new family could not offer it", () => {
    const criteria = [...AUTRES, row("p-eau-nitrates", "Nitrates", "CHIMIE", { parameterCategory: "EAU" })];
    expect(plan({ criteria }).groups[0].refusal).toContain("Le germe « Nitrates » n'est pas de la catégorie");
  });

  it("lists the open samples carrying an analysis of the domain leaving, and refuses while there is one", () => {
    const samples: SplitSample[] = [
      { id: "s-2", reference: "C-0002/26", status: "EN_ANALYSE", natureFamily: "MICRO", parameterIds: ["p-salm", "p-ph", "p-plomb"] },
      { id: "s-1", reference: "C-0001/26", status: "PROGRAMME", natureFamily: "CHIMIE", parameterIds: ["p-tvo"] },
      // Micro only: it keeps every criterion it reads.
      { id: "s-3", reference: "C-0003/26", status: "RECU", natureFamily: "MICRO", parameterIds: ["p-salm"] },
    ];
    const group = plan({ samples }).groups[0];
    expect(group.blockingSamples).toEqual([
      { id: "s-1", reference: "C-0001/26", status: "PROGRAMME", parameters: ["TVO"] },
      { id: "s-2", reference: "C-0002/26", status: "EN_ANALYSE", parameters: ["pH", "Plomb"] },
    ]);
    expect(group.refusal).toContain("2 échantillons en cours portent des analyses de ce domaine");
    // s-1 is a physico sample, but it blocks: it is not listed again as one to move.
    expect(group.openOtherDomain).toEqual([]);
  });

  it("warns of the validated reports an amendment would read without criterion — it does not refuse", () => {
    const closedSamples: SplitSample[] = [
      { id: "s-9", reference: "C-0009/26", status: "RAPPORT_ENVOYE", natureFamily: "MICRO", parameterIds: ["p-plomb", "p-ph"] },
      { id: "s-8", reference: "C-0008/26", status: "VALIDE", natureFamily: "CHIMIE", parameterIds: ["p-tvo"] },
      // A result of the family's own domain only: an amendment keeps its criterion.
      { id: "s-7", reference: "C-0007/26", status: "VALIDE", natureFamily: "MICRO", parameterIds: ["p-salm"] },
    ];
    const group = plan({ closedSamples }).groups[0];
    expect(group.closedSamples).toEqual([
      { id: "s-8", reference: "C-0008/26", status: "VALIDE", parameters: ["TVO"] },
      { id: "s-9", reference: "C-0009/26", status: "RAPPORT_ENVOYE", parameters: ["pH", "Plomb"] },
    ]);
    expect(group.refusal).toBeNull();
    expect(group.blockingSamples).toEqual([]);
  });

  it("names the open samples of the leaving domain that carry none of its analyses yet — they stay under the source", () => {
    const samples: SplitSample[] = [
      // A physico sample received under « AUTRES », not programmed yet.
      { id: "s-5", reference: "C-0005/26", status: "RECU", natureFamily: "CHIMIE", parameterIds: [] },
      // A micro sample: nothing to move.
      { id: "s-6", reference: "C-0006/26", status: "RECU", natureFamily: "MICRO", parameterIds: [] },
    ];
    const group = plan({ samples }).groups[0];
    expect(group.openOtherDomain).toEqual([{ id: "s-5", reference: "C-0005/26", status: "RECU" }]);
    expect(group.refusal).toBeNull();
  });
});

describe("the proposed name and type d'analyse", () => {
  it("names the new family after the source and its domain, within 191 characters", () => {
    expect(proposedSplitName("PRODUIT MARQUE A", "CHIMIE")).toBe("PRODUIT MARQUE A — physico-chimie");
    expect(proposedSplitName("EAU SITE B", "MICRO")).toBe("EAU SITE B — microbiologie");
    const long = proposedSplitName("X".repeat(400), "AUTRE");
    expect(long).toHaveLength(191);
    expect(long.endsWith(" — autres analyses")).toBe(true);
  });

  it("proposes the same subject in the other domain first, then the most words shared, then the screens' order", () => {
    const ids = (code: string, domain: Family) => splitNatureOptions(NATURES.find((n) => n.code === code)!, domain, NATURES).map((n) => n.id);
    expect(ids("MICRO_EAUX", "CHIMIE")).toEqual(["n-pc-eaux"]);
    expect(ids("PC_ALIMENTS", "MICRO")[0]).toBe("n-micro-aliments");
    expect(ids("MICRO_COMPLEMENTS", "CHIMIE")[0]).toBe("n-pc-complements");
    // « des huiles » has no microbiology twin: the first food microbiology by order.
    expect(ids("PC_HUILES", "MICRO")).toEqual(["n-micro-aliments", "n-micro-cosmetiques", "n-micro-complements"]);
  });
});

describe("splitVersion — the preview's fingerprint", () => {
  const base = splitVersion(source(), AUTRES);
  it("stays the same whatever order the rows are read in", () => {
    expect(splitVersion(source(), [...AUTRES].reverse())).toBe(base);
  });
  it("changes with any row, any parameter's domain, the activity of a row, the header or the type d'analyse", () => {
    const edit = (index: number, patch: Partial<SplitCriterion>) => AUTRES.map((r, i) => (i === index ? { ...r, ...patch } : r));
    for (const changed of [
      splitVersion(source(), edit(4, { bigM: 2 })),
      splitVersion(source(), edit(3, { parameterFamily: "MICRO" })),
      splitVersion(source(), edit(5, { active: true })),
      splitVersion(source(), edit(0, { unit: "/10g" })),
      splitVersion(source(), AUTRES.slice(1)),
      splitVersion(source({ regulationId: null }), AUTRES),
      splitVersion(source({ clientId: "client-a" }), AUTRES),
      splitVersion(source({ nature: natureById("n-micro-cosmetiques") }), AUTRES),
    ]) {
      expect(changed).not.toBe(base);
    }
  });
});

describe("validateSplitRequest", () => {
  const good = { domain: "CHIMIE", name: "  AUTRES   —  physico-chimie ", natureId: "n-pc-aliments", version: "abc" };
  it("reads a confirmation, the name tidied", () => {
    expect(validateSplitRequest(good)).toEqual({
      ok: true,
      value: { domain: "CHIMIE", name: "AUTRES — physico-chimie", natureId: "n-pc-aliments", version: "abc", confirmSimilar: false },
    });
    expect(validateSplitRequest({ ...good, confirmSimilar: true })).toMatchObject({ ok: true, value: { confirmSimilar: true } });
  });
  it("refuses « Autres analyses »: only microbiology or physico-chemistry leaves a family", () => {
    expect(validateSplitRequest({ ...good, domain: "AUTRE" })).toEqual({ ok: false, error: "Domaine invalide : microbiologie ou physico-chimie." });
  });
  it("refuses what is not one", () => {
    for (const bad of [
      null,
      [],
      "x",
      { ...good, domain: "BIO" },
      { ...good, version: "" },
      { ...good, version: undefined },
      { ...good, natureId: "" },
      { ...good, name: "   " },
      { ...good, name: "— —" },
      { ...good, name: "N".repeat(192) },
      { ...good, confirmSimilar: "true" },
    ]) {
      expect(validateSplitRequest(bad).ok).toBe(false);
    }
  });
});

describe("decideSplit — the confirmation, under the locks", () => {
  const preview = plan();
  const ask = { domain: "CHIMIE" as Family, name: "AUTRES — physico-chimie", natureId: "n-pc-aliments", version: preview.version, confirmSimilar: false };

  it("moves the active rows of the domain, nothing else", () => {
    const decision = decideSplit(preview, ask, AUTRES);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.moved.map((r) => r.parameterName)).toEqual(["pH", "Plomb", "TVO"]);
    expect(decision.moved.every((r) => r.active && r.parameterFamily === "CHIMIE")).toBe(true);
    expect(decision.natureId).toBe("n-pc-aliments");
  });

  it("answers 409 when the family changed since the preview", () => {
    expect(decideSplit(preview, { ...ask, version: "stale" }, AUTRES)).toEqual({ ok: false, status: 409, error: SPLIT_STALE_ERROR });
  });

  it("answers 409 for the family's own domain, or a domain with no active row", () => {
    expect(decideSplit(preview, { ...ask, domain: "MICRO" }, AUTRES)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("est le domaine du type d'analyse") });
    const micro = AUTRES.filter((r) => r.parameterFamily === "MICRO");
    const microOnly = plan({ criteria: micro });
    expect(decideSplit(microOnly, { ...ask, version: microOnly.version }, micro)).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringContaining("Aucun critère actif du domaine « Physico-chimie »"),
    });
  });

  it("answers 409 with the list while open samples would lose criteria", () => {
    const blocked = plan({ samples: [{ id: "s-1", reference: "C-0001/26", status: "RESULTATS_SAISIS", natureFamily: "MICRO", parameterIds: ["p-ph"] }] });
    expect(decideSplit(blocked, { ...ask, version: blocked.version }, AUTRES)).toMatchObject({
      ok: false,
      status: 409,
      blockingSamples: [{ reference: "C-0001/26", parameters: ["pH"] }],
    });
  });

  it("answers 400 for a type d'analyse not offered — another domain, another category, archived", () => {
    for (const natureId of ["n-micro-aliments", "n-pc-eaux", "n-pc-ancien", "inconnu"]) {
      expect(decideSplit(preview, { ...ask, natureId }, AUTRES)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("answers 409 for a family « à préciser »", () => {
    const unclassified = plan({ source: source({ nature: null }) });
    expect(decideSplit(unclassified, { ...ask, version: unclassified.version }, AUTRES)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("splitNameCheck", () => {
  const families = [
    { id: "t-autres", name: "AUTRES", normalizedName: "autres", clientId: null },
    { id: "t-pc", name: "AUTRES — physico-chimie", normalizedName: "autres physico chimie", clientId: null },
    { id: "t-client", name: "Produit Marque A physico", normalizedName: "produit marque a physico", clientId: "client-a" },
  ];
  it("refuses the same name for the same client — or both common — as « Nouvelle famille » does", () => {
    expect(splitNameCheck("Autres - Physico chimie", null, families, "t-autres")).toEqual({ taken: true, similar: [] });
    expect(splitNameCheck("AUTRES — physico-chimie", "client-b", families, "t-autres").taken).toBe(false);
  });
  it("lists the near-identical names, the source left out", () => {
    expect(splitNameCheck("AUTRES — physico-chimies", null, families, "t-autres").similar).toEqual(["AUTRES — physico-chimie"]);
    expect(splitNameCheck("AUTRE", null, families, "t-autres").similar).toEqual([]);
    // Another client's family is not this client's look-alike.
    expect(splitNameCheck("Produit Marque A physicos", "client-b", families, "t-x").similar).toEqual([]);
  });
});

describe("copiedCriterion", () => {
  it("copies every column, active — a tolerance c that means nothing is left out (F2)", () => {
    const [ph, plomb, , tvo] = AUTRES.slice(3);
    expect(copiedCriterion(plomb)).toEqual({ parameterId: "p-plomb", normVersionId: "v-plomb", unit: "mg/kg", n: 1, c: null, mKind: "UNSPECIFIED", m: null, bigM: null, active: true });
    expect(copiedCriterion(tvo)).toEqual({ parameterId: "p-tvo", normVersionId: null, unit: "mg/100g", n: 1, c: 0, mKind: "VALUE", m: 25, bigM: 35, active: true });
    expect(copiedCriterion({ ...ph, active: false }).active).toBe(true);
  });
});

describe("splitJournal", () => {
  const moved = movedCriteria(AUTRES, "CHIMIE");
  const created = { id: "t-new", name: "AUTRES — physico-chimie", normalizedName: "autres physico chimie", family: "CHIMIE" as Family, natureId: "n-pc-aliments", clientId: null, active: true, regulationId: "reg-criteres-client" };
  const journal = splitJournal({ source: { id: "t-autres", name: "AUTRES" }, created, domain: "CHIMIE", moved, sourceRows: 7, sourceActiveBefore: 6, sourceActiveAfter: 3 });

  it("journals the family created, and the criteria moved with the counts before / after", () => {
    expect(journal.created).toMatchObject({ name: "AUTRES — physico-chimie", natureId: "n-pc-aliments", regulationId: "reg-criteres-client", split: { domain: "CHIMIE", from: { id: "t-autres" }, criteria: 3 } });
    expect(journal.sourceCriteria).toMatchObject({ name: "AUTRES", before: 7, after: 7, removed: [], active: { before: 6, after: 3 } });
    expect((journal.sourceCriteria.changed as { id: string; active: boolean }[]).map((c) => [c.id, c.active])).toEqual(moved.map((r) => [r.id, false]));
    expect(journal.newCriteria).toMatchObject({ name: "AUTRES — physico-chimie", before: 0, after: 3, tidied: 1, active: { before: 0, after: 3 } });
  });

  it("reads, for the old software's import, as a hand change of both grids", () => {
    expect(criteriaEditedByHand(JSON.stringify(journal.sourceCriteria))).toBe(true);
    expect(criteriaEditedByHand(JSON.stringify(journal.newCriteria))).toBe(true);
  });

  it("lists at most 50 rows by id — the counts stay complete", () => {
    const many = Array.from({ length: 299 }, (_, i) => row(`p-${i}`, `Paramètre ${i}`, "CHIMIE"));
    const big = splitJournal({ source: { id: "t-autres", name: "AUTRES" }, created, domain: "CHIMIE", moved: many, sourceRows: 346, sourceActiveBefore: 346, sourceActiveAfter: 47 });
    expect(big.sourceCriteria.changed).toHaveLength(SPLIT_JOURNAL_LIST_MAX);
    expect(big.newCriteria.changed).toHaveLength(SPLIT_JOURNAL_LIST_MAX);
    expect(big.newCriteria.after).toBe(299);
    expect(JSON.stringify(big.sourceCriteria).length).toBeLessThan(65_535);
  });
});

// ---- After a split, the old software's import plans nothing new ------------------
//
// « AUTRES » (n° 549, micro) and « AUTRES_ » (n° 550, physico) of the old
// software share a normalised name: `planLegacyCatalogue` maps both to the
// family of legacy id 549. The split must leave nothing for it to re-plan —
// on the source (its deactivated rows count as present) nor on the new
// family (no legacy id, a name of its own).

describe("planLegacyCatalogue after a split", () => {
  const CAT_NATURES: CatalogueSnapshot["natures"] = [
    { id: "n-micro-aliments", code: "MICRO_ALIMENTS", label: "Microbiologie des aliments", legacyId: 1, family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
    { id: "n-pc-aliments", code: "PC_ALIMENTS", label: "Physico-chimie des aliments", legacyId: 20, family: "CHIMIE", legacyType: "ALIMENTAIRE", active: true },
  ];
  const param = (id: string, name: string, family: Family): CatalogueSnapshot["parameters"][number] => ({
    id, name, category: "ALIMENTAIRE", family, unit: null, aliases: null, alertOnExceed: false, limitValue: null, threshold: null, calcFactor: 1,
  });
  const CAT_PARAMETERS = [
    param("p-salm", "Salmonelles", "MICRO"),
    param("p-ecoli", "E. coli", "MICRO"),
    param("p-ph", "pH", "CHIMIE"),
    param("p-plomb", "Plomb", "CHIMIE"),
    param("p-humidite", "Humidité", "CHIMIE"),
  ];
  const typeRow = (over: Partial<CatalogueSnapshot["types"][number]> & { id: string; name: string; normalizedName: string }): CatalogueSnapshot["types"][number] => ({
    clientId: null, legacyId: null, natureId: null, family: "MICRO", active: true, regulationId: null, familyEdited: false, criteriaEdited: false, regulationEdited: false, ...over,
  });
  const catRow = (id: string, parameterId: string, over: Partial<CatalogueSnapshot["criteria"][number]> = {}): CatalogueSnapshot["criteria"][number] => ({
    id, productTypeId: "t-autres", parameterId, normVersionId: null, normKey: null, active: true, unit: null, n: 1, c: null, mKind: "UNSPECIFIED", m: null, bigM: null, ...over,
  });
  const legacyType = (legacyId: number, name: string, natureLegacyId: number): LegacyType => ({
    legacyId, name, group: "", description: "", regulationLegacyId: null, natureLegacyId, obsolete: false, visible: true, lastUse: new Date("2026-09-07"), active: true,
  });
  const legacyRow = (legacyId: number, typeLegacyId: number, parameterName: string, plan: LegacyCriterion["plan"]): LegacyCriterion => ({
    legacyId, typeLegacyId, parameterName, norm: "", unit: null, plan, reason: null,
  });
  const LIMITLESS = { n: 1, c: null, mKind: "UNSPECIFIED", m: null, bigM: null } as const;
  const LEGACY_TYPES = [legacyType(549, "AUTRES", 1), legacyType(550, "AUTRES_", 20)];
  const LEGACY_CRITERIA = [
    legacyRow(1, 549, "Salmonelles", { n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null }),
    legacyRow(2, 549, "E. coli", { n: 1, c: null, mKind: "VALUE", m: 10, bigM: null }),
    legacyRow(3, 550, "pH", LIMITLESS),
    legacyRow(4, 550, "Plomb", LIMITLESS),
  ];

  /** The local copy before the split: one « AUTRES » with both domains, the import already applied. */
  function before(over: { types?: Partial<CatalogueSnapshot["types"][number]> } = {}): CatalogueSnapshot {
    return {
      natures: CAT_NATURES,
      parameters: CAT_PARAMETERS,
      types: [typeRow({ id: "t-autres", name: "AUTRES", normalizedName: "autres", legacyId: 549, natureId: "n-micro-aliments", ...over.types })],
      criteria: [
        catRow("k-salm", "p-salm", { mKind: "ABSENCE", n: 5 }),
        catRow("k-ecoli", "p-ecoli", { mKind: "VALUE", m: 10 }),
        catRow("k-ph", "p-ph"),
        // A tolerance an earlier import left on a limitless row: the reprise tidies it (F2).
        catRow("k-plomb", "p-plomb", { c: 1 }),
      ],
      normKeys: [],
      regulationLegacyIds: [],
      pricedKeys: [],
      inFlight: [],
    };
  }

  /** The split as the route writes it, applied to the snapshot: copies, deactivation, journal. */
  function split(snapshot: CatalogueSnapshot): CatalogueSnapshot {
    const parameterOf = new Map(snapshot.parameters.map((p) => [p.id, p]));
    const rows: SplitCriterion[] = snapshot.criteria
      .filter((c) => c.productTypeId === "t-autres")
      .map((c) => {
        const p = parameterOf.get(c.parameterId)!;
        return { ...c, parameterName: p.name, parameterFamily: p.family, parameterCategory: p.category };
      });
    const moved = movedCriteria(rows, "CHIMIE");
    const created = { id: "t-new", name: "AUTRES — physico-chimie", normalizedName: "autres physico chimie", family: "CHIMIE" as Family, natureId: "n-pc-aliments", clientId: null, active: true, regulationId: null };
    const journal = splitJournal({ source: { id: "t-autres", name: "AUTRES" }, created, domain: "CHIMIE", moved, sourceRows: rows.length, sourceActiveBefore: 4, sourceActiveAfter: 2 });
    const movedIds = new Set(moved.map((r) => r.id));
    return {
      ...snapshot,
      types: [
        ...snapshot.types.map((t) => (t.id === "t-autres" ? { ...t, criteriaEdited: criteriaEditedByHand(JSON.stringify(journal.sourceCriteria)) } : t)),
        typeRow({ ...created, criteriaEdited: criteriaEditedByHand(JSON.stringify(journal.newCriteria)) }),
      ],
      criteria: [
        ...snapshot.criteria.map((c) => (movedIds.has(c.id) ? { ...c, active: false } : c)),
        ...moved.map((r, i) => ({ id: `k-new-${i}`, productTypeId: "t-new", normKey: null, ...copiedCriterion(r) })),
      ],
    };
  }

  const run = (snapshot: CatalogueSnapshot, legacyCriteria = LEGACY_CRITERIA) =>
    planLegacyCatalogue({ legacyTypes: LEGACY_TYPES, legacyCriteria, snapshot, createMissing: true });
  /** Everything the commit would write. */
  const writes = (p: ReturnType<typeof run>) => ({
    typesToCreate: p.typesToCreate,
    parameters: p.parameters,
    natureUpdates: p.natureUpdates,
    links: p.links,
    copies: p.copies,
    rows: p.rows,
    normsToCreate: p.normsToCreate,
    tolerances: p.tolerances.map((t) => t.criterionId),
  });

  it("plans the same — nothing for either family — before and after the split", () => {
    const beforePlan = run(before());
    const afterPlan = run(split(before()));
    expect(writes(beforePlan)).toEqual({ typesToCreate: [], parameters: [], natureUpdates: [], links: [], copies: [], rows: [], normsToCreate: [], tolerances: ["k-plomb"] });
    // The deactivated rows count as present; the copy carries no tolerance to tidy.
    expect(writes(afterPlan)).toEqual(writes(beforePlan));
    expect(afterPlan.summary.criteria.alreadyPresent).toBe(4);
    expect(afterPlan.summary.reprise.handEdited).toEqual([]);
  });

  it("re-creates nothing even without the journal's mark: the rows are deactivated, not deleted", () => {
    const unmarked = split(before());
    unmarked.types = unmarked.types.map((t) => ({ ...t, criteriaEdited: false }));
    expect(run(unmarked).rows).toEqual([]);
  });

  it("never adds the other domain back to the source: a row of « AUTRES_ » not imported yet is left out, not planned", () => {
    const withHumidity = [...LEGACY_CRITERIA, legacyRow(5, 550, "Humidité", LIMITLESS)];
    // Before the split the import would have added it to « AUTRES » — the merge again.
    expect(run(before(), withHumidity).rows.map((r) => [r.productTypeRef, r.parameterRef])).toEqual([["t-autres", "p-humidite"]]);
    const afterPlan = run(split(before()), withHumidity);
    expect(afterPlan.rows).toEqual([]);
    expect(afterPlan.summary.criteria.skipped).toEqual([{ reason: SKIP_EDITED, count: 1 }]);
    expect(afterPlan.summary.reprise.handEdited).toEqual([{ id: "t-autres", name: "AUTRES", criteria: 1, regulation: false }]);
  });

  it("protects a workbook family emptied by the split too: no criterion of the old software comes in", () => {
    // A water family named after a client's site, matched by name only: every active row leaves.
    const workbook = before({ types: { legacyId: null } });
    workbook.criteria = workbook.criteria.map((c) => (c.parameterId === "p-salm" || c.parameterId === "p-ecoli" ? { ...c, active: false } : c));
    const withHumidity = [...LEGACY_CRITERIA, legacyRow(5, 550, "Humidité", LIMITLESS)];
    const emptied = split(workbook);
    expect(emptied.criteria.filter((c) => c.productTypeId === "t-autres" && c.active)).toEqual([]);
    expect(run(emptied, withHumidity).rows).toEqual([]);
    // Without the journal's mark, the emptied family would take the old software's rows (Q43).
    const unmarked = { ...emptied, types: emptied.types.map((t) => ({ ...t, criteriaEdited: false })) };
    expect(run(unmarked, withHumidity).rows.map((r) => [r.productTypeRef, r.parameterRef])).toEqual([["t-autres", "p-humidite"]]);
  });
});
