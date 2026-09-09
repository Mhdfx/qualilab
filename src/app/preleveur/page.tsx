import { PreleveurDashboard } from "@/components/PreleveurDashboard";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Prélèvements" };

export default async function PreleveurPage() {
  // Belt and braces with the layout guard.
  const session = await requireRole("PRELEVEUR");
  return <PreleveurDashboard userName={session.name} />;
}
