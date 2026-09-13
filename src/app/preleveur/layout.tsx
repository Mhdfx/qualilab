import { requireRole } from "@/lib/auth";
import { RoleShell } from "@/components/layout/RoleShell";

export default async function PreleveurLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("PRELEVEUR");

  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
