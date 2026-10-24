import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_LOGIN_HREF } from "./idle-policy";
import { SESSION_COOKIE_PREFIX } from "./session-idle";
import { revocationMarkerIdentifier } from "./session-revocation-server";

/**
 * A page reached after the administrator closed the session (reset,
 * disabling, a portal account's access) says why, not « inactivité »: the
 * guards of auth.ts run for real, Better Auth's session read and its
 * verification store stubbed — the marker the administrator's change left is
 * found by the token of a cookie signed with the auth secret
 * (session-revocation.ts); a forged cookie costs no read.
 */

const stubs = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly path: string) {
      super(`redirect ${path}`);
    }
  }
  return {
    Redirect,
    getSession: vi.fn(),
    findVerificationValue: vi.fn(),
    cookie: "",
    secret: "secret-de-test-qui-ne-sert-qu-ici-0123456789",
  };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers(stubs.cookie ? { cookie: stubs.cookie } : {}),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new stubs.Redirect(path);
  },
}));
vi.mock("@/lib/auth-server", () => ({
  auth: {
    api: { getSession: stubs.getSession },
    $context: Promise.resolve({
      secret: stubs.secret,
      internalAdapter: { findVerificationValue: stubs.findVerificationValue },
    }),
  },
}));

import { requireRole, signedOutPath } from "./auth";

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof stubs.Redirect) return error.path;
    throw error;
  }
}

/** The session cookie as Better Auth signs it: `<token>.<base64 HMAC-SHA256>`, URL-encoded. */
const signed = (token: string, secret = stubs.secret) =>
  encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`);
const COOKIE = `${SESSION_COOKIE_PREFIX}.session_token=${signed("tok-reset")}`;
const inAnHour = () => new Date(Date.now() + 3600e3);

beforeEach(() => {
  stubs.getSession.mockReset();
  stubs.getSession.mockResolvedValue(null);
  stubs.findVerificationValue.mockReset();
  stubs.findVerificationValue.mockResolvedValue(null);
  stubs.cookie = "";
});

describe("signedOutPath — a session the administrator closed", () => {
  it("a reset: /login?motif=reinitialisation, found by the cookie's token", async () => {
    stubs.cookie = `theme=clair; ${COOKIE}`;
    stubs.findVerificationValue.mockResolvedValue({ value: "PASSWORD_RESET:u-1", expiresAt: inAnHour() });
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBe("/login?motif=reinitialisation");
    expect(stubs.findVerificationValue).toHaveBeenCalledWith(revocationMarkerIdentifier("tok-reset"));
  });

  it("a disabling, a portal account's access: their own motif (production's __Secure- cookie too)", async () => {
    stubs.cookie = `__Secure-${COOKIE}`;
    stubs.findVerificationValue.mockResolvedValue({ value: "DISABLED:u-1", expiresAt: inAnHour() });
    expect(await signedOutPath()).toBe("/login?motif=desactivation");
    stubs.findVerificationValue.mockResolvedValue({ value: "ACCESS_CHANGED:u-1", expiresAt: inAnHour() });
    expect(await signedOutPath()).toBe("/login?motif=acces");
  });

  it("a portal page (requirePortalPage → requireRole CLIENT) says it too", async () => {
    stubs.cookie = COOKIE;
    stubs.findVerificationValue.mockResolvedValue({ value: "ACCESS_CHANGED:u-1", expiresAt: inAnHour() });
    expect(await redirectOf(requireRole("CLIENT"))).toBe("/login?motif=acces");
  });

  it("the password changed on another device: /login?motif=changement", async () => {
    stubs.cookie = COOKIE;
    stubs.findVerificationValue.mockResolvedValue({ value: "PASSWORD_CHANGED:u-1", expiresAt: inAnHour() });
    expect(await redirectOf(requireRole("PRELEVEUR"))).toBe("/login?motif=changement");
  });

  it("no marker, an expired one, or a store that fails: the idle notice, as before", async () => {
    stubs.cookie = COOKIE;
    expect(await signedOutPath()).toBe(IDLE_LOGIN_HREF);
    stubs.findVerificationValue.mockResolvedValue({ value: "PASSWORD_RESET:u-1", expiresAt: new Date(Date.now() - 1000) });
    expect(await signedOutPath()).toBe(IDLE_LOGIN_HREF);
    stubs.findVerificationValue.mockRejectedValue(new Error("base indisponible"));
    expect(await redirectOf(requireRole("RECEPTIONNISTE"))).toBe(IDLE_LOGIN_HREF);
  });

  it("an unsigned or badly signed cookie: the idle notice, as before, and no read of the store", async () => {
    stubs.findVerificationValue.mockResolvedValue({ value: "PASSWORD_RESET:u-1", expiresAt: inAnHour() });
    for (const cookie of [
      `${SESSION_COOKIE_PREFIX}.session_token=tok-reset.signature%3D`,
      `${SESSION_COOKIE_PREFIX}.session_token=tok-reset`,
      `${SESSION_COOKIE_PREFIX}.session_token=${signed("tok-reset", "un-autre-secret-0123456789abcdef")}`,
    ]) {
      stubs.cookie = cookie;
      expect(await signedOutPath(), cookie).toBe(IDLE_LOGIN_HREF);
      expect(await redirectOf(requireRole("TECHNICIEN")), cookie).toBe(IDLE_LOGIN_HREF);
    }
    expect(stubs.findVerificationValue).not.toHaveBeenCalled();
  });

  it("no session cookie: a plain /login, and no read of the store", async () => {
    expect(await signedOutPath()).toBe("/login");
    expect(stubs.findVerificationValue).not.toHaveBeenCalled();
  });

  it("a live session goes through: the store is never read", async () => {
    stubs.cookie = COOKIE;
    stubs.getSession.mockResolvedValue({
      session: { id: "s-1" },
      user: { id: "u-1", name: "Personne Test", username: "x.nom", role: "TECHNICIEN", banned: false, mustChangePassword: false },
    });
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBeNull();
    expect(stubs.findVerificationValue).not.toHaveBeenCalled();
  });
});

describe("the sign-in page shows the administrator's notice before the idle one", () => {
  it("reads revocationNoticeFor, then loginNoticeFor", () => {
    const page = readFileSync(fileURLToPath(new URL("../app/login/page.tsx", import.meta.url)), "utf8");
    expect(page).toContain("const revoked = revocationNoticeFor(motif);");
    expect(page).toContain("notice={revoked ?? loginNoticeFor(motif)}");
  });
});

describe("an open tab whose touch finds no session goes through « / »", () => {
  it("IdleLogout replaces the page with « / », whose guard says why (signedOutPath)", () => {
    // Straight to /login, the reason the cookie still tells would be lost.
    const source = readFileSync(fileURLToPath(new URL("../components/layout/IdleLogout.tsx", import.meta.url)), "utf8");
    expect(source).toContain('router.replace("/");');
    expect(source).not.toContain('router.replace("/login")');
  });
});
