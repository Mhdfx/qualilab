"use client";

import type { Role } from "@/lib/roles";
import { DashboardShell } from "./DashboardShell";
import { navFor, roleLabelFor } from "./nav-for-role";

type RoleShellProps = {
  role: Role;
  userName: string;
  children: React.ReactNode;
  /** Lot 5B, HA4: the portal shows « Historique (ancien logiciel) » (see `navFor`). */
  portalHistory?: boolean;
};

/**
 * The one shell every space layout renders. The sidebar is chosen from the
 * signed-in ROLE, not from the URL segment, so moving between spaces never
 * swaps the menu under the user.
 */
export function RoleShell({ role, userName, children, portalHistory = false }: RoleShellProps) {
  return (
    <DashboardShell
      userName={userName}
      role={role}
      roleLabel={roleLabelFor(role)}
      navSections={navFor(role, { portalHistory })}
    >
      {children}
    </DashboardShell>
  );
}
