import { requireRole } from "@/lib/auth";
import { RoleShell } from "@/components/layout/RoleShell";

/** The analyses search — every laboratory role (RETOUR-LABO-29-09.md, slice F). */
export default async function RechercheLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("RECEPTIONNISTE", "PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
