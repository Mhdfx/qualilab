import { requireRole } from "@/lib/auth";
import { ComptabiliteShell } from "@/components/layout/RoleShells";

export default async function ComptabiliteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("COMPTABLE", "ADMIN");

  return <ComptabiliteShell userName={session.name}>{children}</ComptabiliteShell>;
}
