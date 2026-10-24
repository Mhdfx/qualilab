import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVOCATION_MARKER_PREFIX } from "./session-revocation";
import { revocationMarkerIdentifier } from "./session-revocation-server";

/**
 * PATCH /api/admin/users/[id] leaves a marker per session it closes, in the
 * same transaction as the closing, so the person's next page says why
 * (session-revocation.ts); a re-enabling removes the « désactivé » ones. The
 * handler runs for real; the database, Better
 * Auth and the guard are stubbed, and what they are asked to write is
 * checked.
 */

const stubs = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    account: { updateMany: vi.fn() },
    session: { deleteMany: vi.fn(), findMany: vi.fn() },
    verification: { createMany: vi.fn(), deleteMany: vi.fn() },
    sample: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma, logAudit: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.logAudit }));
vi.mock("@/lib/auth-server", () => ({
  auth: { $context: Promise.resolve({ password: { hash: async (value: string) => `hash(${value})` } }) },
}));
vi.mock("@/lib/auth", () => ({
  requireApiRole: async () => ({ id: "u-admin", username: "admin", name: "Administrateur", role: "ADMIN", mustChangePassword: false }),
}));

import { PATCH } from "../app/api/admin/users/[id]/route";

const params = { params: Promise.resolve({ id: "u-x" }) };
const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), params);

const LIVE = new Date(Date.now() + 2 * 24 * 3600e3);
const SESSIONS = [
  { token: "tok-poste", expiresAt: LIVE },
  { token: "tok-telephone", expiresAt: LIVE },
];

/** The operations handed to `$transaction`, by name. */
function operations(): { op: string; args: { data?: unknown } }[] {
  return stubs.prisma.$transaction.mock.calls[0][0];
}

function account(role: string, clientId: string | null = null, banned = false) {
  stubs.prisma.user.findUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => ({
    id: "u-x",
    username: "x.nom",
    name: "Personne Test",
    role,
    banned,
    clientId,
    documentName: null,
    mustChangePassword: false,
    ...(select.client ? { client: null } : {}),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  account("TECHNICIEN");
  stubs.prisma.user.update.mockImplementation((args: unknown) => ({ op: "user.update", args }));
  stubs.prisma.account.updateMany.mockImplementation((args: unknown) => ({ op: "account.updateMany", args }));
  stubs.prisma.session.deleteMany.mockImplementation((args: unknown) => ({ op: "session.deleteMany", args }));
  stubs.prisma.verification.createMany.mockImplementation((args: unknown) => ({ op: "verification.createMany", args }));
  stubs.prisma.verification.deleteMany.mockImplementation((args: unknown) => ({ op: "verification.deleteMany", args }));
  stubs.prisma.session.findMany.mockResolvedValue(SESSIONS);
  stubs.prisma.client.findUnique.mockResolvedValue({ id: "c-test", name: "TEST UI V19 Client", archived: false, mergedIntoId: null });
  stubs.prisma.sample.count.mockResolvedValue(0);
  stubs.prisma.$transaction.mockResolvedValue([]);
});

const markers = (cause: string) =>
  SESSIONS.map((session) => ({ identifier: revocationMarkerIdentifier(session.token), value: `${cause}:u-x`, expiresAt: LIVE }));

describe("PATCH /api/admin/users/[id] — the markers of the sessions it closes", () => {
  it("a reset: one marker per session, written before the sessions are deleted, in the same transaction", async () => {
    expect((await patch({ password: "reinit-456" })).status).toBe(200);
    expect(stubs.prisma.session.findMany).toHaveBeenCalledWith({ where: { userId: "u-x" }, select: { token: true, expiresAt: true } });
    expect(operations().map((operation) => operation.op)).toEqual([
      "user.update",
      "account.updateMany",
      "verification.createMany",
      "session.deleteMany",
    ]);
    expect(operations()[2].args).toEqual({ data: markers("PASSWORD_RESET") });
  });

  it("a disabling says « désactivé », even with a reset in the same request", async () => {
    await patch({ banned: true });
    expect(operations().find((operation) => operation.op === "verification.createMany")?.args).toEqual({ data: markers("DISABLED") });
    vi.clearAllMocks();
    stubs.prisma.session.findMany.mockResolvedValue(SESSIONS);
    await patch({ banned: true, password: "reinit-456" });
    expect(operations().find((operation) => operation.op === "verification.createMany")?.args).toEqual({ data: markers("DISABLED") });
  });

  it("a portal account given another client: « Vos accès ont été modifiés »", async () => {
    account("CLIENT", "c-ancien");
    await patch({ clientId: "c-test" });
    expect(operations().find((operation) => operation.op === "verification.createMany")?.args).toEqual({ data: markers("ACCESS_CHANGED") });
  });

  it("a re-enabling deletes the account's « désactivé » markers, in the same transaction, and closes nothing", async () => {
    account("TECHNICIEN", null, true);
    expect((await patch({ banned: false })).status).toBe(200);
    expect(operations().map((operation) => operation.op)).toEqual(["user.update", "verification.deleteMany"]);
    expect(operations()[1].args).toEqual({
      where: { identifier: { startsWith: REVOCATION_MARKER_PREFIX }, value: "DISABLED:u-x" },
    });
    expect(stubs.prisma.session.findMany).not.toHaveBeenCalled();
    expect(stubs.logAudit.mock.calls.map(([entry]) => entry.action)).toEqual(["USER_ENABLED"]);
  });

  it("a re-enabling with a reset: the « désactivé » markers go, the sessions are closed as « réinitialisé »", async () => {
    account("TECHNICIEN", null, true);
    await patch({ banned: false, password: "reinit-456" });
    expect(operations().map((operation) => operation.op)).toEqual([
      "user.update",
      "account.updateMany",
      "verification.deleteMany",
      "verification.createMany",
      "session.deleteMany",
    ]);
    expect(operations()[3].args).toEqual({ data: markers("PASSWORD_RESET") });
  });

  it("a disabling deletes no marker", async () => {
    await patch({ banned: true });
    expect(operations().map((operation) => operation.op)).not.toContain("verification.deleteMany");
  });

  it("a change that closes nothing reads no session and leaves no marker", async () => {
    for (const body of [{ role: "VALIDATEUR" }, { banned: false }, { documentName: "Technicien de QUALILAB 'X.NOM'" }]) {
      vi.clearAllMocks();
      await patch(body);
      expect(stubs.prisma.session.findMany, JSON.stringify(body)).not.toHaveBeenCalled();
      const ops = (stubs.prisma.$transaction.mock.calls[0]?.[0] ?? []) as { op: string }[];
      expect(ops.map((operation) => operation.op), JSON.stringify(body)).not.toContain("verification.createMany");
      expect(ops.map((operation) => operation.op), JSON.stringify(body)).not.toContain("session.deleteMany");
    }
  });

  it("no open session: the closing still runs, without a marker", async () => {
    stubs.prisma.session.findMany.mockResolvedValue([]);
    await patch({ password: "reinit-456" });
    expect(operations().map((operation) => operation.op)).toEqual(["user.update", "account.updateMany", "session.deleteMany"]);
  });

  it("a refused change reads and writes nothing", async () => {
    expect((await patch({ password: "court" })).status).toBe(400);
    expect(stubs.prisma.session.findMany).not.toHaveBeenCalled();
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("the journal is unchanged: the reset and the flag, as before", async () => {
    await patch({ password: "reinit-456" });
    expect(stubs.logAudit.mock.calls.map(([entry]) => entry.action)).toEqual(["USER_PASSWORD_RESET", "USER_PASSWORD_CHANGE_REQUIRED"]);
  });
});
