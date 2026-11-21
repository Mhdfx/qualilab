import { describe, expect, it } from "vitest";
import {
  HistoryClientResolver,
  legacyResultRows,
  legacySampleRow,
  lineHash,
  monthPlanWrites,
  planLegacyClientLinks,
  planLegacyMonth,
  readHistoryFile,
  readLegacyClients,
  type ExistingLegacySample,
  type HistoryClient,
  type LinkTarget,
  type ParsedHistoryFile,
  type SiteByLegacy,
} from "./legacy-history-import";

/**
 * Lot 5B, HA3 (RETOUR-LABO-20-11.md §6) — « Importer l'historique de l'ancien
 * logiciel »: a client's history reaches a client of ours only through a
 * certain match or a decision by hand; the same file twice writes nothing;
 * a line changed in the old software is rewritten; a sample without a link
 * is never written.
 */

const client = (id: string, name: string, extra: Partial<HistoryClient> = {}): HistoryClient => ({
  id,
  name,
  ice: null,
  archived: false,
  mergedIntoId: null,
  ...extra,
});

describe("step 1 — matching the old software's clients", () => {
  const clients = [
    client("a", "Hôtel Atlas", { ice: "001234567000089" }),
    client("b", "Boulangerie Nour"),
    client("c1", "Café Central"),
    client("c2", "CAFE CENTRAL", { archived: true }),
    client("d", "Groupe Doha SA", { ice: "002222222000011" }),
    client("d2", "Doha Agadir", { ice: "002222222000011" }),
    client("m-old", "Marché Vert", { archived: true, mergedIntoId: "m" }),
    client("m", "Marché Vert SARL"),
  ];
  const resolver = new HistoryClientResolver(clients);

  it("certain by the ICE (digits only), when it names one fiche", () => {
    expect(resolver.resolve({ name: "HOTEL ATLAS AGADIR", ice: "001 234 567 000 089" })).toEqual({ status: "certain", clientId: "a", by: "ICE" });
  });

  it("an ICE shared by several fiches: the name decides among them, or nobody does", () => {
    expect(resolver.resolve({ name: "Doha Agadir", ice: "002222222000011" })).toEqual({ status: "certain", clientId: "d2", by: "ICE" });
    const shared = resolver.resolve({ name: "Doha Marrakech", ice: "002222222000011" });
    expect(shared.status).toBe("ambiguous");
  });

  it("certain by the normalised name when it names one fiche, and only one", () => {
    expect(resolver.resolve({ name: "BOULANGERIE  NOUR", ice: "" })).toEqual({ status: "certain", clientId: "b", by: "NOM" });
  });

  it("two fiches of the same name are ambiguous — even when one is archived (stricter than the prices)", () => {
    const match = resolver.resolve({ name: "café central", ice: "" });
    expect(match.status).toBe("ambiguous");
    if (match.status === "ambiguous") expect(match.candidates.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("a fiche merged into another stands for the one it was merged into", () => {
    expect(resolver.resolve({ name: "Marché Vert", ice: "" })).toEqual({ status: "certain", clientId: "m", by: "NOM" });
  });

  it("an ICE scrap never identifies; an unknown name is not found", () => {
    expect(resolver.resolve({ name: "Inconnu", ice: "0" }).status).toBe("missing");
    expect(resolver.resolve({ name: "", ice: "" }).status).toBe("missing");
  });

  it("the plan writes the certain ones only, never touches a link already made, lists the rest by samples", () => {
    const csv = [
      "legacyClientId;client;ice;obsolete;echantillons;premiereAnnee;derniereAnnee",
      "10;Hôtel Atlas;001234567000089;0;120;2017;2026",
      "11;Café Central;;0;40;2019;2025",
      "12;Inconnu SARL;;0;3;2018;2018",
      "13;Boulangerie Nour;;0;7;2020;2021",
      "14;Marché Vert;;0;9;2020;2026",
      "15;Exclu;;0;2;2020;2020",
      "x;Ligne cassée;;0;1;2020;2020",
    ].join("\n");
    const read = readLegacyClients(csv);
    if ("error" in read) throw new Error(read.error);
    expect(read.rejected).toEqual([{ line: 8, reason: "Identifiant du client manquant ou invalide." }]);
    const plan = planLegacyClientLinks(read.rows, read.rejected, {
      clients,
      links: [
        { legacyClientId: 13, clientId: "b", matchedBy: "NOM" },
        { legacyClientId: 15, clientId: null, matchedBy: "MAIN" },
      ],
    });
    expect(plan.writes).toEqual([
      { legacyClientId: 10, legacyName: "Hôtel Atlas", clientId: "a", matchedBy: "ICE" },
      { legacyClientId: 14, legacyName: "Marché Vert", clientId: "m", matchedBy: "NOM" },
    ]);
    expect(plan.counts).toMatchObject({ certain: 2, byIce: 1, byName: 1, ambiguous: 1, missing: 1, linked: 1, excluded: 1, rejected: 1 });
    expect(plan.samples).toEqual({ linked: 7, certain: 129, waiting: 43 });
    expect(plan.ambiguous[0].legacyClientId).toBe(11);
    expect(plan.missing[0]).toMatchObject({ legacyClientId: 12, samples: 3 });
  });

  it("a file without the columns is refused", () => {
    expect(readLegacyClients("a;b\n1;2")).toHaveProperty("error");
  });
});

// ---- step 2 ------------------------------------------------------------------------------

const header = JSON.stringify({ kind: "qualilab-historique-ancien", version: 1, month: "2025-09", part: 1, parts: 1, lines: 4, extractedAt: "2026-11-21T14:41:45" });
const sampleLine = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 261002,
    client: 2303,
    site: 3117,
    serie: "988/26",
    control: "7046/26",
    year: 2026,
    nature: "Microbiologie des Aliments",
    designation: "Salade",
    sampledAt: "2026-09-08T13:33:00",
    receivedAt: "2026-04-09T10:20:00",
    reportNumber: "7046/26",
    reportedAt: "2026-04-14",
    verdict: 2,
    format: "0.###",
    results: [
      { id: 785438, parameter: "Bacillus cereus", method: "NM ISO 7932", unit: "ufc/g", criterion: { n: 1, m: ["1", 3] }, readings: [{ u: 1, v: "1", e: 2, c: 2, op: "<", k: 11 }] },
      { id: 785441, pos: 1, parameter: "Flore totale", unit: "ufc/g", readings: [{ u: 1, v: "5.3", e: 6, c: 0, k: 11 }] },
    ],
    ...over,
  });

function file(lines: string[]): ParsedHistoryFile {
  const parsed = readHistoryFile([header, ...lines].join("\n"));
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

const links = new Map<number, LinkTarget>([
  [2303, { clientId: "A", siteId: null }],
  [2400, { clientId: null, siteId: null }],
]);
const sites = new Map<number, SiteByLegacy>([
  [3117, { id: "siteA", clientId: "A" }],
  [3999, { id: "siteB", clientId: "B" }],
]);

describe("step 2 — a monthly file", () => {
  it("refuses a file that is no monthly file, or of another version", () => {
    expect(readHistoryFile("legacyClientId;client\n1;x")).toHaveProperty("error");
    expect(readHistoryFile(JSON.stringify({ kind: "qualilab-historique-ancien", version: 9, month: "2025-09" }))).toHaveProperty("error");
  });

  it("reads a sample: numbers, dates on the lab's clock, the verdict, analyses ordered, values printed", () => {
    const parsed = file([sampleLine()]);
    const line = parsed.lines[0];
    expect(line.cancelled).toBe(false);
    if (line.cancelled) return;
    const s = line.sample;
    expect(s).toMatchObject({ id: 261002, legacyClientId: 2303, legacySiteId: 3117, controlNumber: "7046/26", serieNumber: "988/26", interpretation: "SATISFAISANT", verdictLabel: "Satisfaisant" });
    expect(s.reportedAt).toBeInstanceOf(Date);
    // The report's order first (pos 1), then the file's.
    expect(s.results.map((r) => r.id)).toEqual([785441, 785438]);
    expect(s.results[1]).toMatchObject({ value: "< 1,0.10²", criterion: "≤ 10³", interpretation: "SATISFAISANT" });
    expect(s.results[0].interpretation).toBe("NON_SATISFAISANT");
    expect(s.sourceHash).toBe(lineHash(sampleLine()));
  });

  it("refuses a broken line, a duplicate, a line without client or year — and keeps the others", () => {
    const parsed = file(["{oops", sampleLine(), sampleLine(), JSON.stringify({ id: 7, year: 2020 }), JSON.stringify({ id: 8, client: 1, year: 1899 })]);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.rejected.map((r) => r.reason)).toEqual([
      "Ligne illisible.",
      "Échantillon en double dans le fichier.",
      "Client de l'ancien logiciel manquant.",
      "Année manquante ou invalide.",
    ]);
  });

  it("a new sample of a linked client is created, on its visit's site when that site is the same client's", () => {
    const plan = planLegacyMonth(file([sampleLine()]), { existing: new Map(), links, sites });
    expect(plan.counts.create).toBe(1);
    expect(plan.create[0]).toMatchObject({ clientId: "A", siteId: "siteA" });
    expect(plan.results).toBe(2);
    expect(monthPlanWrites(plan)).toBe(true);
    const row = legacySampleRow(plan.create[0]);
    expect(row).toMatchObject({ id: 261002, clientId: "A", siteId: "siteA", cancelled: false });
    expect(Object.keys(row).some((k) => /pri[cx]/i.test(k))).toBe(false);
    expect(legacyResultRows(plan.create).map((r) => r.legacySampleId)).toEqual([261002, 261002]);
  });

  it("a visit's site of another client is never used: the link's site, else none", () => {
    const plan = planLegacyMonth(file([sampleLine({ site: 3999 })]), { existing: new Map(), links, sites });
    expect(plan.create[0].siteId).toBeNull();
    const onSite = planLegacyMonth(file([sampleLine({ site: 3999 })]), {
      existing: new Map(),
      links: new Map([[2303, { clientId: "A", siteId: "siteA2" }]]),
      sites,
    });
    expect(onSite.create[0].siteId).toBe("siteA2");
  });

  it("the same file twice writes nothing (idempotent)", () => {
    const parsed = file([sampleLine()]);
    const first = planLegacyMonth(parsed, { existing: new Map(), links, sites });
    const existing = new Map<number, ExistingLegacySample>(first.create.map((s) => [s.id, { id: s.id, sourceHash: s.sourceHash, clientId: s.clientId, siteId: s.siteId, cancelled: false }]));
    const again = planLegacyMonth(parsed, { existing, links, sites });
    expect(again.counts.unchanged).toBe(1);
    expect(again.counts.create + again.counts.update).toBe(0);
    expect(monthPlanWrites(again)).toBe(false);
  });

  it("a line changed in the old software (an amendment) is rewritten; so is one whose link moved", () => {
    const existing = new Map<number, ExistingLegacySample>([[261002, { id: 261002, sourceHash: lineHash(sampleLine()), clientId: "A", siteId: "siteA", cancelled: false }]]);
    const changed = planLegacyMonth(file([sampleLine({ verdict: 0, amendment: "Ce rapport annule et remplace le rapport N° 7046/26" })]), { existing, links, sites });
    expect(changed.counts.update).toBe(1);
    expect(changed.update[0]).toMatchObject({ interpretation: "NON_SATISFAISANT", amendmentNote: "Ce rapport annule et remplace le rapport N° 7046/26" });
    const moved = planLegacyMonth(file([sampleLine()]), { existing, links: new Map([[2303, { clientId: "Z", siteId: null }]]), sites });
    expect(moved.counts.update).toBe(1);
    expect(moved.update[0]).toMatchObject({ clientId: "Z", siteId: null });
  });

  it("a sample whose client has no link is not written (counted, its client listed); « ne pas reprendre » neither", () => {
    const plan = planLegacyMonth(file([sampleLine({ id: 1, client: 9999 }), sampleLine({ id: 2, client: 9999 }), sampleLine({ id: 3, client: 2400 })]), {
      existing: new Map(),
      links,
      sites,
    });
    expect(plan.counts).toMatchObject({ create: 0, clientNotLinked: 2, clientExcluded: 1 });
    expect(plan.notLinked).toEqual([{ legacyClientId: 9999, samples: 2 }]);
    expect(monthPlanWrites(plan)).toBe(false);
  });

  it("a sample cancelled since its import is hidden; one never imported is skipped", () => {
    const existing = new Map<number, ExistingLegacySample>([
      [5, { id: 5, sourceHash: "h", clientId: "A", siteId: null, cancelled: false }],
      [6, { id: 6, sourceHash: "h", clientId: "A", siteId: null, cancelled: true }],
    ]);
    const plan = planLegacyMonth(file([JSON.stringify({ id: 5, cancelled: true }), JSON.stringify({ id: 6, cancelled: true }), JSON.stringify({ id: 7, cancelled: true })]), {
      existing,
      links,
      sites,
    });
    expect(plan.hide).toEqual([5]);
    expect(plan.counts).toMatchObject({ hide: 1, unchanged: 1, cancelledSkipped: 1 });
  });

  it("a sample cancelled then given back in the old software comes back (rewritten, visible again)", () => {
    const existing = new Map<number, ExistingLegacySample>([[261002, { id: 261002, sourceHash: lineHash(sampleLine()), clientId: "A", siteId: "siteA", cancelled: true }]]);
    const plan = planLegacyMonth(file([sampleLine()]), { existing, links, sites });
    expect(plan.counts.update).toBe(1);
    expect(legacySampleRow(plan.update[0]).cancelled).toBe(false);
  });
});
