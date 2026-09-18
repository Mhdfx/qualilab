import { describe, expect, it } from "vitest";
import { parameterKey, parameterLabel, parseCriteriaSheet, parseLimit, parseNorm, parsePlan } from "./criteria-import";

describe("parseLimit — the workbook's notation", () => {
  it("reads « a.10b », plain integers, absence and unspecified", () => {
    expect(parseLimit("1.102")).toEqual({ kind: "VALUE", value: 100 });
    expect(parseLimit("3.106")).toEqual({ kind: "VALUE", value: 3_000_000 });
    expect(parseLimit("1.5.106")).toEqual({ kind: "VALUE", value: 1_500_000 });
    expect(parseLimit("6")).toEqual({ kind: "VALUE", value: 6 });
    expect(parseLimit('Valeur "m" absente')).toEqual({ kind: "ABSENCE", value: null });
    expect(parseLimit('Valeur "m" non spécifiée')).toEqual({ kind: "UNSPECIFIED", value: null });
    expect(parseLimit("")).toEqual({ kind: "EMPTY", value: null });
    expect(parseLimit("1.8")).toMatchObject({ kind: "VALUE", value: null, error: expect.stringContaining("1.8") });
  });
});

describe("parseNorm / parameterKey", () => {
  it("splits the norm into a code and a dated version", () => {
    expect(parseNorm("NM ISO 6579 - 1:2017")).toEqual({ code: "NM ISO 6579-1", version: "2017", label: "NM ISO 6579 - 1:2017" });
    expect(parseNorm("NM 08.0.125:2012 (En boîte)")).toMatchObject({ code: "NM 08.0.125", version: "2012" });
    expect(parseNorm("NM ISO 7932-2009")).toMatchObject({ code: "NM ISO 7932", version: "2009" });
    expect(parseNorm("calcul")).toEqual({ code: "calcul", version: "", label: "calcul" });
  });

  it("folds the germ's spelling variants into one key and keeps the mass", () => {
    expect(parameterKey("Recherche des Salmonella").key).toBe(parameterKey("Recherche de Salmonella").key);
    expect(parameterKey("Recherche des Salmonella /375g")).toEqual({ key: parameterKey("Recherche des Salmonella").key, mass: "/375g" });
    expect(parameterKey("Vibrio Parahaemolyticus*").key).toBe(parameterKey("Vibrio Parahaemolyticus").key);
    expect(parameterKey("Recherche de Listeria monocytogenes").key).toBe(parameterKey("Listeria monocytogenes").key);
    expect(parameterKey("Micro-organismes-1 à 30°C").key).toBe(parameterKey("MIcro-organismes-2 à 30 °C").key);
    expect(parameterKey("Moisissures-2").key).toBe("moisissures");
    expect(parameterKey("Staphylocoques à coagulase positive à 37 °C").key).toBe(parameterKey("Staphylocoques à coagulase positive").key);
    expect(parameterKey("Coliformes thermotolérants à 44°C").key).toBe("coliformes thermotolerants");
    expect(parameterLabel("Micro-organismes-1 à 30 °C")).toBe("Micro-organismes à 30°C");
    expect(parameterLabel("Recherche des Salmonella /375g")).toBe("Recherche des Salmonella");
    expect(parameterLabel("Vibrio Parahaemolyticus*")).toBe("Vibrio Parahaemolyticus");
  });
});

describe("parseCriteriaSheet", () => {
  const rows = [
    ["SALADES AVEC SOURCE PROTEIQUE"],
    ["Microorganismes", "Norme", "Unité", "Plan d’échantillonnage", null, "Limite"],
    ["Clostridium perfringens", "NM 08.0.111:2003", "ufc/g", "n=5", "c=2", "1.102", "1.104"],
    ["Recherche des Salmonella", "NM ISO 6579 - 1:2017", "/25g", "n=5", "", 'Valeur "m" absente', ""],
    ["Micro-organismes-1 à 30°C", "NM ISO 4833-1:2023", "ufc/g", "n=5", "c=3", "3.106", "1.107"],
    ["Coliformes à 30°C", "NM ISO 4832:2008", "ufc/g", "n=5", "", "1.8", ""],
    ["Test de stabilité", "", "-", "n=5", "", "", ""],
    [null],
    ["FROMAGE FRAIS TRADITIONNEL"],
    ["Microorganismes", "Norme", "Unité", "Plan d’échantillonnage", null, "Limite"],
    ["Staphylocoques à coagulase positive", "NM ISO 6888-1:2022", "ufc/g", "n=5", "c=2", 'Valeur "m" non spécifiée', "1.103"],
  ];

  it("turns the blocks into criterion drafts and refuses what it cannot read", () => {
    const parsed = parseCriteriaSheet(rows);
    expect(parsed.productTypes).toEqual(["SALADES AVEC SOURCE PROTEIQUE", "FROMAGE FRAIS TRADITIONNEL"]);
    expect(parsed.drafts).toHaveLength(4);
    expect(parsed.drafts[0]).toMatchObject({ productType: "SALADES AVEC SOURCE PROTEIQUE", normCode: "NM 08.0.111", normVersion: "2003", unit: "ufc/g", n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 10_000 });
    expect(parsed.drafts[1]).toMatchObject({ mKind: "ABSENCE", m: null, bigM: null, unit: "/25g", c: null });
    expect(parsed.drafts[2]).toMatchObject({ c: 3, m: 3_000_000, bigM: 10_000_000, normVersion: "2023" });
    expect(parsed.drafts[3]).toMatchObject({ productType: "FROMAGE FRAIS TRADITIONNEL", mKind: "UNSPECIFIED", m: null, bigM: 1000 });
    expect(parsed.refused).toEqual([
      { line: 6, productType: "SALADES AVEC SOURCE PROTEIQUE", reason: expect.stringContaining("1.8") },
      { line: 7, productType: "SALADES AVEC SOURCE PROTEIQUE", reason: expect.stringContaining("aucune limite") },
    ]);
  });
});

describe("parsePlan", () => {
  it("reads « n=5 » / « c=2 » and bare integers, refuses the rest", () => {
    expect(parsePlan("n=5", "c=2")).toEqual({ n: 5, c: 2 });
    expect(parsePlan("5", "")).toEqual({ n: 5, c: null });
    expect(parsePlan("", "1")).toEqual({ n: 5, c: 1 });
    expect(parsePlan("n = 10", "c = 3")).toEqual({ n: 10, c: 3 });
    expect(parsePlan("cinq", "")).toMatchObject({ error: expect.stringContaining("plan illisible") });
    expect(parsePlan("n=5", "deux")).toMatchObject({ error: expect.stringContaining("tolérance illisible") });
  });
});

describe("parseNorm — an empty cell is no norm", () => {
  it("returns an empty code instead of inventing one", () => {
    expect(parseNorm("")).toEqual({ code: "", version: "", label: "" });
    expect(parseNorm("NM ISO 6579 - 1:2017")).toEqual({ code: "NM ISO 6579-1", version: "2017", label: "NM ISO 6579 - 1:2017" });
  });
});
