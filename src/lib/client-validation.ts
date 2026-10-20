/**
 * Validating a client record.
 *
 * Kept as pure functions so the same rules apply to the API and the form, and
 * so they can be tested without a database. The ICE is Morocco's company
 * identifier and appears on every invoice, so it is checked rather than
 * accepted blindly — but only for shape, since we cannot verify it exists.
 *
 * The IF (identifiant fiscal) and the RC (registre de commerce) sit next to
 * it (RETOUR-LABO-19-10.md H2, Q85): optional, trimmed and capped, frozen
 * on each issued invoice and listed in the accounting export. No shape is
 * imposed — the laboratory's records write them in more than one way (an RC
 * often carries its city).
 */

export type ClientInput = {
  name?: unknown;
  contact?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  ice?: unknown;
  fiscalId?: unknown;
  tradeRegister?: unknown;
};

export type CleanClient = {
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ice: string | null;
  /**
   * IF and RC (H2): present only when the input carries the field. Absent,
   * a save leaves the stored value alone (an older screen, the counter's
   * quick creation and the client import never send them); sent empty, it
   * clears it.
   */
  fiscalId?: string | null;
  tradeRegister?: string | null;
};

export type ValidationResult =
  | { ok: true; value: CleanClient }
  | { ok: false; error: string };

/** An address good enough to actually send a report to. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim());
}

/** The Moroccan ICE is 15 digits. */
export function isIce(value: string): boolean {
  return /^\d{15}$/.test(value.replace(/\s/g, ""));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The longest IF and RC accepted (H2). */
export const FISCAL_ID_MAX = 30;
export const TRADE_REGISTER_MAX = 60;

/** The IF is a number: its spaces are dropped, as the ICE's are. */
export function normalFiscalId(value: unknown): string {
  return text(value).replace(/\s/g, "");
}

/** The RC may carry its city (« 12345 Casablanca »): its spaces are kept, collapsed. */
export function normalTradeRegister(value: unknown): string {
  return text(value).replace(/\s+/g, " ");
}

export function validateClient(input: ClientInput): ValidationResult {
  const name = text(input.name);
  if (!name) {
    return { ok: false, error: "La raison sociale est obligatoire." };
  }
  if (name.length > 191) {
    return { ok: false, error: "La raison sociale est trop longue." };
  }

  const email = text(input.email);
  if (email && !isEmail(email)) {
    return { ok: false, error: "L'adresse email n'est pas valide." };
  }

  const ice = text(input.ice).replace(/\s/g, "");
  if (ice && !isIce(ice)) {
    return { ok: false, error: "L'ICE doit comporter 15 chiffres." };
  }

  // Identifiers, not text: a cap well under the column catches an address or
  // a note typed in the wrong box (the company's own IF is capped at 30 too,
  // src/lib/company-input.ts); an RC may carry its city.
  const fiscalId = normalFiscalId(input.fiscalId);
  if (fiscalId.length > FISCAL_ID_MAX) {
    return { ok: false, error: `L'IF (identifiant fiscal) est trop long (${FISCAL_ID_MAX} caractères maximum).` };
  }
  const tradeRegister = normalTradeRegister(input.tradeRegister);
  if (tradeRegister.length > TRADE_REGISTER_MAX) {
    return { ok: false, error: `Le RC (registre de commerce) est trop long (${TRADE_REGISTER_MAX} caractères maximum).` };
  }

  // Every column is VARCHAR(191): refuse politely rather than crash on insert.
  const capped: [string, string][] = [
    ["Le contact", text(input.contact)],
    ["L'adresse email", email],
    ["Le téléphone", text(input.phone)],
    ["L'adresse", text(input.address)],
  ];
  for (const [label, value] of capped) {
    if (value.length > 191) {
      return { ok: false, error: `${label} est trop long (191 caractères maximum).` };
    }
  }

  return {
    ok: true,
    value: {
      name,
      contact: text(input.contact) || null,
      email: email || null,
      phone: text(input.phone) || null,
      address: text(input.address) || null,
      ice: ice || null,
      ...(input.fiscalId !== undefined ? { fiscalId: fiscalId || null } : {}),
      ...(input.tradeRegister !== undefined ? { tradeRegister: tradeRegister || null } : {}),
    },
  };
}

/** One address of a client's recipient list, checked. */
export type CleanClientEmail = {
  email: string;
  label: string | null;
  forReports: boolean;
  forAlerts: boolean;
  /**
   * H3 (Q45): the site the address belongs to, null for the whole client.
   * Present only when `validateClientEmails` reads the sites and the row
   * carries `siteId`; absent, the server keeps the address's previous site.
   */
  siteId?: string | null;
};

/**
 * The recipient list attached to a client. `sites`: each row's `siteId` is
 * read (the client form, PATCH /api/clients/[id]). Never at creation, where
 * the client has no site of its own yet: a `siteId` sent there is ignored.
 */
export function validateClientEmails(
  entries: unknown,
  options: { sites?: boolean } = {}
): { ok: true; value: CleanClientEmail[] } | { ok: false; error: string } {
  if (!Array.isArray(entries)) return { ok: true, value: [] };

  const seen = new Set<string>();
  const value: CleanClientEmail[] = [];

  for (const entry of entries) {
    const email = text((entry as { email?: unknown })?.email).toLowerCase();
    if (!email) continue;

    if (!isEmail(email)) {
      return { ok: false, error: `Adresse invalide : ${email}` };
    }
    // VARCHAR(191), like every column of the fiche: refused here rather than
    // by the database (a 500 that lost the whole save).
    if (email.length > 191) {
      return { ok: false, error: "Une adresse de la liste est trop longue (191 caractères maximum)." };
    }
    if (text((entry as { label?: unknown })?.label).length > 191) {
      return { ok: false, error: `Le libellé de ${email} est trop long (191 caractères maximum).` };
    }
    if (seen.has(email)) {
      return { ok: false, error: `Adresse en double : ${email}` };
    }
    seen.add(email);

    const raw = entry as { label?: unknown; forReports?: unknown; forAlerts?: unknown; siteId?: unknown };
    const row: CleanClientEmail = {
      email,
      label: text(raw.label) || null,
      // Absent means "yes": a listed address is expected to receive things.
      forReports: raw.forReports !== false,
      forAlerts: raw.forAlerts !== false,
    };
    if (options.sites && raw.siteId !== undefined) {
      // « Tout le client » is null (or empty); a site is its id, checked
      // against the client's own sites by `emailSitesRefusal`.
      if (raw.siteId !== null && typeof raw.siteId !== "string") {
        return { ok: false, error: `Le site choisi pour ${email} n'est pas valide.` };
      }
      row.siteId = text(raw.siteId) || null;
    }
    value.push(row);
  }

  return { ok: true, value };
}

/** A site of the client, as the check of the addresses' sites reads it. */
export type EmailSite = { id: string; name: string; active: boolean };

/**
 * H3 (Q45): may each address belong to the site chosen for it? Null when
 * every one may; otherwise the refusal shown as is (400). The site must be
 * one of THIS client's sites (another client's would send this client's
 * reports to a stranger's recipients), and active, unless an address of the
 * client already belongs to it (`previous`: saved address → its site): a
 * site deactivated since keeps its addresses until someone moves them. Any
 * of them, not only the same e-mail — the form offers such a site on every
 * row (`siteOptions`), so a typo fixed in a kept address, or a second
 * address for that site, saves as the form shows it.
 */
export function emailSitesRefusal(
  entries: readonly CleanClientEmail[],
  sites: readonly EmailSite[],
  previous: ReadonlyMap<string, string | null>
): string | null {
  const byId = new Map(sites.map((site) => [site.id, site]));
  const bound = new Set([...previous.values()].filter((id): id is string => id !== null));
  for (const entry of entries) {
    if (!entry.siteId) continue;
    const site = byId.get(entry.siteId);
    if (!site) return `Le site choisi pour ${entry.email} n'appartient pas à ce client.`;
    if (!site.active && !bound.has(site.id)) {
      return `Le site « ${site.name} » est désactivé : choisissez un site actif ou « Tout le client » pour ${entry.email}.`;
    }
  }
  return null;
}

/** An address whose site a save changed (H3), as the journal records it. */
export type EmailSiteChange = { email: string; siteId: string | null; site: string | null };

/**
 * H3: the addresses whose site this save changes, for the CLIENT_UPDATED
 * journal (PATCH /api/clients/[id]) — a new address given a site, an
 * address moved to another site, and one given back to the whole client
 * (`siteId` and `site` null). An address saved with the site it had, and a
 * new address of the whole client, are left out. `siteIds`: what each
 * entry is saved with (`emailSiteIds`); `site`: the site's name, or null.
 */
export function emailSiteChanges(
  entries: readonly CleanClientEmail[],
  siteIds: readonly (string | null)[],
  previous: ReadonlyMap<string, string | null>,
  sites: readonly EmailSite[]
): EmailSiteChange[] {
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  const changes: EmailSiteChange[] = [];
  entries.forEach((entry, index) => {
    const siteId = siteIds[index] ?? null;
    if (siteId !== (previous.get(entry.email) ?? null)) {
      changes.push({ email: entry.email, siteId, site: siteId ? (siteName.get(siteId) ?? null) : null });
    }
  });
  return changes;
}

/**
 * The site each address is saved with: the one its row carries (H3), else,
 * from an older screen that does not send it, the address's previous site,
 * matched by address (D-04: an address kept in the list keeps its site).
 */
export function emailSiteIds(
  entries: readonly CleanClientEmail[],
  previous: ReadonlyMap<string, string | null>
): (string | null)[] {
  return entries.map((entry) => (entry.siteId !== undefined ? entry.siteId : (previous.get(entry.email) ?? null)));
}
