import { requireRole } from "@/lib/auth";
import { ReceptionShell } from "@/components/layout/RoleShells";

export default async function ReceptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("RECEPTIONNISTE", "ADMIN");

  return <ReceptionShell userName={session.name}>{children}</ReceptionShell>;
}
