import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot 5B, revue du 21/11 (risk 1 of RETOUR-LABO-20-11.md §6) — PUT
 * /api/admin/historique/liens never moves another client's history on a
 * number alone: « Rattacher à ce client » with 2330 typed for 2303 used to
 * re-point a whole history, thousands of samples, with no confirmation.
 * The handler runs for real; the database, its transaction and the session
 * guard are stubbed.
 */

type Link = { clientId: string | null; matchedBy: string; legacyName: string; client: { name: string } | null };

const stubs = vi.hoisted(() => {
  const state = { link: null as Link | null };
  const tx = {
    legacyClientLink: {
      findUnique: vi.fn(async () => state.link),
      upsert: vi.fn(async () => ({})),
    },
    legacySample: {
      count: vi.fn(async () => 2764),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 2764 })),
    },
    site: { findMany: vi.fn(async () => []) },
  };
  const prisma = {
    client: { findUnique: vi.fn(async () => ({ archived: false, mergedIntoId: null })) },
    site: { findUnique: vi.fn() },
    $transaction: vi.fn(async (run: (t: typeof tx) => unknown) => run(tx)),
  };
  return { state, tx, prisma, audit: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.audit }));
vi.mock("@/lib/auth", () => ({ requireApiRole: async () => ({ id: "u-admin", role: "ADMIN" }) }));

import { PUT } from "../app/api/admin/historique/liens/route";

const put = (body: Record<string, unknown>) =>
  PUT(new Request("http://local/api/admin/historique/liens", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  stubs.state.link = { clientId: "other", matchedBy: "NOM", legacyName: "Traiteur Atlas", client: { name: "Traiteur Atlas SARL" } };
});

describe("PUT /api/admin/historique/liens — another client's link", () => {
  it("409 with the current fiche and the samples; nothing written, nothing journalled", async () => {
    const response = await put({ legacyClientId: 2330, clientId: "here" });
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.conflict).toEqual({ legacyName: "Traiteur Atlas", clientName: "Traiteur Atlas SARL", samples: 2764 });
    expect(data.error).toContain("« Traiteur Atlas SARL »");
    expect(stubs.tx.legacyClientLink.upsert).not.toHaveBeenCalled();
    expect(stubs.tx.legacySample.updateMany).not.toHaveBeenCalled();
    expect(stubs.tx.legacySample.deleteMany).not.toHaveBeenCalled();
    expect(stubs.audit).not.toHaveBeenCalled();
  });

  it("« Ne pas reprendre » from another fiche: 409 too (its samples are not deleted)", async () => {
    const response = await put({ legacyClientId: 2330, clientId: null, expectedClientId: "here" });
    expect(response.status).toBe(409);
    expect(stubs.tx.legacySample.deleteMany).not.toHaveBeenCalled();
  });

  it("with `replace` (the lookup seen, the move confirmed): moved and journalled", async () => {
    const response = await put({ legacyClientId: 2330, clientId: "here", replace: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, moved: 2764 });
    expect(stubs.tx.legacyClientLink.upsert).toHaveBeenCalledTimes(1);
    expect(stubs.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "LEGACY_CLIENT_LINKED", metadata: expect.objectContaining({ replace: true }) }));
  });

  it("a number nobody holds, or held by this fiche: no confirmation needed", async () => {
    stubs.state.link = null;
    expect((await put({ legacyClientId: 2303, clientId: "here" })).status).toBe(200);
    stubs.state.link = { clientId: "here", matchedBy: "NOM", legacyName: "X", client: { name: "X" } };
    expect((await put({ legacyClientId: 2303, clientId: "here" })).status).toBe(200);
  });

  it("« Retirer » from the fiche that holds it: allowed", async () => {
    const response = await put({ legacyClientId: 2330, clientId: null, expectedClientId: "other" });
    expect(response.status).toBe(200);
    expect(stubs.tx.legacySample.deleteMany).toHaveBeenCalledWith({ where: { legacyClientId: 2330 } });
  });
});
