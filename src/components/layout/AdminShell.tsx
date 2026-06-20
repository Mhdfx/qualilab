"use client";

import { DashboardShell } from "./DashboardShell";
import { adminNav } from "./admin-nav";

type AdminShellProps = {
  userName: string;
  children: React.ReactNode;
};

export function AdminShell({ userName, children }: AdminShellProps) {
  return (
    <DashboardShell
      userName={userName}
      roleLabel="Administration"
      navSections={adminNav}
    >
      {children}
    </DashboardShell>
  );
}
