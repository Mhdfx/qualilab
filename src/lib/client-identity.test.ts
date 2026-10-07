import { describe, expect, it } from "vitest";
import { clientCoreName, findSimilarClients, normalIce, sameClientName } from "./client-identity";

describe("clientCoreName", () => {
  it("drops legal forms, articles, accents, punctuation and spaces", () => {
    expect(clientCoreName("Client Démo")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo SARL")).toBe("CLIENTDEMO");
    expect(clientCoreName("STE CLIENT-DEMO")).toBe("CLIENTDEMO");
    expect(clientCoreName("Société Client Démo S.A.R.L.")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo SARL AU")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo SARL-AU")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo S.A.")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo SAS")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo et Cie")).toBe("CLIENTDEMO");
    expect(clientCoreName("Client Démo & Cie")).toBe("CLIENTDEMO");
    expect(clientCoreName("Ets Client Démo")).toBe("CLIENTDEMO");
    expect(clientCoreName("Compagnie Client Démo")).toBe("CLIENTDEMO");
  });

  it("drops articles, elided ones included", () => {
    expect(clientCoreName("La Chaîne Test")).toBe("CHAINETEST");
    expect(clientCoreName("Les Délices de la Chaîne")).toBe("DELICESCHAINE");
    expect(clientCoreName("Boulangerie du Test")).toBe("BOULANGERIETEST");
    expect(clientCoreName("Café d'Essai")).toBe("CAFEESSAI");
    expect(clientCoreName("L'Atelier Démo")).toBe("ATELIERDEMO");
  });

  it("keeps « AU » and « ET » outside a legal form", () => {
    expect(clientCoreName("Pain au Test")).toBe("PAINAUTEST");
    expect(clientCoreName("Pain et Test")).toBe("PAINETTEST");
  });

  it("never becomes empty", () => {
    expect(clientCoreName("La Société")).toBe("LASOCIETE");
    expect(clientCoreName("SARL")).toBe("SARL");
    expect(clientCoreName("  ")).toBe("");
  });
});

describe("normalIce", () => {
  it("keeps the digits only", () => {
    expect(normalIce("001 234 567 000 089")).toBe("001234567000089");
    expect(normalIce(" 001234567000089 ")).toBe("001234567000089");
  });

  it("treats a missing or zero ICE as none", () => {
    expect(normalIce(null)).toBe("");
    expect(normalIce(undefined)).toBe("");
    expect(normalIce("")).toBe("");
    expect(normalIce("000000000000000")).toBe("");
  });
});

describe("sameClientName — the existing hard refusal", () => {
  it("ignores case, accents and outer spaces only", () => {
    expect(sameClientName("Client Démo", "CLIENT DEMO ")).toBe(true);
    expect(sameClientName("Client Démo", "Client-Démo")).toBe(false);
    expect(sameClientName("Client Démo", "Client Démo SARL")).toBe(false);
  });
});

describe("findSimilarClients", () => {
  const candidates = [
    { id: "a", name: "Client Démo SARL", ice: "001234567000089" },
    { id: "b", name: "Chaîne Test", ice: null },
    { id: "c", name: "Boulangerie Essai", ice: "" },
    { id: "d", name: "ABC", ice: null },
    { id: "e", name: "Atelier Démo", ice: "009876543000012" },
    { id: "f", name: "Traiteur Exemple", ice: "000000000000000" },
  ];

  it("finds the same company without its legal form", () => {
    expect(findSimilarClients({ name: "STE Client Démo" }, candidates)).toEqual([
      { id: "a", name: "Client Démo SARL", reason: "même nom" },
    ]);
    expect(findSimilarClients({ name: "La Chaine-Test" }, candidates)).toEqual([
      { id: "b", name: "Chaîne Test", reason: "même nom" },
    ]);
  });

  it("finds the same ICE whatever the name", () => {
    expect(findSimilarClients({ name: "Nouveau Nom", ice: "001 234 567 000 089" }, candidates)).toEqual([
      { id: "a", name: "Client Démo SARL", reason: "même ICE" },
    ]);
  });

  it("ignores an empty or placeholder ICE", () => {
    expect(findSimilarClients({ name: "Nouveau Nom", ice: "" }, candidates)).toEqual([]);
    expect(findSimilarClients({ name: "Nouveau Nom", ice: "000000000000000" }, candidates)).toEqual([]);
  });

  it("finds a typing error on the core name", () => {
    expect(findSimilarClients({ name: "Chaine Tset" }, candidates)).toEqual([
      { id: "b", name: "Chaîne Test", reason: "orthographe proche" },
    ]);
    expect(findSimilarClients({ name: "Boulangeri Essai SARL" }, candidates)).toEqual([
      { id: "c", name: "Boulangerie Essai", reason: "orthographe proche" },
    ]);
  });

  it("keeps different companies apart", () => {
    expect(findSimilarClients({ name: "Garage Central" }, candidates)).toEqual([]);
    expect(findSimilarClients({ name: "Client Exemple" }, candidates)).toEqual([]);
  });

  it("proposes nothing by spelling for a short name", () => {
    expect(findSimilarClients({ name: "ABD" }, candidates)).toEqual([]);
    // … but the same short core is still the same name.
    expect(findSimilarClients({ name: "ABC SARL" }, candidates)).toEqual([{ id: "d", name: "ABC", reason: "même nom" }]);
  });

  it("never returns the exact same name (refused outright) nor the client being renamed", () => {
    expect(findSimilarClients({ name: "client demo sarl" }, candidates)).toEqual([]);
    expect(findSimilarClients({ id: "a", name: "Client Démo", ice: "001234567000089" }, candidates)).toEqual([]);
  });

  it("ranks the strongest reasons first and stops at max", () => {
    const many = [
      { id: "1", name: "Chaine Tes", ice: null },
      { id: "2", name: "Chaîne Test SA", ice: null },
      { id: "3", name: "Autre Société", ice: "001234567000089" },
      { id: "4", name: "Chaine Txst", ice: null },
      { id: "5", name: "Chaine Teste", ice: null },
    ];
    const found = findSimilarClients({ name: "Chaîne Test", ice: "001234567000089" }, many);
    expect(found.map((f) => [f.id, f.reason])).toEqual([
      ["3", "même ICE"],
      ["2", "même nom"],
      ["1", "orthographe proche"],
      ["5", "orthographe proche"],
      ["4", "orthographe proche"],
    ]);
    expect(findSimilarClients({ name: "Chaîne Test", ice: "001234567000089" }, many, 2)).toHaveLength(2);
  });
});
