import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/labels";
import { DEFAULT_THRESHOLDS } from "@/lib/reception-rules";
import { verbsFor } from "@/lib/sample-verbs";
import {
  adoptReferential,
  applyProductType,
  applyProfile,
  benchHolder,
  benchHolderNotice,
  billingLines,
  checkAllOfType,
  confirmationNotice,
  criteriaOf,
  criterionUnit,
  defaultNormVersionId,
  entryChecks,
  familyChangeNotice,
  familyChangeTookAway,
  familyCheckCount,
  familyCheckLabel,
  familyFilterFor,
  familyGermIds,
  familyParameterRows,
  filterFamilies,
  groupParameters,
  initialDraft,
  natureChangeNotice,
  natureChoices,
  natureHint,
  otherParameterGroups,
  parameterFamilies,
  profileApplied,
  programmeReadOnlyReason,
  programmeVerbsLead,
  programmeVerbsNote,
  toRequestBody,
  toggleParameter,
  typeOf,
  typeUnitCount,
  uncheckAllOfType,
  unitWarning,
  updateSetting,
} from "./programme-sheet-logic";
import type { ProductTypeRef, ProgrammeReferentialData, ProgrammeSampleData, ProgrammeState } from "./programme-sheet-types";

/**
 * PROGRAMME.md §4 — what the sheet does on its own: a family of products
 * replaces the previous one's germs (16/10, Q123 — never the analyses asked
 * for) and proposes n and the norm version, the picker filters the families
 * by type d'analyse (Q124), a profile replaces the analyses, the entry check
 * never blocks, the billing preview prices the programme. Since 13/10
 * (« prise en charge libre ») it hands the line to nobody: it only says who
 * took it at the bench.
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
      natureId: "nat",
      clientId: "client-a",
      criteriaCount: 1,
      criteria: [
        { parameterId: "p-ecoli", parameterName: "E. coli", n: 3, c: 2, mKind: "VALUE", m: 10, bigM: 100, unit: "ufc/g", normVersionId: "nv-ecoli-2013", normVersion: { id: "nv-ecoli-2013", label: "ISO 16649-2:2013", current: false, version: "2013" } },
      ],
    },
    {
      id: "type-catalogue",
      name: "Plat cuisiné",
      family: "MICRO",
      natureId: null,
      clientId: null,
      // One per germ: the older E. coli version is no criterion more (3 rows, 3 germs).
      criteriaCount: 3,
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
      natureId: "nat-pc",
      clientId: null,
      criteriaCount: 1,
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
  familyNatures: [
    { id: "nat", label: "Microbiologie des aliments", category: "ALIMENTAIRE" },
    { id: "nat-pc", label: "Physico-chimie des aliments", category: "ALIMENTAIRE" },
  ],
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
  priority: "NORMALE",
  dueAt: null,
  programmeNote: null,
  parameters: [
    { parameterId: "p-ecoli", normVersionId: null, dilutionFactor: null, note: null },
    { parameterId: "p-retire", normVersionId: null, dilutionFactor: null, note: null },
  ],
  programmedAt: null,
  programmedBy: null,
  editable: true,
};

describe("initialDraft", () => {
  it("pre-ticks the préleveur's analyses and proposes the version in force — no technician to choose", () => {
    const draft = initialDraft(received, referential);
    expect(draft.parameterIds).toEqual(["p-ecoli"]);
    expect(draft.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2021");
    expect(draft).not.toHaveProperty("technicianId");
    expect(draft.settings["p-ecoli"]).not.toHaveProperty("technicianId");
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
        priority: "URGENTE",
        dueAt: "2026-10-08T12:00:00.000Z",
        programmeNote: "Conserver à 4 °C",
        parameters: [
          { parameterId: "p-ecoli", normVersionId: "nv-ecoli-2013", dilutionFactor: 10.5, note: "×10" },
          { parameterId: "p-salm", normVersionId: null, dilutionFactor: null, note: null },
        ],
      },
      referential
    );
    expect(draft.productTypeId).toBe("type-client");
    expect(draft.unitCount).toBe(3);
    expect(draft.priority).toBe("URGENTE");
    expect(draft.dueAt).toBe("2026-10-08T12:00");
    expect(draft.settings["p-ecoli"]).toEqual({ normVersionId: "nv-ecoli-2013", dilutionFactor: "10,5", note: "×10" });
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

  it("ticks the family's germs after the préleveur's requests, proposes its n and the criterion's version", () => {
    const draft = applyProductType(initialDraft({ ...received, parameterIds: ["p-flore"], parameters: [] }, referential), "type-catalogue", referential);
    expect(draft.productTypeId).toBe("type-catalogue");
    // The préleveur's analysis stays, the germs come after it, the unknown one is ignored.
    expect(draft.parameterIds).toEqual(["p-flore", "p-ecoli", "p-salm"]);
    expect(draft.unitCount).toBe(5);
    expect(draft.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2021");
    expect(draft.settings["p-salm"].normVersionId).toBe("nv-salm-2021");
  });

  it("warns when fewer units are read than the family's plans need", () => {
    const draft = { ...initialDraft(received, referential), unitCount: 3 };
    expect(unitWarning(draft, referential.productTypes[1])).toMatch(/^La famille « .+ » attend n = 5 ;/);
    expect(unitWarning(draft, referential.productTypes[1])).toMatch(/3 unités/);
    expect(unitWarning({ ...draft, unitCount: 5 }, referential.productTypes[1])).toBeNull();
    expect(unitWarning(draft, undefined)).toBeNull();
  });
});

describe("changing family replaces its list (16/10, Q123 — RETOUR-LABO-16-10.md F6)", () => {
  /** Family B: shares Salmonelles with « Plat cuisiné » (A), read in 1 g (Q40), and reads 1 unit. */
  const volaille: ProductTypeRef = {
    id: "type-volaille",
    name: "Volaille crue",
    family: "MICRO",
    natureId: "nat",
    clientId: null,
    criteriaCount: 1,
    criteria: [
      { parameterId: "p-salm", parameterName: "Salmonelles", n: 1, c: null, mKind: "ABSENCE", m: null, bigM: null, unit: "/1g", normVersionId: "nv-salm-2021", normVersion: { id: "nv-salm-2021", label: "ISO 6579-1:2021", current: true, version: "2021" } },
    ],
  };
  const sansCritere: ProductTypeRef = { id: "type-vide", name: "Famille sans critère", family: "MICRO", natureId: "nat", clientId: null, criteriaCount: 0, criteria: [] };
  const ref: ProgrammeReferentialData = { ...referential, productTypes: [...referential.productTypes, volaille, sansCritere] };
  /** The préleveur asked for the total flora; nothing programmed yet. */
  const asked = () => initialDraft({ ...received, parameterIds: ["p-flore"], parameters: [] }, ref);

  it("A → B removes the germs that came only from A, keeps the shared ones, the hand-ticked ones and the préleveur's requests", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    expect(withA.parameterIds).toEqual(["p-flore", "p-ecoli", "p-salm"]);
    // Histamine ticked by hand on the sheet.
    const byHand = toggleParameter(withA, "p-hist", ref);
    const withB = applyProductType(byHand, "type-volaille", ref);
    expect(withB.productTypeId).toBe("type-volaille");
    // E. coli came only from A: removed. Salmonelles is B's too: kept (ticked).
    expect(withB.parameterIds).toEqual(["p-flore", "p-salm", "p-hist"]);
    // Its settings survive, for a family that brings it back.
    expect(withB.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2021");
    expect(applyProductType(withB, "type-catalogue", ref).parameterIds).toEqual(["p-flore", "p-salm", "p-hist", "p-ecoli"]);
  });

  it("a germ of A unticked then ticked again by hand stays when B does not have it", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    const again = toggleParameter(toggleParameter(withA, "p-ecoli", ref), "p-ecoli", ref);
    expect(again.parameterIds).toEqual(["p-flore", "p-salm", "p-ecoli"]);
    expect(applyProductType(again, "type-volaille", ref).parameterIds).toEqual(["p-flore", "p-salm", "p-ecoli"]);
    // Unticked by hand and left so: B does not bring it back either.
    const off = toggleParameter(withA, "p-ecoli", ref);
    expect(applyProductType(off, "type-volaille", ref).parameterIds).toEqual(["p-flore", "p-salm"]);
  });

  it("at opening, what the stored family does not explain is the préleveur's — kept when the family changes", () => {
    const opened = initialDraft({ ...received, productTypeId: "type-catalogue", parameterIds: ["p-ecoli", "p-salm", "p-flore"], parameters: [] }, ref);
    expect(opened.manualIds).toEqual(["p-flore"]);
    expect(applyProductType(opened, "type-client", ref).parameterIds).toEqual(["p-ecoli", "p-flore"]);
    // No family stored: everything the line carries was asked for.
    expect(initialDraft(received, ref).manualIds).toEqual(["p-ecoli"]);
    // A family the client may no longer use: nothing to tell apart, nothing removed.
    const lost = initialDraft({ ...received, productTypeId: "type-retire", parameterIds: ["p-ecoli", "p-salm"], parameters: [] }, ref);
    expect(lost.manualIds).toEqual(["p-ecoli", "p-salm"]);
    expect(applyProductType(lost, "type-volaille", ref).parameterIds).toEqual(["p-ecoli", "p-salm"]);
  });

  it("a profile chosen on the sheet counts as asked for", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    const profiled = applyProfile(withA, referential.profiles[0], ref);
    expect(profiled.parameterIds).toEqual(["p-ecoli", "p-salm"]);
    expect(applyProductType(profiled, "type-volaille", ref).parameterIds).toEqual(["p-ecoli", "p-salm"]);
  });

  it("« — aucun — » removes the family's germs the same way, and leaves n as it is", () => {
    const withA = toggleParameter(applyProductType(asked(), "type-catalogue", ref), "p-hist", ref);
    const none = applyProductType(withA, "", ref);
    expect(none.productTypeId).toBe("");
    expect(none.parameterIds).toEqual(["p-flore", "p-hist"]);
    expect(none.unitCount).toBe(5);
    // A family without criteria: same — nothing to read n from.
    const empty = applyProductType(withA, "type-vide", ref);
    expect(empty).toMatchObject({ productTypeId: "type-vide", parameterIds: ["p-flore", "p-hist"], unitCount: 5 });
  });

  it("n is recomputed from the new family, never below the n of a profile chosen on the sheet", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    expect(withA.unitCount).toBe(5);
    // B reads 1 unit: n follows it down.
    expect(applyProductType(withA, "type-volaille", ref).unitCount).toBe(1);
    // A hand-typed n is the family's to recompute; the client's type also brings its version.
    const typed = applyProductType({ ...initialDraft(received, ref), unitCount: 9 }, "type-client", ref);
    expect(typed.unitCount).toBe(3);
    expect(typed.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2013");
    // The histamine profile (n = 9) chosen on the sheet: a family never lowers n below it.
    const profiled = applyProfile(asked(), referential.profiles[1], ref);
    expect(profiled.profileUnitCount).toBe(9);
    expect(applyProductType(profiled, "type-client", ref).unitCount).toBe(9);
  });

  it("« Cocher tout » and « Décocher tout » touch only the family's germs, and mark nothing as asked for", () => {
    const withA = toggleParameter(applyProductType(asked(), "type-catalogue", ref), "p-hist", ref);
    const unchecked = uncheckAllOfType(withA, ref);
    expect(unchecked.parameterIds).toEqual(["p-flore", "p-hist"]);
    expect(unchecked.manualIds).toEqual(withA.manualIds);
    const checked = checkAllOfType(unchecked, ref);
    expect(checked.parameterIds).toEqual(["p-flore", "p-hist", "p-ecoli", "p-salm"]);
    expect(checked.settings["p-ecoli"].normVersionId).toBe("nv-ecoli-2021");
    // Still the family's: B removes E. coli.
    expect(applyProductType(checked, "type-volaille", ref).parameterIds).toEqual(["p-flore", "p-hist", "p-salm"]);
    // Without a family, nothing to tick or untick.
    expect(checkAllOfType(asked(), ref).parameterIds).toEqual(["p-flore"]);
    expect(uncheckAllOfType(asked(), ref).parameterIds).toEqual(["p-flore"]);
  });

  it("counts the family's ticked germs — those the nature may programme", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    // « Autre » is a criterion of A on a parameter of another category: not counted.
    expect(familyGermIds(typeOf(ref, "type-catalogue"), ref)).toEqual(["p-ecoli", "p-salm"]);
    expect(familyCheckCount(withA, ref)).toEqual({ checked: 2, total: 2 });
    expect(familyCheckLabel(familyCheckCount(withA, ref))).toBe("2 paramètres cochés sur 2");
    const one = toggleParameter(withA, "p-ecoli", ref);
    expect(familyCheckLabel(familyCheckCount(one, ref))).toBe("1 paramètre coché sur 2");
    expect(familyCheckLabel(familyCheckCount(uncheckAllOfType(withA, ref), ref))).toBe("0 paramètre coché sur 2");
    expect(familyCheckCount(asked(), ref)).toEqual({ checked: 0, total: 0 });
  });

  it("lists the family as « Paramètres à rechercher »: germ · norm · the criterion's unit (Q40) · n / c / m / M", () => {
    const rows = familyParameterRows(applyProductType(asked(), "type-volaille", ref), ref);
    // Salmonelles is « /25 g » as a parameter; this family reads it in 1 g.
    expect(rows).toEqual([
      expect.objectContaining({ parameterId: "p-salm", name: "Salmonelles", normLabel: "ISO 6579-1:2021", unit: "/1g", checked: true, available: true }),
    ]);
    expect(rows[0].criterion).toMatchObject({ n: 1, mKind: "ABSENCE" });
    const catalogue = familyParameterRows(applyProductType(asked(), "type-catalogue", ref), ref);
    expect(catalogue.map((row) => [row.parameterId, row.unit, row.normLabel, row.available])).toEqual([
      // Another category's germ: shown, not tickable; no unit known.
      ["p-autre", null, null, false],
      ["p-ecoli", "ufc/g", "ISO 16649-2:2021", true],
      // No version on the criterion: the parameter's version in force.
      ["p-salm", "/25 g", "ISO 6579-1:2021", true],
    ]);
    expect(familyParameterRows(asked(), ref)).toEqual([]);
  });

  it("reads an analysis in the criterion's unit when the family gives one, else in the parameter's", () => {
    expect(criterionUnit({ unit: "/1g" }, { unit: "/25 g" })).toBe("/1g");
    expect(criterionUnit({ unit: " " }, { unit: "/25 g" })).toBe("/25 g");
    expect(criterionUnit({ unit: null }, { unit: null })).toBeNull();
    expect(criterionUnit(undefined, { unit: "UFC/g" })).toBe("UFC/g");
  });

  it("« Autres analyses » leaves out the family's germs", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    const others = otherParameterGroups(groupParameters(ref, "MICRO"), withA, ref);
    expect(others.map((g) => [g.family, g.parameters.map((p) => p.id)])).toEqual([
      ["MICRO", ["p-flore"]],
      ["CHIMIE", ["p-hist"]],
    ]);
    // No family: every analysis.
    expect(otherParameterGroups(groupParameters(ref, "MICRO"), asked(), ref)).toEqual(groupParameters(ref, "MICRO"));
  });

  it("says which analyses left with the previous family, and the n it changed", () => {
    const withA = applyProductType(asked(), "type-catalogue", ref);
    const withB = applyProductType(withA, "type-volaille", ref);
    expect(familyChangeNotice(withA, withB, ref)).toBe(
      "Famille « Volaille crue » choisie ; l'analyse « E. coli », venue de la famille précédente, a été retirée ; n : 5 → 1. Enregistrez le programme pour l'appliquer."
    );
    expect(familyChangeTookAway(withA, withB)).toBe(true);
    expect(familyChangeNotice(withA, applyProductType(withA, "", ref), ref)).toBe(
      "Aucune famille : lecture en valeur simple ; 2 analyses venues de la famille précédente ont été retirées (« E. coli », « Salmonelles »). Enregistrez le programme pour l'appliquer."
    );
    expect(familyChangeNotice({ ...asked(), unitCount: 5 }, withA, ref)).toBe("Famille « Plat cuisiné » choisie. Enregistrez le programme pour l'appliquer.");
    expect(familyChangeTookAway({ ...asked(), unitCount: 5 }, withA)).toBe(false);
    // A hand-typed 9 (histamine) recomputed by the client's family: said, never silent.
    const typed = { ...initialDraft(received, ref), unitCount: 9 };
    expect(familyChangeNotice(typed, applyProductType(typed, "type-client", ref), ref)).toMatch(/ ; n : 9 → 3\. Enregistrez le programme pour l'appliquer\.$/);
    expect(familyChangeTookAway(typed, applyProductType(typed, "type-client", ref))).toBe(true);
  });

  it("never sends what the sheet remembers", () => {
    const body = toRequestBody(applyProfile(asked(), referential.profiles[0], ref), false);
    expect(body).not.toHaveProperty("manualIds");
    expect(body).not.toHaveProperty("profileUnitCount");
  });
});

describe("« Choisir une famille de produits » (16/10, Q124 — RETOUR-LABO-16-10.md F5)", () => {
  const family = (id: string, name: string, natureId: string | null, clientId: string | null = null) => ({ id, name, natureId, clientId });
  const families = [
    family("f-surface", "Hygiène de surfaces", "nat-surf"),
    family("f-plat", "Plats cuisinés", "nat"),
    family("f-precis", "Produit alimentaire", null),
    family("f-client", "Salade composée", "nat", "client-a"),
    family("f-epices", "Épices", "nat-pc"),
    family("f-glace", "Crème glacée", "nat"),
  ];
  const withSurfaces = {
    ...referential,
    familyNatures: [...referential.familyNatures, { id: "nat-surf", label: "Microbiologie des surfaces", category: "AMBIANCE" as const }],
  };
  const ids = (list: { id: string }[]) => list.map((item) => item.id);

  it("opens on the sample's nature: a food one also lists the families « à préciser », the client's first", () => {
    const preset = familyFilterFor("nat", withSurfaces);
    expect(preset).toEqual({ natureId: "nat", includeUnclassified: true, query: "" });
    expect(ids(filterFamilies(families, preset))).toEqual(["f-client", "f-glace", "f-plat", "f-precis"]);
  });

  it("another category's nature lists its own families only", () => {
    const preset = familyFilterFor("nat-surf", withSurfaces);
    expect(preset.includeUnclassified).toBe(false);
    expect(ids(filterFamilies(families, preset))).toEqual(["f-surface"]);
    // The nature on screen, even absent from the list, is read from the referential.
    expect(familyFilterFor("nat", { ...withSurfaces, familyNatures: [] }).includeUnclassified).toBe(true);
    expect(familyFilterFor("nat-inconnue", withSurfaces).includeUnclassified).toBe(false);
  });

  it("« Tous » lists every family, the client's first, then by name", () => {
    expect(ids(filterFamilies(families, familyFilterFor(null, withSurfaces)))).toEqual([
      "f-client",
      "f-glace",
      "f-epices",
      "f-surface",
      "f-plat",
      "f-precis",
    ]);
  });

  it("searches the name without minding accents or case", () => {
    expect(ids(filterFamilies(families, familyFilterFor(null, withSurfaces, "creme")))).toEqual(["f-glace"]);
    expect(ids(filterFamilies(families, familyFilterFor(null, withSurfaces, "EPICES")))).toEqual(["f-epices"]);
    expect(ids(filterFamilies(families, familyFilterFor("nat", withSurfaces, "plats cuisines")))).toEqual(["f-plat"]);
    // The type d'analyse still applies to the search.
    expect(ids(filterFamilies(families, familyFilterFor("nat", withSurfaces, "surfaces")))).toEqual([]);
  });

  it("reads the referential's families as they come from the server", () => {
    const listed = filterFamilies(referential.productTypes, familyFilterFor("nat", referential));
    // « Plat cuisiné » is « à préciser » (no type d'analyse yet); « Poisson (histamine) » is of the physico-chimie.
    expect(ids(listed)).toEqual(["type-client", "type-catalogue"]);
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

describe("parameter families", () => {
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
        { id: "t-mix", name: "Mixte", family: "CHIMIE", natureId: null, clientId: null, criteriaCount: 1, criteria: [{ parameterId: "p-ecoli", parameterName: "E. coli", n: 5, c: null, mKind: "VALUE", m: 1, bigM: null, unit: null, normVersionId: null, normVersion: null }] },
      ],
    };
    expect(parameterFamilies(ambiguous, "CHIMIE").get("p-ecoli")).toBe("CHIMIE");
  });
});

describe("benchHolder (13/10: « prise en charge libre »)", () => {
  type HolderSample = Parameters<typeof benchHolder>[0];
  const free: HolderSample = {
    technicianId: null,
    technician: null,
    assignedAt: null,
    parameters: [
      { technicianId: null, technician: null },
      { technicianId: null, technician: null },
    ],
  };

  it("names nobody on a free line: once confirmed it waits in « À prendre »", () => {
    expect(benchHolder(free)).toBeNull();
    expect(benchHolder({ ...free, parameters: [] })).toBeNull();
  });

  it("names the technician who took it, and when", () => {
    expect(
      benchHolder({ ...free, technicianId: "tech1", technician: { id: "tech1", name: "Yassine" }, assignedAt: "2026-10-13T09:30:00.000Z" })
    ).toEqual({ names: "Yassine", several: false, assignedAt: "2026-10-13T09:30:00.000Z" });
    // Assigned before 13/10 without a stamp: still taken by that person.
    expect(benchHolder({ ...free, technicianId: "tech1", technician: { id: "tech1", name: "Yassine" } })).toEqual({
      names: "Yassine",
      several: false,
      assignedAt: null,
    });
  });

  it("counts a line held only through its analyses (before 13/10) as taken, with their names", () => {
    const legacy: HolderSample = {
      ...free,
      parameters: [
        { technicianId: "tech1", technician: { id: "tech1", name: "Yassine" } },
        { technicianId: "tech2", technician: { id: "tech2", name: "Imane" } },
        { technicianId: "tech1", technician: { id: "tech1", name: "Yassine" } },
      ],
    };
    expect(benchHolder(legacy)).toEqual({ names: "Yassine · Imane", several: true, assignedAt: null });
    // The holder first, then the other technicians of the line, each once.
    expect(
      benchHolder({ ...legacy, technicianId: "tech2", technician: { id: "tech2", name: "Imane" }, assignedAt: "2026-10-01T08:00:00.000Z" })
    ).toEqual({ names: "Imane · Yassine", several: true, assignedAt: "2026-10-01T08:00:00.000Z" });
    // One technician on every analysis: one person.
    const one = { technicianId: "tech1", technician: { id: "tech1", name: "Yassine" } };
    expect(benchHolder({ ...free, parameters: [one, one] })).toEqual({ names: "Yassine", several: false, assignedAt: null });
  });

  const yassine = { names: "Yassine", several: false, assignedAt: "2026-10-13T09:30:00.000Z" };
  const editable = { status: "PROGRAMME" as const, analysisBlocked: false, editable: true };

  it("says who took the line and when, and that a change of programme reaches them", () => {
    expect(benchHolderNotice(yassine, editable)).toBe(
      `Pris en charge par Yassine le ${formatDateTime("2026-10-13T09:30:00.000Z")}. Une modification du programme lui sera visible à la paillasse.`
    );
    expect(benchHolderNotice({ names: "Yassine · Imane", several: true, assignedAt: null }, editable)).toBe(
      "Pris en charge par Yassine · Imane. Une modification du programme leur sera visible à la paillasse."
    );
    // A received line taken before 13/10, or a line the bench started: nothing more to say.
    expect(benchHolderNotice(yassine, { status: "RECU", analysisBlocked: false, editable: true })).toBe(
      `Pris en charge par Yassine le ${formatDateTime("2026-10-13T09:30:00.000Z")}.`
    );
    expect(benchHolderNotice(yassine, { status: "EN_ANALYSE", analysisBlocked: false, editable: false })).not.toMatch(/modification/);
  });

  it("says where a free line waits: « À prendre » after the confirmation, or already", () => {
    expect(benchHolderNotice(null, { status: "RECU", analysisBlocked: false, editable: true })).toBe(
      "Aucun technicien n'est attribué : après la confirmation, l'échantillon rejoint la liste « À prendre » de la paillasse ; le premier technicien qui le prend en charge (ou saisit un premier résultat) en devient responsable."
    );
    expect(benchHolderNotice(null, editable)).toBe(
      "Aucun technicien ne l'a encore pris en charge : l'échantillon attend dans la liste « À prendre » de la paillasse ; le premier technicien qui le prend en charge (ou saisit un premier résultat) en devient responsable."
    );
    // Started by an administrator standing in (who never takes): still free, still listed.
    expect(benchHolderNotice(null, { status: "EN_ANALYSE", analysisBlocked: false, editable: false })).toBe(
      benchHolderNotice(null, editable)
    );
    // Held at reception: not in « À prendre » until released.
    expect(benchHolderNotice(null, { status: "PROGRAMME", analysisBlocked: true, editable: false })).toMatch(/qu'une fois libéré/);
    expect(benchHolderNotice(null, { status: "ANNULE", analysisBlocked: false, editable: false })).toBe(
      "Aucun technicien n'a pris cet échantillon en charge à la paillasse."
    );
  });

  it("confirms into « À prendre », or says who already holds the sample", () => {
    expect(confirmationNotice(null)).toBe("Programme confirmé : l'échantillon rejoint la liste « À prendre » de la paillasse.");
    expect(confirmationNotice(yassine)).toBe("Programme confirmé : l'échantillon est déjà pris en charge par Yassine.");
  });
});

describe("entry check and billing", () => {
  /** A paper row by its number; `coded` finds a contrôle complémentaire by its code. */
  const ruleRow = <T extends { n: number; code?: string }>(rows: T[], n: number) => rows.find((r) => r.n === n && !r.code)!;
  const coded = <T extends { code?: string }>(rows: T[], code: string) => rows.find((r) => r.code === code)!;

  it("recomputes the eight rules of the bon with the programmed analyses and units, never refusing", () => {
    const draft = initialDraft(received, referential);
    const rows = entryChecks({ ...sample, receptionExploitable: true }, draft, referential, DEFAULT_THRESHOLDS);
    expect(rows.filter((r) => !r.code).map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 50 g of food for microbiology would be refused at reception: « à vérifier » here.
    expect(ruleRow(rows, 2)).toMatchObject({ status: "A_VERIFIER", reason: "QUANTITE_INSUFFISANTE", rules: ["ALIMENT_MICRO_POIDS"] });
    expect(rows.every((r) => r.status !== "NON_CONFORME" && r.status !== "A_CONFIRMER")).toBe(true);
    expect(ruleRow(rows, 1)).toMatchObject({ status: "CONFORME", detail: "Déclaré exploitable" });
  });

  it("shows rule (1) as the réceptionniste answered it", () => {
    const draft = initialDraft(received, referential);
    expect(ruleRow(entryChecks({ ...sample, receptionExploitable: false }, draft, referential, DEFAULT_THRESHOLDS), 1)).toMatchObject({
      status: "A_VERIFIER",
      detail: "Déclaré non exploitable",
      reason: "NON_EXPLOITABLE",
    });
    // Received before the checklist: no answer, said so.
    for (const old of [sample, { ...sample, receptionExploitable: null }]) {
      expect(ruleRow(entryChecks(old, draft, referential, DEFAULT_THRESHOLDS), 1)).toMatchObject({
        status: "A_VERIFIER",
        detail: "Non renseigné : échantillon réceptionné avant la checklist",
      });
    }
  });

  it("shows the contrôles complémentaires as ticked at reception, informative only", () => {
    const draft = initialDraft(received, referential);
    const answered = entryChecks(
      { ...sample, receptionExploitable: true, receptionIdentificationOk: false },
      draft,
      referential,
      DEFAULT_THRESHOLDS
    );
    // The paper's seven first, then the coded rows.
    expect(answered.slice(0, 7).every((r) => !r.code)).toBe(true);
    // A « Non » at reception is only « à vérifier » here, its motif kept.
    expect(coded(answered, "C5")).toMatchObject({ key: "IDENTIFICATION", status: "A_VERIFIER", reason: "IDENTIFICATION" });
    // No C3 (emballage) since 16/10 (Q70) — not even a « Non renseigné » row on a new sample.
    expect(answered.some((r) => r.code === "C3" || r.key === "EMBALLAGE")).toBe(false);

    // Received before the controls: no answer, said so.
    for (const old of [sample, { ...sample, receptionIdentificationOk: null }]) {
      const rows = entryChecks(old, draft, referential, DEFAULT_THRESHOLDS);
      expect(coded(rows, "C5")).toMatchObject({
        status: "A_VERIFIER",
        detail: "Non renseigné : échantillon réceptionné avant les contrôles complémentaires",
      });
      expect(rows.some((r) => r.code === "C3")).toBe(false);
    }
  });

  it("recomputes C2 with the class chosen at reception, else the kind's default", () => {
    const draft = initialDraft(received, referential);
    expect(coded(entryChecks({ ...sample, receptionTemperature: 12 }, draft, referential, DEFAULT_THRESHOLDS), "C2")).toMatchObject({
      status: "A_VERIFIER",
      reason: "CHAINE_FROID",
    });
    expect(
      coded(
        entryChecks(
          { ...sample, receptionTemperature: 12, storageClass: "AMBIANT", receptionTemperatureSource: "ECHANTILLON" },
          draft,
          referential,
          DEFAULT_THRESHOLDS
        ),
        "C2"
      )
    ).toMatchObject({ status: "SANS_OBJET", detail: "Transporté à température ambiante" });
    expect(
      coded(entryChecks({ ...sample, receptionTemperature: 4, receptionTemperatureSource: "GLACIERE" }, draft, referential, DEFAULT_THRESHOLDS), "C2")
    ).toMatchObject({ status: "CONFORME", detail: "4 °C, réfrigéré entre 0 et 8 °C (glacière)" });
  });

  it("shows C7 against the day the sample was received", () => {
    const draft = initialDraft(received, referential);
    const dated = { ...sample, expiryDate: "2026-10-09T00:00:00.000Z", receivedAt: "2026-10-10T08:00:00.000Z" };
    expect(coded(entryChecks(dated, draft, referential, DEFAULT_THRESHOLDS), "C7")).toMatchObject({
      status: "A_VERIFIER",
      detail: "DLC dépassée le 09/10/2026",
    });
    expect(coded(entryChecks({ ...dated, receivedAt: "2026-10-09T23:30:00.000Z" }, draft, referential, DEFAULT_THRESHOLDS), "C7")).toMatchObject({
      status: "CONFORME",
    });
  });

  it("recomputes C1 from the série's times, informative only", () => {
    const draft = initialDraft(received, referential);
    const timed = {
      ...sample,
      receptionExploitable: true,
      receivedAt: "2026-10-11T12:00:00.000Z",
      serie: { startedAt: "2026-10-10T08:00:00.000Z", endedAt: "2026-10-10T09:00:00.000Z", arrivedAt: null, samplingTimeDeclared: null },
    };
    // 27 h with no arrival recorded: up to the reception — « à vérifier »,
    // even where the laboratory makes the delay blocking.
    for (const thresholds of [DEFAULT_THRESHOLDS, { ...DEFAULT_THRESHOLDS, delayBlocking: true }]) {
      expect(coded(entryChecks(timed, draft, referential, thresholds), "C1")).toMatchObject({
        status: "A_VERIFIER",
        reason: "DELAI",
        detail: "Délai 27 h > 24 h",
      });
    }
    // A payload without the série's times: nothing to compute.
    expect(coded(entryChecks(sample, draft, referential, DEFAULT_THRESHOLDS), "C1")).toMatchObject({ status: "SANS_OBJET" });
  });

  it("checks histamine (physico-chimie) on the « P » sample, beside the 300 g, with the programmed units", () => {
    // The fixture files histamine under CHIMIE, as the lab does: the rule
    // follows the analysis, whatever the sample's family.
    const chimieSample = { ...sample, nature: { ...referential.natures[3], legacyType: "ALIMENTAIRE" as const }, quantity: 900, receptionExploitable: true };
    const draft = { ...initialDraft(received, referential), parameterIds: [] };
    const histamine = toggleParameter(draft, "p-hist", referential);
    const one = entryChecks(chimieSample, histamine, referential, DEFAULT_THRESHOLDS);
    expect(ruleRow(one, 3)).toMatchObject({ status: "CONFORME", rules: ["ALIMENT_CHIMIE_POIDS"] });
    // One unit out of 9: analysed as asked, reported without interpretation —
    // not a doubt to justify (laboratory, 13/10 — Q62).
    expect(ruleRow(one, 7)).toMatchObject({ status: "CONFORME", rules: ["HISTAMINE_UNITES", "HISTAMINE_POIDS"] });
    expect(ruleRow(one, 7).detail).toContain("résultats sans interprétation sur le rapport");
    expect(ruleRow(entryChecks(chimieSample, { ...histamine, unitCount: 9 }, referential, DEFAULT_THRESHOLDS), 7)).toMatchObject({
      status: "CONFORME",
    });
    // Nothing programmed yet: rule (7) says when it applies.
    expect(ruleRow(entryChecks(chimieSample, draft, referential, DEFAULT_THRESHOLDS), 7)).toMatchObject({
      status: "SANS_OBJET",
      detail: "Si l'histamine est demandée : 9 × 100 g — vérifié au programme",
    });
  });

  it("rule (8): recognises live bivalve molluscs on the désignation, the programmed type or the programmed nature (12/10)", () => {
    const draft = initialDraft(received, referential);
    // 50 g of oysters: the minimum met, the individuals to check.
    expect(ruleRow(entryChecks({ ...sample, produit: "Huîtres creuses" }, draft, referential, DEFAULT_THRESHOLDS), 8)).toMatchObject({
      status: "CONFORME",
      detail: "Poids 50 g ≥ 50 g · au moins 10 individus : à vérifier",
      rules: ["MOLLUSQUES_POIDS"],
    });
    // Never refusing: 20 g would be refused at reception, « à vérifier » here.
    expect(ruleRow(entryChecks({ ...sample, produit: "Moules", quantity: 20 }, draft, referential, DEFAULT_THRESHOLDS), 8)).toMatchObject({
      status: "A_VERIFIER",
      reason: "QUANTITE_INSUFFISANTE",
    });
    // A plain product: « sans objet ».
    expect(ruleRow(entryChecks({ ...sample, produit: "Salade test" }, draft, referential, DEFAULT_THRESHOLDS), 8).status).toBe("SANS_OBJET");
    // The type and the nature chosen on the sheet count too.
    const typed: ProgrammeReferentialData = {
      ...referential,
      productTypes: [...referential.productTypes, { id: "type-bivalves", name: "Mollusques bivalves vivants", family: "MICRO", natureId: null, clientId: null, criteriaCount: 0, criteria: [] }],
      natures: referential.natures.map((n) => (n.id === "nat-fine" ? { ...n, label: "Coquillages — palourdes" } : n)),
    };
    expect(
      ruleRow(entryChecks({ ...sample, produit: "Produit test" }, { ...draft, productTypeId: "type-bivalves" }, typed, DEFAULT_THRESHOLDS), 8).status
    ).toBe("CONFORME");
    expect(ruleRow(entryChecks({ ...sample, produit: "Produit test" }, { ...draft, natureId: "nat-fine" }, typed, DEFAULT_THRESHOLDS), 8).status).toBe(
      "CONFORME"
    );
  });

  it("rule (6): a food received « Ambiant » is a stable food, its temperature « sans objet » (12/10)", () => {
    const draft = initialDraft(received, referential);
    const stable = entryChecks({ ...sample, receptionTemperature: null, storageClass: "AMBIANT" }, draft, referential, DEFAULT_THRESHOLDS);
    expect(ruleRow(stable, 6)).toMatchObject({ status: "SANS_OBJET", detail: "Sans objet : aliment stable (conservé à température ambiante)" });
    // Chilled by default: the missing temperature shows, « à vérifier » here.
    expect(ruleRow(entryChecks({ ...sample, receptionTemperature: null }, draft, referential, DEFAULT_THRESHOLDS), 6)).toMatchObject({
      status: "A_VERIFIER",
      reason: "TEMPERATURE_MANQUANTE",
    });
  });

  it("recognises histamine under an alias of the programmed analysis", () => {
    const withAlias: ProgrammeReferentialData = {
      ...referential,
      parameters: [
        ...referential.parameters,
        { id: "p-amine", name: "Amine biogène test", aliases: "Histamine HPLC", unit: "mg/kg", threshold: null, calcFactor: 1, family: "CHIMIE", category: "ALIMENTAIRE" },
      ],
    };
    const draft = { ...initialDraft(received, withAlias), parameterIds: ["p-amine"], unitCount: 9 };
    expect(ruleRow(entryChecks({ ...sample, quantity: 900 }, draft, withAlias, DEFAULT_THRESHOLDS), 7)).toMatchObject({
      status: "CONFORME",
      rules: ["HISTAMINE_UNITES", "HISTAMINE_POIDS"],
    });
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
    expect(natureChoices(referential, "MICRO", null).map((n) => n.id)).toEqual(["nat", "nat-fine"]);
    expect(natureChoices(referential, "MICRO", "M").map((n) => n.id)).toEqual(["nat", "nat-fine"]);
    // The line's own nature stays offered even once archived.
    const archived = { ...referential, natures: referential.natures.map((n) => (n.id === "nat" ? { ...n, active: false } : n)) };
    expect(natureChoices(archived, "MICRO", null).map((n) => n.id)).toEqual(["nat", "nat-fine"]);
  });

  describe("« Autres analyses » (16/10, Q129)", () => {
    /** The referential of a food line, with the sensory nature of « Autres analyses » beside its own. */
    const withSensory: ProgrammeReferentialData = {
      ...referential,
      natures: [
        ...referential.natures,
        { id: "nat-sens", code: "ANALYSE_SENSORIELLE", label: "Analyse sensorielle", family: "AUTRE", legacyType: "ALIMENTAIRE", active: true, current: false },
      ],
    };
    /** The same line once its programme moved it to the sensory nature. */
    const onSensory: ProgrammeReferentialData = {
      ...withSensory,
      natureId: "nat-sens",
      natures: withSensory.natures.map((n) => ({ ...n, current: n.id === "nat-sens" })),
    };

    it("keeps n = 1 into « Analyse sensorielle » and detaches the micro family (F9); back, nothing is reset", () => {
      const micro = { ...initialDraft(received, withSensory), unitCount: 5, productTypeId: "type-catalogue" };
      const { draft, reset } = adoptReferential(micro, withSensory, onSensory);
      expect(draft).toMatchObject({ natureId: "nat-sens", unitCount: 1, productTypeId: "" });
      expect(reset).toEqual({ unitCount: 5, productType: withSensory.productTypes.find((t) => t.id === "type-catalogue")!.name });
      expect(natureChangeNotice("Analyse sensorielle", [], false, reset)).toBe(
        `Nature « Analyse sensorielle » choisie ; n ramené à 1 (au lieu de 5), famille « ${reset!.productType} » retirée : une autre analyse se lit sur une seule unité. Enregistrez le programme pour l'appliquer.`
      );
      // Already n = 1 without a family: nothing to say.
      expect(adoptReferential({ ...micro, unitCount: 1, productTypeId: "" }, withSensory, onSensory).reset).toBeNull();
      // Back to the food domain: n and the family are the programmer's again.
      const back = adoptReferential({ ...draft, unitCount: 3 }, onSensory, { ...withSensory, natures: onSensory.natures });
      expect(back.reset).toBeNull();
      expect(back.draft.unitCount).toBe(3);
    });

    it("offers the sensory analysis beside the line's own family, never the other family", () => {
      expect(natureChoices(withSensory, "MICRO", "M").map((n) => n.id)).toEqual(["nat", "nat-fine", "nat-sens"]);
      expect(natureChoices(withSensory, "MICRO", null).map((n) => n.id)).toEqual(["nat", "nat-fine", "nat-sens"]);
      expect(natureChoices(withSensory, "CHIMIE", "P").map((n) => n.id)).toEqual(["nat", "nat-pc", "nat-sens"]);
    });

    it("from the sensory analysis, offers the way back to the family of the code's letter", () => {
      expect(natureChoices(onSensory, "AUTRE", "M").map((n) => n.id)).toEqual(["nat", "nat-fine", "nat-sens"]);
      expect(natureChoices(onSensory, "AUTRE", "P").map((n) => n.id)).toEqual(["nat-pc", "nat-sens"]);
      // A single sample has no twin: either family.
      expect(natureChoices(onSensory, "AUTRE", null).map((n) => n.id)).toEqual(["nat", "nat-fine", "nat-pc", "nat-sens"]);
    });

    it("keeps an archived sensory nature only while it is the line's own", () => {
      const archived = (r: ProgrammeReferentialData) => ({
        ...r,
        natures: r.natures.map((n) => (n.id === "nat-sens" ? { ...n, active: false } : n)),
      });
      expect(natureChoices(archived(withSensory), "MICRO", "M").map((n) => n.id)).toEqual(["nat", "nat-fine"]);
      expect(natureChoices(archived(onSensory), "AUTRE", "M").map((n) => n.id)).toEqual(["nat", "nat-fine", "nat-sens"]);
    });

    it("says where the other natures come from", () => {
      const tail = " Changer de nature recharge les analyses, les profils et les prix ; la nature change à l'enregistrement du programme.";
      expect(natureHint("MICRO", "M", 3)).toBe(
        "Dans le même domaine (analyses microbiologiques) ou parmi les autres analyses : l'autre domaine fait l'objet d'un autre échantillon." + tail
      );
      expect(natureHint("AUTRE", "P", 2)).toBe(
        "Parmi les autres analyses, ou dans le domaine de l'échantillon (analyses physico-chimiques) : l'autre domaine fait l'objet d'un autre échantillon." +
          tail
      );
      expect(natureHint("AUTRE", null, 4)).toBe(
        "Parmi les autres analyses, ou dans l'un des deux domaines (analyses microbiologiques ou analyses physico-chimiques)." + tail
      );
      // A single sample moved from microbiology: back there only.
      expect(natureHint("AUTRE", null, 3, "MICRO")).toBe(
        "Parmi les autres analyses, ou dans le domaine de l'échantillon (analyses microbiologiques) : l'autre domaine fait l'objet d'un autre échantillon." +
          tail
      );
    });

    it("says when there is nothing else to choose", () => {
      expect(natureHint("CHIMIE", null, 1)).toBe(
        "Aucune autre nature active dans le même domaine (analyses physico-chimiques) ni parmi les autres analyses."
      );
      expect(natureHint("AUTRE", "M", 1)).toBe(
        "Aucune autre nature active parmi les autres analyses ni dans le domaine de l'échantillon (analyses microbiologiques)."
      );
      // With no letter, « Autres analyses » goes back to either domain.
      expect(natureHint("AUTRE", null, 1)).toBe(
        "Aucune autre nature active parmi les autres analyses ni dans les domaines (analyses microbiologiques ou analyses physico-chimiques)."
      );
    });
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
      { dilutionFactor: " 10,5 ", note: "" }
    );
    expect(toRequestBody(draft, true)).toEqual({
      confirm: true,
      natureId: "nat",
      productTypeId: "type-catalogue",
      parameterIds: ["p-ecoli", "p-salm"],
      unitCount: 5,
      testPortion: "25 g",
      priority: "URGENTE",
      dueAt: "2026-10-08T12:00:00.000Z",
      programmeNote: null,
      parameters: [
        { parameterId: "p-ecoli", normVersionId: "nv-ecoli-2021", dilutionFactor: "10,5", note: null },
        { parameterId: "p-salm", normVersionId: "nv-salm-2021", dilutionFactor: null, note: null },
      ],
    });
  });

  it("never carries a technician, at the top or per analysis (13/10: the bench takes the line)", () => {
    const draft = applyProfile(initialDraft(received, referential), referential.profiles[0], referential);
    for (const confirm of [true, false]) {
      const body = toRequestBody(draft, confirm);
      expect(body).not.toHaveProperty("technicianId");
      expect(body.parameters).toHaveLength(2);
      for (const parameter of body.parameters) expect(parameter).not.toHaveProperty("technicianId");
    }
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
    const body = toRequestBody({ ...initialDraft(received, referential), parameterIds: [], dueAt: "" }, false);
    expect(body).toMatchObject({ confirm: false, parameterIds: [], dueAt: null, productTypeId: null, parameters: [] });
  });
});

describe("programmeReadOnlyReason — why the sheet is closed, and who to ask (16/10, Q128)", () => {
  const closed = { editable: false, analysisBlocked: false, cancelReason: null } as const;

  it("says nothing while the sheet may be edited", () => {
    expect(programmeReadOnlyReason({ ...closed, editable: true, status: "RECU" }, "PROGRAMMATEUR")).toBeNull();
    expect(programmeReadOnlyReason({ ...closed, editable: true, status: "PROGRAMME" }, "ADMIN")).toBeNull();
  });

  it("at the bench, points the responsable des paramètres to « Corriger les analyses », and the admin to « Corriger la fiche »", () => {
    for (const status of ["EN_ANALYSE", "RESULTATS_SAISIS"] as const) {
      expect(programmeReadOnlyReason({ ...closed, status }, "PROGRAMMATEUR"), status).toBe(
        "Fiche en lecture seule : la paillasse a commencé. Les analyses, la famille de produits et le nombre d'unités se changent désormais par « Corriger les analyses » ci-dessous, avec un motif ; l'identification de l'échantillon, par la réception, la validation ou l'administrateur."
      );
      expect(programmeReadOnlyReason({ ...closed, status }, "ADMIN"), status).toContain("par « Corriger la fiche » ci-dessous");
    }
  });

  it("keeps the reasons of a sample not received, cancelled, blocked — and says an approved one goes through the amendment", () => {
    expect(programmeReadOnlyReason({ ...closed, status: "PRELEVE" }, "PROGRAMMATEUR")).toBe(
      "Cet échantillon n'est pas encore réceptionné : le programme se décide après la réception."
    );
    expect(programmeReadOnlyReason({ ...closed, status: "ANNULE", cancelReason: "DOUBLON" }, "PROGRAMMATEUR")).toMatch(
      /^Échantillon annulé \(.+\) : seul un administrateur peut le réactiver\.$/
    );
    expect(programmeReadOnlyReason({ ...closed, status: "RECU", analysisBlocked: true }, "PROGRAMMATEUR")).toContain("bloqué en réception");
    for (const status of ["VALIDE", "RAPPORT_ENVOYE"] as const) {
      expect(programmeReadOnlyReason({ ...closed, status }, "PROGRAMMATEUR"), status).toContain("réouverture du rapport pour amendement");
    }
  });
});

describe("programmeVerbsNote — what is not this person's among the corrections (16/10, Q128)", () => {
  it("the responsable des paramètres: the analyses on the sheet before the bench, by « Corriger les analyses » after; never the identification", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME"] as const) {
      expect(programmeVerbsNote("PROGRAMMATEUR", status), status).toMatch(/^Les analyses se changent sur cette fiche/);
    }
    for (const status of ["EN_ANALYSE", "RESULTATS_SAISIS"] as const) {
      expect(programmeVerbsNote("PROGRAMMATEUR", status), status).toBe(
        "Les analyses se changent par « Corriger les analyses » ; l'identification de l'échantillon (désignation, quantité, lot…) relève de la réception, de la validation ou de l'administrateur ; son annulation, de la validation, de la Direction ou de l'administrateur."
      );
    }
  });

  it("names who cancels at this step, as the state machine says (16/10, Q13): the réception before the programme, the validation desks from it", () => {
    for (const status of ["PRELEVE", "RECU"] as const) {
      expect(programmeVerbsNote("PROGRAMMATEUR", status), status).toBe(
        "Les analyses se changent sur cette fiche tant que la paillasse n'a pas commencé ; l'identification de l'échantillon (désignation, quantité, lot…) relève de la réception, de la validation ou de l'administrateur ; son annulation, de la réception ou de l'administrateur."
      );
    }
    expect(programmeVerbsNote("PROGRAMMATEUR", "PROGRAMME")).toMatch(/son annulation, de la validation, de la Direction ou de l'administrateur\.$/);
  });

  it("nothing to add for the administrator, nor once the sample is approved, sent or cancelled", () => {
    expect(programmeVerbsNote("ADMIN", "EN_ANALYSE")).toBeNull();
    for (const status of ["VALIDE", "RAPPORT_ENVOYE", "ANNULE"] as const) {
      expect(programmeVerbsNote("PROGRAMMATEUR", status), status).toBeNull();
    }
  });
});

describe("programmeVerbsLead — the sentence before the verbs names only what they do", () => {
  it("the responsable des paramètres at the bench corrects, never cancels", () => {
    for (const status of ["EN_ANALYSE", "RESULTATS_SAISIS"] as const) {
      expect(programmeVerbsLead(verbsFor({ status }, "PROGRAMMATEUR")), status).toBe("Une correction passe par le verbe ci-dessous.");
    }
  });

  it("the administrator corrects and cancels; a cancelled sample is reactivated", () => {
    expect(programmeVerbsLead(verbsFor({ status: "EN_ANALYSE" }, "ADMIN"))).toBe("Une correction ou une annulation passe par les verbes ci-dessous.");
    expect(programmeVerbsLead(verbsFor({ status: "ANNULE" }, "ADMIN"))).toBe("Une réactivation passe par le verbe ci-dessous.");
    expect(programmeVerbsLead({ correct: false, correctAnalyses: false, cancel: true, reactivate: false })).toBe("Une annulation passe par le verbe ci-dessous.");
    expect(programmeVerbsLead(verbsFor({ status: "VALIDE" }, "PROGRAMMATEUR"))).toBe("");
  });
});
