import { requireRole } from "@/lib/auth";
import { RoleShell } from "@/components/layout/RoleShell";

/**
 * « Mon compte » of the laboratory's staff: every laboratory role, named one
 * by one — never the portal's CLIENT, whose own page is /portail/compte
 * (compte-guard.test.ts). The sidebar stays the signed-in role's own.
 */
export default async function CompteLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "PROGRAMMATEUR",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "MAGASINIER",
    "ADMIN"
  );
  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
