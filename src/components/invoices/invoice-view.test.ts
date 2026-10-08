import { describe, expect, it } from "vitest";
import {
  amountInput,
  collectable,
  creditNoteDraftLines,
  creditNoteLines,
  creditNotePreview,
  documentLabel,
  invoiceActions,
  invoiceFigures,
  invoiceListHref,
  isListGroupFilter,
  LIST_GROUP_FILTERS,
  LIST_STATE_FILTERS,
  listFilterLabel,
  listFiltersQuery,
  matchesListFilter,
  netBilled,
  sameListFilters,
  parseAmount,
  parseListFilters,
  stateFilterWhere,
  sumAmounts,
  type InvoiceViewItem,
} from "./invoice-view";

/**
 * FACTURATION.md §5 — what the invoice screens show and offer. The rules
 * themselves live in `lib/invoice-lifecycle` (tested there); these tests
 * pin how the screens read them.
 */

const issued = {
  status: "EN_ATTENTE" as const,
  kind: "FACTURE" as const,
  balance: 1200,
  remainingCreditable: 1200,
  creditedAmount: 0,
  payments: [] as { id: string }[],
};

describe("invoiceFigures", () => {
  it("reads settled, credited, left to pay and the state from the rows", () => {
    const figures = invoiceFigures({
      status: "EN_ATTENTE",
      kind: "FACTURE",
      total: "1200.00",
      payments: ["500.00", 200],
      creditNotes: ["100.10"],
    });
    expect(figures).toEqual({
      paid: 700,
      credited: 100.1,
      balance: 399.9,
      remainingCreditable: 1099.9,
      state: "PARTIELLEMENT_PAYEE",
    });
  });

  it("reads an invoice fully covered by credit notes as paid", () => {
    expect(
      invoiceFigures({ status: "EN_ATTENTE", kind: "FACTURE", total: 240, payments: [], creditNotes: [240] }).state
    ).toBe("PAYEE");
  });

  it("keeps a draft and a cancelled invoice as such", () => {
    expect(invoiceFigures({ status: "BROUILLON", kind: "FACTURE", total: 10, payments: [], creditNotes: [] }).state).toBe(
      "BROUILLON"
    );
    expect(invoiceFigures({ status: "ANNULEE", kind: "FACTURE", total: 10, payments: [], creditNotes: [] }).state).toBe(
      "ANNULEE"
    );
    expect(invoiceFigures({ status: "EN_ATTENTE", kind: "AVOIR", total: 10, payments: [], creditNotes: [] }).state).toBe(
      "AVOIR"
    );
  });

  it("sums in centimes", () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([])).toBe(0);
  });
});

describe("collectable", () => {
  it("shows « Reste à payer » only for an issued invoice", () => {
    expect(collectable("EMISE")).toBe(true);
    expect(collectable("PARTIELLEMENT_PAYEE")).toBe(true);
    expect(collectable("PAYEE")).toBe(true);
    expect(collectable("BROUILLON")).toBe(false);
    expect(collectable("ANNULEE")).toBe(false);
    expect(collectable("AVOIR")).toBe(false);
  });
});

describe("netBilled — chiffre facturé", () => {
  it("is the issued invoices less the credit notes", () => {
    expect(netBilled("2400.00", "240.10")).toBe(2159.9);
    expect(netBilled(null, null)).toBe(0);
  });

  it("is never negative", () => {
    expect(netBilled(100, 150)).toBe(0);
  });
});

describe("invoiceActions", () => {
  it("offers nothing to a reader", () => {
    expect(invoiceActions(issued, false)).toMatchObject({ recordPayment: false, cancel: false, edit: false });
  });

  it("offers Modifier, Émettre, Supprimer on a draft — nothing else", () => {
    expect(invoiceActions({ ...issued, status: "BROUILLON" }, true)).toEqual({
      edit: true,
      issue: true,
      deleteDraft: true,
      recordPayment: false,
      creditNote: false,
      cancel: false,
      cancelBlockedBy: null,
      deletePayment: false,
    });
  });

  it("offers settlement, credit note and cancellation on an issued invoice", () => {
    expect(invoiceActions(issued, true)).toMatchObject({
      edit: false,
      issue: false,
      recordPayment: true,
      creditNote: true,
      cancel: true,
      cancelBlockedBy: null,
    });
  });

  it("keeps « Annuler » visible but explains why once a settlement exists", () => {
    const actions = invoiceActions({ ...issued, balance: 700, payments: [{ id: "p1" }] }, true);
    expect(actions.cancel).toBe(true);
    expect(actions.cancelBlockedBy).toMatch(/règlement/);
    expect(actions.deletePayment).toBe(true);
  });

  it("stops the settlement once nothing is left, and the credit note once all is credited", () => {
    const actions = invoiceActions(
      { ...issued, status: "PAYEE", balance: 0, remainingCreditable: 0, creditedAmount: 1200 },
      true
    );
    expect(actions.recordPayment).toBe(false);
    expect(actions.creditNote).toBe(false);
  });

  it("offers nothing on a cancelled invoice or a credit note", () => {
    expect(invoiceActions({ ...issued, status: "ANNULEE" }, true)).toMatchObject({ cancel: false, recordPayment: false });
    expect(invoiceActions({ ...issued, kind: "AVOIR" }, true)).toMatchObject({ cancel: false, creditNote: false });
  });
});

describe("documentLabel", () => {
  it("is the number, or « Brouillon » while there is none", () => {
    expect(documentLabel({ number: "FAC-2026-0042", kind: "FACTURE" })).toBe("FAC-2026-0042");
    expect(documentLabel({ number: null, kind: "FACTURE" })).toBe("Brouillon");
  });
});

describe("list filters", () => {
  it("reads the known values and ignores the rest", () => {
    expect(parseListFilters({ etat: "PARTIELLEMENT_PAYEE", type: "AVOIR", q: "  Labo Test " })).toEqual({
      state: "PARTIELLEMENT_PAYEE",
      kind: "AVOIR",
      q: "Labo Test",
    });
    expect(parseListFilters({ etat: "AVOIR", type: "x" })).toEqual({ state: null, kind: null, q: "" });
    expect(parseListFilters({ etat: ["PAYEE", "EMISE"] }).state).toBe("PAYEE");
  });

  it("writes them back as a query string", () => {
    expect(listFiltersQuery({ state: "EMISE", kind: null, q: "" })).toBe("?etat=EMISE");
    expect(listFiltersQuery({ state: null, kind: null, q: "" })).toBe("");
  });

  it("narrows the stored columns before the exact state is read", () => {
    expect(stateFilterWhere(null)).toEqual({});
    expect(stateFilterWhere("BROUILLON")).toEqual({ kind: "FACTURE", status: { in: ["BROUILLON"] } });
    expect(stateFilterWhere("EMISE").status?.in).toEqual(["EN_ATTENTE"]);
    // Fully credited but stored EN_ATTENTE still reads « Payée ».
    expect(stateFilterWhere("PAYEE").status?.in).toEqual(["PAYEE", "EN_ATTENTE"]);
  });
});

describe("list groups — the figures as a sort (À régler, Émises, Avec règlement)", () => {
  it("reads a group from the address like a state, and keeps it out of the states", () => {
    expect(parseListFilters({ etat: "A_REGLER" }).state).toBe("A_REGLER");
    expect(parseListFilters({ etat: "EMISES", type: "FACTURE" })).toEqual({ state: "EMISES", kind: "FACTURE", q: "" });
    expect(parseListFilters({ etat: "AVEC_REGLEMENT" }).state).toBe("AVEC_REGLEMENT");
    expect(parseListFilters({ etat: "a_regler" }).state).toBeNull();
    for (const group of LIST_GROUP_FILTERS) expect(LIST_STATE_FILTERS as readonly string[]).not.toContain(group);
    expect(isListGroupFilter("EMISES")).toBe(true);
    expect(isListGroupFilter("EMISE")).toBe(false);
    expect(isListGroupFilter(null)).toBe(false);
  });

  it("labels a state or a group", () => {
    expect(listFilterLabel("A_REGLER")).toBe("À régler");
    expect(listFilterLabel("EMISES")).toBe("Émises");
    expect(listFilterLabel("AVEC_REGLEMENT")).toBe("Avec règlement");
    expect(listFilterLabel("EMISE")).toBe("Émise");
  });

  it("« À régler » = issued invoices with something left: Émise ∪ Partiellement payée", () => {
    expect(stateFilterWhere("A_REGLER")).toEqual({ kind: "FACTURE", status: { in: ["EN_ATTENTE"] } });
    expect(matchesListFilter("EMISE", "A_REGLER")).toBe(true);
    expect(matchesListFilter("PARTIELLEMENT_PAYEE", "A_REGLER")).toBe(true);
    // EN_ATTENTE but fully covered by credit notes: nothing left to pay.
    expect(matchesListFilter("PAYEE", "A_REGLER")).toBe(false);
    expect(matchesListFilter("AVOIR", "A_REGLER")).toBe(false);
  });

  it("« Émises » = the issued, not cancelled, invoices and credit notes « Facturé » sums", () => {
    expect(stateFilterWhere("EMISES")).toEqual({
      OR: [
        { kind: "FACTURE", status: { in: ["EN_ATTENTE", "PAYEE"] } },
        { kind: "AVOIR", status: { notIn: ["BROUILLON", "ANNULEE"] } },
      ],
    });
    for (const state of ["EMISE", "PARTIELLEMENT_PAYEE", "PAYEE", "AVOIR"] as const) {
      expect(matchesListFilter(state, "EMISES")).toBe(true);
    }
    expect(matchesListFilter("BROUILLON", "EMISES")).toBe(false);
    expect(matchesListFilter("ANNULEE", "EMISES")).toBe(false);
  });

  it("« Avec règlement » = the invoices that received a settlement, whatever their state", () => {
    expect(stateFilterWhere("AVEC_REGLEMENT")).toEqual({ payments: { some: {} } });
    expect(matchesListFilter("PAYEE", "AVEC_REGLEMENT")).toBe(true);
    expect(matchesListFilter("PARTIELLEMENT_PAYEE", "AVEC_REGLEMENT")).toBe(true);
  });

  it("keeps the exact states exact", () => {
    expect(matchesListFilter("EMISE", "EMISE")).toBe(true);
    expect(matchesListFilter("PARTIELLEMENT_PAYEE", "EMISE")).toBe(false);
    expect(matchesListFilter("BROUILLON", null)).toBe(true);
  });

  it("builds the list link of a tile and tells when the list shows it", () => {
    expect(invoiceListHref("/comptabilite/factures", { state: "A_REGLER" })).toBe("/comptabilite/factures?etat=A_REGLER");
    expect(invoiceListHref("/admin/factures", { state: "EMISES", kind: "FACTURE" })).toBe(
      "/admin/factures?etat=EMISES&type=FACTURE"
    );
    expect(invoiceListHref("/admin/factures")).toBe("/admin/factures");
    const shown = parseListFilters({ etat: "EMISES", type: "FACTURE" });
    expect(sameListFilters(shown, { state: "EMISES", kind: "FACTURE" })).toBe(true);
    expect(sameListFilters(shown, { state: "EMISES" })).toBe(false);
    expect(sameListFilters(parseListFilters({}), {})).toBe(true);
  });
});

describe("amounts typed in the forms", () => {
  it("accepts a French comma and spaces", () => {
    expect(parseAmount("1 250,50")).toBe(1250.5);
    expect(parseAmount("12.3")).toBe(12.3);
    expect(Number.isNaN(parseAmount("-5"))).toBe(true);
    expect(Number.isNaN(parseAmount(""))).toBe(true);
  });

  it("pre-fills the settlement with what is left", () => {
    expect(amountInput(399.9)).toBe("399.90");
    expect(amountInput(0)).toBe("");
  });
});

describe("credit-note dialog", () => {
  const items: InvoiceViewItem[] = [
    { id: "i1", description: "Analyse microbiologique", quantity: 2, unitPrice: 100, lineTotal: 200, sampleId: "s1" },
    { id: "i2", description: "Déplacement", quantity: 1, unitPrice: 50, lineTotal: 50, sampleId: null },
  ];

  it("starts from the invoice lines, unticked", () => {
    const draft = creditNoteDraftLines(items);
    expect(draft.map((line) => [line.invoiceItemId, line.selected, line.quantity, line.unitPrice])).toEqual([
      ["i1", false, "2", "100.00"],
      ["i2", false, "1", "50.00"],
    ]);
  });

  it("sends only the ticked lines, never a sample", () => {
    const draft = creditNoteDraftLines(items);
    draft[0] = { ...draft[0], selected: true, quantity: "1" };
    draft.push({ key: "free", invoiceItemId: null, selected: true, description: " Geste commercial ", quantity: "1", unitPrice: "10" });
    expect(creditNoteLines(draft)).toEqual([
      { description: "Analyse microbiologique", quantity: 1, unitPrice: 100, invoiceItemId: "i1" },
      { description: "Geste commercial", quantity: 1, unitPrice: 10 },
    ]);
  });

  it("previews the totals at the invoice rate and refuses beyond the creditable amount", () => {
    const draft = creditNoteDraftLines(items).map((line) => ({ ...line, selected: true }));
    const ok = creditNotePreview(draft, 300, 20);
    expect(ok.totals.total).toBe(300);
    expect(ok.error).toBeNull();
    const tooMuch = creditNotePreview(draft, 299.99, 20);
    expect(tooMuch.error).toMatch(/dépasse/);
  });

  it("asks for a line when none is ticked", () => {
    expect(creditNotePreview(creditNoteDraftLines(items), 300, 20).error).toMatch(/au moins une ligne/);
  });
});

describe("invoiceFigures — nothing owed outside an issued invoice (review 08/10)", () => {
  it("reads 0 to pay and 0 to credit on a draft, a cancelled invoice and a credit note, like the API", () => {
    for (const input of [
      { status: "BROUILLON", kind: "FACTURE" },
      { status: "ANNULEE", kind: "FACTURE" },
      { status: "EN_ATTENTE", kind: "AVOIR" },
    ] as const) {
      const figures = invoiceFigures({ ...input, total: 1200, payments: [], creditNotes: [] });
      expect(figures.balance).toBe(0);
      expect(figures.remainingCreditable).toBe(0);
    }
  });

  it("keeps what is owed on an issued invoice, paid or not", () => {
    expect(invoiceFigures({ status: "EN_ATTENTE", kind: "FACTURE", total: 1200, payments: [], creditNotes: [] }).balance).toBe(1200);
    const paid = invoiceFigures({ status: "PAYEE", kind: "FACTURE", total: 1200, payments: [1200], creditNotes: [] });
    expect(paid.balance).toBe(0);
    expect(paid.remainingCreditable).toBe(1200);
  });
});
