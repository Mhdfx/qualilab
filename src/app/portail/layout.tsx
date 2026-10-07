import { RoleShell } from "@/components/layout/RoleShell";
import { logPortalLogin, requirePortalPage } from "@/lib/portal-server";

export const metadata = { title: { default: "Espace client · Qualilab International", template: "%s · Espace client Qualilab" } };

/**
 * The client portal (PORTAIL.md). Only a CLIENT account gets here — a
 * laboratory account is sent back to its own dashboard by `requireRole`.
 * Each page checks the account's client again (layouts and pages render in
 * parallel): an account without an open client sees the explanation, never
 * data.
 */
export default async function PortailLayout({ children }: { children: React.ReactNode }) {
  const { session, access } = await requirePortalPage();
  if (access.ok) await logPortalLogin(session.id, access.clientId);

  return (
    <RoleShell role={session.role} userName={session.name}>
      {children}
    </RoleShell>
  );
}
