import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, Building2, Package, Hash, Calendar } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { getDashboardPath } from "@/lib/roles";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import {
  ResultEntryForm,
  type ParameterLine,
} from "@/components/technicien/ResultEntryForm";

export default async function AnalysePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("TECHNICIEN", "ADMIN");
  const { id } = await params;

  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      serialNumber: true,
      controlCode: true,
      type: true,
      status: true,
      lieu: true,
      produit: true,
      numeroLot: true,
      notes: true,
      receivedAt: true,
      conformity: true,
      conformityNote: true,
      technicianId: true,
      client: { select: { name: true } },
      parameters: {
        select: {
          parameter: {
            select: {
              id: true,
              name: true,
              unit: true,
              threshold: true,
              limitValue: true,
            },
          },
        },
      },
      results: true,
    },
  });

  if (!sample) notFound();

  // A technician may only open their own bench work.
  if (session.role === "TECHNICIEN" && sample.technicianId !== session.id) {
    redirect(getDashboardPath(session.role));
  }

  const resultByParameter = new Map(sample.results.map((r) => [r.parameterId, r]));

  const lines: ParameterLine[] = sample.parameters.map(({ parameter }) => {
    const existing = resultByParameter.get(parameter.id);
    return {
      parameterId: parameter.id,
      name: parameter.name,
      unit: parameter.unit,
      threshold: parameter.threshold,
      limitValue: parameter.limitValue,
      value: existing?.value ?? "",
      note: existing?.note ?? "",
      workStatus: existing?.workStatus ?? "EN_COURS",
      manualConform: existing?.conform ?? null,
    };
  });

  const canEdit = sample.status === "RECU" || sample.status === "EN_ANALYSE";

  return (
    <div>
      <Link
        href="/technicien"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mes analyses
      </Link>

      <PageHeader
        badge="Analyse"
        title={sample.serialNumber ?? sample.code}
        subtitle="Saisissez chaque paramètre. La conformité est calculée automatiquement à partir de la limite de référence."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Échantillon
              </h2>
              <div className="flex items-center gap-2">
                <TypeBadge type={sample.type} />
                <StatusBadge status={sample.status} />
              </div>
            </div>

            <dl className="mt-4 space-y-3.5">
              <Field icon={Hash} label="Code contrôle">
                <span className="font-mono">{sample.controlCode ?? "—"}</span>
              </Field>
              <Field icon={Building2} label="Client">
                {sample.client.name}
              </Field>
              <Field icon={Package} label="Produit">
                {sample.produit ?? <span className="text-slate-400">Non renseigné</span>}
              </Field>
              <Field icon={Hash} label="N° de lot">
                {sample.numeroLot ?? <span className="text-slate-400">Non renseigné</span>}
              </Field>
              <Field icon={Calendar} label="Reçu le">
                {sample.receivedAt ? formatDate(sample.receivedAt) : "—"}
              </Field>
            </dl>

            {sample.conformity === false && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <b>Non conforme à réception.</b>
                  {sample.conformityNote && ` ${sample.conformityNote}`}
                </span>
              </p>
            )}

            {sample.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Notes du préleveur
                </p>
                <p className="mt-1 text-sm text-slate-700">{sample.notes}</p>
              </div>
            )}
          </Card>
        </div>

        {canEdit ? (
          <ResultEntryForm sampleId={sample.id} canEdit initialLines={lines} />
        ) : (
          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">
              Saisie clôturée
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Cet échantillon est au statut «{" "}
              <StatusBadge status={sample.status} /> » : les résultats ont été
              soumis et ne sont plus modifiables ici.
            </p>
            <div className="mt-4">
              <ResultEntryForm
                sampleId={sample.id}
                canEdit={false}
                initialLines={lines}
              />
            </div>
          </Card>
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
