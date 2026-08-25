import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { UsersManager } from "@/components/admin/UsersManager";

export default async function UtilisateursPage() {
  const session = await requireRole("ADMIN");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      banned: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        badge="Gestion"
        title="Utilisateurs"
        subtitle="Créez les comptes, attribuez les rôles, désactivez un départ, réinitialisez un mot de passe."
      />
      <UsersManager users={users} selfId={session.id} />
    </div>
  );
}
