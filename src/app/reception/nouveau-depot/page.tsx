import { requireRole } from "@/lib/auth";
import { getLabSettings } from "@/lib/lab-settings";
import { DepositForm } from "@/components/reception/DepositForm";

export const metadata = { title: "Nouveau dépôt" };

export default async function NouveauDepotPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("RECEPTIONNISTE", "ADMIN");

  // No technician list: nobody assigns one (RETOUR-LABO-06-10.md §9.3) —
  // once programmed, a technician takes the sample from « À prendre »
  // (prise en charge libre, PROGRAMME.md §10).
  const settings = await getLabSettings();

  return <DepositForm thresholds={settings} consultationRequired={settings.consultationRequired} />;
}
