import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { DepositForm } from "@/components/reception/DepositForm";
import type { TechnicianOption } from "@/components/reception/ReceptionForm";

export const metadata = { title: "Nouveau dépôt" };

export default async function NouveauDepotPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("RECEPTIONNISTE", "ADMIN");

  const [technicians, workload, settings] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TECHNICIEN", banned: { not: true } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.sample.groupBy({
      by: ["technicianId"],
      where: { status: { in: ["RECU", "EN_ANALYSE"] } },
      _count: { _all: true },
    }),
    getLabSettings(),
  ]);

  const loadByTechnician = new Map(workload.map((row) => [row.technicianId, row._count._all]));
  const technicianOptions: TechnicianOption[] = technicians
    .map((t) => ({ id: t.id, name: t.name, load: loadByTechnician.get(t.id) ?? 0 }))
    .sort((a, b) => a.load - b.load || a.name.localeCompare(b.name, "fr"));

  return (
    <DepositForm
      technicians={technicianOptions}
      thresholds={settings}
      blockNonConform={settings.blockNonConformAtReception}
    />
  );
}
