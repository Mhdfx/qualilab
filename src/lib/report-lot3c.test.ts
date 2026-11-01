import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_LAYOUT_ALIGNED, buildReportHtml, frozenReportImages, reportDataFromJson, reportDataToJson, reportPdfParts, type ReportData } from "./report-html";
import { cartoucheTemplate } from "./cartouche-html";
import { COMPANY } from "./company";
import type { DocumentRef } from "./document-types";

/**
 * RETOUR-LABO-28-10.md lot 3C on the report: the sampling means (K6), the
 * accreditation marks, logo and stamp (K4) — frozen with each version issued
 * since, never on a version issued before.
 */

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const LOGO = "data:image/png;base64,QUNDUkVE";
const STAMP = "data:image/png;base64,Q0FDSEVU";
const reference: DocumentRef = { docType: "RAPPORT", reference: "PG06/EN03", version: "M", createdOn: null, updatedOn: null };

const result = (parameter: string, extra: Partial<ReportData["results"][number]> = {}): ReportData["results"][number] => ({
  parameter,
  value: "Absence",
  unit: "/25 g",
  threshold: null,
  conform: true,
  note: null,
  interpretation: null,
  norm: "NM ISO 6579-1",
  criterion: null,
  units: [],
  ...extra,
});

const issued: ReportData = {
  number: "RAP-2026-00001",
  controlCode: "00012/26",
  serialNumber: "0042/26",
  client: { name: "Client test", address: null, ice: null },
  produit: "Planche verte",
  lineKind: "SURFACE",
  numeroLot: null,
  lieu: "Cuisine",
  type: "AMBIANCE",
  sampledAt: new Date("2026-10-28T08:00:00Z"),
  receivedAt: new Date("2026-10-28T10:00:00Z"),
  preleveur: "Préleveur",
  technicianName: null,
  validatorName: "Valid",
  approverName: "Direction",
  validatedAt: new Date("2026-10-29T10:00:00Z"),
  conclusion: "Conclusion.",
  interpretation: null,
  regulation: null,
  unitCount: 1,
  results: [result("Salmonella", { accreditation: "ACCREDITE" }), result("Levures", { accreditation: "NON_ACCREDITE" }), result("Plomb", { accreditation: "SOUS_TRAITE_ACCREDITE" })],
  sampledByLab: true,
  layout: REPORT_LAYOUT_ALIGNED,
  samplingMeans: "Écouvillon",
  accreditationLogo: true,
  stamp: true,
};

describe("K6 — « Moyen de prélèvement »", () => {
  it("prints the means frozen at the issue", () => {
    expect(buildReportHtml(issued)).toContain("Moyen de prélèvement : Écouvillon");
    expect(buildReportHtml({ ...issued, samplingMeans: "N/A", sampledByLab: false })).toContain("Moyen de prélèvement : N/A");
  });

  it("keeps the print of a version issued before lot 3C (N/A outside the air)", () => {
    const before: ReportData = { ...issued, samplingMeans: undefined };
    expect(buildReportHtml(before)).toContain("Moyen de prélèvement : N/A");
  });

  it("escapes the frozen text", () => {
    expect(buildReportHtml({ ...issued, samplingMeans: "<b>x</b>" })).toContain("Moyen de prélèvement : &lt;b&gt;x&lt;/b&gt;");
  });
});

describe("K4 — accreditation marks, logo and stamp", () => {
  it("prints each analysis's mark after its name, on page 1 and in the annex", () => {
    const html = buildReportHtml(issued);
    expect((html.match(/Levures \*/g) ?? []).length).toBe(2);
    expect((html.match(/Plomb \(SA\)/g) ?? []).length).toBe(2);
    expect(html).not.toContain("Salmonella *");
  });

  it("prints no mark on a version issued before (no accreditation frozen)", () => {
    const before: ReportData = { ...issued, results: issued.results.map((row) => ({ ...row, accreditation: undefined })) };
    expect(buildReportHtml(before)).not.toContain("Levures *");
  });

  it("prints the stamp under « Direction » only on a version issued with it and while the file exists", () => {
    expect(buildReportHtml(issued, {}, COMPANY, "", { stampDataUri: STAMP })).toContain(`<img class="stamp" src="${STAMP}"`);
    expect(buildReportHtml(issued, {}, COMPANY, "", {})).not.toContain('class="stamp"');
    expect(buildReportHtml({ ...issued, stamp: false }, {}, COMPANY, "", { stampDataUri: STAMP })).not.toContain('class="stamp"');
    // A value that is not a clean image data URI never reaches the attribute.
    expect(buildReportHtml(issued, {}, COMPANY, "", { stampDataUri: 'data:image/png;base64,AA"onerror="x' })).not.toContain('class="stamp"');
  });

  it("puts the accreditation logo beside the laboratory's in the cartouche when the version says so", () => {
    const parts = reportPdfParts({ data: issued, company: COMPANY, reference, logoDataUri: PNG, images: { accreditationLogoDataUri: LOGO, stampDataUri: STAMP } });
    expect(parts.header).toContain(`src="${PNG}"`);
    expect(parts.header).toContain(`src="${LOGO}"`);
    const without = reportPdfParts({ data: { ...issued, accreditationLogo: false }, company: COMPANY, reference, logoDataUri: PNG, images: { accreditationLogoDataUri: LOGO } });
    expect(without.header).not.toContain(LOGO);
  });

  it("draws one logo alone as before, two side by side, and refuses an unsafe one", () => {
    expect(cartoucheTemplate({ title: "Rapport d'essai", reference, logoDataUri: PNG })).toContain("margin:0 auto;max-width:100%");
    const both = cartoucheTemplate({ title: "Rapport d'essai", reference, logoDataUri: PNG, secondaryLogoDataUri: LOGO });
    expect(both).toContain("display:flex");
    expect(cartoucheTemplate({ title: "Rapport d'essai", reference, logoDataUri: PNG, secondaryLogoDataUri: "javascript:alert(1)" })).not.toContain("javascript");
  });

  it("freezes and revives the new fields with the version", () => {
    const revived = reportDataFromJson(reportDataToJson({ ...issued, accreditationLogoHash: "h-logo", stampHash: "h-stamp" }));
    expect(revived).toMatchObject({ samplingMeans: "Écouvillon", accreditationLogo: true, stamp: true, accreditationLogoHash: "h-logo", stampHash: "h-stamp" });
    expect(revived?.results[1].accreditation).toBe("NON_ACCREDITE");
  });

  it("prints the archived image of the hash the version froze — never the file of the day", () => {
    const archive = new Map([
      ["h-logo", LOGO],
      ["h-stamp", STAMP],
      ["h-new", PNG],
    ]);
    const frozen = { ...issued, accreditationLogoHash: "h-logo", stampHash: "h-stamp" };
    expect(frozenReportImages(frozen, archive)).toEqual({ accreditationLogoDataUri: LOGO, stampDataUri: STAMP });
    // A flag off prints nothing, whatever the archive holds.
    expect(frozenReportImages({ ...frozen, stamp: false }, archive).stampDataUri).toBeNull();
    // No hash frozen (local versions issued before the fix): nothing, not the current file.
    expect(frozenReportImages({ ...issued }, archive)).toEqual({ accreditationLogoDataUri: null, stampDataUri: null });
    // A hash missing from the archive prints nothing.
    expect(frozenReportImages({ ...frozen, stampHash: "h-gone" }, archive).stampDataUri).toBeNull();
  });
});

describe("the issue freezes them (report-dispatch)", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/report-dispatch.ts"), "utf8");

  it("only on a version issued now — the live 13/10 rendering keeps its data key for key", () => {
    expect(source).toMatch(/\.\.\.\(aligned \? issuedSinceLot3C\(sample, fields\.images\) : \{\}\)/);
    expect(source).toMatch(/\.\.\.\(aligned \? \{ accreditation: result\.parameter\.accreditation \?\? null \} : \{\}\)/);
  });

  it("freezes the files (flag and archived hash) at both issues (first version and amendment)", () => {
    expect((source.match(/freezeReportImages\(\)/g) ?? []).length).toBe(2);
    expect(source).toMatch(/images\.accreditationLogo && reportCarriesAccreditationLogo\(/);
    expect(source).toMatch(/accreditationLogoHash: images\.accreditationLogoHash/);
    expect(source).toMatch(/stampHash: images\.stampHash/);
  });

  it("renders every PDF from the frozen images (report-pdf)", () => {
    const pdf = readFileSync(join(process.cwd(), "src/lib/report-pdf.ts"), "utf8");
    expect(pdf).toMatch(/issuedReportImages\(data\)/);
    expect(pdf).not.toMatch(/getReportImages/);
  });
});
