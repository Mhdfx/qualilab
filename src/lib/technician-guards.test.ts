import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { navFor } from "@/components/layout/nav-for-role";
import { ROLE_HOME, roleAllowed, type Role } from "./roles";
import { FICHE_CORRECTION_ROLES, correctionRights, verbsFor } from "./sample-verbs";
import { canTransition } from "./sample-status";
import { SAMPLE_STATUS_LABELS } from "./labels";
import type { SampleStatus } from "@/generated/prisma/enums";

/**
 * « Le technicien n'a pas les droits pour changer les paramètres »
 * (RETOUR-LABO-14-10, RP3 / RP3c / C10). The bench technician takes a line,
 * types the results of the analyses programmed on it, submits them and keeps
 * the temperature readings — nothing else. A sample's analyses (« Corriger la
 * fiche »), its programme, its série and the catalogue (parameters, familles
 * and their criteria, profiles, norms and their versions, regulations,
 * services) are changed by the responsable des paramètres, the reception or
 * the administrator, never at the bench.
 *
 * There is no proxy: every page and route carries its own guard, so this
 * test reads them all — the technique of direction-guards.test.ts — and
 * fails as soon as a write, the administration or the programme lets the
 * technician in. A guard with no role at all admits every laboratory role
 * (`roleAllowed`): it is read as admitting the technician.
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

/** The roles of a guard's arguments: string literals, or a `...LIST` declared in the same file. */
function rolesOf(args: string, source: string): string[] {
  const spread = args.match(/^\s*\.\.\.([A-Z_]+)\s*$/);
  if (spread) {
    const list = source.match(new RegExp(`const\\s+${spread[1]}\\s*=\\s*\\[([^\\]]*)\\]`));
    expect(list, `list ${spread[1]}`).not.toBeNull();
    return rolesOf(list![1], source);
  }
  return [...args.matchAll(/["']([A-Z_]+)["']/g)].map((match) => match[1]);
}

/** One handler (or page part) of a file, with the guards written in its body. */
type Handler = {
  /** « api/samples/[id]/results/route.ts PUT », « admin/layout.tsx layout ». */
  at: string;
  rel: string;
  name: string;
  /** The role list of each guard call in the handler. */
  guards: string[][];
};

const handlers: Handler[] = files.flatMap((file) => {
  const starts = [...file.source.matchAll(HANDLER)].map((match) => ({
    index: match.index,
    name: match[1] === "generateMetadata" ? "metadata" : (match[1] ?? (file.rel.endsWith("layout.tsx") ? "layout" : "page")),
  }));
  return starts.map((start, i) => {
    const body = file.source.slice(start.index, starts[i + 1]?.index ?? file.source.length);
    const guards = [
      ...[...body.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((match) => rolesOf(match[1], file.source)),
      // A page's metadata decides with the same list as its guard.
      ...[...body.matchAll(/roleAllowed\(session\.role,\s*\[([^\]]*)\]\)/g)].map((match) => rolesOf(match[1], file.source)),
    ];
    return { at: `${file.rel} ${start.name}`, rel: file.rel, name: start.name, guards };
  });
});

/** Read as `requireRole` decides: an empty list admits every laboratory role. */
const admitsTechnician = (roles: string[]) => roleAllowed("TECHNICIEN", roles as Role[]);
const technicianAdmitted = (handler: Handler) => handler.guards.some(admitsTechnician);
const writes = handlers.filter((handler) => handler.rel.endsWith("route.ts") && WRITE_METHODS.has(handler.name));
const at = (place: string) => handlers.filter((handler) => handler.at === place);

/**
 * Every write the technician may make — read from the route files on 14/10,
 * written out so that a change of his reach shows in a review.
 */
const TECHNICIAN_WRITES = [
  // The bench: type the results, submit them, take a line or let it go.
  "api/samples/[id]/results/route.ts PUT",
  "api/samples/[id]/results/submit/route.ts POST",
  "api/samples/[id]/take/route.ts POST",
  "api/samples/[id]/take/route.ts DELETE",
  // The temperature readings of the equipment (/technicien/temperatures).
  "api/temperatures/route.ts POST",
  // His own password, like every laboratory account (compte-guard.test.ts).
  "api/compte/mot-de-passe/route.ts POST",
];

/** The catalogue — what « les paramètres » are made of. Never the technician's. */
const CATALOGUE_WRITES = [
  "api/parameters/route.ts POST",
  "api/parameters/[id]/route.ts PATCH",
  // The familles (product types) and their criteria.
  "api/product-types/route.ts POST",
  "api/product-types/[id]/route.ts PATCH",
  "api/product-types/[id]/criteria/route.ts PUT",
  "api/profiles/route.ts POST",
  "api/profiles/[id]/route.ts PATCH",
  "api/norms/route.ts POST",
  "api/norms/versions/[id]/route.ts PATCH",
  "api/regulations/route.ts POST",
  "api/regulations/[id]/route.ts PATCH",
  "api/lab-services/[id]/route.ts PATCH",
];

/** A sample's analyses, its programme, its série and its other steps. Never the technician's. */
const SAMPLE_WRITES = [
  // The programme d'analyse — and its referential, prices included (RP3c).
  "api/samples/[id]/programme/route.ts PUT",
  "api/samples/[id]/programme/route.ts GET",
  // « Corriger la fiche »: analyses, famille, number of units.
  "api/samples/[id]/intake/route.ts PATCH",
  // The série: written on site or at the counter, then received.
  "api/series/route.ts POST",
  "api/series/[id]/route.ts PATCH",
  "api/series/[id]/reception/route.ts POST",
  "api/samples/[id]/cancel/route.ts POST",
  "api/samples/[id]/release/route.ts POST",
  "api/samples/[id]/reactivate/route.ts POST",
  "api/samples/[id]/reopen/route.ts POST",
  "api/samples/[id]/validation/route.ts POST",
];

/** Spaces the technician never enters, pages and APIs alike. */
const CLOSED_SPACES = [
  "admin/",
  "api/admin/",
  "programmation/",
  "api/programmation/",
  "reception/",
  "preleveur/",
  "validation/",
  "qualite/",
  "commercial/",
  "comptabilite/",
  "magasin/",
  "portail/",
  "api/portail/",
  "api/invoices/",
  "api/reports/",
  "api/stock/",
  "api/suppliers/",
  "api/purchase-invoices/",
];

describe("the technician's guards (14/10) — read from every page and route", () => {
  it("finds the application's handlers and their guards", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(writes.length).toBeGreaterThan(50);
    expect(handlers.filter((handler) => handler.guards.length > 0).length).toBeGreaterThan(150);
  });

  it("reads every route: only Better Auth's catch-all exports its handlers another way", () => {
    const unread = files
      .filter((file) => file.rel.endsWith("route.ts") && !handlers.some((handler) => handler.rel === file.rel))
      .map((file) => file.rel);
    expect(unread).toEqual(["api/auth/[...all]/route.ts"]);
  });

  it("guards every write handler itself", () => {
    const unguarded = writes.filter((handler) => handler.guards.length === 0).map((handler) => handler.at);
    expect(unguarded).toEqual([]);
  });

  it("lets the technician write only his results, his lines and the temperature readings", () => {
    const admitted = writes.filter(technicianAdmitted).map((handler) => handler.at);
    expect([...new Set(admitted)].sort()).toEqual([...TECHNICIAN_WRITES].sort());
  });

  it("never lets him change the catalogue: parameters, familles and criteria, profiles, norms, regulations, services", () => {
    for (const place of CATALOGUE_WRITES) {
      const found = at(place);
      expect(found.length, place).toBeGreaterThan(0);
      for (const handler of found) expect(technicianAdmitted(handler), place).toBe(false);
    }
  });

  it("never lets him change a sample's analyses, its programme or its série", () => {
    for (const place of SAMPLE_WRITES) {
      const found = at(place);
      expect(found.length, place).toBeGreaterThan(0);
      for (const handler of found) {
        expect(handler.guards.length, place).toBeGreaterThan(0);
        expect(technicianAdmitted(handler), place).toBe(false);
      }
    }
  });

  it("never opens the administration, the programme or any other role's space", () => {
    for (const place of [
      "admin/layout.tsx layout",
      "programmation/layout.tsx layout",
      "programmation/page.tsx page",
      "programmation/[id]/page.tsx page",
      // « Familles & critères » (16/10, Q125 — RETOUR-LABO-16-10.md F4).
      "programmation/familles/page.tsx page",
      "programmation/familles/[id]/page.tsx page",
      "api/programmation/queue/route.ts GET",
    ]) {
      expect(at(place).length, place).toBeGreaterThan(0);
    }
    expect(handlers.filter((handler) => handler.rel.startsWith("api/admin/")).length).toBeGreaterThan(10);
    const leaks = handlers
      .filter((handler) => CLOSED_SPACES.some((space) => handler.rel.startsWith(space)))
      .filter(technicianAdmitted)
      .map((handler) => handler.at);
    expect(leaks).toEqual([]);
  });

  it("offers no menu entry towards the administration or the programme", () => {
    expect(ROLE_HOME.TECHNICIEN).toBe("/technicien");
    // An item without a link (a screen still to come) leads nowhere.
    const hrefs = navFor("TECHNICIEN").flatMap((section) => section.items.flatMap((item) => (item.href ? [item.href] : [])));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => /^\/(admin|programmation)(\/|$|\?|#)/.test(href))).toEqual([]);
  });
});

describe("his own writes change no analysis and no catalogue entry", () => {
  /** The text of each `.<model>.<write>(` call of a file, up to its matching parenthesis. */
  function prismaWrites(source: string) {
    const found: { model: string; call: string }[] = [];
    for (const match of source.matchAll(/\b(?:tx|prisma)\.(\w+)\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\(/g)) {
      let depth = 0;
      let end = match.index + match[0].length - 1;
      for (; end < source.length; end += 1) {
        if (source[end] === "(") depth += 1;
        if (source[end] === ")" && --depth === 0) break;
      }
      found.push({ model: match[1], call: source.slice(match.index, end + 1) });
    }
    return found;
  }

  /** The keys of the `data: { … }` object of a write. */
  function dataKeys(call: string): string[] {
    const start = call.search(/\bdata:\s*\{/);
    expect(start, call).toBeGreaterThanOrEqual(0);
    const open = call.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (; end < call.length; end += 1) {
      if (call[end] === "{") depth += 1;
      if (call[end] === "}" && --depth === 0) break;
    }
    const body = call.slice(open + 1, end);
    expect(body, call).not.toContain("...");
    return [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  }

  const ROUTES = [
    "api/samples/[id]/results/route.ts",
    "api/samples/[id]/results/submit/route.ts",
    "api/samples/[id]/take/route.ts",
    "api/temperatures/route.ts",
  ];
  /** The tables his routes write: his results, the take of a line, the readings. */
  const MODELS = new Set(["result", "resultUnit", "sample", "sampleParameter", "temperatureReading"]);
  /** What a write on the line itself may set: who holds it, since when, its step. */
  const LINE_FIELDS = new Set(["technicianId", "assignedAt", "status"]);

  for (const route of ROUTES) {
    it(`${route} writes only results, the holder and the step`, () => {
      const file = files.find((candidate) => candidate.rel === route);
      expect(file, route).toBeDefined();
      expect(file!.source, route).not.toMatch(/\$executeRaw/);
      const calls = prismaWrites(file!.source);
      expect(calls.length, route).toBeGreaterThan(0);
      for (const { model, call } of calls) {
        expect(MODELS.has(model), `${route}: ${model}`).toBe(true);
        if (model === "sample" || model === "sampleParameter") {
          // Never a parameter added or removed, never the famille, the units,
          // the norm, the dilution or the nature of a line.
          expect(call, route).not.toMatch(/\.(create|createMany|createManyAndReturn|upsert|delete|deleteMany)\(/);
          for (const key of dataKeys(call)) expect(LINE_FIELDS.has(key), `${route}: data.${key}`).toBe(true);
        }
      }
    });
  }
});

describe("the decisions behind the screens, for the technician", () => {
  const STATUSES = Object.keys(SAMPLE_STATUS_LABELS) as SampleStatus[];

  it("never offers « Corriger la fiche », the cancellation nor the reactivation", () => {
    expect(FICHE_CORRECTION_ROLES).not.toContain("TECHNICIEN");
    for (const status of STATUSES) {
      const verbs = verbsFor({ status }, "TECHNICIEN");
      // Neither half of the fiche (16/10, Q128): the identification nor the analyses.
      expect(verbs, status).toEqual({ correct: false, correctAnalyses: false, cancel: false, reactivate: false });
      expect(correctionRights("TECHNICIEN", status), status).toEqual({ identification: false, analyses: false });
    }
  });

  it("never confirms a programme, and moves a line only through the bench's two steps", () => {
    expect(canTransition("RECU", "PROGRAMME", "TECHNICIEN").ok).toBe(false);
    const allowed = STATUSES.flatMap((from) =>
      STATUSES.filter((to) => canTransition(from, to, "TECHNICIEN", "motif").ok).map((to) => `${from} → ${to}`)
    );
    expect(allowed.sort()).toEqual(["EN_ANALYSE → RESULTATS_SAISIS", "PROGRAMME → EN_ANALYSE"]);
  });
});

describe("Better Auth never lets an account raise its own role (auth-server.ts)", () => {
  const source = readFileSync(fileURLToPath(new URL("./auth-server.ts", import.meta.url)), "utf8");

  it("keeps the role out of every self-service input, and closes /update-user", () => {
    expect(source).toMatch(/role:\s*\{[^}]*input:\s*false/);
    expect(source).toMatch(/disabledPaths:\s*\[[^\]]*"\/update-user"/);
  });

  it("keeps the admin plugin's role list to ADMIN", () => {
    expect(source).toMatch(/adminRoles:\s*\["ADMIN"\]/);
  });
});
