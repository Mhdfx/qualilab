import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_MISSING_ROLES,
  DEMO_PASSWORD,
  DEMO_PASSWORD_CACHE_MAX,
  DEMO_USERNAMES,
  demoModeEnabled,
  demoPanelFor,
  demoPasswordCheck,
  signInableDemoUsernames,
} from "./demo-accounts";

const root = join(__dirname, "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

/** The usernames of `const demoUsers = [ … ]` in prisma/seed.ts. */
function seededUsernames(): string[] {
  const seed = source("prisma/seed.ts");
  const block = seed.slice(seed.indexOf("const demoUsers = ["), seed.indexOf("] as const;"));
  return [...block.matchAll(/username:\s*"([^"]+)"/g)].map((match) => match[1]);
}

/** The usernames of `const DEMO_USERNAMES = [ … ]` in prisma/disable-demo-accounts.ts (a script: run on import). */
function disabledUsernames(): string[] {
  const script = source("prisma/disable-demo-accounts.ts");
  const start = script.indexOf("const DEMO_USERNAMES = [");
  const block = script.slice(start, script.indexOf("];", start));
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe("the demo account lists stay in step", () => {
  it("reads the seed's eleven accounts", () => {
    expect(seededUsernames()).toHaveLength(11);
    expect(seededUsernames()).toContain("direction1");
  });

  it("the go-live script disables every account the seed creates (audit C1: « direction1 » was missing)", () => {
    const disabled = new Set(disabledUsernames());
    expect(seededUsernames().filter((username) => !disabled.has(username))).toEqual([]);
  });

  it("the login panel offers exactly the seeded accounts, with the seed's roles", () => {
    expect([...DEMO_USERNAMES].sort()).toEqual(seededUsernames().sort());
    const seed = source("prisma/seed.ts");
    for (const account of DEMO_ACCOUNTS) {
      expect(seed, account.username).toMatch(new RegExp(`username: "${account.username}",[^}]*role: "${account.role}"`));
    }
  });
});

describe("signInableDemoUsernames — the panel lists only accounts that can sign in", () => {
  const NOW = Date.UTC(2026, 10, 25, 9, 0);

  it("leaves out an account the database does not hold (production: « direction1 »)", () => {
    const rows = DEMO_USERNAMES.filter((username) => username !== "direction1").map((username) => ({
      username,
      banned: false,
      banExpires: null,
      usesDemoPassword: true,
    }));
    const listed = signInableDemoUsernames(rows, NOW);
    expect(listed).not.toContain("direction1");
    expect(listed).toHaveLength(DEMO_USERNAMES.length - 1);
  });

  it("leaves out a disabled account, keeps one whose ban has ended", () => {
    const listed = signInableDemoUsernames(
      [
        { username: "tech1", banned: true, banExpires: null, usesDemoPassword: true },
        { username: "tech2", banned: true, banExpires: new Date(NOW + 60_000), usesDemoPassword: true },
        { username: "valid1", banned: true, banExpires: new Date(NOW - 60_000), usesDemoPassword: true },
        { username: "admin", banned: null, banExpires: null, usesDemoPassword: true },
      ],
      NOW
    );
    expect(listed).toEqual(["valid1", "admin"]);
  });

  it("keeps the panel's order and ignores rows that are not demo accounts", () => {
    const listed = signInableDemoUsernames(
      [
        { username: "magasin1", banned: false, banExpires: null, usesDemoPassword: true },
        { username: "someone.real", banned: false, banExpires: null, usesDemoPassword: true },
        { username: "pre1", banned: false, banExpires: null, usesDemoPassword: true },
        { username: null, banned: false, banExpires: null, usesDemoPassword: true },
      ],
      NOW
    );
    expect(listed).toEqual(["pre1", "magasin1"]);
  });

  it("leaves out an account whose password is no longer the demo one (a click would only count a failure)", () => {
    const listed = signInableDemoUsernames(
      [
        { username: "tech1", banned: false, banExpires: null, usesDemoPassword: false },
        { username: "tech2", banned: false, banExpires: null, usesDemoPassword: true },
      ],
      NOW
    );
    expect(listed).toEqual(["tech2"]);
  });

  it("is empty when nothing is found", () => {
    expect(signInableDemoUsernames([], NOW)).toEqual([]);
  });
});

describe("demoPanelFor — what the browser receives", () => {
  it("the accounts that can sign in, in the panel's order, with the password and the roles left without one", () => {
    const panel = demoPanelFor(["magasin1", "pre1"]);
    expect(panel?.accounts.map((account) => account.username)).toEqual(["pre1", "magasin1"]);
    expect(panel?.accounts[0]).toEqual(DEMO_ACCOUNTS[0]);
    expect(panel?.password).toBe(DEMO_PASSWORD);
    expect(panel?.missingRoles).toEqual([...DEMO_MISSING_ROLES]);
  });

  it("nothing at all when no account can sign in", () => {
    expect(demoPanelFor([])).toBeNull();
  });

  it("every role but CLIENT has a demo account", () => {
    expect(DEMO_MISSING_ROLES).toEqual([]);
  });
});

describe("demoPasswordCheck — the demo password, checked once per stored hash", () => {
  it("asks the slow check once per hash, then remembers the answer", async () => {
    const verify = vi.fn(async ({ hash, password }: { hash: string; password: string }) => hash === `h(${password})`);
    const check = demoPasswordCheck(verify);
    expect(await check(`h(${DEMO_PASSWORD})`)).toBe(true);
    expect(await check(`h(${DEMO_PASSWORD})`)).toBe(true);
    expect(await check("h(change)")).toBe(false);
    expect(await check("h(change)")).toBe(false);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledWith({ hash: `h(${DEMO_PASSWORD})`, password: DEMO_PASSWORD });
  });

  it("no hash, or one the check cannot read, is not the demo password", async () => {
    const check = demoPasswordCheck(async () => {
      throw new Error("hash illisible");
    });
    expect(await check(null)).toBe(false);
    expect(await check(undefined)).toBe(false);
    expect(await check("")).toBe(false);
    expect(await check("abc")).toBe(false);
  });

  it("stays bounded", async () => {
    const cache = new Map<string, boolean>();
    const check = demoPasswordCheck(async () => false, cache);
    for (let i = 0; i < DEMO_PASSWORD_CACHE_MAX * 3; i += 1) await check(`hash-${i}`);
    expect(cache.size).toBeLessThanOrEqual(DEMO_PASSWORD_CACHE_MAX);
  });

  it("matches the hash Better Auth writes (the seed's `ctx.password.hash`)", async () => {
    const { hashPassword, verifyPassword } = await import("better-auth/crypto");
    const check = demoPasswordCheck(verifyPassword);
    expect(await check(await hashPassword(DEMO_PASSWORD))).toBe(true);
    expect(await check(await hashPassword("un-autre-mot-de-passe"))).toBe(false);
  }, 30_000);
});

describe("the login page reads the database, never writes it", () => {
  it("one findMany on the demo usernames, nothing else, and no panel when it fails", () => {
    const server = source("src/lib/demo-accounts-server.ts");
    expect(server).toMatch(/prisma\.user\.findMany\(/);
    expect(server).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete)/);
    expect(server).toMatch(/catch[\s\S]*return null;/);
    // The password check is Better Auth's own, remembered per hash.
    expect(server).toMatch(/demoPasswordCheck\(async \(input\) => \(await auth\.\$context\)\.password\.verify\(input\)/);
    const page = source("src/app/login/page.tsx");
    expect(page).toMatch(/loadDemoPanel\(\)/);
    expect(page).toMatch(/demoPanel=\{demoPanel\}/);
  });

  it("the panel stays behind NEXT_PUBLIC_DEMO_MODE=false, decided on the server", () => {
    expect(demoModeEnabled(undefined)).toBe(true);
    expect(demoModeEnabled("true")).toBe(true);
    expect(demoModeEnabled("false")).toBe(false);
    expect(source("src/lib/demo-accounts-server.ts")).toMatch(/if \(!demoModeEnabled\(\)\) return null;/);
  });

  it("the browser's code never imports the accounts or the password (types only)", () => {
    for (const path of ["src/components/DemoAccounts.tsx", "src/components/LoginForm.tsx"]) {
      const component = source(path);
      const imports = [...component.matchAll(/^import\s+(type\s+)?[^;]*from\s+"@\/lib\/demo-accounts";/gm)];
      expect(imports.length, path).toBeGreaterThan(0);
      expect(imports.every((match) => match[1] === "type "), path).toBe(true);
      expect(component, path).not.toMatch(/DEMO_PASSWORD|DEMO_ACCOUNTS|from "@\/lib\/demo-accounts-server"/);
    }
  });
});
