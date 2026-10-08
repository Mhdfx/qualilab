import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Package,
  Hash,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { requireRole, getSession } from "@/lib/auth";
import { roleAllowed } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { needsRegulation, proposeRegulation } from "@/lib/regulation";
import { labReference } from "@/lib/sample-select";
import { sampleVerdict } from "@/lib/interpretation";
import { repetitionLabel } from "@/lib/series";
import { VerdictBadge } from "@/components/samples/VerdictBadge";
import { SampleVerbs } from "@/components/samples/SampleVerbs";
import { formatDateTime } from "@/lib/labels";
import { sampleRef } from "@/lib/reception-input";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { approvalState } from "@/lib/sample-status";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { ValidationPanel } from "@/components/validation/ValidationPanel";
import { ReportActions } from "@/components/validation/ReportActions";
import { amendedNumber } from "@/lib/report-amendment";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  // Metadata renders alongside the layout's redirect: the sample's blind
  // reference goes in the title only for a role that may open the page.
  const session = await getSession();
  if (!session || !roleAllowed(session.role, ["VALIDATEUR", "ADMIN"])) return { title: "Validation des résultats" };
  const { id } = await params;
  const sample = await prisma.sample.findUnique({ where: { id }, select: { code: true, controlCode: true } });
  return { title: sample ? `Contrôle ${labReference(sample)}` : "Validation des résultats" };
}

export default async function ValidationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("VALIDATEUR", "ADMIN");
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
      lineKind: true,
      lineNumber: true,
      productionDate: true,
      expiryDate: true,
      quantity: true,
      quantityUnit: true,
      surfaceLabel: true,
      surfaceAreaCm2: true,
      // « État de la surface » / « Méthode de prélèvement » (RETOUR-LABO-06-10.md §5).
      surfaceState: true,
      personName: true,
      personRole: true,
      handsState: true,
      airMethod: true,
      remarks: true,
      unitCount: true,
      clientId: true,
      productTypeId: true,
      productType: { select: { name: true, regulationId: true } },
      regulationId: true,
      regulation: { select: { title: true } },
      product: { select: { regulationId: true } },
      nature: { select: { family: true } },
      parameters: { select: { parameterId: true } },
      conformity: true,
      conformityNote: true,
      rejectionReason: true,
      validatedById: true,
      validatedAt: true,
      approvedById: true,
      client: { select: { name: true } },
      serie: { select: { serialNumber: true } },
      technician: { select: { name: true } },
      validatedBy: { select: { name: true } },
      report: { select: { number: true, version: true, sentTo: true, amendmentPending: true, amendmentNote: true } },
      results: {
        select: {
          id: true,
          value: true,
          numericValue: true,
          unit: true,
          conform: true,
          workStatus: true,
          note: true,
          threshold: true,
          interpretation: true,
          informalInterpretation: true,
          normVersion: { select: { label: true } },
          units: { select: { unitIndex: true, rawValue: true }, orderBy: { unitIndex: "asc" } },
          parameter: {
            select: { name: true, threshold: true, limitValue: true, alertOnExceed: true },
          },
        },
      },
    },
  });

  if (!sample) notFound();

  const state = approvalState(sample);
  // AMENDEMENT.md: the number printed on the version in force (« -A1 »…),
  // and the amendment in progress, if any.
  const report = sample.report;
  const printedNumber = report ? amendedNumber(report.number, report.version) : null;
  const amendment =
    report?.amendmentPending
      ? {
          currentNumber: amendedNumber(report.number, report.version),
          nextNumber: amendedNumber(report.number, report.version + 1),
          note: report.amendmentNote,
        }
      : null;

  // « Réglementation en vigueur » (slice I): proposed from what is known,
  // confirmed or changed by the validator.
  const [regulations, settings] = await Promise.all([
    prisma.regulation.findMany({ where: { active: true }, select: { id: true, title: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    getLabSettings(),
  ]);
  const proposedRegulationId = proposeRegulation(
    {
      sample: sample.regulationId,
      clientProduct: sample.product?.regulationId ?? null,
      productType: sample.productType?.regulationId ?? null,
      family: sample.nature.family,
      settings,
    },
    new Set(regulations.map((r) => r.id))
  );
  const nonConformes = sample.results.filter((r) => r.conform === false).length;
  // Only a sensitive germ over its limit raises a contamination alert.
  const alertables = sample.results.filter(
    (r) => (r.conform === false || r.informalInterpretation === "NON_SATISFAISANT") && r.parameter.alertOnExceed
  ).length;
  const verdict = sampleVerdict(sample.results);
  // « Planche verte — surface nettoyée »; « — » when nothing names it.
  const designation = lineDesignation(sample);
  // Too few units for a plan: the report will carry no official verdict.
  const indicativeOnly = verdict === null && sample.results.some((r) => r.interpretation === null && r.informalInterpretation);

  return (
    <div>
      <Link
        href="/validation"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        File de validation
      </Link>

      <PageHeader
        badge="Validation des résultats"
        title={labReference(sample)}
        subtitle="Vérifiez chaque résultat face à son seuil avant de valider ou de renvoyer l'échantillon."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Résultats
              </h2>
              <div className="flex items-center gap-2">
                {verdict && <VerdictBadge verdict={verdict} size="md" />}
                {indicativeOnly && (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                    Sans interprétation officielle
                  </span>
                )}
                <TypeBadge type={sample.type} />
                <StatusBadge status={sample.status} />
              </div>
            </div>
            {sample.productType && (
              <p className="mt-2 text-xs text-slate-500">
                Type de produit : <b className="font-medium text-slate-700">{sample.productType.name}</b> · {sample.unitCount} unité{sample.unitCount > 1 ? "s" : ""} prélevée{sample.unitCount > 1 ? "s" : ""}
              </p>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Paramètre</th>
                    <th className="pb-2 pr-3 font-medium">Résultat</th>
                    <th className="pb-2 pr-3 font-medium">Critère</th>
                    <th className="pb-2 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.results.map((result) => (
                    <tr key={result.id} className="border-b border-slate-100 align-top">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-slate-800">
                          {result.parameter.name}
                        </span>
                        {result.parameter.alertOnExceed && (
                          <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                            sensible
                          </span>
                        )}
                        {result.note && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {result.note}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-900">
                        {result.value ?? "—"}
                        {result.unit && (
                          <span className="text-xs text-slate-500"> {result.unit}</span>
                        )}
                        {result.units.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {result.units.map((u) => (
                              <span key={u.unitIndex} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                                <b className="mr-1 text-slate-500">{repetitionLabel(u.unitIndex)}</b>
                                {u.rawValue}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {result.threshold ?? result.parameter.threshold ?? "—"}
                        {result.normVersion && (
                          <span className="mt-0.5 block text-xs text-slate-400">{result.normVersion.label}</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {result.interpretation ? (
                          <VerdictBadge verdict={result.interpretation} />
                        ) : result.informalInterpretation ? (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Indicatif</span>
                            <VerdictBadge verdict={result.informalInterpretation} />
                          </span>
                        ) : result.workStatus === "ANOMALIE" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Anomalie
                          </span>
                        ) : result.conform === true ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Conforme
                          </span>
                        ) : result.conform === false ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            Non conforme
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Échantillon
              </h2>
              <SampleVerbs
                role={session.role}
                sample={{
                  id: sample.id,
                  code: sample.code,
                  controlCode: sample.controlCode,
                  status: sample.status,
                  hasReport: report !== null,
                  type: sample.type,
                  lineKind: sample.lineKind,
                  produit: sample.produit,
                  lieu: sample.lieu,
                  numeroLot: sample.numeroLot,
                  productionDate: sample.productionDate?.toISOString() ?? null,
                  expiryDate: sample.expiryDate?.toISOString() ?? null,
                  quantity: sample.quantity === null ? null : Number(sample.quantity),
                  quantityUnit: sample.quantityUnit,
                  surfaceLabel: sample.surfaceLabel,
                  surfaceAreaCm2: sample.surfaceAreaCm2,
                  surfaceState: sample.surfaceState,
                  airMethod: sample.airMethod,
                  personName: sample.personName,
                  personRole: sample.personRole,
                  handsState: sample.handsState,
                  remarks: sample.remarks,
                  unitCount: sample.unitCount,
                  parameterIds: sample.parameters.map((p) => p.parameterId),
                  productTypeId: sample.productTypeId,
                  clientId: sample.clientId,
                }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
              <Field icon={Hash} label="N° de lot">
                {sample.numeroLot ?? <span className="text-slate-400">Non renseigné</span>}
              </Field>
              <Field icon={User} label="Technicien">
                {sample.technician?.name ?? "—"}
              </Field>
              <Field icon={Package} label="Lieu">
                {sample.lieu}
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

            {sample.rejectionReason && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <b>Renvoi précédent :</b> {sample.rejectionReason}
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <ValidationPanel
            sampleId={sample.id}
            role={session.role}
            state={state}
            validatedBy={sample.validatedBy?.name ?? null}
            validatedAt={sample.validatedAt ? formatDateTime(sample.validatedAt) : null}
            nonConformes={nonConformes}
            alertables={alertables}
            alertsAtTechnical={settings.alertAfterTechnicalValidation}
            reportNumber={printedNumber}
            sentTo={sample.report?.sentTo ?? null}
            emailLive={!!process.env.RESEND_API_KEY}
            validatedById={sample.validatedById}
            userId={session.id}
            regulations={regulations}
            proposedRegulationId={proposedRegulationId}
            regulationRequired={needsRegulation(sample)}
            chosenRegulation={sample.regulation?.title ?? null}
            amendment={amendment}
          />
          {report && printedNumber && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Rapport {printedNumber}
              </h2>
              <ReportActions
                sampleId={sample.id}
                role={session.role}
                status={sample.status}
                number={printedNumber}
                amendmentPending={report.amendmentPending}
              />
            </Card>
          )}
        </div>
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
