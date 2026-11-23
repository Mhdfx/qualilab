import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RENDER_STEP, SHOWN_PARAM, capGroups, moreHref, nextStep, parseShown, showMoreLabel } from "./render-cap";

/**
 * Lot performance, step 2 — lighter pages (.ui-tests/perf/plan.md P1-6,
 * P2-2, P2-7, P2-10). Only the weight changes: the lists, their counts,
 * their order, the roles and the blind bench stay as they were. The pure
 * parts are tested here; the rest reads the sources.
 */

const read = (rel: string) => readFileSync(`${process.cwd()}/src/${rel}`, "utf8");

/** The role literals of the first `requireRole(` / `requireApiRole(` call of a source. */
function guardRoles(source: string): string[] {
  const call = source.match(/require(?:Api)?Role\(([^)]*)\)/);
  expect(call).not.toBeNull();
  return [...call![1].matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]).sort();
}

describe("render caps (P1-6, P2-10)", () => {
  it("reads `?afficher=` as a whole number of at least one step", () => {
    expect(SHOWN_PARAM).toBe("afficher");
    expect(RENDER_STEP).toBe(100);
    expect(parseShown(undefined)).toBe(100);
    expect(parseShown("")).toBe(100);
    expect(parseShown("abc")).toBe(100);
    expect(parseShown("-5")).toBe(100);
    expect(parseShown("50")).toBe(100);
    expect(parseShown("200")).toBe(200);
    expect(parseShown(["300", "400"])).toBe(300);
    expect(parseShown("9999999")).toBe(100);
    expect(parseShown("999999")).toBe(100_000);
  });

  it("words the next step: a step, or what is left", () => {
    expect(nextStep(250)).toBe(100);
    expect(nextStep(37)).toBe(37);
    expect(showMoreLabel(250)).toBe("Afficher les 100 suivants");
    expect(showMoreLabel(37)).toBe("Afficher les 37 suivants");
    expect(showMoreLabel(1)).toBe("Afficher le suivant");
  });

  it("cuts grouped rows in the order shown, keeping a group cut in the middle", () => {
    const groups = [
      { name: "A", rows: [1, 2, 3] },
      { name: "B", rows: [4, 5, 6, 7] },
      { name: "C", rows: [8, 9] },
    ];
    const cut = (limit: number) =>
      capGroups(groups, limit, (group) => group.rows, (group, rows) => ({ ...group, rows }));
    expect(cut(5)).toEqual({ groups: [{ name: "A", rows: [1, 2, 3] }, { name: "B", rows: [4, 5] }], hidden: 4 });
    expect(cut(3)).toEqual({ groups: [{ name: "A", rows: [1, 2, 3] }], hidden: 6 });
    expect(cut(100)).toEqual({ groups, hidden: 0 });
    // The groups themselves are untouched (the série heading counts its whole list).
    expect(groups[1].rows).toHaveLength(4);
  });

  it("links the next step with the page's own parameters", () => {
    expect(moreHref("/technicien", { vue: "a_prendre", age: null, tri: "" }, 100)).toBe("/technicien?vue=a_prendre&afficher=200");
    expect(moreHref("/programmation", { vue: null }, 300)).toBe("/programmation?afficher=400");
  });

  it("the programmation queue and the bench lists draw the cap after grouping, and say what is left", () => {
    for (const rel of ["components/programmation/ProgrammationQueue.tsx", "components/technicien/WorkQueue.tsx"]) {
      const source = read(rel);
      expect(source, rel).toContain("capGroups(groups, cap.limit,");
      expect(source, rel).toContain("<ShowMore shown={");
    }
    // The truncation notices still count the whole list the query read.
    expect(read("app/programmation/page.tsx")).toContain("const truncated = rows.length === QUEUE_LIMIT;");
    expect(read("app/technicien/page.tsx")).toContain("held.length === LIST_LIMIT ?");
  });
});

describe("/commercial slim (P1-6)", () => {
  it("sends neither the phone nor the postal address nor the addresses of every client", () => {
    const page = read("app/commercial/page.tsx");
    const slim = page.slice(page.indexOf("prisma.client.findMany({"), page.indexOf("orderBy: { name: \"asc\" }"));
    expect(slim).not.toContain("phone: true");
    expect(slim).not.toContain("address: true");
    expect(slim).not.toContain("emails: {");
    expect(slim).toContain("_count: { select: { samples: true, invoices: true, emails: true } }");
    // The hint is worded on the server, for the clients « À compléter » alone.
    expect(page).toContain("where: { toComplete: true, archived: false }");
    expect(page).toContain("completionHint(clientCompletionGaps(");
  });

  it("filters the whole base, then draws the first matches", () => {
    const list = read("components/clients/ClientList.tsx");
    expect(list).toContain("visible.slice(0, limit).map(");
    expect(list).toContain("total={visible.length}");
    expect(list).not.toContain("clients.slice(");
  });
});

describe("/recherche sites on demand (P2-2)", () => {
  const route = read("app/api/recherche/sites/route.ts");

  it("GET /api/recherche/sites admits exactly the roles of /recherche", () => {
    expect(guardRoles(route)).toEqual(guardRoles(read("app/recherche/page.tsx")));
    expect(guardRoles(route)).toEqual(guardRoles(read("app/recherche/layout.tsx")));
  });

  it("refuses the blind bench before reading anything", () => {
    expect(route).toMatch(/if \(benchHidesClient\(session\.role\)\) \{\s*return NextResponse\.json\(\{ error: "Accès refusé\." \}, \{ status: 403 \}\);/);
    expect(route.indexOf("benchHidesClient(session.role)")).toBeLessThan(route.indexOf("searchParams"));
  });

  it("reads only, lists the inactive sites too, and nothing but id, client, name and state", () => {
    expect(route).not.toMatch(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/);
    expect(route).not.toMatch(/where:[^}]*active/);
    expect(route).toContain("where: { clientId },");
    expect(route).toContain("select: { id: true, clientId: true, name: true, active: true },");
  });

  it("the page reads the sites of the client in its address only; the filter asks for another's", () => {
    const page = read("app/recherche/page.tsx");
    expect(page).toContain("blind || !search.clientId ? [] : prisma.site.findMany({");
    expect(page).not.toContain("{ client: { archived: false } }");
    expect(read("components/recherche/ClientSiteFilter.tsx")).toContain("/api/recherche/sites?client=${encodeURIComponent(id)}");
  });
});

describe("dashboards with their first data (P2-7)", () => {
  const first = read("lib/dashboard-first-page.ts");

  it("/admin: the API's figures and first page, for the administrator", () => {
    const page = read("app/admin/page.tsx");
    expect(page).toContain('await requireRole("ADMIN");');
    expect(page).toContain("Promise.all([loadSampleStats(), adminFirstSamples()])");
    // The stats route answers from the same function.
    expect(read("app/api/samples/stats/route.ts")).toContain("NextResponse.json(await loadSampleStats())");
    // `/api/samples` for the administrator: no préleveur or technician scope, not blind.
    expect(first).toContain("sampleSearchWhere(parseSampleSearch(new URLSearchParams()), { blind: false })");
    expect(first).toContain("select: sampleSelectFor(role),");
    const dashboard = read("components/AdminDashboard.tsx");
    expect(dashboard).not.toContain('fetch("/api/samples/stats")');
    expect(dashboard).toContain("if (loadedFor.current === search) return;");
  });

  it("/preleveur: their own visits only, as `/api/series?mine=1` forces it", () => {
    expect(read("app/preleveur/page.tsx")).toContain("preleveurFirstVisits(session, VISITS_PAGE_SIZE)");
    expect(first).toContain("where: { createdById: session.id },");
    expect(first).toContain("select: serieSelectFor(session.role),");
    expect(first).toContain("serializeSerie(row, serieStatus(row.samples))");
    expect(read("components/PreleveurDashboard.tsx")).toContain("if (loadedFor.current === key) return;");
  });
});
