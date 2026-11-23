import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « PORTAL_LOGIN » — exactly one journal entry per session (Perf 3, P3-1).
 * The portal's layout hands `logPortalLogin` the session the guard read
 * (`SessionUser.sessionId`): Better Auth is not asked again, and a session
 * this process saw journalled skips the journal's lookup on its next pages.
 */

vi.mock("server-only", () => ({}));

const journal: { entity: string; entityId: string; action: string; actorId: string | null }[] = [];
const lookups = { count: 0 };

vi.mock("./prisma", () => ({
  prisma: {
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { entity: string; entityId: string; action: string } }) => {
        lookups.count += 1;
        const row = journal.find(
          (entry) => entry.entity === where.entity && entry.entityId === where.entityId && entry.action === where.action
        );
        return row ? { id: "a1" } : null;
      }),
    },
  },
}));

vi.mock("./audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audit")>();
  return {
    ...actual,
    logAudit: vi.fn(async (entry: { actorId: string | null; action: string; entity: string; entityId: string }) => {
      journal.push({ entity: entry.entity, entityId: entry.entityId, action: entry.action, actorId: entry.actorId });
    }),
  };
});

// The guards themselves are not under test here (portal-guards.test.ts).
vi.mock("./auth", () => ({
  passwordChangeGuards: { requireRole: vi.fn() },
  requireApiRole: vi.fn(),
  requireRole: vi.fn(),
}));

const { logPortalLogin } = await import("./portal-server");

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const logins = (sessionId: string) =>
  journal.filter((entry) => entry.action === "PORTAL_LOGIN" && entry.entityId === sessionId).length;

describe("the portal's login journal", () => {
  beforeEach(() => {
    lookups.count = 0;
  });

  it("journals a session's first portal page once, whatever the pages that follow", async () => {
    const session = { id: "u1", sessionId: "s-first" };
    await logPortalLogin(session, "c1");
    await logPortalLogin(session, "c1");
    await logPortalLogin(session, "c1");
    expect(logins("s-first")).toBe(1);
    expect(journal.find((entry) => entry.entityId === "s-first")).toMatchObject({ entity: "Session", actorId: "u1" });
    // The journal is read once: the next pages know it from this process.
    expect(lookups.count).toBe(1);
  });

  it("a new session (after a password change, the next morning) is journalled again", async () => {
    await logPortalLogin({ id: "u1", sessionId: "s-renewed" }, "c1");
    expect(logins("s-renewed")).toBe(1);
  });

  it("a session journalled before a restart is never journalled twice: the journal decides", async () => {
    journal.push({ entity: "Session", entityId: "s-before-restart", action: "PORTAL_LOGIN", actorId: "u2" });
    await logPortalLogin({ id: "u2", sessionId: "s-before-restart" }, "c2");
    expect(logins("s-before-restart")).toBe(1);
  });

  it("the layout passes the guard's session, and nothing asks Better Auth for it again", () => {
    const layout = read("../app/portail/layout.tsx");
    expect(layout).toContain("logPortalLogin(session, access.clientId)");
    expect(layout).toContain("access.ok && !session.mustChangePassword ?");
    const server = read("./portal-server.ts");
    expect(server).not.toMatch(/auth\.api\.getSession\(/);
    expect(read("./auth.ts")).toContain("sessionId: session.session.id,");
  });
});
