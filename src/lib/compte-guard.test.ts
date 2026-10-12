import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LAB_ROLES, PORTAL_ROLE, ROLES } from "./roles";

/**
 * « Mon compte » of the laboratory's staff (/compte and its route): every
 * laboratory role gets in, the portal's CLIENT never does — its own page is
 * /portail/compte. The guards name the roles one by one (portal-guards.test),
 * so this reads the role list of each guard call in the source.
 */

const FILES = ["../app/compte/layout.tsx", "../app/compte/page.tsx", "../app/api/compte/mot-de-passe/route.ts"];

function guardedRoles(relative: string): string[][] {
  const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  return [...source.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((match) =>
    [...match[1].matchAll(/["']([A-Z_]+)["']/g)].map((role) => role[1])
  );
}

describe("/compte — the staff's « Mon compte »", () => {
  for (const file of FILES) {
    it(`${file.replace("../app/", "")} admits each laboratory role and refuses CLIENT`, () => {
      const calls = guardedRoles(file);
      expect(calls.length, file).toBeGreaterThan(0);
      for (const roles of calls) {
        expect([...roles].sort()).toEqual([...LAB_ROLES].sort());
        expect(roles).not.toContain(PORTAL_ROLE);
      }
    });
  }

  it("covers every role of the application but the portal's", () => {
    expect(LAB_ROLES.length).toBe(ROLES.length - 1);
    expect(LAB_ROLES).not.toContain(PORTAL_ROLE);
  });
});
