import { describe, expect, it } from "vitest";
import {
  MAX_EXAMPLES,
  SITE_FILE_HEADER,
  guessSiteColumns,
  historyText,
  isFlagSet,
  normalizeSiteName,
  planSiteImport,
  planWrites,
  readSiteRows,
  sitesByParent,
  type ClientCandidate,
  type ExistingSite,
  type SiteImportPlan,
  type SiteRow,
} from "./sites-import";

const HEADER = SITE_FILE_HEADER.split(";");
const COLUMNS = guessSiteColumns(HEADER)!;

const NO_HISTORY = { series: 0, samples: 0, invoices: 0, sites: 0 };
const client = (id: string, name: string, history: Partial<ClientCandidate["history"]> = {}, extra: Partial<ClientCandidate> = {}): ClientCandidate => ({
  id,
  name,
  history: { ...NO_HISTORY, ...history },
  ...extra,
});

let nextLine = 2;
const row = (legacySiteId: number, site: string, parent: string, extra: Partial<SiteRow> = {}): SiteRow => ({
  line: nextLine++,
  legacySiteId,
  site,
  address: null,
  city: null,
  phone: null,
  obsolete: false,
  legacyClientId: null,
  client: parent,
  clientObsolete: false,
  alsoClient: false,
  ...extra,
});

/** Every row lands in exactly one of these. */
const placed = (plan: SiteImportPlan) =>
  plan.counts.create + plan.counts.present + plan.counts.ambiguousParent + plan.counts.missingParent + plan.counts.duplicate + plan.counts.rejected;

describe("normalizeSiteName", () => {
  it("drops accents, case and punctuation, and collapses spaces", () => {
    expect(normalizeSiteName("Café d'Essai")).toBe("CAFE D ESSAI");
    expect(normalizeSiteName("  Restaurant  Le-Palmier ")).toBe("RESTAURANT LE PALMIER");
    expect(normalizeSiteName("Crêperie n°2")).toBe("CREPERIE N 2");
    expect(normalizeSiteName("CAFE D ESSAI")).toBe(normalizeSiteName("café  d’essai"));
    expect(normalizeSiteName(" -- ")).toBe("");
  });
});

describe("isFlagSet", () => {
  it("reads the usual ways an export writes a set flag", () => {
    for (const yes of ["1", "true", "T", "oui", "Vrai", " x "]) expect(isFlagSet(yes)).toBe(true);
    for (const no of ["0", "", "false", "non", undefined]) expect(isFlagSet(no)).toBe(false);
  });
});

describe("guessSiteColumns", () => {
  it("finds the export's columns, case and accents ignored", () => {
    expect(COLUMNS).toEqual({
      legacySiteId: 0,
      site: 1,
      address: 2,
      city: 3,
      phone: 4,
      obsolete: 6,
      legacyClientId: 7,
      client: 8,
      clientObsolete: 9,
      alsoClient: 10,
    });
    expect(guessSiteColumns(["CLIENT", "Site", "LEGACY_SITE_ID", "Téléphone"])).toMatchObject({ legacySiteId: 2, site: 1, client: 0, phone: 3, city: -1 });
  });

  it("refuses a file without the site id, the site or the client", () => {
    expect(guessSiteColumns(["legacySiteId", "site", "adresse"])).toBeNull();
    expect(guessSiteColumns(["site", "client"])).toBeNull();
  });
});

describe("readSiteRows", () => {
  it("keeps the rows it can use and says why it rejects the others", () => {
    const { rows, rejected } = readSiteRows(
      [
        ["101", "  Restaurant   Test Centre ", "12, rue des Essais", "Ville Démo", "0522000000", "contact@exemple.ma", "0", "7", "Chaîne Démo", "0"],
        ["abc", "Restaurant Test Gare", "", "", "", "", "0", "7", "Chaîne Démo", "0"],
        ["102", "", "", "", "", "", "0", "7", "Chaîne Démo", "0"],
        ["103", "Restaurant Test Port", "", "", "", "", "1", "7", "", "0"],
        ["104", "Restaurant Test Port", "", "", "", "", "1", "", "Chaîne Démo", "1"],
        ["0", "Restaurant Zéro", "", "", "", "", "0", "7", "Chaîne Démo", "0"],
      ],
      COLUMNS
    );
    expect(rows).toEqual([
      {
        line: 2,
        legacySiteId: 101,
        site: "Restaurant Test Centre",
        address: "12, rue des Essais",
        city: "Ville Démo",
        phone: "0522000000",
        obsolete: false,
        legacyClientId: 7,
        client: "Chaîne Démo",
        clientObsolete: false,
        alsoClient: false,
      },
      {
        line: 6,
        legacySiteId: 104,
        site: "Restaurant Test Port",
        address: null,
        city: null,
        phone: null,
        obsolete: true,
        legacyClientId: null,
        client: "Chaîne Démo",
        clientObsolete: true,
        alsoClient: false,
      },
    ]);
    expect(rejected).toEqual([
      { line: 3, site: "Restaurant Test Gare", client: "Chaîne Démo", reason: "Identifiant du site manquant ou invalide." },
      { line: 4, site: "", client: "Chaîne Démo", reason: "Nom du site manquant." },
      { line: 5, site: "Restaurant Test Port", client: "", reason: "Client parent manquant." },
      { line: 7, site: "Restaurant Zéro", client: "Chaîne Démo", reason: "Identifiant du site manquant ou invalide." },
    ]);
  });

  it("rejects a site name longer than the column", () => {
    const { rejected } = readSiteRows([["5", "A".repeat(192), "", "", "", "", "0", "", "Chaîne Démo", "0"]], COLUMNS);
    expect(rejected[0].reason).toBe("Nom du site trop long (191 caractères maximum).");
  });
});

describe("planSiteImport", () => {
  const chain = client("c-chain", "Chaîne Démo", { series: 4, invoices: 2 });
  const centre = client("c-centre", "RESTAURANT TEST CENTRE", {}, { address: "Adresse du faux client", phone: "0600000000" });
  const gare = client("c-gare", "Restaurant Test Gare", { series: 2, samples: 3 });
  const other = client("c-other", "Client Démo", { series: 1 });

  it("creates the site under its parent and attaches the client created by mistake", () => {
    nextLine = 2;
    const plan = planSiteImport([row(101, "Restaurant Test Centre", "CHAINE DEMO", { city: "Ville Démo" })], {
      clients: [chain, centre, other],
      sites: [],
    });
    expect(plan.counts).toMatchObject({ create: 1, attach: 1, present: 0 });
    expect(plan.sites).toEqual([
      {
        line: 2,
        legacySiteId: 101,
        parentId: "c-chain",
        parentName: "Chaîne Démo",
        name: "Restaurant Test Centre",
        existingId: null,
        // The file is silent on the address and phone: the mistaken client's own are kept.
        create: { name: "Restaurant Test Centre", address: "Adresse du faux client", city: "Ville Démo", phone: "0600000000", legacyId: 101, active: true },
        fill: {},
        pseudo: { id: "c-centre", name: "RESTAURANT TEST CENTRE" },
      },
    ]);
    expect(plan.examples.attach).toEqual([{ line: 2, site: "Restaurant Test Centre", client: "CHAINE DEMO", detail: "RESTAURANT TEST CENTRE" }]);
    expect(planWrites(plan)).toBe(true);
  });

  it("never archives a client whose name is also a real client of the old software", () => {
    nextLine = 2;
    const plan = planSiteImport([row(102, "Restaurant Test Centre", "CHAINE DEMO", { alsoClient: true })], {
      clients: [chain, centre, other],
      sites: [],
    });
    expect(plan.counts).toMatchObject({ create: 1, attach: 0, ambiguousSite: 1 });
    expect(plan.sites[0].pseudo).toBeNull();
    expect(plan.examples.ambiguousSite[0].detail).toMatch(/client à part entière/);
  });

  it("only reports a client that has a history", () => {
    nextLine = 2;
    const plan = planSiteImport([row(102, "Restaurant Test Gare", "Chaîne Démo")], { clients: [chain, gare], sites: [] });
    expect(plan.counts).toMatchObject({ create: 1, withHistory: 1, attach: 0 });
    expect(plan.sites[0].pseudo).toBeNull();
    expect(plan.examples.withHistory[0].detail).toBe("« Restaurant Test Gare » : 2 séries, 3 échantillons.");
  });

  it("treats a client with sites of its own as a real client", () => {
    nextLine = 2;
    const withSite = client("c-site", "Restaurant Test Plage", { sites: 1 });
    const plan = planSiteImport([row(103, "Restaurant Test Plage", "Chaîne Démo")], { clients: [chain, withSite], sites: [] });
    expect(plan.counts.withHistory).toBe(1);
    expect(plan.sites[0].pseudo).toBeNull();
  });

  it("skips a row whose parent is missing or ambiguous", () => {
    nextLine = 2;
    const plan = planSiteImport(
      [row(201, "Site Un", "Inconnu SARL"), row(202, "Site Deux", "Groupe Double")],
      { clients: [chain, client("g1", "Groupe Double"), client("g2", "GROUPE  DOUBLE")], sites: [] }
    );
    expect(plan.counts).toMatchObject({ missingParent: 1, ambiguousParent: 1, create: 0 });
    expect(plan.sites).toEqual([]);
    expect(plan.examples.ambiguousParent[0].detail).toBe("2 clients actifs portent ce nom.");
    expect(planWrites(plan)).toBe(false);
  });

  it("creates the site but touches no client when the name is doubtful", () => {
    nextLine = 2;
    const plan = planSiteImport(
      [
        // The same quarter in two chains: which one does « Quartier Nord » belong to?
        row(301, "Quartier Nord", "Chaîne Démo"),
        row(302, "Quartier Nord", "Restaurant Test Groupe"),
        // Two active clients bear the site's name.
        row(303, "Snack Test", "Chaîne Démo"),
        // The site's name is also a parent of the file: never archived.
        row(304, "Restaurant Test Groupe", "Chaîne Démo"),
      ],
      {
        clients: [
          chain,
          client("c-group", "Restaurant Test Groupe"),
          client("c-north", "Quartier Nord"),
          client("s1", "Snack Test"),
          client("s2", "Snack-Test"),
        ],
        sites: [],
      }
    );
    expect(plan.counts).toMatchObject({ create: 4, ambiguousSite: 4, attach: 0 });
    expect(plan.sites.every((s) => s.pseudo === null)).toBe(true);
    expect(plan.examples.ambiguousSite.map((e) => e.detail)).toEqual([
      "Nom présent 2 fois dans le fichier : aucun client n'est touché.",
      "Nom présent 2 fois dans le fichier : aucun client n'est touché.",
      "2 clients actifs portent ce nom : aucun n'est touché.",
      "« Restaurant Test Groupe » est aussi un client parent du fichier : il n'est pas touché.",
    ]);
  });

  it("never takes the parent for the client created by mistake", () => {
    nextLine = 2;
    const plan = planSiteImport([row(401, "Chaîne Démo", "Chaîne Démo")], { clients: [chain], sites: [] });
    expect(plan.counts).toMatchObject({ create: 1, attach: 0, ambiguousSite: 0 });
  });

  it("finds a site already there by its legacy id, or by its name under the parent", () => {
    nextLine = 2;
    const sites: ExistingSite[] = [
      { id: "s-legacy", clientId: "c-chain", name: "Restaurant Test Centre", legacyId: 101, address: "Déjà là", city: null, phone: null },
      { id: "s-hand", clientId: "c-chain", name: "Cuisine centrale", legacyId: null, address: null, city: "Ville Démo", phone: null },
    ];
    const plan = planSiteImport(
      [
        row(101, "Restaurant Test Centre (renommé)", "Chaîne Démo", { address: "Autre adresse", city: "Ville Démo" }),
        row(150, "CUISINE CENTRALE", "Chaîne Démo", { address: "Zone d'essai", city: "Autre ville" }),
      ],
      { clients: [chain], sites }
    );
    expect(plan.counts).toMatchObject({ present: 2, create: 0 });
    expect(plan.completed).toBe(2);
    expect(plan.sites.map((s) => [s.existingId, s.name, s.fill])).toEqual([
      ["s-legacy", "Restaurant Test Centre", { city: "Ville Démo" }],
      ["s-hand", "Cuisine centrale", { address: "Zone d'essai", legacyId: 150 }],
    ]);
    expect(plan.examples.present.map((e) => e.detail)).toEqual(["À compléter : ville.", "À compléter : adresse."]);
  });

  it("attaches the mistaken client to a site the laboratory already created by hand", () => {
    nextLine = 2;
    const plan = planSiteImport([row(101, "Restaurant Test Centre", "Chaîne Démo")], {
      clients: [chain, centre],
      sites: [{ id: "s-hand", clientId: "c-chain", name: "Restaurant test centre", legacyId: null, address: null, city: null, phone: null }],
    });
    expect(plan.counts).toMatchObject({ present: 1, attach: 1 });
    expect(plan.sites[0]).toMatchObject({ existingId: "s-hand", pseudo: { id: "c-centre" }, fill: { legacyId: 101, address: "Adresse du faux client", phone: "0600000000" } });
  });

  it("leaves alone a site filed under another client", () => {
    nextLine = 2;
    const plan = planSiteImport([row(101, "Restaurant Test Centre", "Chaîne Démo")], {
      clients: [chain, centre],
      sites: [{ id: "s-moved", clientId: "c-other", name: "Restaurant Test Centre", legacyId: 101, address: null, city: null, phone: null }],
    });
    expect(plan.counts).toMatchObject({ present: 1, attach: 0 });
    expect(plan.sites).toEqual([]);
    expect(plan.examples.present[0].detail).toBe("Déjà rattaché à un autre client : laissé tel quel.");
  });

  it("reports duplicates in the file and creates obsolete sites inactive", () => {
    nextLine = 2;
    const plan = planSiteImport(
      [
        row(501, "Restaurant Test Port", "Chaîne Démo", { obsolete: true }),
        row(501, "Restaurant Test Port bis", "Chaîne Démo"),
        row(502, "restaurant test-port", "Chaîne Démo"),
      ],
      { clients: [chain], sites: [] }
    );
    expect(plan.counts).toMatchObject({ create: 1, duplicate: 2 });
    expect(plan.inactive).toBe(1);
    expect(plan.sites[0].create?.active).toBe(false);
    expect(plan.examples.duplicate.map((e) => e.detail)).toEqual(["Même identifiant que la ligne 2.", "Même site que la ligne 2."]);
    expect(plan.examples.create[0].detail).toBe("inactif (obsolète dans l'ancien logiciel)");
  });

  it("puts every row in one place, caps the examples and ranks the parents", () => {
    nextLine = 2;
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => row(1000 + i, `Site ${i}`, "Absent SARL")),
      ...Array.from({ length: 12 }, (_, i) => row(2000 + i, `Restaurant ${i}`, "Chaîne Démo")),
      ...Array.from({ length: 3 }, (_, i) => row(3000 + i, `Cantine ${i}`, "Client Démo")),
    ];
    const plan = planSiteImport(rows, { clients: [chain, other], sites: [] }, [{ line: 99, site: "", client: "", reason: "Nom du site manquant." }]);
    expect(plan.rows).toBe(56);
    expect(placed(plan)).toBe(plan.rows);
    expect(plan.counts.missingParent).toBe(40);
    expect(plan.examples.missingParent).toHaveLength(MAX_EXAMPLES);
    expect(plan.parents).toEqual([
      { name: "Chaîne Démo", sites: 12, create: 12, attach: 0 },
      { name: "Client Démo", sites: 3, create: 3, attach: 0 },
    ]);
  });

  it("is idempotent: once written, a second analysis has nothing left to write", () => {
    nextLine = 2;
    const rows = [row(101, "Restaurant Test Centre", "Chaîne Démo", { city: "Ville Démo" }), row(102, "Restaurant Test Gare", "Chaîne Démo")];
    const first = planSiteImport(rows, { clients: [chain, centre, gare], sites: [] });
    expect(first.counts).toMatchObject({ create: 2, attach: 1, withHistory: 1 });

    // What the commit leaves: the two sites with their legacy id, the mistaken client archived.
    const written: ExistingSite[] = first.sites.map((s, i) => ({ id: `new-${i}`, clientId: s.parentId, ...s.create! }));
    const second = planSiteImport(rows, { clients: [chain, gare], sites: written });
    expect(second.counts).toMatchObject({ create: 0, present: 2, attach: 0, withHistory: 1 });
    expect(second.completed).toBe(0);
    expect(planWrites(second)).toBe(false);
  });
});

describe("sitesByParent", () => {
  it("groups the sites by parent, parents in name order", () => {
    nextLine = 2;
    const plan = planSiteImport(
      [row(1, "Un", "Client Démo"), row(2, "Deux", "Chaîne Démo"), row(3, "Trois", "Client Démo")],
      { clients: [client("b", "Client Démo"), client("a", "Chaîne Démo")], sites: [] }
    );
    expect(sitesByParent(plan.sites).map((g) => [g.parentName, g.sites.map((s) => s.name)])).toEqual([
      ["Chaîne Démo", ["Deux"]],
      ["Client Démo", ["Un", "Trois"]],
    ]);
  });
});

describe("historyText", () => {
  it("says what makes the client real, singular and plural", () => {
    expect(historyText({ series: 1, samples: 0, invoices: 2, sites: 0 })).toBe("1 série, 2 factures");
    expect(historyText({ series: 0, samples: 1, invoices: 0, sites: 3 })).toBe("1 échantillon, 3 sites");
  });
});
