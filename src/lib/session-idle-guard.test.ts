import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { IDLE_LOGIN_HREF, loginNoticeFor } from "./idle-policy";
import { SESSION_COOKIE_PREFIX } from "./session-idle";

/**
 * A page reached after the server closed the session for inactivity
 * (session-idle-server.ts) says why: the guards of auth.ts run for real,
 * Better Auth's session read and Next's request helpers stubbed — the
 * request's `cookie` header is what the browser still sends.
 */

const stubs = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly path: string) {
      super(`redirect ${path}`);
    }
  }
  return { Redirect, getSession: vi.fn(), cookie: "" };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers(stubs.cookie ? { cookie: stubs.cookie } : {}),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new stubs.Redirect(path);
  },
}));
vi.mock("@/lib/auth-server", () => ({ auth: { api: { getSession: stubs.getSession } } }));

import { requireApiRole, requireRole, requireSession, signedOutPath } from "./auth";

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof stubs.Redirect) return error.path;
    throw error;
  }
}

const TOKEN = `${SESSION_COOKIE_PREFIX}.session_token=tok-1.signature%3D`;

beforeEach(() => {
  stubs.getSession.mockReset();
  stubs.getSession.mockResolvedValue(null);
  stubs.cookie = "";
});

describe("guardPage — where a page sends a request without a session", () => {
  it("the session cookie still sent, no session behind it: /login?motif=inactivite", async () => {
    stubs.cookie = `theme=clair; ${TOKEN}`;
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBe(IDLE_LOGIN_HREF);
    expect(await redirectOf(requireSession())).toBe(IDLE_LOGIN_HREF);
    expect(loginNoticeFor(new URL(IDLE_LOGIN_HREF, "http://x").searchParams.get("motif"))).toBe(
      "Session fermée après inactivité."
    );
  });

  it("the same in production, where the cookie is __Secure-", async () => {
    stubs.cookie = `__Secure-${TOKEN}`;
    expect(await redirectOf(requireRole("RECEPTIONNISTE"))).toBe(IDLE_LOGIN_HREF);
  });

  it("no session cookie (never signed in, « Déconnexion »): a plain /login", async () => {
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBe("/login");
    stubs.cookie = "theme=clair";
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBe("/login");
  });

  it("a signed-in session goes through as before", async () => {
    stubs.cookie = TOKEN;
    stubs.getSession.mockResolvedValue({
      session: { id: "s-1" },
      user: { id: "u-1", name: "Personne Test", username: "x.nom", role: "TECHNICIEN", banned: false, mustChangePassword: false },
    });
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBeNull();
  });

  it("the API guard still answers 401, cookie or not", async () => {
    stubs.cookie = TOKEN;
    const answer = await requireApiRole("TECHNICIEN");
    expect(answer).toBeInstanceOf(NextResponse);
    expect((answer as NextResponse).status).toBe(401);
  });
});

describe("« / » without a session — the same notice as the guards", () => {
  it("signedOutPath: the cookie still sent → the notice, none → a plain /login", async () => {
    stubs.cookie = TOKEN;
    expect(await signedOutPath()).toBe(IDLE_LOGIN_HREF);
    stubs.cookie = "";
    expect(await signedOutPath()).toBe("/login");
  });

  it("the root page sends a request without a session through signedOutPath", () => {
    const source = readFileSync(fileURLToPath(new URL("../app/page.tsx", import.meta.url)), "utf8");
    expect(source).toMatch(/redirect\(await signedOutPath\(\)\)/);
    expect(source).not.toMatch(/redirect\("\/login"\)/);
  });
});
