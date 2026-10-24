import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_PREFIX } from "./session-idle";
import { revocationMarkerIdentifier } from "./session-revocation-server";

/**
 * « Mon compte »: the person's own password change closes their other
 * sessions (Better Auth's `revokeOtherSessions`) — the préleveur's phone, a
 * second PC. Each gets a marker, so its next page says « Votre mot de passe
 * a été changé… », not « Session fermée après inactivité. »
 * (session-revocation.ts). The route handlers run for real; the database,
 * Better Auth and the guards are stubbed, and what they are asked to write
 * is checked.
 */

const stubs = vi.hoisted(() => {
  const prisma = {
    user: { update: vi.fn() },
    session: { findMany: vi.fn() },
    verification: { createMany: vi.fn() },
  };
  return {
    prisma,
    changePassword: vi.fn(),
    logAudit: vi.fn(),
    cookie: "",
    session: { current: null as null | Record<string, unknown> },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(stubs.cookie ? { cookie: stubs.cookie } : {}),
}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.logAudit }));
vi.mock("@/lib/auth-server", () => ({ auth: { api: { changePassword: stubs.changePassword } } }));
vi.mock("@/lib/auth", () => ({
  requireApiRole: async () => stubs.session.current,
  passwordChangeGuards: { requireApiRole: async () => stubs.session.current },
}));

import { POST as changeStaffPassword } from "../app/api/compte/mot-de-passe/route";
import { POST as changePortalPassword } from "../app/api/portail/compte/mot-de-passe/route";

const body = { currentPassword: "ancien-123", newPassword: "le-mien-789", confirmPassword: "le-mien-789" };
const post = () =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const renewed = () =>
  new Response(JSON.stringify({ token: "t" }), {
    status: 200,
    headers: { "Set-Cookie": "qualilab.session_token=renewed; Path=/; HttpOnly" },
  });

const LIVE = new Date(Date.now() + 2 * 24 * 3600e3);
const OTHERS = [
  { token: "tok-telephone", expiresAt: LIVE },
  { token: "tok-poste-2", expiresAt: LIVE },
];

let userCount = 0;
/** A new account for each test: the attempt counter is per account. */
function signedIn(role: string) {
  userCount += 1;
  stubs.session.current = { id: `u-${userCount}`, username: "x.nom", name: "Personne Test", role, mustChangePassword: false };
  return `u-${userCount}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.cookie = `${SESSION_COOKIE_PREFIX}.session_token=tok-ici.signature%3D`;
  stubs.prisma.session.findMany.mockResolvedValue(OTHERS);
  stubs.prisma.verification.createMany.mockResolvedValue({ count: 2 });
  stubs.changePassword.mockResolvedValue(renewed());
});

describe("the person's own change marks the sessions it closes elsewhere", () => {
  it("reads the account's other sessions before the change, then marks each « changement »", async () => {
    const userId = signedIn("PRELEVEUR");
    const response = await changeStaffPassword(post());
    expect(response.status).toBe(200);
    // This page's session (its cookie's token) is not one of them: it gets a new cookie.
    expect(stubs.prisma.session.findMany).toHaveBeenCalledWith({
      where: { userId, token: { not: "tok-ici" } },
      select: { token: true, expiresAt: true },
    });
    expect(stubs.prisma.session.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      stubs.changePassword.mock.invocationCallOrder[0]
    );
    expect(stubs.prisma.verification.createMany).toHaveBeenCalledWith({
      data: [
        { identifier: revocationMarkerIdentifier("tok-telephone"), value: `PASSWORD_CHANGED:${userId}`, expiresAt: LIVE },
        { identifier: revocationMarkerIdentifier("tok-poste-2"), value: `PASSWORD_CHANGED:${userId}`, expiresAt: LIVE },
      ],
    });
    expect(response.headers.getSetCookie()).toEqual(["qualilab.session_token=renewed; Path=/; HttpOnly"]);
  });

  it("the portal's change too", async () => {
    signedIn("CLIENT");
    expect((await changePortalPassword(post())).status).toBe(200);
    expect(stubs.prisma.verification.createMany).toHaveBeenCalledTimes(1);
  });

  it("a refused change (wrong current password) marks nothing", async () => {
    signedIn("TECHNICIEN");
    stubs.changePassword.mockResolvedValue(new Response(JSON.stringify({ code: "INVALID_PASSWORD" }), { status: 400 }));
    expect((await changeStaffPassword(post())).status).toBe(400);
    expect(stubs.prisma.verification.createMany).not.toHaveBeenCalled();
  });

  it("no other session, or only expired ones: nothing written", async () => {
    signedIn("TECHNICIEN");
    stubs.prisma.session.findMany.mockResolvedValue([]);
    expect((await changeStaffPassword(post())).status).toBe(200);
    stubs.prisma.session.findMany.mockResolvedValue([{ token: "tok-vieux", expiresAt: new Date(Date.now() - 1000) }]);
    signedIn("TECHNICIEN");
    expect((await changeStaffPassword(post())).status).toBe(200);
    expect(stubs.prisma.verification.createMany).not.toHaveBeenCalled();
  });

  it("never fails the change: a failed read or write only costs the notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn("VALIDATEUR");
    stubs.prisma.session.findMany.mockRejectedValue(new Error("base indisponible"));
    const read = await changeStaffPassword(post());
    expect(read.status).toBe(200);
    expect(read.headers.getSetCookie()).toHaveLength(1);
    expect(stubs.prisma.verification.createMany).not.toHaveBeenCalled();

    signedIn("VALIDATEUR");
    stubs.prisma.session.findMany.mockResolvedValue(OTHERS);
    stubs.prisma.verification.createMany.mockRejectedValue(new Error("base indisponible"));
    const written = await changeStaffPassword(post());
    expect(written.status).toBe(200);
    expect(written.headers.getSetCookie()).toHaveLength(1);
    expect(stubs.logAudit).toHaveBeenCalledTimes(2);
  });

  it("without a readable session cookie, every session of the account is read", async () => {
    const userId = signedIn("TECHNICIEN");
    stubs.cookie = "";
    await changeStaffPassword(post());
    expect(stubs.prisma.session.findMany).toHaveBeenCalledWith({
      where: { userId },
      select: { token: true, expiresAt: true },
    });
  });
});
