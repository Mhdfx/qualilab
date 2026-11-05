import { describe, expect, it } from "vitest";
import {
  SERIE_LOGO_CHOICES,
  accreditationFromLegacyName,
  accreditationContradictsName,
  accreditationLogoDecision,
  accreditationLogoHint,
  accreditationLogoJournal,
  accreditationLogoPosted,
  accreditationLogoRule,
  accreditationLogoTickable,
  conclusionParameterName,
  markedParameterName,
  nameWithoutLegacyMark,
  parseAccreditationUpdates,
  reportCarriesAccreditationLogo,
  requestedAccreditationLogo,
} from "./accreditation";
import { ACCREDITATION_LOGO_BY_HAND, ACCREDITATION_LOGO_ON_MIXED_REPORT } from "./lab-proposals";
import { buildConclusion, uninterpretedSentence } from "./report-html";

describe("accreditationFromLegacyName (K4, the old software's marks)", () => {
  it("reads « (SA) », « (SN) » and a trailing « * »", () => {
    expect(accreditationFromLegacyName("Plomb (SA)")).toBe("SOUS_TRAITE_ACCREDITE");
    expect(accreditationFromLegacyName("Vibrio Parahaemolyticus (sa) ")).toBe("SOUS_TRAITE_ACCREDITE");
    expect(accreditationFromLegacyName("Histamine (SN)")).toBe("SOUS_TRAITE_NON_ACCREDITE");
    expect(accreditationFromLegacyName("Levures *")).toBe("NON_ACCREDITE");
    expect(accreditationFromLegacyName("Moisissures*")).toBe("NON_ACCREDITE");
  });

  it("never proposes « accrédité » from a name without a mark", () => {
    expect(accreditationFromLegacyName("Salmonella spp.")).toBeNull();
    expect(accreditationFromLegacyName("Coliformes (MI)")).toBeNull();
    expect(accreditationFromLegacyName("SA total")).toBeNull();
  });
});

describe("markedParameterName", () => {
  it("prints the legend's mark after the name, none for an accredited or unknown one", () => {
    expect(markedParameterName("Levures", "NON_ACCREDITE")).toBe("Levures *");
    expect(markedParameterName("Plomb", "SOUS_TRAITE_ACCREDITE")).toBe("Plomb (SA)");
    expect(markedParameterName("Histamine", "SOUS_TRAITE_NON_ACCREDITE")).toBe("Histamine (SN)");
    expect(markedParameterName("Salmonella", "ACCREDITE")).toBe("Salmonella");
    expect(markedParameterName("Salmonella", null)).toBe("Salmonella");
    expect(markedParameterName("Salmonella", undefined)).toBe("Salmonella");
  });

  it("does not mark twice a name that already carries its mark", () => {
    expect(markedParameterName("Plomb (SA)", "SOUS_TRAITE_ACCREDITE")).toBe("Plomb (SA)");
    expect(markedParameterName("Levures *", "NON_ACCREDITE")).toBe("Levures *");
  });

  it("prints only the mark of the status recorded, never the old software's mark left in the name", () => {
    expect(markedParameterName("Chlore (SA)", "ACCREDITE")).toBe("Chlore");
    expect(markedParameterName("Chlore (SA)", "NON_ACCREDITE")).toBe("Chlore *");
    expect(markedParameterName("Bacillus cereus (SA)", "SOUS_TRAITE_NON_ACCREDITE")).toBe("Bacillus cereus (SN)");
    expect(markedParameterName("Levures *", "ACCREDITE")).toBe("Levures");
    expect(markedParameterName("Plomb (sa) *", "SOUS_TRAITE_ACCREDITE")).toBe("Plomb (SA)");
    // « À préciser »: the name as it is.
    expect(markedParameterName("Chlore (SA)", null)).toBe("Chlore (SA)");
  });

  it("strips the trailing marks only, and never empties a name", () => {
    expect(nameWithoutLegacyMark("Chlore (SA)")).toBe("Chlore");
    expect(nameWithoutLegacyMark("Germes (SA) *  ")).toBe("Germes");
    expect(nameWithoutLegacyMark("Salmonella (SA) spp.")).toBe("Salmonella (SA) spp.");
    expect(nameWithoutLegacyMark("*")).toBe("*");
  });

  it("flags a status contradicting the name's old mark (/admin/parametres warns)", () => {
    expect(accreditationContradictsName("Chlore (SA)", "ACCREDITE")).toBe(true);
    expect(accreditationContradictsName("Chlore (SA)", "SOUS_TRAITE_ACCREDITE")).toBe(false);
    expect(accreditationContradictsName("Chlore (SA)", null)).toBe(false);
    expect(accreditationContradictsName("Chlore", "NON_ACCREDITE")).toBe(false);
  });
});

describe("reportCarriesAccreditationLogo", () => {
  it("prints the logo on a report with at least one accredited analysis (mixed: R-18, ON)", () => {
    expect(ACCREDITATION_LOGO_ON_MIXED_REPORT).toBe(true);
    expect(reportCarriesAccreditationLogo(["ACCREDITE", "NON_ACCREDITE"])).toBe(true);
    expect(reportCarriesAccreditationLogo(["ACCREDITE"])).toBe(true);
  });

  it("never without an accredited analysis of the laboratory's own", () => {
    expect(reportCarriesAccreditationLogo(["NON_ACCREDITE", "SOUS_TRAITE_ACCREDITE"])).toBe(false);
    expect(reportCarriesAccreditationLogo([null, undefined])).toBe(false);
    expect(reportCarriesAccreditationLogo([])).toBe(false);
  });

  it("with the switch off, only when every analysis is accredited (own or subcontracted)", () => {
    expect(reportCarriesAccreditationLogo(["ACCREDITE", "NON_ACCREDITE"], false)).toBe(false);
    expect(reportCarriesAccreditationLogo(["ACCREDITE", null], false)).toBe(false);
    expect(reportCarriesAccreditationLogo(["ACCREDITE", "SOUS_TRAITE_ACCREDITE"], false)).toBe(true);
  });
});

describe("parseAccreditationUpdates", () => {
  it("reads each id once with a known status or « à préciser »", () => {
    expect(
      parseAccreditationUpdates({ updates: [{ id: "p1", accreditation: "ACCREDITE" }, { id: "p2", accreditation: null }, { id: "p3", accreditation: "" }] })
    ).toEqual({
      ok: true,
      value: [
        { id: "p1", accreditation: "ACCREDITE" },
        { id: "p2", accreditation: null },
        { id: "p3", accreditation: null },
      ],
    });
  });

  it("refuses an empty list, a duplicate, an unknown status", () => {
    expect(parseAccreditationUpdates({ updates: [] }).ok).toBe(false);
    expect(parseAccreditationUpdates(null).ok).toBe(false);
    expect(parseAccreditationUpdates({ updates: [{ id: "p1", accreditation: "OUI" }] })).toEqual({ ok: false, error: "Statut d'accréditation inconnu." });
    expect(parseAccreditationUpdates({ updates: [{ id: "p1" }, { id: "p1" }] })).toEqual({ ok: false, error: "Un paramètre figure deux fois." });
  });
});

describe("conclusionParameterName (K4 × J3: the conclusion names a parameter as its table does)", () => {
  it("drops the old software's mark once a status is saved, keeps the name as typed before", () => {
    expect(conclusionParameterName({ name: "Chlore (SA)", accreditation: "ACCREDITE" })).toBe("Chlore");
    expect(conclusionParameterName({ name: "Chlore (SA)", accreditation: "NON_ACCREDITE" })).toBe("Chlore");
    expect(conclusionParameterName({ name: "Chlore (SA)", accreditation: null })).toBe("Chlore (SA)");
    expect(conclusionParameterName({ name: "E. coli", accreditation: "ACCREDITE" })).toBe("E. coli");
  });

  it("the conclusion built from it reads « … : Chlore. », never « Chlore (SA) »", () => {
    const chlore = conclusionParameterName({ name: "Chlore (SA)", accreditation: "ACCREDITE" });
    expect(uninterpretedSentence([chlore])).toMatch(/: Chlore\.$/);
    expect(buildConclusion([{ conform: false, parameter: chlore }])).toContain("pour : Chlore.");
    expect(buildConclusion([{ conform: false, parameter: chlore }])).not.toContain("(SA)");
  });
});


describe("K10 (lot 4A — Q13 of 04/11): the logo by default, the hand may change it", () => {
  it("is on — « mettre le logo par défaut mais de laisser la main pour modifier »", () => {
    expect(ACCREDITATION_LOGO_BY_HAND).toBe(true);
  });

  it("the rule decides when the box was not touched (null) or left as it started", () => {
    expect(accreditationLogoDecision({ uploaded: true, byRule: true, choice: null })).toEqual({ printed: true, byRule: true, byHand: false });
    expect(accreditationLogoDecision({ uploaded: true, byRule: false, choice: null })).toEqual({ printed: false, byRule: false, byHand: false });
    expect(accreditationLogoDecision({ uploaded: true, byRule: true, choice: true })).toEqual({ printed: true, byRule: true, byHand: false });
  });

  it("the signer removes it, or adds it — by hand, journalled so", () => {
    const removed = accreditationLogoDecision({ uploaded: true, byRule: true, choice: false });
    expect(removed).toEqual({ printed: false, byRule: true, byHand: true });
    expect(accreditationLogoJournal(removed)).toBe("retiré à la main");
    const added = accreditationLogoDecision({ uploaded: true, byRule: false, addable: true, choice: true });
    expect(added).toEqual({ printed: true, byRule: false, byHand: true });
    expect(accreditationLogoJournal(added)).toBe("ajouté à la main");
    expect(accreditationLogoJournal({ printed: true, byRule: true, byHand: false })).toBe("imprimé (règle par défaut)");
    expect(accreditationLogoJournal({ printed: false, byRule: false, byHand: false })).toBe("non imprimé (règle par défaut)");
  });

  it("without the file nothing prints, whatever was ticked", () => {
    expect(accreditationLogoDecision({ uploaded: false, byRule: true, choice: true })).toEqual({ printed: false, byRule: false, byHand: false });
  });

  it("the switch off: the box is ignored, the rule alone", () => {
    expect(accreditationLogoDecision({ uploaded: true, byRule: true, choice: false }, false)).toEqual({ printed: true, byRule: true, byHand: false });
  });

  it("never ADDS the logo to a report without an accredited analysis (ISO 17025 §7.8 — hypothèse, à confirmer par C-4)", () => {
    // Every status « à préciser » (production today): a tick is not followed.
    const toSpecify = accreditationLogoRule([null, null]);
    expect(toSpecify).toEqual({ byRule: false, addable: false, reason: "TO_SPECIFY" });
    expect(accreditationLogoDecision({ uploaded: true, ...toSpecify, choice: true })).toEqual({ printed: false, byRule: false, byHand: false });
    // Subcontracted accredited only: not the laboratory's own accreditation.
    const subcontracted = accreditationLogoRule(["SOUS_TRAITE_ACCREDITE", "NON_ACCREDITE"]);
    expect(subcontracted).toEqual({ byRule: false, addable: false, reason: "NONE_ACCREDITED" });
    expect(accreditationLogoDecision({ uploaded: true, ...subcontracted, choice: true }).printed).toBe(false);
    // `addable` absent: never wider than the rule.
    expect(accreditationLogoDecision({ uploaded: true, byRule: false, choice: true }).printed).toBe(false);
    // A mixed report with the switch off: the hand may add it (an accredited analysis is there).
    const mixed = accreditationLogoRule(["ACCREDITE", "NON_ACCREDITE"], false);
    expect(mixed).toEqual({ byRule: false, addable: true, reason: "MIXED" });
    expect(accreditationLogoDecision({ uploaded: true, ...mixed, choice: true })).toEqual({ printed: true, byRule: false, byHand: true });
    // Removing stays always allowed.
    const accredited = accreditationLogoRule(["ACCREDITE", null]);
    expect(accredited).toEqual({ byRule: true, addable: true, reason: "ACCREDITED" });
    expect(accreditationLogoDecision({ uploaded: true, ...accredited, choice: false })).toEqual({ printed: false, byRule: true, byHand: true });
    expect(accreditationLogoTickable(toSpecify)).toBe(false);
    expect(accreditationLogoTickable(mixed)).toBe(true);
    expect(accreditationLogoTickable(accredited)).toBe(true);
  });

  it("the panel posts null (the rule, read again at the issue) unless the signer changed the box", () => {
    expect(accreditationLogoPosted(null, true)).toBeNull();
    // Untouched (or ticked back): null — a rule changed since the page loaded is not frozen as a hand choice.
    expect(accreditationLogoPosted({ byRule: true }, true)).toBeNull();
    expect(accreditationLogoPosted({ byRule: false }, false)).toBeNull();
    // Changed: the box's state.
    expect(accreditationLogoPosted({ byRule: true }, false)).toBe(false);
    expect(accreditationLogoPosted({ byRule: false }, true)).toBe(true);
  });

  it("the box says the rule, its reason, and whether the hand changed it", () => {
    const accredited = accreditationLogoRule(["ACCREDITE"]);
    expect(accreditationLogoHint(accredited, true)).toMatch(/^Par défaut, le logo s'imprime : le rapport porte au moins une analyse accréditée\. Décochez ou cochez/);
    expect(accreditationLogoHint(accredited, false)).toMatch(/Modifié à la main pour ce rapport : le logo ne sera pas imprimé/);
    const mixed = accreditationLogoRule(["ACCREDITE", "NON_ACCREDITE"], false);
    expect(accreditationLogoHint(mixed, false)).toBe(
      "Par défaut, pas de logo : rapport mixte, le logo n'est imprimé que si toutes les analyses sont accréditées. Décochez ou cochez pour ce rapport seulement ; le choix est figé avec le rapport émis."
    );
    expect(accreditationLogoHint(mixed, true)).toMatch(/le logo sera imprimé/);
    // « À préciser »: never claims the analyses are not accredited.
    expect(accreditationLogoHint(accreditationLogoRule([null, "NON_ACCREDITE"]), false)).toBe(
      "Pas de logo : aucune analyse de ce rapport n'est marquée « accréditée » (statuts à préciser dans /admin/parametres). Le logo ne peut pas être ajouté à ce rapport."
    );
    expect(accreditationLogoHint(accreditationLogoRule(["NON_ACCREDITE"]), false)).toBe(
      "Pas de logo : aucune analyse de ce rapport n'est accréditée. Le logo ne peut pas être ajouté à ce rapport."
    );
  });

  it("reads back the choice an approval asked for (the repair of a failed issue)", () => {
    expect(requestedAccreditationLogo(JSON.stringify({ accreditationLogoRequested: false }))).toBe(false);
    expect(requestedAccreditationLogo(JSON.stringify({ accreditationLogoRequested: true }))).toBe(true);
    expect(requestedAccreditationLogo(JSON.stringify({ reportNumber: null }))).toBeNull();
    expect(requestedAccreditationLogo("{not json")).toBeNull();
    expect(requestedAccreditationLogo(null)).toBeNull();
  });

  it("the série: the rule (null, the default), all, none", () => {
    expect(SERIE_LOGO_CHOICES.map((choice) => [choice.key, choice.value])).toEqual([
      ["RULE", null],
      ["ALL", true],
      ["NONE", false],
    ]);
  });
});
