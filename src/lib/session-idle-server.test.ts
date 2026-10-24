import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeIdleSession, closeIdleSessionHook, type IdleSessionStore } from "./session-idle-server";
import { revocationMarkerIdentifier } from "./session-revocation-server";

/**
 * The server's sign-out after inactivity (Q82), where it is applied: the hook
 * Better Auth runs ahead of every auth endpoint (auth-server.ts). The rule
 * itself is session-idle.test.ts; here, what the hook does with a session —
 * through its pure core with a stub store, then through Better Auth's own
 * middleware on a signed cookie, as a request carries it, then through a
 * real Better Auth instance (session-idle-flow.test.ts).
 */

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 21, 9, 0);

function storeWith(session: { lastActivity: unknown; role: unknown } | null, closeError?: Error) {
  const closed: string[] = [];
  const store: IdleSessionStore = {
    find: vi.fn(async () => session),
    close: vi.fn(async (token: string) => {
      if (closeError) throw closeError;
      closed.push(token);
    }),
  };
  return { store, closed };
}

describe("closeIdleSession — the session read refused like a signed-out one", () => {
  it("deletes a session idle past 35 minutes, and says so", async () => {
    const { store, closed } = storeWith({ lastActivity: new Date(NOW - 40 * MINUTE), role: "TECHNICIEN" });
    expect(await closeIdleSession("tok-1", store, NOW)).toBe(true);
    expect(closed).toEqual(["tok-1"]);
  });

  it("leaves a fresh one, and one used 34 minutes ago", async () => {
    for (const minutes of [0, 34]) {
      const { store, closed } = storeWith({ lastActivity: new Date(NOW - minutes * MINUTE), role: "VALIDATEUR" });
      expect(await closeIdleSession("tok-1", store, NOW)).toBe(false);
      expect(closed).toEqual([]);
    }
  });

  it("never closes the préleveur's", async () => {
    const { store, closed } = storeWith({ lastActivity: new Date(NOW - 3 * 24 * 60 * MINUTE), role: "PRELEVEUR" });
    expect(await closeIdleSession("tok-1", store, NOW)).toBe(false);
    expect(closed).toEqual([]);
  });

  it("closes the portal's client account like a laboratory post", async () => {
    const { store, closed } = storeWith({ lastActivity: new Date(NOW - 40 * MINUTE), role: "CLIENT" });
    expect(await closeIdleSession("tok-1", store, NOW)).toBe(true);
    expect(closed).toEqual(["tok-1"]);
  });

  it("does nothing for a token without a session (signed out already)", async () => {
    const { store, closed } = storeWith(null);
    expect(await closeIdleSession("tok-1", store, NOW)).toBe(false);
    expect(closed).toEqual([]);
  });

  it("still says idle when the delete fails: the caller refuses the session by itself", async () => {
    const failure = new Error("Lock wait timeout exceeded");
    const { store } = storeWith({ lastActivity: new Date(NOW - 40 * MINUTE), role: "TECHNICIEN" }, failure);
    const onCloseError = vi.fn();
    expect(await closeIdleSession("tok-1", store, NOW, onCloseError)).toBe(true);
    expect(onCloseError).toHaveBeenCalledWith(failure);
  });

  it("lets a failed read through: the endpoint reads again and answers for itself", async () => {
    const store: IdleSessionStore = { find: vi.fn(async () => Promise.reject(new Error("base indisponible"))), close: vi.fn() };
    await expect(closeIdleSession("tok-1", store, NOW)).rejects.toThrow("base indisponible");
    expect(store.close).not.toHaveBeenCalled();
  });
});

// ---- The hook itself, as Better Auth runs it --------------------------------

const SECRET = "secret-de-test-qui-ne-sert-qu-ici-0123456789";
const COOKIE = "qualilab.session_token";

/** The cookie as Better Auth signs it (better-call: `value.base64(HMAC-SHA256)`, URI-encoded). */
function signedCookie(token: string, secret = SECRET): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const adapter = {
  findSession: vi.fn(),
  deleteSession: vi.fn(async () => undefined),
  findVerificationValue: vi.fn(),
};
const logger = { error: vi.fn() };

/**
 * Runs the hook on a request carrying `cookie`, the way Better Auth's
 * dispatch does (`path`: the endpoint's; `http`: called over HTTP, as the
 * router does — the request at hand, the answer wanted as a response — not
 * as `auth.api.*`), and returns what it hands back.
 */
async function runHook(cookie: string | null, path = "/get-session", http = false) {
  const headers = new Headers(cookie ? { cookie } : {});
  return (closeIdleSessionHook as unknown as (input: unknown) => Promise<unknown>)({
    path,
    headers,
    ...(http ? { request: new Request(`http://localhost/api/auth${path}`, { headers }), asResponse: true } : {}),
    context: {
      secret: SECRET,
      authCookies: { sessionToken: { name: COOKIE } },
      internalAdapter: adapter,
      logger,
    },
  });
}

/** The `cookie` header the hook hands the endpoint, or undefined when it hands nothing. */
function cookieHandedOn(result: unknown): string | undefined {
  const headers = (result as { context?: { headers?: Headers } } | undefined)?.context?.headers;
  return headers ? (headers.get("cookie") ?? "") : undefined;
}

function sessionRow(role: string, idleMinutes: number) {
  return {
    session: { token: "tok-1", updatedAt: new Date(Date.now() - idleMinutes * MINUTE) },
    user: { id: "u-1", name: "Personne Test", role },
  };
}

beforeEach(() => {
  adapter.findSession.mockReset();
  adapter.deleteSession.mockReset();
  adapter.deleteSession.mockResolvedValue(undefined);
  adapter.findVerificationValue.mockReset();
  adapter.findVerificationValue.mockResolvedValue(null);
  logger.error.mockClear();
});

describe("closeIdleSessionHook — ahead of every auth endpoint", () => {
  it("deletes the session of the signed cookie once idle past the bound", async () => {
    adapter.findSession.mockResolvedValue(sessionRow("TECHNICIEN", 40));
    await runHook(signedCookie("tok-1"));
    expect(adapter.findSession).toHaveBeenCalledWith("tok-1");
    expect(adapter.deleteSession).toHaveBeenCalledWith("tok-1");
  });

  it("hands the endpoint the request without the session cookie, the other cookies kept", async () => {
    adapter.findSession.mockResolvedValue(sessionRow("TECHNICIEN", 40));
    const result = await runHook(`theme=clair; ${signedCookie("tok-1")}; qualilab.dont_remember=x`);
    expect(cookieHandedOn(result)).toBe("theme=clair; qualilab.dont_remember=x");
  });

  it("refuses the session even when the delete fails: the endpoint sees no cookie, the failure is logged", async () => {
    // Otherwise the endpoint would find the row, see its stamp due and
    // refresh it — the idle session revived for another 35 minutes.
    adapter.findSession.mockResolvedValue(sessionRow("VALIDATEUR", 40));
    adapter.deleteSession.mockRejectedValue(new Error("Lock wait timeout exceeded"));
    const result = await runHook(signedCookie("tok-1"));
    expect(cookieHandedOn(result)).toBe("");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("leaves a fresh session and the préleveur's, and hands nothing on", async () => {
    adapter.findSession.mockResolvedValue(sessionRow("TECHNICIEN", 5));
    expect(cookieHandedOn(await runHook(signedCookie("tok-1")))).toBeUndefined();
    adapter.findSession.mockResolvedValue(sessionRow("PRELEVEUR", 40));
    expect(cookieHandedOn(await runHook(signedCookie("tok-1")))).toBeUndefined();
    expect(adapter.findSession).toHaveBeenCalledTimes(2);
    expect(adapter.deleteSession).not.toHaveBeenCalled();
  });

  it("reads nothing on /sign-out, which deletes the session anyway", async () => {
    adapter.findSession.mockResolvedValue(sessionRow("TECHNICIEN", 40));
    expect(cookieHandedOn(await runHook(signedCookie("tok-1"), "/sign-out"))).toBeUndefined();
    expect(adapter.findSession).not.toHaveBeenCalled();
  });

  it("reads nothing without a session cookie (the sign-in page, a signed-out browser)", async () => {
    await runHook(null);
    expect(adapter.findSession).not.toHaveBeenCalled();
  });

  it("trusts no forged cookie: a wrong signature reads nothing", async () => {
    await runHook(signedCookie("tok-1", "autre-secret"));
    expect(adapter.findSession).not.toHaveBeenCalled();
    expect(adapter.deleteSession).not.toHaveBeenCalled();
  });

  it("never breaks the request: a failed read is logged, the endpoint answers for itself", async () => {
    adapter.findSession.mockRejectedValue(new Error("base indisponible"));
    expect(cookieHandedOn(await runHook(signedCookie("tok-1")))).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(adapter.deleteSession).not.toHaveBeenCalled();
  });
});

describe("closeIdleSessionHook — IdleLogout's touch on a session closed on purpose (23/10)", () => {
  // The administrator's reset, a disabling, the password changed elsewhere
  // left a marker (session-revocation.ts). Better Auth's endpoint would
  // delete the cookie that names it, and with it the reason the page guard
  // gives: the hook answers « no session » first.
  const live = () => ({ value: "PASSWORD_RESET", expiresAt: new Date(Date.now() + 3600e3) });

  it("a session gone with a live marker: answered null over HTTP, the cookie left", async () => {
    adapter.findSession.mockResolvedValue(null);
    adapter.findVerificationValue.mockResolvedValue(live());
    const result = await runHook(signedCookie("tok-1"), "/get-session", true);
    // better-call's `ctx.json(null)` for a response: the dispatch sends it as
    // is and never runs the endpoint — so no Set-Cookie clearing the session.
    expect(result).toMatchObject({ body: null, _flag: "json" });
    expect(adapter.findVerificationValue).toHaveBeenCalledWith(revocationMarkerIdentifier("tok-1"));
    expect(adapter.deleteSession).not.toHaveBeenCalled();
  });

  it("a session gone without a marker, or an expired one: the endpoint answers, as before", async () => {
    adapter.findSession.mockResolvedValue(null);
    expect(await runHook(signedCookie("tok-1"), "/get-session", true)).toBeUndefined();
    adapter.findVerificationValue.mockResolvedValue({ value: "PASSWORD_RESET", expiresAt: new Date(Date.now() - 1000) });
    expect(await runHook(signedCookie("tok-1"), "/get-session", true)).toBeUndefined();
    adapter.findVerificationValue.mockRejectedValue(new Error("base indisponible"));
    expect(await runHook(signedCookie("tok-1"), "/get-session", true)).toBeUndefined();
  });

  it("reads no marker for a live session, a server read, another endpoint or a failed session read", async () => {
    adapter.findVerificationValue.mockResolvedValue(live());
    adapter.findSession.mockResolvedValue(sessionRow("TECHNICIEN", 5));
    expect(await runHook(signedCookie("tok-1"), "/get-session", true)).toBeUndefined();
    adapter.findSession.mockResolvedValue(null);
    // A guard's `auth.api.getSession`: no cookie is set from there, and
    // `signedOutPath` reads the marker itself.
    expect(await runHook(signedCookie("tok-1"), "/get-session", false)).toBeUndefined();
    expect(await runHook(signedCookie("tok-1"), "/list-sessions", true)).toBeUndefined();
    adapter.findSession.mockRejectedValue(new Error("base indisponible"));
    expect(await runHook(signedCookie("tok-1"), "/get-session", true)).toBeUndefined();
    expect(adapter.findVerificationValue).not.toHaveBeenCalled();
  });
});
