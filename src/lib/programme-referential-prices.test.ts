import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `loadProgrammeReferential` and the catalogue prices (the owner's rule of
 * 25/10): the referential is the programme page's RSC payload and the JSON
 * of `GET /api/samples/[id]/programme`, readable in the browser whatever
 * the sheet hides — so without `withPrices` the services are not even read
 * and `prices` stays empty. The database is stubbed; invented names only.
 */

const prisma = vi.hoisted(() => ({
  productType: { findMany: vi.fn() },
  analysisNature: { findMany: vi.fn() },
  analysisParameter: { findMany: vi.fn() },
  analysisProfile: { findMany: vi.fn() },
  labService: { findMany: vi.fn() },
  criterion: { findMany: vi.fn() },
  normVersion: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { loadProgrammeReferential } from "./programme-referential";

const LINE = {
  code: "12/26-1M",
  natureId: "n-micro",
  nature: { family: "MICRO" as const },
  natureHome: null,
  clientId: "c1",
  type: "ALIMENTAIRE" as const,
  parameters: [{ parameterId: "p-ecoli", normVersionId: null }],
};

const PARAMETERS = [
  { id: "p-ecoli", name: "E. coli test", unit: "ufc/g", threshold: null, calcFactor: null, family: "MICRO", category: "ALIMENTAIRE", aliases: null },
  { id: "p-salm", name: "Salmonelles test", unit: null, threshold: null, calcFactor: null, family: "MICRO", category: "ALIMENTAIRE", aliases: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.productType.findMany.mockResolvedValue([]);
  prisma.analysisNature.findMany.mockResolvedValue([]);
  prisma.analysisParameter.findMany.mockResolvedValue(PARAMETERS);
  prisma.analysisProfile.findMany.mockResolvedValue([]);
  prisma.labService.findMany.mockResolvedValue([
    { name: "E. coli test", category: "ALIMENTAIRE", unitPrice: "120.00", active: true },
  ]);
  prisma.criterion.findMany.mockResolvedValue([]);
  prisma.normVersion.findMany.mockResolvedValue([]);
});

describe("loadProgrammeReferential — the catalogue prices for a role that sees the billing only", () => {
  it("with prices (the administrator): each parameter priced from the catalogue, null = « prix à saisir »", async () => {
    const referential = await loadProgrammeReferential(LINE, { natures: [], withPrices: true });
    expect(prisma.labService.findMany).toHaveBeenCalledTimes(1);
    expect(referential.prices).toEqual({ "p-ecoli": 120, "p-salm": null });
  });

  it("without (the responsable des paramètres): the services never read, no price — not even « prix à saisir »", async () => {
    const referential = await loadProgrammeReferential(LINE, { natures: [], withPrices: false });
    expect(prisma.labService.findMany).not.toHaveBeenCalled();
    expect(referential.prices).toEqual({});
    // The rest of the referential is the same.
    expect(referential.parameters.map((p) => p.id)).toEqual(["p-ecoli", "p-salm"]);
    expect(JSON.stringify(referential)).not.toMatch(/unitPrice|120/);
  });
});
