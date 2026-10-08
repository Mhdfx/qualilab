import { describe, expect, it } from "vitest";
import {
  DUE_AT_TOLERANCE_MS,
  MAX_DILUTION_FACTOR,
  MAX_PARAMETER_NOTE,
  MAX_PROGRAMME_NOTE,
  MAX_TEST_PORTION,
  resolveProgrammeNature,
  validateProgramme,
  type ProgrammeContext,
  type ProgrammeNatureRef,
  lacksTechnician,
} from "./programme-input";
import { MAX_UNITS } from "./series";

/**
 * PROGRAMME.md §5 — every rule of the programme d'analyse, one by one. The
 * referential is given, never looked up: the function must stay pure.
 */
const NOW = new Date("2026-10-06T10:00:00.000Z");

/** Invented natures: two micro ones of the food category, one of water, one archived, one physico-chemical. */
const natures: ProgrammeNatureRef[] = [
  { id: "nat-micro-aliments", label: "Microbiologie des aliments", family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
  { id: "nat-micro-fine", label: "Microbiologie d'une nature fine", family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
  { id: "nat-micro-eaux", label: "Microbiologie des eaux", family: "MICRO", legacyType: "EAU", active: true },
  { id: "nat-micro-retiree", label: "Microbiologie retirée", family: "MICRO", legacyType: "ALIMENTAIRE", active: false },
  { id: "nat-pc-aliments", label: "Physico-chimie des aliments", family: "CHIMIE", legacyType: "ALIMENTAIRE", active: true },
];

const ctx: ProgrammeContext = {
  status: "RECU",
  clientId: "client-a",
  natureId: "nat-micro-aliments",
  natureFamily: "MICRO",
  natures,
  productTypes: [
    { id: "type-catalogue", clientId: null, active: true },
    { id: "type-client-a", clientId: "client-a", active: true },
    { id: "type-client-b", clientId: "client-b", active: true },
    { id: "type-retired", clientId: null, active: false },
  ],
  parameterIds: ["p-ecoli", "p-salm", "p-hist"],
  technicians: [
    { id: "tech1", role: "TECHNICIEN", banned: false },
    { id: "tech2", role: "TECHNICIEN", banned: null },
    { id: "tech-banned", role: "TECHNICIEN", banned: true },
    { id: "valid1", role: "VALIDATEUR", banned: false },
  ],
  normVersionIds: { "p-ecoli": ["nv-ecoli-2021", "nv-ecoli-2013"], "p-salm": ["nv-salm-2021"] },
  now: NOW,
};

const good = {
  confirm: true,
  productTypeId: "type-client-a",
  parameterIds: ["p-ecoli", "p-salm"],
  unitCount: 5,
  testPortion: "25 g",
  technicianId: "tech1",
  priority: "URGENTE",
  dueAt: "2026-10-08T12:00:00.000Z",
  programmeNote: "Conserver à 4 °C",
  parameters: [
    { parameterId: "p-ecoli", technicianId: null, normVersionId: "nv-ecoli-2021", dilutionFactor: 10, note: "×10" },
    { parameterId: "p-salm", technicianId: "tech2", normVersionId: null, dilutionFactor: null, note: null },
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
      technicianId: "tech1",
      priority: "URGENTE",
      dueAt: new Date("2026-10-08T12:00:00.000Z"),
      programmeNote: "Conserver à 4 °C",
      parameters: [
        { parameterId: "p-ecoli", technicianId: null, normVersionId: "nv-ecoli-2021", dilutionFactor: 10, note: "×10" },
        { parameterId: "p-salm", technicianId: "tech2", normVersionId: null, dilutionFactor: null, note: null },
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
    expect(checked.value.technicianId).toBeNull();
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
      technicianId: null,
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
        parameters: [...good.parameters, { parameterId: "p-hist", technicianId: "tech1" }],
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
    expectError({ ...good, productTypeId: "type-client-b" }, /Type de produit inconnu/);
    expectError({ ...good, productTypeId: "type-retired" }, /Type de produit inconnu/);
    expectError({ ...good, productTypeId: "type-nowhere" }, /Type de produit inconnu/);
    expectError({ ...good, productTypeId: 12 }, /Type de produit invalide/);
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

describe("validateProgramme — the organisation", () => {
  it("accepts an active technician or none as the default", () => {
    expect(validateProgramme({ ...good, technicianId: "tech2" }, ctx).ok).toBe(true);
    // No default on a draft…
    const none = validateProgramme({ ...good, confirm: false, technicianId: null }, ctx);
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.value.technicianId).toBeNull();
    // …or on a confirmation where every analysis has its own technician.
    const each = validateProgramme(
      { ...good, technicianId: null, parameters: good.parameters.map((p) => ({ ...p, technicianId: "tech2" })) },
      ctx
    );
    expect(each.ok).toBe(true);
  });

  it("asks for a technician before confirming (08/10, §9.3: the reception assigns nobody)", () => {
    // p-ecoli has no technician of its own and there is no default.
    expectError({ ...good, technicianId: null }, /Choisissez le technicien \(par défaut ou pour chaque analyse\)/);
    expectError({ ...good, technicianId: "", parameters: [] }, /Choisissez le technicien/);
    // A confirmed programme keeps the rule on every edit.
    expect(validateProgramme({ ...good, confirm: false, technicianId: null }, { ...ctx, status: "PROGRAMME" }).ok).toBe(false);
  });

  it("lacksTechnician: the default covers every analysis", () => {
    expect(lacksTechnician("t1", [null, null])).toBe(false);
    expect(lacksTechnician(null, ["t1", "t2"])).toBe(false);
    expect(lacksTechnician(null, ["t1", null])).toBe(true);
    expect(lacksTechnician("", [])).toBe(true);
  });

  it("refuses a banned account, another role, or an unknown user", () => {
    expectError({ ...good, technicianId: "tech-banned" }, /technicien actif/);
    expectError({ ...good, technicianId: "valid1" }, /technicien actif/);
    expectError({ ...good, technicianId: "tech-nowhere" }, /technicien actif/);
    expectError({ ...good, technicianId: 7 }, /Technicien invalide/);
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
    expectError({ ...good, parameters: [{ technicianId: "tech1" }] }, /réglages par analyse/);
  });

  it("refuses the same analysis twice", () => {
    expectError(
      { ...good, parameters: [{ parameterId: "p-ecoli" }, { parameterId: "p-ecoli" }] },
      /deux fois/
    );
  });

  it("checks the technician of a parameter like the default one", () => {
    expect(validateProgramme(withSetting({ technicianId: "tech2" }), ctx).ok).toBe(true);
    expectError(withSetting({ technicianId: "tech-banned" }), /Technicien invalide pour une analyse/);
    expectError(withSetting({ technicianId: "valid1" }), /Technicien invalide pour une analyse/);
    expectError(withSetting({ technicianId: 3 }), /Technicien invalide pour une analyse/);
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

describe("validateProgramme — the nature (Q49, within the family)", () => {
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
    expectError({ ...good, natureId: "nat-pc-aliments" }, /même famille \(analyses microbiologiques\)/);
    expectError({ ...good, natureId: "nat-pc-aliments" }, /autre échantillon/);
  });

  it("refuses an archived, an unknown or a malformed nature", () => {
    expectError({ ...good, natureId: "nat-micro-retiree" }, "La nature « Microbiologie retirée » est archivée : choisissez-en une autre.");
    expectError({ ...good, natureId: "nat-nowhere" }, "Nature d'analyse inconnue.");
    expectError({ ...good, natureId: 42 }, "Nature d'analyse invalide.");
  });

  it("checks the nature before the analyses, and the status before the nature", () => {
    expectError({ ...good, natureId: "nat-pc-aliments", parameterIds: ["p-nowhere"] }, /même famille/);
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
  const natureCtx = { natureId: "nat-micro-aliments", natureFamily: "MICRO" as const, natures };

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
    const kindCtx = { natureId: "nat-micro-aliments", natureFamily: "MICRO" as const, natureLineKind: "ALIMENT" as const, natures: kinded };
    const refused = resolveProgrammeNature({ natureId: "nat-micro-eaux" }, kindCtx);
    expect(refused).toMatchObject({ ok: false });
    if (!refused.ok) expect(refused.error).toMatch(/autre type d'échantillon/);
    expect(resolveProgrammeNature({ natureId: "nat-micro-fine" }, kindCtx)).toMatchObject({ ok: true, natureId: "nat-micro-fine" });
  });

  it("keeps a family of its own for « Autres analyses »", () => {
    const other = { natureId: "nat-sensorielle", natureFamily: "AUTRE" as const, natures };
    const refused = resolveProgrammeNature({ natureId: "nat-micro-fine" }, other);
    expect(refused).toMatchObject({ ok: false });
    if (!refused.ok) expect(refused.error).toMatch(/même famille \(autres analyses\)/);
  });
});
