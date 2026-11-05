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
  forAlerts: true,
  forReports: true,
  clients: { select: { client: { select: { id: true, name: true } } } },
} as const;

/**
 * The active copy addresses (L5, L6) relevant to one client: every « tous
 * les clients » address and those that chose it, whatever they receive —
 * the alerts or the reports are picked by `internalCopyRecipients`. A failed
 * read copies nobody more than before — an alert or a report never fails
 * for its copies.
 */
export async function loadAlertCopies(clientId: string): Promise<AlertCopy[]> {
  try {
    const rows = await prisma.alertCopyAddress.findMany({
      where: {
        NOT: { active: false },
        OR: [{ allClients: null }, { allClients: true }, { clients: { some: { clientId } } }],
      },
      select: {
        email: true,
        allClients: true,
        active: true,
        forAlerts: true,
        forReports: true,
        clients: { where: { clientId }, select: { clientId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      email: row.email,
      allClients: row.allClients,
      active: row.active,
      forAlerts: row.forAlerts,
      forReports: row.forReports,
      clientIds: row.clients.map((c) => c.clientId),
    }));
  } catch (error) {
    console.error("[dispatch] internal copies unreadable, the send leaves without them", { clientId, error });
    return [];
  }
}
