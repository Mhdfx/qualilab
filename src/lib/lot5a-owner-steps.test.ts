import { describe, expect, it } from "vitest";
import { validateAchatSettings } from "./achat-validation";
import { validateCriteriaGrid } from "./criteria-input";
import { validateParameter } from "./parameter-validation";
import {
  S13_TARGET,
  S14_ALIASES,
  S15_N,
  achatSettingsView,
  isSensoryNature,
  s13Plan,
  s14AliasPlan,
  s15Family,
  s15GridPlan,
  type CriterionView,
} from "./lot5a-owner-steps";

/** The owner's steps S13–S15 of lot 5A (RETOUR-LABO-20-11.md §5), as planned before the script writes them. */

describe("S13 — the retenue à la source (C-3 of 20/11)", () => {
  const read = {
    expiryWarningDays: 30,
    defaultVatRate: 20,
    withholding: { scope: "AUCUN" as const, base: "TVA" as const, rateWithCertificate: null, rateWithoutCertificate: null, certificateValidityMonths: 3 },
  };

  it("sets base TVA, 75 % / 100 %, scope « fournisseurs soumis »; keeps the attestation's 3 months (D-3) and the rest", () => {
    const { body, changes } = s13Plan(achatSettingsView(read));
    expect(body).toEqual({
      expiryWarningDays: 30,
      defaultVatRate: 20,
      withholdingScope: "FOURNISSEURS_SOUMIS",
      withholdingBase: "TVA",
      withholdingRateWithCertificate: 75,
      withholdingRateWithoutCertificate: 100,
      taxCertificateValidityMonths: 3,
    });
    expect(changes.map((change) => change.field)).toEqual([
      "withholdingScope",
      "withholdingRateWithCertificate",
      "withholdingRateWithoutCertificate",
    ]);
    // What the route itself accepts: 100 % of the VAT is allowed (only 100 % of the TTC is refused).
    expect(validateAchatSettings(body as unknown as Record<string, unknown>)).toMatchObject({ ok: true });
  });

  it("is idempotent: once set, nothing changes", () => {
    const done = { ...read, withholding: { ...read.withholding, scope: "FOURNISSEURS_SOUMIS" as const, rateWithCertificate: 75, rateWithoutCertificate: 100 } };
    expect(s13Plan(achatSettingsView(done)).changes).toEqual([]);
    expect(S13_TARGET.withholdingBase).toBe("TVA");
  });
});

describe("S14 — the water's aliases (C-8 (d) of 20/11)", () => {
  const catalogue = [
    { id: "a-ecoli", name: "E. coli", category: "ALIMENTAIRE", aliases: "Escherichia coli" },
    { id: "e-ecoli", name: "E. coli", category: "EAU", aliases: null },
    { id: "e-colit", name: "Coliformes totaux", category: "EAU", aliases: "Coliformes" },
  ];

  it("names the two equivalences the laboratory confirmed", () => {
    expect(S14_ALIASES).toEqual([
      { category: "EAU", name: "E. coli", alias: "Escherichia coli" },
      { category: "EAU", name: "Coliformes totaux", alias: "Coliformes à 36 °C" },
    ]);
  });

  it("adds each alias to the water's parameter only, the aliases kept before it", () => {
    const plan = s14AliasPlan(catalogue);
    expect(plan).toEqual([
      { kind: "add", id: "e-ecoli", name: "E. coli", category: "EAU", alias: "Escherichia coli", aliases: "Escherichia coli" },
      { kind: "add", id: "e-colit", name: "Coliformes totaux", category: "EAU", alias: "Coliformes à 36 °C", aliases: "Coliformes\nColiformes à 36 °C" },
    ]);
    // What the parameter route itself accepts.
    for (const step of plan) {
      if (step.kind !== "add") continue;
      expect(validateParameter({ name: step.name, category: step.category, family: "MICRO", unit: "UFC/100 mL", aliases: step.aliases })).toMatchObject({ ok: true });
    }
  });

  it("is idempotent, whatever the spelling of the alias already there", () => {
    const done = catalogue.map((p) =>
      p.id === "e-ecoli" ? { ...p, aliases: "escherichia  coli" } : p.id === "e-colit" ? { ...p, aliases: "Coliformes\nColiformes a 36 °C" } : p
    );
    expect(s14AliasPlan(done).map((step) => step.kind)).toEqual(["present", "present"]);
  });

  it("writes nothing when the parameter is missing or not alone", () => {
    expect(s14AliasPlan([])).toMatchObject([{ kind: "missing", found: 0 }, { kind: "missing", found: 0 }]);
    const twice = [...catalogue, { id: "e-ecoli-2", name: "E. Coli", category: "EAU", aliases: null }];
    expect(s14AliasPlan(twice)[0]).toMatchObject({ kind: "missing", found: 2 });
  });
});

describe("S15 — the sensory analysis reads one unit (Q133 of 20/11)", () => {
  const row = (over: Partial<CriterionView>): CriterionView => ({
    id: "c",
    parameterId: "p",
    normVersionId: null,
    unit: "-",
    n: 5,
    c: null,
    mKind: "UNSPECIFIED",
    m: null,
    bigM: null,
    active: true,
    parameter: { name: "Texture" },
    ...over,
  });
  const grid = [
    row({ id: "odeur", parameterId: "p-odeur", n: 1, parameter: { name: "Détermination de l'odeur" } }),
    row({ id: "texture", parameterId: "p-texture" }),
    row({ id: "corps", parameterId: "p-corps", c: 1, parameter: { name: "Corps étranger" } }),
    row({ id: "ancien", parameterId: "p-ancien", active: false, parameter: { name: "Ancien critère" } }),
  ];

  it("sets n = 1 on every active criterion, sends every row back (none deleted), leaves the inactive ones", () => {
    expect(S15_N).toBe(1);
    const { rows, changed } = s15GridPlan(grid);
    expect(rows.map((r) => [r.id, r.n])).toEqual([
      ["odeur", 1],
      ["texture", 1],
      ["corps", 1],
      ["ancien", 5],
    ]);
    expect(changed).toEqual([
      { id: "texture", name: "Texture", before: 5 },
      { id: "corps", name: "Corps étranger", before: 5 },
    ]);
    // A c without a limit means nothing: cleared, as the grid's own save tidies it.
    expect(rows.find((r) => r.id === "corps")?.c).toBeNull();
    // What the criteria route itself accepts.
    expect(validateCriteriaGrid(rows)).toMatchObject({ ok: true });
    expect(rows.every((r) => !("parameter" in r))).toBe(true);
  });

  it("is idempotent", () => {
    const { rows } = s15GridPlan(grid);
    expect(s15GridPlan(rows.map((r) => ({ ...r, parameter: null }))).changed).toEqual([]);
  });

  it("finds the one family « PRODUIT ALIMENTAIRE » under « Analyse sensorielle », never another", () => {
    expect(isSensoryNature("Analyse sensorielle")).toBe(true);
    expect(isSensoryNature("ANALYSE SENSORIELLE")).toBe(true);
    expect(isSensoryNature("Microbiologie des aliments")).toBe(false);
    const families = [
      { id: "f1", name: "PRODUIT ALIMENTAIRE", natureId: "n-sens" },
      { id: "f2", name: "PRODUIT ALIMENTAIRE", natureId: "n-micro" },
      { id: "f3", name: "ANALYSE SENSORIELLE EAU", natureId: "n-sens" },
    ];
    expect(s15Family(families, new Set(["n-sens"]))?.id).toBe("f1");
    expect(s15Family(families, new Set(["n-none"]))).toBeNull();
    expect(s15Family([...families, { id: "f4", name: "Produit alimentaire", natureId: "n-sens" }], new Set(["n-sens"]))).toBeNull();
  });
});
