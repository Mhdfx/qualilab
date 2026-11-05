import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { accreditationSeedFor, accreditationSeedPlan, type AccreditationSeedRow } from "./accreditation-seed";

const row = (over: Partial<AccreditationSeedRow>): AccreditationSeedRow => ({
  id: over.name ?? "x",
  name: "Paramètre",
  family: "CHIMIE",
  accreditation: null,
  ...over,
});

describe("accreditationSeedFor — the first list (S12, hypothèse C-4)", () => {
  it("a microbiology parameter without a mark is « Accrédité »", () => {
    expect(accreditationSeedFor({ name: "Coliformes totaux", family: "MICRO" })).toEqual({ status: "ACCREDITE", why: "MICROBIOLOGIE" });
  });

  it("a histamine is « Accrédité » whatever its family", () => {
    expect(accreditationSeedFor({ name: "Histamine", family: "CHIMIE" })).toEqual({ status: "ACCREDITE", why: "HISTAMINE" });
    expect(accreditationSeedFor({ name: "Dosage de l'HISTAMINE", family: "AUTRE" })?.status).toBe("ACCREDITE");
  });

  it("the old software's mark always wins, microbiology or histamine included", () => {
    expect(accreditationSeedFor({ name: "Levures *", family: "MICRO" })).toEqual({ status: "NON_ACCREDITE", why: "MARQUE_ANCIEN_LOGICIEL" });
    expect(accreditationSeedFor({ name: "Legionella (SA)", family: "MICRO" })?.status).toBe("SOUS_TRAITE_ACCREDITE");
    expect(accreditationSeedFor({ name: "Histamine (SN)", family: "CHIMIE" })?.status).toBe("SOUS_TRAITE_NON_ACCREDITE");
    expect(accreditationSeedFor({ name: "Plomb (SA)", family: "CHIMIE" })?.status).toBe("SOUS_TRAITE_ACCREDITE");
  });

  it("physico-chemistry other than histamine, and « autre », stay « à préciser »", () => {
    expect(accreditationSeedFor({ name: "pH", family: "CHIMIE" })).toBeNull();
    expect(accreditationSeedFor({ name: "Température", family: "AUTRE" })).toBeNull();
    expect(accreditationSeedFor({ name: "Nitrates", family: null })).toBeNull();
  });
});

describe("accreditationSeedPlan", () => {
  it("never rewrites a status already recorded, and counts what stays « à préciser »", () => {
    const plan = accreditationSeedPlan([
      row({ id: "a", name: "Coliformes", family: "MICRO" }),
      row({ id: "b", name: "Salmonelles", family: "MICRO", accreditation: "NON_ACCREDITE" }),
      row({ id: "c", name: "Histamine", family: "CHIMIE" }),
      row({ id: "d", name: "pH", family: "CHIMIE" }),
      row({ id: "e", name: "Levures *", family: "MICRO" }),
      row({ id: "f", name: "Chlore", family: "CHIMIE", accreditation: "ACCREDITE" }),
    ]);
    expect(plan.set.map((e) => [e.id, e.accreditation, e.why])).toEqual([
      ["a", "ACCREDITE", "MICROBIOLOGIE"],
      ["c", "ACCREDITE", "HISTAMINE"],
      ["e", "NON_ACCREDITE", "MARQUE_ANCIEN_LOGICIEL"],
    ]);
    expect(plan.kept).toBe(2);
    expect(plan.leftUnknown).toBe(1);
  });

  it("an empty catalogue gives an empty plan", () => {
    expect(accreditationSeedPlan([])).toEqual({ set: [], kept: 0, leftUnknown: 0 });
  });
});

describe("scripts/s12-accreditation.mts — writes through the admin route only", () => {
  const script = readFileSync(fileURLToPath(new URL("../../scripts/s12-accreditation.mts", import.meta.url)), "utf8");

  it("uses the plan and the journalled admin route, never the database", () => {
    expect(script).toContain("accreditationSeedPlan");
    expect(script).toContain('"/api/parameters/accreditation"');
    expect(script).not.toMatch(/prisma|mysql|DATABASE_URL/i);
  });

  it("refuses a typed password anywhere but the local application", () => {
    expect(script).toContain("--login password is for the local application only");
  });

  it("writes in batches the route accepts", () => {
    expect(script).toContain("ACCREDITATION_BATCH_MAX");
  });
});
