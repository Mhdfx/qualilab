import { requireRole } from "@/lib/auth";
import { VisitForm } from "@/components/preleveur/VisitForm";

export const metadata = { title: "Nouvelle visite" };

export default async function NouvelleVisitePage() {
  // Belt and braces with the layout guard.
  const session = await requireRole("PRELEVEUR");
  return <VisitForm me={{ id: session.id, name: session.name }} />;
}
