"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import {
  applyCalcFactor,
  formatLabValue,
  parseLabValue,
  suggestConformity,
} from "@/lib/result-value";
import type { ResultWorkStatus } from "@/generated/prisma/enums";

export type ParameterLine = {
  parameterId: string;
  name: string;
  unit: string | null;
  threshold: string | null;
  limitValue: number | null;
  /** Multiplier applied to the raw reading (dilution) — 1 means none. */
  calcFactor: number;
  value: string;
  note: string;
  workStatus: ResultWorkStatus;
  /** Only used when the value cannot be read as a number. */
  manualConform: boolean | null;
};

type ResultEntryFormProps = {
  sampleId: string;
  canEdit: boolean;
  initialLines: ParameterLine[];
};

const WORK_STATUS_LABELS: Record<ResultWorkStatus, string> = {
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  ANOMALIE: "Anomalie",
};

export function ResultEntryForm({
  sampleId,
  canEdit,
  initialLines,
}: ResultEntryFormProps) {
  const router = useRouter();
  const [lines, setLines] = useState<ParameterLine[]>(initialLines);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const readings = useMemo(
    () =>
      lines.map((line) => {
        // The suggestion compares the FINAL value — raw reading × factor —
        // exactly as the server will store it.
        const parsed = line.value
          ? applyCalcFactor(parseLabValue(line.value), line.calcFactor)
          : null;
        const auto = parsed
          ? suggestConformity(parsed.numeric, line.limitValue)
          : null;
        return {
          parsed,
          conform: auto ?? line.manualConform,
          needsManual: !!line.value && parsed?.numeric === null,
        };
      }),
    [lines]
  );

  const completed = lines.filter(
    (line, index) => line.value && line.workStatus !== "EN_COURS" &&
      !(readings[index].needsManual && readings[index].conform === null)
  ).length;
  const allComplete = completed === lines.length && lines.length > 0;

  function update(index: number, patch: Partial<ParameterLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
    setError("");
    setNotice("");
  }

  function payload() {
    return lines.map((line, index) => ({
      parameterId: line.parameterId,
      value: line.value,
      note: line.note,
      workStatus: line.workStatus,
      conform: readings[index].conform,
    }));
  }

  async function save(then?: () => Promise<void>) {
    const response = await fetch(`/api/samples/${sampleId}/results`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: payload() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Impossible d'enregistrer les résultats.");
      return false;
    }
    if (then) await then();
    return true;
  }

  async function handleSave() {
    if (busy) return;
    setBusy("save");
    setError("");
    try {
      if (await save()) {
        setNotice("Résultats enregistrés. Vous pouvez reprendre plus tard.");
        router.refresh();
      }
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    if (busy) return;
    setBusy("submit");
    setError("");
    try {
      // Always persist the sheet before submitting it.
      const saved = await save();
      if (!saved) return;

      const response = await fetch(
        `/api/samples/${sampleId}/results/submit`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Impossible de soumettre les résultats.");
        return;
      }
      router.refresh();
      router.push("/technicien");
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Saisie des résultats
          </h2>
          <p className="text-sm text-slate-500">
            {completed} / {lines.length} paramètre
            {lines.length > 1 ? "s" : ""} complété
            {completed > 1 ? "s" : ""}
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {lines.map((line, index) => {
            const reading = readings[index];
            return (
              <li
                key={line.parameterId}
                className="rounded-xl border border-slate-200 p-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-800">{line.name}</p>
                  <p className="text-xs text-slate-500">
                    Seuil : {line.threshold ?? "non défini"}
                    {line.calcFactor !== 1 && (
                      <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                        Facteur ×{line.calcFactor}
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label
                      htmlFor={`value-${line.parameterId}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      Valeur mesurée {line.unit && `(${line.unit})`}
                    </label>
                    <input
                      id={`value-${line.parameterId}`}
                      type="text"
                      inputMode="text"
                      value={line.value}
                      onChange={(e) => update(index, { value: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Ex. : 8,9.10²  ·  < 10  ·  Absence"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    {line.calcFactor !== 1 &&
                      reading.parsed?.numeric != null &&
                      reading.parsed.numeric !== 0 && (
                        <p className="mt-1 text-xs text-violet-700">
                          Valeur finale (lecture ×{line.calcFactor}) :{" "}
                          <b className="font-mono">
                            {formatLabValue(reading.parsed.numeric)}
                          </b>
                          {line.unit ? ` ${line.unit}` : ""} — c&apos;est elle
                          qui figure au rapport.
                        </p>
                      )}
                  </div>

                  <div>
                    <label
                      htmlFor={`status-${line.parameterId}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      Statut
                    </label>
                    <select
                      id={`status-${line.parameterId}`}
                      value={line.workStatus}
                      onChange={(e) =>
                        update(index, {
                          workStatus: e.target.value as ResultWorkStatus,
                        })
                      }
                      disabled={!canEdit}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 sm:w-36"
                    >
                      {(
                        Object.keys(WORK_STATUS_LABELS) as ResultWorkStatus[]
                      ).map((status) => (
                        <option key={status} value={status}>
                          {WORK_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Verdict
                  reading={reading}
                  limitValue={line.limitValue}
                  unit={line.unit}
                  canEdit={canEdit}
                  onManual={(conform) => update(index, { manualConform: conform })}
                />

                {(line.workStatus === "ANOMALIE" || line.note) && (
                  <div className="mt-3">
                    <label
                      htmlFor={`note-${line.parameterId}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      {line.workStatus === "ANOMALIE" ? (
                        <>
                          Description de l&apos;anomalie{" "}
                          <span className="text-rose-600">*</span>
                        </>
                      ) : (
                        "Note"
                      )}
                    </label>
                    <textarea
                      id={`note-${line.parameterId}`}
                      value={line.note}
                      onChange={(e) => update(index, { note: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            {notice}
          </p>
        )}

        {canEdit && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
            <PrimaryButton
              type="button"
              onClick={handleSubmit}
              disabled={!!busy || !allComplete}
              className="sm:flex-1"
              title={
                allComplete
                  ? undefined
                  : "Complétez tous les paramètres avant de soumettre"
              }
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {busy === "submit"
                ? "Soumission…"
                : "Soumettre à la validation"}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={handleSave} disabled={!!busy}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy === "save" ? "Enregistrement…" : "Enregistrer"}
            </SecondaryButton>
          </div>
        )}

        {canEdit && !allComplete && (
          <p className="mt-2 text-center text-xs text-slate-500 sm:text-right">
            Tous les paramètres doivent être renseignés et terminés pour
            soumettre.
          </p>
        )}
      </Card>
    </div>
  );
}

/**
 * Conformity is arithmetic, so it is computed rather than asked for — the
 * technician only decides when the entry cannot be read as a number.
 */
function Verdict({
  reading,
  limitValue,
  unit,
  canEdit,
  onManual,
}: {
  reading: {
    parsed: ReturnType<typeof parseLabValue> | null;
    conform: boolean | null;
    needsManual: boolean;
  };
  limitValue: number | null;
  unit: string | null;
  canEdit: boolean;
  onManual: (conform: boolean) => void;
}) {
  if (!reading.parsed) return null;

  if (reading.needsManual) {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-xs text-slate-600">
          Valeur non numérique — indiquez la conformité :
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onManual(true)}
            disabled={!canEdit}
            aria-pressed={reading.conform === true}
            className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
              reading.conform === true
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
            }`}
          >
            Conforme
          </button>
          <button
            type="button"
            onClick={() => onManual(false)}
            disabled={!canEdit}
            aria-pressed={reading.conform === false}
            className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
              reading.conform === false
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
            }`}
          >
            Non conforme
          </button>
        </span>
      </div>
    );
  }

  const numeric = reading.parsed.numeric;
  if (numeric === null) return null;

  const conform = reading.conform;
  const readAs =
    reading.parsed.kind === "absence"
      ? "lu comme une absence"
      : reading.parsed.kind === "below"
        ? "sous le seuil de détection"
        : `lu ${numeric.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`;

  if (conform === null) {
    return (
      <p className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {readAs} — aucune limite définie pour ce paramètre.
      </p>
    );
  }

  return (
    <p
      className={`mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
        conform
          ? "bg-emerald-50 text-emerald-800"
          : "bg-rose-50 text-rose-800"
      }`}
    >
      {conform ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="font-semibold">
        {conform ? "Conforme" : "Non conforme"}
      </span>
      <span className="font-normal">
        — {readAs}
        {limitValue !== null &&
          ` · limite ${limitValue.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`}
      </span>
      {!conform && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Dépassement
        </span>
      )}
    </p>
  );
}
