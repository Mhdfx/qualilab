import { requireRole } from "@/lib/auth";
import { listDocumentReferences } from "@/lib/document-reference";
import { formatIsoDay } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentReferencesForm, type DocumentRow } from "@/components/admin/DocumentReferencesForm";

export const metadata = { title: "Documents qualité" };

export default async function DocumentsPage() {
  await requireRole("ADMIN");

  const rows: DocumentRow[] = (await listDocumentReferences()).map((row) => ({
    docType: row.docType,
    reference: row.reference,
    version: row.version,
    createdOn: row.createdOn ? formatIsoDay(row.createdOn) : "",
    updatedOn: row.updatedOn ? formatIsoDay(row.updatedOn) : "",
  }));

  return (
    <div>
      <PageHeader
        badge="Système qualité"
        title="Documents qualité"
        subtitle="Les références et versions des formulaires imprimés par le LIMS — le cartouche de chaque PDF."
      />
      <div className="max-w-4xl">
        <DocumentReferencesForm initial={rows} />
      </div>
    </div>
  );
}
