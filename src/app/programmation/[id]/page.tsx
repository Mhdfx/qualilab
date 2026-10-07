import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  Hash,
  Layers,
  MapPin,
  Package,
  Ruler,
  Thermometer,
  User,
  Wind,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import {
  AIR_METHOD_LABELS,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  QUANTITY_UNIT_LABELS,
  SERIE_KIND_LABELS,
  SURFACE_STATE_LABELS,
  formatDateTime,
  formatDecimal,
} from "@/lib/labels";
import { loadProgrammeReferential, loadProgrammeSample, serializeProgramme } from "@/lib/programme-referential";
import { labReference } from "@/lib/sample-select";
import { sampleRef } from "@/lib/reception-input";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { verbsFor } from "@/lib/sample-verbs";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { ProgrammeSheet } from "@/components/programmation/ProgrammeSheet";
import type { ProgrammeReferentialData, ProgrammeResponse } from "@/components/programmation/programme-sheet-types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = await prisma.sample.findUnique({ where: { id }, select: { code: true, controlCode: true } });
  return { title: sample ? `Programme ${labReference(sample)}` : "Programme d'analyse" };
}

/**
 * The identification fields the programme select leaves out: what names a
 * surface, a hands or an air sample — the surface's state and the air's
 * method included (RETOUR-LABO-06-10.md §5, V2 and V4) — and what
 * « Corriger la fiche » edits.
 */
const IDENTITY_SELECT = {
  productionDate: true,
  expiryDate: true,
  surfaceLabel: true,
  surfaceAreaCm2: true,
  surfaceState: true,
  personName: true,
  personRole: true,
  handsState: true,
  airMethod: true,
  remarks: true,
} as const;

/** The programme sheet of one sample (PROGRAMME.md §4). */
export default async function ProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("PROGRAMMATEUR", "ADMIN");
  const { id } = await params;

  const row = await loadProgrammeSample(id);
  if (!row) notFound();

  const [referential, settings, identity] = await Promise.all([
    loadProgrammeReferential(row),
    getLabSettings(),
    prisma.sample.findUnique({ where: { id }, select: IDENTITY_SELECT }),
  ]);
  if (!identity) notFound();

  // Dates become strings and decimals numbers: the client component reads
  // exactly what the API would have answered.
  const data = JSON.parse(JSON.stringify(serializeProgramme(row))) as ProgrammeResponse;
  const referentialData = JSON.parse(JSON.stringify(referential)) as ProgrammeReferentialData;
  const { sample, programme } = data;
  const verbs = verbsFor(sample, session.role);
  const hasVerbs = verbs.correct || verbs.cancel || verbs.reactivate;

  const quantity =
    sample.quantity !== null && sample.quantityUnit
      ? `${formatDecimal(sample.quantity, 2)} ${QUANTITY_UNIT_LABELS[sample.quantityUnit]}`
      : null;

  return (
    <div>
      <Link
        href="/programmation"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        File de programmation
      </Link>

      <PageHeader
        badge="Programme d'analyse"
        title={labReference(sample)}
        subtitle={
          sample.status === "RECU"
            ? "Décidez de tout ce qui sera fait sur cet échantillon avant la paillasse, puis confirmez le programme."
            : sample.status === "PROGRAMME"
              ? "Programme confirmé — modifiable tant que la paillasse n'a pas commencé."
              : "Programme de l'échantillon, en consultation."
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Échantillon</h2>
              <div className="flex items-center gap-2">
                <TypeBadge type={sample.type} />
                <StatusBadge status={sample.status} />
              </div>
            </div>

            <dl className="mt-4 space-y-3.5">
              <Field icon={Hash} label="N° de contrôle">
                <span className="font-mono">{sample.controlCode ?? "—"}</span>
              </Field>
              <Field icon={Hash} label="Série">
                <span className="font-mono">{sample.serie.serialNumber}</span>
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  échantillon {sampleRef(sample.lineNumber, sample.code)} · {SERIE_KIND_LABELS[sample.serie.kind]}
                </span>
              </Field>
              <Field icon={Building2} label="Client">{sample.client.name}</Field>
              <Field icon={Package} label="Désignation">
                {lineDesignation({
                  lineKind: sample.lineKind,
                  produit: sample.produit,
                  surfaceLabel: identity.surfaceLabel,
                  personName: identity.personName,
                  surfaceState: identity.surfaceState,
                  airMethod: identity.airMethod,
                })}
                {sample.numeroLot && <span className="ml-1.5 text-xs font-normal text-slate-500">lot {sample.numeroLot}</span>}
              </Field>
              {sample.lineKind === "SURFACE" && (
                <Field icon={Ruler} label="État et surface prélevée">
                  {identity.surfaceState ? (
                    SURFACE_STATE_LABELS[identity.surfaceState]
                  ) : (
                    <span className="text-slate-400">État non renseigné</span>
                  )}
                  {identity.surfaceAreaCm2 !== null && (
                    <span className="ml-1.5 text-xs font-normal text-slate-500">{identity.surfaceAreaCm2} cm²</span>
                  )}
                </Field>
              )}
              {sample.lineKind === "AIR" && (
                <Field icon={Wind} label="Méthode de prélèvement">
                  {identity.airMethod ? (
                    AIR_METHOD_LABELS[identity.airMethod]
                  ) : (
                    <span className="text-slate-400">Non renseignée</span>
                  )}
                </Field>
              )}
              <Field icon={MapPin} label="Lieu">{sample.lieu}</Field>
              <Field icon={Layers} label="Nature">
                {sample.nature.label}
                <span className="ml-1.5 text-xs font-normal text-slate-500">{LINE_KIND_LABELS[sample.lineKind]}</span>
              </Field>
              <Field icon={Calendar} label="Réception">
                {sample.receivedAt ? formatDateTime(sample.receivedAt) : <span className="text-slate-400">Non réceptionnée</span>}
              </Field>
              <Field icon={Thermometer} label="À l'arrivée">
                {sample.receptionTemperature !== null ? `${formatDecimal(sample.receptionTemperature)} °C` : "T° non relevée"}
                {quantity ? ` · ${quantity}` : ""}
                {sample.conformity === true && <span className="ml-1.5 text-xs font-semibold text-emerald-700">Conforme</span>}
                {sample.conformity === false && <span className="ml-1.5 text-xs font-semibold text-amber-700">Non conforme</span>}
              </Field>
              <Field icon={Layers} label="Unités prélevées">
                {sample.unitCount} unité{sample.unitCount > 1 ? "s" : ""}
              </Field>
              <Field icon={User} label="Technicien">
                {sample.technician?.name ?? <span className="text-slate-400">À attribuer</span>}
              </Field>
            </dl>

            {sample.conformity === false && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <b>Non conforme à réception</b>
                  {sample.conformityReason ? ` — ${NON_CONFORMITY_REASON_LABELS[sample.conformityReason]}` : ""}.
                  {sample.conformityNote && ` ${sample.conformityNote}`}
                </span>
              </p>
            )}
          </Card>
        </div>

        <ProgrammeSheet
          sample={sample}
          programme={programme}
          referential={referentialData}
          thresholds={settings}
          role={session.role}
          verbSample={
            hasVerbs
              ? {
                  id: sample.id,
                  code: sample.code,
                  controlCode: sample.controlCode,
                  status: sample.status,
                  type: sample.type,
                  lineKind: sample.lineKind,
                  produit: sample.produit,
                  lieu: sample.lieu,
                  numeroLot: sample.numeroLot,
                  productionDate: identity.productionDate?.toISOString() ?? null,
                  expiryDate: identity.expiryDate?.toISOString() ?? null,
                  quantity: sample.quantity,
                  quantityUnit: sample.quantityUnit,
                  surfaceLabel: identity.surfaceLabel,
                  surfaceAreaCm2: identity.surfaceAreaCm2,
                  surfaceState: identity.surfaceState,
                  airMethod: identity.airMethod,
                  personName: identity.personName,
                  personRole: identity.personRole,
                  handsState: identity.handsState,
                  remarks: identity.remarks,
                  unitCount: sample.unitCount,
                  parameterIds: sample.parameters.map((p) => p.parameterId),
                  productTypeId: sample.productTypeId,
                  clientId: sample.clientId,
                }
              : null
          }
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
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-slate-800">{children}</dd>
      </div>
    </div>
  );
}
