import { requireRole } from "@/lib/auth";
import { getCompany } from "@/lib/company-server";
import { prisma } from "@/lib/prisma";
import { getReportImages } from "@/lib/report-images";
import { ALERT_COPY_SELECT } from "@/lib/alert-copies-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { ReportImagesForm } from "@/components/admin/ReportImagesForm";
import { EmailSenderForm } from "@/components/admin/EmailSenderForm";
import { AlertCopiesManager } from "@/components/admin/AlertCopiesManager";

export const metadata = { title: "Entreprise" };

export default async function EntreprisePage() {
  await requireRole("ADMIN");

  // Lot 3C (RETOUR-LABO-28-10.md): the accreditation logo and the stamp
  // (K4), the e-mails' sender (L4), the internal copies of the alerts (L5).
  const [company, images, sender, copies, clients] = await Promise.all([
    getCompany(),
    getReportImages(),
    prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { emailSenderAddress: true, emailSenderName: true, emailReplyTo: true },
    }),
    prisma.alertCopyAddress.findMany({ select: ALERT_COPY_SELECT, orderBy: { createdAt: "asc" } }),
    prisma.client.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Coordonnées de l'entreprise"
        subtitle="L'identité imprimée sur les rapports, les factures et les emails. La modifier ici suffit."
      />
      <div className="max-w-3xl space-y-5">
        <CompanyForm initial={company} />
        <ReportImagesForm
          initial={{ accreditationLogoData: images.accreditationLogoDataUri ?? null, stampData: images.stampDataUri ?? null }}
        />
        <EmailSenderForm
          initial={sender ?? { emailSenderAddress: null, emailSenderName: null, emailReplyTo: null }}
          company={{ name: company.name, email: company.email }}
          envFrom={process.env.EMAIL_FROM?.trim() || null}
        />
        <AlertCopiesManager initial={copies} clients={clients} />
      </div>
    </div>
  );
}
