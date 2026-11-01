import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RECAP_DEFAULT_MODE, buildSiteRecap, parseRecapOptions, recapColumns, resultVerdict, type RecapSample } from "./sample-recap";

const catalogue = [
  { id: "fmat", name: "FMAT", aliases: "Flore mésophile aérobie totale" },
  { id: "salm", name: "Salmonella", aliases: null },
  { id: "salm-eau", name: "salmonella", aliases: null },
  { id: "ecoli", name: "Escherichia coli", aliases: "E. coli" },
  { id: "ecoli2", name: "E coli", aliases: null },
  { id: "chlore", name: "Chlore", aliases: null },
];

const ok = { label: "Conforme", tone: "ok" as const };

const sample = (extra: Partial<RecapSample>): RecapSample => ({
  siteName: null,
  produit: "Poulet",
  receptionAt: new Date("2026-10-20T10:00:00Z"),
  controlCode: "00001/26",
  code: "S1",
  status: "VALIDE",
  conclusion: ok,
  results: [],
  ...extra,
});

describe("recapColumns (L1)", () => {
  it("merges twins of another category and aliases into one column named after the first", () => {
    const { columnOf, columns } = recapColumns(catalogue);
    expect(columnOf.get("salm-eau")).toBe("salm");
    expect(columnOf.get("ecoli2")).toBe("ecoli");
    expect(columns.get("ecoli")).toEqual({ label: "Escherichia coli", rank: 3 });
    expect(columnOf.get("chlore")).toBe("chlore");
  });
});

describe("resultVerdict", () => {
  it("reads the criterion's verdict, else the conform flag", () => {
    expect(resultVerdict({ interpretation: "NON_SATISFAISANT", conform: true })).toBe("NC");
    expect(resultVerdict({ interpretation: "ACCEPTABLE", conform: null })).toBe("C");
    expect(resultVerdict({ interpretation: null, conform: false })).toBe("NC");
    expect(resultVerdict({ interpretation: null, conform: true })).toBe("C");
    expect(resultVerdict({ interpretation: null, conform: null })).toBeNull();
    expect(resultVerdict({ interpretation: "INCOMPLET", conform: null })).toBeNull();
  });
});

describe("buildSiteRecap", () => {
  const samples: RecapSample[] = [
    sample({
      siteName: "Restaurant B",
      code: "S1",
      controlCode: "00003/26",
      receptionAt: new Date("2026-10-21T10:00:00Z"),
      results: [
        { parameterId: "salm-eau", value: "Absence", conform: true, interpretation: "SATISFAISANT" },
        { parameterId: "fmat", value: "3,2.10⁵", conform: false, interpretation: "NON_SATISFAISANT" },
      ],
      conclusion: { label: "Non conforme", tone: "no" },
    }),
    sample({ siteName: null, code: "S2", controlCode: null, results: [{ parameterId: "ecoli2", value: "< 10", conform: null, interpretation: "ACCEPTABLE" }] }),
    sample({ siteName: "Restaurant A", code: "S3", controlCode: "00002/26", results: [{ parameterId: "salm", value: "Absence", conform: true, interpretation: null }] }),
    sample({
      siteName: "Restaurant A",
      code: "S4",
      controlCode: "00004/26",
      status: "EN_ANALYSE",
      conclusion: { label: "En cours", tone: "pending" },
      results: [{ parameterId: "chlore", value: "0,2", conform: null, interpretation: null }],
    }),
  ];

  it("has one column per parameter present in a validated sample, in the catalogue's order", () => {
    const table = buildSiteRecap(samples, catalogue);
    expect(table.columns.map((c) => c.label)).toEqual(["FMAT", "Salmonella", "Escherichia coli"]);
  });

  it("groups by site (« Siège » first), one row per sample, the value coloured by its verdict", () => {
    const table = buildSiteRecap(samples, catalogue);
    expect(table.rows.map((r) => [r.site, r.controlCode])).toEqual([
      ["Siège", "S2"],
      ["Restaurant A", "00002/26"],
      ["Restaurant A", "00004/26"],
      ["Restaurant B", "00003/26"],
    ]);
    const b = table.rows[3];
    expect(b.cells).toEqual([
      { text: "3,2.10⁵", verdict: "NC", acceptable: false },
      { text: "Absence", verdict: "C", acceptable: false },
      null,
    ]);
    expect(b.conformity).toBe("Non conforme");
    expect(table.rows[0].cells[2]).toEqual({ text: "< 10", verdict: "C", acceptable: true });
  });

  it("prints nothing of a sample not validated yet — its conclusion says where it stands", () => {
    const pending = buildSiteRecap(samples, catalogue).rows[2];
    expect(pending.cells.every((c) => c === null)).toBe(true);
    expect(pending.conformity).toBe("En cours");
  });

  it("writes C / NC in the other mode, the value when a result has no verdict", () => {
    const table = buildSiteRecap(
      [...samples, sample({ code: "S5", results: [{ parameterId: "chlore", value: "0,4", conform: null, interpretation: null }] })],
      catalogue,
      "cnc"
    );
    expect(table.rows.find((r) => r.controlCode === "00003/26")!.cells.slice(0, 2).map((c) => c?.text)).toEqual(["NC", "C"]);
    const chlore = table.columns.findIndex((c) => c.label === "Chlore");
    expect(table.rows.find((r) => r.controlCode === "00001/26")!.cells[chlore]?.text).toBe("0,4");
  });

  it("groups by client first, with its name, when the recap covers several clients", () => {
    const table = buildSiteRecap(
      [
        sample({ clientName: "Client Z", siteName: "Site 1", code: "Z1", controlCode: "Z1" }),
        sample({ clientName: "Client A", siteName: "Site 9", code: "A9", controlCode: "A9" }),
        sample({ clientName: "Client A", siteName: null, code: "A0", controlCode: "A0" }),
      ],
      catalogue,
      "valeur",
      true
    );
    expect(table.rows.map((r) => [r.client, r.site, r.controlCode])).toEqual([
      ["Client A", "Siège", "A0"],
      ["Client A", "Site 9", "A9"],
      ["Client Z", "Site 1", "Z1"],
    ]);
    // One client chosen: no client in the rows.
    expect(buildSiteRecap(samples, catalogue).rows.every((r) => r.client === "")).toBe(true);
  });

  it("keeps the value by default until R-21 and reads the options of the query", () => {
    expect(RECAP_DEFAULT_MODE).toBe("valeur");
    expect(parseRecapOptions(new URLSearchParams("mode=cnc&details=1"))).toEqual({ mode: "cnc", details: true });
    expect(parseRecapOptions(new URLSearchParams("mode=x"))).toEqual({ mode: "valeur", details: false });
  });
});

describe("GET /api/samples/recap", () => {
  it("has the export's roles, filters and journal", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/samples/recap/route.ts"), "utf8");
    const exportRoute = readFileSync(join(process.cwd(), "src/app/api/samples/export/route.ts"), "utf8");
    const roles = (source: string) => /requireApiRole\(([^)]*)\)/.exec(source)?.[1];
    expect(roles(route)).toBe(roles(exportRoute));
    expect(route).toMatch(/parseSampleSearch\(/);
    expect(route).toMatch(/sampleSearchWhere\(search\)/);
    expect(route).toMatch(/action: "SAMPLES_EXPORTED"[\s\S]*kind: "recapitulatif-par-site"/);
  });
});
