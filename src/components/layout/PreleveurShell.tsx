"use client";

import { DashboardShell } from "./DashboardShell";
import { preleveurNav } from "./preleveur-nav";

type PreleveurShellProps = {
  userName: string;
  children: React.ReactNode;
};

export function PreleveurShell({ userName, children }: PreleveurShellProps) {
  return (
    <DashboardShell
      userName={userName}
      roleLabel="Module Préleveur"
      navSections={preleveurNav}
    >
      {children}
    </DashboardShell>
  );
}
