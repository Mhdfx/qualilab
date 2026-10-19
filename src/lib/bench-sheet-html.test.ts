import { describe, expect, it } from "vitest";
import { BENCH_SHEET_MARGIN, buildBenchSheetHtml, type BenchSheetSample } from "./bench-sheet-html";
import { cartoucheMargin, pageCss } from "./cartouche-html";

const sample: BenchSheetSample = {
  reference: "200/26",
  serieNumber: "17/26",
  type: "ALIMENTAIRE",
  designation: "Échantillon test",
  numeroLot: null,
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

describe("buildBenchSheetHtml — prise en charge libre (13/10)", () => {
  const day = new Date("2026-10-13T10:00:00Z");

  it("names each sample's holder, and prints « À prendre » on a sample nobody took", () => {
    const html = buildBenchSheetHtml(day, [{ ...sample, technicianName: "Karim Alaoui" }, sample]);
    expect(html).toContain("· Karim Alaoui");
    expect(html).toContain('· <span class="free">À prendre</span>');
  });

  it("leaves the signature blank, and an empty day says so, when no technician prints it", () => {
    expect(buildBenchSheetHtml(day, [sample])).toContain("<span>Saisie effectuée par : ______________________</span>");
    expect(buildBenchSheetHtml(day, [])).toContain("Aucun échantillon en analyse pour cette date.");
  });

  it("signs a technician's sheet with their name, escaped, and says when they took nothing", () => {
    const mine = buildBenchSheetHtml(day, [{ ...sample, technicianName: "Karim Alaoui" }], { printedFor: "Karim Alaoui" });
    expect(mine).toContain("<span>Saisie effectuée par : <b>Karim Alaoui</b></span>");
    expect(mine).not.toContain("Saisie effectuée par : ______");

    const empty = buildBenchSheetHtml(day, [], { printedFor: "Karim Alaoui" });
    expect(empty).toContain("Vous n'avez pris en charge aucun échantillon.");
    expect(empty).not.toContain("Aucun échantillon en analyse pour cette date.");

    expect(buildBenchSheetHtml(day, [], { printedFor: "<b>Eve</b>" })).toContain("<b>&lt;b&gt;Eve&lt;/b&gt;</b>");
  });

  it("reads a blank name as no name: the line stays to be signed by hand", () => {
    expect(buildBenchSheetHtml(day, [], { printedFor: "  " })).toContain("Saisie effectuée par : ______________________");
  });
});

describe("buildBenchSheetHtml — a sample is identified by its code, never by its client (Q55, 16/10)", () => {
  const day = new Date("2026-10-16T10:00:00Z");
  /** The meta line of each block, tags stripped and whitespace collapsed. */
  const metaLines = (html: string) =>
    [...html.matchAll(/<div class="meta">([\s\S]*?)<\/div>/g)].map((match) =>
      match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );

  it("reads « Série NN · désignation · lot · titulaire », with no client between them", () => {
    const html = buildBenchSheetHtml(day, [
      { ...sample, numeroLot: "L-01", technicianName: "X.NOM" },
      { ...sample, designation: null },
    ]);
    expect(metaLines(html)).toEqual(["Série 17/26 · Échantillon test · lot L-01 · X.NOM", "Série 17/26 · À prendre"]);
  });

  it("keeps the N° de contrôle and the nature in the block's head", () => {
    const html = buildBenchSheetHtml(day, [sample]);
    expect(html).toContain('<span class="serial">200/26</span>');
    expect(html).toContain('<span class="type">Alimentaire</span>');
  });

  it("never prints a client name, even from a row that still carries one", () => {
    const row = { ...sample, clientName: "TEST UI 2026-10-06 Traiteur", client: { name: "TEST UI 2026-10-06 Traiteur" } };
    const html = buildBenchSheetHtml(day, [row as BenchSheetSample], { printedFor: "X.NOM" });
    expect(html).not.toContain("TEST UI");
    expect(html).not.toContain("Traiteur");
  });
});
