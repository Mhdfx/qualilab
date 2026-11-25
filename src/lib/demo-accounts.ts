import { ROLES, type Role } from "./roles";

/**
 * The demonstration accounts the login page offers (DemoAccounts.tsx) — the
 * ones prisma/seed.ts creates, password « password ». Read on the server
 * only: the login page (a server component) asks the database which of them
 * can actually sign in (demo-accounts-server.ts) and hands the panel those
 * accounts and the password only while the demo mode is on — the browser's
 * code never carries them (DemoAccounts.tsx imports types only).
 *
 * prisma/disable-demo-accounts.ts bans the same accounts at go-live
 * (demo-accounts.test.ts keeps the three lists in step).
 */

export const DEMO_PASSWORD = "password";

/** Ordered as the sample travels through the laboratory. */
export type DemoAccount = { username: string; role: Role; name: string };

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { username: "pre1", role: "PRELEVEUR", name: "Karim Benali" },
  { username: "recep1", role: "RECEPTIONNISTE", name: "Salma Idrissi" },
  { username: "param1", role: "PROGRAMMATEUR", name: "Rachid Alaoui" },
  { username: "tech1", role: "TECHNICIEN", name: "Yassine Amrani" },
  { username: "tech2", role: "TECHNICIEN", name: "Imane Cherkaoui" },
  { username: "valid1", role: "VALIDATEUR", name: "Dr. Nawal Bennani" },
  { username: "direction1", role: "DIRECTION", name: "Direction (démo)" },
  { username: "commercial1", role: "GESTIONNAIRE", name: "Hicham Tazi" },
  { username: "compta1", role: "COMPTABLE", name: "Leila Fassi" },
  { username: "admin", role: "ADMIN", name: "Sara Mansouri" },
  { username: "magasin1", role: "MAGASINIER", name: "Omar Benjelloun" },
];

export const DEMO_USERNAMES: readonly string[] = DEMO_ACCOUNTS.map((account) => account.username);

/** The panel is shown unless production turns it off (NEXT_PUBLIC_DEMO_MODE=false). */
export function demoModeEnabled(value: string | undefined = process.env.NEXT_PUBLIC_DEMO_MODE): boolean {
  return value !== "false";
}

/**
 * Roles with no demo account, shown in the panel. CLIENT (portal,
 * PORTAIL.md) deliberately has none: a portal account belongs to one
 * client, so the admin creates it in /admin/utilisateurs.
 */
export const DEMO_MISSING_ROLES: readonly Role[] = ROLES.filter(
  (role) => role !== "CLIENT" && !DEMO_ACCOUNTS.some((account) => account.role === role)
);

/** What the login page hands the panel — only while the demo mode is on and an account can sign in. */
export type DemoPanel = {
  accounts: DemoAccount[];
  password: string;
  missingRoles: Role[];
};

/** A user row as the login page reads it. */
export type DemoAccountRow = {
  username: string | null;
  banned: boolean | null;
  banExpires: Date | null;
  /** The account's password is still the demo one (`demoPasswordCheck`). */
  usesDemoPassword: boolean;
};

/**
 * The demo usernames that can sign in: the account exists, is not disabled
 * — a ban whose end has passed no longer counts (Better Auth's admin plugin
 * lifts it at the next sign-in) — and still has the demo password (an
 * account whose password was changed would answer « Identifiants
 * incorrects » to the panel's click, and its failures count). In the
 * panel's order.
 */
export function signInableDemoUsernames(rows: readonly DemoAccountRow[], now: number = Date.now()): string[] {
  const usable = new Set(
    rows
      .filter((row) => row.usesDemoPassword)
      .filter((row) => !row.banned || (row.banExpires !== null && row.banExpires.getTime() < now))
      .map((row) => row.username?.toLowerCase())
      .filter((username): username is string => !!username)
  );
  return DEMO_USERNAMES.filter((username) => usable.has(username));
}

/** The panel for these usernames, `null` when none can sign in (no panel). */
export function demoPanelFor(usernames: readonly string[]): DemoPanel | null {
  const accounts = DEMO_ACCOUNTS.filter((account) => usernames.includes(account.username));
  if (accounts.length === 0) return null;
  return { accounts, password: DEMO_PASSWORD, missingRoles: [...DEMO_MISSING_ROLES] };
}

/** At most this many password hashes remembered (the demo accounts' own, and their changes). */
export const DEMO_PASSWORD_CACHE_MAX = 100;

/**
 * Whether a stored password hash is the demo password's, checked once per
 * hash: the check is a deliberately slow hash (scrypt), and the login page
 * is public — re-checking eleven hashes on every render would let anyone
 * load the server by reloading /login. A hash only changes with the
 * password, so a remembered answer stays true. A hash that cannot be read
 * is « not the demo password ».
 */
export function demoPasswordCheck(
  verify: (input: { hash: string; password: string }) => Promise<boolean>,
  cache: Map<string, boolean> = new Map()
): (hash: string | null | undefined) => Promise<boolean> {
  return async (hash) => {
    if (!hash) return false;
    const known = cache.get(hash);
    if (known !== undefined) return known;
    let matches = false;
    try {
      matches = await verify({ hash, password: DEMO_PASSWORD });
    } catch {
      matches = false;
    }
    if (cache.size >= DEMO_PASSWORD_CACHE_MAX) cache.clear();
    cache.set(hash, matches);
    return matches;
  };
}
