import { requireRole } from "@/lib/auth";
import { getLabSettings } from "@/lib/lab-settings";
import { DepositForm } from "@/components/reception/DepositForm";

export const metadata = { title: "Nouveau dépôt" };

export default async function NouveauDepotPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("RECEPTIONNISTE", "ADMIN");

  // No technician list: the counter assigns nobody (RETOUR-LABO-06-10.md
  // §9.3), the responsable des paramètres does at programming time.
  const settings = await getLabSettings();

  return <DepositForm thresholds={settings} />;
}
