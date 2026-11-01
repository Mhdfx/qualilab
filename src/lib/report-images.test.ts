import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_LAYOUT_ALIGNED, buildReportHtml, type ReportData } from "./report-html";

/**
 * K4 (RETOUR-LABO-28-10.md §5) — the accreditation logo and the stamp are
 * frozen with each issued version: issue a report, replace the stamp (then
 * remove it) in /admin/entreprise, print again — the print does not change.
 * The database is a small in-memory stand-in for `CompanySettings` and the
 * append-only `ReportImageArchive`.
 */

const db = vi.hoisted(() => {
  const state = {
    settings: { accreditationLogoData: null as string | null, stampData: null as string | null },
    archive: new Map<string, string>(),
    failArchive: false,
  };
  const prisma = {
    companySettings: { findUnique: vi.fn(async () => ({ ...state.settings })) },
    reportImageArchive: {
      createMany: vi.fn(async ({ data }: { data: { hash: string; dataUri: string }[]; skipDuplicates?: boolean }) => {
        if (state.failArchive) throw new Error("archive down");
        let count = 0;
        for (const row of data) {
          if (state.archive.has(row.hash)) continue; // skipDuplicates: never rewritten
          state.archive.set(row.hash, row.dataUri);
          count += 1;
        }
        return { count };
      }),
      findMany: vi.fn(async ({ where }: { where: { hash: { in: string[] } } }) =>
        where.hash.in.filter((hash) => state.archive.has(hash)).map((hash) => ({ hash, dataUri: state.archive.get(hash)! }))
      ),
    },
  };
  return { state, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: db.prisma }));

import { freezeReportImages, issuedReportImages, reportImageHash } from "./report-images";

const STAMP_A = "data:image/png;base64,QUFBQQ==";
const STAMP_B = "data:image/png;base64,QkJCQg==";
const LOGO = "data:image/png;base64,TE9HTw==";

const base: ReportData = {
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
  results: [],
  sampledByLab: true,
  layout: REPORT_LAYOUT_ALIGNED,
  samplingMeans: "Écouvillon",
};

beforeEach(() => {
  db.state.settings = { accreditationLogoData: null, stampData: null };
  db.state.archive.clear();
  db.state.failArchive = false;
});

describe("K4 — images frozen with the issued version", () => {
  it("prints the stamp of the issue after the stamp is replaced, then removed", async () => {
    db.state.settings = { accreditationLogoData: LOGO, stampData: STAMP_A };
    const frozen = await freezeReportImages();
    expect(frozen).toEqual({ accreditationLogo: true, stamp: true, accreditationLogoHash: reportImageHash(LOGO), stampHash: reportImageHash(STAMP_A) });
    const version: ReportData = { ...base, ...frozen };
    const print = async () => buildReportHtml(version, {}, undefined, undefined, await issuedReportImages(version));
    const before = await print();
    expect(before).toContain(`src="${STAMP_A}"`);

    // A new Direction: the stamp is replaced. The issued version keeps its own.
    db.state.settings = { accreditationLogoData: LOGO, stampData: STAMP_B };
    expect(await print()).toBe(before);
    // A version issued now carries the new one.
    const next = await freezeReportImages();
    expect(next.stampHash).toBe(reportImageHash(STAMP_B));
    expect(await issuedReportImages({ ...base, ...next })).toMatchObject({ stampDataUri: STAMP_B });

    // The file removed: older versions still print theirs.
    db.state.settings = { accreditationLogoData: null, stampData: null };
    expect(await print()).toBe(before);
    expect(await issuedReportImages(version)).toEqual({ accreditationLogoDataUri: LOGO, stampDataUri: STAMP_A });
  });

  it("archives each image once, never rewriting a known hash", async () => {
    db.state.settings = { accreditationLogoData: null, stampData: STAMP_A };
    await freezeReportImages();
    await freezeReportImages();
    expect(db.state.archive.size).toBe(1);
    expect(db.prisma.reportImageArchive.createMany).toHaveBeenLastCalledWith({ data: [{ hash: reportImageHash(STAMP_A), dataUri: STAMP_A }], skipDuplicates: true });
  });

  it("freezes nothing when no file is uploaded, or when the archive cannot be written", async () => {
    expect(await freezeReportImages()).toEqual({ accreditationLogo: false, stamp: false });
    db.state.settings = { accreditationLogoData: LOGO, stampData: STAMP_A };
    db.state.failArchive = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await freezeReportImages()).toEqual({ accreditationLogo: false, stamp: false });
    error.mockRestore();
  });

  it("never prints the file of the day for a version without a frozen hash", async () => {
    db.state.settings = { accreditationLogoData: LOGO, stampData: STAMP_B };
    db.state.archive.set(reportImageHash(STAMP_B), STAMP_B);
    expect(await issuedReportImages({ ...base, accreditationLogo: true, stamp: true })).toEqual({});
  });
});
