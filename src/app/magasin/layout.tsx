import { requireRole } from "@/lib/auth";
import { MagasinShell } from "@/components/layout/RoleShells";

export default async function MagasinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("MAGASINIER", "ADMIN");

  return <MagasinShell userName={session.name}>{children}</MagasinShell>;
}
