import { ShieldCheck, ClipboardList, FileCheck2, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ValidationQueue } from "@/components/validation/ValidationQueue";

export default async function ValidationPage() {
  const [items, valides, rapports, envoyes] = await Promise.all([
    prisma.sample.findMany({
      where: { status: "RESULTATS_SAISIS" },
      select: {
        id: true,
        serialNumber: true,
        controlCode: true,
        type: true,
        validatedById: true,
        approvedById: true,
        receivedAt: true,
        client: { select: { name: true } },
        technician: { select: { name: true } },
        results: { select: { conform: true, workStatus: true } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.sample.count({ where: { status: "VALIDE" } }),
    prisma.report.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
  ]);

  const awaitingAdmin = items.filter((item) => item.validatedById).length;

  return (
    <div>
      <PageHeader
        badge="Espace validation"
        title="Validation qualité"
        subtitle="Contrôlez les résultats face aux seuils. Chaque échantillon requiert la validation technique puis l'approbation de l'administrateur."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="À valider" value={items.length - awaitingAdmin} icon={ClipboardList} accent="amber" />
          <StatCard label="Attente admin" value={awaitingAdmin} icon={ShieldCheck} accent="violet" />
          <StatCard label="Validés" value={valides} icon={FileCheck2} accent="emerald" />
          <StatCard label="Rapports envoyés" value={envoyes} icon={Send} accent="brand" />
        </div>
      </section>

      <section id="file" aria-label="File de validation">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            En attente de validation
          </h2>
          <span className="text-sm text-slate-500">
            {items.length} échantillon{items.length > 1 ? "s" : ""}
            {rapports > 0 && ` · ${rapports} rapport${rapports > 1 ? "s" : ""}`}
          </span>
        </div>
        <ValidationQueue items={items} />
      </section>
    </div>
  );
}
