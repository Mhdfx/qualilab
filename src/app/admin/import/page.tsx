import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImportClients } from "@/components/admin/ImportClients";
import { ImportCriteres } from "@/components/admin/ImportCriteres";

export const metadata = { title: "Import de données" };

export default async function ImportPage() {
  await requireRole("ADMIN");

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Import de données"
        subtitle="Reprise de l'ancien système et du classeur des critères : analysez le fichier, vérifiez, puis importez — rien n'est écrit avant votre confirmation."
      />
      <div className="max-w-4xl space-y-8">
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Critères d&apos;interprétation (classeur Excel)</h2>
          <ImportCriteres />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Clients (export CSV)</h2>
          <ImportClients />
        </section>
      </div>
    </div>
  );
}
