import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  validateClient,
  validateClientEmails,
  emailSiteChanges,
  emailSiteIds,
  emailSitesRefusal,
  FISCAL_ID_MAX,
  TRADE_REGISTER_MAX,
  isEmail,
  isIce,
  normalFiscalId,
  normalTradeRegister,
} from "./client-validation";

describe("isEmail", () => {
  it("accepts the addresses a laboratory actually writes to", () => {
    expect(isEmail("contact@lepalmier.ma")).toBe(true);
    expect(isEmail("qualite.labo@agro-maroc.co.ma")).toBe(true);
  });

  it("refuses what would never deliver", () => {
    for (const bad of ["contact", "contact@", "@lepalmier.ma", "a@b", "a b@c.ma", ""]) {
      expect(isEmail(bad), bad).toBe(false);
    }
  });
});

describe("isIce", () => {
  it("accepts the 15 digits of a Moroccan ICE, spaced or not", () => {
    expect(isIce("001234567000045")).toBe(true);
    expect(isIce("001234567 000045")).toBe(true);
  });

  it("refuses anything that is not 15 digits", () => {
    expect(isIce("12345")).toBe(false);
    expect(isIce("0012345670000456")).toBe(false);
    expect(isIce("00123456700004X")).toBe(false);
  });
});

describe("validateClient", () => {
  it("requires a raison sociale", () => {
    const result = validateClient({ name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("raison sociale");
  });

  it("trims and keeps the optional fields as null rather than empty strings", () => {
    const result = validateClient({ name: "  Restaurant Le Palmier  ", contact: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Restaurant Le Palmier");
      // null, not "", so the interface can say "non renseigné".
      expect(result.value.contact).toBeNull();
      expect(result.value.ice).toBeNull();
    }
  });

  it("refuses an email that would never deliver a report", () => {
    const result = validateClient({ name: "Client", email: "pas-une-adresse" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("email");
  });

  it("refuses a malformed ICE, since it is printed on the invoice", () => {
    const result = validateClient({ name: "Client", ice: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("15 chiffres");
  });

  it("normalises the ICE by removing the spaces", () => {
    const result = validateClient({ name: "Client", ice: "001234567 000045" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ice).toBe("001234567000045");
  });
});

describe("validateClient — column widths", () => {
  it("refuses a field longer than the column instead of crashing on insert", () => {
    const long = "a".repeat(192);
    for (const [field, message] of [
      ["contact", "Le contact"],
      ["phone", "Le téléphone"],
      ["address", "L'adresse"],
    ] as const) {
      const result = validateClient({ name: "Labo test", [field]: long });
      expect(result.ok, field).toBe(false);
      if (!result.ok) expect(result.error).toContain(message);
    }
  });

  it("accepts a field of exactly the column width", () => {
    expect(validateClient({ name: "Labo test", address: "a".repeat(191) }).ok).toBe(true);
  });
});

describe("validateClientEmails", () => {
  it("keeps a list and lowercases the addresses", () => {
    const result = validateClientEmails([
      { email: "Contact@Lepalmier.ma", label: "Qualité" },
      { email: "direction@lepalmier.ma", forReports: false },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].email).toBe("contact@lepalmier.ma");
      expect(result.value[0].forReports).toBe(true);
      // Explicitly excluded from reports, still receives alerts.
      expect(result.value[1].forReports).toBe(false);
      expect(result.value[1].forAlerts).toBe(true);
    }
  });

  it("refuses a duplicate, which would mail the client twice", () => {
    const result = validateClientEmails([
      { email: "contact@lepalmier.ma" },
      { email: "CONTACT@lepalmier.ma" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("double");
  });

  it("refuses an invalid address rather than dropping it silently", () => {
    const result = validateClientEmails([{ email: "cassé@" }]);
    expect(result.ok).toBe(false);
  });

  it("ignores empty rows left by the form", () => {
    const result = validateClientEmails([{ email: "" }, { email: "  " }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("treats a missing list as no list", () => {
    expect(validateClientEmails(undefined)).toEqual({ ok: true, value: [] });
  });

  it("refuses an address or a label longer than its column (full-db 12/10: a 500)", () => {
    expect(validateClientEmails([{ email: `${"a".repeat(187)}@x.ma` }]).ok).toBe(false);
    expect(validateClientEmails([{ email: `${"a".repeat(186)}@x.ma` }]).ok).toBe(true);
    expect(validateClientEmails([{ email: "qualite@x.ma", label: "L".repeat(192) }]).ok).toBe(false);
    expect(validateClientEmails([{ email: "qualite@x.ma", label: "L".repeat(191) }]).ok).toBe(true);
  });
});

describe("validateClient — IF and RC (RETOUR-LABO-19-10.md H2, Q85)", () => {
  it("keeps them trimmed, the IF without its spaces, the RC with its city", () => {
    const result = validateClient({ name: "TEST UI Client", fiscalId: " 1234 5678 ", tradeRegister: "  12345   Casablanca " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fiscalId).toBe("12345678");
      expect(result.value.tradeRegister).toBe("12345 Casablanca");
    }
  });

  it("are optional: sent empty, they are cleared (null), like the ICE", () => {
    const result = validateClient({ name: "TEST UI Client", fiscalId: "  ", tradeRegister: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fiscalId).toBeNull();
      expect(result.value.tradeRegister).toBeNull();
    }
  });

  it("not sent, they are left out, so a save never wipes what an older screen does not show", () => {
    const result = validateClient({ name: "TEST UI Client", ice: "001234567000045" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("fiscalId");
      expect(result.value).not.toHaveProperty("tradeRegister");
    }
  });

  it("caps them as identifiers (an address typed in the wrong box is refused), with the field's name", () => {
    expect(FISCAL_ID_MAX).toBe(30);
    expect(TRADE_REGISTER_MAX).toBe(60);
    const fiscal = validateClient({ name: "TEST UI Client", fiscalId: "1".repeat(31) });
    expect(fiscal).toEqual({ ok: false, error: "L'IF (identifiant fiscal) est trop long (30 caractères maximum)." });
    const register = validateClient({ name: "TEST UI Client", tradeRegister: "R".repeat(61) });
    expect(register).toEqual({ ok: false, error: "Le RC (registre de commerce) est trop long (60 caractères maximum)." });
    expect(validateClient({ name: "TEST UI Client", fiscalId: "1".repeat(30), tradeRegister: "R".repeat(60) }).ok).toBe(true);
    // Counted once normalised: the IF's spaces and the RC's doubled spaces do not count.
    expect(validateClient({ name: "TEST UI Client", fiscalId: ` ${"1 ".repeat(30)}` }).ok).toBe(true);
    expect(validateClient({ name: "TEST UI Client", tradeRegister: `${"R".repeat(30)}      ${"R".repeat(29)}` }).ok).toBe(true);
  });

  it("ignores what is not text, as for the other fields", () => {
    const result = validateClient({ name: "TEST UI Client", fiscalId: 1234, tradeRegister: { rc: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fiscalId).toBeNull();
      expect(result.value.tradeRegister).toBeNull();
    }
  });

  it("normalFiscalId and normalTradeRegister", () => {
    expect(normalFiscalId(" 40 123 456 ")).toBe("40123456");
    expect(normalFiscalId(undefined)).toBe("");
    expect(normalTradeRegister(" RC   9876 \t Rabat ")).toBe("RC 9876 Rabat");
  });
});

describe("validateClientEmails — the site of an address (H3, Q45)", () => {
  it("reads siteId only when asked: at creation a siteId sent is dropped", () => {
    const rows = [{ email: "site@example.com", siteId: "site-1" }];
    const creation = validateClientEmails(rows);
    expect(creation.ok).toBe(true);
    if (creation.ok) expect(creation.value[0]).not.toHaveProperty("siteId");

    const edition = validateClientEmails(rows, { sites: true });
    expect(edition.ok).toBe(true);
    if (edition.ok) expect(edition.value[0].siteId).toBe("site-1");
  });

  it("« Tout le client » is null (or empty); a row without siteId carries none", () => {
    const result = validateClientEmails(
      [
        { email: "a@example.com", siteId: null },
        { email: "b@example.com", siteId: "  " },
        { email: "c@example.com" },
      ],
      { sites: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].siteId).toBeNull();
      expect(result.value[1].siteId).toBeNull();
      expect(result.value[2]).not.toHaveProperty("siteId");
    }
  });

  it("refuses a site that is not an id", () => {
    expect(validateClientEmails([{ email: "a@example.com", siteId: 12 }], { sites: true })).toEqual({
      ok: false,
      error: "Le site choisi pour a@example.com n'est pas valide.",
    });
  });
});

describe("emailSitesRefusal — the site must be this client's (H3)", () => {
  const sites = [
    { id: "s-active", name: "Site Test A", active: true },
    { id: "s-closed", name: "Site Test B", active: false },
  ];
  const none = new Map<string, string | null>();

  it("accepts the whole client and the client's active sites", () => {
    expect(
      emailSitesRefusal(
        [
          { email: "a@example.com", label: null, forReports: true, forAlerts: true, siteId: null },
          { email: "b@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-active" },
          { email: "c@example.com", label: null, forReports: true, forAlerts: true },
        ],
        sites,
        none
      )
    ).toBeNull();
  });

  it("refuses another client's site (its reports would go to this client's addresses)", () => {
    expect(
      emailSitesRefusal([{ email: "a@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-other-client" }], sites, none)
    ).toBe("Le site choisi pour a@example.com n'appartient pas à ce client.");
  });

  it("refuses a deactivated site for a new binding, keeps an address already bound to it", () => {
    const row = { email: "b@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-closed" };
    expect(emailSitesRefusal([row], sites, none)).toBe(
      "Le site « Site Test B » est désactivé : choisissez un site actif ou « Tout le client » pour b@example.com."
    );
    expect(emailSitesRefusal([row], sites, new Map([["b@example.com", "s-closed"]]))).toBeNull();
  });

  it("keeps a deactivated site on an address retyped (a typo fixed), as the form shows it", () => {
    // Saved « magasin@ », retyped « magasin.nord@ », the select left on « Site : Site Test B (désactivé) ».
    const retyped = { email: "magasin.nord@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-closed" };
    expect(emailSitesRefusal([retyped], sites, new Map([["magasin@example.com", "s-closed"]]))).toBeNull();
  });

  it("lets a new address join a deactivated site another address of the client already uses", () => {
    const previous = new Map<string, string | null>([["kept@example.com", "s-closed"]]);
    const rows = [
      { email: "kept@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-closed" },
      { email: "second@example.com", label: null, forReports: true, forAlerts: false, siteId: "s-closed" },
    ];
    expect(emailSitesRefusal(rows, sites, previous)).toBeNull();
  });

  it("still refuses a deactivated site no address of the client uses", () => {
    const previous = new Map<string, string | null>([
      ["general@example.com", null],
      ["active@example.com", "s-active"],
    ]);
    const row = { email: "general@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-closed" };
    expect(emailSitesRefusal([row], sites, previous)).toBe(
      "Le site « Site Test B » est désactivé : choisissez un site actif ou « Tout le client » pour general@example.com."
    );
  });
});

describe("emailSiteChanges — what the CLIENT_UPDATED journal records (H3)", () => {
  const sites = [
    { id: "s-1", name: "Site Test A", active: true },
    { id: "s-2", name: "Site Test B", active: true },
  ];
  const row = (email: string, siteId?: string | null) => ({
    email,
    label: null,
    forReports: true,
    forAlerts: true,
    ...(siteId !== undefined ? { siteId } : {}),
  });
  const previous = new Map<string, string | null>([
    ["kept@example.com", "s-1"],
    ["moved@example.com", "s-1"],
    ["back@example.com", "s-2"],
    ["general@example.com", null],
  ]);

  it("logs a new address given a site, a move, and a move back to the whole client (site: null)", () => {
    const entries = [row("new@example.com", "s-2"), row("moved@example.com", "s-2"), row("back@example.com", null)];
    expect(emailSiteChanges(entries, emailSiteIds(entries, previous), previous, sites)).toEqual([
      { email: "new@example.com", siteId: "s-2", site: "Site Test B" },
      { email: "moved@example.com", siteId: "s-2", site: "Site Test B" },
      { email: "back@example.com", siteId: null, site: null },
    ]);
  });

  it("leaves out an unchanged address, one kept by an older screen and a new address of the whole client", () => {
    const entries = [
      row("kept@example.com", "s-1"),
      row("moved@example.com"),
      row("general@example.com", null),
      row("other@example.com", null),
      row("plain@example.com"),
    ];
    expect(emailSiteChanges(entries, emailSiteIds(entries, previous), previous, sites)).toEqual([]);
  });

  it("is empty for an empty list (removed addresses are counted by `emails`, not here)", () => {
    expect(emailSiteChanges([], [], previous, sites)).toEqual([]);
  });
});

describe("emailSiteIds — what each address is saved with", () => {
  const previous = new Map<string, string | null>([
    ["kept@example.com", "s-1"],
    ["moved@example.com", "s-1"],
    ["general@example.com", null],
  ]);

  it("the site the row carries, else (an older screen) the address's previous site", () => {
    expect(
      emailSiteIds(
        [
          { email: "kept@example.com", label: null, forReports: true, forAlerts: true },
          { email: "moved@example.com", label: null, forReports: true, forAlerts: true, siteId: null },
          { email: "general@example.com", label: null, forReports: true, forAlerts: true, siteId: "s-2" },
          { email: "new@example.com", label: null, forReports: true, forAlerts: true },
        ],
        previous
      )
    ).toEqual(["s-1", null, "s-2", null]);
  });
});

describe("the routes apply the site of an address as H3 says", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../app/api/${rel}`, import.meta.url)), "utf8");

  it("PATCH /api/clients/[id] reads the sites, checks them against the client's own, then saves", () => {
    const route = read("clients/[id]/route.ts");
    expect(route).toContain("validateClientEmails(emails, { sites: true })");
    expect(route).toMatch(/tx\.site\.findMany\(\{ where: \{ clientId: id \}/);
    const check = route.indexOf("emailSitesRefusal(list.value, sites, siteOf)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(route.indexOf("tx.clientEmail.deleteMany"));
    expect(route).toMatch(/error instanceof SiteRefused\) \{\s*return NextResponse\.json\(\{ error: error\.message \}, \{ status: 400 \}\)/);
    expect(route).toMatch(/siteId: siteIds\[index\]/);
  });

  it("PATCH /api/clients/[id] journals the sites changed, through emailSiteChanges, in CLIENT_UPDATED", () => {
    const route = read("clients/[id]/route.ts");
    expect(route).toContain("siteChanges = emailSiteChanges(list.value, siteIds, siteOf, sites)");
    const audit = route.slice(route.indexOf('action: "CLIENT_UPDATED"'));
    expect(audit.slice(0, audit.indexOf("});"))).toMatch(/emailSites: siteChanges/);
  });

  it("POST /api/clients never binds an address to a site (the client has none yet)", () => {
    expect(read("clients/route.ts")).not.toContain("sites: true })");
    expect(readFileSync(fileURLToPath(new URL("./quick-client.ts", import.meta.url)), "utf8")).toContain(
      "validateClientEmails(raw.emails)"
    );
  });
});
