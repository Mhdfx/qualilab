import { describe, it, expect } from "vitest";
import {
  checkParameterVersion,
  DEFAULT_PARAMETER_FAMILY,
  isOutdatedFormSave,
  PARAMETER_CHANGED_ERROR,
  PARAMETER_FAMILIES,
  PARAMETER_FORM_KEYS,
  PARAMETER_PAGE_OUTDATED_ERROR,
  parameterVersion,
  validateParameter,
  parseLimit,
  type CleanParameter,
} from "./parameter-validation";

const valid = {
  name: "E. coli",
  category: "ALIMENTAIRE",
  unit: "UFC/g",
  threshold: "1.10² UFC/g",
  limitValue: 100,
  alertOnExceed: true,
};

describe("parseLimit", () => {
  it("reads a limit typed with a comma, as in French", () => {
    expect(parseLimit("1,5")).toBe(1.5);
    expect(parseLimit("100")).toBe(100);
    expect(parseLimit(0)).toBe(0);
  });

  it("treats an empty field as no limit defined", () => {
    expect(parseLimit("")).toBeNull();
    expect(parseLimit(null)).toBeNull();
    expect(parseLimit(undefined)).toBeNull();
  });

  it("refuses what cannot be a limit", () => {
    expect(parseLimit("abc")).toBe("invalid");
    expect(parseLimit(-1)).toBe("invalid");
    expect(parseLimit(Number.NaN)).toBe("invalid");
  });
});

describe("validateParameter", () => {
  it("accepts a well-formed parameter", () => {
    const result = validateParameter(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: "E. coli",
        category: "ALIMENTAIRE",
        limitValue: 100,
        alertOnExceed: true,
      });
    }
  });

  it("requires a name and a real domain", () => {
    expect(validateParameter({ ...valid, name: "  " }).ok).toBe(false);
    expect(validateParameter({ ...valid, category: "AUTRE" }).ok).toBe(false);
  });

  it("refuses a sensitive parameter with no limit", () => {
    // Otherwise the system would promise an alert it can never raise.
    const result = validateParameter({
      ...valid,
      limitValue: "",
      alertOnExceed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("limite");
  });

  it("allows no limit when no alert is expected", () => {
    const result = validateParameter({
      ...valid,
      limitValue: "",
      alertOnExceed: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.limitValue).toBeNull();
  });

  it("accepts a limit of zero, which means absence is required", () => {
    const result = validateParameter({ ...valid, name: "Salmonelles", limitValue: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.limitValue).toBe(0);
  });

  it("keeps empty optional fields as null rather than empty strings", () => {
    const result = validateParameter({
      ...valid,
      unit: "",
      threshold: "  ",
      alertOnExceed: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unit).toBeNull();
      expect(result.value.threshold).toBeNull();
    }
  });

  it("treats a missing alert flag as not sensitive", () => {
    const result = validateParameter({ ...valid, alertOnExceed: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.alertOnExceed).toBe(false);
  });
});

describe("calcFactor", () => {
  const valid = { name: "E. coli", category: "ALIMENTAIRE", limitValue: "100" };

  it("defaults to 1 when the field is empty or absent", () => {
    for (const calcFactor of [undefined, null, ""]) {
      const result = validateParameter({ ...valid, calcFactor });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.calcFactor).toBe(1);
    }
  });

  it("accepts a decimal factor written with a comma", () => {
    const result = validateParameter({ ...valid, calcFactor: "2,5" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.calcFactor).toBe(2.5);
  });

  it("refuses zero and negative factors — they would zero or flip results", () => {
    for (const calcFactor of ["0", "-10", "abc"]) {
      const result = validateParameter({ ...valid, calcFactor });
      expect(result.ok).toBe(false);
    }
  });
});

describe("aliases", () => {
  it("keeps one alias per line, trimmed, and none when empty", () => {
    const ok = validateParameter({ name: "Salmonella", category: "ALIMENTAIRE", aliases: " Recherche de Salmonella /25g \n\nSalmonella spp " });
    expect(ok).toMatchObject({ ok: true, value: { aliases: "Recherche de Salmonella /25g\nSalmonella spp" } });
    expect(validateParameter({ name: "Salmonella", category: "ALIMENTAIRE", aliases: "" })).toMatchObject({ ok: true, value: { aliases: null } });
  });
});

describe("family (RETOUR-LABO-06-10.md §5, V3)", () => {
  const base = { name: "pH", category: "EAU" };

  it("defaults to microbiology when the form says nothing", () => {
    for (const family of [undefined, null, ""]) {
      const result = validateParameter({ ...base, family });
      expect(result).toMatchObject({ ok: true, value: { family: "MICRO" } });
    }
    expect(DEFAULT_PARAMETER_FAMILY).toBe("MICRO");
  });

  it("accepts the three families", () => {
    for (const family of PARAMETER_FAMILIES) {
      expect(validateParameter({ ...base, family })).toMatchObject({ ok: true, value: { family } });
    }
    expect(PARAMETER_FAMILIES).toEqual(["MICRO", "CHIMIE", "AUTRE"]);
  });

  it("refuses anything else, in French", () => {
    for (const family of ["PHYSICO", "micro", 2, true, ["CHIMIE"]]) {
      const result = validateParameter({ ...base, family });
      expect(result).toEqual({
        ok: false,
        error: "Domaine invalide : microbiologie, physico-chimie ou autre.",
      });
    }
  });

  it("keeps the family apart from the domain", () => {
    expect(validateParameter({ ...base, family: "CHIMIE" })).toMatchObject({
      ok: true,
      value: { name: "pH", category: "EAU", family: "CHIMIE" },
    });
  });
});

describe("columns of 191 characters", () => {
  // A unit or a displayed threshold beyond VARCHAR(191) crashed the insert (500).
  it("refuses a unit or a displayed threshold longer than its column", () => {
    const base = { name: "Germe", category: "ALIMENTAIRE" };
    expect(validateParameter({ ...base, unit: "u".repeat(192) }).ok).toBe(false);
    expect(validateParameter({ ...base, threshold: "t".repeat(192) }).ok).toBe(false);
    expect(validateParameter({ ...base, unit: "u".repeat(191), threshold: "t".repeat(191) }).ok).toBe(true);
  });
});

describe("parameterVersion — what an edit loaded (open point of D-19)", () => {
  const stored: CleanParameter = {
    name: "Plomb",
    category: "ALIMENTAIRE",
    family: "MICRO",
    unit: "mg/kg",
    threshold: "0,1 mg/kg",
    limitValue: 0.1,
    alertOnExceed: false,
    calcFactor: 1,
    aliases: "Pb\nPlomb total",
  };

  it("is the same for the same values, whatever else the row carries or the key order", () => {
    const version = parameterVersion(stored);
    expect(version).toMatch(/^[0-9a-f]{14}$/);
    expect(parameterVersion({ ...stored })).toBe(version);
    // The screen's row has an id and the norm in force; the route's, an id.
    const screenRow = { id: "p1", normLabel: "NM 08.0.xxx", ...stored };
    expect(parameterVersion(screenRow)).toBe(version);
    const reordered = Object.fromEntries(Object.entries(stored).reverse()) as CleanParameter;
    expect(parameterVersion(reordered)).toBe(version);
  });

  it("changes with every field an edit writes — the domain of a reclassification first", () => {
    const version = parameterVersion(stored);
    const edits: Partial<CleanParameter>[] = [
      { family: "CHIMIE" },
      { category: "EAU" },
      { name: "Plomb (Pb)" },
      { unit: null },
      { unit: "mg/l" },
      { threshold: null },
      { limitValue: 0.2 },
      { limitValue: null },
      { alertOnExceed: true },
      { calcFactor: 10 },
      { aliases: "Pb" },
      { aliases: null },
    ];
    const versions = edits.map((edit) => parameterVersion({ ...stored, ...edit }));
    for (const other of versions) expect(other).not.toBe(version);
    expect(new Set(versions).size).toBe(edits.length);
  });

  it("tells null from an empty text and a limit of 0 from no limit", () => {
    expect(parameterVersion({ ...stored, unit: null })).not.toBe(parameterVersion({ ...stored, unit: "" }));
    expect(parameterVersion({ ...stored, limitValue: 0 })).not.toBe(parameterVersion({ ...stored, limitValue: null }));
  });

  it("survives the trip through JSON — the screen gets its rows serialised", () => {
    const travelled = JSON.parse(JSON.stringify({ id: "p1", ...stored, limitValue: 0.1 + 0.2, calcFactor: 1e-7 }));
    expect(parameterVersion(travelled)).toBe(parameterVersion({ ...stored, limitValue: 0.1 + 0.2, calcFactor: 1e-7 }));
  });
});

describe("checkParameterVersion", () => {
  const stored: CleanParameter = {
    name: "pH",
    category: "EAU",
    family: "CHIMIE",
    unit: null,
    threshold: "6,5 – 8,5",
    limitValue: null,
    alertOnExceed: false,
    calcFactor: 1,
    aliases: null,
  };

  it("accepts the version of the stored row", () => {
    expect(checkParameterVersion(parameterVersion(stored), stored)).toBe("ok");
  });

  it("refuses the version of a row that has changed since — reclassified or edited", () => {
    const opened: CleanParameter = { ...stored, family: "MICRO" };
    expect(checkParameterVersion(parameterVersion(opened), stored)).toBe("stale");
    expect(checkParameterVersion(parameterVersion({ ...stored, threshold: "6 – 9" }), stored)).toBe("stale");
    expect(checkParameterVersion("", stored)).toBe("stale");
  });

  it("does not check a request without a version (older callers, scripts)", () => {
    expect(checkParameterVersion(undefined, stored)).toBe("ok");
    expect(checkParameterVersion(null, stored)).toBe("ok");
  });

  it("calls anything but a string invalid", () => {
    expect(checkParameterVersion(42, stored)).toBe("invalid");
    expect(checkParameterVersion({ family: "CHIMIE" }, stored)).toBe("invalid");
    expect(checkParameterVersion(true, stored)).toBe("invalid");
  });

  it("says what happened and what to do", () => {
    expect(PARAMETER_CHANGED_ERROR).toBe(
      "Ce paramètre a été modifié entre-temps (reclassé ou édité) : rechargez-le avant d'enregistrer."
    );
  });
});

describe("isOutdatedFormSave — a page loaded before the deploy (D-19)", () => {
  // What the form of master (production before this release) sends: the nine fields, no version.
  const oldForm = {
    name: "Plomb",
    category: "ALIMENTAIRE",
    family: "MICRO",
    unit: "mg/kg",
    threshold: "0,1 mg/kg",
    limitValue: "0.1",
    alertOnExceed: false,
    calcFactor: "",
    aliases: "",
  };

  it("knows the old form: every field of the form, no version", () => {
    expect(Object.keys(oldForm).sort()).toEqual([...PARAMETER_FORM_KEYS].sort());
    expect(isOutdatedFormSave(oldForm)).toBe(true);
    expect(isOutdatedFormSave({ ...oldForm, version: null })).toBe(true);
    // An emptied field is still sent ("" or null): still the old form.
    expect(isOutdatedFormSave({ ...oldForm, unit: null, threshold: "" })).toBe(true);
  });

  it("lets the current form through: it always sends its version", () => {
    expect(isOutdatedFormSave({ ...oldForm, version: "00000000000000" })).toBe(false);
  });

  it("lets a script changing a field or two through", () => {
    expect(isOutdatedFormSave({ threshold: "0,2 mg/kg" })).toBe(false);
    expect(isOutdatedFormSave({ family: "CHIMIE" })).toBe(false);
    const eight = Object.fromEntries(Object.entries(oldForm).filter(([key]) => key !== "aliases"));
    expect(isOutdatedFormSave(eight)).toBe(false);
    expect(isOutdatedFormSave({})).toBe(false);
  });

  it("says what to do, and that nothing was saved", () => {
    expect(PARAMETER_PAGE_OUTDATED_ERROR).toBe(
      "Cette page date d'avant la dernière mise à jour du logiciel : rechargez-la avant d'enregistrer. Rien n'a été enregistré."
    );
  });
});
