import { requireRole } from "@/lib/auth";
import { Building2, FlaskConical, Send, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ClientList, type ClientRow } from "@/components/clients/ClientList";
import { awaitsCompletion, clientCompletionGaps, completionHint } from "@/lib/client-completion";
import { rechercheHref } from "@/lib/sample-search";
import { invoiceTileHref } from "@/lib/management-views";

export const metadata = { title: "Clients" };

export default async function CommercialPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("GESTIONNAIRE", "ADMIN");
  const [rows, toCompleteFacts, echantillons, rapportsEnvoyes, factures] = await Promise.all([
    // The client base, slim (lot performance P1-6): what the list shows and
    // searches — never the phone, the postal address or the addresses
    // themselves, only how many there are.
    prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contact: true,
        email: true,
        ice: true,
        archived: true,
        // « À compléter » (E3): the flag; what is missing is worded below.
        toComplete: true,
        _count: { select: { samples: true, invoices: true, emails: true } },
      },
      orderBy: { name: "asc" },
    }),
    // What the clients « À compléter » lack — the ICE, the postal address and
    // an address that receives the reports — read for those few alone
    // (`awaitsCompletion`: flagged and not archived).
    prisma.client.findMany({
      where: { toComplete: true, archived: false },
      select: {
        id: true,
        address: true,
        emails: { select: { email: true, siteId: true, forReports: true, forAlerts: true } },
      },
    }),
    prisma.sample.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
    // Issued invoices only: drafts, cancelled invoices and credit notes are
    // not « factures » for this figure (FACTURATION.md §4).
    prisma.invoice.count({ where: { kind: "FACTURE", status: { in: ["EN_ATTENTE", "PAYEE"] } } }),
  ]);

  // The hint under « À compléter », worded here (`clientCompletionGaps`).
  const factsById = new Map(toCompleteFacts.map((facts) => [facts.id, facts]));
  const clients: ClientRow[] = rows.map((client) => {
    const facts = awaitsCompletion(client) ? factsById.get(client.id) : undefined;
    return {
      ...client,
      hint: facts ? completionHint(clientCompletionGaps({ ...client, address: facts.address, emails: facts.emails })) : null,
    };
  });

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
