import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { AchatSettingsForm } from "@/components/magasin/AchatSettingsForm";
import { loadAchatSettings } from "@/lib/achat-settings";
import { PAYMENT_REQUIRES_TAX_CERTIFICATE, PURCHASE_PARTIAL_PAYMENTS } from "@/lib/lab-proposals";

export const metadata = { title: "Réglages Achat & Stock" };

/**
 * The Achat & Stock settings (lot 3D: M4 expiry window, M1 default VAT rate,
 * M7 retenue à la source). The magasinier reads them; the administrator
 * changes them (`PUT /api/stock/settings` admits the administrator only).
 */
export default async function AchatSettingsPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("MAGASINIER", "ADMIN");
  const settings = await loadAchatSettings();
  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Réglages"
        subtitle="Péremption, TVA par défaut et retenue à la source — les taux de la retenue viennent de votre comptable."
      />
      <AchatSettingsForm
        initial={settings}
        editable={session.role === "ADMIN"}
        partialPayments={PURCHASE_PARTIAL_PAYMENTS}
        paymentRequiresCertificate={PAYMENT_REQUIRES_TAX_CERTIFICATE}
      />
    </div>
  );
}
