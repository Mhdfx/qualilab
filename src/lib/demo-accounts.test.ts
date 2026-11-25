import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, DEMO_USERNAMES, demoModeEnabled, signInableDemoUsernames } from "./demo-accounts";

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
    }));
    const listed = signInableDemoUsernames(rows, NOW);
    expect(listed).not.toContain("direction1");
    expect(listed).toHaveLength(DEMO_USERNAMES.length - 1);
  });

  it("leaves out a disabled account, keeps one whose ban has ended", () => {
    const listed = signInableDemoUsernames(
      [
        { username: "tech1", banned: true, banExpires: null },
        { username: "tech2", banned: true, banExpires: new Date(NOW + 60_000) },
        { username: "valid1", banned: true, banExpires: new Date(NOW - 60_000) },
        { username: "admin", banned: null, banExpires: null },
      ],
      NOW
    );
    expect(listed).toEqual(["valid1", "admin"]);
  });

  it("keeps the panel's order and ignores rows that are not demo accounts", () => {
    const listed = signInableDemoUsernames(
      [
        { username: "magasin1", banned: false, banExpires: null },
        { username: "someone.real", banned: false, banExpires: null },
        { username: "pre1", banned: false, banExpires: null },
        { username: null, banned: false, banExpires: null },
      ],
      NOW
    );
    expect(listed).toEqual(["pre1", "magasin1"]);
  });

  it("is empty when nothing is found", () => {
    expect(signInableDemoUsernames([], NOW)).toEqual([]);
  });
});

describe("the login page reads the database, never writes it", () => {
  it("one findMany on the demo usernames, nothing else, and an empty panel when it fails", () => {
    const server = source("src/lib/demo-accounts-server.ts");
    expect(server).toMatch(/prisma\.user\.findMany\(/);
    expect(server).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete)/);
    expect(server).toMatch(/catch[\s\S]*return \[\];/);
    const page = source("src/app/login/page.tsx");
    expect(page).toMatch(/availableDemoUsernames\(\)/);
    expect(page).toMatch(/demoAccounts=\{demoAccounts\}/);
  });

  it("the panel stays behind NEXT_PUBLIC_DEMO_MODE=false", () => {
    expect(demoModeEnabled(undefined)).toBe(true);
    expect(demoModeEnabled("true")).toBe(true);
    expect(demoModeEnabled("false")).toBe(false);
    expect(source("src/components/DemoAccounts.tsx")).toMatch(/if \(!demoModeEnabled\(\)\) return null;/);
  });
});
