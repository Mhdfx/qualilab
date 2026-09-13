import { requireRole } from "@/lib/auth";
import { RoleShell } from "@/components/layout/RoleShell";

export default async function TechnicienLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("TECHNICIEN", "ADMIN");

  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
