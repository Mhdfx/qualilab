import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Lot performance, étape 3 (`.ui-tests/perf/plan.md` P2-4, P2-5, P2-6, P3-6,
 * P3-7): the server reads fewer rows in fewer round trips, with the same
 * answers. Source scans in the repository's style — the behaviour itself was
 * compared old against new on the local database when the step was built.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Perf 3 — the database reads", () => {
  it("the indexes are additive and in the schema (P2-4, P3-6)", () => {
    const schema = read("../../prisma/schema.prisma");
    for (const index of [
      "@@index([clientId, cancelled, year])",
      "@@index([clientId, cancelled, receivedAt])",
      "@@index([clientId, cancelled, siteId])",
      "@@index([actorId, createdAt])",
      "@@index([clientId, receivedAt])",
    ]) {
      expect(schema, index).toContain(index);
    }
    const migration = read("../../prisma/migrations/20261123010000_perf_index_additifs/migration.sql");
    const statements = migration
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("--"))
      .join("\n");
    expect(statements.match(/CREATE INDEX/g)).toHaveLength(5);
    expect(statements).not.toMatch(/\b(DROP|ALTER TABLE|UPDATE|DELETE|INSERT)\b/i);
  });

  it("the temperature boards read each equipment's last reading alone (P2-5)", () => {
    const loader = read("./monitored-equipment.ts");
    // No nested `take: 1`: without relation joins it read every reading.
    expect(loader).not.toMatch(/temperatures:\s*\{/);
    expect(loader).toContain("prisma.temperatureReading.findFirst({");
    expect(loader).toContain('orderBy: { readAt: "desc" },');
  });

  it("the printed bench sheet loads every sample's criteria in one batch (P2-6)", () => {
    const route = read("../app/api/bench-sheet/route.ts");
    expect(route).toContain("const benchPlans = await loadBenchPlansMany(ordered.map((row) => row.id));");
    expect(route).not.toMatch(/loadBenchPlans\(row\.id\)/);
    // One reading of the plans for every reader: the single loader is the batch's.
    const plans = read("./bench-plan.ts");
    expect(plans).toContain("return (await loadBenchPlansMany([sampleId])).get(sampleId) ?? emptyBenchPlans();");
  });

  it("the client summary counts conclusions without reading the rows it does not print (P3-6)", () => {
    const page = read("../app/commercial/[id]/page.tsx");
    expect(page).toContain("searchConclusions(summarySearch, { take: 5000 }),");
    expect(page).not.toContain("searchSamples(");
    // Same filter and order as the search: one definition.
    const server = read("./sample-search-server.ts");
    expect(server.match(/searchQuery\(search, options\)/g)).toHaveLength(2);
  });

  it("the audit journal reads only what an entry prints, beside the users (P3-6)", () => {
    const page = read("../app/admin/journal/page.tsx");
    expect(page).not.toMatch(/include:\s*\{\s*actor/);
    expect(page).toContain("loadJournal(params),");
    // The « Utilisateur » filter still only applies an existing user.
    expect(page).toContain("actorIds: knownActor ? [knownActor.id] : [],");
  });

  it("the validation page lists the regulations only to who signs now (P3-6)", () => {
    const page = read("../app/validation/[id]/page.tsx");
    expect(page).toContain("regulations={signsNow ? regulations : []}");
    // The proposal is still read from the full active list.
    expect(page).toContain("new Set(regulations.map((r) => r.id))");
    // The panel's own rule (`ValidationPanel`): the same phase and controls.
    expect(page).toContain('const signable = phase === "AT_VALIDATION" || phase === "APPROVED";');
    expect(page).toContain("validationControls(state, session.role, { validatedById: sample.validatedById, userId: session.id })");
    expect(read("../components/validation/ValidationPanel.tsx")).toContain(
      'const signable = phase === "AT_VALIDATION" || phase === "APPROVED";'
    );
  });

  it("a sample page's title shares the page's own read (P3-6)", () => {
    const validation = read("../app/validation/[id]/page.tsx");
    expect(validation).toContain("const validationSampleOf = cache((id: string) =>");
    expect(validation.match(/await validationSampleOf\(id\)/g)).toHaveLength(2);
    const programme = read("../app/programmation/[id]/page.tsx");
    expect(programme).toContain("const programmeSampleOf = cache(loadProgrammeSample);");
    expect(programme.match(/await programmeSampleOf\(id\)/g)).toHaveLength(2);
    // The bench page keeps its own read after `loadedAt` (re-ask 2.13):
    // a metadata read before it would date the sheet wrongly.
    const bench = read("../app/technicien/[id]/page.tsx");
    expect(bench.indexOf("const loadedAt = new Date().toISOString();")).toBeLessThan(
      bench.indexOf("const sample = await prisma.sample.findUnique({", bench.indexOf("export default async function"))
    );
  });
});

describe("Perf 3 — the PDF browser prewarm (P3-7)", () => {
  it("runs in production on Node only, never awaited, never failing the start", () => {
    const instrumentation = read("../instrumentation.ts");
    expect(instrumentation).toContain('process.env.NEXT_RUNTIME === "nodejs"');
    expect(instrumentation).toContain('process.env.NODE_ENV === "production"');
    expect(instrumentation).toContain('process.env.NEXT_PHASE !== "phase-production-build"');
    expect(instrumentation).toContain("warmPdfBrowser();");
    expect(instrumentation).not.toMatch(/await warmPdfBrowser/);
    const pdf = read("./pdf.ts");
    expect(pdf).toMatch(/export function warmPdfBrowser\(\): void \{\s+getBrowser\(\)\.catch\(/);
  });
});
