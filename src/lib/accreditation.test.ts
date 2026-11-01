import { describe, expect, it } from "vitest";
import {
  accreditationFromLegacyName,
  accreditationContradictsName,
  conclusionParameterName,
  markedParameterName,
  nameWithoutLegacyMark,
  parseAccreditationUpdates,
  reportCarriesAccreditationLogo,
} from "./accreditation";
import { ACCREDITATION_LOGO_ON_MIXED_REPORT } from "./lab-proposals";
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
