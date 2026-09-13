import { requireRole } from "@/lib/auth";
import { RoleShell } from "@/components/layout/RoleShell";

export default async function ComptabiliteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("COMPTABLE", "ADMIN");

  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
