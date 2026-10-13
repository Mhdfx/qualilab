import { describe, expect, it } from "vitest";
import { COMPANY, type CompanyInfo } from "./company";
import {
  AIR_SAMPLING_PROCEDURE,
  REPORT_EXECUTION_PLACE,
  REPORT_LEGEND,
  REPORT_NB,
  SAMPLING_PROCEDURES,
  analysisPeriodText,
  legalFooterExtraLines,
  reportDateTime,
  reportDay,
  reportLegalFooter,
  reportSampler,
  reportTemperatures,
  temperatureText,
} from "./report-template";

describe("the template's fixed wording (PG06/EN03 version M)", () => {
  it("keeps the references and the place of execution of the template", () => {
    expect(SAMPLING_PROCEDURES).toBe("PG04/EN01 & PG04/IT03");
    expect(AIR_SAMPLING_PROCEDURE).toBe("PG06/IT55");
    expect(REPORT_EXECUTION_PLACE).toBe("Laboratoire permanent Casablanca");
  });

  it("prints the legend in the template's three lines", () => {
    expect(REPORT_LEGEND).toHaveLength(3);
    expect(REPORT_LEGEND.join(" ")).toBe(
      "* Paramètres non accrédité ; UFC Unité formant colonie ; N/A Non applicable ; SA Paramètre sous-traité accrédité ; SN Paramètre sous-traité non accrédité ; DPC Paramètres demandés par le client ; LQ Limite de quantification ; LD Limite de détection ; Ne Nombre estimé ; VC Version Corrigée ; présence= (1 UFC,2 UFC) pour eau ; IC : Information fournies par le client"
    );
  });

  it("prints the six lines of the « N.B » block, the bold ones as the template", () => {
    expect(REPORT_NB.map((line) => `${line.lead ?? ""}${line.text}`)).toEqual([
      "N.B : les résultats ne se rapportent qu'aux objets soumis à l'essai et tel qu'ils ont été reçu.",
      "La déclaration de la conformité sans tenir compte l'incertitude",
      "La déclaration de la conformité ne concerne que les paramètres analysés selon les critères ci-dessus",
      "Le rapport d'analyse ne doit pas être reproduit, en partie ou en totalité, sans accord écrit du laboratoire",
      "Les résultats ne tiennent pas compte des incertitudes. Elles sont disponibles sur demande.",
      "Le laboratoire est exonéré de toute responsabilité au sujet des informations fournies par le client (IC) pouvant affecter la validité des résultats.",
    ]);
    expect(REPORT_NB[4].bold).toBe(true);
    expect(REPORT_NB[5].text.slice(REPORT_NB[5].boldFrom)).toMatch(/^laboratoire est exonéré/);
  });
});

describe("reportLegalFooter — built from /admin/entreprise", () => {
  const company: CompanyInfo = {
    ...COMPANY,
    name: " Labo Démo ",
    address: "1 rue Test",
    city: "Ville",
    phone: "05 00",
    email: "x@test.invalid",
    website: "www.test.invalid",
    rc: "RC-TEST",
    fiscalId: "IF-TEST",
    patente: "PAT-TEST",
    cnss: "CNSS-TEST",
    fax: "05 01",
  };

  it("prints the template's lines in its order", () => {
    expect(reportLegalFooter(company)).toEqual({
      name: "Labo Démo",
      address: "Adresse : 1 rue Test, Ville",
      contact: ["Tel : 05 00", "Fax : 05 01", "E-mail : x@test.invalid", "www.test.invalid"],
      legal: ["IF : IF-TEST", "RC : RC-TEST", "Patente : PAT-TEST", "CNSS : CNSS-TEST"],
    });
  });

  it("leaves out an empty field, never a placeholder", () => {
    const footer = reportLegalFooter({ ...company, fax: null, fiscalId: "  ", patente: null, cnss: null, website: "" });
    expect(footer.contact).toEqual(["Tel : 05 00", "E-mail : x@test.invalid"]);
    expect(footer.legal).toEqual(["RC : RC-TEST"]);
    expect(reportLegalFooter({ ...company, rc: "", fiscalId: null, patente: null, cnss: null }).legal).toEqual([]);
    expect(reportLegalFooter({ ...company, address: "", city: " " }).address).toBeNull();
    expect(reportLegalFooter({ ...company, address: "", city: "Ville" }).address).toBe("Adresse : Ville");
  });

  it("prints no legal identifier from the defaults: the owner types them", () => {
    expect(reportLegalFooter(COMPANY).legal.join(" ")).not.toMatch(/IF :|Patente|CNSS/);
    expect(reportLegalFooter(COMPANY).contact.join(" ")).not.toContain("Fax");
  });
});

describe("legalFooterExtraLines — the footer grows upwards, the page's foot with it", () => {
  it("counts no extra line for the identity as typed today", () => {
    expect(legalFooterExtraLines(COMPANY)).toBe(0);
    expect(legalFooterExtraLines({ ...COMPANY, fiscalId: "1".repeat(30), patente: "2".repeat(30), cnss: "3".repeat(30) })).toBe(0);
  });

  it("counts the lines a long field wraps to, on the safe side", () => {
    // « Adresse : » + 240 characters + « , Ville »: two lines more at 150 a line.
    expect(legalFooterExtraLines({ ...COMPANY, address: "a".repeat(240), city: "Ville" })).toBe(1);
    expect(legalFooterExtraLines({ ...COMPANY, address: "a".repeat(300), city: "Ville" })).toBe(2);
    expect(legalFooterExtraLines({ ...COMPANY, name: "n".repeat(150) })).toBe(1);
    expect(legalFooterExtraLines({ ...COMPANY, email: "e".repeat(180) })).toBe(1);
  });
});

describe("the fields of the template", () => {
  it("prints a date and time on the laboratory's clock", () => {
    expect(reportDateTime(new Date("2026-10-12T08:30:00Z"))).toBe("12/10/2026 à 08h30");
    // Before Morocco's return to GMT (20/09/2026) the clock was UTC+1.
    expect(reportDateTime(new Date("2026-09-10T23:30:00Z"))).toBe("11/09/2026 à 00h30");
    expect(reportDateTime(null)).toBeNull();
    expect(reportDay(new Date("2026-09-10T23:30:00Z"))).toBe("11/09/2026");
    expect(reportDay(undefined)).toBeNull();
  });

  it("reads « Date d'analyse » as one day or « du … au … »", () => {
    const from = new Date("2026-10-12T09:00:00Z");
    expect(analysisPeriodText(from, new Date("2026-10-12T17:00:00Z"))).toBe("12/10/2026");
    expect(analysisPeriodText(from, new Date("2026-10-14T08:00:00Z"))).toBe("du 12/10/2026 au 14/10/2026");
    expect(analysisPeriodText(from, null)).toBe("12/10/2026");
    expect(analysisPeriodText(null, new Date("2026-10-14T08:00:00Z"))).toBe("14/10/2026");
    expect(analysisPeriodText(null, undefined)).toBeNull();
    // An entry dated before the start never makes a period run backwards.
    expect(analysisPeriodText(from, new Date("2026-10-10T08:00:00Z"))).toBe("12/10/2026");
  });

  it("names the sampler as « Préleveur » prints it", () => {
    expect(reportSampler({ samplerKind: "QUALILAB", samplerUserName: "Préleveur Un", samplerName: null, recordedBy: "Autre" })).toBe("Préleveur Un");
    expect(reportSampler({ samplerKind: "QUALILAB", samplerUserName: null, samplerName: null, recordedBy: "Préleveur Deux" })).toBe("Préleveur Deux");
    expect(reportSampler({ samplerKind: "QUALILAB", samplerUserName: " ", samplerName: null, recordedBy: null })).toBe("Qualilab");
    // A deposit: never the receptionist who recorded it.
    expect(reportSampler({ samplerKind: "CLIENT", samplerUserName: null, samplerName: null, recordedBy: "Réception" })).toBe("Le client");
    expect(reportSampler({ samplerKind: "AUTRE", samplerUserName: null, samplerName: "Service Démo", recordedBy: "Réception" })).toBe("Service Démo");
    expect(reportSampler({ samplerKind: "AUTRE", samplerUserName: null, samplerName: null, recordedBy: "Réception" })).toBe("Autre");
    expect(reportSampler({ samplerKind: "SERVICE_VETERINAIRE", samplerUserName: null, samplerName: "Dr Test", recordedBy: null })).toBe(
      "Prélèvement effectué par le service vétérinaire — Dr Test"
    );
  });

  it("splits the temperatures between the product and the cooler by where they were read", () => {
    expect(temperatureText(4)).toBe("4 °C");
    expect(temperatureText(-18.5)).toBe("-18,5 °C");
    expect(temperatureText(null)).toBeNull();
    expect(reportTemperatures({ productTemperature: 3.5, receptionTemperature: 4.2, receptionTemperatureSource: "ECHANTILLON", coolerTemperature: 2 })).toEqual({
      atSampling: "3,5 °C",
      atReception: "4,2 °C",
      cooler: "2 °C",
    });
    expect(reportTemperatures({ receptionTemperature: 4.2, receptionTemperatureSource: "GLACIERE" })).toEqual({
      atSampling: null,
      atReception: null,
      cooler: "4,2 °C",
    });
    // The série's cooler reading wins over a sample's reading taken on it.
    expect(reportTemperatures({ receptionTemperature: 4.2, receptionTemperatureSource: "GLACIERE", coolerTemperature: 3 }).cooler).toBe("3 °C");
    expect(reportTemperatures({ receptionTemperature: 6, receptionTemperatureSource: "FLACON_TEMOIN" }).atReception).toBe("6 °C (flacon témoin)");
    // Received before the source was recorded: the sample's own reading.
    expect(reportTemperatures({ receptionTemperature: 5, receptionTemperatureSource: null }).atReception).toBe("5 °C");
    expect(reportTemperatures({})).toEqual({ atSampling: null, atReception: null, cooler: null });
  });
});
