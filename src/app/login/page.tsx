import { redirect } from "next/navigation";
import { getSession, landingPath } from "@/lib/auth";
import { loginNoticeFor } from "@/lib/idle-policy";
import { revocationNoticeFor } from "@/lib/session-revocation";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Connexion" };

/**
 * `?motif=inactivite`: the session was closed for inactivity — by the shell
 * after 30 minutes (IdleLogout), or by the server after 35 (a guard's
 * `signedOutPath`, session-idle-server.ts).
 * `?motif=reinitialisation`, `desactivation`, `acces`: the administrator
 * closed it — a password reset, a disabling, a portal account's access
 * changed (`signedOutPath` read the marker the change left,
 * session-revocation.ts).
 * `?motif=changement`: the person's own password change closed this
 * device's session (« Mon compte » on another device,
 * password-change-server.ts) — the same marker.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already signed in: the dashboard — or « Mon compte » while the password
  // must be changed (Q81).
  const session = await getSession();
  if (session) redirect(landingPath(session));

  const { motif } = await searchParams;
  const revoked = revocationNoticeFor(motif);
  return <LoginForm notice={revoked ?? loginNoticeFor(motif)} noticeKind={revoked ? "account" : "idle"} />;
}
