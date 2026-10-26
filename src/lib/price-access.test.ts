import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "./roles";
import {
  ADVANCE_ROLES,
  BILLING_ROLES,
  billingAnswer,
  clientForRole,
  heldInvoiceFor,
  seesAdvance,
  seesBilling,
  siteForRole,
} from "./price-access";

/**
 * The owner's rule of 24–25/10, role by role: prices, amounts, invoices and
 * billing status for the comptabilité, the administrator, the Direction and
 * the gestionnaire commercial; the counter's advance for the réception too;
 * nothing for anyone else. Invented invoice numbers only.
 */

const BILLING: Role[] = ["COMPTABLE", "ADMIN", "DIRECTION", "GESTIONNAIRE"];
const OUTSIDE: Role[] = ["PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "PRELEVEUR", "MAGASINIER", "RECEPTIONNISTE", "CLIENT"];

describe("seesBilling / seesAdvance — who sees what the laboratory charges", () => {
  it("covers every role of the application, each on one side", () => {
    expect([...BILLING, ...OUTSIDE].sort()).toEqual([...ROLES].sort());
    expect([...BILLING_ROLES].sort()).toEqual([...BILLING].sort());
  });

  it("prices, amounts and invoices: the comptabilité, the administrator, the Direction and the commercial only", () => {
    for (const role of BILLING) expect(seesBilling(role), role).toBe(true);
    // The responsable des paramètres first: the owner saw prices and « facture » on his screen.
    for (const role of OUTSIDE) expect(seesBilling(role), role).toBe(false);
  });

  it("the counter's advance: the réception too, and still nobody else", () => {
    expect([...ADVANCE_ROLES].sort()).toEqual(["RECEPTIONNISTE", ...BILLING].sort());
    expect(seesAdvance("RECEPTIONNISTE")).toBe(true);
    expect(seesBilling("RECEPTIONNISTE")).toBe(false);
    for (const role of BILLING) expect(seesAdvance(role), role).toBe(true);
    for (const role of OUTSIDE.filter((r) => r !== "RECEPTIONNISTE")) expect(seesAdvance(role), role).toBe(false);
  });

  it("refuses anything that is not a role", () => {
    for (const value of [undefined, null, "", "admin", "COMPTABLE ", 1, {}]) {
      expect(seesBilling(value)).toBe(false);
      expect(seesAdvance(value)).toBe(false);
    }
  });
});

describe("heldInvoiceFor — the invoice holding a sample, as each role is told of it", () => {
  const issued = { invoiceId: "inv-1", number: "FAC-2026-00012" };
  const draft = { invoiceId: "inv-2", number: null };

  it("the billing roles: its number; never its id", () => {
    for (const role of BILLING) {
      expect(heldInvoiceFor(issued, role), role).toEqual({ number: "FAC-2026-00012", issued: true });
      expect(heldInvoiceFor(draft, role), role).toEqual({ number: null, issued: false });
    }
  });

  it("the others: issued or a draft — the operational warning — never the number", () => {
    for (const role of OUTSIDE) {
      expect(heldInvoiceFor(issued, role), role).toEqual({ number: null, issued: true });
      expect(heldInvoiceFor(draft, role), role).toEqual({ number: null, issued: false });
    }
  });
});

describe("billingAnswer — the `billing` of a change of analyses on a billed sample", () => {
  it("the Direction and the administrator: the invoice's label and the notice naming it", () => {
    for (const role of ["ADMIN", "DIRECTION"] as const) {
      expect(billingAnswer({ number: "FAC-2026-00012" }, role), role).toEqual({
        invoice: "FAC-2026-00012",
        notice:
          "Échantillon déjà facturé (FAC-2026-00012) : prévenez la comptabilité — avoir pour une analyse retirée, facture complémentaire pour une analyse ajoutée.",
      });
      expect(billingAnswer({ number: null }, role).invoice, role).toBe("brouillon");
    }
  });

  it("the responsable des paramètres, the validateur, the réception: the warning without the number, no `invoice`", () => {
    for (const role of ["PROGRAMMATEUR", "VALIDATEUR", "RECEPTIONNISTE"] as const) {
      const answer = billingAnswer({ number: "FAC-2026-00012" }, role);
      expect(answer, role).toEqual({ notice: "Échantillon déjà facturé : prévenez la comptabilité." });
      expect(answer, role).not.toHaveProperty("invoice");
      expect(JSON.stringify(answer), role).not.toContain("FAC-");
      // A draft keeps its own sentence.
      expect(billingAnswer({ number: null }, role).notice, role).toContain("brouillon de facture");
    }
  });
});

describe("clientForRole / siteForRole — who pays for a client or a site (CLIENTS-FUSION.md §4)", () => {
  const client = {
    id: "c1",
    name: "Client test",
    sites: [{ id: "s1", name: "Site test" }],
    billedForId: "c0",
    billedFor: { id: "c0", name: "Siège test" },
    mergedInto: null,
  };
  const site = { id: "s1", name: "Site test", active: true, billingClientId: "c0", billingClient: { id: "c0", name: "Siège test" } };

  it("the billing roles read it as stored", () => {
    for (const role of BILLING) {
      expect(clientForRole(client, role), role).toEqual(client);
      expect(siteForRole(site, role), role).toEqual(site);
    }
  });

  it("the préleveur, the réception, the validation desks: the client and its sites, not who pays", () => {
    for (const role of OUTSIDE) {
      expect(clientForRole(client, role), role).toEqual({ id: "c1", name: "Client test", sites: client.sites, mergedInto: null });
      expect(siteForRole(site, role), role).toEqual({ id: "s1", name: "Site test", active: true });
    }
    // The stored object is left as it was.
    expect(client.billedForId).toBe("c0");
  });

  it("a search row keeps what the picker needs", () => {
    const row = { ...client, matchedSiteId: "s1", matchedLabel: "Client test — Site test" };
    expect(clientForRole(row, "PRELEVEUR")).toMatchObject({ id: "c1", matchedSiteId: "s1", matchedLabel: "Client test — Site test" });
    expect(clientForRole(row, "PRELEVEUR")).not.toHaveProperty("billedFor");
  });
});
