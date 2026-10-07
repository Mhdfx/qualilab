import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, Building2, Package, Hash, Calendar, ClipboardList, Hourglass } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { labReference } from "@/lib/sample-select";
import { loadBenchPlans } from "@/lib/bench-plan";
import { canEditParameter, isOnBenchOf } from "@/lib/bench-access";
import { effectiveFactor } from "@/lib/dilution";
import { formatDate, PROGRAMME_PRIORITY_LABELS } from "@/lib/labels";
import { sampleRef } from "@/lib/reception-input";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { getDashboardPath } from "@/lib/roles";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import {
  ResultEntryForm,
  type ParameterLine,
} from "@/components/technicien/ResultEntryForm";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = await prisma.sample.findUnique({ where: { id }, select: { code: true, controlCode: true } });
  return { title: sample ? `Analyse ${labReference(sample)}` : "Analyse" };
}

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
      controlCode: true,
      type: true,
      status: true,
      lieu: true,
      produit: true,
      numeroLot: true,
      // What is analysed: « Planche verte — surface nettoyée », « Salle — Biocollecteur ».
      lineNumber: true,
      lineKind: true,
      surfaceLabel: true,
      surfaceState: true,
      surfaceAreaCm2: true,
      personName: true,
      airMethod: true,
      notes: true,
      receivedAt: true,
      conformity: true,
      conformityNote: true,
      technicianId: true,
      technician: { select: { name: true } },
      // The programme d'analyse (PROGRAMME.md §3).
      priority: true,
      dueAt: true,
      testPortion: true,
      programmeNote: true,
      programmedAt: true,
      programmedBy: { select: { name: true } },
      client: { select: { name: true } },
      serie: { select: { serialNumber: true } },
      parameters: {
        select: {
          parameterId: true,
          // Per parameter: its technician, norm version, dilution, note.
          technicianId: true,
          technician: { select: { name: true } },
          normVersion: { select: { label: true } },
          dilutionFactor: true,
          note: true,
          parameter: {
            select: {
              id: true,
              name: true,
              unit: true,
              threshold: true,
              limitValue: true,
              calcFactor: true,
            },
          },
        },
      },
      results: { include: { units: { orderBy: { unitIndex: "asc" } } } },
    },
  });

  if (!sample) notFound();
  const bench = await loadBenchPlans(sample.id);

  // A technician may only open their own bench work: the sample's
  // technician, or one of its parameters' (PROGRAMME.md §6).
  if (session.role === "TECHNICIEN" && !isOnBenchOf(sample, session.id)) {
    redirect(getDashboardPath(session.role));
  }

  const resultByParameter = new Map(sample.results.map((r) => [r.parameterId, r]));
  // « — » when nothing names it (a food sample without a designation).
  const designation = lineDesignation(sample);

  const lines: ParameterLine[] = sample.parameters.map((line) => {
    const { parameter } = line;
    const existing = resultByParameter.get(parameter.id);
    const plan = bench.plans.get(parameter.id) ?? null;
    // One reading per unit taken (R1 … Rn) for a germ with a criterion, and
    // for every parameter once the sampler took several units.
    const perUnit = plan !== null || bench.unitCount > 1;
    const units = perUnit
      ? Array.from({ length: Math.max(1, bench.unitCount) }, (_, i) => existing?.units.find((u) => u.unitIndex === i + 1)?.rawValue ?? "")
      : [];
    return {
      perUnit,
      plan: plan?.plan ?? null,
      planLabel: plan?.label ?? null,
      // The method: the programmed norm version, else the criterion's.
      normLabel: line.normVersion?.label ?? plan?.normLabel ?? null,
      units,
      parameterId: parameter.id,
      name: parameter.name,
      unit: parameter.unit,
      threshold: parameter.threshold,
      limitValue: parameter.limitValue,
      // The programmed dilution of this sample replaces the catalogue's factor.
      calcFactor: effectiveFactor(line.dilutionFactor, parameter.calcFactor),
      // When a factor transformed the entry, the bench reading (rawValue) is
      // what the technician typed and re-edits; `value` holds the computed
      // final figure.
      value: existing?.rawValue ?? existing?.value ?? "",
      note: existing?.note ?? "",
      workStatus: existing?.workStatus ?? "EN_COURS",
      manualConform: existing?.conform ?? null,
      // Only my parameters are editable; the admin stands in for anyone.
      editable: session.role !== "TECHNICIEN" || canEditParameter(sample, line, session.id),
      technicianName: line.technician?.name ?? sample.technician?.name ?? null,
      methodNote: line.note,
    };
  });

  const canEdit = sample.status === "PROGRAMME" || sample.status === "EN_ANALYSE";
  // Received but not programmed yet: nothing to type (PROGRAMME.md §6).
  const waiting = sample.status === "PRELEVE" || sample.status === "RECU";

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
        title={labReference(sample)}
        subtitle={waiting ? "En attente de programmation — le responsable des paramètres n'a pas encore confirmé le programme d'analyse." : !canEdit ? "Résultats soumis à la validation — consultation en lecture seule." : bench.plans.size > 0 ? "Lisez chaque répétition (R1 … Rn) : le verdict (satisfaisant, acceptable, non satisfaisant) suit le plan n, c, m, M du type de produit." : bench.unitCount > 1 ? "Lisez chaque répétition (R1 … Rn) : la valeur retenue est la plus défavorable, comparée à la limite de référence." : "Saisissez chaque paramètre. La conformité est calculée automatiquement à partir de la limite de référence."}
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
              <Field icon={Hash} label="N° de série">
                <span className="font-mono">{sample.serie.serialNumber}</span>
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  échantillon {sampleRef(sample.lineNumber, sample.code)}
                </span>
              </Field>
              <Field icon={Building2} label="Client">
                {sample.client.name}
              </Field>
              <Field icon={Package} label="Désignation">
                {designation === "—" ? <span className="text-slate-400">Non renseignée</span> : designation}
                {sample.lineKind === "SURFACE" && sample.surfaceAreaCm2 !== null && (
                  <span className="ml-1.5 text-xs font-normal text-slate-500">{sample.surfaceAreaCm2} cm²</span>
                )}
              </Field>
              <Field icon={Package} label="Type de produit">
                {bench.productType ? (
                  <>
                    {bench.productType.name}
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      {bench.plans.size} critère{bench.plans.size > 1 ? "s" : ""} · n = {bench.unitCount}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Aucun — lecture simple</span>
                )}
              </Field>
              <Field icon={Hash} label="N° de lot">
                {sample.numeroLot ?? <span className="text-slate-400">Non renseigné</span>}
              </Field>
              <Field icon={Calendar} label="Reçu le">
                {sample.receivedAt ? formatDate(sample.receivedAt) : "—"}
              </Field>
              {sample.programmedAt && (
                <Field icon={ClipboardList} label="Programme d'analyse">
                  Confirmé le {formatDate(sample.programmedAt)}
                  {sample.programmedBy ? ` par ${sample.programmedBy.name}` : ""}
                  <span className="block text-xs font-normal text-slate-500">
                    Priorité {PROGRAMME_PRIORITY_LABELS[sample.priority].toLowerCase()}
                    {sample.dueAt ? ` · à rendre le ${formatDate(sample.dueAt)}` : ""}
                    {sample.testPortion ? ` · prise d'essai ${sample.testPortion}` : ""}
                  </span>
                </Field>
              )}
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
            {sample.programmeNote && (
              <div className="mt-4 rounded-xl bg-teal-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                  Consignes du responsable des paramètres
                </p>
                <p className="mt-1 text-sm text-slate-700">{sample.programmeNote}</p>
              </div>
            )}
          </Card>
        </div>

        {waiting ? (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Hourglass className="h-4 w-4 text-slate-400" aria-hidden="true" />
              En attente de programmation
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Le responsable des paramètres n&apos;a pas encore confirmé le programme
              d&apos;analyse de cet échantillon : les analyses, les nombres et les méthodes
              sont fixés à cette étape. Rien à saisir pour l&apos;instant — l&apos;échantillon
              apparaîtra dans « Mes analyses » une fois programmé.
            </p>
          </Card>
        ) : canEdit ? (
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
