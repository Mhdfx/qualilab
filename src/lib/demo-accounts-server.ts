import "server-only";
import { auth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  DEMO_USERNAMES,
  demoModeEnabled,
  demoPanelFor,
  demoPasswordCheck,
  signInableDemoUsernames,
  type DemoPanel,
} from "@/lib/demo-accounts";

const globalForDemo = globalThis as unknown as { demoPasswordCache?: Map<string, boolean> };
const demoPasswordCache = (globalForDemo.demoPasswordCache ??= new Map<string, boolean>());

/** Better Auth's own password check (the hash the seed wrote, `ctx.password`), remembered per hash. */
const usesDemoPassword = demoPasswordCheck(async (input) => (await auth.$context).password.verify(input), demoPasswordCache);

/**
 * The demo panel the login page may show: the accounts the database holds,
 * has not disabled, and whose password is still the demo one — and the
 * password itself. The panel used to list every seeded name, and production
 * — seeded before « direction1 » existed — answered « Identifiants
 * incorrects » for it. Never creates nor changes an account.
 *
 * `null` (no panel, nothing of the demo sent to the browser) when the demo
 * mode is off, when no account qualifies, and when the database cannot be
 * read: the sign-in form must still render.
 */
export async function loadDemoPanel(): Promise<DemoPanel | null> {
  if (!demoModeEnabled()) return null;
  try {
    const users = await prisma.user.findMany({
      where: { username: { in: [...DEMO_USERNAMES] } },
      select: {
        username: true,
        banned: true,
        banExpires: true,
        accounts: { where: { providerId: "credential" }, select: { password: true } },
      },
    });
    const rows = await Promise.all(
      users.map(async (user) => ({
        username: user.username,
        banned: user.banned,
        banExpires: user.banExpires,
        usesDemoPassword: (await Promise.all(user.accounts.map((account) => usesDemoPassword(account.password)))).some(Boolean),
      }))
    );
    return demoPanelFor(signInableDemoUsernames(rows));
  } catch (error) {
    console.error("[login] comptes de démonstration illisibles — panneau masqué", error);
    return null;
  }
}
