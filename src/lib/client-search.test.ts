import { describe, expect, it } from "vitest";
import {
  CLIENT_SEARCH_LIMIT,
  MATCHED_ROWS_PER_CLIENT,
  clientSearchRows,
  directMatches,
  ficheLabel,
  ficheOrigin,
  ficheOrigins,
  ficheSite,
  firstParentId,
  liveParent,
  matchRank,
  mergeTargets,
  mergedFicheSite,
  missingParents,
  pickerRows,
  type ArchivedFiche,
  type FicheOrigin,
  type MatchedSite,
  type SearchClient,
} from "./client-search";

const UNKNOWN: FicheOrigin = { kind: "unknown", parentId: null, siteId: null };

function client(id: string, name: string, sites: [string, string][] = [], extra: Partial<SearchClient> = {}): SearchClient {
  return { id, name, archived: false, mergedIntoId: null, sites: sites.map(([siteId, siteName]) => ({ id: siteId, name: siteName })), ...extra };
}

const entry = (action: string, metadata: Record<string, unknown> | string | null, entityId = "b") => ({
  entityId,
  action,
  metadata: metadata === null || typeof metadata === "string" ? metadata : JSON.stringify(metadata),
});

describe("ficheOrigin — where an archived fiche went, by its journal", () => {
  it("reads the import of the sites: its parent and its site", () => {
    expect(
      ficheOrigin([entry("CLIENT_ARCHIVED", { name: "Snack Démo", source: "import", parentId: "chain", siteId: "s1" })])
    ).toEqual({ kind: "imported", parentId: "chain", siteId: "s1" });
  });

  it("reads « Rattacher comme site de… » on the attached fiche, not on the parent's own entry", () => {
    expect(
      ficheOrigin([entry("CLIENT_ATTACHED_AS_SITE", { name: "Snack Démo", parentId: "chain", siteId: "s1" })])
    ).toEqual({ kind: "attached", parentId: "chain", siteId: "s1" });
    // The parent's side names what it received (`attachedId`), not where it went.
    expect(ficheOrigin([entry("CLIENT_ATTACHED_AS_SITE", { name: "Chaîne Test", attachedId: "x", siteId: "s1" })])).toEqual(UNKNOWN);
  });

  it("reads a merge on the merged fiche only (kept: false), never with a site", () => {
    expect(ficheOrigin([entry("CLIENT_MERGED", { name: "Client Démo SARL", kept: false, intoId: "a", into: "Client Démo" })])).toEqual({
      kind: "merged",
      parentId: "a",
      siteId: null,
    });
    expect(ficheOrigin([entry("CLIENT_MERGED", { name: "Client Démo", kept: true, mergedId: "b" })])).toEqual(UNKNOWN);
  });

  it("takes the latest entry that says where the fiche went, past a plain archiving", () => {
    expect(
      ficheOrigin([
        entry("CLIENT_ARCHIVED", { name: "Snack Démo" }),
        entry("CLIENT_ARCHIVED", { name: "Snack Démo", source: "import", parentId: "chain", siteId: "s1" }),
      ])
    ).toEqual({ kind: "imported", parentId: "chain", siteId: "s1" });
  });

  it("forgets everything before a reactivation: the fiche lived on its own since", () => {
    expect(
      ficheOrigin([
        entry("CLIENT_ARCHIVED", { name: "Snack Démo" }),
        entry("CLIENT_RESTORED", { name: "Snack Démo" }),
        entry("CLIENT_ARCHIVED", { name: "Snack Démo", source: "import", parentId: "chain", siteId: "s1" }),
      ])
    ).toEqual(UNKNOWN);
  });

  it("ignores what cannot be read", () => {
    expect(ficheOrigin([])).toEqual(UNKNOWN);
    expect(ficheOrigin([entry("CLIENT_ARCHIVED", "pas du JSON"), entry("CLIENT_ARCHIVED", null), entry("CLIENT_ARCHIVED", "[1]")])).toEqual(
      UNKNOWN
    );
    expect(ficheOrigin([entry("CLIENT_ARCHIVED", { source: "import" })])).toEqual(UNKNOWN);
    expect(ficheOrigin([entry("CLIENT_ARCHIVED", { source: "manual", parentId: "chain" })])).toEqual(UNKNOWN);
    // A site id that is not text is no site.
    expect(ficheOrigin([entry("CLIENT_ARCHIVED", { source: "import", parentId: "chain", siteId: 12 })])).toEqual({
      kind: "imported",
      parentId: "chain",
      siteId: null,
    });
  });
});

describe("ficheOrigins", () => {
  it("groups the journal by fiche, keeping the order read (latest first)", () => {
    const origins = ficheOrigins([
      entry("CLIENT_ATTACHED_AS_SITE", { parentId: "chain", siteId: "s2" }, "b2"),
      entry("CLIENT_ARCHIVED", { source: "import", parentId: "chain", siteId: "s1" }, "b1"),
      entry("CLIENT_RESTORED", {}, "b2"),
      { entityId: null, action: "CLIENT_ARCHIVED", metadata: JSON.stringify({ source: "import", parentId: "x" }) },
    ]);
    expect(origins.get("b1")).toEqual({ kind: "imported", parentId: "chain", siteId: "s1" });
    expect(origins.get("b2")).toEqual({ kind: "attached", parentId: "chain", siteId: "s2" });
    expect(origins.size).toBe(2);
  });
});

describe("firstParentId", () => {
  it("follows mergedIntoId first", () => {
    expect(firstParentId({ mergedIntoId: "a" }, { kind: "imported", parentId: "chain", siteId: null })).toBe("a");
    expect(firstParentId({ mergedIntoId: "a" }, UNKNOWN)).toBe("a");
  });

  it("falls back on the parent of the import of 07/10, archived before the column existed", () => {
    expect(firstParentId({ mergedIntoId: null }, { kind: "imported", parentId: "chain", siteId: "s1" })).toBe("chain");
  });

  it("leads nowhere from a plain archived client", () => {
    expect(firstParentId({ mergedIntoId: null }, UNKNOWN)).toBeNull();
    expect(firstParentId({ mergedIntoId: null }, undefined)).toBeNull();
    // Only the import wrote its parent without the column.
    expect(firstParentId({ mergedIntoId: null }, { kind: "attached", parentId: "chain", siteId: "s1" })).toBeNull();
  });
});

describe("liveParent / missingParents — from an archived fiche to the live client", () => {
  const clients = new Map<string, SearchClient>([
    ["a", client("a", "Chaîne Test")],
    ["old", client("old", "Chaîne Test ancienne", [], { archived: true, mergedIntoId: "a" })],
    ["older", client("older", "Chaîne Test très ancienne", [], { archived: true, mergedIntoId: "old" })],
    ["closed", client("closed", "Client fermé", [], { archived: true })],
    ["loop1", client("loop1", "Boucle 1", [], { archived: true, mergedIntoId: "loop2" })],
    ["loop2", client("loop2", "Boucle 2", [], { archived: true, mergedIntoId: "loop1" })],
    ["away", client("away", "Client lointain", [], { archived: true, mergedIntoId: "unloaded" })],
  ]);

  it("returns a live client as it is, and follows the links of an archived one", () => {
    expect(liveParent("a", clients)?.id).toBe("a");
    expect(liveParent("old", clients)?.id).toBe("a");
    expect(liveParent("older", clients)?.id).toBe("a");
  });

  it("stops on a dead end, a loop, a client not loaded or too many links", () => {
    expect(liveParent(null, clients)).toBeNull();
    expect(liveParent("closed", clients)).toBeNull();
    expect(liveParent("loop1", clients)).toBeNull();
    expect(liveParent("away", clients)).toBeNull();
    expect(liveParent("nowhere", clients)).toBeNull();
    expect(liveParent("older", clients, 1)).toBeNull();
    expect(liveParent("older", clients, 2)?.id).toBe("a");
  });

  it("names the next client to load on each chain, nothing once resolved", () => {
    expect(missingParents(["away", "nowhere", "older", null, "closed", "loop1"], clients)).toEqual(["unloaded", "nowhere"]);
    expect(missingParents(["a", "old"], clients)).toEqual([]);
  });
});

describe("ficheSite — the site made from an archived fiche", () => {
  const sites = [
    { id: "s1", name: "Snack Démo" },
    { id: "s2", name: "Cuisine centrale" },
  ];

  it("takes the site its journal names while it is active", () => {
    expect(ficheSite({ name: "Autre nom" }, { kind: "attached", parentId: "a", siteId: "s2" }, sites)).toEqual(sites[1]);
  });

  it("falls back on the active site of the same normalised name", () => {
    expect(ficheSite({ name: "SNACK  DEMO" }, UNKNOWN, sites)).toEqual(sites[0]);
    // The recorded site is gone or inactive: the name still tells.
    expect(ficheSite({ name: "Snack démo" }, { kind: "imported", parentId: "a", siteId: "gone" }, sites)).toEqual(sites[0]);
  });

  it("never guesses a site for a merged duplicate, nor when nothing matches", () => {
    expect(ficheSite({ name: "Snack Démo" }, { kind: "merged", parentId: "a", siteId: null }, sites)).toBeNull();
    expect(ficheSite({ name: "Boulangerie du Test" }, UNKNOWN, sites)).toBeNull();
    expect(ficheSite({ name: "—" }, UNKNOWN, [{ id: "s3", name: "" }])).toBeNull();
  });
});

describe("mergeTargets / mergedFicheSite — a fiche merged into a client that became a site since", () => {
  const sites = [
    { id: "s1", name: "Snack Démo" },
    { id: "s2", name: "Cuisine centrale" },
  ];
  const chain = { id: "chain", sites };
  const merged = (parentId: string | null): FicheOrigin => ({ kind: "merged", parentId, siteId: null });

  it("names the clients merged into that may have become a site, never a live one", () => {
    const origins = new Map<string, FicheOrigin>([
      ["b1", merged("a")],
      ["b2", merged("a")],
      ["b3", merged("live")],
      ["b4", merged("unloaded")],
      ["b5", merged(null)],
      ["b6", { kind: "attached", parentId: "chain", siteId: "s1" }],
    ]);
    const clients = new Map([
      ["a", { archived: true }],
      ["live", { archived: false }],
    ]);
    expect(mergeTargets(origins, clients)).toEqual(["a", "unloaded"]);
    expect(mergeTargets(new Map(), clients)).toEqual([]);
  });

  it("takes the site the client merged into became: attached, or archived by the import of the sites", () => {
    const attached = new Map<string, FicheOrigin>([["a", { kind: "attached", parentId: "chain", siteId: "s1" }]]);
    expect(mergedFicheSite(merged("a"), chain, attached, new Map())).toEqual(sites[0]);
    const imported = new Map<string, FicheOrigin>([["a", { kind: "imported", parentId: "chain", siteId: "s2" }]]);
    expect(mergedFicheSite(merged("a"), chain, imported, new Map())).toEqual(sites[1]);
  });

  it("follows further merges (A into A2, A2 attached), within the hops", () => {
    const origins = new Map<string, FicheOrigin>([
      ["a", merged("a2")],
      ["a2", { kind: "attached", parentId: "chain", siteId: "s1" }],
    ]);
    expect(mergedFicheSite(merged("a"), chain, origins, new Map())).toEqual(sites[0]);
    expect(mergedFicheSite(merged("a"), chain, origins, new Map(), 0)).toBeNull();
  });

  it("falls back on the site bearing the name of the client merged into, when it is loaded", () => {
    const origins = new Map<string, FicheOrigin>([["a", { kind: "attached", parentId: "chain", siteId: "gone" }]]);
    expect(mergedFicheSite(merged("a"), chain, origins, new Map([["a", { name: "SNACK DEMO" }]]))).toEqual(sites[0]);
    expect(mergedFicheSite(merged("a"), chain, origins, new Map())).toBeNull();
  });

  it("keeps the siège for a duplicate of the live client, an unread or plain journal, a loop", () => {
    // Merged into the live client itself.
    expect(mergedFicheSite(merged("chain"), chain, new Map(), new Map())).toBeNull();
    // Its target's journal was not read, or says nothing of where it went.
    expect(mergedFicheSite(merged("a"), chain, new Map(), new Map())).toBeNull();
    expect(mergedFicheSite(merged("a"), chain, new Map([["a", { kind: "unknown", parentId: null, siteId: null }]]), new Map())).toBeNull();
    // Merged into a client merged in turn into the live client.
    expect(mergedFicheSite(merged("a"), chain, new Map([["a", merged("chain")]]), new Map())).toBeNull();
    expect(mergedFicheSite(merged("a"), chain, new Map([["a", merged("b")], ["b", merged("a")]]), new Map())).toBeNull();
    // A site of another client is never preselected.
    expect(
      mergedFicheSite(merged("a"), chain, new Map([["a", { kind: "attached", parentId: "other", siteId: "s9" }]]), new Map())
    ).toBeNull();
    // Only a merged fiche reads its target's journal.
    expect(
      mergedFicheSite({ kind: "attached", parentId: "a", siteId: null }, chain, new Map([["a", { kind: "attached", parentId: "chain", siteId: "s1" }]]), new Map())
    ).toBeNull();
  });
});

describe("ficheLabel", () => {
  it("prints the site, the site and the fiche, or the fiche alone", () => {
    expect(ficheLabel("SNACK DEMO", { id: "s1", name: "Snack Démo" })).toBe("Snack Démo");
    expect(ficheLabel("Snack Démo", { id: "s2", name: "Cuisine centrale" })).toBe("Cuisine centrale (ancienne fiche « Snack Démo »)");
    expect(ficheLabel("Client Démo SARL", null)).toBe("ancienne fiche « Client Démo SARL »");
  });
});

describe("clientSearchRows — the answer of GET /api/clients?q=", () => {
  const chain = client("chain", "Chaîne Test", [
    ["s1", "Snack Démo"],
    ["s2", "Snack Démo Gare"],
    ["s3", "Cuisine centrale"],
  ]);
  const alpha = client("alpha", "Alpha Snack");
  const zulu = client("zulu", "Zulu Snack");
  const all = (...list: SearchClient[]) => new Map(list.map((c) => [c.id, c]));
  const site = (id: string, name: string, clientId: string): MatchedSite => ({ id, name, clientId });

  it("answers the name matches unchanged, in the database's order", () => {
    const rows = clientSearchRows({ direct: [zulu, alpha], sites: [], fiches: [], origins: new Map(), clients: all(zulu, alpha) });
    expect(rows).toEqual([zulu, alpha]);
    expect(rows[0]).toBe(zulu);
    expect("matchedSiteId" in rows[0]).toBe(false);
  });

  it("adds one row per matching site, at its client's name, sites by name", () => {
    const rows = clientSearchRows({
      direct: [alpha, zulu],
      sites: [site("s2", "Snack Démo Gare", "chain"), site("s1", "Snack Démo", "chain")],
      fiches: [],
      origins: new Map(),
      clients: all(alpha, zulu, chain),
    });
    expect(rows.map((row) => [row.id, row.matchedSiteId, row.matchedLabel])).toEqual([
      ["alpha", undefined, undefined],
      ["chain", "s1", "Snack Démo"],
      ["chain", "s2", "Snack Démo Gare"],
      ["zulu", undefined, undefined],
    ]);
    // The row carries the whole client: its sites for the form's list.
    expect(rows[1].sites).toEqual(chain.sites);
  });

  it("puts the client's own row before its sites", () => {
    const rows = clientSearchRows({
      direct: [chain],
      sites: [site("s3", "Cuisine centrale", "chain")],
      fiches: [],
      origins: new Map(),
      clients: all(chain),
    });
    expect(rows.map((row) => row.matchedSiteId ?? "siège")).toEqual(["siège", "s3"]);
  });

  it("leads an archived fiche to its live client and the site made from it", () => {
    const fiche: ArchivedFiche = { id: "b", name: "Snack Démo", mergedIntoId: null };
    const rows = clientSearchRows({
      direct: [],
      sites: [],
      fiches: [fiche],
      origins: new Map([["b", { kind: "imported", parentId: "chain", siteId: "s1" } as FicheOrigin]]),
      clients: all(chain),
    });
    expect(rows).toEqual([{ ...chain, matchedSiteId: "s1", matchedLabel: "Snack Démo" }]);
  });

  it("keeps one row per thing to pick: a name match, then a site, then a fiche", () => {
    const rows = clientSearchRows({
      direct: [chain],
      sites: [site("s1", "Snack Démo", "chain")],
      fiches: [
        // Same site as the site row: dropped.
        { id: "b1", name: "SNACK DEMO", mergedIntoId: "chain" },
        // A merged duplicate of the client: its siège, already the client's own row.
        { id: "b2", name: "Chaîne Test SARL", mergedIntoId: "chain" },
      ],
      origins: new Map([["b2", { kind: "merged", parentId: "chain", siteId: null } as FicheOrigin]]),
      clients: all(chain),
    });
    expect(rows.map((row) => [row.matchedSiteId ?? null, row.matchedLabel ?? null])).toEqual([
      [null, null],
      ["s1", "Snack Démo"],
    ]);
  });

  it("offers the siège through a fiche when the client's own name does not match", () => {
    const rows = clientSearchRows({
      direct: [],
      sites: [],
      fiches: [{ id: "b", name: "Client Démo SARL", mergedIntoId: "chain" }],
      origins: new Map([["b", { kind: "merged", parentId: "chain", siteId: null } as FicheOrigin]]),
      clients: all(chain),
    });
    expect(rows).toEqual([{ ...chain, matchedSiteId: null, matchedLabel: "ancienne fiche « Client Démo SARL »" }]);
  });

  it("leads a fiche merged into a client attached as a site since to that site", () => {
    // B merged into A, then A attached as site s1 of the chain: B now leads to the chain.
    const rows = clientSearchRows({
      direct: [],
      sites: [],
      fiches: [{ id: "b", name: "Snack Démo SARL", mergedIntoId: "chain" }],
      origins: new Map<string, FicheOrigin>([
        ["b", { kind: "merged", parentId: "a", siteId: null }],
        ["a", { kind: "attached", parentId: "chain", siteId: "s1" }],
      ]),
      clients: all(chain),
      query: "Snack Démo SARL",
    });
    expect(rows.map((row) => [row.id, row.matchedSiteId, row.matchedLabel])).toEqual([
      ["chain", "s1", "Snack Démo (ancienne fiche « Snack Démo SARL »)"],
    ]);
  });

  it("leads a fiche merged into a client archived by the import of the sites to its site", () => {
    // The import left B on A, archived and leading to the chain.
    const a = client("a", "Snack Démo", [], { archived: true, mergedIntoId: "chain" });
    const rows = clientSearchRows({
      direct: [],
      sites: [],
      fiches: [{ id: "b", name: "Snack Démo SARL", mergedIntoId: "a" }],
      origins: new Map<string, FicheOrigin>([
        ["b", { kind: "merged", parentId: "a", siteId: null }],
        ["a", { kind: "imported", parentId: "chain", siteId: "s1" }],
      ]),
      clients: all(chain, a),
    });
    expect(rows.map((row) => [row.id, row.matchedSiteId])).toEqual([["chain", "s1"]]);
    // Without A's journal, the siège as before.
    const blind = clientSearchRows({
      direct: [],
      sites: [],
      fiches: [{ id: "b", name: "Snack Démo SARL", mergedIntoId: "a" }],
      origins: new Map<string, FicheOrigin>([["b", { kind: "merged", parentId: "a", siteId: null }]]),
      clients: all(chain, a),
    });
    expect(blind.map((row) => [row.id, row.matchedSiteId])).toEqual([["chain", null]]);
  });

  it("keeps a site typed in full when its client has more matches than the cap", () => {
    // The exact name sorts last alphabetically, after five looser matches.
    const names = ["Atelier Démo", "Bistro Démo", "Café Démo", "Cantine Démo", "Comptoir Démo", "Démo"];
    const own = names.map((name, i) => [`d${i}`, name] as [string, string]);
    const big = client("big", "Chaîne Test", own);
    const rows = clientSearchRows({
      direct: [],
      sites: own.map(([id, name]) => site(id, name, "big")),
      fiches: [],
      origins: new Map(),
      clients: all(big),
      query: "Démo",
    });
    expect(rows).toHaveLength(MATCHED_ROWS_PER_CLIENT);
    expect(rows.map((row) => row.matchedLabel)).toEqual(["Démo", "Atelier Démo", "Bistro Démo", "Café Démo", "Cantine Démo"]);
  });

  it("keeps a fiche typed in full on the siège, though the siège sorts after the sites", () => {
    const names = ["Atelier Démo", "Bistro Démo", "Café Démo", "Cantine Démo", "Comptoir Démo"];
    const own = names.map((name, i) => [`d${i}`, name] as [string, string]);
    const big = client("big", "Chaîne Test", own);
    const rows = clientSearchRows({
      direct: [],
      sites: own.map(([id, name]) => site(id, name, "big")),
      fiches: [{ id: "b", name: "Démo", mergedIntoId: "big" }],
      origins: new Map<string, FicheOrigin>([["b", { kind: "merged", parentId: "big", siteId: null }]]),
      clients: all(big),
      query: "Démo",
    });
    expect(rows).toHaveLength(MATCHED_ROWS_PER_CLIENT);
    expect(rows[0]).toMatchObject({ id: "big", matchedSiteId: null, matchedLabel: "ancienne fiche « Démo »" });
    expect(rows.map((row) => row.matchedLabel)).not.toContain("Comptoir Démo");
  });

  it("follows the links to the live client, and never answers an archived one", () => {
    const old = client("old", "Chaîne Test ancienne", [["s9", "Snack Démo"]], { archived: true, mergedIntoId: "chain" });
    const closed = client("closed", "Client fermé", [["s8", "Snack Démo"]], { archived: true });
    const rows = clientSearchRows({
      direct: [],
      // A site of an archived client is not offered.
      sites: [site("s8", "Snack Démo", "closed")],
      fiches: [
        { id: "b1", name: "Snack Démo", mergedIntoId: "old" },
        // Leads to an archived client that leads nowhere.
        { id: "b2", name: "Snack Démo bis", mergedIntoId: "closed" },
        // A plain archived client.
        { id: "b3", name: "Snack Démo ter", mergedIntoId: null },
      ],
      origins: new Map(),
      clients: all(chain, old, closed),
    });
    expect(rows.map((row) => [row.id, row.matchedSiteId])).toEqual([["chain", "s1"]]);
  });

  it("answers an archived client's site when the caller asked for archived clients", () => {
    const closed = client("closed", "Client fermé", [["s8", "Snack Démo"]], { archived: true });
    const rows = clientSearchRows({
      direct: [],
      sites: [site("s8", "Snack Démo", "closed")],
      fiches: [],
      origins: new Map(),
      clients: all(closed),
      includeArchived: true,
    });
    expect(rows.map((row) => row.matchedSiteId)).toEqual(["s8"]);
  });

  it("skips a site its client no longer lists (deactivated meanwhile) and a client not loaded", () => {
    const rows = clientSearchRows({
      direct: [],
      sites: [site("s7", "Snack Démo fermé", "chain"), site("s1", "Snack Démo", "unknown")],
      fiches: [],
      origins: new Map(),
      clients: all(chain),
    });
    expect(rows).toEqual([]);
  });

  it("caps the rows found through sites per client, and the whole answer", () => {
    const sites = Array.from({ length: 12 }, (_, i) => [`s${i}`, `Snack ${String(i).padStart(2, "0")}`] as [string, string]);
    const big = client("big", "Chaîne Test", sites);
    const rows = clientSearchRows({
      direct: [],
      sites: sites.map(([id, name]) => site(id, name, "big")),
      fiches: [],
      origins: new Map(),
      clients: all(big),
    });
    expect(rows.map((row) => row.matchedLabel)).toEqual(sites.slice(0, MATCHED_ROWS_PER_CLIENT).map(([, name]) => name));

    const many = Array.from({ length: 30 }, (_, i) => client(`c${i}`, `Client ${String(i).padStart(2, "0")}`));
    expect(clientSearchRows({ direct: many, sites: [], fiches: [], origins: new Map(), clients: all(...many) })).toHaveLength(
      CLIENT_SEARCH_LIMIT
    );
    expect(clientSearchRows({ direct: many, sites: [], fiches: [], origins: new Map(), clients: all(...many), limit: 3 })).toEqual(
      many.slice(0, 3)
    );
  });
});

describe("matchRank / query — the closest matches first (14/10)", () => {
  it("ranks the whole name, then a name that starts with the text, then one that contains it", () => {
    expect(matchRank("Snack Démo", "snack demo")).toBe(0);
    expect(matchRank("Snack Démo Gare", "Snack Démo")).toBe(1);
    expect(matchRank("Le Snack Démo", "snack démo")).toBe(2);
    expect(matchRank("Alpha", "snack")).toBe(3);
    expect(matchRank("Alpha", "")).toBe(3);
    expect(matchRank("Alpha", null)).toBe(3);
  });

  it("never lets twenty clients sharing a first word push out the restaurant typed", () => {
    const many = Array.from({ length: 25 }, (_, i) => client(`c${i}`, `Restaurant Client ${String(i).padStart(2, "0")}`));
    const chain = client("chain", "Chaîne Test", [["s9", "Restaurant Le Phare"]]);
    const rows = clientSearchRows({
      direct: many.slice(0, 20),
      sites: [{ id: "s9", name: "Restaurant Le Phare", clientId: "chain" }],
      fiches: [],
      origins: new Map(),
      clients: new Map([...many, chain].map((c) => [c.id, c])),
      query: "Restaurant Le",
    });
    expect(rows).toHaveLength(CLIENT_SEARCH_LIMIT);
    expect(rows[0]).toMatchObject({ id: "chain", matchedSiteId: "s9" });
  });

  it("puts an archived fiche typed in full before partial name matches, on its live client", () => {
    const parent = client("p", "Chaîne Test", [["s1", "Snack Démo"]]);
    const partial = client("x", "Snack Démo Express");
    const rows = clientSearchRows({
      direct: [partial],
      sites: [],
      fiches: [{ id: "old", name: "Snack Démo", mergedIntoId: "p" }],
      origins: new Map([["old", { kind: "attached", parentId: "p", siteId: "s1" }]]),
      clients: new Map([parent, partial].map((c) => [c.id, c])),
      query: "Snack Démo",
    });
    expect(rows.map((row) => row.id)).toEqual(["p", "x"]);
    expect(rows[0]).toMatchObject({ matchedSiteId: "s1" });
  });

  it("keeps the name order when no text is given", () => {
    const a = client("a", "Alpha");
    const z = client("z", "Zulu");
    expect(clientSearchRows({ direct: [a, z], sites: [], fiches: [], origins: new Map(), clients: new Map([[a.id, a], [z.id, z]]) }).map((r) => r.id)).toEqual(["a", "z"]);
  });
});

describe("directMatches — the name matches of the route's two reads", () => {
  it("keeps each client once — the first read's — by name, then by id", () => {
    const exact = client("e", "Démo");
    const same = client("d", "DEMO");
    const agency = client("g", "Agence Démo");
    const rows = directMatches([exact, same], [agency, { ...exact, name: "Démo" }]);
    expect(rows.map((row) => row.id)).toEqual(["g", "d", "e"]);
    expect(rows[2]).toBe(exact);
    expect(directMatches<SearchClient>([], [])).toEqual([]);
  });

  it("never lets twenty names that merely contain the text cut the one typed in full", () => {
    // The « contains » read stops at twenty names, all sorting before « Démo ».
    const contained = Array.from({ length: CLIENT_SEARCH_LIMIT }, (_, i) =>
      client(`c${i}`, `Agence Démo ${String(i).padStart(2, "0")}`)
    );
    const exact = client("exact", "Démo");
    const prefix = client("prefix", "Démo Services");
    const direct = directMatches([exact, prefix], contained);
    expect(direct).toHaveLength(CLIENT_SEARCH_LIMIT + 2);
    const rows = clientSearchRows({
      direct,
      sites: [],
      fiches: [],
      origins: new Map(),
      clients: new Map(direct.map((c) => [c.id, c])),
      query: "Démo",
    });
    expect(rows).toHaveLength(CLIENT_SEARCH_LIMIT);
    expect(rows.slice(0, 3).map((row) => row.id)).toEqual(["exact", "prefix", "c0"]);
  });
});

describe("pickerRows — what ClientPicker lists", () => {
  const sites = [
    { id: "s1", name: "Snack Démo" },
    { id: "s2", name: "Cuisine centrale" },
  ];
  const answer = [
    { id: "chain", name: "Chaîne Test", ice: "001234567000089", sites, billedFor: null, mergedInto: null },
    { id: "chain", name: "Chaîne Test", ice: "001234567000089", sites, matchedSiteId: "s1", matchedLabel: "Snack Démo" },
    { id: "other", name: "Autre Chaîne", ice: null, sites: [], matchedSiteId: null, matchedLabel: "ancienne fiche « Snack Démo »" },
    { id: "chain", name: "Chaîne Test", ice: null, sites, matchedSiteId: "s2", matchedLabel: "Cuisine centrale" },
  ];

  it("lists one row per client and site for the sampling forms", () => {
    const rows = pickerRows(answer, { excluded: new Set(), siteRows: true, max: 8 });
    expect(rows.map((row) => [row.id, row.siteId, row.label])).toEqual([
      ["chain", null, null],
      ["chain", "s1", "Snack Démo"],
      ["other", null, "ancienne fiche « Snack Démo »"],
      ["chain", "s2", "Cuisine centrale"],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(rows[1]).toMatchObject({ name: "Chaîne Test", ice: "001234567000089", sites });
  });

  it("lists one row per client, with no site, for the other screens", () => {
    const rows = pickerRows(answer, { excluded: new Set(), siteRows: false, max: 8 });
    expect(rows.map((row) => [row.id, row.siteId, row.label])).toEqual([
      ["chain", null, null],
      ["other", null, "ancienne fiche « Snack Démo »"],
    ]);
  });

  it("prints no label on a client-only screen when the client's own name matches anywhere in the answer", () => {
    // « gare »: the site « Gare » (whole name) ranks before its client's own row (contains).
    const group = client("group", "Groupe Gare Test", [["g1", "Gare"]]);
    const other = client("other", "Chaîne Test", [["o1", "Gare Routière Test"]]);
    const answer = clientSearchRows({
      direct: [group],
      sites: [
        { id: "g1", name: "Gare", clientId: "group" },
        { id: "o1", name: "Gare Routière Test", clientId: "other" },
      ],
      fiches: [],
      origins: new Map(),
      clients: new Map([group, other].map((c) => [c.id, c])),
      query: "gare",
    });
    expect(answer.map((row) => [row.id, row.matchedSiteId ?? null])).toEqual([
      ["group", "g1"],
      ["other", "o1"],
      ["group", null],
    ]);
    const plain = JSON.parse(JSON.stringify(answer)) as unknown;
    expect(pickerRows(plain, { excluded: new Set(), siteRows: false, max: 8 }).map((row) => [row.id, row.siteId, row.label])).toEqual([
      ["group", null, null],
      // Found only through its site: the label says why it is listed.
      ["other", null, "Gare Routière Test"],
    ]);
    // The sampling forms keep the site row, its label, and the client's own row.
    expect(pickerRows(plain, { excluded: new Set(), siteRows: true, max: 8 }).map((row) => [row.id, row.siteId, row.label])).toEqual([
      ["group", "g1", "Gare"],
      ["other", "o1", "Gare Routière Test"],
      ["group", null, null],
    ]);
  });

  it("removes the excluded clients and stops at the maximum", () => {
    expect(pickerRows(answer, { excluded: new Set(["chain"]), siteRows: true, max: 8 }).map((row) => row.id)).toEqual(["other"]);
    expect(pickerRows(answer, { excluded: new Set(), siteRows: true, max: 2 })).toHaveLength(2);
  });

  it("never preselects a site the client does not list", () => {
    const rows = pickerRows([{ id: "chain", name: "Chaîne Test", sites, matchedSiteId: "elsewhere", matchedLabel: "Ailleurs" }], {
      excluded: new Set(),
      siteRows: true,
      max: 8,
    });
    expect(rows[0].siteId).toBeNull();
  });

  it("reads an older or broken answer safely", () => {
    expect(pickerRows({ error: "Accès refusé" }, { excluded: new Set(), siteRows: true, max: 8 })).toEqual([]);
    expect(
      pickerRows([null, { id: 3 }, { id: "a", name: "Client Démo", sites: [{ id: "s" }, null] }], {
        excluded: new Set(),
        siteRows: true,
        max: 8,
      })
    ).toEqual([{ key: "a|", id: "a", name: "Client Démo", ice: null, sites: [], siteId: null, label: null }]);
  });
});
