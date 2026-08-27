import { PreleveurDashboard } from "@/components/PreleveurDashboard";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Prélèvements" };

export default async function PreleveurPage() {
  const session = await getSession();
  return <PreleveurDashboard userName={session!.name} />;
}
