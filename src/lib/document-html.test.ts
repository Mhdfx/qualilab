import { describe, expect, it } from "vitest";
import { buildBonHtml, buildProtocolHtml, surfaceText, type SerieDocumentData } from "./document-html";
import { DEFAULT_THRESHOLDS } from "./reception-rules";

const base: SerieDocumentData = {
  serialNumber: "2754/26",
  clientReference: "F-1021",
  clientName: "Restaurant Le Palmier",
  clientAddress: "12 rue des Orangers",
  clientPhone: "05 22 00 00 00",
  siteName: "Cuisine centrale",
  cadre: "AUTOCONTROLE",
  interlocutor: "Karim",
  samplerKind: "QUALILAB",
  samplerName: "Aymane Labi",
  samplerFunction: "Préleveur",
  analysesMicro: true,
  analysesChimie: false,
  receivedByName: "Salma Idrissi",
  startedAt: new Date("2026-09-03T12:00:00"),
  endedAt: new Date("2026-09-03T12:30:00"),
  arrivedAt: new Date("2026-09-03T14:30:00"),
  coolerTemperature: 1,
  advanceAmount: null,
  advanceMode: null,
  notes: null,
  reference: { docType: "PROTOCOLE", reference: "PG04/EN01", version: "F", createdOn: new Date("2007-11-26"), updatedOn: new Date("2024-10-01") },
  lines: [
    {
      lineNumber: 1,
      lineKind: "ALIMENT",
      designation: "Salade Gaillardière",
      surface: null,
      numeroLot: "L-2409",
      productionDate: new Date("2026-09-01"),
      expiryDate: new Date("2026-09-04"),
      quantity: 1,
      quantityUnit: "UNITE",
      lieu: "Poste salades",
      productTemperature: 1,
      ambientTemperature: 2,
      receptionTemperature: null,
      remarks: null,
      unitCount: 5,
      family: "MICRO",
      parameters: ["Coliformes totaux", "E. coli"],
      controlCode: null,
      conformity: null,
      conformityReason: null,
    },
    {
      lineNumber: 2,
      lineKind: "MAINS",
      designation: "Hamza Bassou — Chef cuisine (mains lavées)",
      surface: "MAIN",
      numeroLot: null,
      productionDate: null,
      expiryDate: null,
      quantity: null,
      quantityUnit: null,
      lieu: "Chef cuisine",
      productTemperature: 25,
      ambientTemperature: null,
      receptionTemperature: null,
      remarks: "Lavée",
      unitCount: 1,
      family: "MICRO",
      parameters: ["Flore totale surfaces"],
      controlCode: null,
      conformity: null,
      conformityReason: null,
    },
  ],
};

describe("buildProtocolHtml — PG04/EN01", () => {
  const html = buildProtocolHtml(base);

  it("prints the cartouche, the série number and the header fields", () => {
    expect(html).toContain("Protocole de prélèvement");
    expect(html).toContain("PG04/EN01");
    expect(html).toContain("<td>F</td>");
    expect(html).toContain("26/11/2007");
    expect(html).toContain("2754/26");
    expect(html).toContain("F-1021");
    expect(html).toContain("Cuisine centrale");
    expect(html).toContain("Aymane Labi");
    expect(html).toContain("1 °C");
  });

  it("lays the lines out like the paper (surface column, DLC, temperatures) and pads to eight rows", () => {
    expect(html).toContain("MAIN");
    expect(html).toContain("L-2409");
    expect(html).toContain("P : 01/09/2026");
    expect(html).toContain("T°p 25 °C");
    expect(html).toContain("n = 5");
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(9); // header + 8 lines
    expect(html).toContain('<td class="num">8</td>');
  });

  it("never carries a N° de contrôle and keeps the two analysis columns", () => {
    expect(html).not.toContain("N° de contrôle");
    expect(html).toContain('<span class="box checked"></span>Analyses microbiologiques');
    expect(html).toContain('<span class="box"></span>Analyses physico-chimiques');
    expect(html).toContain("Fonction : Préleveur");
    expect(html).toContain("Coliformes totaux, E. coli");
    expect(html).toContain("Signature et cachet de l'interlocuteur");
  });
});

describe("buildBonHtml — PG05/EN04", () => {
  const deposit: SerieDocumentData = {
    ...base,
    samplerKind: "CLIENT",
    samplerName: null,
    advanceAmount: 350,
    advanceMode: "ESPECES",
    reference: { docType: "BON_RECEPTION", reference: "PG05/EN04", version: "G", createdOn: null, updatedOn: null },
    lines: [
      { ...base.lines[0], quantity: 250, quantityUnit: "G", receptionTemperature: 4, controlCode: "20459/26", conformity: true },
      { ...base.lines[0], lineNumber: 2, designation: "Eau du réseau", lineKind: "EAU", quantity: 0.5, quantityUnit: "L", receptionTemperature: 12, controlCode: "20460/26", conformity: false, conformityReason: "QUANTITE_INSUFFISANTE" },
    ],
  };
  const html = buildBonHtml(deposit, undefined, { ...DEFAULT_THRESHOLDS, minFoodMicroG: 150 });

  it("prints the seven rules with the lab's thresholds, the advance and the control numbers", () => {
    expect(html).toContain("Bon de réception");
    expect(html).toContain("PG05/EN04");
    expect(html).toContain("Poids minimal 150 g pour les aliments (analyses microbiologiques)");
    expect(html).toContain("si Salmonella 6 L");
    expect(html).toContain("9 échantillons de 100 g");
    expect(html).toContain("350,00 DH");
    expect(html).toContain("Espèces");
    expect(html).toContain("20459/26");
    expect(html).toContain("Quantité insuffisante");
    expect(html).toContain("Salma Idrissi");
    expect(html).toContain("Signature du client");
  });

  it("shows an empty cartouche date as a dash", () => {
    expect(html).toContain("<th>Créé le</th><td>—</td>");
  });
});

describe("surfaceText", () => {
  it("prints the area for a surface, MAIN for hands, nothing otherwise", () => {
    expect(surfaceText({ lineKind: "SURFACE", surfaceAreaCm2: 100 })).toBe("100 cm²");
    expect(surfaceText({ lineKind: "MAINS", surfaceAreaCm2: null })).toBe("MAIN");
    expect(surfaceText({ lineKind: "ALIMENT", surfaceAreaCm2: null })).toBeNull();
  });
});
