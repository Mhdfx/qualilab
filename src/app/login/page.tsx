import { redirect } from "next/navigation";
import { getSession, landingPath } from "@/lib/auth";
import { loginNoticeFor } from "@/lib/idle-policy";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Connexion" };

/**
 * `?motif=inactivite`: the session was closed for inactivity — by the shell
 * after 30 minutes (IdleLogout), or by the server after 35 (a guard's
 * `signedOutPath`, session-idle-server.ts).
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
  return <LoginForm notice={loginNoticeFor(motif)} />;
}
