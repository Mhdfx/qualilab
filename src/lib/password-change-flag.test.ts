import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1) — who writes
 * `User.mustChangePassword`: the administrator's creation and reset set it,
 * the person's own change clears it, nothing else touches it. The route
 * handlers run here for real; the database, Better Auth and the session
 * guard are stubbed, and what they are asked to write is checked.
 */

const stubs = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    client: { findUnique: vi.fn() },
    account: { updateMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    sample: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    createUser: vi.fn(),
    changePassword: vi.fn(),
    logAudit: vi.fn(),
    session: { current: null as null | Record<string, unknown> },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.logAudit }));
vi.mock("@/lib/auth-server", () => ({
  auth: {
    api: { createUser: stubs.createUser, changePassword: stubs.changePassword },
    $context: Promise.resolve({ password: { hash: async (value: string) => `hash(${value})` } }),
  },
  internalEmailFor: (userName: string) => `${userName}@qualilab.local`,
}));
// The guards themselves are tested in password-change-guards.test.ts: here
// they hand the signed-in account to the handler.
vi.mock("@/lib/auth", () => ({
  requireApiRole: async () => stubs.session.current,
  passwordChangeGuards: { requireApiRole: async () => stubs.session.current },
}));

import { POST as createAccount } from "../app/api/admin/users/route";
import { PATCH as updateAccount } from "../app/api/admin/users/[id]/route";
import { POST as changeStaffPassword } from "../app/api/compte/mot-de-passe/route";
import { POST as changePortalPassword } from "../app/api/portail/compte/mot-de-passe/route";

const ADMIN = { id: "u-admin", username: "admin", name: "Administrateur", role: "ADMIN", mustChangePassword: false };

function json(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The `{ action, metadata }` of each journal entry written. */
function journal(): { action: string; entityId: unknown; metadata: unknown }[] {
  return stubs.logAudit.mock.calls.map(([entry]) => ({
    action: entry.action,
    entityId: entry.entityId,
    metadata: entry.metadata,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.session.current = ADMIN;
  stubs.prisma.user.findFirst.mockResolvedValue(null);
  // What Prisma hands `$transaction`; awaited alone, it is the result.
  stubs.prisma.user.update.mockImplementation((args: unknown) => ({ op: "user.update", args }));
  stubs.prisma.user.updateMany.mockResolvedValue({ count: 0 });
  stubs.prisma.account.updateMany.mockImplementation((args: unknown) => ({ op: "account.updateMany", args }));
  stubs.prisma.session.deleteMany.mockImplementation((args: unknown) => ({ op: "session.deleteMany", args }));
  stubs.prisma.sample.count.mockResolvedValue(0);
  stubs.prisma.$transaction.mockResolvedValue([]);
});

describe("POST /api/admin/users — an account created by the administrator", () => {
  beforeEach(() => {
    stubs.createUser.mockImplementation(async ({ body }: { body: { data: Record<string, unknown> } }) => ({
      user: { id: "u-new", ...body.data },
    }));
  });

  it("is written with « mot de passe à changer », in the same insert", async () => {
    const response = await createAccount(
      json({ name: "Personne Test", username: "x.nom", password: "initial-123", role: "TECHNICIEN" })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "u-new", mustChangePassword: true });
    expect(stubs.createUser).toHaveBeenCalledTimes(1);
    expect(stubs.createUser.mock.calls[0][0].body.data).toMatchObject({ mustChangePassword: true });
    // Written with the account: no second write.
    expect(stubs.prisma.user.update).not.toHaveBeenCalled();
    expect(journal()).toEqual([
      expect.objectContaining({ action: "USER_CREATED", entityId: "u-new" }),
      { action: "USER_PASSWORD_CHANGE_REQUIRED", entityId: "u-new", metadata: { username: "x.nom", reason: "CREATED" } },
    ]);
  });

  it("a client's portal account too", async () => {
    stubs.prisma.client.findUnique.mockResolvedValue({ id: "c-test", name: "TEST UI V17 Client", archived: false, mergedIntoId: null });
    const response = await createAccount(
      json({ name: "Personne Test", username: "x.portail", password: "initial-123", role: "CLIENT", clientId: "c-test" })
    );
    expect(response.status).toBe(201);
    expect(stubs.createUser.mock.calls[0][0].body.data).toMatchObject({ mustChangePassword: true, clientId: "c-test" });
    expect(journal().map((entry) => entry.action)).toEqual(["USER_CREATED", "USER_PASSWORD_CHANGE_REQUIRED"]);
  });

  it("writes the flag itself should the auth layer ever drop it", async () => {
    stubs.createUser.mockResolvedValue({ user: { id: "u-new" } });
    const response = await createAccount(
      json({ name: "Personne Test", username: "x.nom", password: "initial-123", role: "PRELEVEUR" })
    );
    expect(response.status).toBe(201);
    expect(stubs.prisma.user.update).toHaveBeenCalledWith({ where: { id: "u-new" }, data: { mustChangePassword: true } });
  });

  it("writes nothing when the creation is refused", async () => {
    const response = await createAccount(json({ name: "Personne Test", username: "x.nom", password: "court", role: "TECHNICIEN" }));
    expect(response.status).toBe(400);
    expect(stubs.createUser).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users/[id] — the administrator's changes to an account", () => {
  const params = { params: Promise.resolve({ id: "u-tech" }) };
  const patch = (body: unknown) =>
    updateAccount(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), params);

  beforeEach(() => {
    stubs.prisma.user.findUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => ({
      id: "u-tech",
      username: "x.nom",
      name: "Personne Test",
      role: "TECHNICIEN",
      banned: false,
      clientId: null,
      documentName: null,
      mustChangePassword: false,
      ...(select.client ? { client: null } : {}),
    }));
  });

  it("a password reset sets the flag in the reset's transaction and closes the sessions", async () => {
    const response = await patch({ password: "reinit-456" });
    expect(response.status).toBe(200);
    expect(stubs.prisma.user.update).toHaveBeenCalledWith({ where: { id: "u-tech" }, data: { mustChangePassword: true } });
    const operations = stubs.prisma.$transaction.mock.calls[0][0] as { op: string; args: unknown }[];
    expect(operations.map((operation) => operation.op)).toEqual(["user.update", "account.updateMany", "session.deleteMany"]);
    expect(operations[1].args).toEqual({
      where: { userId: "u-tech", providerId: "credential" },
      data: { password: "hash(reinit-456)" },
    });
    expect(journal()).toEqual([
      { action: "USER_PASSWORD_RESET", entityId: "u-tech", metadata: { username: "x.nom" } },
      { action: "USER_PASSWORD_CHANGE_REQUIRED", entityId: "u-tech", metadata: { username: "x.nom", reason: "RESET" } },
    ]);
  });

  it("a reset together with another change still sets it, in the same write", async () => {
    await patch({ password: "reinit-456", role: "VALIDATEUR" });
    expect(stubs.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-tech" },
      data: { role: "VALIDATEUR", clientId: null, mustChangePassword: true },
    });
  });

  it("any other change leaves the flag alone", async () => {
    await patch({ role: "VALIDATEUR" });
    await patch({ banned: true });
    await patch({ documentName: "Technicien de QUALILAB 'X.NOM'" });
    expect(stubs.prisma.user.update).toHaveBeenCalledTimes(3);
    for (const [args] of stubs.prisma.user.update.mock.calls) {
      expect(args.data).not.toHaveProperty("mustChangePassword");
    }
    expect(journal().map((entry) => entry.action)).not.toContain("USER_PASSWORD_CHANGE_REQUIRED");
  });

  it("a refused reset writes nothing", async () => {
    const response = await patch({ password: "court" });
    expect(response.status).toBe(400);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });
});

describe("« Mon compte » — the person's own change", () => {
  const body = { currentPassword: "initial-123", newPassword: "le-mien-789", confirmPassword: "le-mien-789" };
  const renewed = () =>
    new Response(JSON.stringify({ token: "t" }), {
      status: 200,
      headers: { "Set-Cookie": "qualilab.session_token=renewed; Path=/; HttpOnly" },
    });

  it("clears the flag, journals the asked-for change and opens the dashboard", async () => {
    stubs.session.current = { id: "u-tech", username: "x.nom", name: "Personne Test", role: "TECHNICIEN", mustChangePassword: true };
    stubs.changePassword.mockResolvedValue(renewed());
    const response = await changeStaffPassword(json(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, redirectTo: "/technicien" });
    // The current password is still checked, by Better Auth.
    expect(stubs.changePassword.mock.calls[0][0].body).toMatchObject({
      currentPassword: "initial-123",
      newPassword: "le-mien-789",
      revokeOtherSessions: true,
    });
    expect(stubs.prisma.user.update).toHaveBeenCalledWith({ where: { id: "u-tech" }, data: { mustChangePassword: false } });
    expect(response.headers.getSetCookie()).toEqual(["qualilab.session_token=renewed; Path=/; HttpOnly"]);
    expect(journal()).toEqual([
      {
        action: "USER_PASSWORD_CHANGED",
        entityId: "u-tech",
        metadata: { username: "x.nom", portal: false, required: true, flagCleared: true },
      },
    ]);
  });

  it("the préleveur's change opens the préleveur's home", async () => {
    stubs.session.current = { id: "u-pre", username: "x.pre", name: "Personne Test", role: "PRELEVEUR", mustChangePassword: true };
    stubs.changePassword.mockResolvedValue(renewed());
    expect(await (await changeStaffPassword(json(body))).json()).toEqual({ ok: true, redirectTo: "/preleveur" });
  });

  it("a client's change on the portal opens the portal", async () => {
    stubs.session.current = { id: "u-cli", username: "x.portail", name: "Personne Test", role: "CLIENT", mustChangePassword: true };
    stubs.changePassword.mockResolvedValue(renewed());
    const response = await changePortalPassword(json(body));
    expect(await response.json()).toEqual({ ok: true, redirectTo: "/portail" });
    expect(stubs.prisma.user.update).toHaveBeenCalledWith({ where: { id: "u-cli" }, data: { mustChangePassword: false } });
    expect(journal()[0].metadata).toEqual({ username: "x.portail", portal: true, required: true, flagCleared: true });
  });

  it("a wrong current password leaves the flag set", async () => {
    stubs.session.current = { id: "u-wrong", username: "x.nom", name: "Personne Test", role: "TECHNICIEN", mustChangePassword: true };
    stubs.changePassword.mockResolvedValue(
      new Response(JSON.stringify({ code: "INVALID_PASSWORD" }), { status: 400 })
    );
    const response = await changeStaffPassword(json(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Le mot de passe actuel est incorrect." });
    expect(stubs.prisma.user.update).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });

  it("an account whose password is already its own changes it as before: no write, no redirection", async () => {
    stubs.session.current = { id: "u-own", username: "x.nom", name: "Personne Test", role: "COMPTABLE", mustChangePassword: false };
    stubs.changePassword.mockResolvedValue(renewed());
    const response = await changeStaffPassword(json(body));
    expect(await response.json()).toEqual({ ok: true });
    expect(stubs.prisma.user.update).not.toHaveBeenCalled();
    expect(journal()[0].metadata).toEqual({ username: "x.nom", portal: false });
  });

  it("still hands the renewed cookie back should the flag fail to clear", async () => {
    stubs.session.current = { id: "u-fail", username: "x.nom", name: "Personne Test", role: "TECHNICIEN", mustChangePassword: true };
    stubs.changePassword.mockResolvedValue(renewed());
    stubs.prisma.user.update.mockRejectedValueOnce(new Error("base indisponible"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await changeStaffPassword(json(body));
    quiet.mockRestore();
    expect(response.status).toBe(200);
    // The password is changed all the same: no dashboard, and the form is
    // told the new password is now the current one (the administrator's no
    // longer works) — PASSWORD_STILL_REQUIRED_MESSAGE.
    expect(await response.json()).toEqual({ ok: true, stillRequired: true });
    expect(response.headers.getSetCookie()).toHaveLength(1);
    // The journal shows the account is still asked for another one.
    expect(journal()).toEqual([
      {
        action: "USER_PASSWORD_CHANGED",
        entityId: "u-fail",
        metadata: { username: "x.nom", portal: false, required: true, flagCleared: false },
      },
    ]);
  });
});
