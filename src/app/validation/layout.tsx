import { requireRole } from "@/lib/auth";
import { ValidationShell } from "@/components/layout/RoleShells";

export default async function ValidationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("VALIDATEUR", "ADMIN");

  return <ValidationShell userName={session.name}>{children}</ValidationShell>;
}
