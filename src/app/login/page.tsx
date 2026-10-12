import { redirect } from "next/navigation";
import { getSession, getDashboardPath } from "@/lib/auth";
import { loginNoticeFor } from "@/lib/idle-policy";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Connexion" };

/** `?motif=inactivite`: the shell closed the session after 30 minutes without activity (IdleLogout). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) redirect(getDashboardPath(session.role));

  const { motif } = await searchParams;
  return <LoginForm notice={loginNoticeFor(motif)} />;
}
