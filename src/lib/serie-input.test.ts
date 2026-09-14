import { describe, expect, it } from "vitest";
import { normalizeLabel, validateLine, validateSerie, type NatureRef } from "./serie-input";

const natures = new Map<string, NatureRef>([
  ["aliments", { id: "aliments", defaultLineKind: "ALIMENT", active: true }],
  ["surfaces", { id: "surfaces", defaultLineKind: "SURFACE", active: true }],
  ["eaux", { id: "eaux", defaultLineKind: "EAU", active: true }],
  ["dormant", { id: "dormant", defaultLineKind: "ALIMENT", active: false }],
]);

const aliment = {
  natureId: "aliments",
  produit: "Salade Gaillardière",
  lieu: "Poste salades",
  numeroLot: "L-2409",
  productionDate: "2026-09-01",
  expiryDate: "2026-09-05",
  quantity: "01",
  productTemperature: "1",
  ambientTemperature: "2,5",
  parameterIds: ["p1", "p2"],
};

describe("normalizeLabel — the key that catches near-duplicates", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeLabel("CF+PAV1")).toBe(normalizeLabel("CF + PAV1"));
    expect(normalizeLabel("Zone légumerie")).toBe(normalizeLabel("zone legumerie"));
    expect(normalizeLabel("  Poste   salades ")).toBe("poste salades");
  });
});

describe("validateLine — the paper line, field by field", () => {
  it("accepts a complete food line and types its values", () => {
    const r = validateLine(aliment, 0, natures);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lineKind).toBe("ALIMENT");
    expect(r.value.quantity).toBe(1);
    expect(r.value.quantityUnit).toBe("UNITE");
    expect(r.value.ambientTemperature).toBe(2.5);
    expect(r.value.productionDate?.getMonth()).toBe(8);
    expect(r.value.unitCount).toBe(1);
    expect(r.value.parameterIds).toEqual(["p1", "p2"]);
  });

  it("requires what the kind requires", () => {
    expect(validateLine({ ...aliment, produit: "" }, 0, natures)).toMatchObject({ ok: false, line: 1 });
    expect(validateLine({ natureId: "surfaces", lieu: "Poste salades", parameterIds: ["p1"] }, 2, natures)).toMatchObject({
      ok: false,
      line: 3,
      error: "Indiquez la surface prélevée.",
    });
    expect(
      validateLine({ natureId: "surfaces", lineKind: "MAINS", lieu: "Chef cuisine", parameterIds: ["p1"] }, 0, natures)
    ).toMatchObject({ ok: false, error: "Indiquez la personne prélevée." });
  });

  it("gives a surface its area, 100 cm² by default, and hands their state", () => {
    const surface = validateLine(
      { natureId: "surfaces", surfaceLabel: "Planche verte", lieu: "Poste salades", parameterIds: ["p1"] },
      0,
      natures
    );
    expect(surface.ok && surface.value.surfaceAreaCm2).toBe(100);
    const hands = validateLine(
      { natureId: "surfaces", lineKind: "MAINS", personName: "Hamza B.", personRole: "Chef cuisine", handsState: "LAVEES", lieu: "Chef cuisine", productTemperature: "25", parameterIds: ["p1"] },
      0,
      natures
    );
    expect(hands.ok && hands.value).toMatchObject({ personName: "Hamza B.", handsState: "LAVEES", productTemperature: 25, produit: null });
  });

  it("refuses an expiry before production, an impossible temperature, a dormant nature", () => {
    expect(validateLine({ ...aliment, expiryDate: "2026-08-01" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, productTemperature: "999" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, natureId: "dormant" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, parameterIds: [] }, 0, natures)).toMatchObject({ ok: false, error: "Choisissez au moins une analyse." });
  });

  it("keeps the unit count within the laboratory's ceiling of fifty", () => {
    expect(validateLine({ ...aliment, unitCount: 9 }, 0, natures)).toMatchObject({ ok: true });
    expect(validateLine({ ...aliment, unitCount: 50 }, 0, natures)).toMatchObject({ ok: true });
    expect(validateLine({ ...aliment, unitCount: 0 }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, unitCount: 51 }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, unitCount: 2.5 }, 0, natures)).toMatchObject({ ok: false });
  });
});

describe("validateSerie — the visit as a whole", () => {
  const visit = {
    clientId: "c1",
    interlocutor: "Karim",
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    lines: [aliment, { natureId: "eaux", produit: "Eau du robinet", lieu: "Cuisine", parameterIds: ["p3"] }],
  };

  it("accepts a visit, derives sampler and cadre", () => {
    const r = validateSerie(visit, natures, { kind: "VISITE" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.samplerKind).toBe("QUALILAB");
    expect(r.value.cadre).toBe("AUTOCONTROLE");
    expect(r.value.lines).toHaveLength(2);
  });

  it("derives an official cadre for the veterinary service, and needs its name", () => {
    const vet = validateSerie({ ...visit, samplerKind: "SERVICE_VETERINAIRE", samplerName: "Dr Chami" }, natures, { kind: "DEPOT" });
    expect(vet.ok && vet.value.cadre).toBe("OFFICIEL");
    expect(validateSerie({ ...visit, samplerKind: "SERVICE_VETERINAIRE" }, natures, { kind: "DEPOT" })).toMatchObject({ ok: false });
  });

  it("names the faulty line", () => {
    const r = validateSerie({ ...visit, lines: [aliment, { natureId: "eaux", lieu: "", parameterIds: ["p3"] }] }, natures, { kind: "VISITE" });
    expect(r).toMatchObject({ ok: false, line: 2 });
  });

  it("refuses an empty visit, a future start, a chronology that runs backwards", () => {
    expect(validateSerie({ ...visit, lines: [] }, natures, { kind: "VISITE" })).toMatchObject({ ok: false });
    expect(validateSerie({ ...visit, startedAt: new Date(Date.now() + 3600_000).toISOString() }, natures, { kind: "VISITE" })).toMatchObject({ ok: false });
    const start = new Date(Date.now() - 3600_000);
    expect(
      validateSerie({ ...visit, startedAt: start.toISOString(), endedAt: new Date(start.getTime() - 60_000).toISOString() }, natures, { kind: "VISITE" })
    ).toMatchObject({ ok: false });
  });
});

describe("validateSerie — the end of the visit typed on site", () => {
  it("refuses an end or an arrival in the future, like the reception does", () => {
    const soon = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const visit = { clientId: "c1", lines: [{ ...aliment }] };
    expect(validateSerie({ ...visit, endedAt: soon }, natures, { kind: "VISITE" })).toMatchObject({ ok: false, error: "L'heure de fin est dans le futur." });
    expect(validateSerie({ ...visit, arrivedAt: soon }, natures, { kind: "VISITE" })).toMatchObject({ ok: false, error: "L'heure d'arrivée est dans le futur." });
    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    const earlier = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(validateSerie({ ...visit, startedAt: earlier, endedAt: past, arrivedAt: past, coolerTemperature: "1" }, natures, { kind: "VISITE" })).toMatchObject({ ok: true });
  });
});

describe("validateSerie — the deposit at the counter", () => {
  const deposit = {
    clientId: "c1",
    samplerKind: "CLIENT",
    interlocutor: "M. Alaoui",
    advanceAmount: "350",
    advanceMode: "ESPECES",
    lines: [
      { ...aliment, lieu: "", quantity: "250", quantityUnit: "G", receptionTemperature: "4,04", technicianId: "t1" },
      {
        natureId: "eaux",
        produit: "Eau du réseau",
        quantity: "0,5",
        quantityUnit: "L",
        receptionTemperature: "12",
        parameterIds: ["p9"],
        conformity: false,
        conformityReason: "QUANTITE_INSUFFISANTE",
        technicianId: "t1",
      },
    ],
  };

  it("defaults the sampler to the client, the place to the counter, and carries the reception data", () => {
    const result = validateSerie(deposit, natures, { kind: "DEPOT" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.samplerKind).toBe("CLIENT");
    expect(result.value.advanceAmount).toBe(350);
    expect(result.value.advanceMode).toBe("ESPECES");
    expect(result.value.lines[0]).toMatchObject({
      lieu: "Dépôt au laboratoire",
      receptionTemperature: 4,
      conformity: true,
      conformityReason: null,
      technicianId: "t1",
    });
    expect(result.value.lines[1]).toMatchObject({ conformity: false, conformityReason: "QUANTITE_INSUFFISANTE" });
  });

  it("needs a motif for a non-conform line and a mode for an advance", () => {
    const noReason = validateSerie(
      { ...deposit, lines: [{ ...deposit.lines[1], conformityReason: undefined }] },
      natures,
      { kind: "DEPOT" }
    );
    expect(noReason).toMatchObject({ ok: false, line: 1 });
    const noMode = validateSerie({ ...deposit, advanceMode: undefined }, natures, { kind: "DEPOT" });
    expect(noMode).toMatchObject({ ok: false, error: "Indiquez le mode de paiement de l'avance." });
    const zero = validateSerie({ ...deposit, advanceAmount: "0", advanceMode: undefined }, natures, { kind: "DEPOT" });
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.value.advanceAmount).toBeNull();
  });

  it("ignores reception data on a visit", () => {
    const visit = validateSerie(
      { ...deposit, lines: deposit.lines.map((l) => ({ ...l, lieu: "Comptoir" })) },
      natures,
      { kind: "VISITE" }
    );
    expect(visit.ok).toBe(true);
    if (visit.ok) {
      expect(visit.value.samplerKind).toBe("CLIENT");
      expect(visit.value.advanceAmount).toBeNull();
      expect(visit.value.lines[1]).toMatchObject({ conformity: true, conformityReason: null, technicianId: null });
    }
  });
});
