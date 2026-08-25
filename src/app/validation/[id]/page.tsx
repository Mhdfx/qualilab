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
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { approvalState } from "@/lib/sample-status";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { ValidationPanel } from "@/components/validation/ValidationPanel";

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
      serialNumber: true,
      controlCode: true,
      type: true,
      status: true,
      lieu: true,
      produit: true,
      numeroLot: true,
      conformity: true,
      conformityNote: true,
      rejectionReason: true,
      validatedById: true,
      validatedAt: true,
      approvedById: true,
      client: { select: { name: true } },
      technician: { select: { name: true } },
      validatedBy: { select: { name: true } },
      report: { select: { number: true, sentTo: true } },
      results: {
        select: {
          id: true,
          value: true,
          numericValue: true,
          unit: true,
          conform: true,
          workStatus: true,
          note: true,
          parameter: {
            select: { name: true, threshold: true, limitValue: true, alertOnExceed: true },
          },
        },
      },
    },
  });

  if (!sample) notFound();

  const state = approvalState(sample);
  const nonConformes = sample.results.filter((r) => r.conform === false).length;

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
        badge="Contrôle qualité"
        title={sample.serialNumber ?? sample.code}
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
                <TypeBadge type={sample.type} />
                <StatusBadge status={sample.status} />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Paramètre</th>
                    <th className="pb-2 pr-3 font-medium">Résultat</th>
                    <th className="pb-2 pr-3 font-medium">Seuil</th>
                    <th className="pb-2 font-medium">Conformité</th>
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
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {result.parameter.threshold ?? "—"}
                      </td>
                      <td className="py-2.5">
                        {result.workStatus === "ANOMALIE" ? (
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Échantillon
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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

        <ValidationPanel
          sampleId={sample.id}
          role={session.role}
          state={state}
          validatedBy={sample.validatedBy?.name ?? null}
          validatedAt={sample.validatedAt ? formatDateTime(sample.validatedAt) : null}
          nonConformes={nonConformes}
          reportNumber={sample.report?.number ?? null}
          sentTo={sample.report?.sentTo ?? null}
          emailLive={!!process.env.RESEND_API_KEY}
        />
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
