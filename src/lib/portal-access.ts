import { PORTAL_ROLE } from "./roles";

/**
 * Who may open the client portal, and which client a portal account is tied
 * to (PORTAIL.md §1 and §3) — pure, so the rules are tested without a
 * database. `portal-server.ts` loads the rows and asks these functions.
 */

/** The client row a portal account points at, as far as access is concerned. */
export type PortalClient = {
  id: string;
  name: string;
  archived: boolean;
  mergedIntoId: string | null;
};

export type PortalAccountInput = {
  role: string;
  clientId: string | null;
  client: PortalClient | null;
};

export type PortalRefusal = "NOT_CLIENT_ROLE" | "NO_CLIENT" | "CLIENT_CLOSED";

export type PortalAccess =
  | { ok: true; clientId: string; clientName: string }
  | { ok: false; reason: PortalRefusal };

/** What the portal shows (and the API answers) when it cannot open. */
export const PORTAL_REFUSAL_MESSAGES: Record<PortalRefusal, string> = {
  NOT_CLIENT_ROLE: "Accès refusé.",
  NO_CLIENT:
    "Votre compte n'est rattaché à aucun client. Contactez le laboratoire pour qu'il le rattache.",
  CLIENT_CLOSED:
    "L'accès au portail est fermé pour ce client. Contactez le laboratoire pour en savoir plus.",
};

/** True when the client may no longer open the portal: archived, or merged into another one. */
export function isClientClosed(client: Pick<PortalClient, "archived" | "mergedIntoId">): boolean {
  return client.archived || client.mergedIntoId !== null;
}

/**
 * Decides whether an account opens the portal, and on which client.
 *
 * Only `client.id` is ever used as the scope — never a client id read from a
 * request: `clientId` and `client` must agree, otherwise the account is
 * treated as unattached.
 */
export function portalAccess(account: PortalAccountInput): PortalAccess {
  if (account.role !== PORTAL_ROLE) return { ok: false, reason: "NOT_CLIENT_ROLE" };
  const { client } = account;
  if (!account.clientId || !client || client.id !== account.clientId) {
    return { ok: false, reason: "NO_CLIENT" };
  }
  if (isClientClosed(client)) return { ok: false, reason: "CLIENT_CLOSED" };
  return { ok: true, clientId: client.id, clientName: client.name };
}

/**
 * The administrator's side (PORTAIL.md §1): `User.clientId` is required for
 * the CLIENT role and forbidden for every other role, and a portal account is
 * never opened on an archived or merged client. Returns the French message of
 * the 400, or null when the pair is acceptable.
 *
 * `client` is the row found for `clientId` (null when not found or not asked).
 */
export function userClientRefusal(
  role: string,
  clientId: string | null,
  client: Pick<PortalClient, "archived" | "mergedIntoId"> | null
): string | null {
  if (role !== PORTAL_ROLE) {
    return clientId
      ? "Seul un compte « Client (portail) » est rattaché à un client."
      : null;
  }
  if (!clientId) return "Choisissez le client de ce compte portail.";
  if (!client) return "Client introuvable.";
  if (client.mergedIntoId) {
    return "Ce client a été fusionné : rattachez le compte au client conservé.";
  }
  if (client.archived) {
    return "Ce client est archivé : réactivez-le avant de lui ouvrir le portail.";
  }
  return null;
}

/**
 * Reads the optional `clientId` of an administration request: a non-empty
 * string, or null (absent, empty, or anything else).
 */
export function readClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 191 ? trimmed : null;
}

/**
 * Whether changing an account from (role, clientId) to the new pair changes
 * what it can see on the portal — then its sessions are closed at once.
 */
export function portalScopeChanged(
  before: { role: string; clientId: string | null },
  after: { role: string; clientId: string | null }
): boolean {
  const wasPortal = before.role === PORTAL_ROLE;
  const isPortal = after.role === PORTAL_ROLE;
  if (wasPortal !== isPortal) return true;
  return isPortal && before.clientId !== after.clientId;
}

/** Better Auth's default bounds on a password (`minPasswordLength` / `maxPasswordLength`). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * « Mon compte »: the body of a password change, checked before it reaches
 * Better Auth so the client reads a French message rather than a code.
 */
export function checkPortalPasswordChange(
  body: unknown
): { ok: true; currentPassword: string; newPassword: string } | { ok: false; error: string } {
  const { currentPassword, newPassword, confirmPassword } = (body ?? {}) as Record<string, unknown>;
  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    return { ok: false, error: "Saisissez votre mot de passe actuel." };
  }
  if (typeof newPassword !== "string" || newPassword.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Le nouveau mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.` };
  }
  if (newPassword.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Le nouveau mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.` };
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    return { ok: false, error: "Les deux saisies du nouveau mot de passe ne correspondent pas." };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: "Le nouveau mot de passe doit être différent de l'actuel." };
  }
  return { ok: true, currentPassword, newPassword };
}

/** Better Auth's error code of a refused password change, in French. */
export function portalPasswordErrorMessage(code: string | undefined): string {
  switch (code) {
    case "INVALID_PASSWORD":
      return "Le mot de passe actuel est incorrect.";
    case "PASSWORD_TOO_SHORT":
      return `Le nouveau mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
    case "PASSWORD_TOO_LONG":
      return `Le nouveau mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
    case "UNAUTHORIZED":
      return "Votre session a expiré. Reconnectez-vous.";
    default:
      return "Le mot de passe n'a pas pu être modifié. Réessayez.";
  }
}

/**
 * Whether a disabled account is still disabled (Better Auth admin plugin's
 * `banned` / `banExpires`): banned with no end date, or an end date still to
 * come. `getSession` (auth.ts) refuses such an account even should one of its
 * sessions have survived — a portal account of a client who left included.
 */
export function isBanActive(
  banned: boolean | null | undefined,
  banExpires: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!banned) return false;
  if (!banExpires) return true;
  const end = new Date(banExpires).getTime();
  return Number.isNaN(end) || end > now.getTime();
}

/**
 * Whether an administrator's change to an account closes all its sessions at
 * once (PATCH /api/admin/users/[id]): what a portal account sees changed
 * (`portalScopeChanged`), the account disabled, or its password reset.
 * Re-enabling an account, or moving a laboratory account between laboratory
 * roles (read again from the database on every request), keeps them.
 */
export function accountChangeClosesSessions(
  before: { role: string; clientId: string | null },
  after: { role: string; clientId: string | null },
  change: { banned?: boolean; passwordReset: boolean }
): boolean {
  return portalScopeChanged(before, after) || change.banned === true || change.passwordReset;
}
