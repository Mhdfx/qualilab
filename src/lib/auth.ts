import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { isBanActive } from "@/lib/portal-access";
import {
  PASSWORD_CHANGE_API_ERROR,
  accountPath,
  landingPath,
  passwordChangeBlocks,
} from "@/lib/password-change";
import { getDashboardPath, isRole, roleAllowed, type Role } from "@/lib/roles";

export type { Role };
export { getDashboardPath, landingPath };

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  /**
   * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1): the
   * administrator created the account or reset its password. Until the person
   * chooses their own, the guards below open « Mon compte » only.
   */
  mustChangePassword: boolean;
};

/**
 * Current session, or null. Safe to call from any server component or route.
 *
 * Authorization rule for the whole app: never trust the client. Every page and
 * every route handler resolves the session here and goes through one of the
 * guards below — hiding a control in the UI is not access control.
 */
export async function getSession(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    username?: string | null;
    role?: string | null;
    banned?: boolean | null;
    banExpires?: Date | string | null;
    mustChangePassword?: boolean | null;
  };
  if (!isRole(user.role)) return null;
  // A disabled account is out at once, even should a session have survived
  // the ban (PATCH /api/admin/users/[id] deletes them; this is the backstop).
  if (isBanActive(user.banned, user.banExpires)) return null;

  return {
    id: user.id,
    username: user.username ?? "",
    name: user.name ?? "",
    role: user.role,
    // Read with the session, in the same query (a Better Auth additional
    // field, auth-server.ts): never stale, never an extra round trip.
    mustChangePassword: user.mustChangePassword === true,
  };
}

/**
 * What a guard lets through besides its roles. Every guard but the ones of
 * « Mon compte » and of the password change (`passwordChangeGuards`) stops
 * an account whose password must be changed.
 */
type GuardScope = { allowsPasswordChange: boolean };

const EVERY_SCREEN: GuardScope = { allowsPasswordChange: false };
const PASSWORD_CHANGE_SCREEN: GuardScope = { allowsPasswordChange: true };

/** The one page guard behind `requireRole` and `passwordChangeGuards.requireRole`. */
async function guardPage(allowed: readonly Role[], scope: GuardScope): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (passwordChangeBlocks(session, scope)) redirect(accountPath(session.role));
  if (!roleAllowed(session.role, allowed)) {
    // Their own dashboard — or their « Mon compte » while the password must
    // be changed (`landingPath`), so a wrong role never costs a second hop.
    redirect(landingPath(session));
  }
  return session;
}

/** The one API guard behind `requireApiRole` and `passwordChangeGuards.requireApiRole`. */
async function guardApi(allowed: readonly Role[], scope: GuardScope): Promise<SessionUser | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (passwordChangeBlocks(session, scope)) {
    return NextResponse.json({ error: PASSWORD_CHANGE_API_ERROR }, { status: 403 });
  }
  if (!roleAllowed(session.role, allowed)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  return session;
}

/**
 * Page guard: returns the session or redirects.
 *
 * - not signed in                → /login
 * - password to change (Q81)     → « Mon compte » (/compte, /portail/compte)
 * - signed in, wrong role        → their own dashboard (never a dead end)
 *
 * Without roles, any laboratory account passes — never a portal (CLIENT)
 * account, which only ever opens /portail (PORTAIL.md §3, `roleAllowed`).
 */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  return guardPage(allowed, EVERY_SCREEN);
}

/** Page guard for screens any laboratory account may open (never the portal's). */
export async function requireSession(): Promise<SessionUser> {
  return requireRole();
}

/**
 * API guard. Returns either the session or the response to return as-is
 * (without roles: any laboratory account, never a portal one):
 *
 *   const guard = await requireApiRole("TECHNICIEN");
 *   if (guard instanceof NextResponse) return guard;
 *
 * 401 signed out; 403 « Choisissez d'abord votre mot de passe (Mon compte). »
 * while the password must be changed (Q81); 403 « Accès refusé. » for a
 * role it does not list.
 */
export async function requireApiRole(
  ...allowed: Role[]
): Promise<SessionUser | NextResponse> {
  return guardApi(allowed, EVERY_SCREEN);
}

/**
 * The guards of « Mon compte » and of the password change only — the
 * screens an account whose password must be changed may still open (Q81):
 * /compte (layout and page), /portail/compte and the portal's layout around
 * it (`requirePortalPage({ allowsPasswordChange: true })`),
 * POST /api/compte/mot-de-passe and POST /api/portail/compte/mot-de-passe.
 * Same roles, same answers as `requireRole` / `requireApiRole` otherwise.
 * `password-change-guards.test.ts` pins that no other file uses them.
 */
export const passwordChangeGuards = {
  requireRole: (...allowed: Role[]): Promise<SessionUser> => guardPage(allowed, PASSWORD_CHANGE_SCREEN),
  requireApiRole: (...allowed: Role[]): Promise<SessionUser | NextResponse> =>
    guardApi(allowed, PASSWORD_CHANGE_SCREEN),
} as const;
