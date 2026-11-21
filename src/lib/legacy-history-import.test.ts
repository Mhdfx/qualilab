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

  it("two fiches of the same name are ambiguous — even when one is archived (stricter than the prices); the archived one is never offered", () => {
    const match = resolver.resolve({ name: "café central", ice: "" });
    expect(match).toMatchObject({ status: "ambiguous", reason: "homonymFiches" });
    if (match.status === "ambiguous") expect(match.candidates.map((c) => c.id)).toEqual(["c1"]);
  });

  it("an archived fiche (not merged) is never certain nor a candidate — the hand route refuses it too", () => {
    const only = new HistoryClientResolver([client("z", "Ancienne Cantine", { archived: true, ice: "009999999000099" })]);
    expect(only.resolve({ name: "Ancienne Cantine", ice: "" })).toEqual({ status: "ambiguous", reason: "archivedOnly", candidates: [] });
    expect(only.resolve({ name: "Autre nom", ice: "009999999000099" })).toEqual({ status: "ambiguous", reason: "archivedOnly", candidates: [] });
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

  it("several clients of the old software with one name: none is linked on the name alone (no merge of histories without a decision)", () => {
    const csv = [
      "legacyClientId;client;ice;obsolete;echantillons;premiereAnnee;derniereAnnee",
      "2566;Boulangerie Nour;;0;10;2018;2020",
      "3223;BOULANGERIE NOUR;;0;8;2021;2026",
      "20;Hôtel Atlas;001234567000089;0;5;2020;2026",
      "21;Hotel Atlas;;0;2;2020;2020",
    ].join("\n");
    const read = readLegacyClients(csv);
    if ("error" in read) throw new Error(read.error);
    const plan = planLegacyClientLinks(read.rows, read.rejected, { clients, links: [] });
    // The one with its own usable ICE stays certain: the ICE tells it apart.
    expect(plan.writes).toEqual([{ legacyClientId: 20, legacyName: "Hôtel Atlas", clientId: "a", matchedBy: "ICE" }]);
    expect(plan.counts).toMatchObject({ certain: 1, ambiguous: 3 });
    const byId = new Map(plan.ambiguous.map((a) => [a.legacyClientId, a]));
    expect(byId.get(2566)).toMatchObject({ reason: "homonymLegacy", homonyms: [3223], candidates: [{ id: "b" }] });
    expect(byId.get(3223)).toMatchObject({ reason: "homonymLegacy", homonyms: [2566], candidates: [{ id: "b" }] });
    expect(byId.get(21)).toMatchObject({ reason: "homonymLegacy", homonyms: [20], candidates: [{ id: "a" }] });
  });

  it("an automatic link already made for one of several homonyms is listed for review, never rewritten; a hand decision is not", () => {
    const csv = ["legacyClientId;client;ice", "2566;Boulangerie Nour;", "3223;Boulangerie Nour;", "3174;Marché Vert;", "3175;Marché Vert;"].join("\n");
    const read = readLegacyClients(csv);
    if ("error" in read) throw new Error(read.error);
    const plan = planLegacyClientLinks(read.rows, read.rejected, {
      clients,
      links: [
        { legacyClientId: 2566, clientId: "b", matchedBy: "NOM" },
        { legacyClientId: 3223, clientId: "b", matchedBy: "NOM" },
        { legacyClientId: 3174, clientId: "m", matchedBy: "MAIN" },
      ],
    });
    expect(plan.writes).toEqual([]);
    expect(plan.review.map((r) => [r.legacyClientId, r.homonyms])).toEqual([
      [2566, [3223]],
      [3223, [2566]],
    ]);
    expect(plan.counts.review).toBe(2);
    // 3175 shares its name with 3174 (decided by hand): still never linked by the name alone.
    expect(plan.ambiguous.map((a) => [a.legacyClientId, a.reason])).toEqual([[3175, "homonymLegacy"]]);
  });

  it("a homonym the file no longer lists but a link still names counts too", () => {
    const read = readLegacyClients(["legacyClientId;client", "40;Boulangerie Nour"].join("\n"));
    if ("error" in read) throw new Error(read.error);
    const plan = planLegacyClientLinks(read.rows, read.rejected, { clients, links: [{ legacyClientId: 41, legacyName: "BOULANGERIE NOUR", clientId: "b", matchedBy: "NOM" }] });
    expect(plan.writes).toEqual([]);
    expect(plan.ambiguous[0]).toMatchObject({ legacyClientId: 40, reason: "homonymLegacy", homonyms: [41] });
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

/** A row already imported (what the route reads back). */
const stored = (id: number, over: Partial<ExistingLegacySample> = {}): ExistingLegacySample => ({
  id,
  sourceHash: "h",
  clientId: "A",
  siteId: null,
  siteClientId: null,
  legacyClientId: 2303,
  cancelled: false,
  ...over,
});

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
    const existing = new Map<number, ExistingLegacySample>(
      first.create.map((s) => [s.id, stored(s.id, { sourceHash: s.sourceHash, clientId: s.clientId, siteId: s.siteId, siteClientId: "A", legacyClientId: s.legacyClientId })])
    );
    const again = planLegacyMonth(parsed, { existing, links, sites });
    expect(again.counts.unchanged).toBe(1);
    expect(again.counts.create + again.counts.update).toBe(0);
    expect(monthPlanWrites(again)).toBe(false);
  });

  it("a line changed in the old software (an amendment) is rewritten; so is one whose link moved", () => {
    const existing = new Map<number, ExistingLegacySample>([[261002, stored(261002, { sourceHash: lineHash(sampleLine()), siteId: "siteA", siteClientId: "A" })]]);
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
      [5, stored(5)],
      [6, stored(6, { cancelled: true })],
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
    const existing = new Map<number, ExistingLegacySample>([[261002, stored(261002, { sourceHash: lineHash(sampleLine()), siteId: "siteA", siteClientId: "A", cancelled: true })]]);
    const plan = planLegacyMonth(file([sampleLine()]), { existing, links, sites });
    expect(plan.counts.update).toBe(1);
    expect(legacySampleRow(plan.update[0]).cancelled).toBe(false);
  });

  it("a sample re-opened in the old software (withdrawn) is hidden like a cancelled one, and comes back validated", () => {
    const parsed = file([JSON.stringify({ id: 5, withdrawn: true }), JSON.stringify({ id: 8, withdrawn: true })]);
    expect(parsed.lines.map((l) => (l.cancelled ? [l.id, l.withdrawn] : null))).toEqual([
      [5, true],
      [8, true],
    ]);
    const plan = planLegacyMonth(parsed, { existing: new Map([[5, stored(5)]]), links, sites });
    expect(plan.hide).toEqual([5]);
    expect(plan.counts).toMatchObject({ hide: 1, cancelledSkipped: 1 });
    const back = planLegacyMonth(file([sampleLine({ id: 5 })]), { existing: new Map([[5, stored(5, { cancelled: true })]]), links, sites });
    expect(back.counts.update).toBe(1);
  });
});

describe("step 2 — a sample whose client changed in the old software (risk 1)", () => {
  // Imported for client A through the old software's client 2303; the laboratory then corrects its client there.
  const before = () => new Map<number, ExistingLegacySample>([[261002, stored(261002, { sourceHash: lineHash(sampleLine()), siteId: "siteA", siteClientId: "A" })]]);

  it("X → Y without a link: removed from A's history (never left there), Y listed as waiting", () => {
    const plan = planLegacyMonth(file([sampleLine({ client: 9999 })]), { existing: before(), links, sites });
    expect(plan.remove).toEqual([261002]);
    expect(plan.counts).toMatchObject({ remove: 1, clientNotLinked: 0, unchanged: 0, update: 0 });
    expect(plan.notLinked).toEqual([{ legacyClientId: 9999, samples: 1 }]);
    expect(monthPlanWrites(plan)).toBe(true);
  });

  it("X → Y « ne pas reprendre »: removed", () => {
    const plan = planLegacyMonth(file([sampleLine({ client: 2400 })]), { existing: before(), links, sites });
    expect(plan.remove).toEqual([261002]);
    expect(plan.counts).toMatchObject({ remove: 1, clientExcluded: 0 });
  });

  it("X → Z linked to another client: rewritten onto it, its old client id written", () => {
    const plan = planLegacyMonth(file([sampleLine({ client: 2500, site: null })]), {
      existing: before(),
      links: new Map([...links, [2500, { clientId: "B", siteId: null }]]),
      sites,
    });
    expect(plan.counts.update).toBe(1);
    expect(legacySampleRow(plan.update[0])).toMatchObject({ clientId: "B", siteId: null, legacyClientId: 2500 });
  });

  it("X → Z linked to the SAME client: rewritten all the same (link decisions act on the stored old client id)", () => {
    const plan = planLegacyMonth(file([sampleLine({ client: 2501 })]), {
      existing: before(),
      links: new Map([...links, [2501, { clientId: "A", siteId: null }]]),
      sites,
    });
    expect(plan.counts.update).toBe(1);
    expect(legacySampleRow(plan.update[0]).legacyClientId).toBe(2501);
  });
});

describe("step 2 — a site merged into another (its old id lost)", () => {
  it("a stored row keeps the site the merge moved it to, instead of drifting back to « Siège »", () => {
    // Site 3117 was merged into siteK (A's): the kept site carries another old id, 3117 is known no more.
    const existing = new Map([[261002, stored(261002, { sourceHash: lineHash(sampleLine()), siteId: "siteK", siteClientId: "A" })]]);
    const plan = planLegacyMonth(file([sampleLine()]), { existing, links, sites: new Map() });
    expect(plan.counts).toMatchObject({ unchanged: 1, update: 0 });
  });

  it("never keeps a stored site of another client, nor one when the client changed", () => {
    const foreign = new Map([[261002, stored(261002, { sourceHash: lineHash(sampleLine()), siteId: "siteB", siteClientId: "B" })]]);
    const plan = planLegacyMonth(file([sampleLine()]), { existing: foreign, links, sites: new Map() });
    expect(plan.update[0].siteId).toBeNull();
    const moved = planLegacyMonth(file([sampleLine()]), {
      existing: new Map([[261002, stored(261002, { sourceHash: lineHash(sampleLine()), siteId: "siteK", siteClientId: "A" })]]),
      links: new Map([[2303, { clientId: "Z", siteId: null }]]),
      sites: new Map(),
    });
    expect(moved.update[0]).toMatchObject({ clientId: "Z", siteId: null });
  });
});
