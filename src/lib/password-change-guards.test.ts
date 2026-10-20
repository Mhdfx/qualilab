import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1) — the one place
 * it is enforced: the guards of auth.ts. The guards run here for real, on a
 * session Better Auth would return (its `getSession` and Next's request
 * helpers are stubbed); then the sources are read, so no page or route of
 * the application reaches its data without going through them.
 */

const stubs = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly path: string) {
      super(`redirect ${path}`);
    }
  }
  return { Redirect, getSession: vi.fn() };
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new stubs.Redirect(path);
  },
}));
vi.mock("@/lib/auth-server", () => ({ auth: { api: { getSession: stubs.getSession } } }));

import { getSession, passwordChangeGuards, requireApiRole, requireRole } from "./auth";

/** What Better Auth's session read returns for an account (additional fields included). */
function signedIn(role: string, mustChangePassword: boolean | null | undefined, extra: Record<string, unknown> = {}) {
  stubs.getSession.mockResolvedValue({
    session: { id: "s-1" },
    user: { id: "u-1", name: "Personne Test", username: "x.nom", role, banned: false, banExpires: null, mustChangePassword, ...extra },
  });
}

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof stubs.Redirect) return error.path;
    throw error;
  }
}

async function answer(result: unknown): Promise<{ status: number; error: string } | "SESSION"> {
  if (!(result instanceof NextResponse)) return "SESSION";
  return { status: result.status, error: ((await result.json()) as { error: string }).error };
}

const PASSWORD_403 = { status: 403, error: "Choisissez d'abord votre mot de passe (Mon compte)." };

beforeEach(() => {
  stubs.getSession.mockReset();
});

describe("getSession", () => {
  it("is handed the flag by Better Auth's session read (auth-server.ts)", () => {
    // The stub above returns the field itself; the real session read carries
    // it only because auth-server.ts declares it among the additional
    // fields. Without that declaration every session reads it as false and
    // every guard lets the account through, while the column is still set.
    const authServer = readFileSync(fileURLToPath(new URL("./auth-server.ts", import.meta.url)), "utf8");
    expect(authServer).toMatch(/mustChangePassword:\s*\{[^}]*type:\s*"boolean"[^}]*defaultValue:\s*false[^}]*input:\s*false/);
  });

  it("carries the flag read with the session", async () => {
    signedIn("TECHNICIEN", true);
    expect(await getSession()).toEqual({
      id: "u-1",
      username: "x.nom",
      name: "Personne Test",
      role: "TECHNICIEN",
      mustChangePassword: true,
    });
  });

  it("reads an absent flag as false (accounts created before H1, seeded accounts)", async () => {
    for (const flag of [false, null, undefined]) {
      signedIn("TECHNICIEN", flag);
      expect((await getSession())?.mustChangePassword).toBe(false);
    }
  });

  it("still refuses a disabled account, flagged or not", async () => {
    signedIn("TECHNICIEN", true, { banned: true });
    expect(await getSession()).toBeNull();
  });
});

describe("requireRole — every page", () => {
  it("sends an account whose password must be changed to « Mon compte », whatever the page", async () => {
    signedIn("TECHNICIEN", true);
    expect(await redirectOf(requireRole("TECHNICIEN", "ADMIN"))).toBe("/compte");
    // A page of another role too: « Mon compte » first, not the dashboard.
    expect(await redirectOf(requireRole("COMPTABLE", "ADMIN"))).toBe("/compte");
    expect(await redirectOf(requireRole())).toBe("/compte");
  });

  it("does the same on the préleveur's phone pages", async () => {
    signedIn("PRELEVEUR", true);
    expect(await redirectOf(requireRole("PRELEVEUR"))).toBe("/compte");
  });

  it("sends a client's account to the portal's « Mon compte »", async () => {
    signedIn("CLIENT", true);
    expect(await redirectOf(requireRole("CLIENT"))).toBe("/portail/compte");
    expect(await redirectOf(requireRole("ADMIN"))).toBe("/portail/compte");
  });

  it("changes nothing for an account whose password is its own", async () => {
    signedIn("TECHNICIEN", false);
    expect(await redirectOf(requireRole("TECHNICIEN", "ADMIN"))).toBeNull();
    expect(await redirectOf(requireRole("COMPTABLE"))).toBe("/technicien");
    stubs.getSession.mockResolvedValue(null);
    expect(await redirectOf(requireRole("TECHNICIEN"))).toBe("/login");
  });
});

describe("requireApiRole — every route", () => {
  it("answers 403 while the password must be changed, the role allowed or not", async () => {
    signedIn("TECHNICIEN", true);
    expect(await answer(await requireApiRole("TECHNICIEN", "ADMIN"))).toEqual(PASSWORD_403);
    expect(await answer(await requireApiRole("COMPTABLE"))).toEqual(PASSWORD_403);
    signedIn("PRELEVEUR", true);
    expect(await answer(await requireApiRole("PRELEVEUR"))).toEqual(PASSWORD_403);
    signedIn("CLIENT", true);
    expect(await answer(await requireApiRole("CLIENT"))).toEqual(PASSWORD_403);
  });

  it("changes nothing for an account whose password is its own", async () => {
    signedIn("TECHNICIEN", false);
    expect(await answer(await requireApiRole("TECHNICIEN"))).toBe("SESSION");
    expect(await answer(await requireApiRole("COMPTABLE"))).toEqual({ status: 403, error: "Accès refusé." });
    stubs.getSession.mockResolvedValue(null);
    expect(await answer(await requireApiRole("TECHNICIEN"))).toEqual({ status: 401, error: "Non autorisé." });
  });
});

describe("passwordChangeGuards — « Mon compte » and the password change only", () => {
  it("let an account whose password must be changed through, with its flag", async () => {
    signedIn("TECHNICIEN", true);
    const session = await passwordChangeGuards.requireRole("TECHNICIEN", "ADMIN");
    expect(session.mustChangePassword).toBe(true);
    expect(await answer(await passwordChangeGuards.requireApiRole("TECHNICIEN", "ADMIN"))).toBe("SESSION");
  });

  it("keep their roles: a client's account on the staff's « Mon compte » goes to its own", async () => {
    signedIn("CLIENT", true);
    expect(await redirectOf(passwordChangeGuards.requireRole("TECHNICIEN"))).toBe("/portail/compte");
    expect(await answer(await passwordChangeGuards.requireApiRole("TECHNICIEN"))).toEqual({
      status: 403,
      error: "Accès refusé.",
    });
    signedIn("CLIENT", false);
    expect(await redirectOf(passwordChangeGuards.requireRole("TECHNICIEN"))).toBe("/portail");
    stubs.getSession.mockResolvedValue(null);
    expect(await redirectOf(passwordChangeGuards.requireRole("TECHNICIEN"))).toBe("/login");
    expect(await answer(await passwordChangeGuards.requireApiRole("CLIENT"))).toEqual({ status: 401, error: "Non autorisé." });
  });
});

// ---- The sources: nothing bypasses the guards --------------------------------

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const sources = walk(SRC).map((path) => ({
  rel: relative(SRC, path).split(sep).join("/"),
  source: readFileSync(path, "utf8"),
}));
const appEntries = sources.filter((file) => /^app\/(.+\/)?(route\.ts|page\.tsx|layout\.tsx)$/.test(file.rel));

/** Public, or only redirecting by the session (through `landingPath`). */
const UNGUARDED = new Set(["app/api/auth/[...all]/route.ts", "app/api/health/route.ts", "app/layout.tsx", "app/page.tsx", "app/login/page.tsx"]);

describe("the screens that admit a password still to change", () => {
  it("are « Mon compte » and the password change, nothing else", () => {
    const admitting = sources
      .filter((file) => file.rel !== "lib/auth.ts")
      .filter((file) => /passwordChangeGuards\.|allowsPasswordChange:\s*true/.test(file.source))
      .map((file) => file.rel)
      .sort();
    expect(admitting).toEqual(
      [
        "app/api/compte/mot-de-passe/route.ts",
        "app/api/portail/compte/mot-de-passe/route.ts",
        "app/compte/layout.tsx",
        "app/compte/page.tsx",
        // Frames /portail/compte; each portal page stops the account itself.
        "app/portail/compte/page.tsx",
        "app/portail/layout.tsx",
        // `requirePortalPage({ allowsPasswordChange })`, the portal's door to them.
        "lib/portal-server.ts",
      ].sort()
    );
  });

  it("every other portal page calls requirePortalPage() without the exemption", () => {
    const portalPages = appEntries.filter((file) => /^app\/portail\/(.+\/)?page\.tsx$/.test(file.rel));
    expect(portalPages.length).toBeGreaterThan(2);
    for (const file of portalPages.filter((f) => f.rel !== "app/portail/compte/page.tsx")) {
      expect(file.source, file.rel).toMatch(/requirePortalPage\(\)/);
    }
  });
});

describe("no page or route reaches its data around the guards", () => {
  it("every page, layout and route goes through a guard of auth.ts (or the portal's, built on them)", () => {
    expect(appEntries.length).toBeGreaterThan(100);
    const unguarded = appEntries
      .filter((file) => !UNGUARDED.has(file.rel))
      .filter((file) => !/require(Api)?Role\(|requirePortal(Api|Page)\(/.test(file.source))
      .map((file) => file.rel);
    expect(unguarded).toEqual([]);
  });

  it("only auth.ts reads Better Auth's session for a decision", () => {
    // portal-server.ts reads it after the guard, for the session id of the
    // portal's login journal only.
    const readers = sources
      .filter((file) => /auth\.api\.getSession\(/.test(file.source))
      .map((file) => file.rel)
      .sort();
    expect(readers).toEqual(["lib/auth.ts", "lib/portal-server.ts"]);
  });

  it("a direct getSession() either lands through landingPath or keeps the flagged account out", () => {
    const callers = sources.filter((file) => file.rel.startsWith("app/") && /\bgetSession\(\)/.test(file.source));
    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers) {
      const lands = /redirect\(landingPath\(session\)\)/.test(file.source);
      const keepsOut = /session\.mustChangePassword\s*\|\|/.test(file.source);
      expect(lands || keepsOut, file.rel).toBe(true);
    }
  });

  it("the root and the sign-in page land through landingPath, never straight on the dashboard", () => {
    for (const rel of ["app/page.tsx", "app/login/page.tsx"]) {
      const file = sources.find((candidate) => candidate.rel === rel);
      expect(file?.source, rel).toMatch(/redirect\(landingPath\(session\)\)/);
      expect(file?.source, rel).not.toMatch(/getDashboardPath\(/);
    }
  });
});
