import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { navFor } from "@/components/layout/nav-for-role";

vi.mock("server-only", () => ({}));

import { moveLegacyHistory, repointLegacySite } from "./client-transfer";
import { LEGACY_LINK_ROLES, canManageLegacyLinks, linkConflict, parseLegacyClientId, parseLinkDecision } from "./legacy-history-links";

/**
 * Lot 5B, HA6 (RETOUR-LABO-20-11.md §6) — who reaches the old software's
 * history, and that it follows its client: read from the sources, as
 * portal-guards.test.ts and client-prices-guards.test.ts do.
 *   - the portal: a CLIENT account, its own client only (`requirePortalPage`
 *     / `requirePortalApi`, then the loaders' `legacyHistoryWhere`), 404
 *     for another client's sample; the switch off: 404;
 *   - the laboratory: GESTIONNAIRE and ADMIN read (the fiche); ADMIN alone
 *     imports and links; the technician never;
 *   - a merge, « Rattacher comme site de… » and the sites import carry the
 *     history (and its links) to the kept client, in their transaction;
 *   - no price in the history (prices by role untouched).
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(SRC, "..");
const source = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const guards = (code: string) => [...code.matchAll(/require(?:Api)?Role\(([^)]*)\)/g)].map((m) => [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort());

describe("the history's guards", () => {
  it("the import and the links decided by hand: the administrator only", () => {
    const route = source("app/api/admin/import/historique/route.ts");
    expect(route).toMatch(/export async function POST\b/);
    expect(route).toMatch(/export async function GET\b/);
    expect(guards(route)).toEqual([["ADMIN"], ["ADMIN"]]);
    const links = source("app/api/admin/historique/liens/route.ts");
    expect(links).not.toMatch(/export async function (POST|PATCH|DELETE)\b/);
    // GET: the lookup before « Rattacher » (who holds the number); PUT: the decision.
    expect(links).toMatch(/export async function GET\b/);
    expect(links).toMatch(/export async function PUT\b/);
    expect(guards(links)).toEqual([["ADMIN"], ["ADMIN"]]);
    expect(source("app/admin/import/page.tsx")).toContain("<ImportLegacyHistory initialFollowUp={legacyHistory} />");
    expect(guards(source("app/admin/import/page.tsx"))).toEqual([["ADMIN"]]);
  });

  it("the laboratory's screens: the fiche's roles, GESTIONNAIRE and ADMIN — never the technician", () => {
    for (const page of ["app/commercial/[id]/historique/page.tsx", "app/commercial/[id]/historique/[sampleId]/page.tsx", "app/commercial/[id]/page.tsx"]) {
      expect(guards(source(page)), page).toEqual([["ADMIN", "GESTIONNAIRE"]]);
    }
    expect(source("app/commercial/[id]/page.tsx")).toContain("<LegacyHistoryCard");
    // Links are managed on the fiche by the administrator alone (the route refuses anyone else).
    expect(source("app/commercial/[id]/page.tsx")).toMatch(/canManageLinks=\{canManageLegacyLinks\(session\.role\) && !client\.archived\}/);
    expect([...LEGACY_LINK_ROLES]).toEqual(guards(source("app/api/admin/historique/liens/route.ts"))[0]);
    for (const role of ["ADMIN", "GESTIONNAIRE", "TECHNICIEN", "CLIENT"]) expect(canManageLegacyLinks(role), role).toBe(role === "ADMIN");
  });

  it("the portal's screens and routes: the account's own client, the switch read first", () => {
    for (const rel of ["app/portail/historique/page.tsx", "app/portail/historique/[id]/page.tsx"]) {
      const code = source(rel);
      expect(code, rel).toMatch(/const \{ access \} = await requirePortalPage\(\);/);
      expect(code, rel).toMatch(/if \(!LEGACY_HISTORY_ON_PORTAL\) notFound\(\);/);
      expect(code, rel).toMatch(/access\.clientId/);
      expect(code, rel).not.toMatch(/searchParams[^;]*client/i);
    }
    for (const rel of ["app/api/portail/historique/route.ts", "app/api/portail/historique/[id]/route.ts"]) {
      const code = source(rel);
      expect(code, rel).toMatch(/const guard = await requirePortalApi\(\);/);
      expect(code, rel).toMatch(/if \(!LEGACY_HISTORY_ON_PORTAL\) return portalNotFound\(\);/);
      expect(code, rel).toMatch(/guard\.clientId/);
    }
    expect(source("app/api/portail/historique/[id]/route.ts")).toMatch(/if \(!sample\) return portalNotFound\(\);/);
  });

  it("every loader starts from the client its caller decided (legacyHistoryWhere / legacySampleByIdWhere)", () => {
    const server = source("lib/legacy-history-server.ts");
    expect(server).toMatch(/const where = legacyHistoryWhere\(clientId, filters\);/);
    expect(server).toMatch(/where: legacySampleByIdWhere\(clientId, id\)/);
    expect(server).not.toMatch(/findUnique\(\{\s*where:\s*\{\s*id/);
  });
});

describe("the go-live purge counts the history it deletes (review of the integration, 21/11)", () => {
  it("POST /api/admin/maintenance/purge-clients: ADMIN only, its dry run lists the legacy samples and links that cascade", () => {
    const route = source("app/api/admin/maintenance/purge-clients/route.ts");
    expect(guards(route)).toEqual([["ADMIN"]]);
    expect(route).toMatch(/_count: \{ select: \{[^}]*\blegacySamples: true, legacyLinks: true \} \}/);
    // The analysis spreads the counts per client.
    expect(route).toContain("clients: clients.map((c) => ({ id: c.id, name: c.name, ...c._count })),");
  });
});

describe("the portal's menu (HA4)", () => {
  it("shows « Historique (ancien logiciel) » only to a client that has one", () => {
    const hrefs = (role: Parameters<typeof navFor>[0], options?: Parameters<typeof navFor>[1]) =>
      navFor(role, options).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs("CLIENT")).not.toContain("/portail/historique");
    expect(hrefs("CLIENT", { portalHistory: true })).toEqual(["/portail", "/portail/echantillons", "/portail/historique", "/portail/compte"]);
    // A laboratory role's menu never changes with it.
    expect(hrefs("GESTIONNAIRE", { portalHistory: true })).toEqual(hrefs("GESTIONNAIRE"));
    const layout = source("app/portail/layout.tsx");
    expect(layout).toMatch(/LEGACY_HISTORY_ON_PORTAL && access\.ok && \(await hasLegacyHistory\(access\.clientId\)\)/);
  });
});

describe("the history follows its client (HA6)", () => {
  it("a merge, « Rattacher comme site de… » and the sites import move it in their transaction", () => {
    const merge = source("app/api/clients/[id]/merge/route.ts");
    expect(merge).toContain("counts.legacySamples = (await moveLegacyHistory(tx, [sourceId], targetId)).samples;");
    // A site merged into the kept one: its history first, then the delete.
    expect(merge.indexOf("await repointLegacySite(tx, site.id, kept.id);")).toBeGreaterThan(0);
    expect(merge.indexOf("await repointLegacySite(tx, site.id, kept.id);")).toBeLessThan(merge.indexOf("await tx.site.delete({ where: { id: site.id } });"));
    // Before B is archived.
    expect(merge.indexOf("moveLegacyHistory(tx, [sourceId], targetId)")).toBeLessThan(merge.indexOf("data: { archived: true, mergedIntoId: targetId"));
    const attach = source("app/api/clients/[id]/attach-as-site/route.ts");
    expect(attach).toContain("const legacy = await moveLegacyHistory(tx, [sourceId], parentId, () => siteId);");
    expect(attach.indexOf("moveLegacyHistory(")).toBeLessThan(attach.indexOf("data: { archived: true, mergedIntoId: parentId }"));
    const sites = source("app/api/admin/import/sites/route.ts");
    expect(sites).toContain("written.legacySamples += (await moveLegacyHistory(tx, ids, parentId, siteIdFor)).samples;");
    expect(sites.indexOf("moveLegacyHistory(tx, ids, parentId, siteIdFor)")).toBeLessThan(sites.indexOf("data: { archived: true, mergedIntoId: parentId }"));
  });

  type Row = { clientId: string | null; siteId: string | null };
  function stubTx(samples: Row[], links: Row[]) {
    const apply = (rows: Row[]) =>
      vi.fn(async ({ where, data }: { where: { clientId?: string; siteId?: string | null }; data: Partial<Row> }) => {
        let count = 0;
        for (const r of rows) {
          if (where.clientId !== undefined && r.clientId !== where.clientId) continue;
          if ("siteId" in where && r.siteId !== where.siteId) continue;
          Object.assign(r, data);
          count += 1;
        }
        return { count };
      });
    return { legacySample: { updateMany: apply(samples) }, legacyClientLink: { updateMany: apply(links) } };
  }

  it("a merge: every sample and link of B goes to A, each keeping its site", async () => {
    const samples: Row[] = [
      { clientId: "B", siteId: null },
      { clientId: "B", siteId: "s1" },
      { clientId: "A", siteId: null },
    ];
    const links: Row[] = [{ clientId: "B", siteId: null }];
    const moved = await moveLegacyHistory(stubTx(samples, links) as never, ["B"], "A");
    expect(moved).toEqual({ samples: 2, links: 1 });
    expect(samples).toEqual([
      { clientId: "A", siteId: null },
      { clientId: "A", siteId: "s1" },
      { clientId: "A", siteId: null },
    ]);
  });

  it("attached as a site: B's samples without a site go onto the new site, and so do its links", async () => {
    const samples: Row[] = [
      { clientId: "B", siteId: null },
      { clientId: "B", siteId: "own" },
    ];
    const links: Row[] = [{ clientId: "B", siteId: null }];
    const moved = await moveLegacyHistory(stubTx(samples, links) as never, ["B"], "A", () => "newSite");
    expect(moved).toEqual({ samples: 2, links: 1 });
    expect(samples).toEqual([
      { clientId: "A", siteId: "newSite" },
      { clientId: "A", siteId: "own" },
    ]);
    expect(links).toEqual([{ clientId: "A", siteId: "newSite" }]);
  });

  it("does nothing for the target itself", async () => {
    const tx = stubTx([], []);
    expect(await moveLegacyHistory(tx as never, ["A"], "A")).toEqual({ samples: 0, links: 0 });
    expect(tx.legacySample.updateMany).not.toHaveBeenCalled();
  });

  it("a merged site's history follows to the kept site", async () => {
    const samples: Row[] = [{ clientId: "A", siteId: "old" }];
    const links: Row[] = [{ clientId: "A", siteId: "old" }];
    await repointLegacySite(stubTx(samples, links) as never, "old", "kept");
    expect(samples[0].siteId).toBe("kept");
    expect(links[0].siteId).toBe("kept");
  });
});

describe("a link decided by hand (PUT /api/admin/historique/liens)", () => {
  it("a fiche, or « Ne pas reprendre » (null) — a decision either way", () => {
    expect(parseLinkDecision({ legacyClientId: 2303, clientId: "c1", legacyName: " X " })).toEqual({
      legacyClientId: 2303,
      clientId: "c1",
      legacyName: "X",
      siteId: null,
      replace: false,
      expectedClientId: null,
    });
    expect(parseLinkDecision({ legacyClientId: "2303", clientId: null, expectedClientId: "c1" })).toEqual({
      legacyClientId: 2303,
      clientId: null,
      legacyName: null,
      siteId: null,
      replace: false,
      expectedClientId: "c1",
    });
    // Only a literal true moves another client's link.
    expect(parseLinkDecision({ legacyClientId: 1, clientId: "c", replace: "true" })).toMatchObject({ replace: false });
    expect(parseLinkDecision({ legacyClientId: 1, clientId: "c", replace: true })).toMatchObject({ replace: true });
  });

  it("refuses a missing decision, a bad number", () => {
    expect(parseLinkDecision({ legacyClientId: 2303 })).toHaveProperty("error");
    expect(parseLinkDecision({ legacyClientId: 2303, clientId: "" })).toHaveProperty("error");
    expect(parseLinkDecision({ legacyClientId: -1, clientId: "c" })).toHaveProperty("error");
    expect(parseLinkDecision({ legacyClientId: "12a", clientId: "c" })).toHaveProperty("error");
    expect(parseLinkDecision(null)).toHaveProperty("error");
  });

  it("another client's link is never taken silently (a mistyped number): only with `replace`, or withdrawn from its own fiche", () => {
    const decision = (over: Partial<{ clientId: string | null; replace: boolean; expectedClientId: string | null }>) => ({
      clientId: "here",
      replace: false,
      expectedClientId: null,
      ...over,
    });
    // No link yet, or « Ne pas reprendre » before: a decision, nobody's history taken.
    expect(linkConflict(null, decision({}))).toBe(false);
    expect(linkConflict({ clientId: null }, decision({}))).toBe(false);
    // Already this fiche's.
    expect(linkConflict({ clientId: "here" }, decision({}))).toBe(false);
    // Another fiche's: refused, unless the administrator saw it and confirmed moving it.
    expect(linkConflict({ clientId: "other" }, decision({}))).toBe(true);
    expect(linkConflict({ clientId: "other" }, decision({ replace: true }))).toBe(false);
    // « Ne pas reprendre » on another fiche's link: refused; from the fiche that holds it: allowed.
    expect(linkConflict({ clientId: "other" }, decision({ clientId: null, expectedClientId: "here" }))).toBe(true);
    expect(linkConflict({ clientId: "other" }, decision({ clientId: null, expectedClientId: "other" }))).toBe(false);
  });

  it("the route answers 409 on a conflict, before writing anything; the fiche looks the number up first", () => {
    const route = source("app/api/admin/historique/liens/route.ts");
    const check = route.indexOf("if (linkConflict(before, decision))");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(route.indexOf("await tx.legacyClientLink.upsert("));
    expect(route).toMatch(/status: 409/);
    const manager = readFileSync(join(SRC, "components", "legacy-history", "LegacyLinksManager.tsx"), "utf8");
    expect(manager).toContain("/api/admin/historique/liens?legacyClientId=");
    expect(manager).toMatch(/if \(typed !== null\) find\(typed\);/);
    expect(parseLegacyClientId("2303")).toBe(2303);
    expect(parseLegacyClientId("23a")).toBeNull();
    expect(parseLegacyClientId(null)).toBeNull();
  });

  it("removing a link takes its samples out of the history; re-pointing it moves them, in one transaction", () => {
    const route = source("app/api/admin/historique/liens/route.ts");
    expect(route).toMatch(/removed = \(await tx\.legacySample\.deleteMany\(\{ where: \{ legacyClientId \} \}\)\)\.count;/);
    expect(route).toMatch(/tx\.legacySample\.updateMany\(\{ where: \{ legacyClientId, clientId: \{ not: clientId \} \}, data: \{ clientId \} \}\)/);
    expect(route).toMatch(/matchedBy: "MAIN"/);
    expect(route).toMatch(/action: "LEGACY_CLIENT_LINKED"/);
  });
});

describe("no price in the history (prices by role untouched)", () => {
  it("the three tables carry no amount", () => {
    const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
    for (const model of ["LegacyClientLink", "LegacySample", "LegacyResult"]) {
      const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      expect(body, model).not.toBe("");
      expect(body, model).not.toMatch(/Decimal|price|prix|amount|montant/i);
    }
  });

  it("the extraction reads no price column, no member of the staff", () => {
    const script = readFileSync(join(ROOT, "scripts", "legacy", "extract-legacy-history.py"), "utf8");
    const sql = script.slice(script.indexOf("def main()"));
    expect(sql).not.toMatch(/\.PRIX\b|PRIX_|RECEPTEUR|PRELEVEUR|VALIDEUR|CREEPARUSER|IDUSER/);
  });
});

/** The extraction's own helpers, run by Python when it is installed (the machine of the reprise). */
const python = spawnSync("python", ["--version"], { encoding: "utf8" });
describe.skipIf(python.status !== 0)("the extraction script (Python)", () => {
  const run = (code: string) => {
    const script = join(ROOT, "scripts", "legacy", "extract-legacy-history.py").replace(/\\/g, "/");
    const out = spawnSync(
      "python",
      ["-c", `import importlib.util,json\ns=importlib.util.spec_from_file_location('h','${script}')\nh=importlib.util.module_from_spec(s)\ns.loader.exec_module(h)\n${code}`],
      { encoding: "utf8" }
    );
    expect(out.stderr).toBe("");
    return out.stdout.trim();
  };

  it("decodes the base's mixed UTF-8 / cp1252 bytes", () => {
    // « à » as raw cp1252 (0xE0) next to « ° » in UTF-8 (C2 B0), in the same text.
    expect(run("print(json.dumps(h.legacy.decode_mixed(bytes([0x37,0xE0,0x20,0x34,0x34,0xC2,0xB0,0x43]))))")).toBe('"7\\u00e0 44\\u00b0C"');
  });

  it("drops the old software's empty date and typos; keeps a real one", () => {
    expect(run("print(json.dumps([h.valid_day('1899-12-30', 2027), h.valid_day('0203-02-01', 2027), h.valid_day('2224-02-01', 2027), h.valid_day('2024-05-02', 2027)]))")).toBe(
      '[null, null, null, "2024-05-02"]'
    );
  });

  it("writes the criterion as data: n, c, m, M — absence apart", () => {
    // t: ID, param, norm, unit, order, TYPE_PM, TYPE_RESULTAT, NBR, CONTROL, VALEUR_PM, EXPM, then 3 interval lines × 6.
    const row = (typePm: string, nbr: string, control: string, l1: string[], l2: string[]) =>
      JSON.stringify(["1", "Germe", "NM", "ufc/g", "", typePm, "11", nbr, control, "", "", ...l1, ...l2, "", "", "", "", "", ""]);
    expect(run(`print(json.dumps(h.criterion_of(json.loads('${row("0", "5", "2", ["", "", "1.0000", "2", "2", ""], ["", "", "1.0000", "3", "1", ""])}'))))`)).toBe(
      '{"n": 5, "c": 2, "m": ["1", 2], "M": ["1", 3]}'
    );
    expect(run(`print(json.dumps(h.criterion_of(json.loads('${row("1", "1", "", ["", "", "", "", "", ""], ["", "", "", "", "", ""])}'))))`)).toBe('{"n": 1, "abs": 1}');
  });
});
