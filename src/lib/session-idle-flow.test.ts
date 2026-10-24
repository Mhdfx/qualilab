import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_ACTIVITY_UPDATE_AGE_S, SESSION_COOKIE_PREFIX } from "./session-idle";
import { closeIdleSessionHook } from "./session-idle-server";
import {
  revocationMarkerIdentifier,
  revokedSessionCause,
  verifiedSessionToken,
} from "./session-revocation-server";

/**
 * The server's sign-out after inactivity (Q82) through a real Better Auth
 * (the version the application runs), on an in-memory database: the hook of
 * auth-server.ts ahead of the session read, as `auth.api.getSession` (every
 * guard of auth.ts) and as GET /api/auth/get-session (IdleLogout's touch).
 * What is pinned here is Better Auth's side of the contract — the hook runs
 * before the endpoint, and the headers it returns replace the request's —
 * so an upgrade that changes either fails here, not in production.
 */

const MINUTE = 60_000;
const SECRET = "secret-de-test-qui-ne-sert-qu-ici-0123456789";
const ORIGIN = "http://localhost:3210";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { user: [], session: [], account: [], verification: [] };
let deleteFails = false;

const auth = betterAuth({
  database: memoryAdapter(db),
  secret: SECRET,
  baseURL: ORIGIN,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "TECHNICIEN", input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: SESSION_ACTIVITY_UPDATE_AGE_S },
  hooks: { before: closeIdleSessionHook },
  databaseHooks: {
    session: {
      delete: {
        before: async () => {
          // A lock wait against a concurrent refresh, a dropped connection.
          if (deleteFails) throw new Error("Lock wait timeout exceeded");
        },
      },
    },
  },
  advanced: { cookiePrefix: SESSION_COOKIE_PREFIX },
  logger: { disabled: true },
});

let cookie = "";

/** The one session row of the test account. */
function sessionRow(): Row | undefined {
  return db.session[0];
}

/**
 * Sets the account's role and its session's last stamp `minutes` ago — with
 * the expiry that stamp wrote (Better Auth's refresh sets both; it decides
 * the next one from the expiry).
 */
function idleFor(minutes: number, role = "TECHNICIEN") {
  db.user[0].role = role;
  const row = sessionRow();
  if (!row) throw new Error("no session");
  const stamp = Date.now() - minutes * MINUTE;
  row.updatedAt = new Date(stamp);
  row.expiresAt = new Date(stamp + 7 * 24 * 60 * MINUTE);
}

beforeAll(async () => {
  await auth.api.signUpEmail({
    body: { email: "personne.test@qualilab.local", password: "mot-de-passe-de-test", name: "Personne Test" },
  });
});

beforeEach(async () => {
  deleteFails = false;
  db.session.length = 0;
  db.verification.length = 0;
  const signedIn = await auth.api.signInEmail({
    body: { email: "personne.test@qualilab.local", password: "mot-de-passe-de-test" },
    returnHeaders: true,
  });
  const setCookie = signedIn.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE_PREFIX}.session_token=`));
  if (!setCookie) throw new Error("no session cookie");
  cookie = setCookie.split(";")[0];
  expect(db.session).toHaveLength(1);
});

const read = () => auth.api.getSession({ headers: new Headers({ cookie }) });

describe("a guard's session read (auth.api.getSession)", () => {
  it("reads a session used 5 minutes ago, and stamps it with this request", async () => {
    idleFor(5);
    const before = Date.now();
    expect((await read())?.user.name).toBe("Personne Test");
    expect((sessionRow()?.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("refuses one idle 40 minutes: no session, the row deleted", async () => {
    idleFor(40);
    expect(await read()).toBeNull();
    expect(db.session).toHaveLength(0);
  });

  it("refuses it even when the delete fails, and never refreshes it", async () => {
    idleFor(40, "VALIDATEUR");
    deleteFails = true;
    const stamp = sessionRow()?.updatedAt;
    expect(await read()).toBeNull();
    expect(db.session).toHaveLength(1);
    expect(sessionRow()?.updatedAt).toBe(stamp);
    // Still idle at the next request: refused again, not revived.
    expect(await read()).toBeNull();
  });

  it("never refuses the préleveur's, idle for days", async () => {
    idleFor(3 * 24 * 60, "PRELEVEUR");
    expect((await read())?.user.name).toBe("Personne Test");
    expect(db.session).toHaveLength(1);
  });
});

describe("IdleLogout's touch (GET /api/auth/get-session)", () => {
  const touch = () => auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie, origin: ORIGIN } }));

  it("answers the session of a page in use and stamps it", async () => {
    idleFor(3);
    const before = Date.now();
    const response = await touch();
    expect(response.status).toBe(200);
    expect(((await response.json()) as { user: { name: string } }).user.name).toBe("Personne Test");
    expect((sessionRow()?.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("answers null for one idle 40 minutes — the delete failed or not", async () => {
    idleFor(40);
    deleteFails = true;
    const response = await touch();
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    deleteFails = false;
    expect(await (await touch()).json()).toBeNull();
    expect(db.session).toHaveLength(0);
  });

  /** The Set-Cookie lines of an answer that write the session cookie (a deletion included). */
  const sessionCookieWrites = (response: Response) =>
    response.headers.getSetCookie().filter((line) => line.startsWith(`${SESSION_COOKIE_PREFIX}.session_token=`));

  it("a session closed on purpose (a marker left): null, and the cookie kept for the page guard (23/10)", async () => {
    const token = String(sessionRow()?.token);
    await (await auth.$context).internalAdapter.createVerificationValue({
      identifier: revocationMarkerIdentifier(token),
      value: "PASSWORD_RESET",
      expiresAt: new Date(Date.now() + 60 * MINUTE),
    });
    db.session.length = 0; // the administrator's reset deleted it
    const response = await touch();
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(sessionCookieWrites(response)).toEqual([]);
    // A guard's own read answers no session too.
    expect(await read()).toBeNull();
  });

  it("a session gone without a marker: null, and Better Auth clears the cookie, as before", async () => {
    db.session.length = 0;
    const response = await touch();
    expect(await response.json()).toBeNull();
    expect(sessionCookieWrites(response)).toHaveLength(1);
    expect(sessionCookieWrites(response)[0]).toMatch(/Max-Age=0/i);
  });
});

describe("a page guard's reading of Better Auth's own cookie (signedOutPath, 23/10)", () => {
  it("the token of the cookie Better Auth set, under its context's secret — none once altered or under another", async () => {
    const ctx = await auth.$context;
    expect(verifiedSessionToken(cookie, ctx.secret)).toBe(String(sessionRow()?.token));
    expect(verifiedSessionToken(cookie, "un-autre-secret-0123456789abcdef")).toBeNull();
    const eq = cookie.indexOf("=");
    const forged = `${cookie.slice(0, eq)}=${encodeURIComponent(`x${decodeURIComponent(cookie.slice(eq + 1))}`)}`;
    expect(verifiedSessionToken(forged, ctx.secret)).toBeNull();
    // Better Auth refuses it the same way.
    expect(await auth.api.getSession({ headers: new Headers({ cookie: forged }) })).toBeNull();
  });

  it("finds the marker of that session once it is gone, through Better Auth's verification store", async () => {
    const ctx = await auth.$context;
    await ctx.internalAdapter.createVerificationValue({
      identifier: revocationMarkerIdentifier(String(sessionRow()?.token)),
      value: "DISABLED:u-test",
      expiresAt: new Date(Date.now() + 60 * MINUTE),
    });
    db.session.length = 0;
    const find = (identifier: string) => ctx.internalAdapter.findVerificationValue(identifier);
    expect(await revokedSessionCause(cookie, find, ctx.secret)).toBe("DISABLED");
  });
});
