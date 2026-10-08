import { describe, expect, it } from "vitest";
import {
  SERIE_MESSAGES,
  normalizeLabel,
  planLineSamples,
  sampleLineMessage,
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

const surface = {
  lineKind: "SURFACE",
  analysesMicro: true,
  surfaceLabel: "Planche verte",
  surfaceState: "NETTOYE",
  lieu: "Poste froid",
  parameterIds: ["p1"],
};

const mains = {
  lineKind: "MAINS",
  analysesMicro: true,
  personName: "Employé Test",
  personRole: "Cuisinier",
  handsState: "LAVEES",
  lieu: "Cuisine",
  parameterIds: ["p1"],
};

const air = { lineKind: "AIR", analysesMicro: true, airMethod: "BIOCOLLECTEUR", lieu: "Salle blanche", parameterIds: [] };

const eau = { lineKind: "EAU", analysesMicro: true, produit: "Eau du robinet", lieu: "Cuisine", parameterIds: ["p3"] };

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

  it("refuse une famille grisée pour le type", () => {
    expect(validateLine({ ...mains, analysesChimie: true }, 0, natures)).toMatchObject({
      ok: false,
      error: "« Analyses physico-chimiques » ne s'applique pas à un échantillon « Mains du personnel ».",
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
      error: "Cochez « Analyses microbiologiques ».",
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

describe("les analyses sont facultatives (V6)", () => {
  it("accepte une ligne sans analyse, sur une visite comme sur un dépôt", () => {
    expect(validateLine({ ...aliment, parameterIds: [] }, 0, natures)).toMatchObject({ ok: true, value: { parameterIds: [] } });
    expect(validateLine({ ...aliment, parameterIds: undefined }, 0, natures, { kind: "DEPOT" })).toMatchObject({ ok: true, value: { parameterIds: [] } });
  });

  it("garde le type de produit sur une ligne aliment seulement, facultatif", () => {
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
    expect(validateSerie({ ...visit, lines: [aliment, eau, { ...air, airMethod: null }] }, natures, { kind: "DEPOT" })).toMatchObject({
      ok: false,
      line: 3,
      error: "Échantillon 3 — choisissez la méthode de prélèvement de l'air.",
    });
    expect(validateSerie({ ...visit, lines: [{ ...mains, analysesChimie: true }] }, natures, { kind: "VISITE" })).toMatchObject({
      ok: false,
      line: 1,
      error: "Échantillon 1 — « Analyses physico-chimiques » ne s'applique pas à un échantillon « Mains du personnel ».",
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

  it("accepte une visite sans analyse ni type de produit (V6)", () => {
    const r = validateSerie({ ...visit, lines: [{ ...aliment, parameterIds: [] }, { ...surface, parameterIds: [] }] }, natures, { kind: "VISITE" });
    expect(r.ok).toBe(true);
  });

  it("accepte encore l'ancien appel qui nomme la nature", () => {
    const r = validateSerie(
      { ...visit, lines: [{ natureId: "aliments", produit: "Produit test", lieu: "Cuisine", parameterIds: ["p1"] }] },
      natures,
      { kind: "VISITE" }
    );
    expect(r).toMatchObject({ ok: true, value: { lines: [{ natureSource: "CHOSEN", lineKind: "ALIMENT" }] } });
  });
});

describe("le cadre de la série (RETOUR-LABO-06-10 §5, V1)", () => {
  const base = { clientId: "c1", samplerKind: "QUALILAB", lines: [aliment] };
  const deposit = { clientId: "c1", lines: [{ ...aliment, lieu: "" }] };

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
    expect(validateSerie({ ...base, cadre: "AUTRE", samplerKind: "AUTRE", samplerName: "Service test" }, natures, { kind: "DEPOT" })).toMatchObject({
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
    const visit = { clientId: "c1", cadre: "DEVIS_VALIDE", lines: [{ ...aliment }] };
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
    advanceAmount: "350",
    advanceMode: "ESPECES",
    lines: [
      { ...aliment, lieu: "", quantity: "250", quantityUnit: "G", receptionTemperature: "4,04", technicianId: "t1" },
      {
        lineKind: "EAU",
        analysesMicro: true,
        analysesChimie: true,
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
    expect(result.value.cadre).toBe("DEVIS_VALIDE");
    expect(result.value.advanceAmount).toBe(350);
    expect(result.value.advanceMode).toBe("ESPECES");
    expect(result.value.lines[0]).toMatchObject({
      lieu: "Dépôt au laboratoire",
      receptionTemperature: 4,
      conformity: true,
      conformityReason: null,
      technicianId: "t1",
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
    expect(destroyed).toMatchObject({ ok: true, value: { lines: [{ destroy: true, technicianId: null }] } });
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

  it("refuse une analyse qu'aucune case du type ne peut porter", () => {
    const mainsLine = line({ lineKind: "MAINS", natures: [{ family: "MICRO", natureId: "surfaces" }], parameterIds: ["dosage-air"] });
    expect(planLineSamples(mainsLine, 3, NATURE_ROWS, PARAMETERS)).toMatchObject({
      ok: false,
      line: 3,
      error: "Échantillon 3 — l'analyse « Dosage air test » ne se demande pas sur un échantillon « Mains du personnel ».",
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
