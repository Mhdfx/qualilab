import "server-only";
import { prisma } from "@/lib/prisma";
import { DEMO_USERNAMES, demoModeEnabled, signInableDemoUsernames } from "@/lib/demo-accounts";

/**
 * The demo accounts the login page may offer: those the database holds and
 * has not disabled. The panel used to list every seeded name, and production
 * — seeded before « direction1 » existed — answered « Identifiants
 * incorrects » for it. Never creates an account.
 *
 * Nothing (an empty list, so no panel) when the demo mode is off, and when
 * the database cannot be read: the sign-in form must still render.
 */
export async function availableDemoUsernames(): Promise<string[]> {
  if (!demoModeEnabled()) return [];
  try {
    const rows = await prisma.user.findMany({
      where: { username: { in: [...DEMO_USERNAMES] } },
      select: { username: true, banned: true, banExpires: true },
    });
    return signInableDemoUsernames(rows);
  } catch (error) {
    console.error("[login] comptes de démonstration illisibles — panneau masqué", error);
    return [];
  }
}
