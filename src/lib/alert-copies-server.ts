import "server-only";
import { prisma } from "./prisma";
import type { AlertCopy } from "./alert-copies";

/** What /admin/entreprise and its routes read of an address. */
export const ALERT_COPY_SELECT = {
  id: true,
  email: true,
  label: true,
  allClients: true,
  active: true,
  clients: { select: { client: { select: { id: true, name: true } } } },
} as const;

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
