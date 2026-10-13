import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2, Package, Hash, Calendar, ClipboardList, Hourglass, Undo2, UserCheck, Eye } from "lucide-react";
import { requireRole, getSession } from "@/lib/auth";
import { roleAllowed } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { labReference } from "@/lib/sample-select";
import { loadBenchPlans } from "@/lib/bench-plan";
import {
  BENCH_STATUSES,
  canEnterParameter,
  canReadAtBench,
  hasTypedResult,
  isHeldByOther,
  isUnclaimed,
} from "@/lib/bench-access";
import { reportTechnicianNames } from "@/lib/report-programme";
import { effectiveFactor } from "@/lib/dilution";
import { formatDate, formatDateTime, PROGRAMME_PRIORITY_LABELS } from "@/lib/labels";
import { sampleRef } from "@/lib/reception-input";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { getDashboardPath } from "@/lib/roles";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { ReceptionNonConformity, RECEPTION_NON_CONFORMITY_SELECT } from "@/components/samples/ReceptionNonConformity";
import { ReceptionObservation } from "@/components/samples/ReceptionObservation";
import {
  ResultEntryForm,
  type ParameterLine,
} from "@/components/technicien/ResultEntryForm";
import { ReleaseButton, TakeButton } from "@/components/technicien/BenchTakeActions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  // Metadata renders alongside the layout's redirect: the sample's blind
  // reference goes in the title only for a role that may open the page.
  const session = await getSession();
  if (!session || !roleAllowed(session.role, ["TECHNICIEN", "ADMIN"])) return { title: "Analyse" };
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
      // The reception's decision (motif, agreement of the client) and its
      // observation (A7, A9).
      ...RECEPTION_NON_CONFORMITY_SELECT,
      receptionNote: true,
      // The validator's last « Renvoyer au technicien »: never cleared, so
      // its date says whether it is the current one.
      rejectionReason: true,
      rejectedAt: true,
      rejectedBy: { select: { name: true } },
      // The holder: the technician who took the sample, and when
      // (prise en charge libre, PROGRAMME.md §10).
      technicianId: true,
      assignedAt: true,
      technician: { select: { name: true } },
      // A sample held at reception is never taken (`takeRefusal`).
      analysisBlocked: true,
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
          // Per parameter: its norm version, dilution, note — and its own
          // technician on a line programmed before 13/10.
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

  // A technician opens their own work at any step, and the whole shared
  // bench: « À prendre » and their colleagues' samples, read-only
  // (PROGRAMME.md §10.4). A colleague's submitted or validated sample stays
  // out of reach.
  const isTechnician = session.role === "TECHNICIEN";
  if (isTechnician && !canReadAtBench(sample, session.id)) {
    redirect(getDashboardPath(session.role));
  }
  const bench = await loadBenchPlans(sample.id);

  // Who holds the sample (prise en charge libre, PROGRAMME.md §10).
  const free = isUnclaimed(sample);
  const onBench = BENCH_STATUSES.includes(sample.status);
  // The holder, plus the parameter technicians of a line programmed before 13/10.
  const holderName = reportTechnicianNames(sample) ?? "un collègue";
  const takenOn = sample.assignedAt ? `le ${formatDateTime(sample.assignedAt)}` : null;
  // A colleague's sample: readable, never typed on (403 at the save).
  const heldByOther = isTechnician && isHeldByOther(sample, session.id);
  // Only a technician takes, and only a free sample on the bench (`takeRefusal`).
  const canTake = isTechnician && free && onBench && !sample.analysisBlocked;
  // Its holder or the admin gives it back, while nothing is typed on it (`untakeRefusal`).
  const typed = sample.results.some((result) =>
    hasTypedResult({
      value: result.value,
      note: result.note,
      workStatus: result.workStatus,
      unitCount: result.units.length,
    })
  );
  const canRelease =
    !free && onBench && !typed && (session.role === "ADMIN" || sample.technicianId === session.id);

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
      // Mine, or any of a free sample (the first save takes it) — the rule
      // the save applies (`canEnterParameter`); the admin stands in for anyone.
      editable: !isTechnician || canEnterParameter(sample, line, session.id),
      technicianName: line.technician?.name ?? sample.technician?.name ?? null,
      methodNote: line.note,
    };
  });

  // On the bench and not a colleague's: the sheet takes input.
  const canEdit = onBench && !heldByOther;
  // Received but not programmed yet: nothing to type (PROGRAMME.md §6).
  const waiting = sample.status === "PRELEVE" || sample.status === "RECU";
  // Back on the bench after a validator's « Renvoyer au technicien ».
  const sentBack = sample.status === "EN_ANALYSE" && sample.rejectedAt !== null;

  const subtitle = waiting
    ? "En attente de programmation — le responsable des paramètres n'a pas encore confirmé le programme d'analyse."
    : heldByOther
      ? `Pris en charge par ${holderName} — consultation en lecture seule.`
      : !canEdit
        ? "Résultats soumis à la validation — consultation en lecture seule."
        : bench.plans.size > 0
          ? "Lisez chaque répétition (R1 … Rn) : le verdict (satisfaisant, acceptable, non satisfaisant) suit le plan n, c, m, M du type de produit."
          : bench.unitCount > 1
            ? "Lisez chaque répétition (R1 … Rn) : la valeur retenue est la plus défavorable, comparée à la limite de référence."
            : "Saisissez chaque paramètre. La conformité est calculée automatiquement à partir de la limite de référence.";

  return (
    <div>
      <Link
        href="/technicien"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mes analyses
      </Link>

      <PageHeader badge="Analyse" title={labReference(sample)} subtitle={subtitle} />

      {heldByOther && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <p>
            {takenOn
              ? `Pris par ${holderName} ${takenOn} — vous pouvez consulter cette fiche, pas la saisir.`
              : `Pris par ${holderName} — vous pouvez consulter cette fiche, pas la saisir.`}
          </p>
        </div>
      )}

      {sentBack && sample.rejectedAt && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p>
            <b className="font-semibold">
              Renvoyé par {sample.rejectedBy?.name ?? "le validateur"} le {formatDateTime(sample.rejectedAt)} :
            </b>{" "}
            <span className="whitespace-pre-line">{sample.rejectionReason?.trim() || "motif non précisé."}</span>
          </p>
        </div>
      )}

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
              {!waiting && (
                <Field icon={UserCheck} label="Prise en charge">
                  {free ? (
                    onBench ? (
                      "Personne — à prendre"
                    ) : (
                      <span className="text-slate-400">Personne</span>
                    )
                  ) : takenOn ? (
                    `${holderName} — ${takenOn}`
                  ) : (
                    holderName
                  )}
                  {canTake && (
                    <>
                      <TakeButton sampleId={sample.id} className="mt-2.5" />
                      <span className="mt-2 block text-xs font-normal text-slate-500">
                        En enregistrant un premier résultat, vous prenez cet échantillon en charge.
                      </span>
                    </>
                  )}
                  {!isTechnician && free && onBench && (
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Vous pouvez saisir à sa place, mais un technicien doit le prendre en charge avant la soumission.
                    </span>
                  )}
                  {canRelease && (
                    <>
                      <ReleaseButton sampleId={sample.id} className="mt-2.5" />
                      <span className="mt-2 block text-xs font-normal text-slate-500">
                        Possible tant qu&apos;aucun résultat n&apos;est saisi.
                      </span>
                    </>
                  )}
                </Field>
              )}
            </dl>

            <ReceptionNonConformity sample={sample} />
            <ReceptionObservation note={sample.receptionNote} />

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
              apparaîtra dans « À prendre » une fois programmé.
            </p>
          </Card>
        ) : canEdit ? (
          <ResultEntryForm
            sampleId={sample.id}
            canEdit
            initialLines={lines}
            submitBlocked={
              session.role === "ADMIN" && free
                ? "Un technicien doit prendre cet échantillon en charge avant sa soumission."
                : null
            }
          />
        ) : heldByOther ? (
          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">Pris par un collègue</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              {`Seul ${holderName} saisit les résultats de cet échantillon : vous suivez ici l'avancement de sa saisie.`}
            </p>
            <div className="mt-4">
              <ResultEntryForm sampleId={sample.id} canEdit={false} initialLines={lines} heldBy={holderName} />
            </div>
          </Card>
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
