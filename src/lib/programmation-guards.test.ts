import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * « Le responsable des paramètres gère familles et critères (et la
 * réglementation proposée d'une famille) ; le reste à l'administrateur »
 * (answer of 16/10 to Q125 — RETOUR-LABO-16-10.md F4). The four catalogue
 * routes of the familles de produits admit exactly the responsable des
 * paramètres and the administrator; the parameters, norms, profiles and
 * regulations, and the whole administration, stay the administrator's
 * alone; the bench technician is admitted to none of them.
 *
 * There is no proxy: every page and route carries its own guard, so this
 * test reads them all — the technique of direction-guards.test.ts — and
 * fails as soon as one of them moves.
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

const HANDLER = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|generateMetadata)\b|export\s+default\s+(?:async\s+)?function\b/g;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The roles of a guard's arguments — string literals only (AGENTS.md: the lists are written out). */
const literals = (args: string) => [...args.matchAll(/["']([A-Z_]+)["']/g)].map((match) => match[1]);

/** One handler (or page part) of a file, with the guards written in its body. */
type Handler = {
  /** « api/product-types/route.ts POST », « programmation/familles/page.tsx page ». */
  at: string;
  rel: string;
  name: string;
  body: string;
  /** The role list of each `requireRole` / `requireApiRole` call in the handler. */
  guards: string[][];
};

const handlers: Handler[] = files.flatMap((file) => {
  const starts = [...file.source.matchAll(HANDLER)].map((match) => ({
    index: match.index,
    name: match[1] === "generateMetadata" ? "metadata" : (match[1] ?? (file.rel.endsWith("layout.tsx") ? "layout" : "page")),
  }));
  return starts.map((start, i) => {
    const body = file.source.slice(start.index, starts[i + 1]?.index ?? file.source.length);
    const guards = [...body.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((match) => literals(match[1]));
    return { at: `${file.rel} ${start.name}`, rel: file.rel, name: start.name, body, guards };
  });
});

const at = (place: string) => {
  const found = handlers.filter((handler) => handler.at === place);
  expect(found.length, place).toBe(1);
  return found[0];
};
const sorted = (roles: string[]) => [...roles].sort();
const writes = handlers.filter((handler) => handler.rel.endsWith("route.ts") && WRITE_METHODS.has(handler.name));

/** The four catalogue routes of the familles de produits (Q125). */
const FAMILY_WRITES = [
  "api/product-types/route.ts POST",
  "api/product-types/[id]/route.ts PATCH",
  "api/product-types/[id]/criteria/route.ts PUT",
];

/** « Familles & critères », in his space. */
const FAMILY_PAGES = ["programmation/familles/page.tsx page", "programmation/familles/[id]/page.tsx page"];

/**
 * Every write the responsable des paramètres may make, written out so that
 * a change of his reach shows in a review.
 */
const PROGRAMMATEUR_WRITES = [
  // The programme d'analyse, and « Corriger les analyses » at the bench (16/10, Q128 — F8).
  "api/samples/[id]/programme/route.ts PUT",
  "api/samples/[id]/intake/route.ts PATCH",
  // The familles de produits and their criteria (16/10, Q125 — F4).
  ...FAMILY_WRITES,
  // His own password, like every laboratory account.
  "api/compte/mot-de-passe/route.ts POST",
];

/** The rest of the catalogue: the administrator's alone (Q125). */
const ADMIN_CATALOGUE = ["api/parameters/", "api/norms/", "api/profiles/", "api/regulations/", "api/lab-services/"];

describe("the familles de produits and their criteria (16/10, Q125) — read from every page and route", () => {
  it("finds the application's handlers and their guards", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(writes.length).toBeGreaterThan(50);
  });

  it("admits exactly the responsable des paramètres and the administrator on the three writes", () => {
    for (const place of FAMILY_WRITES) {
      const handler = at(place);
      expect(handler.guards.length, place).toBe(1);
      expect(sorted(handler.guards[0]), place).toEqual(["ADMIN", "PROGRAMMATEUR"]);
    }
  });

  it("opens the archived families and every client's own (`?all=1`) to exactly the same two roles", () => {
    const get = at("api/product-types/route.ts GET");
    const all = get.body.match(/const all = params\.get\("all"\) === "1" && roleAllowed\(session\.role, \[([^\]]*)\]\);/);
    expect(all, "the ?all=1 gate").not.toBeNull();
    expect(sorted(literals(all![1]))).toEqual(["ADMIN", "PROGRAMMATEUR"]);
    // Nothing else in the handler reads `all=1`.
    expect(get.body.match(/"all"/g)).toHaveLength(1);
  });

  it("opens « Familles & critères » to exactly the same two roles, behind the space's own guard", () => {
    for (const place of [...FAMILY_PAGES, "programmation/layout.tsx layout"]) {
      const handler = at(place);
      expect(handler.guards.length, place).toBe(1);
      expect(sorted(handler.guards[0]), place).toEqual(["ADMIN", "PROGRAMMATEUR"]);
    }
    // The administrator's own screens of the same list stay his.
    for (const place of ["admin/types-produits/page.tsx page", "admin/types-produits/[id]/page.tsx page"]) {
      expect(at(place).guards, place).toEqual([["ADMIN"]]);
    }
  });

  it("lets the responsable des paramètres write only the programme, the analyses, the families and his password", () => {
    const admitted = writes.filter((handler) => handler.guards.some((roles) => roles.includes("PROGRAMMATEUR"))).map((handler) => handler.at);
    expect(sorted([...new Set(admitted)])).toEqual(sorted(PROGRAMMATEUR_WRITES));
    // No write is left open to every role by an empty guard.
    expect(writes.filter((handler) => handler.guards.some((roles) => roles.length === 0)).map((handler) => handler.at)).toEqual([]);
  });

  it("keeps every write of the parameters, norms, profiles, regulations and services the administrator's alone", () => {
    const catalogue = writes.filter((handler) => ADMIN_CATALOGUE.some((prefix) => handler.rel.startsWith(prefix)));
    expect(catalogue.map((handler) => handler.at)).toEqual(
      expect.arrayContaining([
        "api/parameters/route.ts POST",
        "api/parameters/[id]/route.ts PATCH",
        "api/norms/route.ts POST",
        "api/norms/versions/[id]/route.ts PATCH",
        "api/profiles/route.ts POST",
        "api/profiles/[id]/route.ts PATCH",
        "api/regulations/route.ts POST",
        "api/regulations/[id]/route.ts PATCH",
      ])
    );
    for (const handler of catalogue) {
      expect(handler.guards.length, handler.at).toBeGreaterThan(0);
      for (const roles of handler.guards) expect(roles, handler.at).toEqual(["ADMIN"]);
    }
  });

  it("keeps the whole administration the administrator's alone: /admin and /api/admin", () => {
    const administration = handlers.filter((handler) => handler.rel.startsWith("admin/") || handler.rel.startsWith("api/admin/"));
    expect(administration.length).toBeGreaterThan(20);
    for (const handler of administration) {
      for (const roles of handler.guards) expect(roles, handler.at).toEqual(["ADMIN"]);
    }
    expect(at("admin/layout.tsx layout").guards).toEqual([["ADMIN"]]);
  });

  it("never admits the bench technician to the families, their criteria or their screens", () => {
    for (const place of [...FAMILY_WRITES, ...FAMILY_PAGES]) {
      for (const roles of at(place).guards) expect(roles, place).not.toContain("TECHNICIEN");
    }
  });
});
