import { describe, expect, it } from "vitest";
import { clientMatcher, groupLabels, guessMemoryColumns, readMemoryRows } from "./memory-import";

describe("guessMemoryColumns", () => {
  it("reads the old software's headers, accents and underscores ignored", () => {
    expect(guessMemoryColumns(["N° BC", "Client", "NOM_PRODUIT", "Lieu de prélèvement"])).toEqual({ client: 1, designation: 2, lieu: 3 });
    expect(guessMemoryColumns(["Raison sociale", "Désignation"])).toEqual({ client: 0, designation: 1, lieu: -1 });
    expect(guessMemoryColumns(["Date", "Analyse"])).toBeNull();
  });
});

describe("readMemoryRows", () => {
  it("keeps rows with a client and something to remember", () => {
    const rows = [
      ["Restaurant Le Palmier", "Salade  composée", "Cuisine"],
      ["", "Orpheline", "Cuisine"],
      ["Restaurant Le Palmier", "", ""],
      ["Usine AgroMaroc", "", "Quai 2"],
    ];
    expect(readMemoryRows(rows, { client: 0, designation: 1, lieu: 2 })).toEqual([
      { line: 2, client: "Restaurant Le Palmier", designation: "Salade composée", lieu: "Cuisine" },
      { line: 5, client: "Usine AgroMaroc", designation: "", lieu: "Quai 2" },
    ]);
  });
});

describe("groupLabels", () => {
  it("merges spellings, keeps the most used one, orders by frequency", () => {
    expect(groupLabels(["Salade composée", "SALADE COMPOSEE", "Salade composée", "Pain", "  pain "])).toEqual([
      { label: "Salade composée", normalizedLabel: "salade composee", count: 3 },
      { label: "Pain", normalizedLabel: "pain", count: 2 },
    ]);
    expect(groupLabels(["", "  "])).toEqual([]);
  });
});

describe("clientMatcher", () => {
  const match = clientMatcher([
    { id: "c1", name: "Restaurant Le Palmier", ice: "001234567000045" },
    { id: "c2", name: "Hôtel Riviera", ice: null },
  ]);
  it("matches by ICE or by name, accents and case ignored", () => {
    expect(match("001234567000045")).toBe("c1");
    expect(match("restaurant le palmier")).toBe("c1");
    expect(match("HOTEL RIVIERA")).toBe("c2");
    expect(match("Inconnu SARL")).toBeNull();
    expect(match("999999999999999")).toBeNull();
  });
});
