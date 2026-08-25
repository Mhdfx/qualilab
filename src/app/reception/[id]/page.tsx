import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, MapPin, Clock, User, FlaskConical } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ReceptionForm,
  type TechnicianOption,
} from "@/components/reception/ReceptionForm";

export default async function ReceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [sample, technicians, workload] = await Promise.all([
    prisma.sample.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        lieu: true,
        type: true,
        status: true,
        notes: true,
        produit: true,
        numeroLot: true,
        sampledAt: true,
        client: { select: { name: true, ice: true } },
        user: { select: { name: true } },
        parameters: {
          select: { parameter: { select: { id: true, name: true, unit: true } } },
        },
      },
    }),
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
  ]);

  if (!sample) notFound();

  const loadByTechnician = new Map(
    workload.map((row) => [row.technicianId, row._count._all])
  );

  const technicianOptions: TechnicianOption[] = technicians.map((technician) => ({
    id: technician.id,
    name: technician.name,
    load: loadByTechnician.get(technician.id) ?? 0,
  }));

  const alreadyReceived = sample.status !== "PRELEVE";

  return (
    <div>
      <Link
        href="/reception"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        File de réception
      </Link>

      <PageHeader
        badge="Réception"
        title={sample.code}
        subtitle="Vérifiez les informations saisies sur le terrain, puis contrôlez la conformité et attribuez l'échantillon."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Saisi sur le terrain
            </h2>
            <div className="flex items-center gap-2">
              <TypeBadge type={sample.type} />
              <StatusBadge status={sample.status} />
            </div>
          </div>

          <dl className="mt-4 space-y-3.5">
            <Field icon={Building2} label="Client">
              {sample.client.name}
              {sample.client.ice && (
                <span className="block text-xs text-slate-500">
                  ICE {sample.client.ice}
                </span>
              )}
            </Field>
            <Field icon={MapPin} label="Lieu de prélèvement">
              {sample.lieu}
            </Field>
            <Field icon={Clock} label="Date & heure du prélèvement">
              {formatDateTime(sample.sampledAt)}
            </Field>
            <Field icon={User} label="Préleveur">
              {sample.user.name}
            </Field>
            <Field icon={FlaskConical} label="Paramètres demandés">
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {sample.parameters.map(({ parameter }) => (
                  <li
                    key={parameter.id}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {parameter.name}
                    {parameter.unit && (
                      <span className="text-slate-500"> ({parameter.unit})</span>
                    )}
                  </li>
                ))}
              </ul>
            </Field>
          </dl>

          {sample.notes && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Notes du préleveur
              </p>
              <p className="mt-1 text-sm text-slate-700">{sample.notes}</p>
            </div>
          )}
        </Card>

        {alreadyReceived ? (
          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">
              Échantillon déjà réceptionné
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Cet échantillon a quitté la file de réception : son statut est
              désormais « <StatusBadge status={sample.status} /> ».
            </p>
            <Link
              href="/reception"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour à la file
            </Link>
          </Card>
        ) : (
          <ReceptionForm
            sampleId={sample.id}
            sampleCode={sample.code}
            technicians={technicianOptions}
            initialProduit={sample.produit ?? ""}
            initialNumeroLot={sample.numeroLot ?? ""}
          />
        )}
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-slate-800">{children}</dd>
      </div>
    </div>
  );
}
