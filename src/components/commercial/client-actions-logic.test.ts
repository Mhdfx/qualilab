import { describe, expect, it } from "vitest";
import {
  archivedBanner,
  archivedKind,
  importedParentId,
  attachSummary,
  countLabel,
  frenchList,
  mergeSummary,
  shouldCheckSimilar,
  similarQuery,
  siteBillingOptions,
  viaSiteLabel,
} from "./client-actions-logic";

/**
 * CLIENTS-FUSION.md §2–6 — what the fiche says before an irreversible
 * merge or attach, the « Facturé à » choices and where a billed sample comes
 * from. Invented names only.
 */

const ZERO_MERGE = {
  series: 0,
  samples: 0,
  invoices: 0,
  sites: 0,
  sitesMerged: 0,
  emails: 0,
  places: 0,
  products: 0,
  productTypes: 0,
  profiles: 0,
};

describe("countLabel / frenchList", () => {
  it("agrees in number", () => {
    expect(countLabel(0, "série", "séries")).toBe("0 série");
    expect(countLabel(1, "série", "séries")).toBe("1 série");
    expect(countLabel(3, "série", "séries")).toBe("3 séries");
  });

  it("joins with « et »", () => {
    expect(frenchList([])).toBe("");
    expect(frenchList(["a"])).toBe("a");
    expect(frenchList(["a", "b"])).toBe("a et b");
    expect(frenchList(["a", "b", "c"])).toBe("a, b et c");
  });
});

describe("mergeSummary", () => {
  it("says what passes to the kept fiche", () => {
    const summary = mergeSummary(
      { ...ZERO_MERGE, samples: 12, series: 3, invoices: 1, sites: 2, sitesMerged: 1, emails: 4, places: 10, products: 6, profiles: 2 },
      "Client Demo",
      "Client Démo"
    );
    expect(summary.headline).toBe("12 échantillons, 3 séries et 1 facture passeront à « Client Démo ».");
    expect(summary.details).toEqual([
      "2 sites déplacés et 1 site fusionné avec le site du même nom",
      "4 adresses e-mail",
      "10 lieux mémorisés et 6 produits mémorisés",
      "2 profils d'analyse",
    ]);
    expect(summary.stays).toEqual(["La fiche « Client Demo » sera archivée et renverra vers « Client Démo »."]);
  });

  it("says which billing links follow", () => {
    const summary = mergeSummary({ ...ZERO_MERGE, billingClients: 2, billedSites: 1 }, "B", "A");
    expect(summary.details).toEqual([
      "2 clients facturés de « B » deviennent clients facturés de « A »",
      "1 site facturé à « B » le sera à « A »",
    ]);
  });

  it("uses the singular for a single item", () => {
    expect(mergeSummary({ ...ZERO_MERGE, samples: 1 }, "B", "A").headline).toBe("1 échantillon passera à « A ».");
    expect(mergeSummary({ ...ZERO_MERGE, samples: 1, series: 1 }, "B", "A").headline).toBe(
      "1 échantillon et 1 série passeront à « A »."
    );
  });

  it("says when nothing moves, and tolerates missing counts", () => {
    const summary = mergeSummary({}, "B", "A");
    expect(summary.headline).toBe("Aucun échantillon, aucune série ni facture à transférer à « A ».");
    expect(summary.details).toEqual([]);
  });
});

describe("attachSummary", () => {
  it("moves samples onto the site and keeps the invoices with B", () => {
    const summary = attachSummary(
      { series: 2, samples: 5, emails: 1, places: 0, products: 3, productTypes: 1, profiles: 0, invoicesKept: 2 },
      "Chaîne Test Agadir",
      "Chaîne Test",
      { name: "Agadir", created: true }
    );
    expect(summary.headline).toBe("5 échantillons et 2 séries passeront sur le site « Agadir » de « Chaîne Test ».");
    expect(summary.details).toEqual([
      "Le site « Agadir » sera créé chez « Chaîne Test ».",
      "1 adresse e-mail",
      "3 produits mémorisés",
      "1 type de produit",
      "Les adresses e-mail rejoignent le site avec les cases « rapports » et « alertes » décochées.",
    ]);
    expect(summary.stays).toEqual([
      "2 factures restent au nom de « Chaîne Test Agadir » : ce sont des documents émis à son nom.",
      "La fiche « Chaîne Test Agadir » sera archivée et renverra vers « Chaîne Test ».",
    ]);
  });

  it("names an existing site", () => {
    const summary = attachSummary({}, "B", "A", { name: "Siège", created: false });
    expect(summary.headline).toBe("Aucun échantillon ni série à transférer sur le site « Siège » de « A ».");
    expect(summary.details[0]).toBe("Le site « Siège » existe déjà chez « A » : il sera utilisé.");
    expect(summary.stays).toHaveLength(1);
  });
});

describe("archivedBanner", () => {
  it("distinguishes merged and attached", () => {
    expect(archivedBanner("merged", "A").lead).toBe("Fusionnée dans");
    expect(archivedBanner("attached", "A").lead).toBe("Rattachée comme site de");
  });
});

describe("archivedKind", () => {
  it("reads the latest journal entry; the sites import leaves none", () => {
    expect(archivedKind("CLIENT_MERGED")).toBe("merged");
    expect(archivedKind("CLIENT_ATTACHED_AS_SITE")).toBe("attached");
    expect(archivedKind(null)).toBe("attached");
    expect(archivedKind(undefined)).toBe("attached");
  });
});

describe("importedParentId", () => {
  it("reads the parent of a client archived by the import of the sites", () => {
    expect(importedParentId(JSON.stringify({ name: "Chaîne Test Agence", source: "import", parentId: "p1" }))).toBe("p1");
  });

  it("ignores a manual archive, a missing parent and broken metadata", () => {
    expect(importedParentId(JSON.stringify({ name: "Client Démo" }))).toBeNull();
    expect(importedParentId(JSON.stringify({ source: "import" }))).toBeNull();
    expect(importedParentId(JSON.stringify({ source: "manual", parentId: "p1" }))).toBeNull();
    expect(importedParentId("pas du JSON")).toBeNull();
    expect(importedParentId("null")).toBeNull();
    expect(importedParentId(null)).toBeNull();
  });
});

describe("mergeSummary — addresses already known", () => {
  it("says which addresses of B are dropped", () => {
    const one = mergeSummary({ ...ZERO_MERGE, emailsDeleted: 1 }, "Client Démo SARL", "Client Démo");
    expect(one.details).toContain("1 adresse e-mail déjà connue de « Client Démo » : supprimée sur « Client Démo SARL »");
    const two = mergeSummary({ ...ZERO_MERGE, emailsDeleted: 2 }, "B", "A");
    expect(two.details).toContain("2 adresses e-mail déjà connues de « A » : supprimées sur « B »");
    expect(mergeSummary(ZERO_MERGE, "B", "A").details.some((line) => line.includes("déjà connu"))).toBe(false);
  });
});

describe("siteBillingOptions", () => {
  const billing = [{ id: "f1", name: "Chaîne Test Franchise" }];

  it("offers the site's client first, then its billing clients", () => {
    expect(siteBillingOptions("Chaîne Test", billing, null)).toEqual([
      { value: "", label: "Chaîne Test (le client du site)" },
      { value: "f1", label: "Chaîne Test Franchise" },
    ]);
  });

  it("keeps a stored billing client that is no longer linked", () => {
    const options = siteBillingOptions("Chaîne Test", billing, { id: "old", name: "Ancienne Holding" });
    expect(options.at(-1)).toEqual({ value: "old", label: "Ancienne Holding (lien retiré)" });
    expect(siteBillingOptions("Chaîne Test", billing, billing[0])).toHaveLength(2);
  });
});

describe("viaSiteLabel", () => {
  it("is null for the invoice client's own sample", () => {
    expect(viaSiteLabel({ clientId: "f1" }, "f1")).toBeNull();
    expect(viaSiteLabel({}, "f1")).toBeNull();
    expect(viaSiteLabel({ via: { clientId: "f1", siteName: "S", clientName: "F" } }, "f1")).toBeNull();
  });

  it("names the site and its client", () => {
    expect(viaSiteLabel({ via: { siteName: "Agadir", clientName: "Chaîne Test", clientId: "p1" } }, "f1")).toBe(
      "via le site Agadir de Chaîne Test"
    );
    expect(
      viaSiteLabel({ clientId: "p1", client: { id: "p1", name: "Chaîne Test" }, serie: { site: { name: "Agadir" } } }, "f1")
    ).toBe("via le site Agadir de Chaîne Test");
    expect(viaSiteLabel({ client: { id: "p1", name: "Chaîne Test" } }, "f1")).toBe("via Chaîne Test");
  });
});

describe("near-duplicate check while typing", () => {
  it("starts at 4 characters when creating", () => {
    expect(shouldCheckSimilar("Cli", null, "", null)).toBe(false);
    expect(shouldCheckSimilar("Clie", null, "", null)).toBe(true);
  });

  it("waits for a change when editing", () => {
    expect(shouldCheckSimilar("Client Démo", "Client Démo", "", null)).toBe(false);
    expect(shouldCheckSimilar("Client Démo SARL", "Client Démo", "", null)).toBe(true);
    expect(shouldCheckSimilar("Client Démo", "Client Démo", "001", "")).toBe(true);
  });

  it("builds the query", () => {
    expect(similarQuery(" Client Démo ", "", null)).toBe("name=Client+D%C3%A9mo");
    expect(similarQuery("Client", "001", "c1")).toBe("name=Client&ice=001&excludeId=c1");
  });
});
