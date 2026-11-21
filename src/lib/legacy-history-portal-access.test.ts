import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot 5B, HA6 (RETOUR-LABO-20-11.md §6) — the portal's routes of the history
 * run for real (route → loader → `legacyHistoryWhere`) over an in-memory
 * table: a client reads its own samples, never another client's (404, as a
 * sample that does not exist), never a cancelled one; the switch off, the
 * routes answer 404. Only the session and the database are stood in for.
 */

vi.mock("server-only", () => ({}));

type Row = { id: number; clientId: string; cancelled: boolean; controlNumber: string; sampledAt: Date | null };
const table: Row[] = [
  { id: 1, clientId: "A", cancelled: false, controlNumber: "1/26", sampledAt: new Date("2026-01-02") },
  { id: 2, clientId: "A", cancelled: true, controlNumber: "2/26", sampledAt: new Date("2026-01-03") },
  { id: 3, clientId: "B", cancelled: false, controlNumber: "3/26", sampledAt: new Date("2026-01-04") },
];

type Where = { id?: number; clientId?: string; cancelled?: boolean; AND?: unknown[] };
const matches = (row: Row, where: Where) =>
  (where.id === undefined || row.id === where.id) &&
  (where.clientId === undefined || row.clientId === where.clientId) &&
  (where.cancelled === undefined || row.cancelled === where.cancelled);
const shape = (row: Row) => ({
  id: row.id,
  controlNumber: row.controlNumber,
  serieNumber: null,
  designation: null,
  lot: null,
  place: null,
  nature: null,
  sampledAt: row.sampledAt,
  reportNumber: null,
  reportedAt: null,
  interpretation: null,
  verdictLabel: null,
  site: null,
  productType: null,
  receivedAt: null,
  conclusion: null,
  observation: null,
  amendmentNote: null,
  results: [],
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    legacySample: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const row = table.find((r) => matches(r, where));
        return row ? shape(row) : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) => table.filter((r) => matches(r, where)).map(shape)),
      count: vi.fn(async ({ where }: { where: Where }) => table.filter((r) => matches(r, where)).length),
    },
  },
}));

const session = { clientId: "A" };
vi.mock("@/lib/portal-server", () => ({
  requirePortalApi: vi.fn(async () => ({ session: { id: "u1" }, clientId: session.clientId })),
  portalNotFound: () => NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 }),
}));

const switches = { on: true };
vi.mock("@/lib/lab-proposals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lab-proposals")>();
  return {
    ...actual,
    get LEGACY_HISTORY_ON_PORTAL() {
      return switches.on;
    },
  };
});

const detail = await import("@/app/api/portail/historique/[id]/route");
const list = await import("@/app/api/portail/historique/route");
const call = (id: string) => detail.GET(new Request(`http://local/api/portail/historique/${id}`), { params: Promise.resolve({ id }) });

describe("the portal's history: a client's own samples only", () => {
  beforeEach(() => {
    session.clientId = "A";
    switches.on = true;
  });

  it("reads its own sample", async () => {
    const response = await call("1");
    expect(response.status).toBe(200);
    expect((await response.json()).controlNumber).toBe("1/26");
  });

  it("another client's sample: 404, as one that does not exist", async () => {
    expect((await call("3")).status).toBe(404);
    expect((await call("999")).status).toBe(404);
    session.clientId = "B";
    expect((await call("1")).status).toBe(404);
    expect((await call("3")).status).toBe(200);
  });

  it("a sample cancelled in the old software is never shown; a malformed id is not found", async () => {
    expect((await call("2")).status).toBe(404);
    expect((await call("1x")).status).toBe(404);
  });

  it("the list holds the account's client's samples only, whatever the URL says", async () => {
    const response = await list.GET(new Request("http://local/api/portail/historique?client=B&clientId=B"));
    const body = await response.json();
    expect(body.rows.map((r: { id: number }) => r.id)).toEqual([1]);
    expect(body.total).toBe(1);
  });

  it("LEGACY_HISTORY_ON_PORTAL off: the routes answer 404", async () => {
    switches.on = false;
    expect((await call("1")).status).toBe(404);
    expect((await list.GET(new Request("http://local/api/portail/historique"))).status).toBe(404);
  });
});
