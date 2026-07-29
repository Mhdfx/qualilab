import { requireRole } from "@/lib/auth";
import { PreleveurShell } from "@/components/layout/PreleveurShell";

export default async function PreleveurLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("PRELEVEUR");

  return <PreleveurShell userName={session.name}>{children}</PreleveurShell>;
}
