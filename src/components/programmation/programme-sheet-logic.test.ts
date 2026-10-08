import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/lib/reception-rules";
import {
  adoptReferential,
  applyProductType,
  applyProfile,
  assignAll,
  assignByFamily,
  billingLines,
  criteriaOf,
  defaultNormVersionId,
  entryChecks,
  groupParameters,
  initialDraft,
  natureChangeNotice,
  natureChoices,
  parameterFamilies,
  profileApplied,
  spansFamilies,
  toRequestBody,
  toggleParameter,
  typeUnitCount,
  unitWarning,
  updateSetting,
} from "./programme-sheet-logic";
import type { ProgrammeReferentialData, ProgrammeSampleData, ProgrammeState } from "./programme-sheet-types";

/**
 * PROGRAMME.md §4 — what the sheet does on its own: a product type adds its
 * germs and proposes n and the norm version, a profile replaces the
 * analyses, the shortcuts hand the parameters to technicians, the entry
 * check never blocks, the billing preview prices the programme.
 */

const referential: ProgrammeReferentialData = {
  natureId: "nat",
  category: "ALIMENTAIRE",
  natures: [
    { id: "nat", code: "MICRO_ALIMENTS", label: "Microbiologie des aliments", family: "MICRO", legacyType: "ALIMENTAIRE", active: true, current: true },
    { id: "nat-fine", code: "MICRO_FINE", label: "Nature fine de test", family: "MICRO", legacyType: "AMBIANCE", active: true, current: false },
    { id: "nat-archivee", code: "MICRO_ANCIENNE", label: "Nature archivée", family: "MICRO", legacyType: "ALIMENTAIRE", active: false, current: false },
    { id: "nat-pc", code: "PC_ALIMENTS", label: "Physico-chimie des aliments", family: "CHIMIE", legacyType: "ALIMENTAIRE", active: true, current: false },
  ],
  productTypes: [
    {
      id: "type-client",
      name: "Salade du client",
      family: "MICRO",
      clientId: "client-a",
      criteria: [
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 3, c: 2, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: "nv-ecoli-2013", normVersion: { id: "nv-ecoli-2013", label: "ISO 16649-2:2013", current: false, version: "2013" } },
      ],
    },
    {
      id: "type-catalogue",
      name: "Plat cuisiné",
      family: "MICRO",
      clientId: null,
      criteria: [
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 5, c: 2, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: "nv-ecoli-2021", normVersion: { id: "nv-ecoli-2021", label: "ISO 16649-2:2021", current: true, version: "2021" } },
        // An older criterion for the same germ: the one in force wins.
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 5, c: 1, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: "nv-ecoli-2013", normVersion: { id: "nv-ecoli-2013", label: "ISO 16649-2:2013", current: false, version: "2013" } },
        { parameterId: "p-salm", parameterName: "Salmonelles", n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null, unit: "/25 g", normVersionId: null, normVersion: null },
        // A germ the nature's category does not carry: ignored.
        { parameterId: "p-autre", parameterName: "Autre", n: 5, c: null, mKind: "VALUE", m: 1, bigM: null, unit: null, normVersionId: null, normVersion: null },
      ],
    },
    {
      id: "type-chimie",
      name: "Poisson (histamine)",
      family: "CHIMIE",
      clientId: null,
      criteria: [
        { parameterId: "p-hist", parameterName: "Histamine", n: 9, c: 2, mKind: "VALUE", m: 100, bigM: 200, unit: "mg/kg", normVersionId: null, normVersion: null },
      ],
    },
  ],
  parameters: [
    { id: "p-ecoli", name: "E. coli", unit: "UFC/g", threshold: null, calcFactor: 1, family: "MICRO", category: "ALIMENTAIRE" },
    { id: "p-hist", name: "Histamine", unit: "mg/kg", threshold: null, calcFactor: 1, family: "CHIMIE", category: "ALIMENTAIRE" },
    { id: "p-salm", name: "Salmonelles", unit: "/25 g", threshold: null, calcFactor: 1, family: "MICRO", category: "ALIMENTAIRE" },
    { id: "p-flore", name: "Flore totale", unit: "UFC/g", threshold: null, calcFactor: 1, family: "MICRO", category: "ALIMENTAIRE" },
  ],
  profiles: [
    { id: "prof-std", name: "Micro standard", clientId: null, unitCount: 5, parameterIds: ["p-ecoli", "p-salm", "p-inconnu"] },
    { id: "prof-hist", name: "Histamine", clientId: "client-a", unitCount: 9, parameterIds: ["p-hist"] },
  ],
  technicians: [
    { id: "tech1", name: "Yassine" },
    { id: "tech2", name: "Imane" },
  ],
  normVersions: {
    "p-ecoli": [
      { id: "nv-ecoli-2021", normId: "n-ecoli", normCode: "ISO 16649-2", version: "2021", label: "ISO 16649-2:2021", current: true },
      { id: "nv-ecoli-2013", normId: "n-ecoli", normCode: "ISO 16649-2", version: "2013", label: "ISO 16649-2:2013", current: false },
    ],
    "p-salm": [{ id: "nv-salm-2021", normId: "n-salm", normCode: "ISO 6579-1", version: "2021", label: "ISO 6579-1:2021", current: true }],
    "p-hist": [],
    "p-flore": [],
  },
  prices: { "p-ecoli": 320, "p-salm": 450, "p-hist": null, "p-flore": 220 },
};

const sample: Pick<ProgrammeSampleData, "lineKind" | "nature" | "quantity" | "quantityUnit" | "receptionTemperature"> = {
  lineKind: "ALIMENT",
  nature: { id: "nat", code: "MICRO_ALIMENTS", label: "Microbiologie des aliments", family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
  quantity: 50,
  quantityUnit: "G",
  receptionTemperature: 4,
};

/** A received line as the préleveur left it: one germ ticked, no programme yet. */
const received: ProgrammeState = {
  natureId: "nat",
  productTypeId: null,
  parameterIds: ["p-ecoli", "p-retire"],
  unitCount: 1,
  testPortion: null,
  technicianId: "tech1",
  priority: "NORMALE",
  dueAt: null,
  programmeNote: null,
  parameters: [
    { parameterId: "p-ecoli", technicianId: null, normVersionId: null, dilutionFactor: null, note: null },
    { parameterId: "p-retire", technicianId: null, normVersionId: null, dilutionFactor: null, note: null },
  ],
  programmedAt: null,
  programmedBy: null,
  editable: true,
};

describe("initialDraft", () => {
  it("pre-ticks the préleveur's analyses, proposes the version in force and keeps the reception's technician", () => {
    const draft = initialDraft(received, referential);
    expect(draft.parameterIds).toEqual(["p-ecoli"]);
    expect(draft.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2021");
    expect(draft.technicianId).toBe("tech1");
    expect(draft.productTypeId).toBe("");
    expect(draft.dueAt).toBe("");
    expect(draft.natureId).toBe("nat");
  });

  it("reads a stored programme back as typed: dilution with a comma, wall-time due date, explicit versions", () => {
    const draft = initialDraft(
      {
        ...received,
        productTypeId: "type-client",
        parameterIds: ["p-ecoli", "p-salm"],
        unitCount: 3,
        testPortion: "25 g",
        technicianId: "tech-parti",
        priority: "URGENTE",
        dueAt: "2026-10-08T12:00:00.000Z",
        programmeNote: "Conserver à 4 °C",
        parameters: [
          { parameterId: "p-ecoli", technicianId: "tech2", normVersionId: "nv-ecoli-2013", dilutionFactor: 10.5, note: "×10" },
          { parameterId: "p-salm", technicianId: null, normVersionId: null, dilutionFactor: null, note: null },
        ],
      },
      referential
    );
    expect(draft.productTypeId).toBe("type-client");
    expect(draft.unitCount).toBe(3);
    expect(draft.priority).toBe("URGENTE");
    expect(draft.dueAt).toBe("2026-10-08T12:00");
    // A technician who left is no longer offered: the select cannot show them.
    expect(draft.technicianId).toBe("");
    expect(draft.settings["p-ecoli"]).toEqual({ technicianId: "tech2", normVersionId: "nv-ecoli-2013", dilutionFactor: "10,5", note: "×10" });
    expect(draft.settings["p-salm"].normVersionId).toBe("nv-salm-2021");
  });

  it("drops a type the client may no longer use", () => {
    expect(initialDraft({ ...received, productTypeId: "type-retire" }, referential).productTypeId).toBe("");
  });
});

describe("product type", () => {
  it("keeps one criterion per germ, the one under the version in force", () => {
    const criteria = criteriaOf(referential.productTypes[1]);
    expect(criteria.map((c) => c.parameterId)).toEqual(["p-autre", "p-ecoli", "p-salm"]);
    expect(criteria.find((c) => c.parameterId === "p-ecoli")?.c).toBe(2);
    expect(typeUnitCount(referential.productTypes[1])).toBe(5);
    expect(typeUnitCount(undefined)).toBe(0);
  });

  it("proposes the criterion's version when a type names one, else the version in force", () => {
    expect(defaultNormVersionId("p-ecoli", referential.productTypes[0], referential)).toBe("nv-ecoli-2013");
    expect(defaultNormVersionId("p-ecoli", undefined, referential)).toBe("nv-ecoli-2021");
    expect(defaultNormVersionId("p-salm", referential.productTypes[1], referential)).toBe("nv-salm-2021");
    expect(defaultNormVersionId("p-hist", referential.productTypes[2], referential)).toBe("");
  });

  it("adds the type's germs to the analyses, raises n and sets the criterion's version", () => {
    const draft = applyProductType(initialDraft({ ...received, parameterIds: ["p-flore"], parameters: [] }, referential), "type-catalogue", referential);
    expect(draft.productTypeId).toBe("type-catalogue");
    // The préleveur's analysis stays, the germs come after it, the unknown one is ignored.
    expect(draft.parameterIds).toEqual(["p-flore", "p-ecoli", "p-salm"]);
    expect(draft.unitCount).toBe(5);
    expect(draft.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2021");
    expect(draft.settings["p-salm"].normVersionId).toBe("nv-salm-2021");
  });

  it("never lowers n, and the client's type overrides the version the sheet proposed", () => {
    const base = { ...initialDraft(received, referential), unitCount: 9 };
    const draft = applyProductType(base, "type-client", referential);
    expect(draft.unitCount).toBe(9);
    expect(draft.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2013");
  });

  it("« — aucun — » detaches the type without touching the analyses", () => {
    const withType = applyProductType(initialDraft(received, referential), "type-catalogue", referential);
    const draft = applyProductType(withType, "", referential);
    expect(draft.productTypeId).toBe("");
    expect(draft.parameterIds).toEqual(withType.parameterIds);
    expect(draft.unitCount).toBe(5);
  });

  it("warns when fewer units are read than the type's plans need", () => {
    const draft = { ...initialDraft(received, referential), unitCount: 3 };
    expect(unitWarning(draft, referential.productTypes[1])).toMatch(/n = 5/);
    expect(unitWarning(draft, referential.productTypes[1])).toMatch(/3 unités/);
    expect(unitWarning({ ...draft, unitCount: 5 }, referential.productTypes[1])).toBeNull();
    expect(unitWarning(draft, undefined)).toBeNull();
  });
});

describe("profiles and analyses", () => {
  it("a profile replaces the analyses, proposes its n and fills the versions of the new germs", () => {
    const draft = applyProfile(initialDraft({ ...received, parameterIds: ["p-flore"], parameters: [] }, referential), referential.profiles[0], referential);
    expect(draft.parameterIds).toEqual(["p-ecoli", "p-salm"]);
    expect(draft.unitCount).toBe(5);
    expect(draft.settings["p-salm"].normVersionId).toBe("nv-salm-2021");
    expect(profileApplied(draft, referential.profiles[0], referential)).toBe(true);
    expect(profileApplied(draft, referential.profiles[1], referential)).toBe(false);
  });

  it("a profile's n is raised to the chosen type's when that reads more", () => {
    const withType = applyProductType(initialDraft(received, referential), "type-catalogue", referential);
    expect(applyProfile(withType, referential.profiles[1], referential).unitCount).toBe(9);
    expect(applyProfile({ ...withType, unitCount: 1 }, { ...referential.profiles[1], unitCount: 1 }, referential).unitCount).toBe(5);
  });

  it("unticking an analysis keeps its settings for when it is ticked again", () => {
    const base = updateSetting(initialDraft(received, referential), "p-ecoli", { dilutionFactor: "10", note: "×10" });
    const off = toggleParameter(base, "p-ecoli", referential);
    expect(off.parameterIds).toEqual([]);
    const on = toggleParameter(off, "p-ecoli", referential);
    expect(on.parameterIds).toEqual(["p-ecoli"]);
    expect(on.settings["p-ecoli"]).toMatchObject({ dilutionFactor: "10", note: "×10", normVersionId: "nv-ecoli-2021" });
    // A newly ticked analysis gets the version in force.
    expect(toggleParameter(on, "p-salm", referential).settings["p-salm"].normVersionId).toBe("nv-salm-2021");
  });
});

describe("technicians", () => {
  it("reads each parameter's own family, whatever the catalogue's types say", () => {
    const families = parameterFamilies(referential, "MICRO");
    expect(families.get("p-ecoli")).toBe("MICRO");
    expect(families.get("p-hist")).toBe("CHIMIE");
    expect(families.get("p-flore")).toBe("MICRO");
    // Set to « Autre » on /admin/parametres: it stays « Autre ».
    const autre = { ...referential, parameters: referential.parameters.map((p) => (p.id === "p-flore" ? { ...p, family: "AUTRE" as const } : p)) };
    expect(parameterFamilies(autre, "MICRO").get("p-flore")).toBe("AUTRE");
  });

  it("without a family on the parameter, reads it from the catalogue, the nature's for the rest", () => {
    // A referential served before the parameters carried their family.
    const bare = {
      ...referential,
      parameters: referential.parameters.map((p) => ({ id: p.id, name: p.name, unit: p.unit, threshold: p.threshold, calcFactor: p.calcFactor })),
    } as unknown as ProgrammeReferentialData;
    const families = parameterFamilies(bare, "MICRO");
    expect(families.get("p-ecoli")).toBe("MICRO");
    expect(families.get("p-hist")).toBe("CHIMIE");
    expect(families.get("p-flore")).toBe("MICRO");
    // A germ cited by both families follows the line.
    const ambiguous: ProgrammeReferentialData = {
      ...bare,
      productTypes: [
        ...referential.productTypes,
        { id: "t-mix", name: "Mixte", family: "CHIMIE", clientId: null, criteria: [{ parameterId: "p-ecoli", parameterName: "E. coli", n: 5, c: null, mKind: "VALUE", m: 1, bigM: null, unit: null, normVersionId: null, normVersion: null }] },
      ],
    };
    expect(parameterFamilies(ambiguous, "CHIMIE").get("p-ecoli")).toBe("CHIMIE");
  });

  it("« tous à X » sets the default and lifts every override; « micro à X, chimie à Y » keeps Y on chemistry only", () => {
    const families = parameterFamilies(referential, "MICRO");
    const base = applyProfile(initialDraft(received, referential), referential.profiles[0], referential);
    const mixed = toggleParameter(base, "p-hist", referential);
    expect(spansFamilies(base, families)).toBe(false);
    expect(spansFamilies(mixed, families)).toBe(true);

    const all = assignAll(updateSetting(mixed, "p-salm", { technicianId: "tech2" }), "tech1");
    expect(all.technicianId).toBe("tech1");
    expect(all.settings["p-salm"].technicianId).toBe("");

    const split = assignByFamily(mixed, families, "tech1", "tech2");
    expect(split.technicianId).toBe("tech1");
    expect(split.settings["p-ecoli"].technicianId).toBe("");
    expect(split.settings["p-salm"].technicianId).toBe("");
    expect(split.settings["p-hist"].technicianId).toBe("tech2");
    // The same person on both sides is no override at all.
    expect(assignByFamily(mixed, families, "tech1", "tech1").settings["p-hist"].technicianId).toBe("");
  });
});

describe("entry check and billing", () => {
  it("recomputes the reception's rules with the programmed analyses and units, never blocking", () => {
    const draft = initialDraft(received, referential);
    const checks = entryChecks(sample, draft, referential, DEFAULT_THRESHOLDS);
    // 50 g of food for microbiology would block at reception: a warning here.
    const quantity = checks.find((c) => c.rule === "ALIMENT_MICRO_POIDS");
    expect(quantity?.level).toBe("AVERTISSEMENT");
    expect(checks.every((c) => c.level !== "BLOQUANT")).toBe(true);

    // Histamine programmed with one unit: the rule reads the draft, not the line.
    const histamine = entryChecks(sample, toggleParameter(draft, "p-hist", referential), referential, DEFAULT_THRESHOLDS);
    expect(histamine.find((c) => c.rule === "HISTAMINE_UNITES")?.level).toBe("AVERTISSEMENT");
    expect(entryChecks(sample, { ...toggleParameter(draft, "p-hist", referential), unitCount: 9 }, referential, DEFAULT_THRESHOLDS).find((c) => c.rule === "HISTAMINE_UNITES")?.level).toBe("OK");
  });

  it("prices each programmed analysis from the catalogue and counts the ones to price by hand", () => {
    const draft = applyProfile(initialDraft(received, referential), referential.profiles[0], referential);
    const billing = billingLines(toggleParameter(draft, "p-hist", referential), referential);
    expect(billing.lines.map((l) => [l.name, l.unitPrice])).toEqual([
      ["E. coli", 320],
      ["Salmonelles", 450],
      ["Histamine", null],
    ]);
    expect(billing.total).toBe(770);
    expect(billing.unpriced).toBe(1);
    expect(billingLines({ ...draft, parameterIds: [] }, referential)).toEqual({ lines: [], total: 0, unpriced: 0 });
  });
});

describe("analyses grouped by family (RETOUR-LABO-06-10.md §5, V3)", () => {
  it("lists the line's own family first, flags the other, leaves out the empty groups", () => {
    const groups = groupParameters(referential, "MICRO");
    expect(groups.map((g) => [g.family, g.label, g.foreign, g.parameters.map((p) => p.id)])).toEqual([
      ["MICRO", "Analyses microbiologiques", false, ["p-ecoli", "p-salm", "p-flore"]],
      ["CHIMIE", "Analyses physico-chimiques", true, ["p-hist"]],
    ]);
  });

  it("puts a chemistry sample's own family at the head", () => {
    expect(groupParameters(referential, "CHIMIE").map((g) => [g.family, g.foreign])).toEqual([
      ["CHIMIE", false],
      ["MICRO", true],
    ]);
    expect(groupParameters({ ...referential, parameters: [] }, "MICRO")).toEqual([]);
  });
});

describe("nature d'analyse (Q49 by default)", () => {
  /** The referential the route computes for the fine nature: another category, other parameters. */
  const fine: ProgrammeReferentialData = {
    ...referential,
    natureId: "nat-fine",
    category: "AMBIANCE",
    natures: referential.natures.map((n) => ({ ...n })),
    parameters: [
      { id: "p-flore", name: "Flore totale", unit: "UFC/g", threshold: null, calcFactor: 1, family: "MICRO", category: "AMBIANCE" },
      { id: "p-levures", name: "Levures", unit: "UFC/g", threshold: null, calcFactor: 1, family: "MICRO", category: "AMBIANCE" },
    ],
    profiles: [],
  };

  it("offers the current nature and the active natures of its family only", () => {
    expect(natureChoices(referential, "MICRO").map((n) => n.id)).toEqual(["nat", "nat-fine"]);
    // The line's own nature stays offered even once archived.
    const archived = { ...referential, natures: referential.natures.map((n) => (n.id === "nat" ? { ...n, active: false } : n)) };
    expect(natureChoices(archived, "MICRO").map((n) => n.id)).toEqual(["nat", "nat-fine"]);
  });

  it("switching drops the analyses the new nature does not offer and keeps everything else", () => {
    const base = updateSetting(
      { ...applyProfile(initialDraft(received, referential), referential.profiles[0], referential), unitCount: 3, testPortion: "25 g" },
      "p-ecoli",
      { dilutionFactor: "10" }
    );
    const withFlore = toggleParameter(base, "p-flore", referential);
    const { draft, dropped } = adoptReferential(withFlore, referential, fine);
    expect(draft.natureId).toBe("nat-fine");
    expect(draft.parameterIds).toEqual(["p-flore"]);
    expect(dropped).toEqual(["E. coli", "Salmonelles"]);
    expect(draft.unitCount).toBe(3);
    expect(draft.testPortion).toBe("25 g");
    // Coming back restores the nature; the settings were never lost.
    const back = adoptReferential(draft, fine, referential);
    expect(back.draft.natureId).toBe("nat");
    expect(back.dropped).toEqual([]);
    expect(toggleParameter(back.draft, "p-ecoli", referential).settings["p-ecoli"].dilutionFactor).toBe("10");
  });

  it("says which analyses were dropped and that the change waits for the save", () => {
    expect(natureChangeNotice("Nature fine de test", [], false)).toBe(
      "Nature « Nature fine de test » choisie. Enregistrez le programme pour l'appliquer."
    );
    expect(natureChangeNotice("Nature fine de test", ["E. coli"], false)).toBe(
      "Nature « Nature fine de test » choisie : l'analyse « E. coli » n'existe pas pour cette nature et a été retirée. Enregistrez le programme pour l'appliquer."
    );
    expect(natureChangeNotice("Microbiologie des aliments", ["A", "B"], true)).toBe(
      "Nature d'origine « Microbiologie des aliments » rétablie : 2 analyses n'existent pas pour cette nature et ont été retirées (« A », « B »). Enregistrez le programme pour l'appliquer."
    );
  });

  it("sends the chosen nature with the programme", () => {
    const { draft } = adoptReferential(initialDraft(received, referential), referential, fine);
    expect(toRequestBody(draft, false)).toMatchObject({ natureId: "nat-fine", parameterIds: [] });
  });
});

describe("toRequestBody", () => {
  it("sends the programme as PROGRAMME.md §5 describes it, empties as null, the due date as an instant", () => {
    const draft = updateSetting(
      {
        ...applyProductType(initialDraft(received, referential), "type-catalogue", referential),
        testPortion: " 25 g ",
        priority: "URGENTE",
        dueAt: "2026-10-08T12:00",
        programmeNote: "",
      },
      "p-ecoli",
      { technicianId: "tech2", dilutionFactor: " 10,5 ", note: "" }
    );
    expect(toRequestBody(draft, true)).toEqual({
      confirm: true,
      natureId: "nat",
      productTypeId: "type-catalogue",
      parameterIds: ["p-ecoli", "p-salm"],
      unitCount: 5,
      testPortion: "25 g",
      technicianId: "tech1",
      priority: "URGENTE",
      dueAt: "2026-10-08T12:00:00.000Z",
      programmeNote: null,
      parameters: [
        { parameterId: "p-ecoli", technicianId: "tech2", normVersionId: "nv-ecoli-2021", dilutionFactor: "10,5", note: null },
        { parameterId: "p-salm", technicianId: null, normVersionId: "nv-salm-2021", dilutionFactor: null, note: null },
      ],
    });
  });

  it("keeps the due date on the LEGAL clock either side of the return to GMT (20/09/2026, §8.1)", () => {
    // Before the switch the legal clock was UTC+1; after it, GMT — whatever the device says.
    const september = initialDraft({ ...received, dueAt: "2026-09-10T12:00:00.000Z" }, referential);
    expect(september.dueAt).toBe("2026-09-10T13:00");
    expect(toRequestBody(september, false).dueAt).toBe("2026-09-10T12:00:00.000Z");
    const october = initialDraft({ ...received, dueAt: "2026-10-20T08:30:00.000Z" }, referential);
    expect(october.dueAt).toBe("2026-10-20T08:30");
    expect(toRequestBody(october, false).dueAt).toBe("2026-10-20T08:30:00.000Z");
  });

  it("a draft may be empty and carry no due date", () => {
    const body = toRequestBody({ ...initialDraft(received, referential), parameterIds: [], technicianId: "", dueAt: "" }, false);
    expect(body).toMatchObject({ confirm: false, parameterIds: [], technicianId: null, dueAt: null, productTypeId: null, parameters: [] });
  });
});
