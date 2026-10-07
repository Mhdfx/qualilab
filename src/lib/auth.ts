import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { isBanActive } from "@/lib/portal-access";
import { getDashboardPath, isRole, roleAllowed, type Role } from "@/lib/roles";

export type { Role };
export { getDashboardPath };

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
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
  };
}

/**
 * Page guard: returns the session or redirects.
 *
 * - not signed in            → /login
 * - signed in, wrong role    → their own dashboard (never a dead end)
 *
 * Without roles, any laboratory account passes — never a portal (CLIENT)
 * account, which only ever opens /portail (PORTAIL.md §3, `roleAllowed`).
 */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roleAllowed(session.role, allowed)) {
    redirect(getDashboardPath(session.role));
  }
  return session;
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
 */
export async function requireApiRole(
  ...allowed: Role[]
): Promise<SessionUser | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!roleAllowed(session.role, allowed)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  return session;
}
