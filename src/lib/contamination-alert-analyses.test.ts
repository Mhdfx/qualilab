import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALERT_CATEGORIES,
  alertGermOf,
  citedEnumeration,
  contaminationAlertPlan,
  isDetection,
  type AlertParameter,
} from "./contamination-alert-analyses";

/**
 * S3 / #35 — the analyses that raise the contamination alert, the
 * laboratory's answer of 28/10 to the re-ask 2.21: Salmonella, Listeria and
 * E. coli, in food, water and surfaces; neither enterococci nor Pseudomonas.
 * Invented catalogue rows only.
 */

const p = (name: string, over: Partial<AlertParameter> = {}): AlertParameter => ({
  id: name,
  name,
  aliases: null,
  family: "MICRO",
  category: "ALIMENTAIRE",
  alertOnExceed: false,
  ...over,
});

describe("alertGermOf — the germs of the answer", () => {
  it("recognises the spellings of the catalogue and of the old software", () => {
    for (const name of ["Salmonella", "Salmonella spp.", "Recherche de Salmonelles", "salmonella (dans 25 g)"]) {
      expect(alertGermOf(p(name)), name).toBe("SALMONELLA");
    }
    for (const name of ["Listeria monocytogenes", "L. monocytogenes", "Listeria spp", "Dénombrement de Listéria"]) {
      expect(alertGermOf(p(name)), name).toBe("LISTERIA");
    }
    for (const name of ["E. coli", "E.coli", "Escherichia coli", "E. coli β-glucuronidase positive", "Escherichia Coli O157"]) {
      expect(alertGermOf(p(name)), name).toBe("E_COLI");
    }
  });

  it("never the neighbours: coliforms, enterococci, Pseudomonas, enterobacteria", () => {
    for (const name of ["Coliformes totaux", "Coliformes fécaux", "Entérocoques intestinaux", "Pseudomonas aeruginosa", "Entérobactéries", "Staphylococcus aureus"]) {
      expect(alertGermOf(p(name)), name).toBeNull();
    }
  });

  it("food, water and surfaces (the air shares the surfaces' category); microbiology only", () => {
    expect([...ALERT_CATEGORIES]).toEqual(["ALIMENTAIRE", "EAU", "AMBIANCE"]);
    for (const category of ALERT_CATEGORIES) expect(alertGermOf(p("Salmonella", { category })), category).toBe("SALMONELLA");
    expect(alertGermOf(p("E. coli", { family: "CHIMIE" }))).toBeNull();
    expect(alertGermOf(p("E. coli", { family: "AUTRE" }))).toBeNull();
  });

  it("reads the aliases, one per line", () => {
    expect(alertGermOf(p("Germe pathogène A", { aliases: "Ancien nom\nSalmonelle" }))).toBe("SALMONELLA");
    expect(alertGermOf(p("Germe pathogène B", { aliases: "Ancien nom\r\nE.Coli" }))).toBe("E_COLI");
    expect(alertGermOf(p("Germe pathogène C", { aliases: "" }))).toBeNull();
  });

  it("« Listeria » is every Listeria by default (R-14); narrowed to L. monocytogenes on request", () => {
    expect(alertGermOf(p("Listeria spp"))).toBe("LISTERIA");
    expect(alertGermOf(p("Listeria spp"), "MONOCYTOGENES")).toBeNull();
    expect(alertGermOf(p("Listeria monocytogenes"), "MONOCYTOGENES")).toBe("LISTERIA");
    expect(alertGermOf(p("L. monocytogenes"), "MONOCYTOGENES")).toBe("LISTERIA");
    // The other germs are not affected by the scope.
    expect(alertGermOf(p("Salmonella"), "MONOCYTOGENES")).toBe("SALMONELLA");
  });
});

describe("isDetection — presence / absence, never an enumeration", () => {
  it("a unit « /quantity » without UFC", () => {
    for (const unit of ["/25 g", "/25g", "/5L", "/100 ml", "/cm²", "/250ml"]) expect(isDetection(unit), unit).toBe(true);
    for (const unit of ["UFC/g", "ufc/cm²", "UFC/mains", "UFC/100 mL", "", null, undefined, "mg/kg"]) expect(isDetection(unit), String(unit)).toBe(false);
  });
});

describe("contaminationAlertPlan — what setting the list changes", () => {
  const catalogue = [
    p("Salmonella", { id: "s-food", unit: "/25 g", limitValue: 0 }),
    p("Salmonella", { id: "s-water", category: "EAU", alertOnExceed: true, unit: "/5L", limitValue: 0 }),
    p("Recherche de Salmonelle", { id: "s-water-2", category: "EAU", unit: "/100 ml", limitValue: null }),
    p("E. coli", { id: "e-surface", category: "AMBIANCE", unit: "ufc/cm²", limitValue: null }),
    p("E. coli", { id: "e-food", unit: "UFC/g", limitValue: 100 }),
    p("Listeria spp", { id: "l-food", unit: "/25g" }),
    p("Entérocoques intestinaux", { id: "ent-water", category: "EAU", alertOnExceed: true, unit: "UFC/100 mL", limitValue: 0 }),
    p("Coliformes totaux", { id: "col-food" }),
    p("E. coli", { id: "e-chem", family: "CHIMIE", limitValue: 1 }),
  ];

  it("to set (the flag only, even on a detection without a limit — J3 + O-12), an enumeration without a limit apart, already set, the others listed", () => {
    const plan = contaminationAlertPlan(catalogue);
    expect(plan.toSet.map((r) => [r.id, r.germ, r.patch])).toEqual([
      ["e-food", "E_COLI", { alertOnExceed: true }],
      ["l-food", "LISTERIA", { alertOnExceed: true }],
      ["s-water-2", "SALMONELLA", { alertOnExceed: true }],
      ["s-food", "SALMONELLA", { alertOnExceed: true }],
    ]);
    // No criterion invented: never a limit in any body while J3 is on.
    expect(plan.toSet.some((r) => "limitValue" in r.patch)).toBe(false);
    // Never an invented limit for an enumeration: the laboratory's to give.
    expect(plan.needsLimit.map((r) => [r.id, r.germ])).toEqual([["e-surface", "E_COLI"]]);
    expect(plan.alreadySet.map((r) => r.id)).toEqual(["s-water"]);
    // Listed, never cleared by the plan (clearing silences alerts).
    expect(plan.othersFlagged.map((r) => [r.id, r.germ])).toEqual([["ent-water", null]]);
  });

  it("switch J3 off (a sensitive parameter needs a limit again): the detection gets the limit 0 with its flag", () => {
    const plan = contaminationAlertPlan(catalogue, "ALL", true);
    expect(plan.toSet.map((r) => [r.id, r.patch])).toEqual([
      ["e-food", { alertOnExceed: true }],
      ["l-food", { alertOnExceed: true, limitValue: 0 }],
      ["s-water-2", { alertOnExceed: true, limitValue: 0 }],
      ["s-food", { alertOnExceed: true }],
    ]);
    expect(plan.needsLimit.map((r) => r.id)).toEqual(["e-surface"]);
  });

  it("is idempotent: once set, nothing left to set", () => {
    const set = new Map(contaminationAlertPlan(catalogue).toSet.map((r) => [r.id, r.patch]));
    const after = catalogue.map((row) => (set.has(row.id) ? { ...row, ...set.get(row.id) } : row));
    const again = contaminationAlertPlan(after);
    expect(again.toSet).toEqual([]);
    expect(again.alreadySet.map((r) => r.id).sort()).toEqual(["e-food", "l-food", "s-food", "s-water", "s-water-2"]);
    expect(again.needsLimit.map((r) => r.id)).toEqual(["e-surface"]);
  });

  it("the narrowed scope leaves Listeria spp. out — deferred, listed only", () => {
    const narrowed = contaminationAlertPlan(catalogue, "MONOCYTOGENES");
    expect(narrowed.toSet.map((r) => r.id)).toEqual(["e-food", "s-water-2", "s-food"]);
    expect(narrowed.deferred.map((r) => [r.id, r.germ])).toEqual([["l-food", "LISTERIA"]]);
  });

  it("scope NONE (the script's default until R-14, §7 S3): no Listeria set, none cleared", () => {
    expect(alertGermOf(p("Listeria monocytogenes"), "NONE")).toBeNull();
    expect(alertGermOf(p("Salmonella"), "NONE")).toBe("SALMONELLA");
    const none = contaminationAlertPlan(catalogue, "NONE");
    expect(none.toSet.map((r) => r.germ)).not.toContain("LISTERIA");
    expect(none.deferred.map((r) => r.id)).toEqual(["l-food"]);
    // A Listeria already flagged is deferred too — never among the « others » `--unset-others` clears.
    const flagged = catalogue.map((row) => (row.id === "l-food" ? { ...row, alertOnExceed: true } : row));
    const plan = contaminationAlertPlan(flagged, "NONE");
    expect(plan.othersFlagged.map((r) => r.id)).not.toContain("l-food");
    expect(plan.deferred.map((r) => r.id)).toEqual(["l-food"]);
  });

  it("--enumerations (lot 4A, S10 — Q10 of 04/11): the cited enumerations without a limit get the flag only, J3 on", () => {
    const counts = [
      ...catalogue,
      p("Escherichia-Coli βglucoronidase positives*/mains", { id: "e-hands", category: "AMBIANCE", unit: "UFC/mains", limitValue: null }),
      p("Escherichia-Coli présumés", { id: "e-presumed", unit: "ufc/g", limitValue: null }),
      p("Listeria", { id: "l-water", category: "EAU", unit: "ufc/100ml", limitValue: null, aliases: "Listeria monocytogenes" }),
      p("Listeria", { id: "l-food-count", unit: "UFC/g", limitValue: null, aliases: "Listeria monocytogenes" }),
      p("E. coli", { id: "e-food-count", category: "EAU", name: "E. coli (dénombrement)", unit: "UFC/100 mL", limitValue: null }),
    ];
    // Without the option: listed « needs a limit », as before.
    expect(contaminationAlertPlan(counts, "MONOCYTOGENES").needsLimit.map((r) => r.id).sort()).toEqual(
      ["e-food-count", "e-hands", "e-presumed", "e-surface", "l-food-count", "l-water"].sort()
    );
    const plan = contaminationAlertPlan(counts, "MONOCYTOGENES", false, true);
    const flagged = plan.toSet.filter((r) => r.enumeration);
    expect(flagged.map((r) => r.id).sort()).toEqual(["e-hands", "e-presumed", "e-surface", "l-water"]);
    // The flag only — never an invented limit.
    expect(flagged.every((r) => JSON.stringify(r.patch) === JSON.stringify({ alertOnExceed: true }))).toBe(true);
    // Not cited: E. coli counted in water, L. monocytogenes counted in food — the laboratory's limit first.
    expect(plan.needsLimit.map((r) => r.id).sort()).toEqual(["e-food-count", "l-food-count"]);
    // Switch J3 off: a sensitive parameter needs a limit again — nothing flagged without one.
    expect(contaminationAlertPlan(counts, "MONOCYTOGENES", true, true).toSet.some((r) => r.enumeration)).toBe(false);
    // Listeria outside the scope: never reached.
    expect(contaminationAlertPlan(counts, "NONE", false, true).toSet.some((r) => r.id === "l-water")).toBe(false);
  });

  it("citedEnumeration: E. coli on surfaces and hands, E. coli « présumés », L. monocytogenes in water", () => {
    expect(citedEnumeration({ name: "E. coli", category: "AMBIANCE", unit: "ufc/cm²" }, "E_COLI")).toBe(true);
    expect(citedEnumeration({ name: "Coliformes E. coli/25cm2", category: "AMBIANCE", unit: "UFC/25cm²" }, "E_COLI")).toBe(true);
    expect(citedEnumeration({ name: "Escherichia-Coli βglucoronidase positives*/mains", category: "AMBIANCE", unit: "UFC/mains" }, "E_COLI")).toBe(true);
    expect(citedEnumeration({ name: "Escherichia-Coli présumés", category: "ALIMENTAIRE" }, "E_COLI")).toBe(true);
    expect(citedEnumeration({ name: "E. coli", aliases: "E. coli presumes", category: "EAU" }, "E_COLI")).toBe(true);
    expect(citedEnumeration({ name: "E. coli", category: "ALIMENTAIRE" }, "E_COLI")).toBe(false);
    expect(citedEnumeration({ name: "Listeria", aliases: "Listeria monocytogenes", category: "EAU" }, "LISTERIA")).toBe(true);
    expect(citedEnumeration({ name: "Listeria", aliases: "Listeria monocytogenes", category: "ALIMENTAIRE" }, "LISTERIA")).toBe(false);
    expect(citedEnumeration({ name: "Salmonella", category: "AMBIANCE" }, "SALMONELLA")).toBe(false);
  });

  it("citedEnumeration never widens to what the laboratory did not cite: the air's E. coli, water Listeria spp.", () => {
    // The category AMBIANCE is shared with the air: an air E. coli is not a surface.
    expect(citedEnumeration({ name: "E. coli", category: "AMBIANCE", unit: "UFC/m³" }, "E_COLI")).toBe(false);
    expect(citedEnumeration({ name: "E. coli (air)", category: "AMBIANCE", unit: "UFC/boîte" }, "E_COLI")).toBe(false);
    expect(citedEnumeration({ name: "E. coli", category: "AMBIANCE", unit: null }, "E_COLI")).toBe(false);
    // A water Listeria not named monocytogenes: never flagged, whatever `--listeria` says.
    expect(citedEnumeration({ name: "Listeria", category: "EAU", unit: "ufc/100ml" }, "LISTERIA")).toBe(false);
    expect(citedEnumeration({ name: "Listeria spp", aliases: "Recherche de Listeria spp", category: "EAU" }, "LISTERIA")).toBe(false);
    const counts = [
      p("E. coli", { id: "e-air", category: "AMBIANCE", unit: "UFC/m³", limitValue: null }),
      p("Listeria spp", { id: "l-water-spp", category: "EAU", unit: "ufc/100ml", limitValue: null }),
      p("Listeria", { id: "l-water-mono", category: "EAU", unit: "ufc/100ml", limitValue: null, aliases: "Listeria monocytogenes" }),
    ];
    const plan = contaminationAlertPlan(counts, "ALL", false, true);
    expect(plan.toSet.filter((r) => r.enumeration).map((r) => r.id)).toEqual(["l-water-mono"]);
    expect(plan.needsLimit.map((r) => r.id).sort()).toEqual(["e-air", "l-water-spp"]);
  });

  it("the production script is tracked, defaults to no Listeria and says what it writes", () => {
    const script = readFileSync(fileURLToPath(new URL("../../scripts/s3-contamination-alerts.mts", import.meta.url)), "utf8");
    expect(script).toMatch(/opt\("listeria"\) \?\? "none"/);
    expect(script).toContain("limitValue: 0");
    expect(script).toMatch(/const enumerations = flag\("enumerations"\);/);
    expect(script).toMatch(/contaminationAlertPlan\(read\.data, listeria, j3Off, enumerations\)/);
    expect(script).not.toMatch(/C:\/laragon/);
  });
});
