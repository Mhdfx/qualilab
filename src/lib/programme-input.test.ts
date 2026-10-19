import { describe, expect, it } from "vitest";
import {
  DUE_AT_MAX_AHEAD_MS,
  DUE_AT_TOLERANCE_MS,
  MAX_DILUTION_FACTOR,
  MAX_PARAMETER_NOTE,
  MAX_PROGRAMME_NOTE,
  MAX_TEST_PORTION,
  natureHomeFromJournal,
  programmeNatureFamilies,
  programmeParameterRows,
  resolveProgrammeNature,
  validateProgramme,
  type ProgrammeContext,
  type ProgrammeNatureRef,
} from "./programme-input";
import { MAX_UNITS } from "./series";

/**
 * PROGRAMME.md §5 — every rule of the programme d'analyse, one by one. The
 * referential is given, never looked up: the function must stay pure.
 */
const NOW = new Date("2026-10-06T10:00:00.000Z");

/**
 * Invented natures: two micro ones of the food category, one of water, one
 * archived, one physico-chemical, and the sensory one of « Autres analyses »
 * (Q129).
 */
const natures: ProgrammeNatureRef[] = [
  { id: "nat-micro-aliments", label: "Microbiologie des aliments", family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
  { id: "nat-micro-fine", label: "Microbiologie d'une nature fine", family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
  { id: "nat-micro-eaux", label: "Microbiologie des eaux", family: "MICRO", legacyType: "EAU", active: true },
  { id: "nat-micro-retiree", label: "Microbiologie retirée", family: "MICRO", legacyType: "ALIMENTAIRE", active: false },
  { id: "nat-pc-aliments", label: "Physico-chimie des aliments", family: "CHIMIE", legacyType: "ALIMENTAIRE", active: true },
  { id: "nat-sensorielle", label: "Analyse sensorielle", family: "AUTRE", legacyType: "ALIMENTAIRE", active: true },
];

const ctx: ProgrammeContext = {
  status: "RECU",
  clientId: "client-a",
  natureId: "nat-micro-aliments",
  natureFamily: "MICRO",
  twin: null,
  natures,
  productTypes: [
    { id: "type-catalogue", clientId: null, active: true },
    { id: "type-client-a", clientId: "client-a", active: true },
    { id: "type-client-b", clientId: "client-b", active: true },
    { id: "type-retired", clientId: null, active: false },
  ],
  parameterIds: ["p-ecoli", "p-salm", "p-hist"],
  normVersionIds: { "p-ecoli": ["nv-ecoli-2021", "nv-ecoli-2013"], "p-salm": ["nv-salm-2021"] },
  now: NOW,
};

const good = {
  confirm: true,
  productTypeId: "type-client-a",
  parameterIds: ["p-ecoli", "p-salm"],
  unitCount: 5,
  testPortion: "25 g",
  priority: "URGENTE",
  dueAt: "2026-10-08T12:00:00.000Z",
  programmeNote: "Conserver à 4 °C",
  parameters: [
    { parameterId: "p-ecoli", normVersionId: "nv-ecoli-2021", dilutionFactor: 10, note: "×10" },
    { parameterId: "p-salm", normVersionId: null, dilutionFactor: null, note: null },
  ],
};

function expectError(raw: unknown, fragment: string | RegExp, context: ProgrammeContext = ctx, httpStatus = 400) {
  const checked = validateProgramme(raw, context);
  expect(checked.ok).toBe(false);
  if (!checked.ok) {
    expect(checked.error).toMatch(fragment);
    expect(checked.httpStatus).toBe(httpStatus);
  }
}

describe("validateProgramme — a complete programme", () => {
  it("accepts it and normalises every field", () => {
    const checked = validateProgramme(good, ctx);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value).toEqual({
      confirm: true,
      natureId: "nat-micro-aliments",
      productTypeId: "type-client-a",
      parameterIds: ["p-ecoli", "p-salm"],
      unitCount: 5,
      testPortion: "25 g",
      priority: "URGENTE",
      dueAt: new Date("2026-10-08T12:00:00.000Z"),
      programmeNote: "Conserver à 4 °C",
      parameters: [
        { parameterId: "p-ecoli", normVersionId: "nv-ecoli-2021", dilutionFactor: 10, note: "×10" },
        { parameterId: "p-salm", normVersionId: null, dilutionFactor: null, note: null },
      ],
    });
  });

  it("accepts the smallest draft: nothing decided yet", () => {
    const checked = validateProgramme({ confirm: false, parameterIds: [], unitCount: 1 }, ctx);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.parameterIds).toEqual([]);
    expect(checked.value.parameters).toEqual([]);
    expect(checked.value.productTypeId).toBeNull();
    expect(checked.value.priority).toBe("NORMALE");
    expect(checked.value.dueAt).toBeNull();
    expect(checked.value.testPortion).toBeNull();
    expect(checked.value.programmeNote).toBeNull();
  });

  it("fills a programmed parameter that has no settings with nulls, in the analyses' order", () => {
    const checked = validateProgramme({ ...good, parameters: [good.parameters[1]] }, ctx);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.parameters.map((p) => p.parameterId)).toEqual(["p-ecoli", "p-salm"]);
    expect(checked.value.parameters[0]).toEqual({
      parameterId: "p-ecoli",
      normVersionId: null,
      dilutionFactor: null,
      note: null,
    });
  });

  it("drops the settings of an analysis that is not programmed, and repeated analyses", () => {
    const checked = validateProgramme(
      {
        ...good,
        parameterIds: ["p-ecoli", "p-ecoli"],
        parameters: [...good.parameters, { parameterId: "p-hist", dilutionFactor: 10 }],
      },
      ctx
    );
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.parameterIds).toEqual(["p-ecoli"]);
    expect(checked.value.parameters).toHaveLength(1);
  });

  it("refuses anything that is not an object", () => {
    expectError(null, /Requête invalide/);
    expectError("programme", /Requête invalide/);
    expectError([], /Requête invalide/);
    expectError({ ...good, confirm: "oui" }, /confirm/);
  });
});

describe("validateProgramme — the status", () => {
  it("accepts a received or a programmed line", () => {
    expect(validateProgramme(good, { ...ctx, status: "RECU" }).ok).toBe(true);
    expect(validateProgramme(good, { ...ctx, status: "PROGRAMME" }).ok).toBe(true);
  });

  it("refuses with 409 once the bench has started, and anything after", () => {
    for (const status of ["PRELEVE", "EN_ANALYSE", "RESULTATS_SAISIS", "VALIDE", "RAPPORT_ENVOYE", "ANNULE"] as const) {
      expectError(good, /ne peut plus être modifié/, { ...ctx, status }, 409);
    }
  });

  it("names the status in French", () => {
    expectError(good, /« En analyse »/, { ...ctx, status: "EN_ANALYSE" }, 409);
  });
});

describe("validateProgramme — the analyses", () => {
  it("needs at least one analysis to confirm, none for a draft", () => {
    expectError({ ...good, parameterIds: [] }, /au moins une analyse/);
    expect(validateProgramme({ ...good, confirm: false, parameterIds: [] }, ctx).ok).toBe(true);
  });

  it("never lets an edit empty a confirmed programme", () => {
    expectError({ ...good, confirm: false, parameterIds: [] }, /au moins une analyse/, { ...ctx, status: "PROGRAMME" });
  });

  it("refuses an analysis the nature does not offer", () => {
    expectError({ ...good, parameterIds: ["p-ecoli", "p-ph"] }, "Une des analyses demandées n'existe pas pour cette nature.");
  });

  it("names the refused analysis when its name is known, and counts several", () => {
    const named = { ...ctx, parameterNames: { "p-ph": "pH", "p-nitrates": "Nitrates" } };
    expectError({ ...good, parameterIds: ["p-ecoli", "p-ph"] }, "L'analyse « pH » n'existe pas pour cette nature.", named);
    expectError(
      { ...good, parameterIds: ["p-ph", "p-nitrates", "p-ecoli"] },
      "2 analyses demandées n'existent pas (« pH », « Nitrates ») pour cette nature.",
      named
    );
  });

  it("refuses a malformed list", () => {
    expectError({ ...good, parameterIds: "p-ecoli" }, /liste des analyses/);
    expectError({ ...good, parameterIds: [42] }, /liste des analyses/);
    expectError({ ...good, parameterIds: [""] }, /liste des analyses/);
  });
});

describe("validateProgramme — the product type", () => {
  it("accepts the catalogue, the client's own type, or none", () => {
    expect(validateProgramme({ ...good, productTypeId: "type-catalogue" }, ctx).ok).toBe(true);
    expect(validateProgramme({ ...good, productTypeId: "type-client-a" }, ctx).ok).toBe(true);
    for (const none of [null, undefined, ""]) {
      const checked = validateProgramme({ ...good, productTypeId: none }, ctx);
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.value.productTypeId).toBeNull();
    }
  });

  it("refuses another client's type, a retired one, or an unknown one", () => {
    expectError({ ...good, productTypeId: "type-client-b" }, /Famille de produits inconnue/);
    expectError({ ...good, productTypeId: "type-retired" }, /Famille de produits inconnue/);
    expectError({ ...good, productTypeId: "type-nowhere" }, /Famille de produits inconnue/);
    expectError({ ...good, productTypeId: 12 }, /Famille de produits invalide/);
  });
});

describe("validateProgramme — the numbers", () => {
  it(`keeps the units between 1 and ${MAX_UNITS}`, () => {
    expect(validateProgramme({ ...good, unitCount: 1 }, ctx).ok).toBe(true);
    expect(validateProgramme({ ...good, unitCount: MAX_UNITS }, ctx).ok).toBe(true);
    expect(validateProgramme({ ...good, unitCount: "9" }, ctx).ok).toBe(true);
    expectError({ ...good, unitCount: 0 }, /nombre d'unités/);
    expectError({ ...good, unitCount: MAX_UNITS + 1 }, /nombre d'unités/);
    expectError({ ...good, unitCount: 2.5 }, /nombre d'unités/);
    expectError({ ...good, unitCount: "cinq" }, /nombre d'unités/);
    expectError({ ...good, unitCount: undefined }, /nombre d'unités/);
  });

  it("trims the test portion and bounds its length", () => {
    const checked = validateProgramme({ ...good, testPortion: "  100 mL " }, ctx);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.value.testPortion).toBe("100 mL");
    const blank = validateProgramme({ ...good, testPortion: "   " }, ctx);
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.testPortion).toBeNull();
    expectError({ ...good, testPortion: "x".repeat(MAX_TEST_PORTION + 1) }, /prise d'essai est trop longue/);
    expectError({ ...good, testPortion: 25 }, /prise d'essai est invalide/);
  });
});

describe("validateProgramme — the organisation (13/10: « prise en charge libre »)", () => {
  it("confirms with no technician at all: the sample goes to « À prendre »", () => {
    const confirmed = validateProgramme(good, ctx);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.value.confirm).toBe(true);
    // Every edit of a confirmed programme too — nobody to name, ever.
    expect(validateProgramme({ ...good, confirm: false }, { ...ctx, status: "PROGRAMME" }).ok).toBe(true);
    // The smallest confirmation: one analysis and nothing else decided.
    expect(validateProgramme({ confirm: true, parameterIds: ["p-salm"], unitCount: 1 }, ctx).ok).toBe(true);
  });

  it("ignores a technicianId an old tab still sends, at the top and per analysis", () => {
    // Whatever it names — a technician, an unknown or banned account, another
    // role, junk: never refused, never kept (as the reception does since 08/10).
    for (const technicianId of ["tech1", "tech-banned", "valid1", "tech-nowhere", 7, "", null, { id: "tech1" }]) {
      const checked = validateProgramme(
        { ...good, technicianId, parameters: good.parameters.map((p) => ({ ...p, technicianId })) },
        ctx
      );
      expect(checked.ok).toBe(true);
      if (!checked.ok) continue;
      expect(checked.value).not.toHaveProperty("technicianId");
      for (const parameter of checked.value.parameters) expect(parameter).not.toHaveProperty("technicianId");
    }
    // On the edit of a confirmed programme as well.
    const edit = validateProgramme({ ...good, confirm: false, technicianId: "tech2" }, { ...ctx, status: "PROGRAMME" });
    expect(edit.ok).toBe(true);
    if (edit.ok) expect(edit.value).not.toHaveProperty("technicianId");
  });

  it("knows two priorities and defaults to the normal one", () => {
    const missing = validateProgramme({ ...good, priority: undefined }, ctx);
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value.priority).toBe("NORMALE");
    expect(validateProgramme({ ...good, priority: "NORMALE" }, ctx).ok).toBe(true);
    expectError({ ...good, priority: "HAUTE" }, /Priorité inconnue/);
  });

  it("refuses a due date in the past, with a five-minute tolerance", () => {
    const justBefore = new Date(NOW.getTime() - DUE_AT_TOLERANCE_MS + 1000).toISOString();
    expect(validateProgramme({ ...good, dueAt: justBefore }, ctx).ok).toBe(true);
    const tooEarly = new Date(NOW.getTime() - DUE_AT_TOLERANCE_MS - 1000).toISOString();
    expectError({ ...good, dueAt: tooEarly }, /dans le passé/);
    expectError({ ...good, dueAt: "hier" }, /délai de rendu est invalide/);
    expectError({ ...good, dueAt: 1_700_000_000 }, /délai de rendu est invalide/);
  });

  it("refuses a due date more than a year ahead (full-db 12/10: a 500 on « +010000-01-01 »)", () => {
    const inAYear = new Date(NOW.getTime() + DUE_AT_MAX_AHEAD_MS - 1000).toISOString();
    expect(validateProgramme({ ...good, dueAt: inAYear }, ctx).ok).toBe(true);
    expectError({ ...good, dueAt: new Date(NOW.getTime() + DUE_AT_MAX_AHEAD_MS + 1000).toISOString() }, /trop lointain/);
    expectError({ ...good, dueAt: "+010000-01-01" }, /trop lointain/);
  });

  it("accepts no due date at all", () => {
    for (const none of [null, undefined, ""]) {
      const checked = validateProgramme({ ...good, dueAt: none }, ctx);
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.value.dueAt).toBeNull();
    }
  });

  it("bounds the instructions", () => {
    expectError({ ...good, programmeNote: "x".repeat(MAX_PROGRAMME_NOTE + 1) }, /consignes sont trop longues/);
    expectError({ ...good, programmeNote: ["a"] }, /consignes sont invalides/);
    const blank = validateProgramme({ ...good, programmeNote: " " }, ctx);
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.programmeNote).toBeNull();
  });
});

describe("validateProgramme — per-parameter settings", () => {
  const withSetting = (setting: Record<string, unknown>) => ({
    ...good,
    parameters: [{ parameterId: "p-ecoli", ...setting }],
  });

  it("refuses a malformed list or entry", () => {
    expectError({ ...good, parameters: {} }, /réglages par analyse/);
    expectError({ ...good, parameters: ["p-ecoli"] }, /réglages par analyse/);
    expectError({ ...good, parameters: [{ normVersionId: "nv-ecoli-2021" }] }, /réglages par analyse/);
  });

  it("refuses the same analysis twice", () => {
    expectError(
      { ...good, parameters: [{ parameterId: "p-ecoli" }, { parameterId: "p-ecoli" }] },
      /deux fois/
    );
  });

  it("accepts only a norm version that belongs to the parameter", () => {
    expect(validateProgramme(withSetting({ normVersionId: "nv-ecoli-2013" }), ctx).ok).toBe(true);
    expectError(withSetting({ normVersionId: "nv-salm-2021" }), /Version de norme inconnue/);
    expectError(withSetting({ normVersionId: "nv-nowhere" }), /Version de norme inconnue/);
    expectError(withSetting({ normVersionId: 2021 }), /Version de norme invalide/);
    // A parameter with no versions at all accepts none.
    expectError(
      { ...good, parameterIds: ["p-hist"], parameters: [{ parameterId: "p-hist", normVersionId: "nv-ecoli-2021" }] },
      /Version de norme inconnue/
    );
  });

  it("needs a dilution factor above zero, reads a typed comma, rounds to four decimals", () => {
    const typed = validateProgramme(withSetting({ dilutionFactor: "10,12345" }), ctx);
    expect(typed.ok).toBe(true);
    if (typed.ok) expect(typed.value.parameters[0].dilutionFactor).toBe(10.1235);
    expect(validateProgramme(withSetting({ dilutionFactor: 0.5 }), ctx).ok).toBe(true);
    expect(validateProgramme(withSetting({ dilutionFactor: MAX_DILUTION_FACTOR }), ctx).ok).toBe(true);
    expectError(withSetting({ dilutionFactor: 0 }), /facteur de dilution/);
    expectError(withSetting({ dilutionFactor: -10 }), /facteur de dilution/);
    expectError(withSetting({ dilutionFactor: 0.00001 }), /facteur de dilution/);
    expectError(withSetting({ dilutionFactor: MAX_DILUTION_FACTOR + 1 }), /facteur de dilution/);
    expectError(withSetting({ dilutionFactor: "dix" }), /facteur de dilution/);
    expectError(withSetting({ dilutionFactor: Number.NaN }), /facteur de dilution/);
    const none = validateProgramme(withSetting({ dilutionFactor: "" }), ctx);
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.value.parameters[0].dilutionFactor).toBeNull();
  });

  it("bounds the method note", () => {
    expectError(withSetting({ note: "x".repeat(MAX_PARAMETER_NOTE + 1) }), /note de méthode est trop longue/);
    expectError(withSetting({ note: 12 }), /note de méthode est invalide/);
    const trimmed = validateProgramme(withSetting({ note: "  incubation 48 h " }), ctx);
    expect(trimmed.ok).toBe(true);
    if (trimmed.ok) expect(trimmed.value.parameters[0].note).toBe("incubation 48 h");
  });
});

describe("programmeParameterRows — legacy per-analysis technicians (before 13/10)", () => {
  const programmed = [
    { parameterId: "p-ecoli", normVersionId: "nv-ecoli-2021", dilutionFactor: 10, note: "×10" },
    { parameterId: "p-salm", normVersionId: null, dilutionFactor: null, note: null },
  ];

  it("writes one row per programmed analysis, in order, with its settings", () => {
    expect(programmeParameterRows("s1", programmed, [])).toEqual([
      { sampleId: "s1", parameterId: "p-ecoli", technicianId: null, normVersionId: "nv-ecoli-2021", dilutionFactor: 10, note: "×10" },
      { sampleId: "s1", parameterId: "p-salm", technicianId: null, normVersionId: null, dilutionFactor: null, note: null },
    ]);
  });

  it("keeps the technician of an analysis kept, gives none to an analysis added, drops the one removed", () => {
    // The line held p-ecoli by tech1 and p-hist by tech2; p-hist leaves, p-salm arrives.
    const legacy = [
      { parameterId: "p-ecoli", technicianId: "tech1" },
      { parameterId: "p-hist", technicianId: "tech2" },
    ];
    const rows = programmeParameterRows("s1", programmed, legacy);
    expect(rows.map((row) => [row.parameterId, row.technicianId])).toEqual([
      ["p-ecoli", "tech1"],
      ["p-salm", null],
    ]);
    expect(rows.some((row) => row.technicianId === "tech2")).toBe(false);
  });

  it("never invents a technician: a legacy row without one, or none at all, writes null", () => {
    const rows = programmeParameterRows("s1", programmed, [{ parameterId: "p-ecoli", technicianId: null }]);
    expect(rows.every((row) => row.technicianId === null)).toBe(true);
    expect(programmeParameterRows("s1", [], [{ parameterId: "p-ecoli", technicianId: "tech1" }])).toEqual([]);
  });

  it("reads the technician from the line, never from the request", () => {
    // A stale sheet's technician survives validation as nothing at all.
    const checked = validateProgramme(
      { ...good, technicianId: "tech2", parameters: good.parameters.map((p) => ({ ...p, technicianId: "tech2" })) },
      ctx
    );
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const rows = programmeParameterRows("s1", checked.value.parameters, [{ parameterId: "p-salm", technicianId: "tech1" }]);
    expect(rows.map((row) => row.technicianId)).toEqual([null, "tech1"]);
  });
});

describe("validateProgramme — the nature (Q49, within the family; Q129)", () => {
  it("keeps the current nature when the request names none, an empty one or the same", () => {
    for (const natureId of [undefined, null, "", "nat-micro-aliments"]) {
      const checked = validateProgramme({ ...good, natureId }, ctx);
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.value.natureId).toBe("nat-micro-aliments");
    }
  });

  it("accepts another active nature of the same family", () => {
    const checked = validateProgramme({ ...good, natureId: "nat-micro-fine" }, ctx);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.value.natureId).toBe("nat-micro-fine");
  });

  it("refuses a nature of the other family: that is another sample", () => {
    expectError({ ...good, natureId: "nat-pc-aliments" }, /même domaine \(analyses microbiologiques\)/);
    expectError({ ...good, natureId: "nat-pc-aliments" }, /autre échantillon/);
    // Even on « …M »: microbiology never becomes physico-chemistry.
    expectError({ ...good, natureId: "nat-pc-aliments" }, /même domaine/, { ...ctx, twin: "M" });
  });

  it("accepts the sensory analysis of a food (16/10, Q129), checked against its category", () => {
    for (const twin of [null, "M"] as const) {
      const checked = validateProgramme({ ...good, natureId: "nat-sensorielle" }, { ...ctx, twin });
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.value.natureId).toBe("nat-sensorielle");
    }
  });

  it("refuses an archived, an unknown or a malformed nature", () => {
    expectError({ ...good, natureId: "nat-micro-retiree" }, "La nature « Microbiologie retirée » est archivée : choisissez-en une autre.");
    expectError({ ...good, natureId: "nat-nowhere" }, "Nature d'analyse inconnue.");
    expectError({ ...good, natureId: 42 }, "Nature d'analyse invalide.");
  });

  it("checks the nature before the analyses, and the status before the nature", () => {
    expectError({ ...good, natureId: "nat-pc-aliments", parameterIds: ["p-nowhere"] }, /même domaine/);
    expectError({ ...good, natureId: "nat-pc-aliments" }, /ne peut plus être modifié/, { ...ctx, status: "EN_ANALYSE" }, 409);
  });

  it("refuses the analyses the new nature's category does not offer, and says how to get out", () => {
    // The route hands the parameters of the requested nature's category (water here).
    const water = { ...ctx, parameterIds: ["p-coliformes"], parameterNames: { "p-ecoli": "E. coli", "p-salm": "Salmonella" } };
    expectError(
      { ...good, natureId: "nat-micro-eaux", parameters: [] },
      "2 analyses demandées n'existent pas (« E. coli », « Salmonella ») pour la nature « Microbiologie des eaux » : retirez-les ou gardez la nature actuelle.",
      water
    );
    expectError(
      { ...good, natureId: "nat-micro-eaux", parameterIds: ["p-coliformes", "p-ecoli"], parameters: [] },
      "L'analyse « E. coli » n'existe pas pour la nature « Microbiologie des eaux » : retirez-la ou gardez la nature actuelle.",
      water
    );
    const checked = validateProgramme(
      { ...good, natureId: "nat-micro-eaux", parameterIds: ["p-coliformes"], parameters: [] },
      water
    );
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.value.natureId).toBe("nat-micro-eaux");
      expect(checked.value.parameterIds).toEqual(["p-coliformes"]);
    }
  });

  it("lets a draft change the nature with no analysis yet", () => {
    const checked = validateProgramme({ confirm: false, natureId: "nat-micro-fine", parameterIds: [], unitCount: 1 }, ctx);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.value.natureId).toBe("nat-micro-fine");
  });
});

describe("resolveProgrammeNature", () => {
  const natureCtx = { natureId: "nat-micro-aliments", natureFamily: "MICRO" as const, twin: null, natures };

  it("tells the route whether the nature changes, and to which", () => {
    expect(resolveProgrammeNature({}, natureCtx)).toEqual({ ok: true, natureId: "nat-micro-aliments", changed: null });
    expect(resolveProgrammeNature({ natureId: "nat-micro-aliments" }, natureCtx)).toEqual({
      ok: true,
      natureId: "nat-micro-aliments",
      changed: null,
    });
    expect(resolveProgrammeNature({ natureId: "nat-micro-eaux" }, natureCtx)).toEqual({
      ok: true,
      natureId: "nat-micro-eaux",
      changed: natures[2],
    });
  });

  it("reads nothing from what is not an object", () => {
    for (const raw of [null, "nat-micro-eaux", ["nat-micro-eaux"], 3]) {
      expect(resolveProgrammeNature(raw, natureCtx)).toEqual({ ok: true, natureId: "nat-micro-aliments", changed: null });
    }
  });

  it("keeps the kind of sample: a food line never becomes a water nature", () => {
    const kinded = natures.map((n) => ({ ...n, defaultLineKind: n.legacyType === "EAU" ? ("EAU" as const) : ("ALIMENT" as const) }));
    const kindCtx = {
      natureId: "nat-micro-aliments",
      natureFamily: "MICRO" as const,
      natureLineKind: "ALIMENT" as const,
      twin: null,
      natures: kinded,
    };
    const refused = resolveProgrammeNature({ natureId: "nat-micro-eaux" }, kindCtx);
    expect(refused).toMatchObject({ ok: false });
    if (!refused.ok) expect(refused.error).toMatch(/autre type d'échantillon/);
    expect(resolveProgrammeNature({ natureId: "nat-micro-fine" }, kindCtx)).toMatchObject({ ok: true, natureId: "nat-micro-fine" });
  });

});

describe("programmeNatureFamilies (16/10, Q129)", () => {
  it("opens « Autres analyses » to a microbiology or physico-chemistry line", () => {
    expect(programmeNatureFamilies("MICRO", null)).toEqual(["MICRO", "AUTRE"]);
    expect(programmeNatureFamilies("MICRO", "M")).toEqual(["MICRO", "AUTRE"]);
    expect(programmeNatureFamilies("CHIMIE", "P")).toEqual(["CHIMIE", "AUTRE"]);
    expect(programmeNatureFamilies("CHIMIE", null)).toEqual(["CHIMIE", "AUTRE"]);
  });

  it("sends a line on « Autres analyses » back to its code's family, or to either without a letter", () => {
    expect(programmeNatureFamilies("AUTRE", "M")).toEqual(["MICRO", "AUTRE"]);
    expect(programmeNatureFamilies("AUTRE", "P")).toEqual(["CHIMIE", "AUTRE"]);
    expect(programmeNatureFamilies("AUTRE", null)).toEqual(["MICRO", "CHIMIE", "AUTRE"]);
  });

  it("sends a single-sample line back only to the domain it came from, when the journal knows it", () => {
    expect(programmeNatureFamilies("AUTRE", null, "MICRO")).toEqual(["MICRO", "AUTRE"]);
    expect(programmeNatureFamilies("AUTRE", null, "CHIMIE")).toEqual(["CHIMIE", "AUTRE"]);
    // The code's letter wins; a home elsewhere than « Autres analyses » only.
    expect(programmeNatureFamilies("AUTRE", "P", "MICRO")).toEqual(["CHIMIE", "AUTRE"]);
    expect(programmeNatureFamilies("AUTRE", null, "AUTRE")).toEqual(["MICRO", "CHIMIE", "AUTRE"]);
    expect(programmeNatureFamilies("MICRO", null, "CHIMIE")).toEqual(["MICRO", "AUTRE"]);
  });
});

describe("natureHomeFromJournal — where a line on « Autres analyses » came from", () => {
  const families = new Map(natures.map((n) => [n.id, n.family]));

  it("reads the last move into the current nature", () => {
    const changes = [{ before: "nat-micro-aliments", after: "nat-sensorielle" }];
    expect(natureHomeFromJournal(changes, "nat-sensorielle", families)).toBe("MICRO");
  });

  it("walks back through other natures of « Autres analyses », newest first", () => {
    const withOther = new Map([...families, ["nat-autre-2", "AUTRE" as const]]);
    const changes = [
      { before: "nat-sensorielle", after: "nat-autre-2" },
      { before: "nat-pc-aliments", after: "nat-sensorielle" },
      { before: "nat-micro-aliments", after: "nat-pc-aliments" },
    ];
    expect(natureHomeFromJournal(changes, "nat-autre-2", withOther)).toBe("CHIMIE");
  });

  it("knows nothing for a line never moved there, or a nature it cannot read", () => {
    expect(natureHomeFromJournal([], "nat-sensorielle", families)).toBeNull();
    expect(natureHomeFromJournal([{ before: "nat-micro-aliments", after: "nat-micro-fine" }], "nat-sensorielle", families)).toBeNull();
    expect(natureHomeFromJournal([{ before: "nat-inconnue", after: "nat-sensorielle" }], "nat-sensorielle", families)).toBeNull();
  });
});

describe("resolveProgrammeNature — « Autres analyses » (16/10, Q129)", () => {
  /** The kind of sample of each invented nature: water for the water one, food otherwise (the sensory one too). */
  const kinded = natures.map((n) => ({ ...n, defaultLineKind: n.legacyType === "EAU" ? ("EAU" as const) : ("ALIMENT" as const) }));
  const sensory = kinded.find((n) => n.id === "nat-sensorielle");
  const line = {
    natureId: "nat-micro-aliments",
    natureFamily: "MICRO" as const,
    natureLineKind: "ALIMENT" as const,
    twin: null,
    natures: kinded,
  };
  const sensoryLine = { ...line, natureId: "nat-sensorielle", natureFamily: "AUTRE" as const };
  const otherFamily =
    "Choisissez une nature du même domaine (analyses microbiologiques) ou des autres analyses : l'autre domaine fait l'objet d'un autre échantillon.";

  it("takes a food line from microbiology or physico-chemistry to the sensory analysis", () => {
    for (const twin of [null, "M"] as const) {
      expect(resolveProgrammeNature({ natureId: "nat-sensorielle" }, { ...line, twin })).toEqual({
        ok: true,
        natureId: "nat-sensorielle",
        changed: sensory,
      });
    }
    const chemistry = { ...line, natureId: "nat-pc-aliments", natureFamily: "CHIMIE" as const, twin: "P" as const };
    expect(resolveProgrammeNature({ natureId: "nat-sensorielle" }, chemistry)).toMatchObject({ ok: true, natureId: "nat-sensorielle" });
  });

  it("brings a sensory « …M » line back to microbiology, never to physico-chemistry", () => {
    const m = { ...sensoryLine, twin: "M" as const };
    expect(resolveProgrammeNature({ natureId: "nat-micro-aliments" }, m)).toMatchObject({ ok: true, natureId: "nat-micro-aliments" });
    expect(resolveProgrammeNature({ natureId: "nat-micro-fine" }, m)).toMatchObject({ ok: true, natureId: "nat-micro-fine" });
    expect(resolveProgrammeNature({ natureId: "nat-pc-aliments" }, m)).toEqual({
      ok: false,
      error:
        "Choisissez une nature des autres analyses ou du domaine de l'échantillon (analyses microbiologiques) : l'autre domaine fait l'objet d'un autre échantillon.",
    });
  });

  it("brings a sensory « …P » line back to physico-chemistry, never to microbiology", () => {
    const p = { ...sensoryLine, twin: "P" as const };
    expect(resolveProgrammeNature({ natureId: "nat-pc-aliments" }, p)).toMatchObject({ ok: true, natureId: "nat-pc-aliments" });
    const refused = resolveProgrammeNature({ natureId: "nat-micro-fine" }, p);
    expect(refused).toMatchObject({ ok: false });
    if (!refused.ok) expect(refused.error).toMatch(/domaine de l'échantillon \(analyses physico-chimiques\)/);
  });

  it("lets a sensory single-sample line go back to either family when its past is unknown", () => {
    expect(resolveProgrammeNature({ natureId: "nat-micro-aliments" }, sensoryLine)).toMatchObject({ ok: true });
    expect(resolveProgrammeNature({ natureId: "nat-pc-aliments" }, sensoryLine)).toMatchObject({ ok: true });
  });

  it("never lets a single-sample line hop MICRO → sensory → CHIMIE: back to its own domain only (Q49)", () => {
    const fromMicro = { ...sensoryLine, natureHome: "MICRO" as const };
    expect(resolveProgrammeNature({ natureId: "nat-micro-aliments" }, fromMicro)).toMatchObject({ ok: true });
    expect(resolveProgrammeNature({ natureId: "nat-pc-aliments" }, fromMicro)).toEqual({
      ok: false,
      error:
        "Choisissez une nature des autres analyses ou du domaine de l'échantillon (analyses microbiologiques) : l'autre domaine fait l'objet d'un autre échantillon.",
    });
  });

  it("still refuses microbiology → physico-chemistry, with or without a letter", () => {
    for (const twin of [null, "M"] as const) {
      expect(resolveProgrammeNature({ natureId: "nat-pc-aliments" }, { ...line, twin })).toEqual({ ok: false, error: otherFamily });
    }
  });

  it("never takes a water line to the sensory analysis of a food", () => {
    const water = { ...line, natureId: "nat-micro-eaux", natureLineKind: "EAU" as const };
    expect(resolveProgrammeNature({ natureId: "nat-sensorielle" }, water)).toEqual({
      ok: false,
      error: "La nature « Analyse sensorielle » concerne un autre type d'échantillon : choisissez une nature de ce type.",
    });
  });

  it("refuses an archived « Autres analyses » nature like any other", () => {
    const archived = { ...line, natures: kinded.map((n) => (n.id === "nat-sensorielle" ? { ...n, active: false } : n)) };
    expect(resolveProgrammeNature({ natureId: "nat-sensorielle" }, archived)).toEqual({
      ok: false,
      error: "La nature « Analyse sensorielle » est archivée : choisissez-en une autre.",
    });
  });
});
