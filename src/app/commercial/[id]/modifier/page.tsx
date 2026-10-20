import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientForm } from "@/components/clients/ClientForm";
import { clientCompletionGaps, completionHint } from "@/lib/client-completion";
import { siteOptions } from "@/components/clients/client-form-logic";


export const metadata = { title: "Modifier le client" };
export default async function ModifierClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("GESTIONNAIRE", "ADMIN");
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      emails: { orderBy: { email: "asc" } },
      mergedInto: { select: { id: true, name: true } },
      // H3 (RETOUR-LABO-19-10.md, Q45): an address is the whole client's or
      // one of its sites' (D-04), chosen on the form.
      sites: { select: { id: true, name: true, active: true } },
    },
  });

  if (!client) notFound();
  const sites = siteOptions(client.sites, client.emails.map((entry) => entry.siteId));

  return (
    <div>
      <Link
        href={`/commercial/${client.id}`}
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Fiche client
      </Link>

      <PageHeader
        badge="Modifier"
        title={client.name}
        subtitle="Mettez à jour les coordonnées et les destinataires des envois."
      />

      <div className="max-w-3xl">
        <ClientForm
          clientId={client.id}
          archived={client.archived}
          mergedInto={client.mergedInto}
          toComplete={client.toComplete && !client.archived ? { hint: completionHint(clientCompletionGaps(client)) } : null}
          sites={sites}
          initial={{
            name: client.name,
            contact: client.contact ?? "",
            email: client.email ?? "",
            phone: client.phone ?? "",
            address: client.address ?? "",
            ice: client.ice ?? "",
            fiscalId: client.fiscalId ?? "",
            tradeRegister: client.tradeRegister ?? "",
            emails: client.emails.map((entry) => ({
              email: entry.email,
              label: entry.label ?? "",
              forReports: entry.forReports,
              forAlerts: entry.forAlerts,
              siteId: entry.siteId,
              savedSiteId: entry.siteId,
            })),
          }}
        />
      </div>
    </div>
  );
}
