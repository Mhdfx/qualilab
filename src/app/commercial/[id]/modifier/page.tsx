import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientForm } from "@/components/clients/ClientForm";
import { clientCompletionGaps, completionHint } from "@/lib/client-completion";


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
      // An address of a site says so on the form (D-04).
      emails: { orderBy: { email: "asc" }, include: { site: { select: { name: true } } } },
      mergedInto: { select: { id: true, name: true } },
    },
  });

  if (!client) notFound();

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
          initial={{
            name: client.name,
            contact: client.contact ?? "",
            email: client.email ?? "",
            phone: client.phone ?? "",
            address: client.address ?? "",
            ice: client.ice ?? "",
            emails: client.emails.map((entry) => ({
              email: entry.email,
              label: entry.label ?? "",
              forReports: entry.forReports,
              forAlerts: entry.forAlerts,
              site: entry.site ? { name: entry.site.name, email: entry.email } : null,
            })),
          }}
        />
      </div>
    </div>
  );
}
