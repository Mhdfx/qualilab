import { describe, expect, it } from "vitest";
import { HANDS_STATE_CHOICES, NON_CONFORMITY_REASON_LABELS } from "./labels";
import {
  NON_CONFORMITY_REASONS,
  SAMPLING_TIME_UNKNOWN,
  SERIE_MESSAGES,
  arrivalChangeRefusal,
  chimieQuantityMessage,
  normalizeLabel,
  planLineSamples,
  sampleLineMessage,
  sampleQuantity,
  validateLine,
  validateSerie,
  type CleanLine,
  type NatureRef,
  type NatureRow,
  type ParameterRef,
} from "./serie-input";

/**
 * Invented catalogue: the natures of the type × family table
 * (nature-family.ts) — air and « autre » with both families since the
 * 08/10 (RETOUR-LABO-06-10.md §8.2) —, a finer nature an older caller may
 * name, an archived one, and physico-chemistry of surfaces archived to show
 * a greyed-out cell.
 */
const NATURE_LIST: NatureRef[] = [
  { id: "aliments", code: "MICRO_ALIMENTS", family: "MICRO", defaultLineKind: "ALIMENT", active: true },
  { id: "pc-aliments", code: "PC_ALIMENTS", family: "CHIMIE", defaultLineKind: "ALIMENT", active: true },
  { id: "surfaces", code: "MICRO_SURFACES", family: "MICRO", defaultLineKind: "SURFACE", active: true },
  { id: "pc-surfaces", code: "PC_SURFACES", family: "CHIMIE", defaultLineKind: "SURFACE", active: false },
  { id: "eaux", code: "MICRO_EAUX", family: "MICRO", defaultLineKind: "EAU", active: true },
  { id: "pc-eaux", code: "PC_EAUX", family: "CHIMIE", defaultLineKind: "EAU", active: true },
  { id: "air", code: "MICRO_AIR", family: "MICRO", defaultLineKind: "AIR", active: true },
  { id: "pc-air", code: "PC_AIR", family: "CHIMIE", defaultLineKind: "AIR", active: true },
  { id: "micro-autre", code: "MICRO_AUTRE", family: "MICRO", defaultLineKind: "AUTRE", active: true },
  { id: "aseptisant", code: "EFFET_ASEPTISANT", family: "CHIMIE", defaultLineKind: "AUTRE", active: true },
  { id: "fine", code: "NATURE_FINE_TEST", family: "MICRO", defaultLineKind: "ALIMENT", active: true },
  { id: "dormant", code: "NATURE_DORMANTE_TEST", family: "MICRO", defaultLineKind: "ALIMENT", active: false },
];
const natures = new Map(NATURE_LIST.map((n) => [n.id, n]));

/** An hour ago: « Prélevé le » is required on every new série (16/10, Q118). */
const SAMPLED = new Date(Date.now() - 3600_000).toISOString();

const aliment = {
  lineKind: "ALIMENT",
  analysesMicro: true,
  produit: "Salade composée test",
  lieu: "Poste froid",
  numeroLot: "L-2409",
  productionDate: "2026-09-01",
  expiryDate: "2026-09-05",
  quantity: "01",
  productTemperature: "1",
  ambientTemperature: "2,5",
  parameterIds: ["p1", "p2"],
};

// Every fixture carries the T° ambiante: a visit requires it (16/10, Q113).
const surface = {
  lineKind: "SURFACE",
  analysesMicro: true,
  surfaceLabel: "Planche verte",
  surfaceState: "NETTOYE",
  lieu: "Poste froid",
  ambientTemperature: "20",
  parameterIds: ["p1"],
};

const mains = {
  lineKind: "MAINS",
  analysesMicro: true,
  personName: "Employé Test",
  personRole: "Cuisinier",
  handsState: "LAVEES",
  lieu: "Cuisine",
  ambientTemperature: "20",
  parameterIds: ["p1"],
};

const air = {
  lineKind: "AIR",
  analysesMicro: true,
  airMethod: "BIOCOLLECTEUR",
  lieu: "Salle blanche",
  ambientTemperature: "20",
  parameterIds: [],
};

const eau = { lineKind: "EAU", analysesMicro: true, produit: "Eau du robinet", lieu: "Cuisine", ambientTemperature: "20", parameterIds: ["p3"] };

describe("normalizeLabel — the key that catches near-duplicates", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeLabel("Frigo+Poste1")).toBe(normalizeLabel("Frigo + Poste1"));
    expect(normalizeLabel("Zone légumerie")).toBe(normalizeLabel("zone legumerie"));
    expect(normalizeLabel("  Poste   froid ")).toBe("poste froid");
  });
});

describe("sampleLineMessage — the sample named in the sentence", () => {
  it("lower-cases the opening word, never a quotation or an acronym", () => {
    expect(sampleLineMessage(2, "Choisissez l'état de la surface.")).toBe("Échantillon 2 — choisissez l'état de la surface.");
    expect(sampleLineMessage("3M", "L'heure est invalide.")).toBe("Échantillon 3M — l'heure est invalide.");
    expect(sampleLineMessage(1, "« Analyses microbiologiques » manque.")).toBe("Échantillon 1 — « Analyses microbiologiques » manque.");
    expect(sampleLineMessage(1, "DLC dépassée.")).toBe("Échantillon 1 — DLC dépassée.");
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
    expect(validateLine({ ...aliment, produit: "" }, 0, natures)).toMatchObject({
      ok: false,
      line: 1,
      error: "Indiquez la désignation du produit.",
    });
    expect(validateLine({ ...mains, personName: "" }, 0, natures)).toMatchObject({
      ok: false,
      error: "Indiquez la personne prélevée.",
    });
  });

  it("refuses an expiry before production, an impossible temperature", () => {
    expect(validateLine({ ...aliment, expiryDate: "2026-08-01" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, productTemperature: "999" }, 0, natures)).toMatchObject({ ok: false });
  });

  it("names the temperature with the screen's words (Q112, 16/10)", () => {
    // « Température au prélèvement » on every type — no longer « du produit ».
    for (const line of [aliment, surface, mains, eau]) {
      expect(validateLine({ ...line, productTemperature: "301" }, 0, natures)).toMatchObject({
        ok: false,
        error: "La température au prélèvement doit être un nombre plausible (−80 à 300 °C).",
      });
    }
    expect(validateLine({ ...aliment, productTemperature: "chaud" }, 0, natures)).toMatchObject({
      ok: false,
      error: "La température au prélèvement doit être un nombre plausible (−80 à 300 °C).",
    });
    expect(validateLine({ ...aliment, ambientTemperature: "-81" }, 0, natures)).toMatchObject({
      ok: false,
      error: "La température ambiante doit être un nombre plausible (−80 à 300 °C).",
    });
    // The bounds themselves are plausible.
    expect(validateLine({ ...aliment, productTemperature: "-80", ambientTemperature: "300" }, 0, natures)).toMatchObject({ ok: true });
  });

  it("still reads the « Fonction » a page opened before 16/10 sends (Q111)", () => {
    // The form no longer asks it; the column keeps what was entered.
    expect(validateLine(mains, 0, natures)).toMatchObject({ ok: true, value: { personRole: "Cuisinier" } });
    const { personRole: _role, ...withoutRole } = mains;
    void _role;
    expect(validateLine(withoutRole, 0, natures)).toMatchObject({ ok: true, value: { personRole: null } });
    // Ignored on any other kind of line.
    expect(validateLine({ ...aliment, personRole: "Cuisinier" }, 0, natures)).toMatchObject({
      ok: true,
      value: { personRole: null },
    });
  });

  it("reads a DLC as the calendar day written, never an instant's UTC day (full-db 12/10)", () => {
    const at = validateLine({ ...aliment, productionDate: "2026-09-19", expiryDate: "2026-09-20T00:30:00+01:00" }, 0, natures);
    expect(at.ok && at.value.expiryDate?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(validateLine({ ...aliment, expiryDate: "+010000-01-01" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, expiryDate: "2026-02-30" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, expiryDate: 20260920 }, 0, natures)).toMatchObject({ ok: false });
  });

  it("bounds the quantity like the reception (DECIMAL(10,2): 1e308 was a 500, full-db 12/10)", () => {
    expect(validateLine({ ...aliment, quantity: "1000000" }, 0, natures)).toMatchObject({ ok: true });
    expect(validateLine({ ...aliment, quantity: "1000000.01" }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, quantity: 1e308 }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, quantity: "-1" }, 0, natures)).toMatchObject({ ok: false });
  });

  it("takes any unit count up to the technical ceiling (no limit for the laboratory, 29/09)", () => {
    expect(validateLine({ ...aliment, unitCount: 9 }, 0, natures)).toMatchObject({ ok: true });
    expect(validateLine({ ...aliment, unitCount: 51 }, 0, natures)).toMatchObject({ ok: true });
    expect(validateLine({ ...aliment, unitCount: 999 }, 0, natures)).toMatchObject({ ok: true });
    expect(validateLine({ ...aliment, unitCount: 0 }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, unitCount: 1000 }, 0, natures)).toMatchObject({ ok: false });
    expect(validateLine({ ...aliment, unitCount: 2.5 }, 0, natures)).toMatchObject({ ok: false });
  });
});

describe("les familles d'analyses par échantillon (RETOUR-LABO-06-10 §5, V3)", () => {
  it("déduit la nature du type × la famille cochée", () => {
    const r = validateLine(aliment, 0, natures);
    expect(r).toMatchObject({
      ok: true,
      value: { natureSource: "FAMILIES", natures: [{ family: "MICRO", natureId: "aliments" }] },
    });
    const chimie = validateLine({ ...eau, analysesMicro: false, analysesChimie: true }, 0, natures);
    expect(chimie).toMatchObject({ ok: true, value: { natures: [{ family: "CHIMIE", natureId: "pc-eaux" }] } });
    const autre = validateLine({ lineKind: "AUTRE", analysesChimie: true, produit: "Désinfectant test", lieu: "Plonge" }, 0, natures);
    expect(autre).toMatchObject({ ok: true, value: { natures: [{ family: "CHIMIE", natureId: "aseptisant" }] } });
  });

  it("deux cases cochées : deux natures, la microbiologie d'abord", () => {
    const r = validateLine({ ...aliment, analysesChimie: true }, 0, natures);
    expect(r.ok && r.value.natures).toEqual([
      { family: "MICRO", natureId: "aliments" },
      { family: "CHIMIE", natureId: "pc-aliments" },
    ]);
  });

  it("air et « autre » prennent les deux familles (§8.2)", () => {
    expect(validateLine({ ...air, analysesChimie: true }, 0, natures)).toMatchObject({
      ok: true,
      value: {
        natures: [
          { family: "MICRO", natureId: "air" },
          { family: "CHIMIE", natureId: "pc-air" },
        ],
      },
    });
    expect(validateLine({ ...air, analysesMicro: false, analysesChimie: true }, 0, natures)).toMatchObject({
      ok: true,
      value: { natures: [{ family: "CHIMIE", natureId: "pc-air" }] },
    });
    expect(
      validateLine({ lineKind: "AUTRE", analysesMicro: true, produit: "Désinfectant test", lieu: "Plonge" }, 0, natures)
    ).toMatchObject({ ok: true, value: { natures: [{ family: "MICRO", natureId: "micro-autre" }] } });
  });

  it("mains : les deux familles depuis le 08/10 (§9.2), « -M » / « -P »", () => {
    const withPcSurfaces = new Map(NATURE_LIST.map((n) => [n.id, n.id === "pc-surfaces" ? { ...n, active: true } : n]));
    const r = validateLine({ ...mains, analysesChimie: true }, 0, withPcSurfaces);
    expect(r.ok && r.value.natures).toEqual([
      { family: "MICRO", natureId: "surfaces" },
      { family: "CHIMIE", natureId: "pc-surfaces" },
    ]);
  });

  it("refuse une famille dont la nature est archivée", () => {
    // The fixture keeps « Physico-chimie des surfaces » archived.
    expect(validateLine({ ...mains, analysesChimie: true }, 0, natures)).toMatchObject({
      ok: false,
      error:
        "« Analyses physico-chimiques » : la nature d'analyse d'un échantillon « Mains du personnel » est archivée ou absente du catalogue — prévenez l'administrateur.",
    });
  });

  it("exige au moins une case, en ne proposant que celles du type", () => {
    expect(validateLine({ ...aliment, analysesMicro: false, analysesChimie: false }, 0, natures)).toMatchObject({
      ok: false,
      error: "Cochez « Analyses microbiologiques » ou « Analyses physico-chimiques ».",
    });
    expect(validateLine({ ...air, analysesMicro: false }, 0, natures)).toMatchObject({
      ok: false,
      error: "Cochez « Analyses microbiologiques » ou « Analyses physico-chimiques ».",
    });
    expect(validateLine({ ...mains, analysesMicro: false }, 0, natures)).toMatchObject({
      ok: false,
      error: "Cochez « Analyses microbiologiques » ou « Analyses physico-chimiques ».",
    });
  });

  it("refuse une nature déduite archivée plutôt que d'en deviner une", () => {
    const r = validateLine({ ...surface, analysesChimie: true }, 0, natures);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("archivée ou absente du catalogue");
  });

  it("migration §8.2 pas encore jouée : air × physico-chimie refusé en clair, pas une erreur 500", () => {
    const before = new Map([...natures].filter(([, n]) => n.code !== "PC_AIR" && n.code !== "MICRO_AUTRE"));
    expect(validateLine({ ...air, analysesChimie: true }, 0, before)).toMatchObject({
      ok: false,
      error: expect.stringContaining(
        "« Analyses physico-chimiques » : la nature d'analyse d'un échantillon « Air » est archivée ou absente du catalogue — prévenez l'administrateur."
      ),
    });
  });

  it("ignore la nature envoyée quand les familles sont cochées", () => {
    expect(validateLine({ ...aliment, natureId: "fine" }, 0, natures)).toMatchObject({
      ok: true,
      value: { natureSource: "FAMILIES", natures: [{ family: "MICRO", natureId: "aliments" }] },
    });
  });

  it("exige le type d'échantillon quand aucune nature n'est nommée", () => {
    expect(validateLine({ ...aliment, lineKind: undefined }, 0, natures)).toMatchObject({ ok: false, error: "Choisissez le type d'échantillon." });
  });
});

describe("l'ancien appel avec natureId (scripts de test, anciens clients de l'API)", () => {
  const legacy = { natureId: "fine", produit: "Produit test", lieu: "Comptoir", parameterIds: ["p1"] };

  it("garde la nature nommée et en tire la famille et le type", () => {
    expect(validateLine(legacy, 0, natures)).toMatchObject({
      ok: true,
      value: { lineKind: "ALIMENT", natureSource: "CHOSEN", natures: [{ family: "MICRO", natureId: "fine" }] },
    });
    expect(validateLine({ ...legacy, natureId: "pc-eaux", lineKind: "EAU" }, 0, natures)).toMatchObject({
      ok: true,
      value: { lineKind: "EAU", natures: [{ family: "CHIMIE", natureId: "pc-eaux" }] },
    });
  });

  it("refuse une nature inconnue ou archivée", () => {
    expect(validateLine({ ...legacy, natureId: "dormant" }, 0, natures)).toMatchObject({
      ok: false,
      error: "Choisissez la nature d'analyse.",
    });
    expect(validateLine({ ...legacy, natureId: "inconnue" }, 0, natures)).toMatchObject({ ok: false });
  });

  it("une nature sans famille connue (« Corriger la fiche ») reste lisible", () => {
    const current = new Map<string, NatureRef>([["current", { id: "current", defaultLineKind: "ALIMENT", active: true }]]);
    expect(validateLine({ ...legacy, natureId: "current" }, 0, current)).toMatchObject({
      ok: true,
      value: { natures: [{ family: "AUTRE", natureId: "current" }] },
    });
  });
});

describe("une ligne Surface : désignation, état et surface prélevée (V2)", () => {
  it("garde la désignation, l'état et l'aire, 100 cm² par défaut", () => {
    expect(validateLine(surface, 0, natures)).toMatchObject({
      ok: true,
      value: { surfaceLabel: "Planche verte", surfaceState: "NETTOYE", surfaceAreaCm2: 100, produit: null },
    });
    expect(validateLine({ ...surface, surfaceAreaCm2: "25" }, 0, natures)).toMatchObject({
      ok: true,
      value: { surfaceAreaCm2: 25 },
    });
  });

  it("exige la désignation puis l'état de la surface", () => {
    expect(validateLine({ ...surface, surfaceLabel: " " }, 2, natures)).toMatchObject({
      ok: false,
      line: 3,
      error: SERIE_MESSAGES.surfaceLabelMissing,
    });
    expect(validateLine({ ...surface, surfaceState: undefined }, 0, natures)).toMatchObject({
      ok: false,
      error: "Choisissez l'état de la surface.",
    });
    expect(validateLine({ ...surface, surfaceState: "SALE" }, 0, natures)).toMatchObject({
      ok: false,
      error: "Choisissez l'état de la surface.",
    });
  });

  it("refuse une aire qui n'est pas un entier positif", () => {
    expect(validateLine({ ...surface, surfaceAreaCm2: "2,5" }, 0, natures)).toMatchObject({
      ok: false,
      error: "La surface prélevée doit être un nombre entier de cm².",
    });
  });

  it("ignore désignation, aire et état sur les autres types", () => {
    const food = validateLine({ ...aliment, surfaceLabel: "Plan inox", surfaceAreaCm2: "50", surfaceState: "ASEPTIQUE" }, 0, natures);
    expect(food).toMatchObject({ ok: true, value: { surfaceLabel: null, surfaceAreaCm2: null, surfaceState: null } });
    const hands = validateLine({ ...mains, surfaceLabel: "Plan inox", surfaceAreaCm2: "abc" }, 0, natures);
    expect(hands).toMatchObject({
      ok: true,
      value: { personName: "Employé Test", handsState: "LAVEES", surfaceLabel: null, surfaceAreaCm2: null, produit: null },
    });
  });

  it("drops the lot and the quantity when the line is a surface or hands", () => {
    const r = validateLine({ ...surface, numeroLot: "L2609-4", quantity: "1", quantityUnit: "UNITE" }, 0, natures);
    expect(r).toMatchObject({ ok: true, value: { numeroLot: null, quantity: null, quantityUnit: null } });
    const food = validateLine({ ...aliment, numeroLot: "L2609-4", quantity: "500", quantityUnit: "G" }, 0, natures);
    expect(food).toMatchObject({ ok: true, value: { numeroLot: "L2609-4", quantity: 500, quantityUnit: "G" } });
  });
});

describe("une ligne Air : la méthode de prélèvement (V4)", () => {
  it("garde la méthode sur une ligne air et l'exige", () => {
    expect(validateLine(air, 0, natures)).toMatchObject({ ok: true, value: { airMethod: "BIOCOLLECTEUR" } });
    expect(validateLine({ ...air, airMethod: "" }, 0, natures)).toMatchObject({
      ok: false,
      error: "Choisissez la méthode de prélèvement de l'air.",
    });
  });

  it("ignore la méthode sur les autres types", () => {
    expect(validateLine({ ...eau, airMethod: "BOITE_EXPOSEE_30MIN" }, 0, natures)).toMatchObject({
      ok: true,
      value: { airMethod: null },
    });
  });
});

describe("« Corriger la fiche » d'un échantillon saisi avant l'état et la méthode", () => {
  it("laisse l'état et la méthode vides sur demande", () => {
    const options = { allowMissingState: true };
    expect(validateLine({ ...surface, surfaceState: undefined }, 0, natures, options)).toMatchObject({
      ok: true,
      value: { surfaceState: null },
    });
    expect(validateLine({ ...air, airMethod: undefined }, 0, natures, options)).toMatchObject({
      ok: true,
      value: { airMethod: null },
    });
    // The désignation of a surface stays required.
    expect(validateLine({ ...surface, surfaceLabel: "" }, 0, natures, options)).toMatchObject({ ok: false });
  });
});

describe("l'état des mains (16/10, Q109)", () => {
  it("accepte les trois états de la liste unique", () => {
    expect(HANDS_STATE_CHOICES).toEqual(["ASEPTISEES", "NON_LAVEES", "LAVEES"]);
    for (const handsState of HANDS_STATE_CHOICES) {
      expect(validateLine({ ...mains, handsState }, 0, natures)).toMatchObject({ ok: true, value: { handsState } });
    }
  });

  it("l'exige à la création, sur la visite comme au comptoir", () => {
    const answered = { exploitable: true, identificationOk: true };
    for (const handsState of [undefined, "", "PROPRES"]) {
      for (const kind of ["VISITE", "DEPOT"] as const) {
        expect(validateLine({ ...mains, ...answered, handsState }, 0, natures, { kind })).toMatchObject({
          ok: false,
          error: SERIE_MESSAGES.handsStateMissing,
        });
      }
    }
    expect(validateSerie({ clientId: "c1", cadre: "AUTRE", startedAt: SAMPLED, lines: [{ ...mains, handsState: "" }] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      line: 1,
      error: "Échantillon 1 — choisissez l'état des mains.",
    });
  });

  it("le laisse vide pour une ligne saisie avant (« Corriger la fiche »)", () => {
    expect(validateLine({ ...mains, handsState: undefined }, 0, natures, { allowMissingState: true })).toMatchObject({
      ok: true,
      value: { handsState: null },
    });
  });
});

describe("la T° ambiante, obligatoire sur la visite (16/10, Q113)", () => {
  it("refuse une ligne de visite sans T° ambiante, l'air compris", () => {
    for (const line of [aliment, surface, mains, eau, air]) {
      for (const empty of [undefined, "", null]) {
        expect(validateLine({ ...line, ambientTemperature: empty }, 0, natures, { kind: "VISITE" })).toMatchObject({
          ok: false,
          error: SERIE_MESSAGES.ambientMissing,
        });
      }
    }
    expect(validateSerie({ clientId: "c1", cadre: "AUTRE", startedAt: SAMPLED, lines: [aliment, { ...air, ambientTemperature: "" }] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      line: 2,
      error: "Échantillon 2 — indiquez la T° ambiante : elle est obligatoire sur la visite.",
    });
  });

  it("« 0 » est une valeur ; la température au prélèvement reste facultative", () => {
    expect(validateLine({ ...air, ambientTemperature: "0" }, 0, natures, { kind: "VISITE" })).toMatchObject({
      ok: true,
      value: { ambientTemperature: 0 },
    });
    expect(validateLine({ ...aliment, productTemperature: "" }, 0, natures, { kind: "VISITE" })).toMatchObject({
      ok: true,
      value: { productTemperature: null },
    });
  });

  it("reste facultative au comptoir et dans « Corriger la fiche » (aucun type de série)", () => {
    const answered = { exploitable: true, identificationOk: true };
    expect(validateLine({ ...eau, ...answered, ambientTemperature: "" }, 0, natures, { kind: "DEPOT" })).toMatchObject({
      ok: true,
      value: { ambientTemperature: null },
    });
    expect(validateLine({ ...air, ambientTemperature: "" }, 0, natures)).toMatchObject({ ok: true, value: { ambientTemperature: null } });
  });
});

describe("la surface « Autre » (16/10, Q114)", () => {
  it("« couteau entier » : le texte, l'aire vide — jamais les 100 cm² par défaut", () => {
    expect(validateLine({ ...surface, surfaceAreaCm2: "", surfaceAreaNote: " couteau entier " }, 0, natures)).toMatchObject({
      ok: true,
      value: { surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" },
    });
  });

  it("« 50 » : une aire ; rien : 100 cm²", () => {
    expect(validateLine({ ...surface, surfaceAreaCm2: "50", surfaceAreaNote: "" }, 0, natures)).toMatchObject({
      ok: true,
      value: { surfaceAreaCm2: 50, surfaceAreaNote: null },
    });
    expect(validateLine({ ...surface, surfaceAreaCm2: "", surfaceAreaNote: "" }, 0, natures)).toMatchObject({
      ok: true,
      value: { surfaceAreaCm2: 100, surfaceAreaNote: null },
    });
  });

  it("refuse l'aire et le texte ensemble, et un texte trop long", () => {
    expect(validateLine({ ...surface, surfaceAreaCm2: "50", surfaceAreaNote: "couteau entier" }, 0, natures)).toMatchObject({
      ok: false,
      error: SERIE_MESSAGES.surfaceAreaBoth,
    });
    expect(validateLine({ ...surface, surfaceAreaNote: "x".repeat(192) }, 0, natures)).toMatchObject({
      ok: false,
      error: SERIE_MESSAGES.surfaceAreaNoteTooLong,
    });
  });

  it("ignore le texte sur un autre type que la surface", () => {
    expect(validateLine({ ...aliment, surfaceAreaNote: "couteau entier" }, 0, natures)).toMatchObject({
      ok: true,
      value: { surfaceAreaCm2: null, surfaceAreaNote: null },
    });
  });
});

describe("l'air : la durée d'exposition de la boîte (16/10, Q50)", () => {
  const plate = { ...air, airMethod: "BOITE_EXPOSEE_30MIN" };

  it("garde la durée saisie, de 1 à 480 minutes", () => {
    expect(validateLine({ ...plate, airExposureMin: "45" }, 0, natures)).toMatchObject({ ok: true, value: { airExposureMin: 45 } });
    expect(validateLine({ ...plate, airExposureMin: 480 }, 0, natures)).toMatchObject({ ok: true, value: { airExposureMin: 480 } });
    for (const wrong of ["0", "481", "12,5", "abc", -5]) {
      expect(validateLine({ ...plate, airExposureMin: wrong }, 0, natures)).toMatchObject({
        ok: false,
        error: SERIE_MESSAGES.airExposureInvalid,
      });
    }
  });

  it("l'exige avec la boîte ; une page ouverte avant le 16/10, qui ne l'envoie pas, a ses 30 minutes", () => {
    for (const empty of ["", null, "  "]) {
      expect(validateLine({ ...plate, airExposureMin: empty }, 0, natures)).toMatchObject({
        ok: false,
        error: SERIE_MESSAGES.airExposureMissing,
      });
    }
    expect(validateLine(plate, 0, natures)).toMatchObject({ ok: true, value: { airExposureMin: 30 } });
  });

  it("n'en garde aucune sur le biocollecteur ni sur un autre type", () => {
    expect(validateLine({ ...air, airExposureMin: "45" }, 0, natures)).toMatchObject({ ok: true, value: { airExposureMin: null } });
    expect(validateLine({ ...eau, airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "45" }, 0, natures)).toMatchObject({
      ok: true,
      value: { airMethod: null, airExposureMin: null },
    });
  });
});

describe("les analyses sont facultatives (V6)", () => {
  it("accepte une ligne sans analyse, sur une visite comme sur un dépôt", () => {
    expect(validateLine({ ...aliment, parameterIds: [] }, 0, natures)).toMatchObject({ ok: true, value: { parameterIds: [] } });
    expect(
      validateLine({ ...aliment, parameterIds: undefined, exploitable: true, identificationOk: true }, 0, natures, { kind: "DEPOT" })
    ).toMatchObject({ ok: true, value: { parameterIds: [] } });
  });

  it("garde la famille de produits sur une ligne aliment seulement, facultatif", () => {
    expect(validateLine({ ...aliment, productTypeId: "pt1" }, 0, natures)).toMatchObject({ ok: true, value: { productTypeId: "pt1" } });
    expect(validateLine(aliment, 0, natures)).toMatchObject({ ok: true, value: { productTypeId: null } });
    expect(validateLine({ ...surface, productTypeId: "pt1" }, 0, natures)).toMatchObject({ ok: true, value: { productTypeId: null } });
  });
});

describe("validateSerie — the visit as a whole", () => {
  const visit = {
    clientId: "c1",
    interlocutor: "Interlocuteur Test",
    cadre: "CONVENTION",
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    lines: [aliment, eau],
  };

  it("accepts a visit with its cadre; the sampler defaults to Qualilab", () => {
    const r = validateSerie(visit, natures, { kind: "VISITE" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.samplerKind).toBe("QUALILAB");
    expect(r.value.cadre).toBe("CONVENTION");
    expect(r.value.cadreNote).toBeNull();
    expect(r.value.lines).toHaveLength(2);
  });

  it("names the faulty sample in the message", () => {
    const r = validateSerie({ ...visit, lines: [aliment, { ...eau, lieu: "" }] }, natures, { kind: "VISITE" });
    expect(r).toMatchObject({ ok: false, line: 2, error: "Échantillon 2 — indiquez le lieu / la section du prélèvement." });
  });

  it("dit « Échantillon N » pour la désignation, l'état et la méthode", () => {
    expect(validateSerie({ ...visit, lines: [{ ...surface, surfaceLabel: "" }] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      line: 1,
      error: "Échantillon 1 — indiquez la désignation de la surface.",
    });
    expect(validateSerie({ ...visit, lines: [aliment, { ...surface, surfaceState: null }] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      line: 2,
      error: "Échantillon 2 — choisissez l'état de la surface.",
    });
    const answered = { exploitable: true, identificationOk: true };
    expect(validateSerie({ ...visit, lines: [{ ...aliment, ...answered }, { ...eau, ...answered }, { ...air, airMethod: null }] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      line: 3,
      error: "Échantillon 3 — choisissez la méthode de prélèvement de l'air.",
    });
    expect(validateSerie({ ...visit, lines: [{ ...mains, analysesChimie: true }] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      line: 1,
      error:
        "Échantillon 1 — « Analyses physico-chimiques » : la nature d'analyse d'un échantillon « Mains du personnel » est archivée ou absente du catalogue — prévenez l'administrateur.",
    });
  });

  it("refuses an empty visit, a future start, a chronology that runs backwards", () => {
    expect(validateSerie({ ...visit, lines: [] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      error: "Ajoutez au moins un échantillon.",
    });
    expect(validateSerie({ ...visit, startedAt: new Date(Date.now() + 3600_000).toISOString() }, natures, { kind: "VISITE" })).toMatchObject({ ok: false });
    const start = new Date(Date.now() - 3600_000);
    expect(
      validateSerie({ ...visit, startedAt: start.toISOString(), endedAt: new Date(start.getTime() - 60_000).toISOString() }, natures, { kind: "VISITE" })
    ).toMatchObject({ ok: false });
  });

  it("accepte une visite sans analyse ni famille de produits (V6)", () => {
    const r = validateSerie({ ...visit, lines: [{ ...aliment, parameterIds: [] }, { ...surface, parameterIds: [] }] }, natures, { kind: "VISITE" });
    expect(r.ok).toBe(true);
  });

  it("accepte encore l'ancien appel qui nomme la nature", () => {
    const r = validateSerie(
      { ...visit, lines: [{ natureId: "aliments", produit: "Produit test", lieu: "Cuisine", ambientTemperature: "21", parameterIds: ["p1"] }] },
      natures,
      { kind: "VISITE" }
    );
    expect(r).toMatchObject({ ok: true, value: { lines: [{ natureSource: "CHOSEN", lineKind: "ALIMENT" }] } });
  });
});

describe("le cadre de la série (RETOUR-LABO-06-10 §5, V1)", () => {
  const base = { clientId: "c1", samplerKind: "QUALILAB", startedAt: SAMPLED, lines: [aliment] };
  const deposit = { clientId: "c1", startedAt: SAMPLED, lines: [{ ...aliment, lieu: "" }] };

  it("est un choix obligatoire, sur la visite comme sur le dépôt", () => {
    for (const kind of ["VISITE", "DEPOT"] as const) {
      const input = kind === "VISITE" ? base : deposit;
      expect(validateSerie(input, natures, { kind })).toMatchObject({ ok: false, error: "Choisissez le cadre de l'analyse." });
      // The former values are no longer accepted, nothing is deduced from who samples.
      expect(validateSerie({ ...input, cadre: "AUTOCONTROLE" }, natures, { kind })).toMatchObject({
        ok: false,
        error: SERIE_MESSAGES.cadreMissing,
      });
    }
  });

  it("accepte les quatre valeurs", () => {
    for (const cadre of ["AUTRE", "DEVIS_VALIDE", "BON_COMMANDE", "CONVENTION"]) {
      expect(validateSerie({ ...base, cadre }, natures, { kind: "VISITE" })).toMatchObject({ ok: true, value: { cadre } });
    }
  });

  it("garde la précision de « Autre », nettoyée, et seulement pour « Autre »", () => {
    expect(validateSerie({ ...base, cadre: "AUTRE", cadreNote: "  Contrôle demandé par la mairie  " }, natures, { kind: "VISITE" })).toMatchObject({
      ok: true,
      value: { cadre: "AUTRE", cadreNote: "Contrôle demandé par la mairie" },
    });
    expect(validateSerie({ ...base, cadre: "AUTRE", cadreNote: "   " }, natures, { kind: "VISITE" })).toMatchObject({
      ok: true,
      value: { cadreNote: null },
    });
    expect(validateSerie({ ...base, cadre: "BON_COMMANDE", cadreNote: "BC 42" }, natures, { kind: "VISITE" })).toMatchObject({
      ok: true,
      value: { cadre: "BON_COMMANDE", cadreNote: null },
    });
    expect(validateSerie({ ...base, cadre: "AUTRE", cadreNote: "x".repeat(192) }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      error: "La précision du cadre est trop longue (191 caractères maximum).",
    });
  });

  it("refuse « Service vétérinaire » à la création : « Autre » + le nom", () => {
    for (const kind of ["VISITE", "DEPOT"] as const) {
      expect(
        validateSerie({ ...base, cadre: "AUTRE", samplerKind: "SERVICE_VETERINAIRE", samplerName: "Service test" }, natures, { kind })
      ).toMatchObject({
        ok: false,
        error: "« Service vétérinaire » n'est plus proposé : choisissez « Autre » et indiquez le nom.",
      });
    }
    expect(validateSerie({ ...base, lines: [{ ...aliment, exploitable: true, identificationOk: true }], cadre: "AUTRE", samplerKind: "AUTRE", samplerName: "Service test" }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: true,
      value: { samplerKind: "AUTRE", samplerName: "Service test" },
    });
    expect(validateSerie({ ...base, cadre: "AUTRE", samplerKind: "AUTRE" }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      error: "Indiquez qui a effectué le prélèvement.",
    });
  });
});

describe("validateSerie — the end of the visit typed on site", () => {
  it("refuses an end or an arrival in the future, like the reception does", () => {
    const soon = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const visit = { clientId: "c1", cadre: "DEVIS_VALIDE", startedAt: SAMPLED, lines: [{ ...aliment }] };
    expect(validateSerie({ ...visit, endedAt: soon }, natures, { kind: "VISITE" })).toMatchObject({ ok: false, error: expect.stringContaining("L'heure de fin est dans le futur") });
    expect(validateSerie({ ...visit, arrivedAt: soon }, natures, { kind: "VISITE" })).toMatchObject({ ok: false, error: expect.stringContaining("L'heure d'arrivée est dans le futur") });
    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    const earlier = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(validateSerie({ ...visit, startedAt: earlier, endedAt: past, arrivedAt: past, coolerTemperature: "1" }, natures, { kind: "VISITE" })).toMatchObject({ ok: true });
  });
});

describe("validateSerie — the deposit at the counter", () => {
  const deposit = {
    clientId: "c1",
    samplerKind: "CLIENT",
    cadre: "DEVIS_VALIDE",
    interlocutor: "Client Démo",
    startedAt: SAMPLED,
    advanceAmount: "350",
    advanceMode: "ESPECES",
    lines: [
      { ...aliment, lieu: "", quantity: "250", quantityUnit: "G", receptionTemperature: "4,04", exploitable: true, identificationOk: true, technicianId: "t1" },
      {
        lineKind: "EAU",
        analysesMicro: true,
        analysesChimie: true,
        produit: "Eau du réseau",
        quantity: "0,5",
        quantityUnit: "L",
        // Optional at the counter; a visit made of these lines needs it (16/10, Q113).
        ambientTemperature: "18",
        receptionTemperature: "12",
        parameterIds: ["p9"],
        exploitable: true,
        identificationOk: false,
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
    expect(result.value.cadre).toBe("DEVIS_VALIDE");
    expect(result.value.advanceAmount).toBe(350);
    expect(result.value.advanceMode).toBe("ESPECES");
    expect(result.value.lines[0]).toMatchObject({
      lieu: "Dépôt au laboratoire",
      receptionTemperature: 4,
      exploitable: true,
      identificationOk: true,
      conformity: true,
      conformityReason: null,
    });
    expect(result.value.lines[1]).toMatchObject({
      conformity: false,
      conformityReason: "QUANTITE_INSUFFISANTE",
      natures: [
        { family: "MICRO", natureId: "eaux" },
        { family: "CHIMIE", natureId: "pc-eaux" },
      ],
    });
  });

  it("needs a motif for a non-conform sample and a mode for an advance", () => {
    const noReason = validateSerie(
      { ...deposit, lines: [{ ...deposit.lines[1], conformityReason: undefined }] },
      natures,
      { kind: "DEPOT" }
    );
    expect(noReason).toMatchObject({ ok: false, line: 1, error: "Échantillon 1 — choisissez le motif de non-conformité." });
    const noMode = validateSerie({ ...deposit, advanceMode: undefined }, natures, { kind: "DEPOT" });
    expect(noMode).toMatchObject({ ok: false, error: "Indiquez le mode de paiement de l'avance." });
    const zero = validateSerie({ ...deposit, advanceAmount: "0", advanceMode: undefined }, natures, { kind: "DEPOT" });
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.value.advanceAmount).toBeNull();
  });

  it("destroys only a non-conform sample", () => {
    const conform = validateSerie({ ...deposit, lines: [{ ...deposit.lines[0], decision: "DETRUIRE" }] }, natures, { kind: "DEPOT" });
    expect(conform).toMatchObject({ ok: false, line: 1, error: "Échantillon 1 — seul un échantillon non conforme peut être détruit." });
    const destroyed = validateSerie({ ...deposit, lines: [{ ...deposit.lines[1], decision: "DETRUIRE" }] }, natures, { kind: "DEPOT" });
    expect(destroyed).toMatchObject({ ok: true, value: { lines: [{ destroy: true }] } });
  });

  it("never takes a technician at the counter — one takes the sample from « À prendre » (RETOUR-LABO-06-10 §9.3, PROGRAMME.md §10)", () => {
    // Both lines still send `technicianId` (a page opened before 08/10):
    // the deposit goes through, the technician is dropped.
    const result = validateSerie(deposit, natures, { kind: "DEPOT" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const line of result.value.lines) expect(line).not.toHaveProperty("technicianId");
  });

  it("needs rule (1) answered on every line — a form opened before the checklist is told so", () => {
    const { exploitable: _answer, ...oldForm } = deposit.lines[0];
    expect(_answer).toBe(true);
    expect(validateSerie({ ...deposit, lines: [oldForm] }, natures, { kind: "DEPOT" })).toEqual({
      ok: false,
      line: 1,
      error: "Échantillon 1 — indiquez s'il est exploitable (règle 1). Si les boutons « Exploitable » / « Non exploitable » n'apparaissent pas, rechargez la page.",
    });
    expect(validateSerie({ ...deposit, lines: [deposit.lines[0], { ...deposit.lines[1], exploitable: null }] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      line: 2,
      error: "Échantillon 2 — indiquez s'il est exploitable (règle 1). Si les boutons « Exploitable » / « Non exploitable » n'apparaissent pas, rechargez la page.",
    });
  });

  it("says whether the sampling time was given (C1): typed = declared; null on a visit", () => {
    const typed = validateSerie(deposit, natures, { kind: "DEPOT" });
    expect(typed.ok && typed.value.samplingTimeDeclared).toBe(true);
    expect(typed.ok && typed.value.startedAt.toISOString()).toBe(SAMPLED);
    const visit = validateSerie({ ...deposit, lines: deposit.lines.map((l) => ({ ...l, lieu: "Comptoir" })) }, natures, { kind: "VISITE" });
    expect(visit.ok && visit.value.samplingTimeDeclared).toBeNull();
  });

  it("carries the class and the temperature's source of a deposit line (C2), never on a visit", () => {
    const line = { ...deposit.lines[0], storageClass: "CONGELE", receptionTemperatureSource: "ECHANTILLON" };
    const result = validateSerie({ ...deposit, lines: [line] }, natures, { kind: "DEPOT" });
    expect(result.ok && result.value.lines[0]).toMatchObject({ storageClass: "CONGELE", receptionTemperatureSource: "ECHANTILLON" });
    // No temperature typed: no source.
    const cold = validateSerie({ ...deposit, lines: [{ ...line, receptionTemperature: "" }] }, natures, { kind: "DEPOT" });
    expect(cold.ok && cold.value.lines[0].receptionTemperatureSource).toBeNull();
    expect(validateSerie({ ...deposit, lines: [{ ...line, storageClass: "TIEDE" }] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      error: "Échantillon 1 — classe de conservation inconnue.",
    });
    const visit = validateSerie({ ...deposit, lines: [{ ...line, lieu: "Comptoir" }] }, natures, { kind: "VISITE" });
    expect(visit.ok && visit.value.lines[0]).toMatchObject({ storageClass: null, receptionTemperatureSource: null });
  });

  it("needs C5 ticked on every line — one answer for the line's samples", () => {
    expect(validateSerie({ ...deposit, lines: [{ ...deposit.lines[0], identificationOk: null }] }, natures, { kind: "DEPOT" })).toEqual({
      ok: false,
      line: 1,
      error: "Échantillon 1 — indiquez si l'identification est conforme à la fiche (rechargez la page si elle date d'avant la mise à jour).",
    });
    const result = validateSerie(deposit, natures, { kind: "DEPOT" });
    expect(result.ok && result.value.lines[1]).toMatchObject({ identificationOk: false });
  });

  it("no longer asks the packaging (C3, 16/10 — Q70): an old page's answer is ignored, never refused", () => {
    // Not sent: accepted (the fixture's lines carry none).
    const fresh = validateSerie(deposit, natures, { kind: "DEPOT" });
    expect(fresh.ok).toBe(true);
    // Sent by a page opened before, « Non » included: ignored — it no longer forces « non conforme ».
    for (const packagingOk of [true, false, "oui"]) {
      const old = validateSerie({ ...deposit, lines: [{ ...deposit.lines[0], packagingOk }] }, natures, { kind: "DEPOT" });
      expect(old.ok, String(packagingOk)).toBe(true);
      if (!old.ok) continue;
      expect(old.value.lines[0]).toMatchObject({ conformity: true, conformityReason: null });
      expect(old.value.lines[0]).not.toHaveProperty("packagingOk");
    }
  });

  it("never declares a non-exploitable line conform", () => {
    expect(validateSerie({ ...deposit, lines: [{ ...deposit.lines[0], exploitable: false }] }, natures, { kind: "DEPOT" })).toEqual({
      ok: false,
      line: 1,
      error: "Échantillon 1 — un échantillon non exploitable ne peut pas être déclaré conforme (règle 1).",
    });
  });

  it("accepts the motif « non exploitable », and only for a line answered so", () => {
    const refused = { ...deposit.lines[0], exploitable: false, conformity: false, conformityReason: "NON_EXPLOITABLE", decision: "DETRUIRE" };
    expect(validateSerie({ ...deposit, lines: [refused] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: true,
      value: { lines: [{ exploitable: false, conformity: false, conformityReason: "NON_EXPLOITABLE", destroy: true }] },
    });
    expect(validateSerie({ ...deposit, lines: [{ ...refused, exploitable: true }] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      line: 1,
      error: "Échantillon 1 — le motif « non exploitable » ne va pas avec la réponse « Exploitable » (règle 1).",
    });
  });

  it("derives the accepted motifs from their labels", () => {
    expect(NON_CONFORMITY_REASONS).toEqual(Object.keys(NON_CONFORMITY_REASON_LABELS));
    expect(NON_CONFORMITY_REASONS).toContain("NON_EXPLOITABLE");
    expect(NON_CONFORMITY_REASON_LABELS.NON_EXPLOITABLE).toBe("Échantillon non exploitable (tête de poisson, os…)");
  });

  it("carries the line's « Observation de réception » (A7), 1 000 characters at most, never on a visit", () => {
    const noted = { ...deposit.lines[0], receptionNote: "  Poids estimé, balance en maintenance  " };
    const result = validateSerie({ ...deposit, lines: [noted] }, natures, { kind: "DEPOT" });
    expect(result.ok && result.value.lines[0].receptionNote).toBe("Poids estimé, balance en maintenance");
    const empty = validateSerie(deposit, natures, { kind: "DEPOT" });
    expect(empty.ok && empty.value.lines[0].receptionNote).toBeNull();
    expect(validateSerie({ ...deposit, lines: [{ ...noted, receptionNote: "x".repeat(1001) }] }, natures, { kind: "DEPOT" })).toEqual({
      ok: false,
      line: 1,
      error: "Échantillon 1 — l'observation de réception dépasse 1 000 caractères.",
    });
    const visit = validateSerie({ ...deposit, lines: [{ ...noted, lieu: "Comptoir" }] }, natures, { kind: "VISITE" });
    expect(visit.ok && visit.value.lines[0].receptionNote).toBeNull();
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
      expect(visit.value.lines[1]).toMatchObject({
        exploitable: null,
        identificationOk: null,
        conformity: true,
        conformityReason: null,
      });
      expect(visit.value.lines[1]).not.toHaveProperty("technicianId");
    }
  });
});

describe("arrivalChangeRefusal — the arrival changed through the série's header (lot 1b)", () => {
  const now = new Date("2026-10-19T12:00:00Z").getTime();
  const receivedAt = new Date("2026-10-19T09:00:00Z");
  const day = 24 * 3600 * 1000;

  it("before the reception: the préleveur may set or empty it, 30 days back at most", () => {
    expect(arrivalChangeRefusal({ next: new Date(now - 3600_000), receivedAt: null, byPreleveur: true, now })).toBeNull();
    expect(arrivalChangeRefusal({ next: null, receivedAt: null, byPreleveur: true, now })).toBeNull();
    expect(arrivalChangeRefusal({ next: new Date(now - 31 * day), receivedAt: null, byPreleveur: true, now })).toBe(
      SERIE_MESSAGES.arrivalTooOld
    );
  });

  it("once received: never the préleveur's, as the cadre", () => {
    expect(arrivalChangeRefusal({ next: new Date("2026-10-19T08:00:00Z"), receivedAt, byPreleveur: true, now })).toBe(
      "La série est réceptionnée : le laboratoire seul peut corriger l'heure d'arrivée."
    );
    expect(arrivalChangeRefusal({ next: null, receivedAt, byPreleveur: true, now })).toMatch(/laboratoire seul/);
  });

  it("once received: the laboratory corrects it, never empties it, never after the reception", () => {
    expect(arrivalChangeRefusal({ next: new Date("2026-10-18T19:30:00Z"), receivedAt, byPreleveur: false, now })).toBeNull();
    expect(arrivalChangeRefusal({ next: null, receivedAt, byPreleveur: false, now })).toBe(SERIE_MESSAGES.arrivalMissing);
    // The reception's own 5 min of clock tolerance, not one more.
    expect(arrivalChangeRefusal({ next: new Date("2026-10-19T09:05:00Z"), receivedAt, byPreleveur: false, now })).toBeNull();
    expect(arrivalChangeRefusal({ next: new Date("2026-10-19T09:06:00Z"), receivedAt, byPreleveur: false, now })).toBe(
      "L'heure d'arrivée suit la réception de la série."
    );
  });

  it("once received: 30 days back counted from the reception, not from now", () => {
    const oldReception = new Date(now - 60 * day);
    expect(
      arrivalChangeRefusal({ next: new Date(oldReception.getTime() - 3600_000), receivedAt: oldReception, byPreleveur: false, now })
    ).toBeNull();
    expect(
      arrivalChangeRefusal({ next: new Date(oldReception.getTime() - 31 * day), receivedAt: oldReception, byPreleveur: false, now })
    ).toBe("L'heure d'arrivée précède la réception de plus de 30 jours.");
  });
});

describe("« Prélevé le » et « Arrivé le » obligatoires (16/10, Q118)", () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const line = { ...aliment, lieu: "", quantity: "250", quantityUnit: "G", receptionTemperature: "4", exploitable: true, identificationOk: true };
  const deposit = { clientId: "c1", samplerKind: "CLIENT", cadre: "DEVIS_VALIDE", lines: [line] };
  const visit = { clientId: "c1", cadre: "CONVENTION", lines: [aliment] };

  it("refuses a deposit without « Prélevé le » nor the box — an old page is told to reload", () => {
    for (const startedAt of [undefined, null, ""]) {
      expect(validateSerie({ ...deposit, startedAt, arrivedAt: at(10) }, natures, { kind: "DEPOT" })).toEqual({
        ok: false,
        error: SERIE_MESSAGES.depositStartedMissingApi,
      });
    }
    expect(SERIE_MESSAGES.depositStartedMissingApi).toBe(
      "Indiquez la date et l'heure du prélèvement, ou cochez « Heure de prélèvement inconnue du client » (rechargez la page si cette case n'apparaît pas)."
    );
    // Only `true` is the box: a string or 1 is not.
    for (const samplingTimeUnknown of ["true", 1, false]) {
      expect(validateSerie({ ...deposit, samplingTimeUnknown }, natures, { kind: "DEPOT" })).toMatchObject({ ok: false });
    }
  });

  it("« Heure de prélèvement inconnue du client »: not declared, the sampling instant is the arrival", () => {
    const arrival = at(90);
    const result = validateSerie({ ...deposit, samplingTimeUnknown: true, arrivedAt: arrival }, natures, { kind: "DEPOT" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.samplingTimeDeclared).toBe(false);
    expect(result.value.startedAt.toISOString()).toBe(arrival);
    expect(result.value.arrivedAt?.toISOString()).toBe(arrival);
    // The box wins over a time sent with it.
    const both = validateSerie({ ...deposit, samplingTimeUnknown: true, startedAt: at(300), arrivedAt: arrival }, natures, { kind: "DEPOT" });
    expect(both.ok && both.value.startedAt.toISOString()).toBe(arrival);
    // Without an arrival (an API caller): the save instant, as the arrival will be.
    const bare = validateSerie({ ...deposit, samplingTimeUnknown: true }, natures, { kind: "DEPOT" });
    expect(bare.ok && Math.abs(bare.value.startedAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect(bare.ok && bare.value.samplingTimeDeclared).toBe(false);
    // The box is the proposal of the re-ask 2.6.
    expect(SAMPLING_TIME_UNKNOWN).toEqual({ allowed: true, label: "Heure de prélèvement inconnue du client" });
  });

  it("accepts an arrival typed before the save, after the sampling (07:00 → 08:30, saved now)", () => {
    const sampled = at(160);
    const arrived = at(70);
    const result = validateSerie({ ...deposit, startedAt: sampled, arrivedAt: arrived }, natures, { kind: "DEPOT" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.samplingTimeDeclared).toBe(true);
    expect(result.value.startedAt.toISOString()).toBe(sampled);
    expect(result.value.arrivedAt?.toISOString()).toBe(arrived);
  });

  it("refuses an arrival before the sampling, in the future, or more than 30 days back", () => {
    expect(validateSerie({ ...deposit, startedAt: at(60), arrivedAt: at(120) }, natures, { kind: "DEPOT" })).toEqual({
      ok: false,
      error: SERIE_MESSAGES.arrivalBeforeStart,
    });
    expect(validateSerie({ ...deposit, startedAt: at(60), arrivedAt: at(-120) }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("L'heure d'arrivée est dans le futur"),
    });
    const old = at(31 * 24 * 60);
    expect(validateSerie({ ...deposit, samplingTimeUnknown: true, arrivedAt: old }, natures, { kind: "DEPOT" })).toEqual({
      ok: false,
      error: SERIE_MESSAGES.arrivalTooOld,
    });
    expect(SERIE_MESSAGES.arrivalTooOld).toBe("L'heure d'arrivée remonte à plus de 30 jours.");
    expect(validateSerie({ ...deposit, startedAt: at(29 * 24 * 60), arrivedAt: at(29 * 24 * 60 - 30) }, natures, { kind: "DEPOT" }).ok).toBe(true);
  });

  it("an old page without « Arrivé le »: no arrival — the deposit arrives at its save (`createSerie`)", () => {
    const result = validateSerie({ ...deposit, startedAt: at(60) }, natures, { kind: "DEPOT" });
    expect(result.ok && result.value.arrivedAt).toBeNull();
    expect(result.ok && result.value.samplingTimeDeclared).toBe(true);
  });

  it("refuses a visit without « Prélevé le » — never the save instant in its place — and ignores the box there", () => {
    for (const startedAt of [undefined, ""]) {
      expect(validateSerie({ ...visit, startedAt }, natures, { kind: "VISITE" })).toEqual({ ok: false, error: SERIE_MESSAGES.startedMissing });
    }
    expect(SERIE_MESSAGES.startedMissing).toBe("Indiquez la date et l'heure du prélèvement.");
    // The box is the counter's: a visit sending it still needs its time.
    expect(validateSerie({ ...visit, samplingTimeUnknown: true }, natures, { kind: "VISITE" })).toEqual({
      ok: false,
      error: SERIE_MESSAGES.startedMissing,
    });
    const typed = validateSerie({ ...visit, startedAt: at(60) }, natures, { kind: "VISITE" });
    expect(typed.ok && typed.value.samplingTimeDeclared).toBeNull();
  });
});

describe("planLineSamples — d'une ligne à ses échantillons", () => {
  const NATURE_ROWS = new Map<string, NatureRow>([
    ["aliments", { id: "aliments", family: "MICRO", legacyType: "ALIMENTAIRE" }],
    ["pc-aliments", { id: "pc-aliments", family: "CHIMIE", legacyType: "ALIMENTAIRE" }],
    ["air", { id: "air", family: "MICRO", legacyType: "AMBIANCE" }],
    ["pc-air", { id: "pc-air", family: "CHIMIE", legacyType: "AMBIANCE" }],
    ["surfaces", { id: "surfaces", family: "MICRO", legacyType: "AMBIANCE" }],
    ["fine", { id: "fine", family: "MICRO", legacyType: "ALIMENTAIRE" }],
  ]);
  const PARAMETERS = new Map<string, ParameterRef>(
    [
      { id: "germe-a", name: "Germe test A", family: "MICRO", category: "ALIMENTAIRE" },
      { id: "germe-b", name: "Germe test B", family: "MICRO", category: "ALIMENTAIRE" },
      { id: "dosage", name: "Dosage test", family: "CHIMIE", category: "ALIMENTAIRE" },
      { id: "germe-eau", name: "Germe eau test", family: "MICRO", category: "EAU" },
      { id: "dosage-air", name: "Dosage air test", family: "CHIMIE", category: "AMBIANCE" },
      { id: "sensoriel", name: "Examen test", family: "AUTRE", category: "ALIMENTAIRE" },
    ].map((p) => [p.id, p as ParameterRef])
  );

  const line = (patch: Partial<CleanLine>): Pick<CleanLine, "lineKind" | "natures" | "natureSource" | "parameterIds"> => ({
    lineKind: "ALIMENT",
    natures: [{ family: "MICRO", natureId: "aliments" }],
    natureSource: "FAMILIES",
    parameterIds: [],
    ...patch,
  });
  const both = [
    { family: "MICRO" as const, natureId: "aliments" },
    { family: "CHIMIE" as const, natureId: "pc-aliments" },
  ];

  it("une famille : un échantillon sans lettre, avec ses analyses", () => {
    const plan = planLineSamples(line({ parameterIds: ["germe-a", "germe-b"] }), 1, NATURE_ROWS, PARAMETERS);
    expect(plan).toEqual({
      ok: true,
      samples: [{ family: "MICRO", natureId: "aliments", type: "ALIMENTAIRE", twin: null, parameterIds: ["germe-a", "germe-b"] }],
    });
  });

  it("deux familles : « M » puis « P », chaque analyse vers l'échantillon de sa famille", () => {
    const plan = planLineSamples(line({ natures: both, parameterIds: ["dosage", "germe-a"] }), 4, NATURE_ROWS, PARAMETERS);
    expect(plan).toEqual({
      ok: true,
      samples: [
        { family: "MICRO", natureId: "aliments", type: "ALIMENTAIRE", twin: "M", parameterIds: ["germe-a"] },
        { family: "CHIMIE", natureId: "pc-aliments", type: "ALIMENTAIRE", twin: "P", parameterIds: ["dosage"] },
      ],
    });
  });

  it("sans analyse, chaque échantillon attend la fiche de programme (V6)", () => {
    const plan = planLineSamples(line({ natures: both }), 1, NATURE_ROWS, PARAMETERS);
    expect(plan.ok && plan.samples.map((s) => s.parameterIds)).toEqual([[], []]);
  });

  it("refuse une analyse d'une famille non cochée, en disant laquelle cocher", () => {
    expect(planLineSamples(line({ parameterIds: ["germe-a", "dosage"] }), 2, NATURE_ROWS, PARAMETERS)).toEqual({
      ok: false,
      line: 2,
      error: "Échantillon 2 — « Dosage test » est une analyse physico-chimique : cochez « Analyses physico-chimiques » ou retirez-la.",
    });
  });

  it("air : une analyse physico-chimique demande sa case, puis va à l'échantillon « P » (§8.2)", () => {
    const airLine = line({ lineKind: "AIR", natures: [{ family: "MICRO", natureId: "air" }], parameterIds: ["dosage-air"] });
    expect(planLineSamples(airLine, 3, NATURE_ROWS, PARAMETERS)).toMatchObject({
      ok: false,
      line: 3,
      error: "Échantillon 3 — « Dosage air test » est une analyse physico-chimique : cochez « Analyses physico-chimiques » ou retirez-la.",
    });
    const bothAir = line({
      lineKind: "AIR",
      natures: [
        { family: "MICRO", natureId: "air" },
        { family: "CHIMIE", natureId: "pc-air" },
      ],
      parameterIds: ["dosage-air"],
    });
    expect(planLineSamples(bothAir, 3, NATURE_ROWS, PARAMETERS)).toEqual({
      ok: true,
      samples: [
        { family: "MICRO", natureId: "air", type: "AMBIANCE", twin: "M", parameterIds: [] },
        { family: "CHIMIE", natureId: "pc-air", type: "AMBIANCE", twin: "P", parameterIds: ["dosage-air"] },
      ],
    });
  });

  it("refuse une analyse de la case non cochée, et une analyse qu'aucune case ne peut porter", () => {
    // Hands take physico-chimie since 08/10 (§9.2): the box just has to be ticked.
    const mainsLine = line({ lineKind: "MAINS", natures: [{ family: "MICRO", natureId: "surfaces" }], parameterIds: ["dosage-air"] });
    expect(planLineSamples(mainsLine, 3, NATURE_ROWS, PARAMETERS)).toMatchObject({
      ok: false,
      line: 3,
      error: "Échantillon 3 — « Dosage air test » est une analyse physico-chimique : cochez « Analyses physico-chimiques » ou retirez-la.",
    });
    expect(planLineSamples(line({ parameterIds: ["sensoriel"] }), 1, NATURE_ROWS, PARAMETERS)).toMatchObject({ ok: false });
  });

  it("refuse une analyse d'un autre domaine que celui de l'échantillon", () => {
    expect(planLineSamples(line({ parameterIds: ["germe-eau"] }), 1, NATURE_ROWS, PARAMETERS)).toMatchObject({
      ok: false,
      error: "Échantillon 1 — l'analyse « Germe eau test » ne se demande pas sur un échantillon « Produit alimentaire ».",
    });
  });

  it("l'ancien appel garde sa nature et toutes ses analyses du même domaine", () => {
    const legacy = line({ natureSource: "CHOSEN", natures: [{ family: "MICRO", natureId: "fine" }], parameterIds: ["germe-a", "dosage", "sensoriel"] });
    expect(planLineSamples(legacy, 1, NATURE_ROWS, PARAMETERS)).toEqual({
      ok: true,
      samples: [{ family: "MICRO", natureId: "fine", type: "ALIMENTAIRE", twin: null, parameterIds: ["germe-a", "dosage", "sensoriel"] }],
    });
    expect(planLineSamples({ ...legacy, parameterIds: ["germe-eau"] }, 1, NATURE_ROWS, PARAMETERS)).toMatchObject({ ok: false });
  });

  it("refuse une nature archivée depuis la saisie et une analyse inconnue", () => {
    expect(planLineSamples(line({ natures: [{ family: "MICRO", natureId: "disparue" }] }), 1, NATURE_ROWS, PARAMETERS)).toEqual({
      ok: false,
      line: 1,
      error: "Échantillon 1 — la nature d'analyse est inconnue ou archivée.",
    });
    expect(planLineSamples(line({ parameterIds: ["inconnue"] }), 1, NATURE_ROWS, PARAMETERS)).toMatchObject({
      ok: false,
      error: "Échantillon 1 — une des analyses demandées n'existe pas.",
    });
  });
});

describe("validateSerie — the deposit's decision and the client's agreement (A9)", () => {
  const base = {
    clientId: "c1",
    samplerKind: "CLIENT",
    cadre: "AUTRE",
    startedAt: SAMPLED,
    lines: [
      {
        ...aliment,
        quantity: "250",
        quantityUnit: "G",
        receptionTemperature: "4",
        exploitable: true,
        identificationOk: true,
        // A container judged damaged by hand: the motif stays (16/10, Q70).
        conformity: false,
        conformityReason: "EMBALLAGE",
      },
    ],
  };
  const line = base.lines[0];

  it("analyses by default, holds for the client or destroys a non-conform line", () => {
    expect(validateSerie(base, natures, { kind: "DEPOT" })).toMatchObject({
      ok: true,
      value: { lines: [{ decision: "ANALYSER", awaitClient: false, destroy: false, consultation: null }] },
    });
    expect(validateSerie({ ...base, lines: [{ ...line, decision: "EN_ATTENTE_CLIENT" }] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: true,
      value: { lines: [{ decision: "EN_ATTENTE_CLIENT", awaitClient: true, destroy: false }] },
    });
    expect(
      validateSerie({ ...base, lines: [{ ...line, conformity: true, decision: "EN_ATTENTE_CLIENT" }] }, natures, { kind: "DEPOT" })
    ).toEqual({ ok: false, line: 1, error: "Échantillon 1 — seul un échantillon non conforme peut attendre l'avis du client." });
  });

  it("records the agreement, and requires it when the laboratory says so", () => {
    const agreed = { ...line, consultation: { name: "Mme Test", channel: "SUR_PLACE" } };
    const result = validateSerie({ ...base, lines: [agreed] }, natures, { kind: "DEPOT", consultationRequired: true });
    expect(result.ok && result.value.lines[0].consultation).toMatchObject({ name: "Mme Test", channel: "SUR_PLACE", note: null });
    expect(validateSerie(base, natures, { kind: "DEPOT", consultationRequired: true })).toMatchObject({
      ok: false,
      line: 1,
      error:
        "Échantillon 1 — l'accord du client est obligatoire pour analyser un échantillon non conforme : indiquez le nom de la personne consultée et le canal.",
    });
    // A visit carries no reception decision.
    const visit = validateSerie({ ...base, lines: [{ ...agreed, lieu: "Comptoir", decision: "EN_ATTENTE_CLIENT" }] }, natures, { kind: "VISITE" });
    expect(visit.ok && visit.value.lines[0]).toMatchObject({ decision: "ANALYSER", awaitClient: false, consultation: null });
  });
});

describe("one container per family — « Quantité nP » (the laboratory's answer of 12/10)", () => {
  const both = { ...aliment, analysesChimie: true, quantity: "120", quantityUnit: "G" };

  it("keeps the physico-chemistry part of a two-family line beside the line's own quantity", () => {
    const r = validateLine({ ...both, quantityChimie: "350,5", quantityUnitChimie: "G" }, 1, natures);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ quantity: 120, quantityUnit: "G", chimieQuantity: { quantity: 350.5, quantityUnit: "G" } });
    // Each sample is weighed on its own part.
    expect(sampleQuantity(r.value, "M")).toEqual({ quantity: 120, quantityUnit: "G" });
    expect(sampleQuantity(r.value, "P")).toEqual({ quantity: 350.5, quantityUnit: "G" });
  });

  it("an empty « Quantité nP » is a part not weighed; a missing unit is « unité(s) », like the line's", () => {
    const empty = validateLine({ ...both, quantityChimie: "" }, 0, natures);
    expect(empty.ok && empty.value.chimieQuantity).toEqual({ quantity: null, quantityUnit: null });
    expect(empty.ok && sampleQuantity(empty.value, "P")).toEqual({ quantity: null, quantityUnit: null });
    const nulled = validateLine({ ...both, quantityChimie: null }, 0, natures);
    expect(nulled.ok && nulled.value.chimieQuantity).toEqual({ quantity: null, quantityUnit: null });
    const noUnit = validateLine({ ...both, quantityChimie: "2" }, 0, natures);
    expect(noUnit.ok && noUnit.value.chimieQuantity).toEqual({ quantity: 2, quantityUnit: "UNITE" });
  });

  it("an older page that does not send it keeps today's rule: the « P » sample takes the line's quantity", () => {
    const r = validateLine(both, 0, natures);
    expect(r.ok && r.value.chimieQuantity).toBeNull();
    expect(r.ok && sampleQuantity(r.value, "P")).toEqual({ quantity: 120, quantityUnit: "G" });
    expect(r.ok && sampleQuantity(r.value, null)).toEqual({ quantity: 120, quantityUnit: "G" });
  });

  it("refuses a P quantity that is not a positive number, naming the sample", () => {
    for (const bad of ["-1", "0", "abc", "1000001", true]) {
      expect(validateLine({ ...both, quantityChimie: bad }, 1, natures)).toEqual({ ok: false, error: chimieQuantityMessage(2), line: 2 });
    }
    expect(chimieQuantityMessage(2)).toBe("La quantité 2P doit être un nombre positif (1 000 000 au plus).");
    const serie = validateSerie(
      {
        clientId: "c1",
        samplerKind: "CLIENT",
        cadre: "DEVIS_VALIDE",
        startedAt: SAMPLED,
        lines: [{ ...both, quantityChimie: "-3", exploitable: true, identificationOk: true }],
      },
      natures,
      { kind: "DEPOT" }
    );
    expect(serie).toEqual({ ok: false, error: "Échantillon 1 — la quantité 1P doit être un nombre positif (1 000 000 au plus).", line: 1 });
  });

  it("ignores it on a one-family line, an older caller's nature, and a kind that is not weighed", () => {
    const micro = validateLine({ ...aliment, quantity: "120", quantityUnit: "G", quantityChimie: "999" }, 0, natures);
    expect(micro.ok && micro.value.chimieQuantity).toBeNull();
    const chosen = validateLine({ ...aliment, analysesMicro: undefined, natureId: "fine", quantityChimie: "999" }, 0, natures);
    expect(chosen.ok && chosen.value.chimieQuantity).toBeNull();
    const pcSurfaces = new Map([...natures, ["pc-surfaces", { ...natures.get("pc-surfaces")!, active: true }]]);
    const swab = validateLine({ ...surface, analysesChimie: true, quantityChimie: "999" }, 0, pcSurfaces);
    expect(swab.ok && swab.value.chimieQuantity).toBeNull();
    // A garbage value on a line that cannot use it is dropped, never refused.
    expect(validateLine({ ...aliment, quantityChimie: "abc" }, 0, natures).ok).toBe(true);
  });

  it("water weighs its two bottles apart too", () => {
    const r = validateLine({ ...eau, analysesChimie: true, quantity: "1", quantityUnit: "L", quantityChimie: "2", quantityUnitChimie: "L" }, 0, natures);
    expect(r.ok && r.value.chimieQuantity).toEqual({ quantity: 2, quantityUnit: "L" });
  });
});
