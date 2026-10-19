import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_NEW_PLACES,
  NAMESAKE_HINT,
  clientCreationInput,
  creationOrigin,
  exactNameDecision,
  exactNameRefusal,
  isCounterCreator,
  nearDuplicateMessage,
  quickClientBody,
  validateNewPlaces,
  validateNewSites,
  withPlace,
  type QuickClientForm,
} from "./quick-client";
import { ficheOrigins, type JournalEntry } from "./client-search";
import { SIEGE_SITE_REFUSAL, siegeSiteRefusal } from "./site-input";
import { ROLES } from "./roles";

/**
 * Creating a client at the counter and in the field (RETOUR-LABO-16-10.md
 * E1–E3, Q116 / Q117). Invented names only.
 */

const ok = <T,>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
};
const refusal = (result: { ok: true } | { ok: false; error: string }) => (result.ok ? null : result.error);

describe("clientCreationInput — the name, and only the name, is required", () => {
  it("refuses a missing or blank name, whoever creates — in the dialog's words for the counter roles (« Nom du client »)", () => {
    for (const role of ["RECEPTIONNISTE", "PRELEVEUR"] as const) {
      expect(refusal(clientCreationInput({}, role)), role).toBe("Le nom du client est obligatoire.");
      expect(refusal(clientCreationInput({ name: "   " }, role)), role).toBe("Le nom du client est obligatoire.");
    }
    for (const role of ["GESTIONNAIRE", "ADMIN"] as const) {
      expect(refusal(clientCreationInput({}, role)), role).toBe("La raison sociale est obligatoire.");
      expect(refusal(clientCreationInput({ name: "   " }, role)), role).toBe("La raison sociale est obligatoire.");
    }
    expect(refusal(clientCreationInput(null, "RECEPTIONNISTE"))).toBe("Le nom du client est obligatoire.");
  });

  it("creates with the name alone, everything else optional", () => {
    const value = ok(clientCreationInput({ name: "  TEST UI Particulier  " }, "PRELEVEUR"));
    expect(value.client).toEqual({ name: "TEST UI Particulier", contact: null, email: null, phone: null, address: null, ice: null });
    expect(value.sites).toEqual([]);
    expect(value.places).toEqual([]);
    expect(value.emails).toEqual([]);
    expect(value.confirmDuplicate).toBe(false);
  });

  it("keeps the address, contact, phone and ICE typed at the counter", () => {
    const value = ok(
      clientCreationInput(
        { name: "TEST UI Snack", address: "12 rue Test", contact: "Personne Test", phone: "0600000000", ice: "001 234 567 000 089" },
        "RECEPTIONNISTE"
      )
    );
    expect(value.client).toMatchObject({ address: "12 rue Test", contact: "Personne Test", phone: "0600000000", ice: "001234567000089" });
  });

  it("still checks the ICE and the lengths", () => {
    expect(refusal(clientCreationInput({ name: "TEST UI", ice: "123" }, "RECEPTIONNISTE"))).toBe("L'ICE doit comporter 15 chiffres.");
    expect(refusal(clientCreationInput({ name: "x".repeat(192) }, "PRELEVEUR"))).toBe("Le nom du client est trop long (191 caractères maximum).");
    expect(refusal(clientCreationInput({ name: "x".repeat(192) }, "GESTIONNAIRE"))).toBe("La raison sociale est trop longue.");
  });
});

describe("clientCreationInput — the counter roles type no report recipient", () => {
  const body = {
    name: "TEST UI Restaurant",
    email: "direction@example.com",
    emails: [{ email: "rapports@example.com", forReports: true }],
  };

  it("drops both the record's address and the list for the reception and the préleveur", () => {
    for (const role of ["RECEPTIONNISTE", "PRELEVEUR"] as const) {
      const value = ok(clientCreationInput(body, role));
      expect(value.client.email, role).toBeNull();
      expect(value.emails, role).toEqual([]);
      expect(value.recipientsIgnored, role).toBe(true);
    }
  });

  it("drops them without refusing, even when malformed", () => {
    const value = ok(clientCreationInput({ name: "TEST UI", email: "pas une adresse", emails: [{ email: "x" }] }, "RECEPTIONNISTE"));
    expect(value.client.email).toBeNull();
    expect(value.emails).toEqual([]);
  });

  it("says nothing was ignored when nothing was sent", () => {
    expect(ok(clientCreationInput({ name: "TEST UI", email: "  ", emails: [{ email: "" }] }, "PRELEVEUR")).recipientsIgnored).toBe(false);
  });

  it("keeps them for the gestionnaire and the admin, checked as before", () => {
    for (const role of ["GESTIONNAIRE", "ADMIN"] as const) {
      const value = ok(clientCreationInput(body, role));
      expect(value.client.email, role).toBe("direction@example.com");
      expect(value.emails, role).toEqual([{ email: "rapports@example.com", label: null, forReports: true, forAlerts: true }]);
      expect(value.recipientsIgnored, role).toBe(false);
    }
    expect(refusal(clientCreationInput({ name: "TEST UI", email: "pas une adresse" }, "GESTIONNAIRE"))).toBe(
      "L'adresse email n'est pas valide."
    );
  });
});

describe("clientCreationInput — « À compléter », origin, confirmation", () => {
  it("flags the clients of the counter roles, never those of the client base's keepers", () => {
    for (const role of ROLES) {
      if (!["RECEPTIONNISTE", "PRELEVEUR", "GESTIONNAIRE", "ADMIN"].includes(role)) continue;
      expect(ok(clientCreationInput({ name: "TEST UI" }, role)).toComplete, role).toBe(isCounterCreator(role));
    }
    expect(isCounterCreator("RECEPTIONNISTE")).toBe(true);
    expect(isCounterCreator("PRELEVEUR")).toBe(true);
    expect(isCounterCreator("GESTIONNAIRE")).toBe(false);
    expect(isCounterCreator("ADMIN")).toBe(false);
  });

  it("lets the counter roles confirm « Ce n'est pas le même client » (journalled, still « À compléter »)", () => {
    const value = ok(clientCreationInput({ name: "TEST UI", confirmDuplicate: true }, "RECEPTIONNISTE"));
    expect(value.confirmDuplicate).toBe(true);
    expect(value.toComplete).toBe(true);
    expect(ok(clientCreationInput({ name: "TEST UI", confirmDuplicate: "true" }, "RECEPTIONNISTE")).confirmDuplicate).toBe(false);
  });

  it("takes the origin the dialog declares, else the role's", () => {
    expect(creationOrigin("VISITE", "ADMIN")).toBe("VISITE");
    expect(creationOrigin("DEPOT", "PRELEVEUR")).toBe("DEPOT");
    expect(creationOrigin(undefined, "RECEPTIONNISTE")).toBe("DEPOT");
    expect(creationOrigin("autre", "PRELEVEUR")).toBe("VISITE");
    expect(creationOrigin(undefined, "GESTIONNAIRE")).toBeNull();
    expect(ok(clientCreationInput({ name: "TEST UI", origin: "DEPOT" }, "ADMIN")).origin).toBe("DEPOT");
  });
});

describe("validateNewPlaces — the usual sampling places", () => {
  it("trims, skips the empty ones and removes duplicates (case, accents, punctuation)", () => {
    const value = ok(validateNewPlaces(["  Chambre froide 1 ", "", "   ", "chambre FROIDE-1", "Cuisine", "cuisiné", "!!!"]));
    expect(value).toEqual([
      { label: "Chambre froide 1", normalizedLabel: "chambre froide 1" },
      { label: "Cuisine", normalizedLabel: "cuisine" },
    ]);
  });

  it("collapses inner spaces", () => {
    expect(ok(validateNewPlaces(["Poste    salades"]))[0].label).toBe("Poste salades");
  });

  it("accepts nothing at all", () => {
    expect(ok(validateNewPlaces(undefined))).toEqual([]);
    expect(ok(validateNewPlaces(null))).toEqual([]);
    expect(ok(validateNewPlaces([]))).toEqual([]);
  });

  it("caps the list at 20 distinct places (duplicates do not count)", () => {
    const twenty = Array.from({ length: MAX_NEW_PLACES }, (_, i) => `Lieu ${i + 1}`);
    expect(ok(validateNewPlaces([...twenty, "lieu 1", "LIEU 2"]))).toHaveLength(MAX_NEW_PLACES);
    expect(refusal(validateNewPlaces([...twenty, "Lieu 21"]))).toMatch(/^20 lieux de prélèvement au plus/);
  });

  it("refuses a place longer than 191 characters, and anything that is not a list of texts", () => {
    expect(refusal(validateNewPlaces(["a".repeat(192)]))).toMatch(/trop long \(191 caractères maximum\)/);
    expect(ok(validateNewPlaces(["a".repeat(191)]))).toHaveLength(1);
    expect(refusal(validateNewPlaces("Cuisine"))).toBe("La liste des lieux de prélèvement est invalide.");
    expect(refusal(validateNewPlaces([42]))).toBe("La liste des lieux de prélèvement est invalide.");
  });

  it("is applied by clientCreationInput", () => {
    expect(ok(clientCreationInput({ name: "TEST UI", places: ["Cuisine", "CUISINE"] }, "PRELEVEUR")).places).toHaveLength(1);
    expect(refusal(clientCreationInput({ name: "TEST UI", places: "Cuisine" }, "PRELEVEUR"))).toBe(
      "La liste des lieux de prélèvement est invalide."
    );
  });
});

describe("validateNewSites — the sites created with the client", () => {
  it("checks each site (validateSite): the name is required, the other fields optional", () => {
    expect(refusal(validateNewSites([{ name: "" }], "RECEPTIONNISTE"))).toBe("Le nom du site est obligatoire.");
    expect(refusal(validateNewSites([{ name: "Cuisine", city: "c".repeat(192) }], "RECEPTIONNISTE"))).toMatch(/La ville/);
    expect(ok(validateNewSites([{ name: " Cuisine centrale ", city: "Agadir" }], "RECEPTIONNISTE"))).toEqual([
      { name: "Cuisine centrale", code: null, address: null, city: "Agadir", phone: null, contact: null, active: true },
    ]);
  });

  it("refuses two sites of the same name (case, accents and punctuation aside)", () => {
    expect(refusal(validateNewSites([{ name: "Cuisine Centrale" }, { name: "cuisine-centrale" }], "GESTIONNAIRE"))).toBe(
      "Deux sites portent le nom « cuisine-centrale »."
    );
  });

  it("refuses a site named « Siège »: the siège is no site", () => {
    expect(refusal(validateNewSites([{ name: "Siège" }], "PRELEVEUR"))).toBe(SIEGE_SITE_REFUSAL);
    expect(refusal(validateNewSites([{ name: "SIEGE" }], "GESTIONNAIRE"))).toBe(SIEGE_SITE_REFUSAL);
  });

  it("the same rule refuses « Siège » on a site created on its own (E2's « + Nouveau site… »)", () => {
    for (const name of ["Siège", "siege", " SIÈGE. ", "Siege"]) expect(siegeSiteRefusal(name), name).toBe(SIEGE_SITE_REFUSAL);
    for (const name of ["Siège social Agadir", "Cuisine du siège", "Sièges"]) expect(siegeSiteRefusal(name), name).toBeNull();
    const route = readFileSync(fileURLToPath(new URL("../app/api/clients/[id]/sites/route.ts", import.meta.url)), "utf8");
    const post = route.slice(route.indexOf("export async function POST"));
    expect(post).toMatch(/const siege = siegeSiteRefusal\(checked\.value\.name\);\s*if \(siege\) return NextResponse\.json\(\{ error: siege \}, \{ status: 400 \}\);/);
    expect(post.indexOf("siegeSiteRefusal(")).toBeLessThan(post.indexOf("prisma.site.create"));
  });

  it("creates the counter roles' sites active, whatever they ask; the keepers may record one inactive", () => {
    expect(ok(validateNewSites([{ name: "Cuisine", active: false }], "PRELEVEUR"))[0].active).toBe(true);
    expect(ok(validateNewSites([{ name: "Cuisine", active: false }], "RECEPTIONNISTE"))[0].active).toBe(true);
    expect(ok(validateNewSites([{ name: "Cuisine", active: false }], "GESTIONNAIRE"))[0].active).toBe(false);
  });

  it("accepts no site (the siège), refuses what is not a list, caps the list", () => {
    expect(ok(validateNewSites(undefined, "PRELEVEUR"))).toEqual([]);
    expect(refusal(validateNewSites({ name: "Cuisine" }, "PRELEVEUR"))).toBe("La liste des sites est invalide.");
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `Site ${i}` }));
    expect(refusal(validateNewSites(many, "GESTIONNAIRE"))).toBe("20 sites au plus à la création.");
  });

  it("is applied by clientCreationInput", () => {
    expect(refusal(clientCreationInput({ name: "TEST UI", sites: [{ name: "A" }, { name: "a" }] }, "PRELEVEUR"))).toBe(
      "Deux sites portent le nom « a »."
    );
    expect(ok(clientCreationInput({ name: "TEST UI", sites: [{ name: "Cuisine" }] }, "PRELEVEUR")).sites).toHaveLength(1);
  });
});

describe("the « Nouveau client » dialog", () => {
  it("withPlace adds a place, refusing the empty, the too long, the duplicate and the 21st", () => {
    expect(withPlace([], "  Cuisine ")).toEqual({ places: ["Cuisine"], refusal: null });
    expect(withPlace(["Cuisine"], "  ").refusal).toBe("Indiquez le lieu de prélèvement.");
    expect(withPlace(["Cuisine"], "CUISINÉ")).toEqual({ places: ["Cuisine"], refusal: "« Cuisine » est déjà dans la liste." });
    expect(withPlace([], "a".repeat(192)).refusal).toMatch(/trop long/);
    const twenty = Array.from({ length: MAX_NEW_PLACES }, (_, i) => `Lieu ${i + 1}`);
    expect(withPlace(twenty, "Lieu 21").refusal).toMatch(/^20 lieux au plus/);
  });

  it("withPlace never changes the list it is given", () => {
    const places = ["Cuisine"];
    withPlace(places, "Chambre froide");
    expect(places).toEqual(["Cuisine"]);
  });

  const form: QuickClientForm = {
    name: " TEST UI Particulier ",
    address: " 1 rue Test ",
    site: "",
    places: ["Cuisine"],
    placeDraft: " Chambre froide ",
    contact: "",
    phone: " 0600000000 ",
    ice: "",
  };

  it("quickClientBody sends no e-mail field, the place still typed, and no site for the siège", () => {
    const body = quickClientBody(form, "VISITE", false);
    expect(body).toEqual({
      name: "TEST UI Particulier",
      address: "1 rue Test",
      contact: "",
      phone: "0600000000",
      ice: "",
      sites: [],
      places: ["Cuisine", "Chambre froide"],
      origin: "VISITE",
    });
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("emails");
  });

  it("quickClientBody names the site when one is typed, and the confirmation when given", () => {
    const body = quickClientBody({ ...form, site: " Cuisine centrale ", placeDraft: "" }, "DEPOT", true);
    expect(body.sites).toEqual([{ name: "Cuisine centrale" }]);
    expect(body.places).toEqual(["Cuisine"]);
    expect(body.confirmDuplicate).toBe(true);
    // What the dialog sends, the server accepts for a counter role.
    expect(clientCreationInput(body, "RECEPTIONNISTE").ok).toBe(true);
  });
});

// ---- N1 ----------------------------------------------------------------------------------------

type C = { id: string; name: string; ice: string | null; archived: boolean; mergedIntoId: string | null; sites: { id: string; name: string }[] };
const client = (id: string, name: string, extra: Partial<C> = {}): C => ({
  id,
  name,
  ice: null,
  archived: false,
  mergedIntoId: null,
  sites: [],
  ...extra,
});
const entry = (entityId: string, action: string, metadata: Record<string, unknown>): JournalEntry => ({
  entityId,
  action,
  metadata: JSON.stringify(metadata),
});
const mapOf = (...clients: C[]) => new Map(clients.map((row) => [row.id, row]));

describe("exactNameDecision — N1, the exact name of a client that exists", () => {
  const chain = client("chain", "TEST UI Chaîne", { sites: [{ id: "s-snack", name: "Snack Test" }, { id: "s-cuisine", name: "Cuisine" }] });

  it("a live client of that name: use it", () => {
    const live = client("live", "TEST UI Snack");
    const decision = exactNameDecision([live], new Map(), mapOf(live));
    expect(decision).toEqual({ kind: "active", client: live });
  });

  it("prefers the live client over an archived fiche of the same name", () => {
    const live = client("live", "TEST UI Snack");
    const fiche = client("old", "TEST UI SNACK", { archived: true, mergedIntoId: "chain" });
    expect(exactNameDecision([fiche, live], new Map(), mapOf(live, fiche, chain))?.kind).toBe("active");
  });

  it("an archived fiche attached as a site: its client and the site the journal names", () => {
    const fiche = client("old", "Snack Test", { archived: true, mergedIntoId: "chain" });
    const origins = ficheOrigins([entry("old", "CLIENT_ATTACHED_AS_SITE", { parentId: "chain", siteId: "s-snack" })]);
    expect(exactNameDecision([fiche], origins, mapOf(fiche, chain))).toEqual({
      kind: "moved",
      parent: chain,
      siteId: "s-snack",
      via: "site",
    });
  });

  it("a fiche archived by the import of 07/10 (no mergedIntoId): the parent its journal names, the site of its name", () => {
    const fiche = client("old", "Snack-Test", { archived: true });
    const origins = ficheOrigins([entry("old", "CLIENT_ARCHIVED", { source: "import", parentId: "chain" })]);
    const decision = exactNameDecision([fiche], origins, mapOf(fiche, chain));
    expect(decision).toMatchObject({ kind: "moved", parent: { id: "chain" }, siteId: "s-snack", via: "site" });
  });

  it("a duplicate merged in: its client, no site", () => {
    const fiche = client("old", "TEST UI Chaine", { archived: true, mergedIntoId: "chain" });
    const origins = ficheOrigins([entry("old", "CLIENT_MERGED", { kept: false, intoId: "chain" })]);
    expect(exactNameDecision([fiche], origins, mapOf(fiche, chain))).toEqual({ kind: "moved", parent: chain, siteId: null, via: "merge" });
  });

  it("follows the links to the live client (B merged into A, A merged into C)", () => {
    const a = client("a", "TEST UI A", { archived: true, mergedIntoId: "chain" });
    const fiche = client("b", "TEST UI B", { archived: true, mergedIntoId: "a" });
    const origins = ficheOrigins([entry("b", "CLIENT_MERGED", { kept: false, intoId: "a" }), entry("a", "CLIENT_MERGED", { kept: false, intoId: "chain" })]);
    expect(exactNameDecision([fiche], origins, mapOf(fiche, a, chain))).toMatchObject({ kind: "moved", parent: { id: "chain" } });
  });

  it("attached, but its site is no longer active: the client alone", () => {
    const fiche = client("old", "Kiosque Test", { archived: true, mergedIntoId: "chain" });
    const origins = ficheOrigins([entry("old", "CLIENT_ATTACHED_AS_SITE", { parentId: "chain", siteId: "s-gone" })]);
    expect(exactNameDecision([fiche], origins, mapOf(fiche, chain))).toEqual({ kind: "moved", parent: chain, siteId: null, via: "client" });
  });

  it("an archived fiche that leads nowhere: to reactivate — never a new client", () => {
    const fiche = client("old", "TEST UI Ancien", { archived: true });
    expect(exactNameDecision([fiche], new Map(), mapOf(fiche))).toEqual({ kind: "archived", fiche });
    // A stale link to itself is no parent.
    const loop = client("self", "TEST UI Boucle", { archived: true, mergedIntoId: "self" });
    expect(exactNameDecision([loop], new Map(), mapOf(loop))?.kind).toBe("archived");
  });

  it("nobody bears it: no decision", () => {
    expect(exactNameDecision([], new Map(), new Map())).toBeNull();
  });
});

describe("exactNameRefusal — the 409's body", () => {
  const chain = client("chain", "TEST UI Chaîne", { ice: "001234567000089", sites: [{ id: "s-snack", name: "Snack Test" }] });

  it("a live client: the keepers' message is unchanged; the counter roles are told to use it, or to tell a namesake apart", () => {
    const decision = { kind: "active" as const, client: chain };
    expect(exactNameRefusal(decision, false).error).toBe("Un client porte déjà cette raison sociale.");
    const counter = exactNameRefusal(decision, true);
    expect(counter.error).toContain("utilisez-le");
    expect(counter.error).toContain(NAMESAKE_HINT);
    expect(NAMESAKE_HINT).toMatch(/ajoutez la ville ou le téléphone/);
    expect(counter.existing).toEqual({ id: "chain", name: "TEST UI Chaîne", ice: "001234567000089", sites: [{ id: "s-snack", name: "Snack Test" }] });
  });

  it("a fiche now a site: « Ce nom est maintenant un site de … », the client and the site", () => {
    const body = exactNameRefusal({ kind: "moved", parent: chain, siteId: "s-snack", via: "site" }, true);
    expect(body.error).toBe("Ce nom est maintenant un site de « TEST UI Chaîne » : utilisez ce client et ce site.");
    expect(body.mergedInto?.id).toBe("chain");
    expect(body.siteId).toBe("s-snack");
  });

  it("a duplicate merged in, or a site no longer active: the client alone", () => {
    const merged = exactNameRefusal({ kind: "moved", parent: chain, siteId: null, via: "merge" }, true);
    expect(merged.error).toBe("Cette fiche a été fusionnée dans « TEST UI Chaîne » : utilisez ce client.");
    expect(merged).not.toHaveProperty("siteId");
    expect(exactNameRefusal({ kind: "moved", parent: chain, siteId: null, via: "client" }, false).error).toBe(
      "Ce nom appartient maintenant à « TEST UI Chaîne » : utilisez ce client."
    );
  });

  it("an archived fiche alone: the counter asks the gestionnaire, the gestionnaire reactivates it", () => {
    const fiche = client("old", "TEST UI Ancien", { archived: true });
    expect(exactNameRefusal({ kind: "archived", fiche }, true).error).toMatch(/^Un client archivé porte ce nom : demandez au gestionnaire commercial de le réactiver\./);
    expect(exactNameRefusal({ kind: "archived", fiche }, false).error).toMatch(/réactivez-le depuis sa fiche/);
    expect(exactNameRefusal({ kind: "archived", fiche }, true)).not.toHaveProperty("existing");
  });

  it("no decision: the plain refusal", () => {
    expect(exactNameRefusal(null, true)).toEqual({ error: "Un client porte déjà cette raison sociale.", exactName: true });
  });

  it("every exact-name refusal says so, to be told from the other 409s", () => {
    const fiche = client("old", "TEST UI Ancien", { archived: true });
    for (const decision of [
      { kind: "active" as const, client: fiche },
      { kind: "moved" as const, parent: fiche, siteId: null, via: "merge" as const },
      { kind: "archived" as const, fiche },
    ]) {
      expect(exactNameRefusal(decision, true).exactName, decision.kind).toBe(true);
      expect(exactNameRefusal(decision, false).exactName, decision.kind).toBe(true);
    }
  });

  it("the near-duplicate 409: the keepers' message is unchanged, the counter roles get the way out", () => {
    expect(nearDuplicateMessage(false)).toBe("Des clients très proches existent déjà : vérifiez avant de créer.");
    expect(nearDuplicateMessage(true)).toContain("utilisez-le");
  });
});
