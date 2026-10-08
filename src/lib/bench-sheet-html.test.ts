import { describe, expect, it } from "vitest";
import { BENCH_SHEET_MARGIN, buildBenchSheetHtml, type BenchSheetSample } from "./bench-sheet-html";
import { cartoucheMargin, pageCss } from "./cartouche-html";

const sample: BenchSheetSample = {
  reference: "200/26",
  serieNumber: "17/26",
  type: "ALIMENTAIRE",
  designation: "Échantillon test",
  numeroLot: null,
  clientName: "Client Démo",
  technicianName: null,
  unitCount: 1,
  parameters: [{ name: "E. coli", unit: "UFC/g", threshold: null }],
};

describe("buildBenchSheetHtml — PG06/EN01 under the cartouche", () => {
  const html = buildBenchSheetHtml(new Date("2026-10-08T10:00:00Z"), [sample, { ...sample, reference: "201/26" }]);

  it("leaves the cartouche to the page header, and declares the page box it is printed with", () => {
    expect(BENCH_SHEET_MARGIN).toEqual(cartoucheMargin());
    expect(html).toContain(pageCss(BENCH_SHEET_MARGIN));
    expect(html).not.toContain("<header");
    expect(html).not.toContain("PG06/EN01");
    expect(html).not.toContain("QUALILAB");
  });

  it("keeps the day and the count of samples at the top of the body", () => {
    expect(html).toContain("<span>Date : <b>8 oct. 2026</b></span>");
    expect(html).toContain("<span>2 échantillons</span>");
  });
});
