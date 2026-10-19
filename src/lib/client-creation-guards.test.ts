import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import { CLIENT_CREATOR_ROLES, COUNTER_CREATOR_ROLES } from "./quick-client";

/**
 * Creating a client at the counter and in the field (RETOUR-LABO-16-10.md
 * E1): the reception and the préleveur create a client — never change,
 * merge or attach one. There is no proxy: every route carries its own
 * guard, so this test reads the guards of the client routes (the technique
 * of direction-guards.test.ts) and fails as soon as a counter role reaches
 * a write it should not, or a role outside the circuit creates clients.
 */

const APP = fileURLToPath(new URL("../app", import.meta.url));
const HANDLER = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Each handler of a route file, with the role list of every guard written in its body. */
function handlersOf(rel: string): { method: string; guards: string[][] }[] {
  const source = read(rel);
  const starts = [...source.matchAll(HANDLER)];
  return starts.map((start, i) => {
    const body = source.slice(start.index, starts[i + 1]?.index ?? source.length);
    const guards = [...body.matchAll(/requireApiRole\(([^)]*)\)/g)].map((call) =>
      [...call[1].matchAll(/["']([A-Z_]+)["']/g)].map((role) => role[1])
    );
    return { method: start[1], guards };
  });
}

/** The roles the single guard of `method` in `rel` admits, sorted. */
function admitted(rel: string, method: string): string[] {
  const handler = handlersOf(rel).find((entry) => entry.method === method);
  expect(handler, `${rel} ${method}`).toBeDefined();
  expect(handler!.guards, `${rel} ${method}: one guard`).toHaveLength(1);
  return [...handler!.guards[0]].sort();
}

const sorted = (roles: readonly string[]) => [...roles].sort();

/** Every client route of the application. */
const CLIENT_ROUTES = walk(join(APP, "api", "clients"))
  .filter((path) => /(^|[\\/])route\.ts$/.test(path))
  .map((path) => relative(APP, path).split(sep).join("/"));

describe("POST /api/clients — creation, open to the counter roles (16/10, E1)", () => {
  it("admits exactly the gestionnaire, the admin, the reception and the préleveur", () => {
    expect(sorted(CLIENT_CREATOR_ROLES)).toEqual(["ADMIN", "GESTIONNAIRE", "PRELEVEUR", "RECEPTIONNISTE"]);
    expect(admitted("api/clients/route.ts", "POST")).toEqual(sorted(CLIENT_CREATOR_ROLES));
  });

  it("the near-duplicates read while typing admit the same roles", () => {
    expect(admitted("api/clients/similar/route.ts", "GET")).toEqual(sorted(CLIENT_CREATOR_ROLES));
  });

  it("reads the body for the caller's role (e-mail fields dropped, « À compléter » for the counter roles)", () => {
    expect(read("api/clients/route.ts")).toMatch(/clientCreationInput\(body, session\.role\)/);
  });

  it("« Utiliser ce client » and the next sample read the client's sites and memory, open to both counter roles", () => {
    for (const role of COUNTER_CREATOR_ROLES) {
      expect(admitted("api/clients/[id]/sites/route.ts", "GET"), role).toContain(role);
      expect(admitted("api/clients/[id]/memory/route.ts", "GET"), role).toContain(role);
    }
  });
});

describe("create only — the counter roles never change, merge or attach a client", () => {
  it("PATCH /api/clients/[id] (the fiche, the archiving) stays the gestionnaire's and the admin's", () => {
    expect(admitted("api/clients/[id]/route.ts", "PATCH")).toEqual(["ADMIN", "GESTIONNAIRE"]);
  });

  it("no write on the client routes admits them, except the creation of a client and of a site", () => {
    expect(CLIENT_ROUTES.length).toBeGreaterThan(5);
    const allowed = new Set(["api/clients/route.ts POST", "api/clients/[id]/sites/route.ts POST"]);
    const leaks: string[] = [];
    for (const rel of CLIENT_ROUTES) {
      for (const handler of handlersOf(rel)) {
        if (handler.method === "GET") continue;
        const at = `${rel} ${handler.method}`;
        for (const guard of handler.guards) {
          for (const role of COUNTER_CREATOR_ROLES) {
            if (guard.includes(role) && !allowed.has(at)) leaks.push(`${at}: ${role}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("every handler of the client routes carries a guard", () => {
    for (const rel of CLIENT_ROUTES) {
      for (const handler of handlersOf(rel)) {
        expect(handler.guards.length, `${rel} ${handler.method}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("« À compléter » (E3) — set at the creation by a counter role, cleared by a full save only", () => {
  it("the creation writes the flag clientCreationInput decides", () => {
    expect(read("api/clients/route.ts")).toMatch(/toComplete: input\.toComplete/);
  });

  it("the fiche's PATCH clears it on the save of the whole fiche, never on an archiving alone", () => {
    const source = read("api/clients/[id]/route.ts");
    const archiveOnly = source.slice(source.indexOf("Archiving is its own action"), source.indexOf("const validated = validateClient"));
    expect(archiveOnly.length).toBeGreaterThan(100);
    expect(archiveOnly).not.toMatch(/toComplete/);
    expect(source).toMatch(/toCompleteAfterSave\(existing\.toComplete, true\)/);
    expect(source).toMatch(/toComplete: completion\.toComplete/);
    expect(source).toMatch(/completion\.completed \? \{ completed: true \}/);
  });
});

describe("the technician, the Direction and the comptable never create or change a client", () => {
  const OUTSIDE = ["TECHNICIEN", "DIRECTION", "COMPTABLE"] as const;

  it("is refused the creation, the near-duplicates and the fiche", () => {
    for (const [rel, method] of [
      ["api/clients/route.ts", "POST"],
      ["api/clients/similar/route.ts", "GET"],
      ["api/clients/[id]/route.ts", "PATCH"],
    ] as const) {
      const roles = admitted(rel, method);
      for (const role of OUTSIDE) expect(roles, `${rel} ${method}`).not.toContain(role);
    }
  });

  it("is not a creator of clients (`CLIENT_CREATOR_ROLES`), nor is any role outside the list", () => {
    for (const role of ROLES) {
      const creates = (CLIENT_CREATOR_ROLES as readonly string[]).includes(role);
      expect(creates, role).toBe(["GESTIONNAIRE", "ADMIN", "RECEPTIONNISTE", "PRELEVEUR"].includes(role));
    }
  });
});
