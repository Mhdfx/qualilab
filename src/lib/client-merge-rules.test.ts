import { describe, expect, it } from "vitest";
import {
  checkAttachAsSite,
  checkBilledFor,
  checkMerge,
  checkSiteBilling,
  invoiceSampleRefusal,
  mergeFill,
  sampleBillingClientId,
  type ClientFacts,
} from "./client-merge-rules";

const client = (id: string, name: string, facts: Partial<ClientFacts> = {}): ClientFacts => ({
  id,
  name,
  archived: false,
  ice: null,
  billedForId: null,
  sites: 0,
  billingClients: 0,
  billedSites: 0,
  ...facts,
});

const ICE_1 = "001234567000089";
const ICE_2 = "009876543000012";

describe("mergeFill", () => {
  it("completes the empty fields of A, never overwrites", () => {
    const b = { contact: "M. Essai", email: "b@exemple.ma", phone: "0522000000", address: null, ice: ICE_1 };
    const a = { contact: "", email: "a@exemple.ma", phone: null, address: "1 rue Test", ice: null };
    expect(mergeFill(b, a)).toEqual({
      fill: { contact: "M. Essai", phone: "0522000000", ice: ICE_1 },
      ignored: ["email"],
    });
  });

  it("does not report a value both records share", () => {
    const b = { contact: null, email: " A@Exemple.ma", phone: null, address: null, ice: "001 234 567 000 089" };
    const a = { contact: null, email: "a@exemple.ma", phone: null, address: null, ice: ICE_1 };
    expect(mergeFill(b, a)).toEqual({ fill: {}, ignored: [] });
  });
});

describe("checkMerge", () => {
  const a = client("a", "Client Démo SARL", { ice: ICE_1 });
  const b = client("b", "STE Client Demo");

  it("refuses the same record and archived records", () => {
    expect(checkMerge(a, a).ok).toBe(false);
    expect(checkMerge(client("b", "B", { archived: true }), a)).toEqual({
      ok: false,
      error: "« B » est archivé : réactivez-le d'abord.",
    });
    expect(checkMerge(b, client("a", "A", { archived: true })).ok).toBe(false);
  });

  it("refuses two different ICE: two companies", () => {
    const result = checkMerge(client("b", "B", { ice: ICE_2 }), a);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("deux ICE différents");
    // The same ICE written differently is the same company.
    expect(checkMerge(client("b", "B", { ice: "001 234 567 000 089" }), a).ok).toBe(true);
  });

  it("refuses a principal and its billing client", () => {
    expect(checkMerge(b, client("a", "A", { billedForId: "b" })).ok).toBe(false);
    expect(checkMerge(client("b", "B", { billedForId: "a" }), a).ok).toBe(false);
  });

  it("refuses links that would no longer hold once repointed to A", () => {
    // B's billing clients would become A's while A is itself a billing client.
    expect(checkMerge(client("b", "B", { billingClients: 2 }), client("a", "A", { billedForId: "p" })).ok).toBe(false);
    // B and A billing clients of two different principals.
    expect(checkMerge(client("b", "B", { billedForId: "p" }), client("a", "A", { billedForId: "q" })).ok).toBe(false);
    // B a billing client, A a principal with billing clients of its own.
    expect(checkMerge(client("b", "B", { billedForId: "p" }), client("a", "A", { billingClients: 1 })).ok).toBe(false);
  });

  it("lets A take B's billing link when A has none", () => {
    expect(checkMerge(client("b", "B", { billedForId: "p", billedSites: 2 }), client("a", "A"))).toEqual({
      ok: true,
      adoptBilledForId: "p",
      warnings: [
        "Aucune des deux fiches n'a d'ICE : vérifiez qu'il s'agit bien de la même société.",
        "« A » devient client facturé du même client que « B ».",
      ],
    });
    const same = checkMerge(client("b", "B", { billedForId: "p" }), client("a", "A", { billedForId: "p" }));
    expect(same.ok && same.adoptBilledForId).toBe(null);
  });

  it("warns about a missing ICE and about B's ignored fields", () => {
    const result = checkMerge(
      client("b", "STE Client Demo", { phone: "0522111111", address: "2 rue Démo" }),
      client("a", "Client Démo SARL", { ice: ICE_1, phone: "0522000000" })
    );
    expect(result).toEqual({
      ok: true,
      adoptBilledForId: null,
      warnings: [
        "« STE Client Demo » n'a pas d'ICE : vérifiez qu'il s'agit bien de la même société que « Client Démo SARL ».",
        "Déjà renseignés sur « Client Démo SARL », ces champs de « STE Client Demo » sont ignorés : téléphone.",
      ],
    });
    const fromB = checkMerge(client("b", "B", { ice: ICE_1 }), client("a", "A"));
    expect(fromB.ok && fromB.warnings).toEqual(["« A » n'a pas d'ICE : il reprendra celui de « B »."]);
  });

  it("accepts a principal with billing clients merged into a plain client", () => {
    const result = checkMerge(client("b", "B", { ice: ICE_1, billingClients: 3, sites: 4 }), a);
    expect(result).toEqual({ ok: true, warnings: [], adoptBilledForId: null });
  });
});

describe("checkAttachAsSite", () => {
  const a = client("a", "Chaîne Test", { sites: 5 });
  const b = client("b", "Chaîne Test Agdal");

  it("accepts a plain client", () => {
    expect(checkAttachAsSite(b, a)).toEqual({ ok: true, warnings: [] });
    expect(checkAttachAsSite(b, a, { id: "s1", clientId: "a" })).toEqual({ ok: true, warnings: [] });
  });

  it("refuses the same record, archived records and a site of another client", () => {
    expect(checkAttachAsSite(a, a).ok).toBe(false);
    expect(checkAttachAsSite(client("b", "B", { archived: true }), a).ok).toBe(false);
    expect(checkAttachAsSite(b, client("a", "A", { archived: true })).ok).toBe(false);
    expect(checkAttachAsSite(b, a, { id: "s9", clientId: "z" })).toEqual({
      ok: false,
      error: "Ce site n'appartient pas à « Chaîne Test ».",
    });
  });

  it("refuses a client with sites of its own", () => {
    expect(checkAttachAsSite(client("b", "B", { sites: 2 }), a)).toEqual({
      ok: false,
      error: "« B » a 2 sites : un client qui a des sites ne devient pas un site. Fusionnez-le plutôt.",
    });
  });

  it("refuses a billing client, a principal and a client sites are billed to", () => {
    expect(checkAttachAsSite(client("b", "B", { billedForId: "p" }), a).ok).toBe(false);
    expect(checkAttachAsSite(client("b", "B", { billingClients: 1 }), a).ok).toBe(false);
    expect(checkAttachAsSite(client("b", "B", { billedSites: 1 }), a)).toEqual({
      ok: false,
      error: "1 site est facturé à « B » : changez « Facturé à » d'abord.",
    });
  });

  it("warns, without refusing, about an ICE of its own and invoices kept", () => {
    expect(checkAttachAsSite(client("b", "B", { ice: ICE_2, invoices: 2 }), a)).toEqual({
      ok: true,
      warnings: [
        "« B » a son propre ICE : c'est peut-être un client facturé plutôt qu'un site.",
        "2 factures restent au nom de « B » : ce sont des documents émis à son nom.",
      ],
    });
    // A placeholder ICE is no ICE.
    expect(checkAttachAsSite(client("b", "B", { ice: "000000000000000" }), a)).toEqual({ ok: true, warnings: [] });
  });
});

describe("checkBilledFor", () => {
  const p = client("p", "Chaîne Test", { sites: 3 });
  const f = client("f", "Franchise Démo");

  it("links a billing client to a principal", () => {
    expect(checkBilledFor(f, p)).toEqual({ ok: true, warnings: [] });
  });

  it("refuses itself, archived records, a billing client as principal, a principal as billing client", () => {
    expect(checkBilledFor(f, f).ok).toBe(false);
    expect(checkBilledFor(f, client("p", "P", { archived: true }))).toEqual({
      ok: false,
      error: "« P » est archivé : choisissez un client actif.",
    });
    expect(checkBilledFor(client("f", "F", { archived: true }), p).ok).toBe(false);
    expect(checkBilledFor(f, client("p", "P", { billedForId: "q" }))).toEqual({
      ok: false,
      error: "« P » est lui-même client facturé d'un autre client : choisissez le client principal.",
    });
    expect(checkBilledFor(client("f", "F", { billingClients: 2 }), p)).toEqual({
      ok: false,
      error: "« F » a 2 clients facturés : retirez ces liens d'abord.",
    });
  });

  it("removes the link, warning about the sites billed to it", () => {
    expect(checkBilledFor(client("f", "F", { billedForId: "p" }), null)).toEqual({ ok: true, warnings: [] });
    expect(checkBilledFor(client("f", "F", { billedForId: "p", billedSites: 2 }), null)).toEqual({
      ok: true,
      warnings: ["2 sites facturés à « F » reviendront au client du site."],
    });
    // Moving to another principal: the sites of the former one go back too.
    expect(checkBilledFor(client("f", "F", { billedForId: "q", billedSites: 1 }), p)).toEqual({
      ok: true,
      warnings: ["1 site facturé à « F » reviendra au client du site."],
    });
    // Linking again to the same principal changes nothing.
    expect(checkBilledFor(client("f", "F", { billedForId: "p", billedSites: 1 }), p)).toEqual({ ok: true, warnings: [] });
  });
});

describe("checkSiteBilling", () => {
  const site = { id: "s1", clientId: "p" };

  it("stores null for the site's own client", () => {
    expect(checkSiteBilling(site, null)).toEqual({ ok: true, warnings: [], billingClientId: null });
    expect(checkSiteBilling(site, { id: "p", name: "P", archived: false, billedForId: null })).toEqual({
      ok: true,
      warnings: [],
      billingClientId: null,
    });
  });

  it("accepts a billing client of the site's client only", () => {
    expect(checkSiteBilling(site, { id: "f", name: "F", archived: false, billedForId: "p" })).toEqual({
      ok: true,
      warnings: [],
      billingClientId: "f",
    });
    expect(checkSiteBilling(site, { id: "g", name: "G", archived: false, billedForId: "q" })).toEqual({
      ok: false,
      error: "« G » n'est pas un client facturé de ce client : liez-le d'abord depuis la fiche du client.",
    });
    expect(checkSiteBilling(site, { id: "f", name: "F", archived: true, billedForId: "p" }).ok).toBe(false);
  });
});

describe("sampleBillingClientId / invoiceSampleRefusal", () => {
  const own = { code: "E-1", clientId: "p", siteBillingClientId: null };
  const billed = { code: "E-2", clientId: "p", siteBillingClientId: "f", siteBillingClientName: "Chaîne Test" };

  it("bills a sample to its site's billing client, else to its client", () => {
    expect(sampleBillingClientId(own)).toBe("p");
    expect(sampleBillingClientId({ clientId: "p" })).toBe("p");
    expect(sampleBillingClientId(billed)).toBe("f");
  });

  it("accepts the principal's own samples and the billing client's sites", () => {
    expect(invoiceSampleRefusal(own, "p")).toBeNull();
    expect(invoiceSampleRefusal(billed, "f")).toBeNull();
  });

  it("refuses a site billed to another client on the principal's invoice", () => {
    expect(invoiceSampleRefusal(billed, "p")).toBe(
      "L'échantillon E-2 est facturé à « Chaîne Test » : son site lui est attribué (« Facturé à »)."
    );
  });

  it("refuses another client's sample, and the billing client's own-site samples on another invoice", () => {
    expect(invoiceSampleRefusal(own, "f")).toBe("L'échantillon E-1 appartient à un autre client.");
    expect(invoiceSampleRefusal(own, "x")).toBe("L'échantillon E-1 appartient à un autre client.");
    expect(invoiceSampleRefusal(billed, "x")).toBe("L'échantillon E-2 appartient à un autre client.");
  });
});
