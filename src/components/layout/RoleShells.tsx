"use client";

import { DashboardShell } from "./DashboardShell";
import {
  receptionNav,
  technicienNav,
  validationNav,
  commercialNav,
  comptabiliteNav,
} from "./role-navs";

/**
 * One shell per role space.
 *
 * Each shell imports its own navigation on the client: the nav items carry
 * Lucide icon components, which cannot cross the server/client boundary as
 * props. Same pattern as AdminShell / PreleveurShell.
 */

type ShellProps = {
  userName: string;
  children: React.ReactNode;
};

export function ReceptionShell({ userName, children }: ShellProps) {
  return (
    <DashboardShell userName={userName} roleLabel="Réception" navSections={receptionNav}>
      {children}
    </DashboardShell>
  );
}

export function TechnicienShell({ userName, children }: ShellProps) {
  return (
    <DashboardShell userName={userName} roleLabel="Analyses" navSections={technicienNav}>
      {children}
    </DashboardShell>
  );
}

export function ValidationShell({ userName, children }: ShellProps) {
  return (
    <DashboardShell userName={userName} roleLabel="Validation qualité" navSections={validationNav}>
      {children}
    </DashboardShell>
  );
}

export function CommercialShell({ userName, children }: ShellProps) {
  return (
    <DashboardShell userName={userName} roleLabel="Gestion commerciale" navSections={commercialNav}>
      {children}
    </DashboardShell>
  );
}

export function ComptabiliteShell({ userName, children }: ShellProps) {
  return (
    <DashboardShell userName={userName} roleLabel="Comptabilité" navSections={comptabiliteNav}>
      {children}
    </DashboardShell>
  );
}
