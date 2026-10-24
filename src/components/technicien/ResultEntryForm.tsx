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
import { VerdictBadge } from "@/components/samples/VerdictBadge";
import { factoredText, singleValueEntry, type ParsedValue } from "@/lib/result-value";
import { hasLimit, judgeUnits, type Plan, type Verdict as PlanVerdict } from "@/lib/interpretation";
import { benchUnits, unitsAgainstLimit, valueAgainstLimit } from "@/lib/bench-reading";
import { repetitionLabel } from "@/lib/series";
import { lostSampleHolder } from "@/lib/take-over";
import { SHEET_SAVED_BY_COLLEAGUE, followServer, overlapNotice } from "@/lib/take-over-sheet";
import type { ResultWorkStatus } from "@/generated/prisma/enums";

export type ParameterLine = {
  parameterId: string;
  name: string;
  /** The criterion's unit, else the parameter's (`benchUnit`). */
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
  /** Read per unit (R1 … Rn) rather than as one value. */
  perUnit: boolean;
  /** The criterion of the sample's product type (CRITERES.md): null = none. */
  plan: Plan | null;
  planLabel: string | null;
  normLabel: string | null;
  /** One reading per unit taken when `perUnit`. */
  units: string[];
  /**
   * May this technician type the line? Any line of a free sample (the first
   * save takes it) or of one they hold; a parameter a legacy programme handed
   * to a colleague stays read-only (`canEnterParameter`, PROGRAMME.md §10.4).
   */
  editable: boolean;
  /** The technician in charge of the line, named when it is not me. */
  technicianName: string | null;
  /** The method note of the programme d'analyse, if any. */
  methodNote: string | null;
  /**
   * « Saisi par X le … » — who typed the stored reading, and when
   * (`enteredByText`, D-09): null on a line nothing is saved on. Read from
   * the server's sheet on every render, never from the typing, so it
   * follows each save.
   */
  enteredBy: string | null;
};

type ResultEntryFormProps = {
  sampleId: string;
  canEdit: boolean;
  initialLines: ParameterLine[];
  /**
   * When the server rendered `initialLines` (ISO, server time): every
   * `router.refresh()` brings a new one. The save sends it, so a colleague's
   * reading saved since is never written over by this sheet (409
   * `SHEET_SAVED_BY_COLLEAGUE`, re-ask 2.13).
   */
  loadedAt: string;
  /**
   * A colleague's sample, opened read-only: who holds it. The page says it
   * once, above the sheet, so no line repeats « lecture seule ».
   */
  heldBy?: string | null;
  /**
   * Why « Soumettre » is closed though the sheet is editable — the admin
   * standing in on a sample nobody took (the server refuses it, 409).
   */
  submitBlocked?: string | null;
};

/** What `PUT …/results` answers once the sheet is saved. */
type SaveAnswer = { status: string; saved: number; taken: boolean };

/**
 * What the server decides of a line — which lines the sheet holds and how
 * each one reads — as opposed to what is typed in it. A refresh that brings
 * a new shape (a programme edited while the sheet was open) says so to the
 * technician who was refused; the typing is carried over either way
 * (`followServer`).
 */
function sheetShape(lines: ParameterLine[]): string {
  return JSON.stringify(
    lines.map((line) => [
      line.parameterId,
      line.name,
      line.unit,
      line.editable,
      line.technicianName,
      line.perUnit,
      line.units.length,
      line.calcFactor,
      line.planLabel,
      line.normLabel,
      line.threshold,
      line.limitValue,
      line.methodNote,
    ])
  );
}

const WORK_STATUS_LABELS: Record<ResultWorkStatus, string> = {
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  ANOMALIE: "Anomalie",
};

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-500";

type Reading = {
  parsed: ParsedValue | null;
  conform: boolean | null;
  needsManual: boolean;
  /** The engine's verdict for a germ read per unit against its criterion. */
  verdict: PlanVerdict | null;
  /** True when that verdict is only indicative (fewer units than the plan's n). */
  indicative: boolean;
  typedUnits: number;
  /** Repetitions typed in a notation the engine cannot read (« abc »): R1, R4… */
  unreadable: string[];
  /** « > x » below the limit: why the conformity cannot be computed. */
  undecided: string | null;
  /**
   * A single value the report prints otherwise than typed — « 3(-2) » →
   * « 3.10² », a reading × its factor — and whether the factor rewrote it.
   */
  stored: { value: string; factored: boolean } | null;
};

const NO_UNREADABLE: string[] = [];

/** The notations the bench accepts — the help line and the « non reconnue » message. */
const ACCEPTED_NOTATIONS = "1,2.10², < 10, > 3.10⁵, Indénombrable (ou TNTC), Absence, Présence ou 3(-2)";

export function ResultEntryForm({
  sampleId,
  canEdit,
  initialLines,
  loadedAt,
  heldBy = null,
  submitBlocked = null,
}: ResultEntryFormProps) {
  const router = useRouter();
  const [lines, setLines] = useState<ParameterLine[]>(initialLines);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The sample is no longer mine (`refused`): who holds it now, and whether
  // my readings were saved first (the submission refused after its save).
  const [revoked, setRevoked] = useState<{ holder: string; saved: boolean } | null>(null);
  // « Saisi par » follows the server's sheet, not the typing.
  const authors = new Map(initialLines.map((line) => [line.parameterId, line.enteredBy]));

  // The page re-renders after every save (`router.refresh()`), each
  // rendering with its `loadedAt`. The lines are this form's state: on a new
  // rendering they follow the server on every line not typed on since the
  // last one, and keep what was typed (`followServer`) — a programme edited
  // meanwhile (409 « … a changé : rechargez la fiche. »), a colleague's
  // reading saved meanwhile (409 `SHEET_SAVED_BY_COLLEAGUE`): the refresh
  // just did it. Adjusted while rendering, as React recommends for state
  // derived from a prop, so no stale sheet is ever painted.
  const [laid, setLaid] = useState({ loadedAt, lines: initialLines });
  // The last save was refused because a colleague saved meanwhile: the next
  // rendering names the lines both changed.
  const [colleagueSaved, setColleagueSaved] = useState(false);
  if (loadedAt !== laid.loadedAt) {
    const followed = followServer(initialLines, lines, laid.lines);
    setLaid({ loadedAt, lines: initialLines });
    setLines(followed.lines);
    if (sheetShape(initialLines) !== sheetShape(laid.lines)) {
      if (error) setError("La fiche a été mise à jour : vérifiez votre saisie, puis enregistrez de nouveau.");
    } else if (colleagueSaved) {
      const overlap = overlapNotice(followed.overlap.map((line) => line.name));
      if (overlap) setError(`${SHEET_SAVED_BY_COLLEAGUE} ${overlap}`);
    }
    if (colleagueSaved) setColleagueSaved(false);
  }

  const readings = useMemo<Reading[]>(
    () =>
      lines.map((line) => {
        if (line.perUnit) {
          // The same engine and the same dilution the server will apply, so
          // the verdict shown while typing is the verdict stored.
          if (line.plan) {
            const { readings: units, typedUnits, unreadable } = benchUnits(line.units, line.calcFactor);
            const judged = typedUnits > 0 ? judgeUnits(line.plan, units) : null;
            const verdict = judged ? judged.official ?? judged.informal : null;
            return { parsed: null, conform: null, needsManual: false, verdict, indicative: !!judged && !judged.official, typedUnits, unreadable, undecided: null, stored: null };
          }
          // No criterion: the worst unit against the parameter's limit. The
          // technician only decides when the reading is meaningful but not a
          // number (« Présence »), or a « > x » below the limit — the rule the
          // submission checks again (`awaitsManualConformity`).
          const read = unitsAgainstLimit(line.units, line.calcFactor, line.limitValue);
          return {
            parsed: read.parsed,
            conform: read.suggested ?? (read.needsManual ? line.manualConform : null),
            needsManual: read.needsManual,
            verdict: null,
            indicative: false,
            typedUnits: read.typedUnits,
            unreadable: read.unreadable,
            undecided: read.undecided,
            stored: null,
          };
        }
        // The suggestion compares the FINAL value — raw reading × factor —
        // and the line shows the text the report will print, both exactly as
        // the server will store them.
        const read = valueAgainstLimit(line.value, line.calcFactor, line.limitValue);
        const entry = singleValueEntry(line.value, line.calcFactor);
        return {
          parsed: read.parsed,
          conform: read.suggested ?? (read.needsManual ? line.manualConform : null),
          needsManual: read.needsManual,
          verdict: null,
          indicative: false,
          typedUnits: 0,
          unreadable: NO_UNREADABLE,
          undecided: read.undecided,
          stored:
            entry.value !== null && entry.rawValue !== null && entry.value !== entry.rawValue
              ? { value: entry.value, factored: line.calcFactor !== 1 && factoredText(entry.parsed) !== null }
              : null,
        };
      }),
    [lines]
  );

  const completed = lines.filter((line, index) => {
    if (line.workStatus === "EN_COURS") return false;
    const reading = readings[index];
    if (line.perUnit && reading.typedUnits < line.units.length) return false;
    if (reading.unreadable.length > 0) return false;
    // A « Non spécifié » criterion gives no verdict: read is enough.
    if (line.plan && !hasLimit(line.plan)) return reading.verdict?.verdict !== "INCOMPLET";
    if (line.plan) return reading.verdict !== null && reading.verdict.verdict !== "INCOMPLET";
    if (line.perUnit) return !(reading.needsManual && reading.conform === null);
    return reading.parsed !== null && !(reading.needsManual && reading.conform === null);
  }).length;
  const allComplete = completed === lines.length && lines.length > 0;

  function update(index: number, patch: Partial<ParameterLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
    // A revoked sheet keeps saying why it no longer saves.
    if (revoked === null) setError("");
    setNotice("");
  }

  function updateUnit(index: number, unitIndex: number, value: string) {
    const line = lines[index];
    const units = [...line.units];
    units[unitIndex] = value;
    update(index, { units });
  }

  function payload() {
    // Only the lines I may type travel: the server refuses a colleague's (403).
    return lines.flatMap((line, index) => {
      if (!line.editable) return [];
      return [
        line.perUnit
          ? {
              parameterId: line.parameterId,
              units: line.units,
              note: line.note,
              workStatus: line.workStatus,
              conform: line.plan ? undefined : readings[index].conform,
            }
          : {
              parameterId: line.parameterId,
              value: line.value,
              note: line.note,
              workStatus: line.workStatus,
              conform: readings[index].conform,
            },
      ];
    });
  }

  /**
   * A refusal because the bench moved under the sheet. The programme
   * changed or the sheet left the bench (409): the reason is shown and the
   * page re-renders, so the sheet follows the new programme (the typing
   * carried over) or turns read-only; so does any other 403 (a parameter a
   * legacy programme handed to a colleague). The sample is no longer mine
   * — a colleague took it over (403, re-ask 2.13) or took it during the
   * save (409 « Déjà pris par X. »), `lostSampleHolder`: a re-render would
   * swap this sheet for the read-only one and lose the typing — so the
   * sheet stays as typed, its buttons closed, until « Recharger la fiche »,
   * for the technician to pass the readings on. `saved`: the refusal is the
   * submission's, after its save went through — the readings are stored
   * under my name, only the submission was refused. A colleague saved on
   * the sheet since it was rendered (409 `SHEET_SAVED_BY_COLLEAGUE`): the
   * re-render shows their readings and keeps the typing (`followServer`).
   */
  function refused(status: number, message: string, saved = false) {
    setError(message);
    const holder = lostSampleHolder(message);
    if (holder !== null) {
      setRevoked({ holder, saved });
      return;
    }
    if (message === SHEET_SAVED_BY_COLLEAGUE) setColleagueSaved(true);
    if (status === 403 || status === 409) router.refresh();
  }

  /** Saves the sheet: the server's answer, or null once the refusal is on screen. */
  async function save(): Promise<SaveAnswer | null> {
    const response = await fetch(`/api/samples/${sampleId}/results`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // `loadedAt`: the rendering these lines follow (`followServer`).
      body: JSON.stringify({ results: payload(), loadedAt: laid.loadedAt }),
    });
    const data = await response.json();
    if (!response.ok) {
      refused(response.status, data.error ?? "Impossible d'enregistrer les résultats.");
      return null;
    }
    return data as SaveAnswer;
  }

  async function handleSave() {
    if (busy) return;
    setBusy("save");
    setError("");
    try {
      const saved = await save();
      if (saved) {
        // The first typed result of a free sample took it (PROGRAMME.md §10.2).
        setNotice(
          saved.taken
            ? "Résultats enregistrés — l'échantillon est maintenant à vous."
            : "Résultats enregistrés. Vous pouvez reprendre plus tard."
        );
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
        // The save above went through: only the submission is refused.
        refused(response.status, data.error ?? "Impossible de soumettre les résultats.", true);
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
        <p className="mt-1 text-xs text-slate-500">
          Notations acceptées : <span className="font-mono text-slate-600">{ACCEPTED_NOTATIONS}</span>.
        </p>

        <ul className="mt-4 space-y-3">
          {lines.map((line, index) => {
            const reading = readings[index];
            // A parameter a legacy programme handed to a colleague is
            // read-only on my sheet (PROGRAMME.md §10.4).
            const locked = !canEdit || !line.editable;
            return (
              <li
                key={line.parameterId}
                className="rounded-xl border border-slate-200 p-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                    {line.name}
                    {/* On a colleague's sample the page says it once, above the sheet. */}
                    {!line.editable && !heldBy && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        {line.technicianName ? `Paramètre de ${line.technicianName}` : "Paramètre d'un autre technicien"} — lecture seule
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {line.plan ? (
                      <>
                        Critère : <span className="font-mono text-slate-700">{line.planLabel}</span>
                        {line.normLabel && <span className="ml-2 text-slate-400">{line.normLabel}</span>}
                      </>
                    ) : (
                      <>Seuil : {line.threshold ?? "non défini"}</>
                    )}
                    {/* Every line a factor multiplies says so, read per unit or as one value. */}
                    {line.calcFactor !== 1 && (
                      <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                        Facteur ×{line.calcFactor} — votre lecture sera multipliée
                      </span>
                    )}
                  </p>
                </div>
                {line.methodNote && (
                  <p className="mt-1 text-xs text-slate-500">Méthode : {line.methodNote}</p>
                )}
                {/* D-09 at the bench: who typed the stored reading, even after a take-over. */}
                {authors.get(line.parameterId) && (
                  <p className="mt-1 text-xs text-slate-500">{authors.get(line.parameterId)}</p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  {line.perUnit ? (
                    <fieldset>
                      <legend className="block text-xs font-medium text-slate-600">
                        Lecture par répétition {line.unit && `(${line.unit})`} — {line.units.length} unité{line.units.length > 1 ? "s" : ""}
                        {line.plan && line.plan.n !== line.units.length && (
                          <span className="ml-1 text-slate-500">· plan n = {line.plan.n}</span>
                        )}
                      </legend>
                      <div
                        className="mt-1 grid gap-2 overflow-x-auto pb-1"
                        style={{ gridTemplateColumns: `repeat(${Math.min(line.units.length, 5)}, minmax(4.75rem, 1fr))` }}
                      >
                        {line.units.map((unit, unitIndex) => (
                          <label key={unitIndex} className="block">
                            {/* R1 … Rn: the same name on the tube, the bench and the report (Q36). */}
                            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              {repetitionLabel(unitIndex + 1)}
                            </span>
                            <input
                              type="text"
                              inputMode="text"
                              aria-label={`${line.name} — ${repetitionLabel(unitIndex + 1)}`}
                              value={unit}
                              onChange={(e) => updateUnit(index, unitIndex, e.target.value)}
                              disabled={locked}
                              placeholder={line.plan?.mKind === "ABSENCE" ? "Absence" : line.plan ? "1,2.10²" : "Valeur"}
                              className={INPUT}
                            />
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
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
                        disabled={locked}
                        placeholder="Ex. : 8,9.10²  ·  < 10  ·  > 3.10⁵  ·  Absence"
                        className={INPUT}
                      />
                      {reading.stored && (
                        <p className="mt-1 text-xs text-violet-700">
                          {reading.stored.factored ? `Valeur finale (lecture ×${line.calcFactor}) : ` : "Au rapport : "}
                          <b className="font-mono">{reading.stored.value}</b>
                          {line.unit ? ` ${line.unit}` : ""}
                          {reading.stored.factored ? " — c'est elle qui figure au rapport." : "."}
                        </p>
                      )}
                    </div>
                  )}

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
                      disabled={locked}
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

                {reading.unreadable.length > 0 ? (
                  <p
                    role="alert"
                    className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {reading.unreadable.join(", ")} : lecture non reconnue. Notation attendue : {ACCEPTED_NOTATIONS}.
                    </span>
                  </p>
                ) : line.plan && !hasLimit(line.plan) ? (
                  <p className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Critère « non spécifié » : le résultat figure au rapport sans verdict.
                  </p>
                ) : line.plan ? (
                  reading.verdict && (
                    <p className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {reading.indicative && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 ring-1 ring-sky-200">
                          Indicatif — pas de verdict au rapport
                        </span>
                      )}
                      <VerdictBadge verdict={reading.verdict.verdict} />
                      <span>{reading.verdict.reason}</span>
                    </p>
                  )
                ) : (
                  <Verdict
                    reading={reading}
                    limitValue={line.limitValue}
                    unit={line.unit}
                    canEdit={!locked}
                    onManual={(conform) => update(index, { manualConform: conform })}
                  />
                )}

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
                      disabled={locked}
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
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            <p>{error}</p>
            {revoked !== null && (
              <>
                <p className="mt-1">
                  {revoked.saved
                    ? `Vos résultats ont été enregistrés à votre nom, mais l'échantillon n'a pas été soumis : ${revoked.holder} le termine. Rechargez la fiche.`
                    : "Rien n'a été enregistré : votre saisie reste affichée ci-dessus. Notez-la pour la transmettre, puis rechargez la fiche."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // The page re-renders read-only when the sample is a
                    // colleague's; otherwise the sheet is open again.
                    setRevoked(null);
                    setError("");
                    router.refresh();
                  }}
                  className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  Recharger la fiche
                </button>
              </>
            )}
          </div>
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
              disabled={!!busy || revoked !== null || !allComplete || !!submitBlocked}
              className="sm:flex-1"
              title={
                submitBlocked
                  ? submitBlocked
                  : allComplete
                    ? undefined
                    : "Complétez tous les paramètres avant de soumettre"
              }
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {busy === "submit"
                ? "Soumission…"
                : "Soumettre à la validation"}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={handleSave} disabled={!!busy || revoked !== null}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy === "save" ? "Enregistrement…" : "Enregistrer"}
            </SecondaryButton>
          </div>
        )}

        {canEdit && submitBlocked && (
          <p className="mt-2 text-center text-xs text-slate-500 sm:text-right">{submitBlocked}</p>
        )}

        {canEdit && !submitBlocked && !allComplete && (
          <p className="mt-2 text-center text-xs text-slate-500 sm:text-right">
            Tous les paramètres doivent être renseignés et terminés pour
            soumettre{lines.some((line) => !line.editable) ? ", y compris ceux de vos collègues" : ""}.
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
  reading: Reading;
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
          {reading.undecided
            ? `${reading.undecided} Sinon, indiquez la conformité :`
            : reading.parsed.kind === "uncountable"
              ? "Indénombrable, sans limite définie — indiquez la conformité :"
              : "Valeur non numérique — indiquez la conformité :"}
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
  const kind = reading.parsed.kind;
  if (numeric === null && kind !== "uncountable") return null;

  const conform = reading.conform;
  const shown = numeric === null ? "" : `${numeric.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`;
  const readAs =
    kind === "absence"
      ? "lu comme une absence"
      : kind === "below"
        ? "sous le seuil de détection"
        : kind === "uncountable"
          ? "indénombrable"
          : kind === "above"
            ? `lu plus de ${shown}`
            : `lu ${shown}`;

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
      {!conform && limitValue !== null && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Dépassement
        </span>
      )}
    </p>
  );
}
