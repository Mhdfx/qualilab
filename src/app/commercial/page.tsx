import { Building2, FlaskConical, Send, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ClientList } from "@/components/clients/ClientList";

export const metadata = { title: "Clients" };

export default async function CommercialPage() {
  const [clients, echantillons, rapportsEnvoyes, factures] = await Promise.all([
    prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contact: true,
        email: true,
        phone: true,
        ice: true,
        archived: true,
        emails: { select: { id: true } },
        _count: { select: { samples: true, invoices: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.sample.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
    prisma.invoice.count(),
  ]);

  const active = clients.filter((client) => !client.archived).length;

  return (
    <div>
      <PageHeader
        badge="Espace commercial"
        title="Gestion des clients"
        subtitle="Gérez la base clients, leurs adresses de contact et suivez leur activité."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Clients actifs" value={active} icon={Building2} accent="brand" />
          <StatCard label="Échantillons" value={echantillons} icon={FlaskConical} accent="blue" />
          <StatCard label="Rapports envoyés" value={rapportsEnvoyes} icon={Send} accent="emerald" />
          <StatCard label="Factures" value={factures} icon={FileText} accent="violet" />
        </div>
      </section>

      <section id="clients" aria-label="Clients">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Base clients
        </h2>
        <ClientList clients={clients} />
      </section>
    </div>
  );
}
