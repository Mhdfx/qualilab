"use client";

import type { Role } from "@/lib/roles";
import { DashboardShell } from "./DashboardShell";
import { navFor, roleLabelFor } from "./nav-for-role";

type RoleShellProps = {
  role: Role;
  userName: string;
  children: React.ReactNode;
};

/**
 * The one shell every space layout renders. The sidebar is chosen from the
 * signed-in ROLE, not from the URL segment, so moving between spaces never
 * swaps the menu under the user.
 */
export function RoleShell({ role, userName, children }: RoleShellProps) {
  return (
    <DashboardShell
      userName={userName}
      roleLabel={roleLabelFor(role)}
      navSections={navFor(role)}
    >
      {children}
    </DashboardShell>
  );
}
