/**
 * Lot 5B, HA3 (RETOUR-LABO-20-11.md §6) — a correspondence decided by hand
 * (PUT /api/admin/historique/liens), read from the request. Pure.
 *
 * `clientId` null is « Ne pas reprendre »: a decision too, kept so that the
 * next « Rattacher les clients » never links that client again by itself.
 */
/** Who decides a correspondence (the route's guard, `requireApiRole("ADMIN")`): the administrator alone (HA6). */
export const LEGACY_LINK_ROLES = ["ADMIN"] as const;

/** Whether a role is offered « Rattacher » / « Retirer » on the fiche client. */
export function canManageLegacyLinks(role: string): boolean {
  return (LEGACY_LINK_ROLES as readonly string[]).includes(role);
}

export type LinkDecision = {
  legacyClientId: number;
  legacyName: string | null;
  clientId: string | null;
  siteId: string | null;
  /** The administrator saw who holds the link now and confirmed moving it (« Déplacer sur cette fiche »). */
  replace: boolean;
  /** « Retirer » from a fiche: the fiche the link is withdrawn from (it must still be the one holding it). */
  expectedClientId: string | null;
};

const MAX_ID = 2_147_483_647;

export function parseLinkDecision(body: unknown): LinkDecision | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Requête invalide." };
  const input = body as Record<string, unknown>;
  const raw = typeof input.legacyClientId === "string" ? input.legacyClientId.trim() : input.legacyClientId;
  const legacyClientId = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(legacyClientId) || legacyClientId <= 0 || legacyClientId > MAX_ID) {
    return { error: "Indiquez le numéro du client dans l'ancien logiciel." };
  }
  if (!("clientId" in input)) return { error: "Choisissez la fiche, ou « Ne pas reprendre »." };
  const clientId = input.clientId === null ? null : typeof input.clientId === "string" && input.clientId.trim() ? input.clientId.trim() : undefined;
  if (clientId === undefined || (clientId !== null && clientId.length > 191)) return { error: "Choisissez la fiche, ou « Ne pas reprendre »." };
  const siteId = typeof input.siteId === "string" && input.siteId.trim() ? input.siteId.trim().slice(0, 191) : null;
  const legacyName = typeof input.legacyName === "string" && input.legacyName.trim() ? input.legacyName.trim().slice(0, 191) : null;
  const expectedClientId = typeof input.expectedClientId === "string" && input.expectedClientId.trim() ? input.expectedClientId.trim().slice(0, 191) : null;
  return { legacyClientId, legacyName, clientId, siteId, replace: input.replace === true, expectedClientId };
}

/**
 * Whether a decision would take a link — and the whole history it brought —
 * away from the client that holds it without the administrator having seen
 * it (a number mistyped on a fiche: 2330 for 2303). Refused (409) unless:
 *   - nobody holds it (no link yet, or « Ne pas reprendre »): a decision;
 *   - it goes to the client already holding it;
 *   - `replace`: the lookup showed the current fiche and the samples, and
 *     the administrator confirmed moving them;
 *   - « Ne pas reprendre » from the fiche that holds it (`expectedClientId`).
 */
export function linkConflict(
  before: { clientId: string | null } | null,
  decision: Pick<LinkDecision, "clientId" | "replace" | "expectedClientId">
): boolean {
  if (!before || before.clientId === null) return false;
  if (before.clientId === decision.clientId) return false;
  if (decision.replace) return false;
  if (decision.clientId === null && decision.expectedClientId === before.clientId) return false;
  return true;
}

/** A legacy client's number from a URL (`?legacyClientId=`), or null. */
export function parseLegacyClientId(value: string | null): number | null {
  const text = (value ?? "").trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 && id <= MAX_ID ? id : null;
}
