import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfilesManager, type ProfileRow } from "@/components/admin/ProfilesManager";

export const metadata = { title: "Profils d'analyses" };

export default async function ProfilsPage() {
  await requireRole("ADMIN");

  const [natures, parameters, clients, profiles] = await Promise.all([
    prisma.analysisNature.findMany({
      where: { active: true },
      select: { id: true, label: true, family: true, legacyType: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.analysisParameter.findMany({
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.analysisProfile.findMany({
      select: {
        id: true,
        name: true,
        natureId: true,
        clientId: true,
        unitCount: true,
        active: true,
        sortOrder: true,
        client: { select: { name: true } },
        parameters: { select: { parameterId: true } },
      },
      orderBy: [{ clientId: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: ProfileRow[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    natureId: p.natureId,
    clientId: p.clientId,
    clientName: p.client?.name ?? null,
    unitCount: p.unitCount,
    active: p.active,
    sortOrder: p.sortOrder,
    parameterIds: p.parameters.map((e) => e.parameterId),
  }));

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Profils d'analyses"
        subtitle="Les panels d'analyses habituels de chaque nature — cochés en un geste sur le terrain. Un profil peut être propre à un client."
      />
      <ProfilesManager natures={natures} parameters={parameters} clients={clients} profiles={rows} />
    </div>
  );
}
