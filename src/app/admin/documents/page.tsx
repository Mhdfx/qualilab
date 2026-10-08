import { requireRole } from "@/lib/auth";
import { listDocumentReferences } from "@/lib/document-reference";
import { documentRowOf } from "@/lib/document-reference-input";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentReferencesForm } from "@/components/admin/DocumentReferencesForm";

export const metadata = { title: "Documents qualité" };

export default async function DocumentsPage() {
  await requireRole("ADMIN");

  // Calendar dates, read in UTC: the inputs show the stored day, whatever the server's zone.
  const rows = (await listDocumentReferences()).map(documentRowOf);

  return (
    <div>
      <PageHeader
        badge="Système qualité"
        title="Documents qualité"
        subtitle="Les références et versions des formulaires imprimés par le LIMS — la cartouche de chaque PDF."
      />
      <div className="max-w-5xl">
        <DocumentReferencesForm initial={rows} />
      </div>
    </div>
  );
}
