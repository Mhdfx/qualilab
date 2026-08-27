import { requireRole } from "@/lib/auth";
import { getCompany } from "@/lib/company-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompanyForm } from "@/components/admin/CompanyForm";

export const metadata = { title: "Entreprise" };

export default async function EntreprisePage() {
  await requireRole("ADMIN");

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Coordonnées de l'entreprise"
        subtitle="L'identité imprimée sur les rapports, les factures et les emails. La modifier ici suffit."
      />
      <div className="max-w-3xl">
        <CompanyForm initial={await getCompany()} />
      </div>
    </div>
  );
}
