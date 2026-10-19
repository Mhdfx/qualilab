import { describe, expect, it } from "vitest";
import { productTypeListWhere, type ProductTypeListFilter } from "./product-type-list";

const NONE: ProductTypeListFilter = { all: false, clientId: null, natureId: null, category: null, q: null };

describe("productTypeListWhere — the families GET /api/product-types lists (RETOUR-LABO-16-10.md F1, F5)", () => {
  it("by default: the active families of the common catalogue only", () => {
    expect(productTypeListWhere(NONE)).toEqual({ active: true, AND: [{ clientId: null }] });
  });

  it("with a client: its own families and the common catalogue", () => {
    expect(productTypeListWhere({ ...NONE, clientId: "client-a" })).toEqual({
      active: true,
      AND: [{ OR: [{ clientId: "client-a" }, { clientId: null }] }],
    });
  });

  it("?category= keeps that category's families AND those still « à préciser » (no nature yet)", () => {
    expect(productTypeListWhere({ ...NONE, clientId: "client-a", category: "ALIMENTAIRE" })).toEqual({
      active: true,
      AND: [
        { OR: [{ clientId: "client-a" }, { clientId: null }] },
        { OR: [{ natureId: null }, { nature: { legacyType: "ALIMENTAIRE" } }] },
      ],
    });
  });

  it("?natureId= keeps one type d'analyse, unclassified families excluded", () => {
    expect(productTypeListWhere({ ...NONE, natureId: "nat_pc_surfaces" })).toEqual({
      active: true,
      natureId: "nat_pc_surfaces",
      AND: [{ clientId: null }],
    });
  });

  it("all: archived families and every client's, the other filters kept", () => {
    expect(productTypeListWhere({ ...NONE, all: true })).toEqual({});
    expect(productTypeListWhere({ ...NONE, all: true, clientId: "client-a", category: "EAU", q: "puits" })).toEqual({
      name: { contains: "puits" },
      AND: [{ OR: [{ natureId: null }, { nature: { legacyType: "EAU" } }] }],
    });
  });
});
