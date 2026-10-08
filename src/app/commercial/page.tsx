import { requireRole } from "@/lib/auth";
import { Building2, FlaskConical, Send, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ClientList } from "@/components/clients/ClientList";
import { rechercheHref } from "@/lib/sample-search";
import { invoiceTileHref } from "@/lib/management-views";

export const metadata = { title: "Clients" };

export default async function CommercialPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("GESTIONNAIRE", "ADMIN");
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
    // Issued invoices only: drafts, cancelled invoices and credit notes are
    // not « factures » for this figure (FACTURATION.md §4).
    prisma.invoice.count({ where: { kind: "FACTURE", status: { in: ["EN_ATTENTE", "PAYEE"] } } }),
  ]);

  const active = clients.filter((client) => !client.archived).length;
  // Each figure opens exactly what it counts (« comme un tri »). The client
  // base below hides the archived clients by default; the samples live in
  // /recherche. The invoice list is the comptabilité's and the admin's: the
  // gestionnaire reads the figure without a list to open.
  const invoicesHref =
    session.role === "ADMIN" ? invoiceTileHref("/admin/factures", { state: "EMISES", kind: "FACTURE" }) : undefined;

  return (
    <div>
      <PageHeader
        badge="Espace commercial"
        title="Gestion des clients"
        subtitle="Gérez la base clients, leurs adresses de contact et suivez leur activité."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Clients actifs" value={active} icon={Building2} accent="brand" href="#clients" />
          <StatCard label="Échantillons" value={echantillons} icon={FlaskConical} accent="blue" href={rechercheHref()} />
          <StatCard
            label="Rapports envoyés"
            value={rapportsEnvoyes}
            icon={Send}
            accent="emerald"
            href={rechercheHref({ status: "RAPPORT_ENVOYE" })}
          />
          <StatCard label="Factures émises" value={factures} icon={FileText} accent="violet" href={invoicesHref} />
        </div>
      </section>

      <section id="clients" aria-label="Clients" className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Base clients
        </h2>
        <ClientList clients={clients} />
      </section>
    </div>
  );
}
