import { describe, expect, it } from "vitest";
import { bigMChange, kindChange, toleranceApplies, validateCriterion, validateProductType, wideToleranceNote } from "./criteria-input";
import { hasLimit, judgeUnits, parseUnitReading, planLabel } from "./interpretation";
import { derivePlan } from "./legacy-catalogue";

describe("validateProductType", () => {
  it("normalises the name and defaults the family", () => {
    expect(validateProductType({ name: "  Salades  avec source protéique ", clientId: "" })).toEqual({
      ok: true,
      value: { name: "Salades avec source protéique", normalizedName: "salades avec source proteique", family: "MICRO", clientId: null, active: true },
    });
    expect(validateProductType({ name: "" })).toMatchObject({ ok: false });
  });
});

describe("validateCriterion", () => {
  it("accepts a 3-class plan typed in the lab's notation", () => {
    expect(validateCriterion({ parameterId: "p1", n: "5", c: "2", mKind: "VALUE", m: "1.10²", bigM: "1,5.10⁴", unit: "ufc/g" })).toEqual({
      ok: true,
      value: { id: null, parameterId: "p1", normVersionId: null, unit: "ufc/g", n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 15_000, active: true },
    });
  });

  it("enforces the plan's coherence", () => {
    expect(validateCriterion({ parameterId: "p1", n: 5, c: 5, m: 10, bigM: 100 })).toMatchObject({ ok: false });
    expect(validateCriterion({ parameterId: "p1", m: 100, bigM: 10 })).toMatchObject({ ok: false, error: expect.stringContaining("M doit être") });
    expect(validateCriterion({ parameterId: "p1", mKind: "ABSENCE", m: 10 })).toMatchObject({ ok: false });
    expect(validateCriterion({ parameterId: "p1", mKind: "VALUE" })).toMatchObject({ ok: false, error: expect.stringContaining("m est obligatoire") });
    expect(validateCriterion({ parameterId: "p1", mKind: "VALUE", bigM: 1000 })).toMatchObject({ ok: false, error: expect.stringContaining("m est obligatoire") });
    expect(validateCriterion({ parameterId: "p1", m: "abc" }, 3)).toMatchObject({ ok: false, error: expect.stringContaining("Ligne 3") });
  });

  it("accepts absence and M-only plans", () => {
    expect(validateCriterion({ parameterId: "p1", mKind: "ABSENCE", unit: "/25g" })).toMatchObject({ ok: true, value: { mKind: "ABSENCE", m: null, bigM: null, c: null } });
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", bigM: 1000 })).toMatchObject({ ok: true, value: { m: null, bigM: 1000 } });
  });

  // RETOUR-LABO-16-10.md F2: the imports write these rows, and the grid is
  // saved whole — one refused row kept the whole family from being saved.
  it("accepts « m non spécifiée » without M: no limit, a result without verdict", () => {
    for (const bigM of [undefined, null, ""]) {
      expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", m: "", bigM, unit: "%" })).toEqual({
        ok: true,
        value: { id: null, parameterId: "p1", normVersionId: null, unit: "%", n: 5, c: null, mKind: "UNSPECIFIED", m: null, bigM: null, active: true },
      });
    }
    // An m sent with it is refused, never dropped: the row would silently lose its limit.
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", m: 100 }, 2)).toEqual({
      ok: false,
      row: 2,
      error: "Ligne 2 : « m non spécifiée » ne porte pas de m : indiquez M, ou laissez M vide pour « sans limite ».",
    });
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", m: "1.10²", bigM: "1.10³" })).toMatchObject({ ok: false });
  });

  it("refuses the bench shorthand « 1(-2) » as a limit — a reading, not a criterion", () => {
    expect(validateCriterion({ parameterId: "p1", m: "1(-2)" })).toMatchObject({ ok: false, error: "la limite m est illisible." });
    expect(validateCriterion({ parameterId: "p1", m: "10", bigM: " 1( -3 ) " })).toMatchObject({ ok: false, error: "la limite M est illisible." });
    expect(validateCriterion({ parameterId: "p1", m: "1.10²" })).toMatchObject({ ok: true, value: { m: 100 } });
  });

  it("takes the tolerance c wherever there is a figure to tolerate against (Q31)", () => {
    expect(validateCriterion({ parameterId: "p1", m: 10, c: 1 })).toMatchObject({ ok: true, value: { mKind: "VALUE", m: 10, bigM: null, c: 1 } });
    expect(validateCriterion({ parameterId: "p1", m: 10, bigM: 10, c: 1 })).toMatchObject({ ok: true, value: { m: 10, bigM: 10, c: 1 } });
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", bigM: "1.10³", c: "2" })).toMatchObject({ ok: true, value: { m: null, bigM: 1000, c: 2 } });
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", c: 2 }, 4)).toMatchObject({ ok: false, error: "Ligne 4 : la tolérance c n'a de sens qu'avec une limite chiffrée (m ou M)." });
    expect(validateCriterion({ parameterId: "p1", mKind: "ABSENCE", c: 0 })).toMatchObject({ ok: false, error: expect.stringContaining("absence ne porte pas de tolérance") });
  });

  it("bounds c by n, except n = 1 — the old software's « units of the sample »", () => {
    expect(validateCriterion({ parameterId: "p1", n: 5, c: 4, m: 10, bigM: 100 })).toMatchObject({ ok: true, value: { c: 4 } });
    expect(validateCriterion({ parameterId: "p1", n: 1, c: 2, m: 100, bigM: 10_000 })).toMatchObject({ ok: true, value: { n: 1, c: 2 } });
    expect(validateCriterion({ parameterId: "p1", n: 1, c: 999, m: 100, bigM: 10_000 })).toMatchObject({ ok: false, error: "c doit être un entier entre 0 et 998." });
    expect(validateCriterion({ parameterId: "p1", n: 3, c: 1.5, m: 10, bigM: 100 })).toMatchObject({ ok: false, error: "c doit être un entier entre 0 et n − 1." });
  });

  it("saves back every plan the old software's import derives", () => {
    const header = "id;id_type;id_param;parametre;norme;unite;type_pm;type_resultat;classe;nbr;control;valeur_pm;exp_pm;obsolete;ordre;l1_min;l1_exp_min;l1_max;l1_exp_max;l1_concl;l1_oper;l2_min;l2_exp_min;l2_max;l2_exp_max;l2_concl;l2_oper;l3_min;l3_exp_min;l3_max;l3_exp_max;l3_concl;l3_oper".split(";");
    const row = (values: Record<string, string>) => Object.fromEntries(header.map((h) => [h, values[h] ?? ""]));
    const intervals = { l1_max: "1.0000", l1_exp_max: "2", l1_concl: "2", l2_max: "1.0000", l2_exp_max: "4", l2_concl: "1" };
    const plans = [
      // Three-class, NBR empty → n = 1, c = 2 (the commonest row of the old base).
      derivePlan(row({ type_pm: "3", type_resultat: "11", control: "2", obsolete: "0", ...intervals })).plan,
      // m alone with c, M alone with c, « non spécifiée » without any limit with c.
      derivePlan(row({ type_pm: "3", type_resultat: "11", control: "1", obsolete: "0", l1_max: "3.0000", l1_exp_max: "1", l1_concl: "2" })).plan,
      derivePlan(row({ type_pm: "2", type_resultat: "11", control: "1", obsolete: "0", l1_max: "1.0000", l1_exp_max: "3", l1_concl: "2" })).plan,
      derivePlan(row({ type_pm: "2", type_resultat: "12", control: "2", obsolete: "0" })).plan,
      // An absence test carrying the CONTROL column.
      derivePlan(row({ type_pm: "1", type_resultat: "12", control: "2", obsolete: "0" })).plan,
    ];
    for (const plan of plans) {
      expect(plan).not.toBeNull();
      // What the grid sends back: c only where it means something.
      const c = toleranceApplies(plan!.mKind, plan!.m !== null, plan!.bigM !== null) ? plan!.c : null;
      expect(validateCriterion({ parameterId: "p1", ...plan!, c })).toMatchObject({ ok: true, value: { mKind: plan!.mKind, m: plan!.m, bigM: plan!.bigM, c } });
    }
    expect(plans.map((p) => p!.c)).toEqual([2, 1, 1, 2, 2]);
  });
});

describe("wideToleranceNote — c ≥ 1 with n = 1 on a single limit", () => {
  const note = "c = 2 avec n = 1 : un échantillon d'une seule unité au-dessus de la limite sera « Acceptable », jamais « Non satisfaisant ».";
  it("warns on m alone, M alone and m = M", () => {
    expect(wideToleranceNote({ n: 1, c: 2, mKind: "VALUE", m: 100, bigM: null })).toBe(note);
    expect(wideToleranceNote({ n: 1, c: 2, mKind: "UNSPECIFIED", m: null, bigM: 1000 })).toBe(note);
    expect(wideToleranceNote({ n: 1, c: 2, mKind: "VALUE", m: 100, bigM: 100 })).toBe(note);
  });

  it("stays silent where a unit above the limit is still « Non satisfaisant »", () => {
    // Three classes: above M is always non-satisfaisant.
    expect(wideToleranceNote({ n: 1, c: 2, mKind: "VALUE", m: 100, bigM: 10_000 })).toBeNull();
    expect(wideToleranceNote({ n: 1, c: 0, mKind: "VALUE", m: 100, bigM: null })).toBeNull();
    expect(wideToleranceNote({ n: 1, c: null, mKind: "VALUE", m: 100, bigM: null })).toBeNull();
    expect(wideToleranceNote({ n: 5, c: 2, mKind: "VALUE", m: 100, bigM: null })).toBeNull();
    expect(wideToleranceNote({ n: 1, c: 2, mKind: "UNSPECIFIED", m: null, bigM: null })).toBeNull();
    expect(wideToleranceNote({ n: 1, c: 2, mKind: "ABSENCE", m: null, bigM: null })).toBeNull();
  });

  it("matches the engine: one unit above the limit with n = 1, c = 1 is « Acceptable »", () => {
    const plan = { n: 1, c: 1, mKind: "VALUE" as const, m: 100, bigM: null };
    expect(wideToleranceNote(plan)).not.toBeNull();
    expect(judgeUnits(plan, [parseUnitReading("1.10⁴")]).official?.verdict).toBe("ACCEPTABLE");
  });
});

describe("kindChange / bigMChange — c never changes meaning silently on the grid", () => {
  const threeClass = { mKind: "VALUE" as const, c: "2", m: "10", bigM: "100" };

  it("clears c whenever the kind of limit changes", () => {
    // c = 2 between m = 10 and M = 100 must not become 2 units tolerated above M = 100.
    expect(kindChange(threeClass, "UNSPECIFIED")).toEqual({ mKind: "UNSPECIFIED", c: "", m: "" });
    expect(kindChange(threeClass, "ABSENCE")).toEqual({ mKind: "ABSENCE", c: "", m: "", bigM: "" });
    expect(kindChange({ mKind: "UNSPECIFIED", c: "1", m: "", bigM: "100" }, "VALUE")).toEqual({ mKind: "VALUE", c: "" });
    // Choosing the same kind again keeps everything.
    expect(kindChange(threeClass, "VALUE")).toEqual({ mKind: "VALUE" });
  });

  it("clears c when the M of a « m et M chiffrés » row is emptied, keeps it otherwise", () => {
    expect(bigMChange(threeClass, "")).toEqual({ bigM: "", c: "" });
    expect(bigMChange(threeClass, "  ")).toEqual({ bigM: "  ", c: "" });
    expect(bigMChange(threeClass, "1.10³")).toEqual({ bigM: "1.10³" });
    // m alone → three classes: c only tolerates less.
    expect(bigMChange({ ...threeClass, bigM: "" }, "1")).toEqual({ bigM: "1" });
    // « m non spécifiée »: without M the cell is closed and c not sent; it comes back with M.
    expect(bigMChange({ mKind: "UNSPECIFIED", c: "1", m: "", bigM: "100" }, "")).toEqual({ bigM: "" });
  });

  it("then saves what the engine judges as the admin sees it", () => {
    const switched = { ...threeClass, ...kindChange(threeClass, "UNSPECIFIED") };
    expect(validateCriterion({ parameterId: "p1", ...switched })).toMatchObject({ ok: true, value: { mKind: "UNSPECIFIED", m: null, bigM: 100, c: null } });
  });
});

describe("toleranceApplies", () => {
  it("opens c on a figure only", () => {
    expect(toleranceApplies("VALUE", true, true)).toBe(true);
    expect(toleranceApplies("VALUE", true, false)).toBe(true);
    expect(toleranceApplies("VALUE", false, false)).toBe(false);
    expect(toleranceApplies("UNSPECIFIED", false, true)).toBe(true);
    expect(toleranceApplies("UNSPECIFIED", false, false)).toBe(false);
    expect(toleranceApplies("ABSENCE", false, false)).toBe(false);
  });
});

describe("a limitless criterion in the interpretation engine", () => {
  // The validator accepts it because the engine already reads it as « no
  // verdict » — checked here so the two cannot drift apart.
  const plan = { n: 1, c: null, mKind: "UNSPECIFIED" as const, m: null, bigM: null };
  it("is analysed and printed, never judged", () => {
    expect(hasLimit(plan)).toBe(false);
    expect(planLabel(plan)).toBe("—");
    expect(judgeUnits(plan, [parseUnitReading("1,2.10²")])).toEqual({ official: null, informal: null });
    // An unread unit still keeps the sheet on the bench.
    expect(judgeUnits({ ...plan, n: 2 }, [parseUnitReading("12"), parseUnitReading("")]).official?.verdict).toBe("INCOMPLET");
  });
});
