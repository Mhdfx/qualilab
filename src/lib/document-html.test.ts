import { describe, expect, it } from "vitest";
import { pageCss } from "./cartouche-html";
import {
  BON_MARGIN,
  PROTOCOL_MARGIN,
  buildBonHtml,
  buildProtocolHtml,
  designationHeading,
  protocolRows,
  sampleDesignation,
  surfaceText,
  type DocumentLine,
  type SerieDocumentData,
} from "./document-html";
import { escapeHtml } from "./html-text";
import { DEFAULT_THRESHOLDS, RECEPTION_RULES, receptionRuleLine } from "./reception-rules";

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

  it("leaves the cartouche to the page header, and declares the page box it is printed with", () => {
    expect(html).toContain("<title>Protocole de prélèvement — série 2754/26</title>");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("Réf :");
    expect(html).not.toContain("Version");
    expect(html).not.toContain("Page ");
    expect(html).toContain(pageCss(PROTOCOL_MARGIN));
  });

  it("prints the série number and the header fields", () => {
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

describe("buildBonHtml — PG05/EN04 version G", () => {
  const thresholds = { ...DEFAULT_THRESHOLDS, minFoodMicroG: 150 };
  const deposit: SerieDocumentData = {
    ...base,
    samplerKind: "CLIENT",
    samplerName: null,
    // After Morocco's return to UTC (20/09/2026): the laboratory's clock is UTC.
    startedAt: new Date("2026-10-05T14:00:00Z"),
    arrivedAt: new Date("2026-10-05T14:05:00Z"),
    advanceAmount: 350,
    advanceMode: "ESPECES",
    lines: [
      { ...base.lines[0], quantity: 250, quantityUnit: "G", receptionTemperature: 4, controlCode: "20459/26", conformity: true },
      { ...base.lines[0], lineNumber: 2, designation: "Eau du réseau", lineKind: "EAU", quantity: 0.5, quantityUnit: "L", productionDate: null, expiryDate: null, receptionTemperature: 12, controlCode: "20460/26", conformity: false, conformityReason: "QUANTITE_INSUFFISANTE" },
    ],
  };
  const html = buildBonHtml(deposit, thresholds);
  const field = (label: string, value: string) => `<span class="k">${label}</span><span class="v">${value}</span>`;

  it("leaves the cartouche to the page header, and declares the page box it is printed with", () => {
    expect(html).toContain("<title>Bon de réception — série 2754/26</title>");
    expect(html).not.toContain("PG05/EN04");
    expect(html).not.toContain("Réf :");
    expect(html).toContain(pageCss(BON_MARGIN));
  });

  it("prints Date and Heure apart, with the year, then Reçu par and the Référence client", () => {
    expect(html).toContain(field("Date :", "05/10/2026"));
    expect(html).toContain(field("Heure :", "14h05"));
    expect(html).toContain(field("Reçu par :", "Salma Idrissi"));
    // The lab's request of 05/10: « Référence client », never « N° de factures ».
    expect(html).toContain(field("Référence client :", "F-1021"));
    expect(html).not.toContain("N° de factures");
  });

  it("frames the client as the paper: série, name, two address lines, phone, fax to fill by hand", () => {
    const box = html.slice(html.indexOf('<div class="client">'), html.indexOf("<table"));
    expect(box).toContain(field("N° de série :", "2754/26"));
    expect(box).toContain(field("Nom du client :", "Restaurant Le Palmier — Cuisine centrale"));
    expect(box).toContain(`${field("Adresse :", "12 rue des Orangers")}</div>\n    <div class="field"><span class="v"></span></div>`);
    expect(box).toContain(field("N° de tél :", "05 22 00 00 00"));
    expect(box).toContain(field("N° de fax :", ""));
  });

  it("keeps the paper's columns in its order, the N° de contrôle first", () => {
    const headers = [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(headers).toEqual([
      "N° de contrôle",
      "Désignation produit",
      "N° Lot",
      "DLC",
      "Quantité/poids en (g)",
      "T° à l'arrivée",
      "Analyses demandées",
    ]);
    expect(html).toContain("20459/26");
    expect(html).toContain("Non conforme — Quantité insuffisante");
  });

  it("pre-prints « P : » and « E : » on every line, the paper's five included", () => {
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect((body.match(/<tr>/g) ?? []).length).toBe(5);
    expect((body.match(/<span class="k">P :<\/span>/g) ?? []).length).toBe(5);
    expect((body.match(/<span class="k">E :<\/span>/g) ?? []).length).toBe(5);
    expect(body).toContain('<span class="k">P :</span> 01/09/2026</span><span><span class="k">E :</span> 04/09/2026');
  });

  it("prints the seven rules as the paper's notes (1) … (7), in order, with the lab's thresholds and no heading", () => {
    const notes = html.slice(html.indexOf('<ul class="rules">'), html.indexOf("</ul>"));
    const lines = [...notes.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    expect(lines).toEqual(RECEPTION_RULES.map((rule) => escapeHtml(receptionRuleLine(rule, thresholds))));
    expect(lines[0]).toMatch(/^\(1\) critères : ne pas accepter/);
    expect(lines[1]).toBe("(2) poids minimal est de 150 g pour les aliments (analyses microbiologiques)");
    expect(lines[3]).toContain("et si Salmonella 6 L");
    expect(lines[6]).toBe("(7) échantillons destinés au dosage de l'histamine : 9 échantillons de 100 g");
    expect(html).not.toMatch(/critères de recevabilité/i);
  });

  it("prints Avance (amount and mode) and Reste as lines, then the paper's signatures", () => {
    expect(html).toContain(field("Avance :", "350,00 DH — Espèces"));
    expect(html).toContain(field("Reste :", ""));
    expect(html).toContain('<div class="role">Signature de client :</div>');
    expect(html).toContain(`<div class="role">Signature de l'agent QUALILAB :</div><p class="small">Salma Idrissi</p>`);
  });

  it("leaves Avance blank when nothing was paid", () => {
    expect(buildBonHtml({ ...deposit, advanceAmount: null, advanceMode: null })).toContain(field("Avance :", ""));
  });

  it("grows past five lines without blank rows", () => {
    const six = buildBonHtml({
      ...deposit,
      lines: Array.from({ length: 6 }, (_, i) => ({ ...deposit.lines[0], lineNumber: i + 1, controlCode: `${300 + i}/26` })),
    });
    const body = six.slice(six.indexOf("<tbody>"), six.indexOf("</tbody>"));
    expect((body.match(/<tr>/g) ?? []).length).toBe(6);
    expect((body.match(/<span class="k">P :<\/span>/g) ?? []).length).toBe(6);
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
      '<span class="k">Cadre :</span><span class="v">Convention</span>'
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
    lines: [
      { ...visit.lines[0], controlCode: "101/26", conformity: true },
      { ...visit.lines[1], controlCode: "102/26", conformity: true, parameters: [] },
      { ...visit.lines[2], controlCode: "103/26", conformity: true },
    ],
  };
  const html = buildBonHtml(deposit);
  const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));

  it("gives each twin its own row, N° de contrôle and family", () => {
    expect(body).toContain('<td><span class="mono">101/26</span><br><span class="small">Éch. 1M</span></td>');
    expect(body).toContain('<td><span class="mono">102/26</span><br><span class="small">Éch. 1P</span></td>');
    expect(body).toContain('<span class="small">Analyses microbiologiques</span><br>Coliformes totaux, E. coli');
    // No analysis chosen yet (V6): the family alone.
    expect(body).toContain('<td><span class="small">Analyses physico-chimiques</span></td>');
    // Three samples padded to the paper's five lines.
    expect((body.match(/<tr>/g) ?? []).length).toBe(5);
  });

  it("prints the surface and its state beside the designation", () => {
    expect(body).toContain('Planche verte<span class="small"> · 100 cm²</span><span class="small"> · Nettoyé</span>');
  });

  it("prints the référence client, the cadre and the client's site", () => {
    expect(html).toContain('<span class="k">Référence client :</span><span class="v">F-1021</span>');
    expect(html).toContain('<span class="k">Cadre :</span><span class="v">Autre</span>');
    expect(html).toContain('<span class="k">Nom du client :</span><span class="v">Client Démo — Restaurant Test</span>');
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
