import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImportClients } from "@/components/admin/ImportClients";

export const metadata = { title: "Import de données" };

export default async function ImportPage() {
  await requireRole("ADMIN");

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Import de données"
        subtitle="Reprise de l'ancien système : analysez le fichier, vérifiez la correspondance, simulez, puis importez — rien n'est écrit avant votre confirmation."
      />
      <div className="max-w-4xl">
        <ImportClients />
      </div>
    </div>
  );
}
