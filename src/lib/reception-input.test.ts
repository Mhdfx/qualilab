import { describe, expect, it } from "vitest";
import { validateReception, type ReceptionCandidate } from "./reception-input";
import { DEFAULT_THRESHOLDS } from "./reception-rules";

const candidates: ReceptionCandidate[] = [
  {
    id: "s1",
    lineNumber: 1,
    status: "PRELEVE",
    lineKind: "ALIMENT",
    family: "MICRO",
    parameterNames: ["E. coli"],
    quantity: null,
    quantityUnit: null,
    receptionTemperature: null,
    unitCount: 5,
  },
  {
    id: "s2",
    lineNumber: 2,
    status: "PRELEVE",
    lineKind: "SURFACE",
    family: "MICRO",
    parameterNames: ["Flore totale"],
    quantity: null,
    quantityUnit: null,
    receptionTemperature: null,
    unitCount: 1,
  },
];

const good = {
  arrivedAt: "2026-09-13T10:30:00.000Z",
  coolerTemperature: "3,5",
  lines: [
    { sampleId: "s1", receptionTemperature: "4", quantity: "250", quantityUnit: "G", conformity: true, technicianId: "t1" },
    { sampleId: "s2", conformity: true, technicianId: "t1" },
  ],
};

const validate = (raw: unknown, blockNonConform = false) =>
  validateReception(raw, candidates, DEFAULT_THRESHOLDS, { blockNonConform });

describe("validateReception", () => {
  it("accepts a complete série and rounds the temperatures", () => {
    const result = validate(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coolerTemperature).toBe(3.5);
    expect(result.value.arrivedAt?.toISOString()).toBe("2026-09-13T10:30:00.000Z");
    expect(result.value.lines.map((l) => [l.lineNumber, l.receptionTemperature, l.quantity, l.quantityUnit])).toEqual([
      [1, 4, 250, "G"],
      [2, null, null, null],
    ]);
    expect(result.value.lines[0].checks.map((c) => c.level)).toEqual(["OK", "OK"]);
    expect(result.value.lines[1].analysisBlocked).toBe(false);
  });

  it("refuses a série already received and a line sent twice or missing", () => {
    const received = validateReception(good, candidates.map((c) => ({ ...c, status: "RECU" })), DEFAULT_THRESHOLDS, { blockNonConform: false });
    expect(received).toMatchObject({ ok: false, error: "Cette série est déjà réceptionnée." });

    const twice = validate({ ...good, lines: [good.lines[0], good.lines[0], good.lines[1]] });
    expect(twice).toMatchObject({ ok: false, lineNumber: 1 });

    const missing = validate({ ...good, lines: [good.lines[0]] });
    expect(missing).toMatchObject({ ok: false, lineNumber: 2 });
    if (!missing.ok) expect(missing.error).toContain("en une fois");

    const stranger = validate({ ...good, lines: [...good.lines, { sampleId: "zz", conformity: true }] });
    expect(stranger.ok).toBe(false);
  });

  it("re-runs the rules: a blocked line cannot be declared conform", () => {
    const noTemperature = validate({
      ...good,
      lines: [{ ...good.lines[0], receptionTemperature: "" }, good.lines[1]],
    });
    expect(noTemperature).toMatchObject({ ok: false, lineNumber: 1 });
    if (!noTemperature.ok) expect(noTemperature.error).toContain("Température à l'arrivée obligatoire");

    const declared = validate({
      ...good,
      lines: [
        { ...good.lines[0], receptionTemperature: "", conformity: false, conformityReason: "TEMPERATURE_MANQUANTE" },
        good.lines[1],
      ],
    });
    expect(declared.ok).toBe(true);
    if (declared.ok) {
      expect(declared.value.lines[0].conformityReason).toBe("TEMPERATURE_MANQUANTE");
      expect(declared.value.lines[0].checks.some((c) => c.level === "BLOQUANT")).toBe(true);
    }
  });

  it("needs a coded motif for a non-conformity, and a note when the motif is « autre »", () => {
    const noReason = validate({ ...good, lines: [{ ...good.lines[0], conformity: false }, good.lines[1]] });
    expect(noReason).toMatchObject({ ok: false, lineNumber: 1 });

    const other = validate({
      ...good,
      lines: [{ ...good.lines[0], conformity: false, conformityReason: "AUTRE" }, good.lines[1]],
    });
    expect(other).toMatchObject({ ok: false, lineNumber: 1 });

    const ok = validate({
      ...good,
      lines: [
        { ...good.lines[0], conformity: false, conformityReason: "AUTRE", conformityNote: "Sachet percé" },
        good.lines[1],
      ],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.lines[0]).toMatchObject({ conformityReason: "AUTRE", conformityNote: "Sachet percé" });
  });

  it("holds a non-conform line unassigned when the lab blocks them, otherwise requires a technician", () => {
    const line = { ...good.lines[0], conformity: false, conformityReason: "EMBALLAGE", technicianId: "" };
    const analysed = validate({ ...good, lines: [line, good.lines[1]] }, false);
    expect(analysed).toMatchObject({ ok: false, lineNumber: 1 });

    const held = validate({ ...good, lines: [line, good.lines[1]] }, true);
    expect(held.ok).toBe(true);
    if (held.ok) expect(held.value.lines[0]).toMatchObject({ analysisBlocked: true, technicianId: null });
  });

  it("rejects implausible numbers and a quantity without unit", () => {
    expect(validate({ ...good, coolerTemperature: "500" }).ok).toBe(false);
    expect(validate({ ...good, lines: [{ ...good.lines[0], quantity: "250", quantityUnit: "" }, good.lines[1]] })).toMatchObject({ ok: false, lineNumber: 1 });
    expect(validate({ ...good, arrivedAt: "pas une date" }).ok).toBe(false);
  });
});
