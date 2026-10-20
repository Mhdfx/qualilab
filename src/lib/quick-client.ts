import type { Role } from "./roles";
import { validateClient, validateClientEmails, type CleanClient } from "./client-validation";
import { siegeSiteRefusal, validateSite, type CleanSite } from "./site-input";
import { createdSiteActive } from "./site-creation";
import { normalizeLabel } from "./serie-input";
import { normalizeSiteName } from "./sites-import";
import {
  ficheSite,
  firstParentId,
  liveParent,
  mergedFicheSite,
  type FicheOrigin,
  type SearchClient,
} from "./client-search";

/**
 * Creating a client at the counter and in the field (RETOUR-LABO-16-10.md
 * E1–E3; R2 / R4 of RETOUR-LABO-14-10.md §4.5, corrected by Q116 / Q117) —
 * pure, shared by `POST /api/clients` and the « Nouveau client » dialog.
 *
 * The reception and the préleveur may create a client, never change one:
 * `POST /api/clients` and `GET /api/clients/similar` admit them, while the
 * fiche (PATCH), the merge and the attachment as a site stay the
 * gestionnaire commercial's and the administrator's. One field is required,
 * the name (« Nom du client (société ou particulier) »): it carries the
 * exact-name lock, the near-duplicate check, the pickers, the report and the
 * invoice. The rest is optional (the laboratory's answer of 16/10, Q116) —
 * postal address, a site (else the siège), the usual sampling places, and
 * under « Autres informations » the contact, phone and ICE.
 *
 * Proposal of the re-ask 2.4 / 2.5 (18/10), kept in one place so it is easy
 * to change: the counter roles type no e-mail address. The single address of
 * the record (`Client.email`) is the default report recipient when the list
 * is empty (`resolveRecipients`, src/lib/email-recipients.ts), so both
 * `email` and `emails` are dropped for them; the client is flagged
 * « À compléter » (`toComplete`) for the gestionnaire, who adds the report
 * recipients, ICE and address.
 */

/** The roles that create a client at the counter or in the field — create only, never edit. */
export const COUNTER_CREATOR_ROLES = ["RECEPTIONNISTE", "PRELEVEUR"] as const satisfies readonly Role[];

/** Every role `POST /api/clients` admits: the client base's keepers and the two counter roles. */
export const CLIENT_CREATOR_ROLES = ["GESTIONNAIRE", "ADMIN", ...COUNTER_CREATOR_ROLES] as const satisfies readonly Role[];

/** At most this many usual sampling places typed at the creation (after removing duplicates). */
export const MAX_NEW_PLACES = 20;
/** At most this many sites created with the client (the dialog sends one). */
export const MAX_NEW_SITES = 20;
/** VARCHAR(191), like every label column. */
export const PLACE_LABEL_MAX = 191;

/** Where the client was created, for the journal. */
export type CreationOrigin = "DEPOT" | "VISITE";

/** A usual sampling place, as stored in `ClientPlace`. */
export type NewPlace = { label: string; normalizedLabel: string };

type CleanEmail = { email: string; label: string | null; forReports: boolean; forAlerts: boolean };

/** What `POST /api/clients` writes, once read and checked. */
export type ClientCreation = {
  client: CleanClient;
  emails: CleanEmail[];
  sites: CleanSite[];
  places: NewPlace[];
  /** « Ce n'est pas le même client », ticked after the near-duplicate 409. */
  confirmDuplicate: boolean;
  /** Null: created from the client base (/commercial/nouveau). */
  origin: CreationOrigin | null;
  /** « À compléter » (E3): created by a counter role. */
  toComplete: boolean;
  /** A counter role sent an address that was dropped (journal). */
  recipientsIgnored: boolean;
};

export type CreationResult = { ok: true; value: ClientCreation } | { ok: false; error: string };

/** Does this role create clients at the counter or in the field (create only, « À compléter »)? */
export function isCounterCreator(role: Role): boolean {
  return (COUNTER_CREATOR_ROLES as readonly Role[]).includes(role);
}

/** The origin the request declares, else the one the role implies (the reception deposits, the préleveur visits). */
export function creationOrigin(raw: unknown, role: Role): CreationOrigin | null {
  if (raw === "DEPOT" || raw === "VISITE") return raw;
  if (role === "RECEPTIONNISTE") return "DEPOT";
  if (role === "PRELEVEUR") return "VISITE";
  return null;
}

/**
 * The usual sampling places typed at the creation: trimmed, empty ones
 * skipped, duplicates removed (case, accents and punctuation aside — the
 * rule the séries use, `normalizeLabel`), at most `MAX_NEW_PLACES`.
 */
export function validateNewPlaces(raw: unknown): { ok: true; value: NewPlace[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "La liste des lieux de prélèvement est invalide." };
  const seen = new Set<string>();
  const value: NewPlace[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return { ok: false, error: "La liste des lieux de prélèvement est invalide." };
    const label = entry.trim().replace(/\s+/g, " ");
    const normalizedLabel = normalizeLabel(label);
    if (!normalizedLabel) continue;
    if (label.length > PLACE_LABEL_MAX) {
      return { ok: false, error: `Le lieu « ${label.slice(0, 40)}… » est trop long (${PLACE_LABEL_MAX} caractères maximum).` };
    }
    if (seen.has(normalizedLabel)) continue;
    seen.add(normalizedLabel);
    value.push({ label, normalizedLabel });
  }
  if (value.length > MAX_NEW_PLACES) {
    return { ok: false, error: `${MAX_NEW_PLACES} lieux de prélèvement au plus à la création ; les autres s'ajoutent sur les échantillons.` };
  }
  return { ok: true, value };
}

/**
 * The sites created with the client: each checked by `validateSite`, active
 * whatever a counter role asks (`createdSiteActive`), two sites of the same
 * name refused (the rule of the sites import: case, accents and punctuation
 * aside). A site named « Siège » is refused: no site is the siège
 * (`siegeSiteRefusal`).
 */
export function validateNewSites(raw: unknown, role: Role): { ok: true; value: CleanSite[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "La liste des sites est invalide." };
  if (raw.length > MAX_NEW_SITES) return { ok: false, error: `${MAX_NEW_SITES} sites au plus à la création.` };
  const seen = new Set<string>();
  const value: CleanSite[] = [];
  for (const entry of raw) {
    const checked = validateSite(entry);
    if (!checked.ok) return checked;
    const siege = siegeSiteRefusal(checked.value.name);
    if (siege) return { ok: false, error: siege };
    const key = normalizeSiteName(checked.value.name);
    if (seen.has(key)) return { ok: false, error: `Deux sites portent le nom « ${checked.value.name} ».` };
    seen.add(key);
    value.push({ ...checked.value, active: createdSiteActive(role, checked.value.active) });
  }
  return { ok: true, value };
}

const hasText = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** Did the request carry an address (the record's, or a non-empty entry of the list)? */
function sentRecipients(body: Record<string, unknown>): boolean {
  if (hasText(body.email)) return true;
  return Array.isArray(body.emails) && body.emails.some((entry) => hasText((entry as { email?: unknown } | null)?.email));
}

/**
 * The counter roles' words for the name (Q116: a client may be a private
 * person, « Nom du client (société ou particulier) »), in place of the
 * client base's « raison sociale » — the message `validateClient` keeps for
 * the keepers and the client import.
 */
const COUNTER_NAME_MESSAGES: Readonly<Record<string, string>> = {
  "La raison sociale est obligatoire.": "Le nom du client est obligatoire.",
  "La raison sociale est trop longue.": "Le nom du client est trop long (191 caractères maximum).",
};

/**
 * The body of `POST /api/clients`, read for `role`. For the counter roles
 * the e-mail fields are dropped (never refused: an old screen or a typed
 * address must not lose the creation) and the client is « À compléter ».
 */
export function clientCreationInput(body: unknown, role: Role): CreationResult {
  const raw = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const counter = isCounterCreator(role);

  const validated = validateClient({
    name: raw.name,
    contact: raw.contact,
    email: counter ? undefined : raw.email,
    phone: raw.phone,
    address: raw.address,
    ice: raw.ice,
    // H2 (RETOUR-LABO-19-10.md): the client form's IF and RC, next to the ICE.
    fiscalId: raw.fiscalId,
    tradeRegister: raw.tradeRegister,
  });
  if (!validated.ok) return counter ? { ok: false, error: COUNTER_NAME_MESSAGES[validated.error] ?? validated.error } : validated;

  const emails = counter ? { ok: true as const, value: [] } : validateClientEmails(raw.emails);
  if (!emails.ok) return emails;

  const sites = validateNewSites(raw.sites, role);
  if (!sites.ok) return sites;

  const places = validateNewPlaces(raw.places);
  if (!places.ok) return places;

  return {
    ok: true,
    value: {
      client: validated.value,
      emails: emails.value,
      sites: sites.value,
      places: places.value,
      confirmDuplicate: raw.confirmDuplicate === true,
      origin: creationOrigin(raw.origin, role),
      toComplete: counter,
      recipientsIgnored: counter && sentRecipients(raw),
    },
  };
}

// ---- N1: the exact name of a client that already exists --------------------------------------

/** A client bearing exactly the name typed (the locking read: case and accents ignored). */
export type NameHolder = Pick<SearchClient, "id" | "name" | "archived" | "mergedIntoId">;

/**
 * Why the exact name is refused (RETOUR-LABO-14-10.md §4.5, N1):
 *   - `active`: a live client bears it — use it (or, for a namesake, tell
 *     the two apart with the city or the phone);
 *   - `moved`: an archived fiche bears it, merged into or attached as a site
 *     of a live client — use that client, and the site made from the fiche
 *     when it can be told (the 345 restaurants archived by the import of
 *     the sites of 07/10 are the likeliest first try at the counter);
 *   - `archived`: an archived fiche that leads nowhere — to be reactivated
 *     by the gestionnaire.
 */
export type ExactNameDecision<C> =
  | { kind: "active"; client: C }
  | { kind: "moved"; parent: C; siteId: string | null; via: "site" | "merge" | "client" }
  | { kind: "archived"; fiche: NameHolder };

/**
 * The decision for the clients bearing the name, from where each archived
 * fiche went (`origins`, `ficheOrigins` of src/lib/client-search.ts) and the
 * clients loaded along the links. Null when nobody bears it (the lock found
 * no row by the time the holders were read).
 */
export function exactNameDecision<C extends SearchClient>(
  holders: readonly NameHolder[],
  origins: ReadonlyMap<string, FicheOrigin>,
  clients: ReadonlyMap<string, C>
): ExactNameDecision<C> | null {
  const live = holders.find((holder) => !holder.archived);
  if (live) {
    const client = clients.get(live.id);
    if (client) return { kind: "active", client };
  }
  for (const fiche of holders) {
    if (!fiche.archived) continue;
    const origin = origins.get(fiche.id) ?? { kind: "unknown" as const, parentId: null, siteId: null };
    const parent = liveParent(firstParentId(fiche, origin), clients);
    if (!parent || parent.id === fiche.id) continue;
    const site = ficheSite(fiche, origin, parent.sites) ?? mergedFicheSite(origin, parent, origins, clients);
    // Its site, when one is active; else a duplicate merged in, or a place whose site is no longer listed.
    const via = site ? "site" : origin.kind === "merged" ? "merge" : "client";
    return { kind: "moved", parent, siteId: site?.id ?? null, via };
  }
  const archived = holders.find((holder) => holder.archived);
  return archived ? { kind: "archived", fiche: archived } : null;
}

/** The client a 409 hands back for « Utiliser ce client ». */
export type OfferedClient = { id: string; name: string; ice: string | null; sites: { id: string; name: string }[] };

export type ExactNameRefusal = {
  error: string;
  /** Tells this 409 from the others (a creation at the same instant, two sites of one name). */
  exactName: true;
  /** `active`: the live client of that name. */
  existing?: OfferedClient;
  /** `moved`: the live client the fiche now belongs to. */
  mergedInto?: OfferedClient;
  /** `moved`: the site made from the fiche, one of `mergedInto.sites`. */
  siteId?: string;
};

const q = (name: string) => `« ${name} »`;

/** A namesake (two private persons of the same name) is told apart in the name itself. */
export const NAMESAKE_HINT =
  "Pour une autre personne ou société du même nom, ajoutez la ville ou le téléphone au nom (par exemple « … — Agadir »).";

/**
 * The body of the 409. The client base's keepers keep the message they
 * always had for a live client; the counter roles are told what to do,
 * never sent to the client base (a space closed to them).
 */
export function exactNameRefusal<C extends OfferedClient>(decision: ExactNameDecision<C> | null, counter: boolean): ExactNameRefusal {
  const offered = (client: C): OfferedClient => ({ id: client.id, name: client.name, ice: client.ice, sites: client.sites });
  if (!decision) return { error: "Un client porte déjà cette raison sociale.", exactName: true };
  switch (decision.kind) {
    case "active":
      return {
        error: counter
          ? `Un client porte déjà ce nom : s'il s'agit du même, utilisez-le. ${NAMESAKE_HINT}`
          : "Un client porte déjà cette raison sociale.",
        exactName: true,
        existing: offered(decision.client),
      };
    case "moved":
      return {
        error:
          decision.via === "site"
            ? `Ce nom est maintenant un site de ${q(decision.parent.name)} : utilisez ce client et ce site.`
            : decision.via === "merge"
              ? `Cette fiche a été fusionnée dans ${q(decision.parent.name)} : utilisez ce client.`
              : `Ce nom appartient maintenant à ${q(decision.parent.name)} : utilisez ce client.`,
        exactName: true,
        mergedInto: offered(decision.parent),
        ...(decision.siteId ? { siteId: decision.siteId } : {}),
      };
    case "archived":
      return {
        error: counter
          ? `Un client archivé porte ce nom : demandez au gestionnaire commercial de le réactiver. ${NAMESAKE_HINT}`
          : "Un client archivé porte cette raison sociale : réactivez-le depuis sa fiche (Base clients, « Archivés »).",
        exactName: true,
      };
  }
}

/** The near-duplicate 409's sentence: the counter roles are offered the namesake way out too. */
export function nearDuplicateMessage(counter: boolean): string {
  return counter
    ? `Des clients très proches existent déjà : si c'est l'un d'eux, utilisez-le. ${NAMESAKE_HINT}`
    : "Des clients très proches existent déjà : vérifiez avant de créer.";
}

// ---- the « Nouveau client » dialog ------------------------------------------------------------

/** What the dialog holds, as typed. */
export type QuickClientForm = {
  name: string;
  address: string;
  /** The site's name; empty: the siège. */
  site: string;
  places: string[];
  /** A place typed and not added yet: sent with the others. */
  placeDraft: string;
  contact: string;
  phone: string;
  ice: string;
};

/**
 * One more usual place in the dialog's list: refused when empty, too long,
 * already there (the server's rule, `normalizeLabel`) or past
 * `MAX_NEW_PLACES`. The list is never changed in place.
 */
export function withPlace(places: readonly string[], typed: string): { places: string[]; refusal: string | null } {
  const label = typed.trim().replace(/\s+/g, " ");
  const key = normalizeLabel(label);
  if (!key) return { places: [...places], refusal: "Indiquez le lieu de prélèvement." };
  if (label.length > PLACE_LABEL_MAX) {
    return { places: [...places], refusal: `Ce lieu est trop long (${PLACE_LABEL_MAX} caractères maximum).` };
  }
  const twin = places.find((place) => normalizeLabel(place) === key);
  if (twin) return { places: [...places], refusal: `« ${twin} » est déjà dans la liste.` };
  if (places.length >= MAX_NEW_PLACES) {
    return { places: [...places], refusal: `${MAX_NEW_PLACES} lieux au plus ; les autres s'ajoutent sur les échantillons.` };
  }
  return { places: [...places, label], refusal: null };
}

/**
 * The body the dialog posts to `POST /api/clients`: never an e-mail field;
 * the site only when one is named; the place still being typed included.
 */
export function quickClientBody(form: QuickClientForm, origin: CreationOrigin, confirmDuplicate: boolean) {
  const site = form.site.trim();
  const places = [...form.places, form.placeDraft].map((place) => place.trim()).filter(Boolean);
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    contact: form.contact.trim(),
    phone: form.phone.trim(),
    ice: form.ice.trim(),
    sites: site ? [{ name: site }] : [],
    places,
    origin,
    ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
  };
}
