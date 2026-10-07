import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PORTAIL.md §3 — the CLIENT role reaches `/portail`, `/api/portail/**`
 * and nothing else. There is no proxy: every page and route carries its own
 * guard, and `requireRole` / `requireApiRole` refuse any role they do not
 * list (a page redirects the client to /portail, an API answers 403). This
 * test reads the source of every page and route and fails as soon as one
 * of them would let a portal account in.
 */

const APP = fileURLToPath(new URL("../app", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(APP)
  .filter((path) => /(^|[\\/])(route\.ts|page\.tsx|layout\.tsx)$/.test(path))
  .map((path) => ({ rel: relative(APP, path).split(sep).join("/"), source: readFileSync(path, "utf8") }));

const isPortal = (rel: string) => rel.startsWith("portail/") || rel.startsWith("api/portail/");

/** Routes and pages that are public or only redirect by role. */
const UNGUARDED = new Set([
  "api/auth/[...all]/route.ts", // Better Auth itself
  "api/health/route.ts", // liveness probe, no data
  "layout.tsx", // the root HTML shell
  "page.tsx", // redirects to the role's home
  "login/page.tsx", // the sign-in form
]);

/** The role lists of every requireRole(...) / requireApiRole(...) call in a file. */
function guardCalls(source: string): string[] {
  return [...source.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((match) => match[1]);
}

describe("portal isolation (PORTAIL.md §3)", () => {
  it("finds the application's pages and routes", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => file.rel === "portail/page.tsx")).toBe(true);
    expect(files.some((file) => file.rel === "api/portail/echantillons/[id]/rapport/route.ts")).toBe(true);
  });

  it("guards every laboratory page and route", () => {
    const unguarded = files
      .filter((file) => !UNGUARDED.has(file.rel) && !file.rel.endsWith("layout.tsx"))
      .filter((file) => !/require(Api)?Role\(|requirePortal(Api|Page)\(/.test(file.source))
      .map((file) => file.rel);
    expect(unguarded).toEqual([]);
  });

  it("never admits CLIENT outside the portal, nor any role through an empty guard", () => {
    const leaks = files
      .filter((file) => !isPortal(file.rel))
      .flatMap((file) =>
        guardCalls(file.source)
          .filter((args) => args.trim() === "" || /["']CLIENT["']/.test(args))
          .map((args) => `${file.rel}: (${args.trim()})`)
      );
    expect(leaks).toEqual([]);
    // A guard fed by a spread list (`requireApiRole(...CIRCUIT_ROLES)`) is
    // read through its file: no laboratory page or route names CLIENT, nor
    // spreads one of the lists that contain it.
    const named = files
      .filter((file) => !isPortal(file.rel))
      .filter((file) => /["']CLIENT["']|\.\.\.(ROLES|ASSIGNABLE_ROLES)\b/.test(file.source))
      .map((file) => file.rel);
    expect(named).toEqual([]);
    const sessionOnly = files.filter((file) => !isPortal(file.rel) && /requireSession\(/.test(file.source)).map((f) => f.rel);
    expect(sessionOnly).toEqual([]);
  });

  it("admits only CLIENT inside the portal", () => {
    const portal = files.filter((file) => isPortal(file.rel));
    expect(portal.length).toBeGreaterThan(0);
    for (const file of portal) {
      for (const args of guardCalls(file.source)) {
        expect(args.trim(), file.rel).toBe('"CLIENT"');
      }
      expect(/require(Api)?Role\(|requirePortal(Api|Page)\(/.test(file.source), file.rel).toBe(true);
    }
  });

  it("guards every exported handler of every route, not just one per file", () => {
    // A file whose GET is guarded and whose POST is not would pass the
    // file-level check above: each handler's own body must call a guard.
    const handler = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s+const\s+(?:\{[^}]*\}|(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)/g;
    const guard = /require(?:Api)?Role\(|requirePortal(?:Api|Page)\(/;
    const unguarded: string[] = [];
    let handlers = 0;
    for (const file of files.filter((f) => f.rel.endsWith("route.ts") && !UNGUARDED.has(f.rel))) {
      const starts = [...file.source.matchAll(handler)];
      expect(starts.length, file.rel).toBeGreaterThan(0);
      starts.forEach((match, index) => {
        handlers += 1;
        const end = index + 1 < starts.length ? starts[index + 1].index : file.source.length;
        const body = file.source.slice(match.index, end);
        if (!guard.test(body)) unguarded.push(`${file.rel} ${match[1] ?? match[2] ?? match[0]}`);
      });
    }
    expect(handlers).toBeGreaterThan(100);
    expect(unguarded).toEqual([]);
  });

  it("closes the self-service auth endpoints that could change an account (auth-server.ts)", () => {
    const source = readFileSync(fileURLToPath(new URL("./auth-server.ts", import.meta.url)), "utf8");
    const disabled = source.match(/disabledPaths:\s*\[([^\]]*)\]/)?.[1] ?? "";
    for (const path of ["/admin/remove-user", "/update-user", "/update-session", "/change-password", "/is-username-available"]) {
      expect(disabled, path).toContain(`"${path}"`);
    }
    // The role and the client are never inputs of Better Auth's own endpoints.
    expect(source).toMatch(/role:\s*\{[^}]*input:\s*false/);
    expect(source).toMatch(/clientId:\s*\{[^}]*input:\s*false/);
  });

  it("decides every guard through roleAllowed, so an empty guard never admits CLIENT (auth.ts)", () => {
    const source = readFileSync(fileURLToPath(new URL("./auth.ts", import.meta.url)), "utf8");
    expect(source.match(/roleAllowed\(session\.role, allowed\)/g)?.length).toBe(2);
    expect(source).not.toMatch(/allowed\.length > 0 &&/);
    expect(source).toMatch(/isBanActive\(/);
  });

  it("never links the portal to the laboratory's report route", () => {
    for (const file of files.filter((f) => isPortal(f.rel))) {
      expect(file.source, file.rel).not.toMatch(/\/api\/samples\//);
    }
  });
});
