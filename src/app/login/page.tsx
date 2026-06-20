import { redirect } from "next/navigation";
import { getSession, getDashboardPath } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(getDashboardPath(session.role));

  return <LoginForm />;
}
