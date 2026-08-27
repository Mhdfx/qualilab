import { requireRole } from "@/lib/auth";
import { QualiteShell } from "@/components/layout/RoleShells";

export default async function QualiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("VALIDATEUR", "ADMIN");

  return <QualiteShell userName={session.name}>{children}</QualiteShell>;
}
