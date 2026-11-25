import type { Role } from "./roles";

/**
 * The demonstration accounts the login page offers (DemoAccounts.tsx) — the
 * ones prisma/seed.ts creates, password « password ». Here, outside the
 * client component, so the login page (a server component) can ask the
 * database which of them can actually sign in (demo-accounts-server.ts).
 *
 * prisma/disable-demo-accounts.ts bans the same accounts at go-live
 * (demo-accounts.test.ts keeps the three lists in step).
 */

export const DEMO_PASSWORD = "password";

/** Ordered as the sample travels through the laboratory. */
export const DEMO_ACCOUNTS: readonly { username: string; role: Role; name: string }[] = [
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

/** A user row as the login page reads it. */
export type DemoAccountRow = { username: string | null; banned: boolean | null; banExpires: Date | null };

/**
 * The demo usernames that can sign in: the account exists and is not
 * disabled — a ban whose end has passed no longer counts (Better Auth's
 * admin plugin lifts it at the next sign-in). In the panel's order.
 */
export function signInableDemoUsernames(rows: readonly DemoAccountRow[], now: number = Date.now()): string[] {
  const usable = new Set(
    rows
      .filter((row) => !row.banned || (row.banExpires !== null && row.banExpires.getTime() < now))
      .map((row) => row.username?.toLowerCase())
      .filter((username): username is string => !!username)
  );
  return DEMO_USERNAMES.filter((username) => usable.has(username));
}
