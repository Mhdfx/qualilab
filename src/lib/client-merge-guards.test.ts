import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import {
  ATTACH_ROLES,
  MERGE_ROLES,
  canAttachAsSite,
  canMergeClients,
} from "@/components/commercial/client-actions-logic";

/**
 * Who merges duplicate clients (answer of 16/10, Q117 « Admin ou
 * commercial » — RETOUR-LABO-16-10.md E4): the gestionnaire commercial and
 * the administrator. « Rattacher comme site de… » stays the administrator's
 * until the laboratory confirms it (re-ask 2.5). Both are irreversible; the
 * reception and the préleveur, who may now create clients (E1), never merge
 * one. The guards are read from the routes, the page's decision from its
 * source: the three must agree.
 */

const APP = fileURLToPath(new URL("../app", import.meta.url));
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** The roles of the guard of a route's POST (string literals, as written). */
function postGuard(rel: string): string[] {
  const source = read(rel);
  const post = source.slice(source.search(/export\s+async\s+function\s+POST\b/));
  const calls = [...post.matchAll(/requireApiRole\(([^)]*)\)/g)];
  expect(calls, rel).toHaveLength(1);
  return [...calls[0][1].matchAll(/["']([A-Z_]+)["']/g)].map((match) => match[1]).sort();
}

const NEVER = ["RECEPTIONNISTE", "PRELEVEUR", "COMPTABLE", "DIRECTION", "TECHNICIEN", "VALIDATEUR", "PROGRAMMATEUR", "CLIENT", "MAGASINIER"];

describe("« Fusionner avec… » — the gestionnaire commercial and the admin (Q117)", () => {
  it("the merge route admits exactly GESTIONNAIRE and ADMIN, the list the page decides with", () => {
    expect([...MERGE_ROLES].sort()).toEqual(["ADMIN", "GESTIONNAIRE"]);
    expect(postGuard("api/clients/[id]/merge/route.ts")).toEqual([...MERGE_ROLES].sort());
  });

  it("never admits the counter roles, the comptable, the Direction or the bench", () => {
    const roles = postGuard("api/clients/[id]/merge/route.ts");
    for (const role of NEVER) expect(roles, role).not.toContain(role);
  });

  it("journals the role of who merged, beside the person", () => {
    expect(read("api/clients/[id]/merge/route.ts")).toMatch(/role: session\.role/);
  });

  it("never moves B's portal accounts (the administrator's), and the preview warns about them and A's unfrozen invoices", () => {
    const route = read("api/clients/[id]/merge/route.ts");
    expect(route).not.toMatch(/tx\.user\.(update|updateMany|delete|deleteMany)\(/);
    expect(route).toMatch(/counts\.portalAccounts = await tx\.user\.count\(\{\s*where: \{ clientId: sourceId, role: PORTAL_ROLE/);
    expect(route).toMatch(/\.\.\.portalAccountsWarning\(counts\.portalAccounts, source\.name, target\.name\)/);
    // A's own invoices before 10/10, counted before B's move in and only when B fills A's fields.
    expect(route).toMatch(/if \(Object\.keys\(fill\)\.length > 0\) \{\s*counts\.invoicesUnfrozenKept = await tx\.invoice\.count\(\{\s*where: \{ clientId: targetId, number: \{ not: null \}, clientSnapshot: \{ equals: Prisma\.AnyNull \} \}/);
    expect(route.indexOf("counts.invoicesUnfrozenKept = ")).toBeLessThan(route.indexOf("counts.invoices = (await tx.invoice.updateMany"));
    expect(route).toMatch(/\.\.\.filledFieldsInvoicesWarning\(counts\.invoicesUnfrozenKept, Object\.keys\(fill\) as FillableField\[\], source\.name, target\.name\)/);
  });
});

describe("« Rattacher comme site de… » — still the admin's alone (re-ask 2.5)", () => {
  it("the attach route admits ADMIN only, the list the page decides with", () => {
    expect([...ATTACH_ROLES]).toEqual(["ADMIN"]);
    expect(postGuard("api/clients/[id]/attach-as-site/route.ts")).toEqual(["ADMIN"]);
  });
});

describe("the client fiche offers what the routes allow", () => {
  it("canMergeClients and canAttachAsSite follow the lists, role by role", () => {
    for (const role of ROLES) {
      expect(canMergeClients(role), role).toBe((MERGE_ROLES as readonly string[]).includes(role));
      expect(canAttachAsSite(role), role).toBe((ATTACH_ROLES as readonly string[]).includes(role));
    }
    expect(canMergeClients("GESTIONNAIRE")).toBe(true);
    expect(canAttachAsSite("GESTIONNAIRE")).toBe(false);
  });

  it("/commercial/[id] shows the actions with canMergeClients, the attachment with canAttachAsSite", () => {
    const page = read("commercial/[id]/page.tsx");
    expect(page).toMatch(/canMergeClients\(session\.role\) && !client\.archived/);
    expect(page).toMatch(/canAttach=\{canAttachAsSite\(session\.role\)\}/);
    expect(page).not.toMatch(/session\.role === "ADMIN" && !client\.archived/);
  });
});
