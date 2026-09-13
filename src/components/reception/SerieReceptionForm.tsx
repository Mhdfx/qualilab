"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Printer,
  FileText,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import type {
  Family,
  HandsState,
  LineKind,
  NonConformityReason,
  QuantityUnit,
  SampleStatus,
  SamplerKind,
  SerieKind,
} from "@/generated/prisma/enums";
import {
  HANDS_STATE_LABELS,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  QUANTITY_UNIT_LABELS,
  SAMPLER_KIND_LABELS,
  SERIE_KIND_LABELS,
  formatDate,
  formatDateTime,
  formatDecimal,
} from "@/lib/labels";
import { evaluateReception, proposedConformity, type ReceptionThresholds } from "@/lib/reception-rules";
import { unitLetter } from "@/lib/series";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { fromLocalInput, toLocalInput } from "@/components/preleveur/visit-types";
import type { TechnicianOption } from "./ReceptionForm";
import { Checklist, ConformityChip } from "./reception-widgets";

/**
 * Reception of a série in one screen — WORKFLOW.md §3.3.
 *
 * The header carries what the cooler tells (arrival, temperature); every
 * line shows what the préleveur wrote, what the réceptionniste measures, the
 * acceptance checklist computed live from the lab's rules, the conformity
 * with its coded motif and the technician. One button numbers everything.
 */

export type ReceptionLineData = {
  id: string;
  code: string;
  lineNumber: number;
  lineKind: LineKind;
  status: SampleStatus;
  lieu: string;
  produit: string | null;
  numeroLot: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  remarks: string | null;
  unitCount: number;
  controlCode: string | null;
  receptionTemperature: number | null;
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  nature: { id: string; code: string; label: string; family: Family };
  parameters: { parameter: { id: string; name: string; unit: string | null } }[];
  technician: { id: string; name: string } | null;
};

export type ReceptionSerieData = {
  id: string;
  serialNumber: string;
  kind: SerieKind;
  client: { id: string; name: string };
  site: { id: string; name: string } | null;
  interlocutor: string | null;
  samplerKind: SamplerKind;
  samplerUser: { id: string; name: string } | null;
  samplerName: string | null;
  clientReference: string | null;
  startedAt: string;
  endedAt: string | null;
  arrivedAt: string | null;
  coolerTemperature: number | null;
  notes: string | null;
  receivedAt: string | null;
  samples: ReceptionLineData[];
};

type ReceivedLine = {
  id: string;
  code: string;
  lineNumber: number;
  controlCode: string | null;
  unitCount: number;
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
  analysisBlocked: boolean;
  produit: string | null;
  surfaceLabel: string | null;
  personName: string | null;
  nature: { label: string };
  technician: { id: string; name: string } | null;
};

type LineState = {
  sampleId: string;
  temperature: string;
  /** Once the réceptionniste typed a temperature, the cooler no longer overrides it. */
  temperatureTouched: boolean;
  quantity: string;
  quantityUnit: QuantityUnit;
  /** The réceptionniste's own choice; null = follow the rules' proposal. */
  conformityChoice: boolean | null;
  reason: NonConformityReason | "";
  note: string;
  technicianId: string;
};

const REASONS = Object.keys(NON_CONFORMITY_REASON_LABELS) as NonConformityReason[];
const UNITS = Object.keys(QUANTITY_UNIT_LABELS) as QuantityUnit[];

function designationOf(line: {
  lineKind: LineKind;
  produit: string | null;
  surfaceLabel: string | null;
  surfaceAreaCm2?: number | null;
  personName: string | null;
  personRole?: string | null;
  handsState?: HandsState | null;
}) {
  switch (line.lineKind) {
    case "SURFACE":
      return `${line.surfaceLabel ?? "Surface"}${line.surfaceAreaCm2 ? ` (${line.surfaceAreaCm2} cm²)` : ""}`;
    case "MAINS":
      return `${line.personName ?? "Mains"}${line.personRole ? ` — ${line.personRole}` : ""}${
        line.handsState ? ` · ${HANDS_STATE_LABELS[line.handsState].toLowerCase()}` : ""
      }`;
    default:
      return line.produit ?? "—";
  }
}

function samplerOf(serie: ReceptionSerieData) {
  if (serie.samplerKind === "QUALILAB") return serie.samplerUser?.name ?? "Qualilab";
  return serie.samplerName ?? SAMPLER_KIND_LABELS[serie.samplerKind];
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function unitsLabel(unitCount: number) {
  if (unitCount <= 1) return "1 unité";
  return `${unitCount} unités (${unitLetter(1)}–${unitLetter(unitCount)})`;
}

export function SerieReceptionForm({
  serie,
  technicians,
  thresholds,
  blockNonConform,
}: {
  serie: ReceptionSerieData;
  technicians: TechnicianOption[];
  thresholds: ReceptionThresholds;
  blockNonConform: boolean;
}) {
  const router = useRouter();
  const pending = serie.samples.filter((s) => s.status === "PRELEVE");
  const alreadyReceived = serie.samples.filter((s) => s.status !== "PRELEVE");
  const defaultTechnician = technicians[0]?.id ?? "";

  const [arrivedAt, setArrivedAt] = useState(
    serie.arrivedAt ? toLocalInput(new Date(serie.arrivedAt)) : ""
  );
  const [cooler, setCooler] = useState(
    serie.coolerTemperature === null ? "" : String(serie.coolerTemperature).replace(".", ",")
  );
  const [lines, setLines] = useState<LineState[]>(() =>
    pending.map((s) => ({
      sampleId: s.id,
      temperature:
        serie.coolerTemperature === null ? "" : String(serie.coolerTemperature).replace(".", ","),
      temperatureTouched: false,
      quantity: s.quantity === null ? "" : String(s.quantity).replace(".", ","),
      // A line never weighed on site is weighed here: grams for food, litres for water.
      quantityUnit:
        s.quantity !== null && s.quantityUnit ? s.quantityUnit : s.lineKind === "EAU" ? "L" : "G",
      conformityChoice: null,
      reason: "",
      note: "",
      technicianId: defaultTechnician,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; lineNumber: number | null } | null>(null);
  const [result, setResult] = useState<ReceivedLine[] | null>(null);

  const byId = useMemo(() => new Map(serie.samples.map((s) => [s.id, s])), [serie.samples]);

  // The cooler's temperature pre-fills every line the réceptionniste has not
  // measured separately — one reading, eight lines.
  function changeCooler(value: string) {
    setCooler(value);
    setLines((current) =>
      current.map((line) => (line.temperatureTouched ? line : { ...line, temperature: value }))
    );
  }

  function updateLine(sampleId: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.sampleId === sampleId ? { ...line, ...patch } : line)));
    setError(null);
  }

  function applyTechnicianToAll(technicianId: string) {
    setLines((current) => current.map((line) => ({ ...line, technicianId })));
  }

  /** The live evaluation of one line: checks, proposal, effective choice. */
  function evaluate(line: LineState) {
    const sample = byId.get(line.sampleId)!;
    const checks = evaluateReception(
      {
        lineKind: sample.lineKind,
        family: sample.nature.family,
        parameterNames: sample.parameters.map((p) => p.parameter.name),
        quantity: numberOrNull(line.quantity),
        quantityUnit: numberOrNull(line.quantity) === null ? null : line.quantityUnit,
        receptionTemperature: numberOrNull(line.temperature),
        unitCount: sample.unitCount,
      },
      thresholds
    );
    const proposal = proposedConformity(checks);
    const conformity = proposal.forced ? false : (line.conformityChoice ?? proposal.conformity);
    const reason: NonConformityReason | "" = conformity ? "" : line.reason || proposal.reason || "";
    return { sample, checks, proposal, conformity, reason };
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        arrivedAt: fromLocalInput(arrivedAt),
        coolerTemperature: cooler,
        lines: lines.map((line) => {
          const { conformity, reason } = evaluate(line);
          return {
            sampleId: line.sampleId,
            receptionTemperature: line.temperature,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            conformity,
            conformityReason: conformity ? undefined : reason,
            conformityNote: line.note,
            technicianId: blockNonConform && !conformity ? undefined : line.technicianId,
          };
        }),
      };
      const response = await fetch(`/api/series/${serie.id}/reception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError({ message: data.error ?? "Impossible de réceptionner la série.", lineNumber: data.lineNumber ?? null });
        return;
      }
      setResult(data.lines as ReceivedLine[]);
    } catch {
      setError({ message: "Une erreur réseau est survenue. Réessayez.", lineNumber: null });
    } finally {
      setBusy(false);
    }
  }

  if (result || pending.length === 0) {
    const received: ReceivedLine[] =
      result ??
      alreadyReceived.map((s) => ({
        id: s.id,
        code: s.code,
        lineNumber: s.lineNumber,
        controlCode: s.controlCode,
        unitCount: s.unitCount,
        conformity: s.conformity,
        conformityReason: s.conformityReason,
        analysisBlocked: false,
        produit: s.produit,
        surfaceLabel: s.surfaceLabel,
        personName: s.personName,
        nature: { label: s.nature.label },
        technician: s.technician,
      }));
    return (
      <ReceivedSummary
        serie={serie}
        lines={received}
        justReceived={result !== null}
        onBack={() => {
          router.refresh();
          router.push("/reception");
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        badge={SERIE_KIND_LABELS[serie.kind]}
        title={`Série ${serie.serialNumber}`}
        subtitle={`${serie.client.name}${serie.site ? ` · ${serie.site.name}` : ""} — ${pending.length} ligne${pending.length > 1 ? "s" : ""} à réceptionner`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {alreadyReceived.length > 0 && (
            <Card className="p-4 text-sm text-slate-600">
              {alreadyReceived.length} ligne{alreadyReceived.length > 1 ? "s" : ""} de cette série{" "}
              {alreadyReceived.length > 1 ? "sont" : "est"} déjà réceptionnée
              {alreadyReceived.length > 1 ? "s" : ""} (
              {alreadyReceived.map((s) => s.controlCode ?? s.code).join(", ")}).
            </Card>
          )}

          {lines.map((line) => {
            const { sample, checks, proposal, conformity, reason } = evaluate(line);
            const highlighted = error?.lineNumber === sample.lineNumber;
            return (
              <Card
                key={line.sampleId}
                className={`p-5 ${highlighted ? "ring-2 ring-rose-300" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      Ligne {sample.lineNumber} · {sample.nature.label}
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">{designationOf(sample)}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {LINE_KIND_LABELS[sample.lineKind]} · {sample.lieu}
                      {sample.numeroLot ? ` · lot ${sample.numeroLot}` : ""}
                      {sample.productionDate ? ` · DLC P ${formatDate(sample.productionDate)}` : ""}
                      {sample.expiryDate ? ` · DLC E ${formatDate(sample.expiryDate)}` : ""}
                      {sample.productTemperature !== null ? ` · T°p ${formatDecimal(sample.productTemperature)} °C` : ""}
                      {sample.ambientTemperature !== null ? ` · T°a ${formatDecimal(sample.ambientTemperature)} °C` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {unitsLabel(sample.unitCount)} · {sample.parameters.map((p) => p.parameter.name).join(", ")}
                    </p>
                    {sample.remarks && <p className="mt-1 text-xs italic text-slate-500">{sample.remarks}</p>}
                  </div>
                  <StatusBadge status={sample.status} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`t-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                      T° à l&apos;arrivée (°C)
                    </label>
                    <input
                      id={`t-${line.sampleId}`}
                      type="text"
                      inputMode="decimal"
                      value={line.temperature}
                      onChange={(e) => updateLine(line.sampleId, { temperature: e.target.value, temperatureTouched: true })}
                      placeholder="Ex. : 4"
                      className="input-field mt-1.5 px-3"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`q-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                      Quantité reçue
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id={`q-${line.sampleId}`}
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.sampleId, { quantity: e.target.value })}
                        placeholder="Ex. : 250"
                        className="input-field px-3"
                      />
                      <select
                        aria-label="Unité"
                        value={line.quantityUnit}
                        onChange={(e) => updateLine(line.sampleId, { quantityUnit: e.target.value as QuantityUnit })}
                        className="input-field w-32 px-3"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {QUANTITY_UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <Checklist checks={checks} />

                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-slate-700">Conformité</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <ConformityChip
                      active={conformity}
                      disabled={proposal.forced}
                      tone="ok"
                      label="Conforme"
                      onClick={() => updateLine(line.sampleId, { conformityChoice: true })}
                    />
                    <ConformityChip
                      active={!conformity}
                      disabled={false}
                      tone="warn"
                      label="Non conforme"
                      onClick={() => updateLine(line.sampleId, { conformityChoice: false })}
                    />
                  </div>
                  {proposal.forced && (
                    <p className="mt-1.5 text-xs text-rose-700">
                      Une règle bloquante s&apos;applique : corrigez la mesure ou réceptionnez la ligne comme non conforme.
                    </p>
                  )}
                </fieldset>

                {!conformity && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`r-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                        Motif <span className="text-rose-600">*</span>
                      </label>
                      <select
                        id={`r-${line.sampleId}`}
                        value={reason}
                        onChange={(e) => updateLine(line.sampleId, { reason: e.target.value as NonConformityReason | "" })}
                        className="input-field mt-1.5 px-3"
                      >
                        <option value="">Choisir un motif</option>
                        {REASONS.map((r) => (
                          <option key={r} value={r}>
                            {NON_CONFORMITY_REASON_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`n-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                        Précision {reason === "AUTRE" && <span className="text-rose-600">*</span>}
                      </label>
                      <input
                        id={`n-${line.sampleId}`}
                        type="text"
                        value={line.note}
                        onChange={(e) => updateLine(line.sampleId, { note: e.target.value })}
                        placeholder="Facultatif"
                        className="input-field mt-1.5 px-3"
                      />
                    </div>
                  </div>
                )}

                {blockNonConform && !conformity ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Ligne bloquée à la réception : numérotée, mais analysée seulement après libération par un administrateur.
                  </p>
                ) : (
                  <div className="mt-3">
                    <label htmlFor={`tech-${line.sampleId}`} className="block text-sm font-medium text-slate-700">
                      Technicien <span className="text-rose-600">*</span>
                    </label>
                    <select
                      id={`tech-${line.sampleId}`}
                      value={line.technicianId}
                      onChange={(e) => updateLine(line.sampleId, { technicianId: e.target.value })}
                      className="input-field mt-1.5 px-3"
                    >
                      <option value="">Sélectionner un technicien</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.load} en cours
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Thermometer className="h-4 w-4" aria-hidden="true" />
              La glacière
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-600">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Prélevé par</dt>
                <dd className="text-right font-medium text-slate-800">{samplerOf(serie)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Début</dt>
                <dd className="text-right font-medium text-slate-800">{formatDateTime(serie.startedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Fin</dt>
                <dd className="text-right font-medium text-slate-800">{serie.endedAt ? formatDateTime(serie.endedAt) : "—"}</dd>
              </div>
              {serie.interlocutor && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Interlocuteur</dt>
                  <dd className="text-right font-medium text-slate-800">{serie.interlocutor}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4">
              <label htmlFor="arrivedAt" className="block text-sm font-medium text-slate-700">
                Arrivée au laboratoire
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="arrivedAt"
                  type="datetime-local"
                  value={arrivedAt}
                  onChange={(e) => setArrivedAt(e.target.value)}
                  className="input-field px-3"
                />
                <button
                  type="button"
                  onClick={() => setArrivedAt(toLocalInput(new Date()))}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Maintenant
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="cooler" className="block text-sm font-medium text-slate-700">
                T° de la glacière (°C)
              </label>
              <input
                id="cooler"
                type="text"
                inputMode="decimal"
                value={cooler}
                onChange={(e) => changeCooler(e.target.value)}
                placeholder="Ex. : 3"
                className="input-field mt-1.5 px-3"
              />
              <p className="mt-1 text-xs text-slate-500">Pré-remplit la température de chaque ligne.</p>
            </div>
            <Link
              href={`/api/series/${serie.id}/document`}
              target="_blank"
              rel="noopener"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Voir le protocole de prélèvement (PDF)
            </Link>
            <div className="mt-3">
              <label htmlFor="allTech" className="block text-sm font-medium text-slate-700">
                Technicien pour toutes les lignes
              </label>
              <select
                id="allTech"
                defaultValue={defaultTechnician}
                onChange={(e) => applyTechnicianToAll(e.target.value)}
                className="input-field mt-1.5 px-3"
              >
                <option value="">Choisir…</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.load} en cours
                  </option>
                ))}
              </select>
              {technicians.length === 0 && (
                <p className="mt-1.5 text-sm text-amber-700">
                  Aucun technicien disponible. Créez un compte technicien avant de réceptionner.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <p>
                La validation attribue un <b>N° de contrôle</b>{" "}à chaque ligne, en une seule opération. Les étiquettes s&apos;impriment ensuite.
              </p>
            </div>
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error.message}
              </p>
            )}
            <PrimaryButton
              type="button"
              onClick={submit}
              disabled={busy || technicians.length === 0}
              className="mt-4 w-full min-h-[48px]"
            >
              {busy ? "Réception en cours…" : `Valider la réception (${pending.length} ligne${pending.length > 1 ? "s" : ""})`}
            </PrimaryButton>
            <SecondaryButton
              type="button"
              onClick={() => router.push("/reception")}
              disabled={busy}
              className="mt-2 w-full"
            >
              Annuler
            </SecondaryButton>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * After the reception the réceptionniste labels the tubes: every number is
 * shown large, with its unit letters, and the labels print from here.
 */
function ReceivedSummary({
  serie,
  lines,
  justReceived,
  onBack,
}: {
  serie: ReceptionSerieData;
  lines: ReceivedLine[];
  justReceived: boolean;
  onBack: () => void;
}) {
  const units = lines.reduce((n, l) => n + Math.max(1, l.unitCount), 0);
  return (
    <div>
      <PageHeader
        badge={SERIE_KIND_LABELS[serie.kind]}
        title={`Série ${serie.serialNumber}`}
        subtitle={`${serie.client.name}${serie.site ? ` · ${serie.site.name}` : ""}`}
      />
      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">
              {justReceived ? "Série réceptionnée" : "Série déjà réceptionnée"}
            </h2>
            <p className="text-sm text-slate-500">
              {lines.length} ligne{lines.length > 1 ? "s" : ""} numérotée{lines.length > 1 ? "s" : ""} · {units} étiquette{units > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 font-medium">Ligne</th>
                <th className="pb-2 pr-3 font-medium">N° de contrôle</th>
                <th className="pb-2 pr-3 font-medium">Unités</th>
                <th className="pb-2 pr-3 font-medium">Conformité</th>
                <th className="pb-2 font-medium">Technicien</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100 align-top">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-slate-800">{line.lineNumber} · {line.nature.label}</span>
                    <span className="block text-xs text-slate-500">{designationOf({ lineKind: "AUTRE", produit: line.produit ?? line.surfaceLabel ?? line.personName, surfaceLabel: null, personName: null })}</span>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-base font-bold text-slate-900">{line.controlCode ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{unitsLabel(line.unitCount)}</td>
                  <td className="py-2.5 pr-3">
                    {line.conformity === false ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {line.conformityReason ? NON_CONFORMITY_REASON_LABELS[line.conformityReason] : "Non conforme"}
                        {line.analysisBlocked ? " · bloquée" : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Conforme
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-700">{line.technician?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/api/series/${serie.id}/labels`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimer les étiquettes
          </Link>
          <Link
            href={`/api/series/${serie.id}/document`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {serie.kind === "DEPOT" ? "Bon de réception (PDF)" : "Protocole de prélèvement (PDF)"}
          </Link>
          <SecondaryButton type="button" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à la file de réception
          </SecondaryButton>
        </div>
      </Card>
    </div>
  );
}
