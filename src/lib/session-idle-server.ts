// No "server-only" here: auth-server.ts imports this file, and prisma/seed.ts
// imports auth-server.ts outside Next.js.
import { createAuthMiddleware } from "better-auth/api";
import { serverIdleExpired, withoutCookie } from "./session-idle";

/** What the idle check reads of a session, and how it closes one (Better Auth's adapter; a stub in the tests). */
export type IdleSessionStore = {
  find(token: string): Promise<{ lastActivity: unknown; role: unknown } | null>;
  close(token: string): Promise<void>;
};

/**
 * Closes the session `token` when it has been idle past its role's bound
 * (`serverIdleExpired`, session-idle.ts). Deleted, it is signed out for every
 * reader at once: the guards of auth.ts (pages → /login, API → 401), Better
 * Auth's own endpoints, a later « Rester connecté ».
 *
 * Returns whether the session is idle — true whatever the delete did: a
 * delete that fails (a lock wait against a concurrent refresh, a dropped
 * connection) is handed to `onCloseError` and leaves the row, which the
 * caller must then refuse by itself, or the endpoint would read the row and
 * refresh it for another 35 minutes.
 */
export async function closeIdleSession(
  token: string,
  store: IdleSessionStore,
  now: number,
  onCloseError: (error: unknown) => void = () => {}
): Promise<boolean> {
  const found = await store.find(token);
  if (!found || !serverIdleExpired(found.role, found.lastActivity, now)) return false;
  try {
    await store.close(token);
  } catch (error) {
    onCloseError(error);
  }
  return true;
}

/**
 * Better Auth's `hooks.before` (auth-server.ts). It runs ahead of EVERY auth
 * endpoint, called over HTTP or as `auth.api.*` — `getSession` in auth.ts
 * behind every page and route, /api/auth/get-session (IdleLogout's touch),
 * the plugins' session endpoints — and before Better Auth's own refresh
 * would stamp the session with the request at hand: the stamp it reads is
 * the last activity, not this one. /sign-out is left alone: it deletes the
 * session anyway.
 *
 * An idle session is deleted, and the endpoint is handed the request without
 * its session cookie (Better Auth copies the returned headers onto the
 * request): it answers « signed out » even when the delete failed.
 */
export const closeIdleSessionHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === "/sign-out") return;
  const cookieName = ctx.context.authCookies.sessionToken.name;
  const token = await ctx.getSignedCookie(cookieName, ctx.context.secret);
  if (!token) return;
  const adapter = ctx.context.internalAdapter;
  const logger = ctx.context.logger;
  let idle = false;
  try {
    idle = await closeIdleSession(
      token,
      {
        find: async (sessionToken) => {
          const found = await adapter.findSession(sessionToken);
          if (!found) return null;
          return { lastActivity: found.session.updatedAt, role: (found.user as { role?: unknown }).role };
        },
        close: (sessionToken) => adapter.deleteSession(sessionToken),
      },
      Date.now(),
      (error) => logger.error("[session] fermeture après inactivité impossible — session refusée quand même", error)
    );
  } catch (error) {
    // The read failed: the endpoint reads the session again and answers
    // for itself — a database that failed here fails there too.
    logger.error("[session] contrôle d'inactivité impossible", error);
  }
  if (!idle) return;
  const cookieHeader = ctx.headers?.get("cookie") ?? ctx.request?.headers.get("cookie") ?? null;
  return { context: { headers: new Headers({ cookie: withoutCookie(cookieHeader, cookieName) }) } };
});
