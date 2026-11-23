import { RoleShell } from "@/components/layout/RoleShell";
import { LEGACY_HISTORY_ON_PORTAL } from "@/lib/lab-proposals";
import { hasLegacyHistory } from "@/lib/legacy-history-server";
import { logPortalLogin, requirePortalPage } from "@/lib/portal-server";

export const metadata = { title: { default: "Espace client · Qualilab International", template: "%s · Espace client Qualilab" } };

/**
 * The client portal (PORTAIL.md). Only a CLIENT account gets here — a
 * laboratory account is sent back to its own dashboard by `requireRole`.
 * Each page checks the account's client again (layouts and pages render in
 * parallel): an account without an open client sees the explanation, never
 * data. A password to change (Q81) is stopped by each page, not here: the
 * layout also frames /portail/compte, where the password is chosen.
 */
export default async function PortailLayout({ children }: { children: React.ReactNode }) {
  const { session, access } = await requirePortalPage({ allowsPasswordChange: true });
  // Side by side (Perf 3, P3-1): the login journal and the menu's history entry.
  const [, portalHistory] = await Promise.all([
    // The portal opens once the password is chosen: the change renews the
    // session, whose first page is then the one journalled.
    access.ok && !session.mustChangePassword ? logPortalLogin(session, access.clientId) : Promise.resolve(),
    // Lot 5B, HA4: « Historique (ancien logiciel) » in the menu only for a client that has one.
    LEGACY_HISTORY_ON_PORTAL && access.ok ? hasLegacyHistory(access.clientId) : Promise.resolve(false),
  ]);

  return (
    <RoleShell role={session.role} userName={session.name} portalHistory={portalHistory}>
      {children}
    </RoleShell>
  );
}
