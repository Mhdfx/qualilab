import { describe, expect, it } from "vitest";
import type { LineKind } from "@/generated/prisma/enums";
import {
  LINE_FAMILIES,
  NATURE_CODE_BY_KIND,
  defaultFamiliesFor,
  familiesFor,
  familyOfNature,
  natureCodeFor,
  natureFor,
  type NatureRef,
} from "./nature-family";

/**
 * RETOUR-LABO-06-10.md §5 (V3) — the nature is deduced from the type × the
 * ticked family; « — » cells are greyed-out boxes.
 */

const KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];

const nature = (code: string, family: NatureRef["family"], active = true): NatureRef => ({
  id: `nat-${code.toLowerCase()}`,
  code,
  family,
  active,
});

/** An invented catalogue: the eight natures of the table, one finer nature
 * and the chemistry of surfaces archived. */
const NATURES: NatureRef[] = [
  nature("MICRO_ALIMENTS", "MICRO"),
  nature("PC_ALIMENTS", "CHIMIE"),
  nature("MICRO_SURFACES", "MICRO"),
  nature("PC_SURFACES", "CHIMIE", false),
  nature("MICRO_EAUX", "MICRO"),
  nature("PC_EAUX", "CHIMIE"),
  nature("MICRO_AIR", "MICRO"),
  nature("EFFET_ASEPTISANT", "CHIMIE"),
  nature("NATURE_FINE_TEST", "MICRO"),
];

describe("the type × family table", () => {
  it("covers every line kind", () => {
    expect(Object.keys(NATURE_CODE_BY_KIND).sort()).toEqual([...KINDS].sort());
  });

  it.each([
    ["ALIMENT", "MICRO_ALIMENTS", "PC_ALIMENTS"],
    ["SURFACE", "MICRO_SURFACES", "PC_SURFACES"],
    ["MAINS", "MICRO_SURFACES", null],
    ["EAU", "MICRO_EAUX", "PC_EAUX"],
    ["AIR", "MICRO_AIR", null],
    ["AUTRE", null, "EFFET_ASEPTISANT"],
  ] as const)("%s → micro %s, physico-chimie %s", (kind, micro, chimie) => {
    expect(natureCodeFor(kind, "MICRO")).toBe(micro);
    expect(natureCodeFor(kind, "CHIMIE")).toBe(chimie);
  });

  it("never offers the AUTRE family on a line", () => {
    for (const kind of KINDS) expect(natureCodeFor(kind, "AUTRE")).toBeNull();
  });

  it("answers null for a kind it does not know (an old or forged value)", () => {
    expect(natureCodeFor("INCONNU" as LineKind, "MICRO")).toBeNull();
    expect(familiesFor("INCONNU" as LineKind)).toEqual([]);
  });
});

describe("familiesFor", () => {
  it.each([
    ["ALIMENT", ["MICRO", "CHIMIE"]],
    ["SURFACE", ["MICRO", "CHIMIE"]],
    ["MAINS", ["MICRO"]],
    ["EAU", ["MICRO", "CHIMIE"]],
    ["AIR", ["MICRO"]],
    ["AUTRE", ["CHIMIE"]],
  ] as const)("%s → %j", (kind, families) => {
    expect(familiesFor(kind)).toEqual(families);
  });

  it("lists microbiology first, as on the paper", () => {
    expect(LINE_FAMILIES).toEqual(["MICRO", "CHIMIE"]);
  });
});

describe("defaultFamiliesFor", () => {
  it.each([
    ["ALIMENT", ["MICRO"]],
    ["SURFACE", ["MICRO"]],
    ["MAINS", ["MICRO"]],
    ["EAU", ["MICRO"]],
    ["AIR", ["MICRO"]],
    ["AUTRE", ["CHIMIE"]],
  ] as const)("%s → %j", (kind, families) => {
    expect(defaultFamiliesFor(kind)).toEqual(families);
  });

  it("ticks a box the type actually has", () => {
    for (const kind of KINDS) {
      const defaults = defaultFamiliesFor(kind);
      expect(defaults).toHaveLength(1);
      expect(familiesFor(kind)).toContain(defaults[0]);
    }
  });
});

describe("natureFor", () => {
  it("finds the nature of each available cell", () => {
    expect(natureFor(NATURES, "ALIMENT", "MICRO")?.id).toBe("nat-micro_aliments");
    expect(natureFor(NATURES, "ALIMENT", "CHIMIE")?.id).toBe("nat-pc_aliments");
    expect(natureFor(NATURES, "SURFACE", "MICRO")?.id).toBe("nat-micro_surfaces");
    expect(natureFor(NATURES, "MAINS", "MICRO")?.id).toBe("nat-micro_surfaces");
    expect(natureFor(NATURES, "EAU", "MICRO")?.id).toBe("nat-micro_eaux");
    expect(natureFor(NATURES, "EAU", "CHIMIE")?.id).toBe("nat-pc_eaux");
    expect(natureFor(NATURES, "AIR", "MICRO")?.id).toBe("nat-micro_air");
    expect(natureFor(NATURES, "AUTRE", "CHIMIE")?.id).toBe("nat-effet_aseptisant");
  });

  it("returns undefined for a greyed-out cell", () => {
    expect(natureFor(NATURES, "MAINS", "CHIMIE")).toBeUndefined();
    expect(natureFor(NATURES, "AIR", "CHIMIE")).toBeUndefined();
    expect(natureFor(NATURES, "AUTRE", "MICRO")).toBeUndefined();
    expect(natureFor(NATURES, "ALIMENT", "AUTRE")).toBeUndefined();
  });

  it("skips an archived nature rather than proposing it", () => {
    expect(natureFor(NATURES, "SURFACE", "CHIMIE")).toBeUndefined();
  });

  it("returns undefined when the catalogue lacks the nature", () => {
    expect(natureFor([], "ALIMENT", "MICRO")).toBeUndefined();
  });

  it("treats a nature without `active` as active", () => {
    const loose = [{ id: "nat-x", code: "MICRO_EAUX", family: "MICRO" as const }];
    expect(natureFor(loose, "EAU", "MICRO")).toBe(loose[0]);
  });

  it("keeps the caller's own nature type", () => {
    const rich = [{ ...nature("PC_EAUX", "CHIMIE"), label: "Nature Test" }];
    expect(natureFor(rich, "EAU", "CHIMIE")?.label).toBe("Nature Test");
  });
});

describe("familyOfNature", () => {
  it("reads the nature's own family, finer natures included", () => {
    expect(familyOfNature(nature("PC_ALIMENTS", "CHIMIE"))).toBe("CHIMIE");
    expect(familyOfNature(nature("NATURE_FINE_TEST", "MICRO"))).toBe("MICRO");
    expect(familyOfNature(nature("NATURE_SENSORIELLE_TEST", "AUTRE"))).toBe("AUTRE");
  });

  it("falls back on the table for a nature known only by its code", () => {
    expect(familyOfNature({ code: "MICRO_SURFACES" })).toBe("MICRO");
    expect(familyOfNature({ code: "EFFET_ASEPTISANT" })).toBe("CHIMIE");
    expect(familyOfNature({ code: "PC_EAUX", family: null })).toBe("CHIMIE");
  });

  it("returns undefined when nothing tells the family", () => {
    expect(familyOfNature(undefined)).toBeUndefined();
    expect(familyOfNature(null)).toBeUndefined();
    expect(familyOfNature({ code: "NATURE_FINE_TEST" })).toBeUndefined();
    expect(familyOfNature({})).toBeUndefined();
  });

  it("agrees with the table on every nature it lists", () => {
    for (const kind of KINDS) {
      for (const family of familiesFor(kind)) {
        expect(familyOfNature({ code: natureCodeFor(kind, family) })).toBe(family);
      }
    }
  });
});
