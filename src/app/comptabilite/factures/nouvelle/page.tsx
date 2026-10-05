import { requireRole } from "@/lib/auth";
import { NouvelleFactureForm } from "@/components/NouvelleFactureForm";

export const metadata = { title: "Nouvelle facture" };

export default async function ComptaNouvelleFacturePage() {
  await requireRole("COMPTABLE", "ADMIN");
  return <NouvelleFactureForm />;
}
