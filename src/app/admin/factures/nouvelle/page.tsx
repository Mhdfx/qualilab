import { requireRole } from "@/lib/auth";
import { NouvelleFactureForm } from "@/components/NouvelleFactureForm";

export default async function NouvelleFacturePage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("ADMIN");
  return <NouvelleFactureForm />;
}
