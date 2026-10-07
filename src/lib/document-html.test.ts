import { describe, expect, it } from "vitest";
import {
  buildBonHtml,
  buildProtocolHtml,
  designationHeading,
  protocolRows,
  sampleDesignation,
  surfaceText,
  type DocumentLine,
  type SerieDocumentData,
} from "./document-html";
import { DEFAULT_THRESHOLDS } from "./reception-rules";

const base: SerieDocumentData = {
  serialNumber: "2754/26",
  clientReference: "F-1021",
  clientName: "Restaurant Le Palmier",
  clientAddress: "12 rue des Orangers",
  clientPhone: "05 22 00 00 00",
  siteName: "Cuisine centrale",
  cadre: "AUTRE",
  cadreNote: null,
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
    expect(html).toContain("Référence client : <b>F-1021</b>");
    expect(html).not.toContain("N° de factures");
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
    expect(html).toContain('<span class="case checked"></span>Analyses microbiologiques');
    expect(html).toContain('<span class="case"></span>Analyses physico-chimiques');
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
    // Retour du 19/09 : la colonne se remplit sur n'importe quelle ligne.
    expect(surfaceText({ lineKind: "ALIMENT", surfaceLabel: "Plan de travail", surfaceAreaCm2: null })).toBe("Plan de travail");
    expect(surfaceText({ lineKind: "ALIMENT", surfaceLabel: "Plan de travail", surfaceAreaCm2: 50 })).toBe("Plan de travail · 50 cm²");
    expect(surfaceText({ lineKind: "EAU", surfaceLabel: null, surfaceAreaCm2: 25 })).toBe("25 cm²");
  });
});

/* ------------------------- RETOUR-LABO-06-10.md §5 ------------------------- */

/** A sample of the fixtures below — every field a row of the documents reads. */
function sample(over: Partial<DocumentLine> & Pick<DocumentLine, "lineNumber">): DocumentLine {
  return {
    lineKind: "ALIMENT",
    designation: "Produit test",
    surface: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    quantity: null,
    quantityUnit: null,
    lieu: "Cuisine",
    productTemperature: null,
    ambientTemperature: null,
    receptionTemperature: null,
    remarks: null,
    unitCount: 1,
    family: "MICRO",
    parameters: [],
    controlCode: null,
    conformity: null,
    conformityReason: null,
    ...over,
  };
}

const visit: SerieDocumentData = {
  ...base,
  clientName: "Client Démo",
  siteName: "Restaurant Test",
  analysesMicro: false,
  analysesChimie: false,
  lines: [
    // Échantillon 1: both families ticked — two samples, « 1M » and « 1P ».
    sample({ lineNumber: 1, ref: "1M", designation: "Salade composée", numeroLot: "L-77", quantity: 400, quantityUnit: "G", family: "MICRO", parameters: ["Coliformes totaux", "E. coli"] }),
    sample({ lineNumber: 1, ref: "1P", designation: "Salade composée", numeroLot: "L-77", quantity: 400, quantityUnit: "G", family: "CHIMIE", parameters: ["Matière grasse"] }),
    // Échantillon 2: a surface with its state and a remark.
    sample({ lineNumber: 2, lineKind: "SURFACE", designation: "Planche verte", surface: "100 cm²", surfaceState: "NETTOYE", remarks: "Après service", parameters: ["Flore totale surfaces"] }),
    // Échantillon 3: the air, sampled on an exposed plate.
    sample({ lineNumber: 3, lineKind: "AIR", designation: "Salle", surface: "Boîte exposée 30 min", parameters: ["Flore de l'air"] }),
  ],
};

describe("buildProtocolHtml — one row per échantillon (V3)", () => {
  const html = buildProtocolHtml(visit);
  const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));

  it("merges the two samples of a two-family line into one row", () => {
    expect(protocolRows(visit.lines).map((row) => row.map((l) => l.ref ?? String(l.lineNumber)))).toEqual([
      ["1M", "1P"],
      ["2"],
      ["3"],
    ]);
    expect((body.match(/Salade composée/g) ?? []).length).toBe(1);
    expect(body).toContain('<td class="num">1</td>');
    expect(body).not.toContain("1M");
    // Three échantillons, padded to the paper's eight rows: 4 … 8 are blank.
    expect((body.match(/<tr>/g) ?? []).length).toBe(8);
    expect(body).toContain('<td class="num">4</td>');
    expect(body).toContain('<td class="num">8</td>');
  });

  it("lists the analyses in both columns under the same number and ticks both boxes", () => {
    expect(html).toContain("<h2>Analyses microbiologiques</h2><p><b>1.</b> Coliformes totaux, E. coli</p>");
    expect(html).toContain("<h2>Analyses physico-chimiques</h2><p><b>1.</b> Matière grasse</p>");
    // The série's boxes were left unticked: the samples' families decide.
    expect(html).toContain('<span class="case checked"></span>Analyses microbiologiques');
    expect(html).toContain('<span class="case checked"></span>Analyses physico-chimiques');
  });

  it("leaves a box unticked when no sample is of that family", () => {
    const microOnly = buildProtocolHtml({ ...visit, lines: visit.lines.filter((l) => l.family === "MICRO") });
    expect(microOnly).toContain('<span class="case checked"></span>Analyses microbiologiques');
    expect(microOnly).toContain('<span class="case"></span>Analyses physico-chimiques');
  });

  it("prints the state of a surface in « Remarques », before what was typed", () => {
    expect(body).toContain("<td>Nettoyé · Après service</td>");
    expect(body).toContain("<td>Planche verte</td>");
    expect(body).toContain("<td>100 cm<sup>2</sup></td>");
  });

  it("prints the air method in the « Surface prélevée » column", () => {
    expect(body).toContain("<td>Boîte exposée 30 min</td>");
  });

  it("prints the site of the client and the cadre", () => {
    expect(html).toContain("Client Démo — Restaurant Test");
    expect(html).toContain('<span class="k">Cadre :</span> <b>Autre</b>');
  });

  it("shows each twin's value when only one of the two was destroyed", () => {
    const partly = buildProtocolHtml({
      ...visit,
      lines: [visit.lines[0], { ...visit.lines[1], cancelled: true, destroyed: true }],
    });
    expect(partly).toContain(
      '<span class="small">1M :</span> —<br><span class="small">1P :</span> <span class="nc">Détruit à réception</span>'
    );
    expect(partly).not.toContain("Ligne annulée");
  });

  it("marks a row cancelled once when its two samples are", () => {
    const both = buildProtocolHtml({
      ...visit,
      lines: [
        { ...visit.lines[0], cancelled: true },
        { ...visit.lines[1], cancelled: true },
      ],
    });
    expect(both).toContain('<td><span class="nc">Échantillon annulé</span></td>');
  });
});

describe("cadre (V1)", () => {
  it("prints « Autre — texte » when « Autre » carries a precision", () => {
    const html = buildProtocolHtml({ ...visit, cadre: "AUTRE", cadreNote: "Contrôle vétérinaire" });
    expect(html).toContain("<b>Autre — Contrôle vétérinaire</b>");
  });

  it("prints the label alone for the other cadres, even with a stray note", () => {
    expect(buildProtocolHtml({ ...visit, cadre: "BON_COMMANDE", cadreNote: "ignoré" })).toContain(
      '<span class="k">Cadre :</span> <b>BC</b>'
    );
    expect(buildProtocolHtml({ ...visit, cadre: "DEVIS_VALIDE", cadreNote: null })).toContain("<b>Devis validé</b>");
    expect(buildBonHtml({ ...visit, cadre: "CONVENTION", cadreNote: null })).toContain(
      '<span class="k">Cadre :</span> <b>Convention</b>'
    );
  });

  it("escapes the precision", () => {
    expect(buildProtocolHtml({ ...visit, cadreNote: "<b>x</b>" })).toContain("Autre — &lt;b&gt;x&lt;/b&gt;");
  });
});

describe("buildBonHtml — one row per sample (V3)", () => {
  const deposit: SerieDocumentData = {
    ...visit,
    samplerKind: "CLIENT",
    samplerName: null,
    reference: { docType: "BON_RECEPTION", reference: "PG05/EN04", version: "G", createdOn: null, updatedOn: null },
    lines: [
      { ...visit.lines[0], controlCode: "101/26", conformity: true },
      { ...visit.lines[1], controlCode: "102/26", conformity: true, parameters: [] },
      { ...visit.lines[2], controlCode: "103/26", conformity: true },
    ],
  };
  const html = buildBonHtml(deposit);
  const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));

  it("gives each twin its own row, N° de contrôle and family", () => {
    expect(body).toContain('<td class="num">1M</td>');
    expect(body).toContain('<td class="num">1P</td>');
    expect(body).toContain("101/26");
    expect(body).toContain("102/26");
    expect(body).toContain('<span class="small">Analyses microbiologiques</span><br>Coliformes totaux, E. coli');
    // No analysis chosen yet (V6): the family alone.
    expect(body).toContain('<td><span class="small">Analyses physico-chimiques</span></td>');
    // Three samples padded to five rows, numbered after the last échantillon.
    expect(body).toContain('<td class="num">3</td>');
    expect(body).toContain('<td class="num">4</td>');
    expect(body).not.toContain('<td class="num">5</td>');
  });

  it("prints the surface and its state beside the designation", () => {
    expect(body).toContain('Planche verte<span class="small"> · 100 cm²</span><span class="small"> · Nettoyé</span>');
  });

  it("prints the référence client, the cadre and the client's site", () => {
    expect(html).toContain("Référence client : <b>F-1021</b>");
    expect(html).toContain('<span class="k">Cadre :</span> <b>Autre</b>');
    expect(html).toContain("<b>Client Démo — Restaurant Test</b>");
  });

  it("says a destroyed sample in the masculine of « échantillon »", () => {
    const destroyed = buildBonHtml({
      ...deposit,
      lines: [
        {
          ...deposit.lines[0],
          conformity: false,
          conformityReason: "QUANTITE_INSUFFISANTE",
          cancelled: true,
          destroyed: true,
        },
      ],
    });
    expect(destroyed).toContain("Non conforme — Quantité insuffisante — détruit</span>");
  });
});

describe("surfaceText — the air method (V4)", () => {
  it("prints the method of an air sample, the old reading without one", () => {
    expect(surfaceText({ lineKind: "AIR", surfaceAreaCm2: null, airMethod: "BOITE_EXPOSEE_30MIN" })).toBe(
      "Boîte exposée 30 min"
    );
    expect(surfaceText({ lineKind: "AIR", surfaceAreaCm2: null, airMethod: "BIOCOLLECTEUR" })).toBe("Biocollecteur");
    expect(surfaceText({ lineKind: "AIR", surfaceAreaCm2: null, airMethod: null })).toBeNull();
    expect(surfaceText({ lineKind: "AIR", surfaceLabel: "Hotte", surfaceAreaCm2: null })).toBe("Hotte");
  });
});

describe("sampleDesignation — the rapport, the étiquette, the paillasse", () => {
  it("adds the state to a surface and the method to an air sample", () => {
    expect(
      sampleDesignation({ lineKind: "SURFACE", produit: "Planche verte", surfaceLabel: "Planche verte", surfaceState: "NETTOYE" })
    ).toBe("Planche verte — surface nettoyée");
    expect(sampleDesignation({ lineKind: "SURFACE", surfaceLabel: "Pince", surfaceState: "EN_COURS_DE_TRAVAIL" })).toBe(
      "Pince — en cours de travail"
    );
    expect(sampleDesignation({ lineKind: "AIR", produit: "Salle", airMethod: "BOITE_EXPOSEE_30MIN" })).toBe(
      "Salle — Boîte exposée 30 min"
    );
    expect(sampleDesignation({ lineKind: "AIR", produit: null, airMethod: "BIOCOLLECTEUR" })).toBe("Air — Biocollecteur");
  });

  it("reads a corrected surface or person before the name stored at creation", () => {
    expect(sampleDesignation({ lineKind: "SURFACE", produit: "Planche", surfaceLabel: "Planche verte" })).toBe("Planche verte");
    expect(sampleDesignation({ lineKind: "MAINS", produit: "Employé A", personName: "Employé B" })).toBe("Employé B");
  });

  it("prints an older sample exactly as before", () => {
    expect(sampleDesignation({ lineKind: "SURFACE", produit: "Plan de travail", surfaceLabel: null, surfaceState: null })).toBe(
      "Plan de travail"
    );
    expect(sampleDesignation({ lineKind: "AIR", produit: "Salle", airMethod: null })).toBe("Salle");
    expect(sampleDesignation({ lineKind: "ALIMENT", produit: "  Thon  " })).toBe("Thon");
    expect(sampleDesignation({ lineKind: "EAU", produit: null, surfaceLabel: "Robinet" })).toBe("Robinet");
    expect(sampleDesignation({ lineKind: "ALIMENT", produit: null })).toBeNull();
  });

  it("names the row « Produit » for food and water, « Désignation » otherwise", () => {
    expect(designationHeading("ALIMENT")).toBe("Produit");
    expect(designationHeading("EAU")).toBe("Produit");
    expect(designationHeading(undefined)).toBe("Produit");
    expect(designationHeading("SURFACE")).toBe("Désignation");
    expect(designationHeading("AIR")).toBe("Désignation");
    expect(designationHeading("MAINS")).toBe("Désignation");
  });
});
