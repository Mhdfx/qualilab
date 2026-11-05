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

const DOMAINS = { domains: true } as const;

describe("accreditationSeedFor — default: the old software's marks only (production before C-4)", () => {
  it("a microbiology parameter or a histamine without a mark stays « à préciser »", () => {
    expect(accreditationSeedFor({ name: "Coliformes totaux", family: "MICRO" })).toBeNull();
    expect(accreditationSeedFor({ name: "Flore aérobie (air)", family: "MICRO" })).toBeNull();
    expect(accreditationSeedFor({ name: "Histamine", family: "CHIMIE" })).toBeNull();
  });

  it("the old software's marks are still set", () => {
    expect(accreditationSeedFor({ name: "Levures *", family: "MICRO" })).toEqual({ status: "NON_ACCREDITE", why: "MARQUE_ANCIEN_LOGICIEL" });
    expect(accreditationSeedFor({ name: "Plomb (SA)", family: "CHIMIE" })?.status).toBe("SOUS_TRAITE_ACCREDITE");
  });
});

describe("accreditationSeedFor — with --domains (S12 first pass, hypothèse C-4, local only)", () => {
  it("a microbiology parameter without a mark is « Accrédité »", () => {
    expect(accreditationSeedFor({ name: "Coliformes totaux", family: "MICRO" }, DOMAINS)).toEqual({ status: "ACCREDITE", why: "MICROBIOLOGIE" });
  });

  it("a histamine is « Accrédité » whatever its family", () => {
    expect(accreditationSeedFor({ name: "Histamine", family: "CHIMIE" }, DOMAINS)).toEqual({ status: "ACCREDITE", why: "HISTAMINE" });
    expect(accreditationSeedFor({ name: "Dosage de l'HISTAMINE", family: "AUTRE" }, DOMAINS)?.status).toBe("ACCREDITE");
  });

  it("the old software's mark always wins, microbiology or histamine included", () => {
    expect(accreditationSeedFor({ name: "Levures *", family: "MICRO" }, DOMAINS)).toEqual({ status: "NON_ACCREDITE", why: "MARQUE_ANCIEN_LOGICIEL" });
    expect(accreditationSeedFor({ name: "Legionella (SA)", family: "MICRO" }, DOMAINS)?.status).toBe("SOUS_TRAITE_ACCREDITE");
    expect(accreditationSeedFor({ name: "Histamine (SN)", family: "CHIMIE" }, DOMAINS)?.status).toBe("SOUS_TRAITE_NON_ACCREDITE");
    expect(accreditationSeedFor({ name: "Plomb (SA)", family: "CHIMIE" }, DOMAINS)?.status).toBe("SOUS_TRAITE_ACCREDITE");
  });

  it("physico-chemistry other than histamine, and « autre », stay « à préciser »", () => {
    expect(accreditationSeedFor({ name: "pH", family: "CHIMIE" }, DOMAINS)).toBeNull();
    expect(accreditationSeedFor({ name: "Température", family: "AUTRE" }, DOMAINS)).toBeNull();
    expect(accreditationSeedFor({ name: "Nitrates", family: null }, DOMAINS)).toBeNull();
  });
});

describe("accreditationSeedPlan", () => {
  const catalogue = [
    row({ id: "a", name: "Coliformes", family: "MICRO" }),
    row({ id: "b", name: "Salmonelles", family: "MICRO", accreditation: "NON_ACCREDITE" }),
    row({ id: "c", name: "Histamine", family: "CHIMIE" }),
    row({ id: "d", name: "pH", family: "CHIMIE" }),
    row({ id: "e", name: "Levures *", family: "MICRO" }),
    row({ id: "f", name: "Chlore", family: "CHIMIE", accreditation: "ACCREDITE" }),
  ];

  it("by default sets the old software's marks only (no blanket « Accrédité » before C-4)", () => {
    const plan = accreditationSeedPlan(catalogue);
    expect(plan.set.map((e) => [e.id, e.accreditation, e.why])).toEqual([["e", "NON_ACCREDITE", "MARQUE_ANCIEN_LOGICIEL"]]);
    expect(plan.set.some((e) => e.accreditation === "ACCREDITE")).toBe(false);
    expect(plan.kept).toBe(2);
    expect(plan.leftUnknown).toBe(3);
  });

  it("with --domains never rewrites a status already recorded, and counts what stays « à préciser »", () => {
    const plan = accreditationSeedPlan(catalogue, DOMAINS);
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

  it("microbiology and histamine only behind --domains, on the plan and on the read-back", () => {
    expect(script).toContain('const domains = flag("domains")');
    expect(script.match(/accreditationSeedPlan\([^;]*\{ domains \}\)/g)?.length).toBe(2);
    expect(script).toContain("marques de l'ancien logiciel seulement");
  });
});
