import { describe, expect, it } from "vitest";
import type { SampleStatus } from "@/generated/prisma/enums";
import { parseView, serverIsoDay } from "./dashboard-view";
import { EIL_STATUSES } from "./quality-validation";
import { OPEN_STATUSES, parseSampleSearch, rechercheHref } from "./sample-search";
import {
  CLIENT_INVOICE_VIEW_FILTERS,
  CLIENT_INVOICE_VIEWS,
  EIL_OPEN_STATUSES,
  EIL_VIEWS,
  INVOICE_LIST_ANCHOR,
  PURCHASE_INVOICE_VIEWS,
  clientFicheHref,
  countInStatuses,
  eilViewStatuses,
  invoiceTileHref,
  purchaseInvoiceViewStatus,
  withStatuses,
} from "./management-views";
import { parseListFilters, sameListFilters } from "@/components/invoices/invoice-view";

describe("countInStatuses", () => {
  const counts = new Map<SampleStatus, number>([
    ["PRELEVE", 2],
    ["RECU", 3],
    ["EN_ANALYSE", 4],
    ["VALIDE", 10],
    ["ANNULE", 7],
  ]);

  it("adds the statuses asked for, a missing one counting zero", () => {
    // « En cours de traitement » = /recherche?etat=en_cours (PROGRAMME and
    // RESULTATS_SAISIS absent from the groupBy).
    expect(countInStatuses(counts, OPEN_STATUSES)).toBe(9);
    expect(countInStatuses(counts, ["VALIDE"])).toBe(10);
    expect(countInStatuses(counts, [])).toBe(0);
    expect(countInStatuses(new Map(), OPEN_STATUSES)).toBe(0);
  });
});

describe("serverIsoDay", () => {
  it("writes the day a server-cut boundary falls on, read back to the same instant by /recherche", () => {
    const monthStart = new Date(2026, 9, 1, 0, 0, 0, 0);
    expect(serverIsoDay(monthStart)).toBe("2026-10-01");
    expect(serverIsoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    for (const boundary of [monthStart, new Date(2026, 1, 1), new Date(2026, 11, 31)]) {
      const href = rechercheHref({ type: "EAU", dateField: "prelevement", from: serverIsoDay(boundary) });
      const search = parseSampleSearch(new URL(href, "https://labo.test").searchParams);
      expect(search.from?.getTime()).toBe(boundary.getTime());
      expect(search.dateField).toBe("prelevement");
      expect(search.type).toBe("EAU");
    }
  });
});

describe("invoiceTileHref", () => {
  it("opens the list on the figure's documents, scrolled to the list", () => {
    expect(invoiceTileHref("/comptabilite/factures", { state: "A_REGLER" })).toBe(
      "/comptabilite/factures?etat=A_REGLER#liste"
    );
    expect(invoiceTileHref("/admin/factures", { state: "EMISES", kind: "FACTURE" })).toBe(
      "/admin/factures?etat=EMISES&type=FACTURE#liste"
    );
    expect(invoiceTileHref("/admin/factures")).toBe(`/admin/factures#${INVOICE_LIST_ANCHOR}`);
  });

  it("reads back as the filters it was built from", () => {
    const href = invoiceTileHref("/admin/factures", { state: "AVEC_REGLEMENT" });
    const query = new URL(href, "https://labo.test").searchParams;
    const filters = parseListFilters(Object.fromEntries(query));
    expect(sameListFilters(filters, { state: "AVEC_REGLEMENT" })).toBe(true);
    expect(sameListFilters(filters, { state: "AVEC_REGLEMENT", kind: "FACTURE" })).toBe(false);
  });
});

describe("EIL views", () => {
  it("« ouvertes » keeps every campaign not yet closed", () => {
    expect(EIL_OPEN_STATUSES).toEqual(EIL_STATUSES.filter((status) => status !== "CLOTUREE"));
    expect(eilViewStatuses("ouvertes")).toBe(EIL_OPEN_STATUSES);
    expect(eilViewStatuses(null)).toBeNull();
  });

  it("reads the view from the address", () => {
    expect(parseView("ouvertes", EIL_VIEWS)).toBe("ouvertes");
    expect(parseView("cloturees", EIL_VIEWS)).toBeNull();
  });
});

describe("withStatuses", () => {
  const rows = [
    { id: "a", status: "PREVUE" },
    { id: "b", status: "CLOTUREE" },
    { id: "c", status: "RESULTATS_RECUS" },
    { id: "d", status: "EN_COURS" },
  ] as const;

  it("keeps the rows of the filter, in their order", () => {
    expect(withStatuses(rows, EIL_OPEN_STATUSES).map((row) => row.id)).toEqual(["a", "c", "d"]);
    expect(withStatuses(rows, ["CLOTUREE"]).map((row) => row.id)).toEqual(["b"]);
  });

  it("keeps everything without a filter, as a new array", () => {
    const all = withStatuses(rows, null);
    expect(all.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
    expect(all).not.toBe(rows);
  });

  it("serves the supplier invoices too", () => {
    const invoices = [
      { id: "1", status: "A_PAYER" as const },
      { id: "2", status: "PAYEE" as const },
    ];
    const status = purchaseInvoiceViewStatus("a_payer");
    expect(withStatuses(invoices, status ? [status] : null).map((row) => row.id)).toEqual(["1"]);
  });
});

describe("supplier invoice views", () => {
  it("« a_payer » keeps the unpaid invoices", () => {
    expect(purchaseInvoiceViewStatus("a_payer")).toBe("A_PAYER");
    expect(purchaseInvoiceViewStatus(null)).toBeNull();
    expect(parseView("a_payer", PURCHASE_INVOICE_VIEWS)).toBe("a_payer");
    expect(parseView("payees", PURCHASE_INVOICE_VIEWS)).toBeNull();
  });
});

describe("fiche client invoice views", () => {
  it("map each tile to the invoice-list group its figure is made of", () => {
    expect(CLIENT_INVOICE_VIEW_FILTERS).toEqual({ facture: "EMISES", encaisse: "AVEC_REGLEMENT" });
    expect(Object.keys(CLIENT_INVOICE_VIEW_FILTERS).sort()).toEqual(Object.keys(CLIENT_INVOICE_VIEWS).sort());
  });

  it("links to the fiche's « Factures » card with the view", () => {
    expect(clientFicheHref("c1", "facture")).toBe("/commercial/c1?vue=facture#factures");
    expect(clientFicheHref("c1", "encaisse")).toBe("/commercial/c1?vue=encaisse#factures");
    expect(clientFicheHref("c1", null)).toBe("/commercial/c1#factures");
  });

  it("keeps the summary's period, and only a well-formed one", () => {
    expect(clientFicheHref("c1", "facture", { du: "2026-10-01", au: "2026-10-08" })).toBe(
      "/commercial/c1?du=2026-10-01&au=2026-10-08&vue=facture#factures"
    );
    expect(clientFicheHref("c1", null, { du: "2026-10-01" })).toBe("/commercial/c1?du=2026-10-01#factures");
    expect(clientFicheHref("c1", "facture", { du: "hier", au: ["2026-10-08"] })).toBe(
      "/commercial/c1?vue=facture#factures"
    );
  });

  it("escapes the client id", () => {
    expect(clientFicheHref("a/b", null)).toBe("/commercial/a%2Fb#factures");
  });
});
