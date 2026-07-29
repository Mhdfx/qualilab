import { requireRole } from "@/lib/auth";
import { TechnicienShell } from "@/components/layout/RoleShells";

export default async function TechnicienLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("TECHNICIEN", "ADMIN");

  return <TechnicienShell userName={session.name}>{children}</TechnicienShell>;
}
