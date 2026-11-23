import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compactReferential, hydrateReferential } from "./programme-referential-wire";
import type { ProgrammeReferentialData } from "./programme-sheet-types";

/**
 * Lot performance P2-1: the programme sheet's referential travels compact
 * (each criterion a tuple, the germ names and norm versions said once) and
 * the sheet rebuilds it. The rebuilt referential must be exactly the one the
 * server computed — the sheet's logic reads nothing else.
 */

const nv2021 = { id: "nv-ecoli-2021", label: "ISO 16649-2:2021", current: true, version: "2021" };
const nv2013 = { id: "nv-ecoli-2013", label: "ISO 16649-2:2013", current: false, version: "2013" };

const referential: ProgrammeReferentialData = {
  natureId: "nat",
  category: "ALIMENTAIRE",
  natureHome: null,
  natures: [
    { id: "nat", code: "MICRO_ALIMENTS", label: "Microbiologie des aliments", family: "MICRO", legacyType: "ALIMENTAIRE", active: true, current: true },
  ],
  productTypes: [
    {
      id: "type-client",
      name: "Salade du client",
      family: "MICRO",
      natureId: "nat",
      clientId: "client-a",
      criteriaCount: 1,
      criteria: [
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 3, c: 2, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: nv2013.id, normVersion: nv2013 },
      ],
    },
    {
      id: "type-catalogue",
      name: "Plat cuisiné",
      family: "MICRO",
      natureId: null,
      clientId: null,
      criteriaCount: 2,
      criteria: [
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 5, c: 2, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: nv2021.id, normVersion: nv2021 },
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 5, c: 1, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: nv2013.id, normVersion: nv2013 },
        { parameterId: "p-salm", parameterName: "Salmonelles", n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null, unit: "/25 g", normVersionId: null, normVersion: null },
        { parameterId: "p-zero", parameterName: "Germe à zéro", n: 1, c: 0, mKind: "VALUE", m: 0, bigM: 0, unit: null, normVersionId: null, normVersion: null },
      ],
    },
    { id: "type-vide", name: "Sans critère", family: "CHIMIE", natureId: null, clientId: null, criteriaCount: 0, criteria: [] },
  ],
  familyNatures: [{ id: "nat", label: "Microbiologie des aliments", category: "ALIMENTAIRE" }],
  parameters: [
    { id: "p-ecoli", name: "E. coli", unit: "UFC/g", threshold: null, calcFactor: 1, family: "MICRO", category: "ALIMENTAIRE", aliases: "Escherichia coli" },
    { id: "p-salm", name: "Salmonelles", unit: "/25 g", threshold: null, calcFactor: 1, family: "MICRO", category: "ALIMENTAIRE", aliases: null },
  ],
  profiles: [{ id: "prof", name: "Micro standard", clientId: null, unitCount: 5, parameterIds: ["p-ecoli", "p-salm"] }],
  normVersions: {
    "p-ecoli": [{ id: nv2021.id, normId: "n-ecoli", normCode: "ISO 16649-2", version: "2021", label: nv2021.label, current: true }],
  },
  prices: { "p-ecoli": 120, "p-salm": null },
  clientPriced: ["p-ecoli"],
};

describe("the programme referential on the wire (lot performance P2-1)", () => {
  it("hydrateReferential(compactReferential(r)) gives r back, deep-equal", () => {
    expect(hydrateReferential(compactReferential(referential))).toEqual(referential);
  });

  it("survives the JSON the page and the route send (RSC props, `NextResponse.json`)", () => {
    const travelled = JSON.parse(JSON.stringify(compactReferential(referential)));
    expect(hydrateReferential(travelled)).toEqual(referential);
  });

  it("says each germ name and each norm version once, and no criterion carries them", () => {
    const wire = compactReferential(referential);
    expect(wire.criterionParameterNames).toEqual({ "p-ecoli": "E. coli", "p-salm": "Salmonelles", "p-zero": "Germe à zéro" });
    expect(Object.keys(wire.criterionNormVersions).sort()).toEqual([nv2013.id, nv2021.id].sort());
    for (const type of wire.productTypes) for (const criterion of type.criteria) expect(Array.isArray(criterion)).toBe(true);
    expect(JSON.stringify(wire).split("ISO 16649-2:2013").length - 1).toBe(1);
  });

  it("leaves an already whole referential as it is", () => {
    expect(hydrateReferential(referential)).toBe(referential);
  });

  it("the loader sends it compact and the sheet rebuilds it on each arrival", () => {
    const root = process.cwd();
    const loader = readFileSync(`${root}/src/lib/programme-referential.ts`, "utf8");
    expect(loader).toContain("return compactReferential(referential);");
    const sheet = readFileSync(`${root}/src/components/programmation/ProgrammeSheet.tsx`, "utf8");
    expect(sheet).toContain("useState<ProgrammeReferentialData>(() => hydrateReferential(initialReferential))");
    expect(sheet).toContain("data.referential ? hydrateReferential(data.referential) : referential");
    expect(sheet).toContain("const loaded = hydrateReferential(data.referential);");
  });
});
