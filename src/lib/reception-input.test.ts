import { describe, expect, it } from "vitest";
import { sampleRef, validateReception, type ReceptionCandidate } from "./reception-input";
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
  // `technicianId`: what a page opened before 08/10 still sends — ignored (§9.3).
  lines: [
    { sampleId: "s1", receptionTemperature: "4", quantity: "250", quantityUnit: "G", conformity: true, technicianId: "t1" },
    { sampleId: "s2", conformity: true, technicianId: "t1" },
  ],
};

const validate = (raw: unknown) => validateReception(raw, candidates, DEFAULT_THRESHOLDS);

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
    expect(result.value.lines[1].destroy).toBe(false);
  });

  it("refuses a série already received and a line sent twice or missing", () => {
    const received = validateReception(good, candidates.map((c) => ({ ...c, status: "RECU" })), DEFAULT_THRESHOLDS);
    expect(received).toMatchObject({ ok: false, error: "Cette série est déjà réceptionnée." });

    const twice = validate({ ...good, lines: [good.lines[0], good.lines[0], good.lines[1]] });
    expect(twice).toMatchObject({ ok: false, lineNumber: 1 });

    if (!twice.ok) expect(twice.error).toBe("L'échantillon 1 est envoyé deux fois.");

    const missing = validate({ ...good, lines: [good.lines[0]] });
    expect(missing).toMatchObject({
      ok: false,
      lineNumber: 2,
      error: "L'échantillon 2 n'est pas renseigné — la série se réceptionne en une fois.",
    });

    const stranger = validate({ ...good, lines: [...good.lines, { sampleId: "zz", conformity: true }] });
    expect(stranger).toMatchObject({ ok: false, error: "Un échantillon envoyé n'appartient pas à cette série." });
  });

  it("re-runs the rules: a blocked line cannot be declared conform", () => {
    const noTemperature = validate({
      ...good,
      lines: [{ ...good.lines[0], receptionTemperature: "" }, good.lines[1]],
    });
    expect(noTemperature).toMatchObject({ ok: false, lineNumber: 1 });
    if (!noTemperature.ok) {
      expect(noTemperature.error).toContain("Échantillon 1 : Température à l'arrivée obligatoire");
      expect(noTemperature.error).toContain("L'échantillon ne peut pas être déclaré conforme.");
    }

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
    expect(noReason).toMatchObject({ ok: false, lineNumber: 1, error: "Échantillon 1 : choisissez le motif de non-conformité." });

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

  it("never takes a technician — the responsable des paramètres assigns (RETOUR-LABO-06-10 §9.3)", () => {
    // A page opened before the change still sends one: the reception goes
    // through, and the technician is dropped, never refused.
    const sent = validate(good);
    expect(sent.ok).toBe(true);
    if (sent.ok) {
      for (const line of sent.value.lines) expect(line).not.toHaveProperty("technicianId");
    }
    const unknown = validate({ ...good, lines: [{ ...good.lines[0], technicianId: "pas-un-technicien" }, good.lines[1]] });
    expect(unknown.ok && unknown.value.lines[0]).not.toHaveProperty("technicianId");

    const none = validate({ ...good, lines: [{ ...good.lines[0], technicianId: undefined }, { sampleId: "s2", conformity: true }] });
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.value.lines[0]).toMatchObject({ conformity: true, destroy: false });
  });

  it("decides a non-conform line case by case: analysed anyway, or destroyed", () => {
    const line = { ...good.lines[0], conformity: false, conformityReason: "EMBALLAGE" };
    // Analysed anyway (the default) waits for its technician at the programme.
    const analysed = validate({ ...good, lines: [line, good.lines[1]] });
    expect(analysed.ok && analysed.value.lines[0]).toMatchObject({ destroy: false });
    const explicit = validate({ ...good, lines: [{ ...line, decision: "ANALYSER" }, good.lines[1]] });
    expect(explicit.ok && explicit.value.lines[0]).toMatchObject({ destroy: false });

    const destroyed = validate({ ...good, lines: [{ ...line, decision: "DETRUIRE" }, good.lines[1]] });
    expect(destroyed.ok && destroyed.value.lines[0]).toMatchObject({ destroy: true });
    expect(destroyed.ok && destroyed.value.lines[0]).not.toHaveProperty("technicianId");

    // A conform sample cannot be destroyed; an unknown decision is refused.
    expect(validate({ ...good, lines: [{ ...good.lines[0], decision: "DETRUIRE" }, good.lines[1]] })).toMatchObject({
      ok: false,
      lineNumber: 1,
      error: "Échantillon 1 : seul un échantillon non conforme peut être détruit.",
    });
    expect(validate({ ...good, lines: [{ ...line, decision: "BLOQUER" }, good.lines[1]] })).toMatchObject({ ok: false, lineNumber: 1 });
  });

  it("rejects implausible numbers and a quantity without unit", () => {
    expect(validate({ ...good, coolerTemperature: "500" }).ok).toBe(false);
    expect(validate({ ...good, lines: [{ ...good.lines[0], quantity: "250", quantityUnit: "" }, good.lines[1]] })).toMatchObject({
      ok: false,
      lineNumber: 1,
      error: "Échantillon 1 : précisez l'unité de la quantité.",
    });
    expect(validate({ ...good, arrivedAt: "pas une date" }).ok).toBe(false);
  });
});

describe("sampleRef — the sample named by its line, and its letter", () => {
  it("reads « M » / « P » from the code of a two-family line", () => {
    expect(sampleRef(3, "1/26-3M")).toBe("3M");
    expect(sampleRef(3, "1/26-3P")).toBe("3P");
    expect(sampleRef(3, "1/26-3")).toBe("3");
    // Older codes and a code of another line keep the bare number.
    expect(sampleRef(3, "QL-0042")).toBe("3");
    expect(sampleRef(2, "1/26-12M")).toBe("2");
    expect(sampleRef(4)).toBe("4");
  });
});

describe("validateReception — the two samples of a two-family line (RETOUR-LABO-06-10 §5, V3)", () => {
  const twins: ReceptionCandidate[] = [
    { ...candidates[0], id: "m", code: "1/26-1M", family: "MICRO" },
    { ...candidates[0], id: "p", code: "1/26-1P", family: "CHIMIE" },
  ];
  const line = { receptionTemperature: "4", quantityUnit: "G", conformity: true };

  it("receives each one on its own, microbiology first, and names them by their letter", () => {
    const result = validateReception(
      { lines: [{ ...line, sampleId: "p", quantity: "300" }, { ...line, sampleId: "m", quantity: "100" }] },
      twins,
      DEFAULT_THRESHOLDS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines.map((l) => [l.sampleId, l.lineNumber, l.ref])).toEqual([
      ["m", 1, "1M"],
      ["p", 1, "1P"],
    ]);
  });

  it("applies each family's own minimum and names the right sample", () => {
    // 250 g is enough for microbiology (100 g), not for physico-chemistry (300 g).
    const short = validateReception(
      { lines: [{ ...line, sampleId: "m", quantity: "250" }, { ...line, sampleId: "p", quantity: "250" }] },
      twins,
      DEFAULT_THRESHOLDS
    );
    expect(short).toMatchObject({ ok: false, lineNumber: 1, ref: "1P" });
    if (!short.ok) expect(short.error).toMatch(/^Échantillon 1P : Quantité 250 g < 300 g requis\./);

    const missing = validateReception({ lines: [{ ...line, sampleId: "m", quantity: "250" }] }, twins, DEFAULT_THRESHOLDS);
    expect(missing).toMatchObject({
      ok: false,
      lineNumber: 1,
      ref: "1P",
      error: "L'échantillon 1P n'est pas renseigné — la série se réceptionne en une fois.",
    });
  });
});
