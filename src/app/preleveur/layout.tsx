import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PreleveurShell } from "@/components/layout/PreleveurShell";

export default async function PreleveurLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "PRELEVEUR") redirect("/admin");

  return <PreleveurShell userName={session.name}>{children}</PreleveurShell>;
}
