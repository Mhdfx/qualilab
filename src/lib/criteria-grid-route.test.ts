import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { CRITERIA_GRID_BUSY_ERROR, CRITERIA_GRID_STALE_ERROR, criteriaGridVersion } from "./criteria-input";

/**
 * PUT /api/product-types/[id]/criteria — the grid saved with the version of
 * the rows it loaded (`criteriaGridVersion`). The case it is there for: a
 * grid opened before « Scinder par domaine » (or kept on screen by
 * router.refresh(), or in another tab) saved afterwards would send the moved
 * rows back as active and turn them on again on the source — the same
 * criteria active in both families, nothing reported. The handler runs for
 * real; the database, its transaction and the session guard are stubbed.
 */

const stubs = vi.hoisted(() => {
  const tx = {
    // The family's lock answers its row: the family exists.
    $queryRaw: vi.fn<(query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>>(async () => [{ id: "t-autres" }]),
    productType: { findUnique: vi.fn() },
    criterion: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  };
  const prisma = {
    analysisParameter: { findMany: vi.fn() },
    normVersion: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { tx, prisma, audit: vi.fn(), session: { current: null as unknown } };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.audit }));
vi.mock("@/lib/auth", () => ({ requireApiRole: async () => stubs.session.current }));

import { PUT } from "../app/api/product-types/[id]/criteria/route";

const ADMIN = { id: "u-admin", username: "admin", name: "Administrateur", role: "ADMIN", mustChangePassword: false };
const params = { params: Promise.resolve({ id: "t-autres" }) };
const LOADED_AT = new Date("2026-10-19T07:22:37.015Z");
const SPLIT_AT = new Date("2026-10-23T15:26:47.120Z");

/** A stored row of « AUTRES »: Salmonelles (micro), pH and Plomb (physico). */
const stored = (id: string, parameterId: string, over: Record<string, unknown> = {}) => ({
  id,
  parameterId,
  normVersionId: null,
  n: 1,
  c: null,
  mKind: "ABSENCE",
  m: null,
  bigM: null,
  unit: null,
  active: true,
  updatedAt: LOADED_AT,
  ...over,
});
const BEFORE = [stored("k-1", "p-salm"), stored("k-2", "p-ph"), stored("k-3", "p-plomb")];
/** The same rows once the split deactivated the two physico rows (`updateMany` writes their updatedAt). */
const AFTER_SPLIT = [stored("k-1", "p-salm"), stored("k-2", "p-ph", { active: false, updatedAt: SPLIT_AT }), stored("k-3", "p-plomb", { active: false, updatedAt: SPLIT_AT })];

/** The grid as the page showed it: every row as loaded — active — plus what was typed. */
const sent = (rows: ReturnType<typeof stored>[], over: Record<string, Record<string, unknown>> = {}) =>
  rows.map((row) => ({ id: row.id, parameterId: row.parameterId, normVersionId: null, unit: "", n: String(row.n), c: "", mKind: row.mKind, m: "", bigM: "", active: row.active, ...over[row.id] }));

const put = (body: unknown) => PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }), params);
const wrote = () => stubs.tx.criterion.deleteMany.mock.calls.length + stubs.tx.criterion.update.mock.calls.length + stubs.tx.criterion.create.mock.calls.length;

function database(rows: ReturnType<typeof stored>[]) {
  stubs.tx.productType.findUnique.mockResolvedValue({ name: "AUTRES", criteria: rows });
  stubs.tx.criterion.findMany.mockResolvedValue(rows.map((row) => ({ ...row, parameter: { name: row.parameterId }, normVersion: null })));
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.session.current = ADMIN;
  stubs.prisma.analysisParameter.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })));
  stubs.prisma.normVersion.findMany.mockResolvedValue([]);
  stubs.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(stubs.tx));
  database(BEFORE);
});

describe("criteriaGridVersion — the rows a grid was loaded from", () => {
  it("is the same whatever the order, and from a Date or its ISO text (the page sends text, the route reads Dates)", () => {
    const asText = BEFORE.map((row) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }));
    expect(criteriaGridVersion([...BEFORE].reverse())).toBe(criteriaGridVersion(BEFORE));
    expect(criteriaGridVersion(asText)).toBe(criteriaGridVersion(BEFORE));
  });

  it("changes with a split, a row written elsewhere, a row added or deleted", () => {
    const base = criteriaGridVersion(BEFORE);
    expect(criteriaGridVersion(AFTER_SPLIT)).not.toBe(base);
    expect(criteriaGridVersion([BEFORE[0], BEFORE[1], { ...BEFORE[2], updatedAt: new Date(LOADED_AT.getTime() + 1) }])).not.toBe(base);
    expect(criteriaGridVersion([...BEFORE, stored("k-4", "p-tvo")])).not.toBe(base);
    expect(criteriaGridVersion(BEFORE.slice(0, 2))).not.toBe(base);
  });
});

describe("PUT — a grid loaded before the rows changed", () => {
  it("refuses the grid opened before « Scinder par domaine » — 409, the split's rows stay inactive, nothing journaled", async () => {
    const version = criteriaGridVersion(BEFORE);
    database(AFTER_SPLIT);
    // One cell typed on the stale grid: every row goes back with active: true.
    const response = await put({ version, criteria: sent(BEFORE, { "k-1": { unit: "/25g" } }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(CRITERIA_GRID_STALE_ERROR);
    expect(wrote()).toBe(0);
    expect(stubs.audit).not.toHaveBeenCalled();
  });

  it("holds the family, then its rows, before reading them", async () => {
    await put({ version: criteriaGridVersion(BEFORE), criteria: sent(BEFORE) });
    const locks = stubs.tx.$queryRaw.mock.calls.map((call) => call[0].join("?"));
    expect(locks).toEqual(["SELECT `id` FROM `ProductType` WHERE `id` = ? FOR UPDATE", "SELECT `id` FROM `Criterion` WHERE `productTypeId` = ? FOR UPDATE"]);
    expect(stubs.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(stubs.tx.productType.findUnique.mock.invocationCallOrder[0]);
  });

  it("saves the grid loaded from the rows as they are — the one the page shows after the split", async () => {
    database(AFTER_SPLIT);
    const response = await put({ version: criteriaGridVersion(AFTER_SPLIT), criteria: sent(AFTER_SPLIT, { "k-1": { unit: "/25g" } }) });
    expect(response.status).toBe(200);
    // Only the row typed in is written; the split's rows stay as they are.
    expect(stubs.tx.criterion.update.mock.calls.map((call) => [call[0].where.id, call[0].data.active, call[0].data.unit])).toEqual([["k-1", true, "/25g"]]);
    expect(stubs.audit).toHaveBeenCalledTimes(1);
  });

  it("does not check a save that sends no version (a script), and refuses a version that is not one", async () => {
    expect((await put({ criteria: sent(BEFORE) })).status).toBe(200);
    vi.clearAllMocks();
    stubs.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(stubs.tx));
    for (const version of [12, "x".repeat(65), { v: 1 }]) {
      expect((await put({ version, criteria: sent(BEFORE) })).status).toBe(400);
    }
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("answers 409 « réessayez » when another write held the rows through the save — rolled back, nothing journaled", async () => {
    stubs.prisma.$transaction.mockRejectedValue(Object.assign(new Error("Transaction already closed"), { code: "P2028" }));
    const response = await put({ version: criteriaGridVersion(BEFORE), criteria: sent(BEFORE) });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(CRITERIA_GRID_BUSY_ERROR);
    expect(stubs.audit).not.toHaveBeenCalled();
  });

  it("answers 403 to whoever the guard turns away", async () => {
    stubs.session.current = NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    expect((await put({ criteria: sent(BEFORE) })).status).toBe(403);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });
});
