import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientPricesCard } from "@/components/commercial/ClientPricesCard";
import { loadClientPriceRows } from "@/lib/client-prices-server";

export const metadata = { title: "Prix propres au client" };

/**
 * Lot 4H, H5 (RETOUR-LABO-04-11.md §5) — the comptabilité's view of a
 * client's own prices: the fiche client lives in the commercial space, so
 * the accountant reads and corrects them here, from the invoice form
 * (« Prix propres à ce client »). The same card and API as the fiche.
 */
export default async function ComptaClientPricesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("COMPTABLE", "ADMIN");
  const { id } = await params;
  const [client, rows] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { id: true, name: true, archived: true } }),
    loadClientPriceRows(id),
  ]);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/comptabilite/factures"
        className="mb-4 inline-flex items-center gap-2 rounded text-sm font-medium text-slate-500 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour aux factures
      </Link>
      <PageHeader
        badge="Facturation"
        title={client.name}
        subtitle="Les prix que ce client paie à la place de ceux du catalogue : la facture les propose, toujours modifiables."
      />
      <ClientPricesCard clientId={client.id} initialRows={rows} archived={client.archived} />
    </div>
  );
}
