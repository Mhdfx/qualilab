import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { BILLING_ROLES } from "./price-access";

vi.mock("server-only", () => ({}));

import { moveClientPrices } from "./client-transfer";

/**
 * Lot 4H, H5 — who reaches a client's own prices: the roles that see prices
 * (`BILLING_ROLES`, the owner's rule of 24–25/10, price-access.ts) and no
 * other; the reprise (« Importer les prix clients ») is the administrator's
 * alone. Read from the sources, as price-access-guards.test.ts does for
 * every page and route.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const source = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const guards = (code: string) => [...code.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((m) => [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort());
const billing = [...BILLING_ROLES].sort();

describe("the client prices' guards", () => {
  it("the API of a client's prices: every verb guarded by the roles that see prices and have a screen for them", () => {
    const code = source("app/api/clients/[id]/prices/route.ts");
    for (const verb of ["GET", "PUT", "DELETE"]) expect(code, verb).toMatch(new RegExp(`export async function ${verb}\\b`));
    expect(code).not.toMatch(/export async function (POST|PATCH)\b/);
    const found = guards(code);
    expect(found).toHaveLength(3);
    // The Direction sees prices by the rule, yet has no client nor invoice screen: its reach stays the validateur's (direction-guards.test.ts).
    for (const roles of found) {
      expect(roles).toEqual(["ADMIN", "COMPTABLE", "GESTIONNAIRE"]);
      for (const role of roles) expect(billing).toContain(role);
    }
  });

  it("the import of the old software's prices: the administrator only", () => {
    expect(guards(source("app/api/admin/import/prix-clients/route.ts"))).toEqual([["ADMIN"]]);
    expect(guards(source("app/admin/import/page.tsx"))).toEqual([["ADMIN"]]);
    expect(source("app/admin/import/page.tsx")).toContain("<ImportClientPrices />");
  });

  it("the screens that list them: the fiche client (GESTIONNAIRE, ADMIN) and the comptabilité's page (COMPTABLE, ADMIN)", () => {
    const fiche = source("app/commercial/[id]/page.tsx");
    expect(fiche).toContain("<ClientPricesCard");
    expect(guards(fiche)).toEqual([["ADMIN", "GESTIONNAIRE"]]);
    const compta = source("app/comptabilite/clients/[id]/prix/page.tsx");
    expect(compta).toContain("<ClientPricesCard");
    expect(guards(compta)).toEqual([["ADMIN", "COMPTABLE"]]);
    for (const roles of [...guards(fiche), ...guards(compta)]) for (const role of roles) expect(billing).toContain(role);
  });

  it("the invoice proposal reads the invoiced client's prices", () => {
    const route = source("app/api/clients/[id]/billable/route.ts");
    expect(route).toMatch(/prisma\.clientPrice\.findMany\(\{[^}]*where: \{ clientId: id, removedAt: null \},/);
    expect(route).toMatch(/proposeLines\(\s+billable,\s+catalogue,\s+clientPriceIndex\(/);
    for (const roles of guards(route)) for (const role of roles) expect(billing).toContain(role);
  });

  it("a merge, « Rattacher comme site de… » and the sites import carry the prices to the kept client", () => {
    expect(source("app/api/clients/[id]/merge/route.ts")).toContain("counts.clientPrices = await moveClientPrices(tx, [sourceId], targetId);");
    expect(source("app/api/clients/[id]/attach-as-site/route.ts")).toContain("const clientPrices = await moveClientPrices(tx, [sourceId], parentId);");
    // The import of the sites archives the clients created by mistake into their parent (lot 4H review).
    const sites = source("app/api/admin/import/sites/route.ts");
    expect(sites).toContain("written.clientPrices += await moveClientPrices(tx, ids, parentId);");
    expect(sites).toContain("written.alertCopies += await moveAlertCopies(tx, ids, parentId);");
    // Both before the clients are archived into the parent.
    expect(sites.indexOf("moveClientPrices(tx, ids, parentId)")).toBeLessThan(sites.indexOf("data: { archived: true, mergedIntoId: parentId }"));
  });

  it("a price removed by hand is never read again, and a price of the old software is remembered, not deleted", () => {
    const route = source("app/api/clients/[id]/prices/route.ts");
    expect(route).toMatch(/const remembered = price\.legacyPriceId !== null;/);
    expect(route).toMatch(/data: \{ removedAt: new Date\(\), updatedById: session\.id \}/);
    // Typed again: the mark is cleared.
    expect(route).toMatch(/update: \{ unitPrice, origin: "SAISIE", updatedById: session\.id, removedAt: null \}/);
    // Every reader skips it: the fiche's list, the invoice proposal, the programme sheet; the import's update never touches it.
    expect(source("lib/client-prices-server.ts")).toMatch(/where: \{ clientId, removedAt: null \}/);
    expect(source("lib/programme-referential.ts")).toMatch(/where: \{ clientId: billedClientId, removedAt: null \}/);
    expect(source("app/api/admin/import/prix-clients/route.ts")).toMatch(/where: \{ id: w\.existingId!, origin: "REPRISE", removedAt: null \}/);
  });
});

describe("moveClientPrices", () => {
  type Row = { clientId: string; itemKey: string; removedAt?: Date | null };
  type Where = { clientId: string; itemKey: { notIn: string[] }; removedAt?: null | { not: null } };
  const removedMatches = (r: Row, filter: Where["removedAt"]) =>
    filter === undefined ? true : filter === null ? !r.removedAt : Boolean(r.removedAt);
  function stubTx(rows: Row[]) {
    return {
      clientPrice: {
        findMany: vi.fn(async ({ where }: { where: { clientId: string } }) => rows.filter((r) => r.clientId === where.clientId).map(({ itemKey }) => ({ itemKey }))),
        updateMany: vi.fn(async ({ where, data }: { where: Where; data: { clientId: string } }) => {
          let count = 0;
          for (const r of rows) {
            if (r.clientId === where.clientId && !where.itemKey.notIn.includes(r.itemKey) && removedMatches(r, where.removedAt)) {
              r.clientId = data.clientId;
              count += 1;
            }
          }
          return { count };
        }),
      },
    };
  }

  it("moves the source's prices, keeps the target's own for the same item, the first source winning", async () => {
    const rows: Row[] = [
      { clientId: "A", itemKey: "P:ecoli" },
      { clientId: "B", itemKey: "P:ecoli" },
      { clientId: "B", itemKey: "P:salmo" },
      { clientId: "C", itemKey: "P:salmo" },
      { clientId: "C", itemKey: "S:prelevement" },
    ];
    const tx = stubTx(rows);
    const moved = await moveClientPrices(tx as never, ["B", "C", "A"], "A");
    expect(moved).toBe(2);
    expect(rows).toEqual([
      { clientId: "A", itemKey: "P:ecoli" },
      { clientId: "B", itemKey: "P:ecoli" },
      { clientId: "A", itemKey: "P:salmo" },
      { clientId: "C", itemKey: "P:salmo" },
      { clientId: "A", itemKey: "S:prelevement" },
    ]);
  });

  it("a price removed by hand follows as the reprise's memory, but is not counted as a price moved", async () => {
    const removedAt = new Date("2026-11-05T10:00:00Z");
    const rows: Row[] = [
      { clientId: "B", itemKey: "P:ecoli", removedAt },
      { clientId: "B", itemKey: "P:salmo", removedAt: null },
    ];
    const moved = await moveClientPrices(stubTx(rows) as never, ["B"], "A");
    expect(moved).toBe(1);
    expect(rows.map((r) => r.clientId)).toEqual(["A", "A"]);
  });

  it("does nothing without another source", async () => {
    const tx = stubTx([]);
    expect(await moveClientPrices(tx as never, ["A"], "A")).toBe(0);
    expect(tx.clientPrice.findMany).not.toHaveBeenCalled();
  });
});
