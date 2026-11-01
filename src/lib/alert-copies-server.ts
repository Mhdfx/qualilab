import "server-only";
import { prisma } from "./prisma";
import type { AlertCopy } from "./alert-copies";

/**
 * The active copy addresses (L5) relevant to one client: every « tous les
 * clients » address and those that chose it. A failed read copies nobody
 * more than before — an alert never fails for its copies.
 */
export async function loadAlertCopies(clientId: string): Promise<AlertCopy[]> {
  try {
    const rows = await prisma.alertCopyAddress.findMany({
      where: {
        NOT: { active: false },
        OR: [{ allClients: null }, { allClients: true }, { clients: { some: { clientId } } }],
      },
      select: { email: true, allClients: true, active: true, clients: { where: { clientId }, select: { clientId: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({ email: row.email, allClients: row.allClients, active: row.active, clientIds: row.clients.map((c) => c.clientId) }));
  } catch (error) {
    console.error("[alerts] internal copies unreadable, the alert leaves without them", { clientId, error });
    return [];
  }
}
