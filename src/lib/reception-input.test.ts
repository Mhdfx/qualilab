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
    productNames: ["Salade composée", null, "Microbiologie des aliments"],
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
    productNames: ["Planche verte", null, "Microbiologie des surfaces"],
  },
];

const good = {
  arrivedAt: "2026-09-13T10:30:00.000Z",
  coolerTemperature: "3,5",
  // `technicianId`: what a page opened before 08/10 still sends — ignored (§9.3).
  lines: [
    { sampleId: "s1", receptionTemperature: "4", quantity: "250", quantityUnit: "G", exploitable: true, identificationOk: true, conformity: true, technicianId: "t1" },
    // A surface needs its temperature at arrival too since the answer of 12/10.
    { sampleId: "s2", receptionTemperature: "5", exploitable: true, identificationOk: true, conformity: true, technicianId: "t1" },
  ],
};

/** The série's sampling: 08:00 → 09:30 UTC, the arrival above at 10:30. */
const times = { startedAt: new Date("2026-09-13T08:00:00.000Z"), endedAt: new Date("2026-09-13T09:30:00.000Z") };
/** Received at 11:00 the same day — within C1's 24 h when no arrival is typed. */
const sameDay = { ...times, receivedAt: new Date("2026-09-13T11:00:00.000Z") };

const validate = (raw: unknown) => validateReception(raw, candidates, DEFAULT_THRESHOLDS, times);

/** Every line justified (A7): a doubt accepted conforme carries an observation. */
const justified = <T extends { lines: object[] }>(raw: T, note = "Accepté après contrôle visuel du responsable") => ({
  ...raw,
  lines: raw.lines.map((line) => ({ ...line, receptionNote: note })),
});

describe("validateReception", () => {
  it("accepts a complete série and rounds the temperatures", () => {
    const result = validate(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coolerTemperature).toBe(3.5);
    expect(result.value.arrivedAt?.toISOString()).toBe("2026-09-13T10:30:00.000Z");
    expect(result.value.lines.map((l) => [l.lineNumber, l.receptionTemperature, l.quantity, l.quantityUnit])).toEqual([
      [1, 4, 250, "G"],
      [2, 5, null, null],
    ]);
    expect(result.value.lines[0].checks.map((c) => c.level)).toEqual(["OK", "OK"]);
    expect(result.value.lines[1].destroy).toBe(false);
    // The eight rules travel with each line, for the audit (rule (8) since 12/10).
    expect(result.value.lines[0].checklist.map((r) => [r.n, r.status])).toEqual([
      [1, "CONFORME"],
      [2, "CONFORME"],
      [3, "SANS_OBJET"],
      [4, "SANS_OBJET"],
      [5, "SANS_OBJET"],
      [6, "CONFORME"],
      [7, "SANS_OBJET"],
      [8, "SANS_OBJET"],
    ]);
    expect(result.value.lines[1].checklist).toHaveLength(8);
    expect(result.value.lines.map((l) => l.exploitable)).toEqual([true, true]);
  });

  it("refuses a série already received and a line sent twice or missing", () => {
    const received = validateReception(good, candidates.map((c) => ({ ...c, status: "RECU" })), DEFAULT_THRESHOLDS, times);
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

    const stranger = validate({ ...good, lines: [...good.lines, { ...good.lines[1], sampleId: "zz" }] });
    expect(stranger).toMatchObject({ ok: false, error: "Un échantillon envoyé n'appartient pas à cette série." });
  });

  it("tells a page out of date that a sample was cancelled meanwhile (« Non reçu »), and receives the others without it", () => {
    const cancelled = candidates.map((c) => (c.id === "s2" ? { ...c, status: "ANNULE" as const } : c));
    expect(validateReception(good, cancelled, DEFAULT_THRESHOLDS, times)).toMatchObject({
      ok: false,
      lineNumber: 2,
      error: "L'échantillon 2 est annulé : rechargez la page pour réceptionner les autres.",
    });
    // The page refreshed: the cancelled sample is no longer sent, nor missing.
    const rest = validateReception({ ...good, lines: [good.lines[0]] }, cancelled, DEFAULT_THRESHOLDS, times);
    expect(rest.ok).toBe(true);
    if (rest.ok) expect(rest.value.lines.map((l) => l.sampleId)).toEqual(["s1"]);
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

  it("never takes a technician — one takes the sample from « À prendre » (RETOUR-LABO-06-10 §9.3, PROGRAMME.md §10)", () => {
    // A page opened before the change still sends one: the reception goes
    // through, and the technician is dropped, never refused.
    const sent = validate(good);
    expect(sent.ok).toBe(true);
    if (sent.ok) {
      for (const line of sent.value.lines) expect(line).not.toHaveProperty("technicianId");
    }
    const unknown = validate({ ...good, lines: [{ ...good.lines[0], technicianId: "pas-un-technicien" }, good.lines[1]] });
    expect(unknown.ok && unknown.value.lines[0]).not.toHaveProperty("technicianId");

    const none = validate({ ...good, lines: [{ ...good.lines[0], technicianId: undefined }, { ...good.lines[1], technicianId: undefined }] });
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.value.lines[0]).toMatchObject({ conformity: true, destroy: false });
  });

  it("decides a non-conform line case by case: analysed anyway, or destroyed", () => {
    const line = { ...good.lines[0], conformity: false, conformityReason: "EMBALLAGE" };
    // Analysed anyway (the default): programmed, then taken from « À prendre ».
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

describe("validateReception — rule (1), exploitable or not (retour du 08/10)", () => {
  it("refuses a line without the answer — what a page opened before the checklist sends", () => {
    const oldTab = { sampleId: "s1", receptionTemperature: "4", quantity: "250", quantityUnit: "G", packagingOk: true, identificationOk: true, conformity: true };
    expect(validate({ ...good, lines: [oldTab, good.lines[1]] })).toEqual({
      ok: false,
      error: "Échantillon 1 : indiquez s'il est exploitable (règle 1). Si les boutons « Exploitable » / « Non exploitable » n'apparaissent pas, rechargez la page.",
      lineNumber: 1,
      ref: "1",
    });
    expect(validate({ ...good, lines: [good.lines[0], { ...good.lines[1], exploitable: "oui" }] })).toMatchObject({
      ok: false,
      lineNumber: 2,
      error: "Échantillon 2 : indiquez s'il est exploitable (règle 1). Si les boutons « Exploitable » / « Non exploitable » n'apparaissent pas, rechargez la page.",
    });
  });

  it("never declares a non-exploitable sample conform", () => {
    expect(validate({ ...good, lines: [{ ...good.lines[0], exploitable: false }, good.lines[1]] })).toEqual({
      ok: false,
      error: "Échantillon 1 : un échantillon non exploitable ne peut pas être déclaré conforme (règle 1).",
      lineNumber: 1,
      ref: "1",
    });
  });

  it("accepts the motif « non exploitable », analysed anyway or destroyed", () => {
    const line = { ...good.lines[0], exploitable: false, conformity: false, conformityReason: "NON_EXPLOITABLE" };
    const result = validate({ ...good, lines: [{ ...line, decision: "DETRUIRE" }, good.lines[1]] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]).toMatchObject({
      exploitable: false,
      conformity: false,
      conformityReason: "NON_EXPLOITABLE",
      destroy: true,
    });
    expect(result.value.lines[0].checklist[0]).toMatchObject({ n: 1, status: "NON_CONFORME", reason: "NON_EXPLOITABLE" });
    // Another motif may be chosen for a non-exploitable sample.
    expect(validate({ ...good, lines: [{ ...line, conformityReason: "EMBALLAGE" }, good.lines[1]] }).ok).toBe(true);
  });

  it("refuses the motif « non exploitable » on a sample answered exploitable", () => {
    expect(
      validate({
        ...good,
        lines: [{ ...good.lines[0], conformity: false, conformityReason: "NON_EXPLOITABLE" }, good.lines[1]],
      })
    ).toMatchObject({
      ok: false,
      lineNumber: 1,
      error: "Échantillon 1 : le motif « non exploitable » ne va pas avec la réponse « Exploitable » (règle 1).",
    });
  });

  it("keeps refusing a conform sample under a blocking rule, with the laboratory's thresholds", () => {
    const strict = { ...DEFAULT_THRESHOLDS, minFoodMicroG: 300 };
    const result = validateReception(good, candidates, strict, times);
    expect(result).toMatchObject({ ok: false, lineNumber: 1 });
    if (!result.ok) expect(result.error).toBe("Échantillon 1 : Quantité 250 g < 300 g requis. L'échantillon ne peut pas être déclaré conforme.");
  });

  it("recognises histamine under an alias of the requested analysis", () => {
    const fish: ReceptionCandidate[] = [
      { ...candidates[0], family: "CHIMIE", unitCount: 9, parameterNames: ["Amine biogène test", "Histamine HPLC"] },
    ];
    const result = validateReception(
      { lines: [{ ...good.lines[0], quantity: "450" }] },
      fish,
      DEFAULT_THRESHOLDS,
      times
    );
    // 450 g meets rule (3) (300 g) but not rule (7) (9 × 100 g).
    expect(result).toMatchObject({ ok: false, lineNumber: 1 });
    if (!result.ok) expect(result.error).toContain("Poids par unité 50 g < 100 g requis.");
  });
});

describe("validateReception — the arrival never precedes the sampling (A2)", () => {
  it("refuses an arrival before the end of the sampling", () => {
    expect(validate({ ...good, arrivedAt: "2026-09-13T09:00:00.000Z" })).toEqual({
      ok: false,
      error: "L'arrivée au laboratoire précède la fin du prélèvement.",
    });
  });

  it("refuses an arrival before the start when no end was typed", () => {
    const open = { startedAt: times.startedAt, endedAt: null };
    expect(validateReception({ ...good, arrivedAt: "2026-09-13T07:59:00.000Z" }, candidates, DEFAULT_THRESHOLDS, open)).toEqual({
      ok: false,
      error: "L'arrivée au laboratoire précède le prélèvement.",
    });
    expect(validateReception({ ...good, arrivedAt: "2026-09-13T08:00:00.000Z" }, candidates, DEFAULT_THRESHOLDS, open).ok).toBe(true);
  });

  it("accepts an arrival equal to the end, and no arrival at all (the reception instant)", () => {
    const equal = validate({ ...good, arrivedAt: "2026-09-13T09:30:00.000Z" });
    expect(equal.ok && equal.value.arrivedAt?.toISOString()).toBe("2026-09-13T09:30:00.000Z");
    const none = validateReception({ ...good, arrivedAt: "" }, candidates, DEFAULT_THRESHOLDS, sameDay);
    expect(none.ok && none.value.arrivedAt).toBeNull();
  });
});

describe("validateReception — the contrôle complémentaire C5 (C3 retired on 16/10, Q70)", () => {
  it("refuses a line without the C5 tick — what a page opened before the controls sends", () => {
    const { identificationOk: answered, ...noIdentification } = good.lines[1];
    expect(answered).toBe(true);
    expect(validate({ ...good, lines: [good.lines[0], noIdentification] })).toEqual({
      ok: false,
      error: "Échantillon 2 : indiquez si l'identification est conforme à la fiche (rechargez la page si elle date d'avant la mise à jour).",
      lineNumber: 2,
      ref: "2",
    });
    expect(validate({ ...good, lines: [good.lines[0], { ...good.lines[1], identificationOk: "oui" }] })).toMatchObject({
      ok: false,
      lineNumber: 2,
    });
  });

  it("no longer asks the packaging: a line without it is received", () => {
    const result = validate(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]).not.toHaveProperty("packagingOk");
  });

  it("ignores — never refuses — the packaging answer of a page opened before 16/10, « Non » included", () => {
    for (const packagingOk of [true, false, "oui", null]) {
      const result = validate({ ...good, lines: [{ ...good.lines[0], packagingOk }, good.lines[1]] });
      expect(result.ok, String(packagingOk)).toBe(true);
      if (!result.ok) continue;
      // « Non » no longer forces « non conforme »: the line stays conform.
      expect(result.value.lines[0]).toMatchObject({ conformity: true, conformityReason: null });
      expect(result.value.lines[0]).not.toHaveProperty("packagingOk");
    }
  });

  it("never declares conform a sample whose C5 says « Non »", () => {
    const refused = validate({ ...good, lines: [good.lines[0], { ...good.lines[1], identificationOk: false }] });
    expect(refused).toMatchObject({ ok: false, lineNumber: 2, ref: "2" });
    if (!refused.ok) {
      expect(refused.error).toBe(
        "Échantillon 2 : Contrôle C5 « Identification lisible et conforme à la fiche (désignation, lot, DLC) » non conforme — corriger la fiche avant de valider. L'échantillon ne peut pas être déclaré conforme."
      );
    }
  });

  it("keeps the motif « Emballage ou contenant non conforme » for a container judged by hand, and audits the coded rows", () => {
    const result = validate({
      ...good,
      lines: [{ ...good.lines[0], conformity: false, conformityReason: "EMBALLAGE", conformityNote: "Sachet percé" }, good.lines[1]],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]).toMatchObject({ identificationOk: true, conformity: false, conformityReason: "EMBALLAGE" });
    expect(result.value.lines[0].checklist).toHaveLength(8);
    expect(result.value.lines[0].complementary.map((row) => [row.code, row.status])).toEqual([
      ["C1", "CONFORME"],
      ["C2", "CONFORME"],
      ["C5", "CONFORME"],
      // Food without a DLC.
      ["C7", "SANS_OBJET"],
    ]);
  });
});

describe("validateReception — C2, température de transport", () => {
  const c2 = (result: ReturnType<typeof validate>, index = 0) =>
    result.ok ? result.value.lines[index].complementary.find((row) => row.code === "C2") : undefined;

  it("accepts an older page without a source or a class: the value alone, the kind's default", () => {
    const result = validate(good);
    expect(result.ok && result.value.lines[0]).toMatchObject({ temperatureSource: null, storageClass: null });
    expect(c2(result)).toMatchObject({ status: "CONFORME", detail: "4 °C, réfrigéré entre 0 et 8 °C" });
    // Rule (6) keeps the value without a source.
    expect(result.ok && result.value.lines[0].checklist[5].detail).toBe("4 °C");
  });

  it("keeps where the temperature was read — « (glacière) » is back on rule (6) and on C2", () => {
    const result = validate({ ...good, lines: [{ ...good.lines[0], receptionTemperatureSource: "GLACIERE" }, good.lines[1]] });
    expect(result.ok && result.value.lines[0].temperatureSource).toBe("GLACIERE");
    expect(result.ok && result.value.lines[0].checklist[5].detail).toBe("4 °C (glacière)");
    expect(c2(result)?.detail).toBe("4 °C, réfrigéré entre 0 et 8 °C (glacière)");
    // No temperature, no source (on a kind whose temperature the laboratory made optional).
    const optional = { ...DEFAULT_THRESHOLDS, temperatureRequiredKinds: "ALIMENT,EAU" };
    const none = validateReception(
      { ...good, lines: [good.lines[0], { ...good.lines[1], receptionTemperature: "", receptionTemperatureSource: "ECHANTILLON" }] },
      candidates,
      optional,
      times
    );
    expect(none.ok && none.value.lines[1].temperatureSource).toBeNull();
  });

  it("judges by the class chosen, never refusing", () => {
    const frozen = validate(justified({ ...good, lines: [{ ...good.lines[0], storageClass: "CONGELE" }, good.lines[1]] }));
    expect(frozen.ok && frozen.value.lines[0].storageClass).toBe("CONGELE");
    expect(c2(frozen)).toMatchObject({ status: "A_VERIFIER", reason: "CHAINE_FROID" });
  });

  it("refuses an unknown class or source", () => {
    expect(validate({ ...good, lines: [{ ...good.lines[0], storageClass: "TIEDE" }, good.lines[1]] })).toMatchObject({
      ok: false,
      lineNumber: 1,
      error: "Échantillon 1 : classe de conservation inconnue.",
    });
    expect(validate({ ...good, lines: [{ ...good.lines[0], receptionTemperatureSource: "THERMOMETRE" }, good.lines[1]] })).toMatchObject({
      ok: false,
      error: "Échantillon 1 : origine de la température inconnue.",
    });
  });
});

describe("validateReception — C7, DLC", () => {
  it("warns on a food sample past its DLC, never refuses it", () => {
    const dated: ReceptionCandidate[] = [{ ...candidates[0], expiryDate: new Date("2026-09-12T00:00:00.000Z") }, candidates[1]];
    const result = validateReception(justified(good), dated, DEFAULT_THRESHOLDS, { ...times, receivedAt: new Date("2026-09-13T10:40:00.000Z") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0].complementary.find((row) => row.code === "C7")).toMatchObject({
      status: "A_VERIFIER",
      detail: "DLC dépassée le 12/09/2026",
    });
    // The surface has no C7 row.
    expect(result.value.lines[1].complementary.some((row) => row.code === "C7")).toBe(false);
  });
});

describe("validateReception — C1, délai prélèvement → laboratoire", () => {
  const c1 = (result: ReturnType<typeof validate>, index = 0) =>
    result.ok ? result.value.lines[index].complementary.find((row) => row.code === "C1") : undefined;

  it("counts from the end of the sampling to the arrival typed, else the série's, else the reception instant", () => {
    expect(c1(validate(good))).toMatchObject({ status: "CONFORME", detail: "Délai 1 h" });
    const stored = { ...times, arrivedAt: new Date("2026-09-13T11:30:00.000Z") };
    expect(c1(validateReception({ ...good, arrivedAt: "" }, candidates, DEFAULT_THRESHOLDS, stored))).toMatchObject({ detail: "Délai 2 h" });
    const atReception = { ...times, receivedAt: new Date("2026-09-14T12:00:00.000Z") };
    expect(c1(validateReception(justified({ ...good, arrivedAt: "" }), candidates, DEFAULT_THRESHOLDS, atReception))).toMatchObject({
      status: "A_VERIFIER",
      reason: "DELAI",
      detail: "Délai 26 h 30 > 24 h",
    });
  });

  it("refuses « conforme » past the limit only when the laboratory makes the delay blocking", () => {
    const late = { ...times, receivedAt: new Date("2026-09-14T12:00:00.000Z") };
    expect(validateReception(justified({ ...good, arrivedAt: "" }), candidates, DEFAULT_THRESHOLDS, late).ok).toBe(true);
    // Blocking: refused even with an observation — a NON_CONFORME row is not a doubt.
    const blocking = validateReception(justified({ ...good, arrivedAt: "" }), candidates, { ...DEFAULT_THRESHOLDS, delayBlocking: true }, late);
    expect(blocking).toMatchObject({ ok: false, lineNumber: 1 });
    if (!blocking.ok) expect(blocking.error).toMatch(/^Échantillon 1 : Contrôle C1 « Délai prélèvement → laboratoire » non conforme — délai 26 h 30 > 24 h\./);
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
  const line = { receptionTemperature: "4", quantityUnit: "G", exploitable: true, identificationOk: true, conformity: true };

  it("receives each one on its own, microbiology first, and names them by their letter", () => {
    const result = validateReception(
      { lines: [{ ...line, sampleId: "p", quantity: "300" }, { ...line, sampleId: "m", quantity: "100" }] },
      twins,
      DEFAULT_THRESHOLDS,
      sameDay
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
      DEFAULT_THRESHOLDS,
      sameDay
    );
    expect(short).toMatchObject({ ok: false, lineNumber: 1, ref: "1P" });
    if (!short.ok) expect(short.error).toMatch(/^Échantillon 1P : Quantité 250 g < 300 g requis\./);

    const missing = validateReception({ lines: [{ ...line, sampleId: "m", quantity: "250" }] }, twins, DEFAULT_THRESHOLDS, sameDay);
    expect(missing).toMatchObject({
      ok: false,
      lineNumber: 1,
      ref: "1P",
      error: "L'échantillon 1P n'est pas renseigné — la série se réceptionne en une fois.",
    });
  });
});

describe("validateReception — C6, the signed protocol answered for the série (A6)", () => {
  const visit = { ...times, kind: "VISITE" as const, hasSignedProtocol: false };

  it("stores a visit's answer when no photo is attached — Oui or Non", () => {
    const yes = validateReception({ ...good, signedProtocolReceived: true }, candidates, DEFAULT_THRESHOLDS, visit);
    expect(yes.ok && yes.value.signedProtocolReceived).toBe(true);
    const no = validateReception({ ...good, signedProtocolReceived: false }, candidates, DEFAULT_THRESHOLDS, visit);
    expect(no.ok && no.value.signedProtocolReceived).toBe(false);
  });

  it("stores nothing without an answer, with a photo, or on a deposit", () => {
    const none = validateReception(good, candidates, DEFAULT_THRESHOLDS, visit);
    expect(none.ok && none.value.signedProtocolReceived).toBeNull();
    const nulled = validateReception({ ...good, signedProtocolReceived: null }, candidates, DEFAULT_THRESHOLDS, visit);
    expect(nulled.ok && nulled.value.signedProtocolReceived).toBeNull();
    const photo = validateReception(
      { ...good, signedProtocolReceived: false },
      candidates,
      DEFAULT_THRESHOLDS,
      { ...visit, hasSignedProtocol: true }
    );
    expect(photo.ok && photo.value.signedProtocolReceived).toBeNull();
    const deposit = validateReception({ ...good, signedProtocolReceived: true }, candidates, DEFAULT_THRESHOLDS, {
      ...visit,
      kind: "DEPOT",
    });
    expect(deposit.ok && deposit.value.signedProtocolReceived).toBeNull();
  });

  it("never weighs on the samples: « Non » leaves them conform", () => {
    const result = validateReception({ ...good, signedProtocolReceived: false }, candidates, DEFAULT_THRESHOLDS, visit);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.lines.map((line) => line.conformity)).toEqual([true, true]);
  });

  it("refuses an answer that is neither Oui, Non nor nothing", () => {
    expect(validateReception({ ...good, signedProtocolReceived: "oui" }, candidates, DEFAULT_THRESHOLDS, visit)).toEqual({
      ok: false,
      error: "Réponse invalide pour le protocole signé (C6).",
    });
  });
});

describe("validateReception — « Observation de réception », the justification of an accepted doubt (A7)", () => {
  /** Line 1 weighed nothing: rule (2) « à vérifier » (quantity not given). */
  const unweighed = { ...good.lines[0], quantity: "", quantityUnit: "" };

  it("refuses a doubt accepted conforme without an observation, naming the first doubtful row", () => {
    expect(validate({ ...good, lines: [unweighed, good.lines[1]] })).toEqual({
      ok: false,
      error:
        "Échantillon 1 : justifiez l'acceptation (règle 2 à vérifier).",
      lineNumber: 1,
      ref: "1",
    });
  });

  it("names a contrôle complémentaire by its code — the message of the plan", () => {
    const frozen = validate({ ...good, lines: [good.lines[0], good.lines[1]].map((line, i) => (i === 0 ? { ...line, storageClass: "CONGELE" } : line)) });
    expect(frozen).toMatchObject({
      ok: false,
      lineNumber: 1,
      error: "Échantillon 1 : justifiez l'acceptation (C2 Température de transport à vérifier).",
    });
  });

  it("accepts the doubt once justified, and keeps the observation", () => {
    const result = validate({ ...good, lines: [{ ...unweighed, receptionNote: "  Balance en panne, poids estimé > 100 g  " }, good.lines[1]] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines[0].receptionNote).toBe("Balance en panne, poids estimé > 100 g");
      expect(result.value.lines[1].receptionNote).toBeNull();
    }
  });

  it("asks nothing of a sample without doubt, nor of a non-conform one — the observation stays optional", () => {
    const clean = validate({ ...good, lines: [{ ...good.lines[0], receptionNote: "Emballage légèrement humide" }, good.lines[1]] });
    expect(clean.ok && clean.value.lines[0].receptionNote).toBe("Emballage légèrement humide");
    const nonConform = validate({
      ...good,
      lines: [{ ...unweighed, conformity: false, conformityReason: "QUANTITE_INSUFFISANTE" }, good.lines[1]],
    });
    expect(nonConform.ok).toBe(true);
  });

  it("refuses an observation over 1 000 characters", () => {
    expect(validate({ ...good, lines: [{ ...good.lines[0], receptionNote: "x".repeat(1001) }, good.lines[1]] })).toMatchObject({
      ok: false,
      lineNumber: 1,
      error: "Échantillon 1 : l'observation de réception dépasse 1 000 caractères.",
    });
    expect(validate({ ...good, lines: [{ ...good.lines[0], receptionNote: "x".repeat(1000) }, good.lines[1]] }).ok).toBe(true);
  });
});

describe("validateReception — analyse with the client's agreement, or wait for the client (A9)", () => {
  /** Line 1 non conforme: its container, the motif chosen by hand. */
  const nonConform = { ...good.lines[0], conformity: false, conformityReason: "EMBALLAGE" };
  const agreement = { name: "M. Exemple", channel: "TELEPHONE", at: "2026-09-13T10:45:00.000Z", note: "Analyse demandée" };

  it("keeps the 29/09 behaviour when nobody uses the new options", () => {
    const result = validate({ ...good, lines: [nonConform, good.lines[1]] });
    expect(result.ok && result.value.lines[0]).toMatchObject({
      decision: "ANALYSER",
      destroy: false,
      awaitClient: false,
      consultation: null,
    });
    const destroyed = validate({ ...good, lines: [{ ...nonConform, decision: "DETRUIRE" }, good.lines[1]] });
    expect(destroyed.ok && destroyed.value.lines[0]).toMatchObject({ decision: "DETRUIRE", destroy: true, awaitClient: false });
  });

  it("holds a non-conform sample « en attente du client », never a conform one", () => {
    const waiting = validate({ ...good, lines: [{ ...nonConform, decision: "EN_ATTENTE_CLIENT" }, good.lines[1]] });
    expect(waiting.ok && waiting.value.lines[0]).toMatchObject({
      decision: "EN_ATTENTE_CLIENT",
      awaitClient: true,
      destroy: false,
      consultation: null,
    });
    expect(validate({ ...good, lines: [{ ...good.lines[0], decision: "EN_ATTENTE_CLIENT" }, good.lines[1]] })).toEqual({
      ok: false,
      error: "Échantillon 1 : seul un échantillon non conforme peut attendre l'avis du client.",
      lineNumber: 1,
      ref: "1",
    });
  });

  it("records the client's agreement on a non-conform sample analysed anyway — ignored otherwise", () => {
    const agreed = validateReception(
      { ...good, lines: [{ ...nonConform, consultation: agreement }, good.lines[1]] },
      candidates,
      DEFAULT_THRESHOLDS,
      sameDay
    );
    expect(agreed.ok && agreed.value.lines[0].consultation).toEqual({
      name: "M. Exemple",
      channel: "TELEPHONE",
      at: new Date("2026-09-13T10:45:00.000Z"),
      note: "Analyse demandée",
    });
    // A conform sample, a wait or a destruction carries no agreement.
    const conform = validate({ ...good, lines: [{ ...good.lines[0], consultation: agreement }, good.lines[1]] });
    expect(conform.ok && conform.value.lines[0].consultation).toBeNull();
    const waiting = validate({ ...good, lines: [{ ...nonConform, decision: "EN_ATTENTE_CLIENT", consultation: agreement }, good.lines[1]] });
    expect(waiting.ok && waiting.value.lines[0].consultation).toBeNull();
  });

  it("refuses a half agreement, named on the sample", () => {
    expect(validate({ ...good, lines: [{ ...nonConform, consultation: { name: "M. Exemple" } }, good.lines[1]] })).toEqual({
      ok: false,
      error: "Échantillon 1 : pour l'accord du client, indiquez le nom de la personne consultée et le canal.",
      lineNumber: 1,
      ref: "1",
    });
  });

  it("requires the agreement to analyse a non-conform sample when the laboratory says so", () => {
    const required = { consultationRequired: true };
    expect(validateReception({ ...good, lines: [nonConform, good.lines[1]] }, candidates, DEFAULT_THRESHOLDS, sameDay, required)).toEqual({
      ok: false,
      error:
        "Échantillon 1 : l'accord du client est obligatoire pour analyser un échantillon non conforme : indiquez le nom de la personne consultée et le canal.",
      lineNumber: 1,
      ref: "1",
    });
    const agreed = { ...good, lines: [{ ...nonConform, consultation: agreement }, good.lines[1]] };
    expect(validateReception(agreed, candidates, DEFAULT_THRESHOLDS, sameDay, required).ok).toBe(true);
    // Waiting for the client, destroying, or a conform série need no agreement.
    for (const decision of ["EN_ATTENTE_CLIENT", "DETRUIRE"]) {
      const raw = { ...good, lines: [{ ...nonConform, decision }, good.lines[1]] };
      expect(validateReception(raw, candidates, DEFAULT_THRESHOLDS, sameDay, required).ok).toBe(true);
    }
    expect(validateReception(good, candidates, DEFAULT_THRESHOLDS, times, required).ok).toBe(true);
  });
});

describe("validateReception — the laboratory's answers of 12/10", () => {
  const food = candidates[0];
  const accepted = { sampleId: "s1", quantityUnit: "G", exploitable: true, identificationOk: true, conformity: true };
  const surface = good.lines[1];

  it("a stable food (« Ambiant ») is received without a temperature; the default class still needs one", () => {
    const stable = validateReception(
      { lines: [{ ...accepted, quantity: "250", storageClass: "AMBIANT" }, surface] },
      candidates,
      DEFAULT_THRESHOLDS,
      sameDay
    );
    expect(stable.ok).toBe(true);
    if (stable.ok) {
      expect(stable.value.lines[0].checklist.find((r) => r.n === 6)).toMatchObject({
        status: "SANS_OBJET",
        detail: "Sans objet : aliment stable (conservé à température ambiante)",
      });
      expect(stable.value.lines[0].storageClass).toBe("AMBIANT");
    }
    // Same line on its default (chilled) class: the temperature is missing.
    expect(
      validateReception({ lines: [{ ...accepted, quantity: "250" }, surface] }, candidates, DEFAULT_THRESHOLDS, sameDay)
    ).toMatchObject({ ok: false, ref: "1", error: expect.stringMatching(/^Échantillon 1 : Température à l'arrivée obligatoire pour un produit alimentaire\./) });
    // A surface stays required, whatever its class.
    expect(
      validateReception(
        { lines: [{ ...accepted, quantity: "250", receptionTemperature: "4" }, { ...surface, receptionTemperature: "", storageClass: "AMBIANT" }] },
        candidates,
        DEFAULT_THRESHOLDS,
        sameDay
      )
    ).toMatchObject({ ok: false, ref: "2" });
  });

  it("live bivalve molluscs (rule 8): refused under 25 g, justified between 25 and 50 g", () => {
    const mussels: ReceptionCandidate[] = [{ ...food, productNames: ["Moules de bouchot", null, "Microbiologie des aliments"] }, candidates[1]];
    // Rule (2) lowered for the case: rule (8) alone decides.
    const thresholds = { ...DEFAULT_THRESHOLDS, minFoodMicroG: 10 };
    const tooLight = validateReception(
      { lines: [{ ...accepted, quantity: "20", receptionTemperature: "4" }, surface] },
      mussels,
      thresholds,
      sameDay
    );
    expect(tooLight).toMatchObject({ ok: false, ref: "1" });
    if (!tooLight.ok) {
      expect(tooLight.error).toBe(
        "Échantillon 1 : Poids 20 g < 25 g requis, même pour des animaux de petite taille. L'échantillon ne peut pas être déclaré conforme."
      );
    }

    const small = { lines: [{ ...accepted, quantity: "40", receptionTemperature: "4" }, surface] };
    expect(validateReception(small, mussels, thresholds, sameDay)).toMatchObject({
      ok: false,
      ref: "1",
      error: "Échantillon 1 : justifiez l'acceptation (règle 8 à vérifier).",
    });
    const justifiedSmall = validateReception(
      { lines: [{ ...small.lines[0], receptionNote: "Petites moules : 14 individus comptés" }, surface] },
      mussels,
      thresholds,
      sameDay
    );
    expect(justifiedSmall.ok).toBe(true);
    if (justifiedSmall.ok) {
      expect(justifiedSmall.value.lines[0].checklist.find((r) => r.n === 8)).toMatchObject({ status: "A_VERIFIER", rules: ["MOLLUSQUES_POIDS"] });
    }

    // Received non conforme with the quantity motif, the light sample goes through.
    const nonConform = validateReception(
      {
        lines: [
          { ...accepted, quantity: "20", receptionTemperature: "4", conformity: false, conformityReason: "QUANTITE_INSUFFISANTE" },
          surface,
        ],
      },
      mussels,
      thresholds,
      sameDay
    );
    expect(nonConform.ok).toBe(true);
  });
});
