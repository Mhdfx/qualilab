import { requireRole } from "@/lib/auth";
import { RoleShell } from "@/components/layout/RoleShell";

/** The responsable des paramètres' space (PROGRAMME.md §2); the admin stands in. */
export default async function ProgrammationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("PROGRAMMATEUR", "ADMIN");

  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
