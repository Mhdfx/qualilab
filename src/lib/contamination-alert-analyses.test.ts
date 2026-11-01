import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALERT_CATEGORIES,
  alertGermOf,
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

  it("to set (the limit 0 for a detection without one), an enumeration without a limit apart, already set, the others listed", () => {
    const plan = contaminationAlertPlan(catalogue);
    expect(plan.toSet.map((r) => [r.id, r.germ, r.patch])).toEqual([
      ["e-food", "E_COLI", { alertOnExceed: true }],
      ["l-food", "LISTERIA", { alertOnExceed: true, limitValue: 0 }],
      ["s-water-2", "SALMONELLA", { alertOnExceed: true, limitValue: 0 }],
      ["s-food", "SALMONELLA", { alertOnExceed: true }],
    ]);
    // Never an invented limit for an enumeration: the laboratory's to give.
    expect(plan.needsLimit.map((r) => [r.id, r.germ])).toEqual([["e-surface", "E_COLI"]]);
    expect(plan.alreadySet.map((r) => r.id)).toEqual(["s-water"]);
    // Listed, never cleared by the plan (clearing silences alerts).
    expect(plan.othersFlagged.map((r) => [r.id, r.germ])).toEqual([["ent-water", null]]);
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

  it("the production script is tracked, defaults to no Listeria and says what it writes", () => {
    const script = readFileSync(fileURLToPath(new URL("../../scripts/s3-contamination-alerts.mts", import.meta.url)), "utf8");
    expect(script).toMatch(/opt\("listeria"\) \?\? "none"/);
    expect(script).toContain("limitValue: 0");
    expect(script).not.toMatch(/C:\/laragon/);
  });
});
