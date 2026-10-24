import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { SPLIT_BUSY_ERROR, SPLIT_STALE_ERROR } from "./family-split";

/**
 * GET / POST /api/product-types/[id]/split — « Scinder par domaine ». The
 * route handlers run for real; the database (and its transaction), the
 * session guard and the reads are stubbed, and what the handler is asked to
 * write is checked: all or nothing, the journal inside the transaction.
 */

const stubs = vi.hoisted(() => {
  const db = () => ({
    // Typed with its arguments: the test reads the statements sent.
    $queryRaw: vi.fn<(query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>>(async () => []),
    productType: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    analysisNature: { findMany: vi.fn() },
    sample: { findMany: vi.fn() },
    criterion: { createMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    auditLog: { createMany: vi.fn() },
  });
  const tx = db();
  const prisma = { ...db(), $transaction: vi.fn() };
  return { tx, prisma, roles: [] as string[][], session: { current: null as unknown } };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/auth", () => ({
  requireApiRole: async (...roles: string[]) => {
    stubs.roles.push(roles);
    return stubs.session.current;
  },
}));

import { GET, POST } from "../app/api/product-types/[id]/split/route";

const ADMIN = { id: "u-admin", username: "admin", name: "Administrateur", role: "ADMIN", mustChangePassword: false };
const params = { params: Promise.resolve({ id: "t-autres" }) };

const NATURES = [
  { id: "n-micro", code: "MICRO_ALIMENTS", label: "Microbiologie des aliments", family: "MICRO", legacyType: "ALIMENTAIRE", active: true, sortOrder: 10 },
  { id: "n-pc", code: "PC_ALIMENTS", label: "Physico-chimie des aliments", family: "CHIMIE", legacyType: "ALIMENTAIRE", active: true, sortOrder: 30 },
  { id: "n-pc-eaux", code: "PC_EAUX", label: "Physico-chimie des eaux", family: "CHIMIE", legacyType: "EAU", active: true, sortOrder: 70 },
];
const criterion = (id: string, parameterId: string, name: string, family: string, over: Record<string, unknown> = {}) => ({
  id,
  parameterId,
  normVersionId: null,
  unit: null,
  n: 1,
  c: null,
  mKind: "UNSPECIFIED",
  m: null,
  bigM: null,
  active: true,
  parameter: { name, family, category: "ALIMENTAIRE" },
  ...over,
});
const FAMILY = {
  id: "t-autres",
  name: "AUTRES",
  clientId: null,
  regulationId: "reg-1",
  active: true,
  nature: NATURES[0],
  criteria: [
    criterion("k-1", "p-salm", "Salmonelles", "MICRO", { mKind: "ABSENCE", n: 5, unit: "/25g", normVersionId: "v-6579" }),
    criterion("k-2", "p-ph", "pH", "CHIMIE"),
    criterion("k-3", "p-plomb", "Plomb", "CHIMIE", { unit: "mg/kg", normVersionId: "v-plomb", c: 2 }),
    criterion("k-4", "p-tvo", "TVO", "CHIMIE", { mKind: "VALUE", c: 0, m: 25, bigM: 35, unit: "mg/100g" }),
    criterion("k-5", "p-plomb", "Plomb", "CHIMIE", { active: false, normVersionId: "v-plomb-old" }),
  ],
};
const NAMES = [
  { id: "t-autres", name: "AUTRES", normalizedName: "autres", clientId: null },
  { id: "t-marque", name: "PRODUIT MARQUE A", normalizedName: "produit marque a", clientId: null },
];

/** The database both outside and inside the transaction. */
function database(
  over: { family?: unknown; samples?: unknown[]; closed?: unknown[]; names?: unknown[]; updated?: number; activeAfter?: number } = {}
) {
  for (const db of [stubs.prisma, stubs.tx]) {
    db.productType.findUnique.mockResolvedValue(over.family === undefined ? FAMILY : over.family);
    db.productType.findMany.mockResolvedValue(over.names ?? NAMES);
    db.productType.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t-new", ...data }));
    db.analysisNature.findMany.mockResolvedValue(NATURES);
    // Two reads: the open samples, then the validated reports.
    db.sample.findMany.mockImplementation(async ({ where }: { where: { status: { in: string[] } } }) =>
      where.status.in.includes("VALIDE") ? (over.closed ?? []) : (over.samples ?? [])
    );
    db.criterion.createMany.mockResolvedValue({ count: 3 });
    db.criterion.updateMany.mockResolvedValue({ count: over.updated ?? 3 });
    db.criterion.count.mockResolvedValue(over.activeAfter ?? 1);
    db.auditLog.createMany.mockResolvedValue({ count: 3 });
  }
}

const get = () => GET(new Request("http://localhost/api"), params);
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), params);
async function preview() {
  const response = await get();
  expect(response.status).toBe(200);
  return response.json();
}
const ask = (version: string, over: Record<string, unknown> = {}) => ({ domain: "CHIMIE", name: "AUTRES — physico-chimie", natureId: "n-pc", version, ...over });
const wrote = () =>
  stubs.tx.productType.create.mock.calls.length +
  stubs.tx.criterion.createMany.mock.calls.length +
  stubs.tx.criterion.updateMany.mock.calls.length +
  stubs.tx.auditLog.createMany.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  stubs.roles.length = 0;
  stubs.session.current = ADMIN;
  stubs.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(stubs.tx));
  database();
});

describe("who may split", () => {
  it("asks for the administrator only, on both verbs", async () => {
    stubs.session.current = NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    expect((await get()).status).toBe(403);
    expect((await post(ask("x"))).status).toBe(403);
    expect(stubs.roles).toEqual([["ADMIN"], ["ADMIN"]]);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("GET — the preview", () => {
  it("answers the plan and the proposed name checked against the catalogue, and writes nothing", async () => {
    const body = await preview();
    expect(body.source).toMatchObject({ name: "AUTRES", domain: "MICRO", activeRows: 4, ownRows: 1 });
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]).toMatchObject({ domain: "CHIMIE", rows: 3, proposedName: "AUTRES — physico-chimie", natureId: "n-pc", name: { taken: false, similar: [] } });
    expect(body.groups[0].natures).toEqual([{ id: "n-pc", label: "Physico-chimie des aliments" }]);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
    expect(stubs.prisma.productType.create).not.toHaveBeenCalled();
    // The open samples carrying a germ that could leave, or of a leaving domain's type d'analyse.
    const [open, closed] = stubs.prisma.sample.findMany.mock.calls.map((call) => call[0].where);
    expect(open).toEqual({
      productTypeId: "t-autres",
      status: { in: ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] },
      OR: [
        { parameters: { some: { parameterId: { in: ["p-ph", "p-plomb", "p-tvo"] } } } },
        { results: { some: { parameterId: { in: ["p-ph", "p-plomb", "p-tvo"] } } } },
        { nature: { family: { in: ["CHIMIE"] } } },
      ],
    });
    // The validated reports with a result of a leaving germ.
    expect(closed).toEqual({
      productTypeId: "t-autres",
      status: { in: ["VALIDE", "RAPPORT_ENVOYE"] },
      results: { some: { parameterId: { in: ["p-ph", "p-plomb", "p-tvo"] } } },
    });
  });

  it("never offers « Autres analyses »: its rows stay, its germs are not looked for on the samples", async () => {
    database({ family: { ...FAMILY, criteria: [...FAMILY.criteria, criterion("k-7", "p-gout", "Détermination du goût", "AUTRE")] } });
    const body = await preview();
    expect(body.groups.map((g: { domain: string }) => g.domain)).toEqual(["CHIMIE"]);
    expect(body.source).toMatchObject({ activeRows: 5, ownRows: 1 });
    expect(JSON.stringify(stubs.prisma.sample.findMany.mock.calls)).not.toContain("p-gout");
  });

  it("warns of the validated reports carrying a leaving germ and of the open physico samples left under the source", async () => {
    database({
      samples: [{ id: "s-5", code: "S-5", controlCode: "C-0005/26", status: "RECU", nature: { family: "CHIMIE" }, parameters: [], results: [] }],
      closed: [{ id: "s-9", code: "S-9", controlCode: null, status: "RAPPORT_ENVOYE", nature: { family: "MICRO" }, results: [{ parameterId: "p-plomb" }] }],
    });
    const { groups } = await preview();
    expect(groups[0]).toMatchObject({
      refusal: null,
      blockingSamples: [],
      closedSamples: [{ id: "s-9", reference: "S-9", status: "RAPPORT_ENVOYE", parameters: ["Plomb"] }],
      openOtherDomain: [{ id: "s-5", reference: "C-0005/26", status: "RECU" }],
    });
  });

  it("answers 404 for an unknown family", async () => {
    database({ family: null });
    expect((await get()).status).toBe(404);
  });
});

describe("POST — the split", () => {
  it("creates the family, copies the rows, deactivates them on the source and journals it, in one transaction", async () => {
    const { version } = await preview();
    const response = await post(ask(version));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "t-new", name: "AUTRES — physico-chimie", moved: 3, sourceActiveBefore: 4, sourceActiveAfter: 1 });

    // The rows held before they are read — its samples first, in the order of programme and intake.
    const locks = stubs.tx.$queryRaw.mock.calls.map((call) => call[0].join("?"));
    expect(locks).toEqual([
      "SELECT `id` FROM `Sample` WHERE `productTypeId` = ? FOR SHARE",
      "SELECT `id` FROM `ProductType` WHERE `id` = ? FOR UPDATE",
      "SELECT `id` FROM `Criterion` WHERE `productTypeId` = ? FOR UPDATE",
      "SELECT p.`id` FROM `AnalysisParameter` p JOIN `Criterion` c ON c.`parameterId` = p.`id` WHERE c.`productTypeId` = ? FOR SHARE OF p",
    ]);
    expect(stubs.tx.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(stubs.tx.productType.findUnique.mock.invocationCallOrder[0]);
    expect(stubs.tx.productType.create.mock.calls[0][0].data).toEqual({
      name: "AUTRES — physico-chimie",
      normalizedName: "autres physico chimie",
      family: "CHIMIE",
      natureId: "n-pc",
      clientId: null,
      active: true,
      regulationId: "reg-1",
    });
    expect(stubs.tx.criterion.createMany.mock.calls[0][0].data).toEqual([
      { productTypeId: "t-new", parameterId: "p-ph", normVersionId: null, unit: null, n: 1, c: null, mKind: "UNSPECIFIED", m: null, bigM: null, active: true },
      // A tolerance on a limitless row is not copied (F2).
      { productTypeId: "t-new", parameterId: "p-plomb", normVersionId: "v-plomb", unit: "mg/kg", n: 1, c: null, mKind: "UNSPECIFIED", m: null, bigM: null, active: true },
      { productTypeId: "t-new", parameterId: "p-tvo", normVersionId: null, unit: "mg/100g", n: 1, c: 0, mKind: "VALUE", m: 25, bigM: 35, active: true },
    ]);
    // Deactivated, never deleted — and only rows still active on the source.
    expect(stubs.tx.criterion.updateMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ["k-2", "k-3", "k-4"] }, productTypeId: "t-autres", active: true },
      data: { active: false },
    });
    const entries = stubs.tx.auditLog.createMany.mock.calls[0][0].data as { action: string; entityId: string; actorId: string; metadata: string }[];
    expect(entries.map((e) => [e.action, e.entityId, e.actorId])).toEqual([
      ["PRODUCT_TYPE_CREATED", "t-new", "u-admin"],
      ["CRITERIA_UPDATED", "t-autres", "u-admin"],
      ["CRITERIA_UPDATED", "t-new", "u-admin"],
    ]);
    expect(JSON.parse(entries[1].metadata)).toMatchObject({ name: "AUTRES", before: 5, after: 5, active: { before: 4, after: 1 } });
    expect(JSON.parse(entries[2].metadata)).toMatchObject({ before: 0, after: 3 });
  });

  it("answers 409 and writes nothing when the family changed since the preview", async () => {
    const { version } = await preview();
    // A grid saved meanwhile: one more physico row.
    database({ family: { ...FAMILY, criteria: [...FAMILY.criteria, criterion("k-6", "p-humidite", "Humidité", "CHIMIE")] } });
    const response = await post(ask(version));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(SPLIT_STALE_ERROR);
    expect(wrote()).toBe(0);
  });

  it("answers 409 with the list when open samples would lose criteria", async () => {
    database({
      samples: [
        { id: "s-1", code: "S-1", controlCode: "C-0001/26", status: "EN_ANALYSE", nature: { family: "MICRO" }, parameters: [{ parameterId: "p-ph" }], results: [{ parameterId: "p-tvo" }] },
      ],
    });
    const { version, groups } = await preview();
    expect(groups[0].blockingSamples).toEqual([{ id: "s-1", reference: "C-0001/26", status: "EN_ANALYSE", parameters: ["pH", "TVO"] }]);
    const response = await post(ask(version));
    expect(response.status).toBe(409);
    expect((await response.json()).blockingSamples).toEqual(groups[0].blockingSamples);
    expect(wrote()).toBe(0);
  });

  it("answers 409 for the family's own domain, and when nothing is of the domain asked", async () => {
    const { version } = await preview();
    expect((await post(ask(version, { domain: "MICRO", natureId: "n-micro" }))).status).toBe(409);
    database({ family: { ...FAMILY, criteria: FAMILY.criteria.filter((row) => row.parameter.family === "MICRO") } });
    const microOnly = await preview();
    const none = await post(ask(microOnly.version));
    expect(none.status).toBe(409);
    expect((await none.json()).error).toContain("Aucun critère actif du domaine « Physico-chimie »");
    expect(wrote()).toBe(0);
  });

  it("answers 400 to « Autres analyses », before any lock, nothing written", async () => {
    const { version } = await preview();
    const response = await post(ask(version, { domain: "AUTRE", natureId: "n-micro" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Domaine invalide : microbiologie ou physico-chimie.");
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
    expect(wrote()).toBe(0);
  });

  it("answers 400 for a type d'analyse of another category", async () => {
    const { version } = await preview();
    expect((await post(ask(version, { natureId: "n-pc-eaux" }))).status).toBe(400);
    expect(wrote()).toBe(0);
  });

  it("refuses a name already taken, and a near-identical one until it is confirmed", async () => {
    const { version } = await preview();
    database({ names: [...NAMES, { id: "t-x", name: "Autres - physico chimie", normalizedName: "autres physico chimie", clientId: null }] });
    expect((await post(ask(version))).status).toBe(409);
    expect(wrote()).toBe(0);

    database({ names: [...NAMES, { id: "t-x", name: "AUTRES — physico-chimies", normalizedName: "autres physico chimies", clientId: null }] });
    const similar = await post(ask(version));
    expect(similar.status).toBe(409);
    expect((await similar.json()).similar).toEqual(["AUTRES — physico-chimies"]);
    expect(wrote()).toBe(0);
    expect((await post(ask(version, { confirmSimilar: true }))).status).toBe(201);
  });

  it("answers 409 « réessayez » when a row moved under the locks — the transaction is rolled back", async () => {
    database({ updated: 2 });
    const { version } = await preview();
    const response = await post(ask(version));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(SPLIT_BUSY_ERROR);
    expect(stubs.tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("answers 400 to a body that is not a confirmation", async () => {
    for (const body of [null, { domain: "CHIMIE" }, ask("v", { confirmSimilar: "oui" })]) {
      expect((await post(body)).status).toBe(400);
    }
    const bad = await POST(new Request("http://localhost/api", { method: "POST", body: "{" }), params);
    expect(bad.status).toBe(400);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });
});
