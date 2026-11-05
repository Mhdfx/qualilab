import { describe, expect, it } from "vitest";
import {
  clientPriceIndex,
  clientPriceKey,
  linePriceOriginLabel,
  linePriceSource,
  matchesClientPriceSearch,
  parseClientPriceInput,
  parseLinePriceSource,
  priceEditedByHand,
  repriceServiceLine,
  resolveLinePrice,
  servicePickPrice,
  sortClientPriceRows,
  EMPTY_CLIENT_PRICES,
  type ClientPriceEntry,
  type ClientPriceRow,
} from "./client-prices";
import { checkInvoiceLines, proposeLines, type BillableSample, type CatalogueEntry } from "./billing";

/**
 * Lot 4H, H5 (RETOUR-LABO-04-11.md §5, R-4 « Oui »): a client's own price
 * is proposed instead of the catalogue's on the invoice, always editable,
 * the line saying where its price comes from.
 */

const own = (over: Partial<ClientPriceEntry>): ClientPriceEntry => ({
  parameterId: null,
  labServiceId: null,
  unitPrice: 250,
  origin: "REPRISE",
  updatedAt: "2026-11-05T09:00:00.000Z",
  ...over,
});

describe("clientPriceKey", () => {
  it("keys a price by its analysis or its service — one price per client and item", () => {
    expect(clientPriceKey({ parameterId: "p1" })).toBe("P:p1");
    expect(clientPriceKey({ labServiceId: "s1" })).toBe("S:s1");
    expect(clientPriceKey({ parameterId: "p1", labServiceId: null })).toBe("P:p1");
  });

  it("refuses neither or both", () => {
    expect(() => clientPriceKey({})).toThrow();
    expect(() => clientPriceKey({ parameterId: "p1", labServiceId: "s1" })).toThrow();
  });
});

describe("resolveLinePrice — the client's price first, the catalogue's next, else « à saisir »", () => {
  const prices = clientPriceIndex([
    own({ parameterId: "ecoli", unitPrice: 199.5 }),
    own({ labServiceId: "svc-salmo", unitPrice: 300, origin: "SAISIE" }),
  ]);

  it("proposes the client's price for the analysis, with the catalogue's beside it", () => {
    expect(resolveLinePrice(prices, "ecoli", { id: "svc-ecoli", unitPrice: 320 })).toEqual({
      unitPrice: 199.5,
      origin: { source: "CLIENT", origin: "REPRISE", updatedAt: "2026-11-05T09:00:00.000Z", cataloguePrice: 320 },
    });
  });

  it("applies the client's price for the catalogue service an analysis is billed as", () => {
    const line = resolveLinePrice(prices, "salmo", { id: "svc-salmo", unitPrice: 450 });
    expect(line.unitPrice).toBe(300);
    expect(line.origin).toMatchObject({ source: "CLIENT", origin: "SAISIE", cataloguePrice: 450 });
  });

  it("prefers the analysis's own price to the service's", () => {
    const both = clientPriceIndex([own({ parameterId: "salmo", unitPrice: 280 }), own({ labServiceId: "svc-salmo", unitPrice: 300 })]);
    expect(resolveLinePrice(both, "salmo", { id: "svc-salmo", unitPrice: 450 }).unitPrice).toBe(280);
  });

  it("falls back on the catalogue, then on nothing", () => {
    expect(resolveLinePrice(prices, "listeria", { id: "svc-l", unitPrice: 480 })).toEqual({ unitPrice: 480, origin: { source: "CATALOGUE" } });
    expect(resolveLinePrice(prices, "inconnu", null)).toEqual({ unitPrice: 0, origin: { source: "NONE" } });
    expect(resolveLinePrice(EMPTY_CLIENT_PRICES, "ecoli", { unitPrice: 320 })).toEqual({ unitPrice: 320, origin: { source: "CATALOGUE" } });
  });

  it("prices an analysis the catalogue lacks at the client's price, never « à saisir »", () => {
    const line = resolveLinePrice(prices, "ecoli", null);
    expect(line.unitPrice).toBe(199.5);
    expect(line.origin).toMatchObject({ source: "CLIENT", cataloguePrice: null });
  });
});

describe("proposeLines with a client's prices", () => {
  const catalogue: CatalogueEntry[] = [
    { id: "svc-ecoli", name: "E. coli", category: "ALIMENTAIRE", unitPrice: 320, active: true },
    { id: "svc-salmo", name: "Salmonelles", category: "ALIMENTAIRE", unitPrice: 450, active: true },
  ];
  const sample: BillableSample = {
    id: "s1",
    code: "QL-1",
    controlCode: "QLC-2026-00001",
    type: "ALIMENTAIRE",
    produit: null,
    parameters: [
      { id: "ecoli", name: "E. coli" },
      { id: "salmo", name: "Salmonelles" },
      { id: "levures", name: "Levures" },
    ],
  };

  it("proposes the client's price where it has one, the catalogue's elsewhere, and says which on each line", () => {
    const lines = proposeLines([sample], catalogue, clientPriceIndex([own({ parameterId: "ecoli", unitPrice: 200 })]));
    expect(lines.map((line) => [line.unitPrice, line.priceOrigin.source, line.unpriced])).toEqual([
      [200, "CLIENT", false],
      [450, "CATALOGUE", false],
      [0, "NONE", true],
    ]);
  });

  it("keeps the catalogue's prices for a client without prices of its own", () => {
    const lines = proposeLines([sample], catalogue);
    expect(lines.map((line) => line.priceOrigin.source)).toEqual(["CATALOGUE", "CATALOGUE", "NONE"]);
  });
});

describe("what the line says of its price", () => {
  it("names the origin, in French", () => {
    expect(linePriceOriginLabel({ source: "CATALOGUE" })).toBe("Prix du catalogue");
    expect(linePriceOriginLabel({ source: "NONE" })).toMatch(/^Prix à saisir/);
    const reprise = linePriceOriginLabel({ source: "CLIENT", origin: "REPRISE", updatedAt: "2026-11-05T09:00:00Z", cataloguePrice: 320 });
    expect(reprise).toMatch(/^Prix du client — repris de l'ancien logiciel \(catalogue : 320,00/);
    const typed = linePriceOriginLabel({ source: "CLIENT", origin: "SAISIE", updatedAt: "2026-11-05T09:00:00Z", cataloguePrice: null });
    expect(typed).toMatch(/^Prix du client — saisi sur la fiche client le 5 nov\. 2026$/);
  });

  it("says « modifié à la main » only when the typed price differs from the proposal", () => {
    expect(priceEditedByHand(200, "200")).toBe(false);
    expect(priceEditedByHand(199.5, "199,50")).toBe(false);
    expect(priceEditedByHand(200, "210")).toBe(true);
    expect(priceEditedByHand(200, "")).toBe(true);
    expect(priceEditedByHand(0, "")).toBe(false);
    expect(priceEditedByHand(null, "210")).toBe(false);
    expect(priceEditedByHand(undefined, "210")).toBe(false);
  });
});

describe("parseClientPriceInput — a price typed on the fiche", () => {
  it("reads an analysis or a service and a price, French decimals included", () => {
    expect(parseClientPriceInput({ parameterId: "p1", unitPrice: "249,50" })).toEqual({
      ok: true,
      value: { target: { parameterId: "p1" }, unitPrice: 249.5 },
    });
    expect(parseClientPriceInput({ labServiceId: "s1", unitPrice: 300 })).toEqual({
      ok: true,
      value: { target: { labServiceId: "s1" }, unitPrice: 300 },
    });
    expect(parseClientPriceInput({ parameterId: "p1", unitPrice: "1 200" })).toMatchObject({ ok: true, value: { unitPrice: 1200 } });
    expect(parseClientPriceInput({ parameterId: "p1", unitPrice: 10.005 })).toMatchObject({ ok: true, value: { unitPrice: 10.01 } });
  });

  it("refuses an unclear target, a missing, zero, negative or excessive price", () => {
    expect(parseClientPriceInput(null)).toMatchObject({ ok: false });
    expect(parseClientPriceInput([])).toMatchObject({ ok: false });
    expect(parseClientPriceInput({ unitPrice: 10 })).toMatchObject({ ok: false, error: expect.stringMatching(/analyse ou une prestation/) });
    expect(parseClientPriceInput({ parameterId: "p", labServiceId: "s", unitPrice: 10 })).toMatchObject({ ok: false });
    expect(parseClientPriceInput({ parameterId: "p", unitPrice: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/prix HT/) });
    expect(parseClientPriceInput({ parameterId: "p", unitPrice: "abc" })).toMatchObject({ ok: false });
    expect(parseClientPriceInput({ parameterId: "p", unitPrice: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/retirez le prix/) });
    expect(parseClientPriceInput({ parameterId: "p", unitPrice: -5 })).toMatchObject({ ok: false });
    expect(parseClientPriceInput({ parameterId: "p", unitPrice: 10_000_001 })).toMatchObject({ ok: false, error: expect.stringMatching(/hors limites/) });
  });
});

describe("the fiche's list", () => {
  const rows = [
    { kind: "PRESTATION" as const, label: "Prélèvement sur site", domain: "Prestations" },
    { kind: "ANALYSE" as const, label: "Salmonelles", domain: "Alimentaire" },
    { kind: "ANALYSE" as const, label: "E. coli", domain: "Eau" },
    { kind: "ANALYSE" as const, label: "E. coli", domain: "Alimentaire" },
  ];

  it("lists the analyses first, then the services, each by label and domain", () => {
    expect(sortClientPriceRows(rows).map((r) => `${r.label} (${r.domain})`)).toEqual([
      "E. coli (Alimentaire)",
      "E. coli (Eau)",
      "Salmonelles (Alimentaire)",
      "Prélèvement sur site (Prestations)",
    ]);
  });

  it("filters on every word, accents and case aside", () => {
    expect(rows.filter((r) => matchesClientPriceSearch(r, "coli eau")).map((r) => r.domain)).toEqual(["Eau"]);
    expect(rows.filter((r) => matchesClientPriceSearch(r, "PRELEVEMENT")).length).toBe(1);
    expect(rows.filter((r) => matchesClientPriceSearch(r, "  ")).length).toBe(4);
  });
});

describe("a catalogue service picked by hand on an invoice line (lot 4H review)", () => {
  type Row = Pick<ClientPriceRow, "kind" | "labServiceId" | "billedServiceId" | "unitPrice" | "origin" | "updatedAt">;
  const analysis = (over: Partial<Row>): Row => ({
    kind: "ANALYSE",
    labServiceId: null,
    billedServiceId: "s-salmo",
    unitPrice: 180,
    origin: "REPRISE",
    updatedAt: "2026-11-05T09:00:00.000Z",
    ...over,
  });
  const salmo = { id: "s-salmo", unitPrice: 250 };

  it("takes the client's price for the analysis billed as the service first — every price of the reprise is one", () => {
    const price = servicePickPrice([analysis({})], salmo);
    expect(price.unitPrice).toBe(180);
    expect(price.origin).toMatchObject({ source: "CLIENT", origin: "REPRISE", cataloguePrice: 250 });
  });

  it("then the client's price for the service itself, then the catalogue's", () => {
    const service = analysis({ kind: "PRESTATION", labServiceId: "s-salmo", billedServiceId: null, unitPrice: 200, origin: "SAISIE" });
    expect(servicePickPrice([service], salmo)).toMatchObject({ unitPrice: 200, origin: { source: "CLIENT", origin: "SAISIE" } });
    expect(servicePickPrice([service, analysis({})], salmo).unitPrice).toBe(180);
    expect(servicePickPrice([analysis({ billedServiceId: "s-other" })], salmo)).toEqual({ unitPrice: 250, origin: { source: "CATALOGUE" } });
    expect(servicePickPrice([], salmo)).toEqual({ unitPrice: 250, origin: { source: "CATALOGUE" } });
  });

  it("two analyses billed as the same service at different prices name no single one: the service's price, else the catalogue's", () => {
    const two = [analysis({ unitPrice: 180 }), analysis({ unitPrice: 190 })];
    expect(servicePickPrice(two, salmo)).toEqual({ unitPrice: 250, origin: { source: "CATALOGUE" } });
    expect(servicePickPrice([analysis({ unitPrice: 180 }), analysis({ unitPrice: 180 })], salmo).unitPrice).toBe(180);
  });

  it("agrees with the invoice proposal for the same analysis", () => {
    const sample: BillableSample = { id: "e1", controlCode: null, code: "1/26-1M", type: "ALIMENTAIRE", produit: null, parameters: [{ id: "p-salmo", name: "Salmonelles" }] };
    const catalogue: CatalogueEntry[] = [{ id: "s-salmo", name: "Salmonelles", category: "ALIMENTAIRE", unitPrice: 250, active: true }];
    const [proposed] = proposeLines([sample], catalogue, clientPriceIndex([own({ parameterId: "p-salmo", unitPrice: 180 })]));
    expect(servicePickPrice([analysis({})], salmo).unitPrice).toBe(proposed.unitPrice);
  });

  it("a line picked before the client's prices arrived is re-priced; a price typed by hand is kept", () => {
    const picked = { serviceId: "s-salmo", servicePrice: 250, proposedPrice: 250, unitPrice: "250", priceOrigin: { source: "CATALOGUE" as const } };
    expect(repriceServiceLine(picked, [analysis({})])).toMatchObject({ unitPrice: 180, origin: { source: "CLIENT" } });
    expect(repriceServiceLine({ ...picked, unitPrice: "230" }, [analysis({})])).toBeNull();
    // Already at this proposal: left alone.
    expect(repriceServiceLine(picked, [])).toBeNull();
    // Another client chosen: back to the catalogue.
    const atClient = { ...picked, proposedPrice: 180, unitPrice: "180", priceOrigin: { source: "CLIENT" as const, origin: "REPRISE" as const, updatedAt: "", cataloguePrice: 250 } };
    expect(repriceServiceLine(atClient, [])).toEqual({ unitPrice: 250, origin: { source: "CATALOGUE" } });
    // A line not filled from a service is never touched.
    expect(repriceServiceLine({ ...picked, serviceId: "" }, [analysis({})])).toBeNull();
  });
});

describe("the origin of a line's price, saved with the draft (lot 4H review)", () => {
  const client = { source: "CLIENT" as const, origin: "REPRISE" as const, updatedAt: "", cataloguePrice: 250 };

  it("the proposal's origin while its price is kept, « MAIN » once another one is typed", () => {
    expect(linePriceSource({ origin: client, proposedPrice: 180, typed: "180" })).toBe("CLIENT_REPRISE");
    expect(linePriceSource({ origin: { ...client, origin: "SAISIE" }, proposedPrice: 180, typed: "180.00" })).toBe("CLIENT_SAISIE");
    expect(linePriceSource({ origin: { source: "CATALOGUE" }, proposedPrice: 250, typed: "250" })).toBe("CATALOGUE");
    expect(linePriceSource({ origin: client, proposedPrice: 180, typed: "175" })).toBe("MAIN");
    expect(linePriceSource({ origin: { source: "NONE" }, proposedPrice: 0, typed: "90" })).toBe("MAIN");
    expect(linePriceSource({ origin: { source: "NONE" }, proposedPrice: 0, typed: "" })).toBeNull();
    // A line typed by hand from scratch.
    expect(linePriceSource({ typed: "120" })).toBe("MAIN");
    expect(linePriceSource({ typed: "" })).toBeNull();
  });

  it("a reopened draft says the saved origin again, until the price is retyped", () => {
    expect(linePriceSource({ saved: "CLIENT_REPRISE", proposedPrice: 180, typed: "180.00" })).toBe("CLIENT_REPRISE");
    expect(linePriceSource({ saved: "CLIENT_REPRISE", proposedPrice: 180, typed: "200" })).toBe("MAIN");
    expect(linePriceSource({ saved: "MAIN", proposedPrice: 120, typed: "120" })).toBe("MAIN");
  });

  it("travels through the invoice lines' check, unknown values dropped", () => {
    expect(parseLinePriceSource("CATALOGUE")).toBe("CATALOGUE");
    expect(parseLinePriceSource("AUTRE")).toBeNull();
    const checked = checkInvoiceLines(
      [
        { description: "Salmonelles", quantity: 1, unitPrice: 180, priceSource: "CLIENT_REPRISE" },
        { description: "Déplacement", quantity: 1, unitPrice: 50, priceSource: "n'importe quoi" },
      ],
      { issue: false }
    );
    expect(checked.ok && checked.lines.map((line) => line.priceSource)).toEqual(["CLIENT_REPRISE", undefined]);
  });
});
