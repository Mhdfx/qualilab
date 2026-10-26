import { beforeEach, describe, expect, it, vi } from "vitest";
import { seesBilling } from "./price-access";
import type { Role } from "./roles";

/**
 * « Client facturé de » / « Facturé à » (who pays — CLIENTS-FUSION.md §4)
 * in the answers of the client base's routes, per role — the owner's rule
 * of 25/10 (`clientForRole` / `siteForRole`). The handlers run for real,
 * with the guard deciding as `requireApiRole` does (`roleAllowed`); the
 * database and the journal are stubbed. Every answer is walked to its
 * leaves: a reshaped answer (a nested client, a new field) that carries who
 * pays to a role outside the billing fails here, not only the source text.
 * Invented names only.
 */

const stubs = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    client: { findMany: vi.fn(), create: vi.fn() },
    site: { create: vi.fn() },
    clientPlace: { createMany: vi.fn() },
  };
  const prisma = {
    client: { findMany: vi.fn(), findUnique: vi.fn() },
    site: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    auditLog: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { tx, prisma, role: { current: "ADMIN" as string }, audit: vi.fn() };
});

const sessionOf = (role: string) => ({ id: `u-${role.toLowerCase()}`, username: role.toLowerCase(), name: role, role, mustChangePassword: false });

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.audit }));
vi.mock("@/lib/auth", async () => {
  const { NextResponse } = await import("next/server");
  const { roleAllowed } = await import("@/lib/roles");
  return {
    requireApiRole: async (...allowed: Role[]) =>
      roleAllowed(stubs.role.current as Role, allowed)
        ? sessionOf(stubs.role.current)
        : NextResponse.json({ error: "Accès refusé." }, { status: 403 }),
  };
});

import { GET as clientsGet, POST as clientsPost } from "../app/api/clients/route";
import { GET as sitesGet, POST as sitesPost } from "../app/api/clients/[id]/sites/route";

/** Who pays, in every shape the schema knows it. */
const WHO_PAYS = ["billedFor", "billedForId", "billingClient", "billingClientId"];

/** Every key of an answer, at any depth. */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      keysOf(child, into);
    }
  }
  return into;
}

const PAYER = { id: "c-payeur", name: "Client payeur test" };
const liveClient = (id: string, name: string, sites: { id: string; name: string }[] = []) => ({
  id,
  name,
  archived: false,
  mergedIntoId: null,
  mergedInto: null,
  ice: null,
  contact: null,
  email: null,
  phone: null,
  address: null,
  billedForId: PAYER.id,
  billedFor: PAYER,
  sites,
});
const LIVE = [
  liveClient("c1", "Client test A", [{ id: "s1", name: "Site test 1" }]),
  liveClient("c2", "Client test B"),
  liveClient("c3", "Groupe test C", [{ id: "s3", name: "Client test — dépôt" }]),
];
const FICHE = { id: "f1", name: "Client test ancien", archived: true, mergedIntoId: "c2" };

const site = (id: string, name: string) => ({
  id,
  code: null,
  name,
  address: null,
  city: null,
  phone: null,
  contact: null,
  active: true,
  billingClientId: PAYER.id,
  billingClient: PAYER,
});

/** The roles the matrix runs: three outside the billing, the four billing roles. */
const ROLES: Role[] = ["PRELEVEUR", "RECEPTIONNISTE", "VALIDATEUR", "GESTIONNAIRE", "COMPTABLE", "ADMIN", "DIRECTION"];

beforeEach(() => {
  vi.clearAllMocks();
  stubs.audit.mockResolvedValue(undefined);
  stubs.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(stubs.tx));
  // The client reads, told apart by their `where`: by ids (the sites' clients,
  // the fiche's parent), the archived fiches, the search by name (one direct
  // match), the whole list.
  stubs.prisma.client.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const ids = (where.id as { in?: string[] } | undefined)?.in;
    if (ids) return LIVE.filter((client) => ids.includes(client.id));
    if (where.archived === true) return [FICHE];
    if (where.name || where.OR) return [LIVE[0]];
    return LIVE;
  });
  stubs.prisma.site.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.clientId ? [site("s1", "Site test 1")] : [{ id: "s3", name: "Client test — dépôt", clientId: "c3" }]
  );
  stubs.prisma.auditLog.findMany.mockResolvedValue([]);
  stubs.prisma.client.findUnique.mockResolvedValue({ id: "c1", archived: false });
  stubs.prisma.site.findUnique.mockResolvedValue(null);
  stubs.prisma.site.create.mockResolvedValue(site("s9", "Site test neuf"));
  stubs.tx.$queryRaw.mockResolvedValue([]);
  stubs.tx.client.findMany.mockResolvedValue([]);
  stubs.tx.client.create.mockResolvedValue({ ...liveClient("c9", "Client test neuf"), emails: [] });
  stubs.tx.site.create.mockResolvedValue({ id: "s8", name: "Site test du client neuf", city: null });
  stubs.tx.clientPlace.createMany.mockResolvedValue({ count: 0 });
});

const params = (id = "c1") => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body) });

/** One call per role: who is admitted, and what the answer carries of who pays. */
async function matrix(
  admitted: readonly Role[],
  call: () => Promise<Response>,
  expected: { status: number; whoPays: string[] }
) {
  for (const role of ROLES) {
    stubs.role.current = role;
    const response = await call();
    if (!admitted.includes(role)) {
      expect(response.status, role).toBe(403);
      continue;
    }
    expect(response.status, role).toBe(expected.status);
    const keys = keysOf(await response.json());
    expect(keys.has("id"), role).toBe(true);
    if (seesBilling(role)) {
      for (const key of expected.whoPays) expect(keys.has(key), `${role}: ${key}`).toBe(true);
    } else {
      expect(WHO_PAYS.filter((key) => keys.has(key)), role).toEqual([]);
    }
  }
}

describe("GET /api/clients — who pays for a client, per role", () => {
  const EVERY_CIRCUIT_ROLE: Role[] = ["PRELEVEUR", "RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "ADMIN"];

  it("the whole list: « client facturé de » for the billing roles only", async () => {
    await matrix(EVERY_CIRCUIT_ROLE, () => clientsGet(new Request("http://localhost/api/clients")), {
      status: 200,
      whoPays: ["billedFor", "billedForId"],
    });
  });

  it("the pickers' search (?q=), with the rows found through a site and an archived fiche", async () => {
    stubs.role.current = "ADMIN";
    const rows = (await (await clientsGet(new Request("http://localhost/api/clients?q=Client%20test"))).json()) as {
      id: string;
      matchedSiteId?: string | null;
    }[];
    // The matrix below walks every kind of row: a direct one, one through a site, one through a fiche.
    expect(rows.some((row) => row.matchedSiteId === "s3")).toBe(true);
    expect(rows.some((row) => row.id === "c2" && row.matchedSiteId === null)).toBe(true);

    await matrix(EVERY_CIRCUIT_ROLE, () => clientsGet(new Request("http://localhost/api/clients?q=Client%20test")), {
      status: 200,
      whoPays: ["billedFor", "billedForId"],
    });
  });

  it("refuses the technician (the blind bench) before reading anything", async () => {
    stubs.role.current = "TECHNICIEN";
    expect((await clientsGet(new Request("http://localhost/api/clients"))).status).toBe(403);
    expect(stubs.prisma.client.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/clients — the new client as the pickers carry it, per role", () => {
  const CREATORS: Role[] = ["GESTIONNAIRE", "ADMIN", "RECEPTIONNISTE", "PRELEVEUR"];
  const create = () => clientsPost(new Request("http://localhost/api/clients", json({ name: "Client test neuf", sites: [{ name: "Site test du client neuf" }] })));

  it("201: « client facturé de » for the billing roles only", async () => {
    await matrix(CREATORS, create, { status: 201, whoPays: ["billedForId"] });
  });

  it("409 on an exact name: the client offered carries who pays for nobody", async () => {
    stubs.tx.$queryRaw.mockResolvedValue([{ id: "c1" }]);
    for (const role of CREATORS) {
      stubs.role.current = role;
      const response = await create();
      expect(response.status, role).toBe(409);
      const body = await response.json();
      expect(body.existing?.id, role).toBe("c1");
      expect(WHO_PAYS.filter((key) => keysOf(body).has(key)), role).toEqual([]);
    }
  });
});

describe("GET/POST /api/clients/[id]/sites — « Facturé à », per role", () => {
  it("the client's sites: « Facturé à » for the billing roles only", async () => {
    await matrix(["PRELEVEUR", "RECEPTIONNISTE", "GESTIONNAIRE", "COMPTABLE", "ADMIN"], () => sitesGet(new Request("http://localhost/api"), params()), {
      status: 200,
      whoPays: ["billingClient", "billingClientId"],
    });
  });

  it("201 on a new site: « Facturé à » for the billing roles only", async () => {
    await matrix(
      ["PRELEVEUR", "RECEPTIONNISTE", "GESTIONNAIRE", "ADMIN"],
      () => sitesPost(new Request("http://localhost/api", json({ name: "Site test neuf" })), params()),
      { status: 201, whoPays: ["billingClient", "billingClientId"] }
    );
  });
});
