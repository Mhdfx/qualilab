import { requireRole } from "@/lib/auth";
import { CommercialShell } from "@/components/layout/RoleShells";

export default async function CommercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("GESTIONNAIRE", "ADMIN");

  return <CommercialShell userName={session.name}>{children}</CommercialShell>;
}
