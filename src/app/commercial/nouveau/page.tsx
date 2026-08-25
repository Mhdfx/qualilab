import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientForm } from "@/components/clients/ClientForm";

export default async function NouveauClientPage() {
  await requireRole("GESTIONNAIRE", "ADMIN");

  return (
    <div>
      <Link
        href="/commercial"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Base clients
      </Link>

      <PageHeader
        badge="Nouveau client"
        title="Créer un client"
        subtitle="Renseignez l'identité du client et les adresses qui recevront ses rapports et alertes."
      />

      <div className="max-w-3xl">
        <ClientForm
          initial={{
            name: "",
            contact: "",
            email: "",
            phone: "",
            address: "",
            ice: "",
            emails: [],
          }}
        />
      </div>
    </div>
  );
}
