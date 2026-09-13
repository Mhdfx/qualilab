import { requireRole } from "@/lib/auth";
import { VisitForm } from "@/components/preleveur/VisitForm";

export const metadata = { title: "Nouvelle visite" };

export default async function NouvelleVisitePage() {
  // Belt and braces with the layout guard.
  await requireRole("PRELEVEUR");
  return <VisitForm />;
}
