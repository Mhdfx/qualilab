import { describe, expect, it } from "vitest";
import {
  ONSSA_COLUMNS,
  PROPOSED_ONSSA_GROUPS,
  isOnssaColumnKey,
  matchText,
  normKey,
  proposeOnssaColumn,
  resolveOnssaColumn,
} from "./onssa-canevas";

/**
 * Lot 3E, N2 — the canevas' fixed columns, read off the extract of 28/10
 * (feuille « Feuil2 », C6 → Z6 and their methods in row 7), the method
 * picking a yeast / mould column, and the proposals by name / alias.
 */

describe("the canevas columns", () => {
  it("are the extract's 23 microbiology columns in order, then « chimie alimentaires »", () => {
    expect(ONSSA_COLUMNS).toHaveLength(24);
    expect(ONSSA_COLUMNS.filter((column) => column.kind === "MICRO")).toHaveLength(23);
    expect(ONSSA_COLUMNS[0]).toMatchObject({ header: "Bacillus cereus", method: "NM ISO 7932 2021" });
    expect(ONSSA_COLUMNS[16]).toMatchObject({ header: "Recherche Salmonella", method: "NM ISO 6579-1 2021" });
    expect(ONSSA_COLUMNS[22]).toMatchObject({ header: "Clostridia", method: "NM ISO 6461-2 2007" });
    expect(ONSSA_COLUMNS[23]).toMatchObject({ key: "CHIMIE_ALIMENTAIRE", header: "chimie alimentaires", method: "", kind: "CHIMIE" });
    expect(new Set(ONSSA_COLUMNS.map((column) => column.key)).size).toBe(24);
  });

  it("keeps the canevas' own words in the headers (no trailing space), French ones in the labels", () => {
    for (const column of ONSSA_COLUMNS) {
      expect(column.header).toBe(column.header.trim());
      expect(column.label.length).toBeGreaterThan(0);
    }
    expect(ONSSA_COLUMNS.find((c) => c.key === "ESCHERICHIA_COLI_44")).toMatchObject({
      header: "Essherichia coli à 44°C",
      label: "Escherichia coli à 44 °C",
    });
  });

  it("knows its keys", () => {
    expect(isOnssaColumnKey("SALMONELLA")).toBe(true);
    expect(isOnssaColumnKey("salmonella")).toBe(false);
    expect(isOnssaColumnKey(null)).toBe(false);
  });
});

describe("resolveOnssaColumn — the method picks among the yeasts' and moulds' columns", () => {
  it("normalises norm codes", () => {
    expect(normKey("NM ISO 21527-1:2012")).toBe("NMISO2152712012");
    expect(normKey("NM 08.0.123")).toBe("NM080123");
    expect(normKey(null)).toBe("");
  });

  it("moves a yeast to the column of its norm", () => {
    expect(resolveOnssaColumn("LEVURES_25", "NM ISO 21527-1")).toBe("LEVURES_1");
    expect(resolveOnssaColumn("LEVURES_25", "NM ISO 21527-2")).toBe("LEVURES_2");
    expect(resolveOnssaColumn("LEVURES_1", "NM 08.0.123")).toBe("LEVURES_25");
    expect(resolveOnssaColumn("MOISISSURES_25", "NM ISO 21527-2:2012")).toBe("MOISISSURES_2");
  });

  it("keeps the parameter's column when the norm is absent, unknown or ambiguous", () => {
    expect(resolveOnssaColumn("LEVURES_25", null)).toBe("LEVURES_25");
    expect(resolveOnssaColumn("LEVURES_25", "NM ISO 7932")).toBe("LEVURES_25");
    // « NM ISO 21527 » without its part matches two siblings.
    expect(resolveOnssaColumn("LEVURES_2", "NM ISO 21527")).toBe("LEVURES_2");
  });

  it("never moves a column without siblings, and maps nothing for « non déclaré »", () => {
    expect(resolveOnssaColumn("SALMONELLA", "NM ISO 21527-1")).toBe("SALMONELLA");
    expect(resolveOnssaColumn(null, "NM ISO 6579-1")).toBeNull();
    expect(resolveOnssaColumn("NOT_A_COLUMN", null)).toBeNull();
  });
});

describe("proposeOnssaColumn — by name and alias", () => {
  const micro = (name: string, aliases: string | null = null, category: "ALIMENTAIRE" | "EAU" = "ALIMENTAIRE") => ({
    name,
    aliases,
    family: "MICRO" as const,
    category,
  });

  it("matches the usual names of the laboratory's germs", () => {
    const cases: [string, string][] = [
      ["Bacillus cereus présomptifs", "BACILLUS_CEREUS"],
      ["Bactéries lactiques mésophiles", "LACTIQUES_30"],
      ["Anaérobies sulfito-réducteurs", "SULFITO_REDUCTEURS"],
      ["Clostridium perfringens", "CLOSTRIDIUM_PERFRINGENS"],
      ["Coliformes fécaux", "COLIFORMES_FECAUX"],
      ["Coliformes thermotolérants", "COLIFORMES_FECAUX"],
      ["Coliformes totaux", "COLIFORMES_30"],
      ["Coliformes à 30°C", "COLIFORMES_30"],
      ["Entérobactéries", "ENTEROBACTERIES"],
      ["Escherichia coli β-glucuronidase positive", "ESCHERICHIA_COLI_44"],
      ["E. coli", "ESCHERICHIA_COLI_44"],
      ["Listeria monocytogenes", "LISTERIA_MONOCYTOGENES"],
      ["Micro-organismes aérobies à 30 °C", "MICRO_ORGANISMES_30"],
      ["Flore mésophile aérobie totale", "MICRO_ORGANISMES_30"],
      ["Micro-organismes revivifiables à 22 °C", "MOR_22"],
      ["Micro-organismes revivifiables à 36°C", "MOR_36"],
      ["Salmonella spp.", "SALMONELLA"],
      ["Staphylocoques à coagulase positive", "STAPHYLOCOQUES_37"],
      ["Entérocoques intestinaux", "ENTEROCOQUES_INTESTINAUX"],
      ["Pseudomonas aeruginosa", "PSEUDOMONAS"],
      ["Spores d'anaérobies sulfito-réducteurs", "CLOSTRIDIA"],
      ["Levures", "LEVURES_25"],
      ["Moisissures", "MOISISSURES_25"],
    ];
    for (const [name, key] of cases) expect(proposeOnssaColumn(micro(name)), name).toBe(key);
  });

  it("reads the aliases, one per line", () => {
    expect(proposeOnssaColumn(micro("Germe test", "Code interne\nSalmonelles"))).toBe("SALMONELLA");
  });

  it("proposes nothing when a name is ambiguous or unknown", () => {
    expect(proposeOnssaColumn(micro("Levures et moisissures"))).toBeNull();
    expect(proposeOnssaColumn(micro("Listeria spp"))).toBeNull();
    expect(proposeOnssaColumn(micro("Germe inconnu"))).toBeNull();
    // Two different columns through the name and an alias.
    expect(proposeOnssaColumn(micro("Salmonella", "Staphylocoques"))).toBeNull();
  });

  it("puts the food chemistry in « chimie alimentaires », never the water's nor « Autre »", () => {
    expect(proposeOnssaColumn({ name: "Histamine", family: "CHIMIE", category: "ALIMENTAIRE" })).toBe("CHIMIE_ALIMENTAIRE");
    expect(proposeOnssaColumn({ name: "Nitrates", family: "CHIMIE", category: "EAU" })).toBeNull();
    expect(proposeOnssaColumn({ name: "Salmonella", family: "AUTRE", category: "ALIMENTAIRE" })).toBeNull();
  });

  it("matches without accents nor case", () => {
    expect(matchText("  ENTÉROCOQUES   Intestinaux ")).toBe("enterocoques intestinaux");
  });
});

describe("the proposed groups (hypothèse R-22)", () => {
  it("are unique, food first, water last", () => {
    expect(new Set(PROPOSED_ONSSA_GROUPS.map((g) => g.name)).size).toBe(PROPOSED_ONSSA_GROUPS.length);
    expect(PROPOSED_ONSSA_GROUPS.at(-1)).toEqual({ name: "Eaux", domain: "EAU" });
    expect(PROPOSED_ONSSA_GROUPS.filter((g) => g.domain === "EAU")).toHaveLength(1);
  });
});
