import { describe, expect, it } from "vitest";
import {
  analysesNotice,
  billedCorrectionWarning,
  cancelConsequences,
  cancelReasonsFor,
  correctionBody,
  correctionFields,
  correctionValues,
  type VerbSample,
} from "./sample-verbs-logic";
import { correctionTouches, validateIntake, type IntakeCurrent } from "@/lib/intake-input";
import { correctionRefusal, correctionRights } from "@/lib/sample-verbs";
import { HANDS_STATE_CHOICES, SURFACE_AREA_CHOICES } from "@/lib/labels";
import { heldInvoiceFor } from "@/lib/price-access";

/**
 * « Corriger la fiche » ↔ `PATCH /api/samples/[id]/intake`: the body the
 * dialog builds for each kind of sample is accepted by the API's own
 * validator, and never carries a field of another kind
 * (RETOUR-LABO-06-10.md §5, V2 and V4). Invented designations only.
 */

const base: VerbSample = {
  id: "s1",
  code: "1/26-1",
  controlCode: "10/26",
  status: "RECU",
  type: "ALIMENTAIRE",
  lineKind: "ALIMENT",
  produit: "Salade test",
  lieu: "Cuisine",
  numeroLot: "L1",
  productionDate: "2026-10-01T00:00:00.000Z",
  expiryDate: "2026-10-09T00:00:00.000Z",
  quantity: 250,
  quantityUnit: "G",
  productTemperature: null,
  ambientTemperature: null,
  surfaceLabel: null,
  surfaceAreaCm2: null,
  surfaceAreaNote: null,
  surfaceState: null,
  personName: null,
  personRole: null,
  handsState: null,
  airMethod: null,
  airExposureMin: null,
  remarks: null,
  unitCount: 1,
  parameterIds: ["p1"],
  productTypeId: null,
  clientId: "c1",
};

function currentOf(sample: VerbSample): IntakeCurrent {
  return {
    lineKind: sample.lineKind,
    produit: sample.produit,
    lieu: sample.lieu,
    numeroLot: sample.numeroLot,
    productionDate: sample.productionDate ? new Date(sample.productionDate) : null,
    expiryDate: sample.expiryDate ? new Date(sample.expiryDate) : null,
    quantity: sample.quantity,
    quantityUnit: sample.quantityUnit,
    productTemperature: sample.productTemperature,
    ambientTemperature: sample.ambientTemperature,
    surfaceLabel: sample.surfaceLabel,
    surfaceAreaCm2: sample.surfaceAreaCm2,
    surfaceAreaNote: sample.surfaceAreaNote,
    surfaceState: sample.surfaceState ?? null,
    personName: sample.personName,
    personRole: sample.personRole,
    handsState: sample.handsState,
    airMethod: sample.airMethod ?? null,
    airExposureMin: sample.airExposureMin,
    remarks: sample.remarks,
    unitCount: sample.unitCount,
    productTypeId: sample.productTypeId,
    parameterIds: sample.parameterIds,
  };
}

describe("correctionBody against validateIntake", () => {
  it("surface: designation, state, area — accepted; nothing of another kind sent", () => {
    const sample: VerbSample = {
      ...base,
      type: "AMBIANCE",
      lineKind: "SURFACE",
      produit: null,
      numeroLot: null,
      productionDate: null,
      expiryDate: null,
      quantity: null,
      quantityUnit: null,
      surfaceLabel: "Planche verte",
      surfaceAreaCm2: 100,
      surfaceState: null,
    };
    const values = { ...correctionValues(sample), surfaceState: "NETTOYE" as const, surfaceAreaCm2: "" };
    const body = correctionBody("SURFACE", values, null, "état oublié");
    expect(Object.keys(body).sort()).toEqual([
      "ambientTemperature",
      "lieu",
      "productTemperature",
      "productTypeId",
      "reason",
      "remarks",
      "surfaceAreaCm2",
      "surfaceAreaNote",
      "surfaceLabel",
      "surfaceState",
      "unitCount",
    ]);
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { surfaceState: "NETTOYE" } } });
    // An old surface sample without a state may be corrected without one.
    const untouched = correctionBody("SURFACE", { ...correctionValues(sample), lieu: "Plonge" }, null, "lieu");
    expect(untouched).not.toHaveProperty("surfaceState");
    expect(validateIntake(untouched, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
  });

  it("surface: each quick area (« 100 cm² », « 1000 cm² », 14/10) is sent as typed and accepted", () => {
    const sample: VerbSample = {
      ...base,
      type: "AMBIANCE",
      lineKind: "SURFACE",
      produit: null,
      quantity: null,
      quantityUnit: null,
      numeroLot: null,
      productionDate: null,
      expiryDate: null,
      surfaceLabel: "Planche verte",
      surfaceAreaCm2: 250,
      surfaceState: "NETTOYE",
    };
    expect(SURFACE_AREA_CHOICES).toEqual([100, 1000]);
    for (const area of SURFACE_AREA_CHOICES) {
      const body = correctionBody("SURFACE", { ...correctionValues(sample), surfaceAreaCm2: String(area) }, null, "aire");
      expect(body).toHaveProperty("surfaceAreaCm2", String(area));
      expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { surfaceAreaCm2: area } } });
    }
  });

  it("surface: renaming the designation keeps the stored state", () => {
    const sample: VerbSample = { ...base, type: "AMBIANCE", lineKind: "SURFACE", produit: null, quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, surfaceLabel: "Pince", surfaceAreaCm2: 100, surfaceState: "ASEPTIQUE" };
    const body = correctionBody("SURFACE", { ...correctionValues(sample), surfaceLabel: "Pince inox" }, null, "faute");
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { surfaceLabel: "Pince inox" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("surfaceState");
  });

  it("air: the method only, accepted", () => {
    const sample: VerbSample = { ...base, type: "AMBIANCE", lineKind: "AIR", produit: "Salle", quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, airMethod: null };
    const body = correctionBody("AIR", { ...correctionValues(sample), airMethod: "BIOCOLLECTEUR" }, null, "méthode");
    expect(body).toHaveProperty("airMethod", "BIOCOLLECTEUR");
    expect(body).not.toHaveProperty("surfaceLabel");
    expect(body).not.toHaveProperty("quantity");
    expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { airMethod: "BIOCOLLECTEUR" } } });
  });

  it("food: never sends surface, method or hands fields; an old surface label survives", () => {
    const sample: VerbSample = { ...base, surfaceLabel: "MAIN", surfaceAreaCm2: null };
    const body = correctionBody("ALIMENT", { ...correctionValues(sample), numeroLot: "L2" }, null, "lot");
    for (const key of ["surfaceLabel", "surfaceAreaCm2", "surfaceState", "airMethod", "personName", "handsState"]) {
      expect(body).not.toHaveProperty(key);
    }
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { numeroLot: "L2" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("surfaceLabel");
  });

  it("hands: person and state, accepted", () => {
    const sample: VerbSample = { ...base, type: "AMBIANCE", lineKind: "MAINS", produit: null, quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, personName: "Agent test", handsState: null };
    const body = correctionBody("MAINS", { ...correctionValues(sample), handsState: "LAVEES" }, ["p1", "p2"], "état");
    expect(body).toMatchObject({ personName: "Agent test", handsState: "LAVEES", parameterIds: ["p1", "p2"] });
    expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true });
  });

  const hands: VerbSample = {
    ...base,
    type: "AMBIANCE",
    lineKind: "MAINS",
    produit: null,
    quantity: null,
    quantityUnit: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    personName: "Personne Test",
    handsState: "NON_LAVEES",
  };

  it("hands (16/10, Q109): every state of the one list is accepted; an old « non lavées » becomes « aseptisées »", () => {
    expect(HANDS_STATE_CHOICES).toEqual(["ASEPTISEES", "NON_LAVEES", "LAVEES"]);
    for (const state of HANDS_STATE_CHOICES) {
      const body = correctionBody("MAINS", { ...correctionValues({ ...hands, handsState: null }), handsState: state }, null, "état");
      expect(validateIntake(body, currentOf({ ...hands, handsState: null }))).toMatchObject({
        ok: true,
        value: { changes: { handsState: state } },
      });
    }
    const body = correctionBody("MAINS", { ...correctionValues(hands), handsState: "ASEPTISEES" }, null, "état");
    expect(validateIntake(body, currentOf(hands))).toMatchObject({ ok: true, value: { changes: { handsState: "ASEPTISEES" } } });
  });

  it("hands: an empty state is not sent — the stored one stays; an old sample without one stays correctable", () => {
    const body = correctionBody("MAINS", { ...correctionValues(hands), handsState: "", lieu: "Plonge" }, null, "lieu");
    expect(body).not.toHaveProperty("handsState");
    const checked = validateIntake(body, currentOf(hands));
    expect(checked).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("handsState");
    const old = { ...hands, handsState: null };
    expect(
      validateIntake(correctionBody("MAINS", { ...correctionValues(old), lieu: "Plonge" }, null, "lieu"), currentOf(old))
    ).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
  });

  it("temperatures (P9, 16/10): shown with a decimal comma, corrected, never emptied once recorded", () => {
    const sample: VerbSample = { ...base, productTemperature: 4.5, ambientTemperature: 18 };
    expect(correctionValues(sample)).toMatchObject({ productTemperature: "4,5", ambientTemperature: "18" });
    const body = correctionBody("ALIMENT", { ...correctionValues(sample), productTemperature: "3,5" }, null, "T°");
    expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { productTemperature: 3.5 } } });
    const emptied = correctionBody("ALIMENT", { ...correctionValues(sample), ambientTemperature: "" }, null, "T°");
    expect(validateIntake(emptied, currentOf(sample))).toMatchObject({ ok: false, error: expect.stringContaining("T° ambiante") });
    // An old sample without them: correctable as it is, and they may be added.
    expect(
      validateIntake(correctionBody("ALIMENT", { ...correctionValues(base), lieu: "Plonge" }, null, "lieu"), currentOf(base))
    ).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
    expect(
      validateIntake(correctionBody("ALIMENT", { ...correctionValues(base), ambientTemperature: "0" }, null, "T°"), currentOf(base))
    ).toMatchObject({ ok: true, value: { changes: { ambientTemperature: 0 } } });
    expect(
      validateIntake(correctionBody("ALIMENT", { ...correctionValues(base), productTemperature: "301" }, null, "T°"), currentOf(base))
    ).toMatchObject({ ok: false });
  });

  it("temperatures: the air sends its ambient one only", () => {
    expect(correctionFields("AIR").productTemperature).toBe(false);
    expect(correctionFields("SURFACE").productTemperature).toBe(true);
    const air: VerbSample = { ...base, type: "AMBIANCE", lineKind: "AIR", produit: "Salle", quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, airMethod: "BIOCOLLECTEUR" };
    const body = correctionBody("AIR", { ...correctionValues(air), ambientTemperature: "21" }, null, "T°");
    expect(body).not.toHaveProperty("productTemperature");
    expect(validateIntake(body, currentOf(air))).toMatchObject({ ok: true, value: { changes: { ambientTemperature: 21 } } });
  });

  const swab: VerbSample = {
    ...base,
    type: "AMBIANCE",
    lineKind: "SURFACE",
    produit: null,
    quantity: null,
    quantityUnit: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    surfaceLabel: "Couteau",
    surfaceAreaCm2: 100,
    surfaceState: "NETTOYE",
  };

  it("surface « Autre » (16/10, Q114): a text replaces the area, and the area comes back", () => {
    const body = correctionBody("SURFACE", { ...correctionValues(swab), surfaceAreaCm2: "couteau entier" }, null, "autre");
    expect(body).toMatchObject({ surfaceAreaCm2: "", surfaceAreaNote: "couteau entier" });
    expect(validateIntake(body, currentOf(swab))).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" } },
    });
    const noted: VerbSample = { ...swab, surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" };
    // The dialog opens on the text, and sending it unchanged changes nothing else.
    expect(correctionValues(noted).surfaceAreaCm2).toBe("couteau entier");
    const kept = correctionBody("SURFACE", { ...correctionValues(noted), lieu: "Plonge" }, null, "lieu");
    expect(validateIntake(kept, currentOf(noted))).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
    const back = correctionBody("SURFACE", { ...correctionValues(noted), surfaceAreaCm2: "1000" }, null, "aire");
    expect(validateIntake(back, currentOf(noted))).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: 1000, surfaceAreaNote: null } },
    });
  });

  const plate: VerbSample = {
    ...base,
    type: "AMBIANCE",
    lineKind: "AIR",
    produit: "Salle",
    quantity: null,
    quantityUnit: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    airMethod: "BOITE_EXPOSEE_30MIN",
    airExposureMin: 30,
  };

  it("air (16/10, Q50): the plate's duration is sent with the plate only, and corrected", () => {
    const body = correctionBody("AIR", { ...correctionValues(plate), airExposureMin: "45" }, null, "durée");
    expect(body).toMatchObject({ airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "45" });
    expect(validateIntake(body, currentOf(plate))).toMatchObject({ ok: true, value: { changes: { airExposureMin: 45 } } });
    const bio = correctionBody("AIR", { ...correctionValues(plate), airMethod: "BIOCOLLECTEUR" }, null, "méthode");
    expect(bio).not.toHaveProperty("airExposureMin");
    expect(validateIntake(bio, currentOf(plate))).toMatchObject({
      ok: true,
      value: { changes: { airMethod: "BIOCOLLECTEUR", airExposureMin: null } },
    });
  });

  it("air: an old plate without a duration stays correctable without one", () => {
    const old: VerbSample = { ...plate, airExposureMin: null };
    expect(correctionValues(old).airExposureMin).toBe("");
    const body = correctionBody("AIR", { ...correctionValues(old), lieu: "Couloir" }, null, "lieu");
    const checked = validateIntake(body, currentOf(old));
    expect(checked).toMatchObject({ ok: true, value: { changes: { lieu: "Couloir" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("airExposureMin");
  });
});

describe("cancelReasonsFor — the motifs « Annuler » offers", () => {
  it("offers « Non reçu au laboratoire » on a sample still waiting for its reception only", () => {
    expect(cancelReasonsFor("PRELEVE")).toContain("NON_RECU");
    for (const status of ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as const) {
      expect(cancelReasonsFor(status)).not.toContain("NON_RECU");
    }
  });

  it("never offers « Détruit à réception », the reception's own verb", () => {
    expect(cancelReasonsFor("PRELEVE")).not.toContain("DETRUIT_A_RECEPTION");
    expect(cancelReasonsFor("RECU")).toEqual(["NON_EXPLOITABLE", "QUANTITE_INSUFFISANTE", "DOUBLON", "ANNULATION_CLIENT", "AUTRE"]);
  });
});

describe("correctionBody — only the halves this person may change (16/10, Q128)", () => {
  const atBench: VerbSample = { ...base, status: "EN_ANALYSE", parameterIds: ["p1", "p2"], unitCount: 5, productTypeId: "type-1" };

  it("the responsable des paramètres at the bench: the analyses only, accepted by the route's rules", () => {
    const scope = correctionRights("PROGRAMMATEUR", "EN_ANALYSE");
    const body = correctionBody("ALIMENT", { ...correctionValues(atBench), lieu: "ignoré" }, ["p1"], "analyse non faite", scope);
    expect(body).toEqual({ unitCount: 5, productTypeId: "type-1", parameterIds: ["p1"], reason: "analyse non faite" });
    const checked = validateIntake(body, currentOf(atBench));
    expect(checked).toEqual({ ok: true, value: { changes: {}, parameterIds: ["p1"], reason: "analyse non faite" } });
    if (checked.ok) expect(correctionRefusal("PROGRAMMATEUR", "EN_ANALYSE", correctionTouches(body, checked.value))).toBeNull();
  });

  it("the reception after the programme: the identification only — never the units, the product type nor the list", () => {
    const scope = correctionRights("RECEPTIONNISTE", "EN_ANALYSE");
    const body = correctionBody("ALIMENT", { ...correctionValues(atBench), numeroLot: "L2", unitCount: 9 }, ["p1"], "lot", scope);
    expect(body).not.toHaveProperty("unitCount");
    expect(body).not.toHaveProperty("productTypeId");
    expect(body).not.toHaveProperty("parameterIds");
    const checked = validateIntake(body, currentOf(atBench));
    expect(checked).toMatchObject({ ok: true, value: { changes: { numeroLot: "L2" }, parameterIds: null } });
    if (checked.ok) expect(correctionRefusal("RECEPTIONNISTE", "EN_ANALYSE", correctionTouches(body, checked.value))).toBeNull();
  });

  it("the reception before the programme, and the administrator: both halves, as before", () => {
    const body = correctionBody("ALIMENT", correctionValues(base), ["p1", "p2"], "analyse", correctionRights("RECEPTIONNISTE", "RECU"));
    expect(body).toEqual(correctionBody("ALIMENT", correctionValues(base), ["p1", "p2"], "analyse"));
    expect(body).toMatchObject({ unitCount: 1, productTypeId: "", parameterIds: ["p1", "p2"], numeroLot: "L1", lieu: "Cuisine" });
    expect(correctionBody("ALIMENT", correctionValues(atBench), null, "x", correctionRights("ADMIN", "RESULTATS_SAISIS"))).toEqual(
      correctionBody("ALIMENT", correctionValues(atBench), null, "x")
    );
  });

  it("a water or surface line corrects its family at the bench too (F3 / F5), accepted by the route's rules", () => {
    const scope = correctionRights("PROGRAMMATEUR", "EN_ANALYSE");
    const water: VerbSample = { ...atBench, lineKind: "EAU", type: "EAU", productTypeId: "eau-1" };
    const waterBody = correctionBody("EAU", { ...correctionValues(water), productTypeId: "eau-2" }, null, "famille", scope);
    expect(waterBody).toEqual({ unitCount: 5, productTypeId: "eau-2", reason: "famille" });
    expect(validateIntake(waterBody, currentOf(water))).toMatchObject({ ok: true, value: { changes: { productTypeId: "eau-2" } } });
    const surface: VerbSample = { ...atBench, lineKind: "SURFACE", type: "AMBIANCE", produit: null, surfaceLabel: "Planche test", productTypeId: null };
    const surfaceBody = correctionBody("SURFACE", { ...correctionValues(surface), productTypeId: "surf-1" }, null, "famille", scope);
    expect(surfaceBody).toEqual({ unitCount: 5, productTypeId: "surf-1", reason: "famille" });
    const checked = validateIntake(surfaceBody, currentOf(surface));
    expect(checked).toMatchObject({ ok: true, value: { changes: { productTypeId: "surf-1" } } });
    if (checked.ok) expect(correctionRefusal("PROGRAMMATEUR", "EN_ANALYSE", correctionTouches(surfaceBody, checked.value))).toBeNull();
    // A line without a family, left so: the empty select is no change.
    const bare = { ...water, productTypeId: null };
    expect(validateIntake(correctionBody("EAU", correctionValues(bare), null, "famille", scope), currentOf(bare))).toEqual({ ok: false, error: "Aucune modification à enregistrer." });
  });
});

describe("analysesNotice — what the analyses on screen do to the results (16/10, Q91)", () => {
  const sample = { status: "EN_ANALYSE" as const, parameterIds: ["p1", "p2", "p3"], productTypeId: "type-1", unitCount: 5 };
  const same = { productTypeId: "type-1", unitCount: 5 };

  it("says nothing before the bench: no result is typed yet", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME"] as const) {
      expect(analysesNotice({ ...sample, status }, ["p1"], same), status).toBeNull();
    }
  });

  it("a withdrawal: only the withdrawn analyses' results go, the sample keeps its step", () => {
    expect(analysesNotice(sample, ["p1", "p3"], same)).toEqual({
      tone: "info",
      text: "Seuls les résultats de l'analyse retirée sont effacés ; les autres sont gardés et l'échantillon reste à son étape.",
    });
    expect(analysesNotice({ ...sample, status: "RESULTATS_SAISIS" }, ["p1"], same)).toEqual({
      tone: "info",
      text: "Seuls les résultats des analyses retirées sont effacés ; les autres sont gardés et l'échantillon reste à son étape (une validation technique déjà donnée est à refaire).",
    });
  });

  it("an addition, another product type or other units: every result goes, back to the bench from the validation", () => {
    expect(analysesNotice(sample, ["p1", "p2", "p3", "p4"], same)?.tone).toBe("warning");
    expect(analysesNotice(sample, ["p1", "p2", "p3"], { ...same, unitCount: 9 })?.text).toBe(
      "Ajouter une analyse, changer la famille de produits ou le nombre d'unités efface tous les résultats déjà saisis."
    );
    expect(analysesNotice({ ...sample, status: "RESULTATS_SAISIS" }, ["p1"], { ...same, productTypeId: "" })?.text).toBe(
      "Ajouter une analyse, changer la famille de produits ou le nombre d'unités efface tous les résultats déjà saisis et renvoie l'échantillon à la paillasse."
    );
  });

  it("nothing changed yet: the rule, in one sentence", () => {
    expect(analysesNotice(sample, ["p3", "p2", "p1"], same)).toEqual({
      tone: "info",
      text: "Retirer une analyse n'efface que ses résultats. Ajouter une analyse, changer la famille de produits ou le nombre d'unités efface tous les résultats déjà saisis.",
    });
  });

  it("every analysis unticked: keep one — a sample nobody can analyse is cancelled, by whoever cancels at this step", () => {
    expect(analysesNotice(sample, [], same)).toEqual({
      tone: "warning",
      text: "Gardez au moins une analyse. Si aucune ne peut être faite, l'échantillon s'annule (par la validation, la Direction ou l'administrateur).",
    });
    // Before the programme (the reception's own dialog): the réception and the administrator cancel.
    for (const status of ["PRELEVE", "RECU"] as const) {
      expect(analysesNotice({ ...sample, status }, [], same), status).toEqual({
        tone: "warning",
        text: "Gardez au moins une analyse. Si aucune ne peut être faite, l'échantillon s'annule (par la réception ou l'administrateur).",
      });
    }
  });

  it("a line still without any analysis (the programme decides them) is corrected without a warning", () => {
    expect(analysesNotice({ ...sample, status: "RECU", parameterIds: [] }, [], same)).toBeNull();
  });
});

describe("cancelConsequences — what « Annuler » says (16/10, D1: the validation desks cancel billable work)", () => {
  it("before the programme: out of the billing too, nothing billed yet", () => {
    expect(cancelConsequences({ status: "RECU" })).toEqual({ text: "L'échantillon sort de toutes les files, du rapport et de la facturation.", warnings: [] });
  });

  it("billable, on no invoice: out of the billing", () => {
    expect(cancelConsequences({ status: "EN_ANALYSE", invoiced: null, alertsSentAt: null }).text).toContain("et de la facturation");
  });

  it("invoiced or on a draft: the line stays, the accountant settles it", () => {
    const issued = cancelConsequences({ status: "RESULTATS_SAISIS", invoiced: { number: "FAC-2026-00012", issued: true }, alertsSentAt: null });
    expect(issued.text).toBe("L'échantillon sort de toutes les files et du rapport.");
    expect(issued.warnings).toEqual(["Déjà facturé (FAC-2026-00012) : sa ligne reste sur la facture, la comptabilité établira un avoir."]);
    expect(cancelConsequences({ status: "PROGRAMME", invoiced: { number: null, issued: false } }).warnings[0]).toContain("brouillon de facture");
  });

  it("an issued invoice told without its number (a role outside the billing, 25/10): the warning, never the draft's sentence", () => {
    // The validateur's « Annuler » on /validation/[id]: `heldInvoiceFor` keeps `issued`, drops the number.
    const told = heldInvoiceFor({ number: "FAC-2026-00012" }, "VALIDATEUR");
    const { text, warnings } = cancelConsequences({ status: "RESULTATS_SAISIS", invoiced: told, alertsSentAt: null });
    expect(text).toBe("L'échantillon sort de toutes les files et du rapport.");
    expect(warnings).toEqual(["Déjà facturé : la comptabilité établira un avoir."]);
    expect(warnings.join(" ")).not.toMatch(/FAC-|brouillon/);
    // The Direction and the administrator keep the number.
    for (const role of ["DIRECTION", "ADMIN"] as const) {
      const full = cancelConsequences({ status: "RESULTATS_SAISIS", invoiced: heldInvoiceFor({ number: "FAC-2026-00012" }, role) });
      expect(full.warnings[0], role).toContain("(FAC-2026-00012)");
    }
    // A draft stays a draft for everyone.
    expect(cancelConsequences({ status: "PROGRAMME", invoiced: heldInvoiceFor({ number: null }, "VALIDATEUR") }).warnings[0]).toContain(
      "brouillon de facture"
    );
  });

  it("an alert already sent stays with the client", () => {
    const { warnings } = cancelConsequences({ status: "RESULTATS_SAISIS", invoiced: null, alertsSentAt: "2026-10-19T08:00:00.000Z" });
    expect(warnings).toEqual(["Une alerte de contamination est déjà partie chez le client : il ne recevra pas de rapport pour cet échantillon."]);
  });

  it("a page that did not read the invoice says what happens if one holds it", () => {
    expect(cancelConsequences({ status: "EN_ANALYSE" }).text).toContain("s'il est déjà facturé");
  });
});

describe("billedCorrectionWarning — « Corriger les analyses » on an invoiced sample", () => {
  it("warns once the list on screen differs from the billed one", () => {
    const sample = { parameterIds: ["p1", "p2"], invoiced: { number: "FAC-2026-00012", issued: true } };
    expect(billedCorrectionWarning(sample, ["p2", "p1"])).toBeNull();
    expect(billedCorrectionWarning(sample, ["p1"])).toContain("FAC-2026-00012");
    expect(billedCorrectionWarning({ ...sample, invoiced: null }, ["p1"])).toBeNull();
  });

  it("for the responsable des paramètres (25/10): « déjà facturé » without the number, never the draft's sentence", () => {
    const sample = { parameterIds: ["p1", "p2"], invoiced: heldInvoiceFor({ number: "FAC-2026-00012" }, "PROGRAMMATEUR") };
    expect(billedCorrectionWarning(sample, ["p1"])).toBe("Échantillon déjà facturé : prévenez la comptabilité.");
    const draft = { ...sample, invoiced: heldInvoiceFor({ number: null }, "PROGRAMMATEUR") };
    expect(billedCorrectionWarning(draft, ["p1"])).toContain("brouillon de facture");
    // The administrator, on the same sheet, keeps it.
    const admin = { ...sample, invoiced: heldInvoiceFor({ number: "FAC-2026-00012" }, "ADMIN") };
    expect(billedCorrectionWarning(admin, ["p1"])).toContain("(FAC-2026-00012)");
  });
});
