"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, CircleMinus, ExternalLink, XCircle, type LucideIcon } from "lucide-react";
import {
  CHECKLIST_STATUS_LABELS,
  RECEPTION_NOTE_MAX,
  checklistRowLabel,
  checklistSummary,
  type ChecklistRow,
  type ChecklistStatus,
} from "@/lib/reception-rules";
import {
  STORAGE_CLASSES,
  storageClassOptionLabel,
  type ComplementaryKey,
  type SignedProtocolRow,
} from "@/lib/reception-complementary";
import { CONSULTATION_CHANNEL_LABELS, RECEPTION_DECISION_LABELS } from "@/lib/labels";
import {
  CONSULTATION_CHANNELS,
  CONSULTATION_NAME_MAX,
  CONSULTATION_NOTE_MAX,
  RECEPTION_DECISIONS,
  type ConsultationDraft,
  type ReceptionDecision,
} from "@/lib/client-consultation";
import type { ConsultationChannel, LineKind, StorageClass } from "@/generated/prisma/enums";
import { LabDateTimeInput } from "@/components/LabDateTimeInput";

const MINUTE_MS = 60_000;

function subscribeMinute(onChange: () => void) {
  const handle = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(handle);
}
const minuteSnapshot = () => Math.floor(Date.now() / MINUTE_MS);
const noMinute = () => null;

/**
 * The current minute, for the live delay (C1) and the day of reception
 * (C7): null on the server and during hydration, so the markup never
 * disagrees; the device's clock right after, refreshed every 15 s.
 */
export function useMinuteClock(): Date | null {
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, noMinute);
  return minute === null ? null : new Date(minute * MINUTE_MS);
}

const STATUS_STYLE: Record<ChecklistStatus, { icon: LucideIcon; pill: string }> = {
  CONFORME: { icon: CheckCircle2, pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  NON_CONFORME: { icon: XCircle, pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  A_VERIFIER: { icon: AlertTriangle, pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  A_CONFIRMER: { icon: CircleHelp, pill: "bg-sky-50 text-sky-800 ring-sky-200" },
  SANS_OBJET: { icon: CircleMinus, pill: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/** A row's status — its word and its icon, never the colour alone. */
export function ChecklistStatusPill({ status }: { status: ChecklistStatus }) {
  const { icon: Icon, pill } = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${pill}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {CHECKLIST_STATUS_LABELS[status]}
    </span>
  );
}

/** Rule (1) answered on the card: the two buttons of the row. */
export type ExploitableControl = {
  value: boolean | null;
  onChange: (exploitable: boolean) => void;
  /** Given to « Exploitable », so a refusal can bring the row into focus. */
  id: string;
  /** The row is the reason the reception was refused. */
  invalid?: boolean;
};

/** A contrôle complémentaire ticked on the card (C3, C5): Oui / Non. */
export type TickControl = {
  value: boolean | null;
  onChange: (ok: boolean) => void;
  /** Given to « Oui », so a refusal can bring the row into focus. */
  id: string;
  /** The row is the reason the reception was refused. */
  invalid?: boolean;
};

/**
 * The acceptance checklist of one sample: the eight rules of the bon de
 * réception (PG05/EN04), always all of them, in the paper's order and
 * wording, each with its status — the rules that do not concern the sample
 * stay listed, greyed, « sans objet ». Rule (1) is answered here when the
 * screen passes `exploitable` (reception, deposit); elsewhere (programme
 * sheet) the row shows the stored answer.
 *
 * The rows that carry a code (C1 … C7, `reception-complementary.ts`) are the
 * laboratory's contrôles complémentaires: listed after the paper's, in a
 * group of their own, « Contrôles complémentaires (hors bon) ». A ticked
 * control is answered here (Oui / Non) when the screen passes it in `ticks`.
 */
export function Checklist({
  rows,
  exploitable,
  ticks,
}: {
  rows: ChecklistRow[];
  exploitable?: ExploitableControl;
  ticks?: Partial<Record<ComplementaryKey, TickControl>>;
}) {
  const paper = rows.filter((row) => !row.code);
  const coded = rows.filter((row) => row.code);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <section aria-label="Recevabilité — règles du bon de réception">
        <p className="border-b border-slate-100 px-3 py-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Recevabilité</span> : {checklistSummary(paper)}
        </p>
        <ol className="divide-y divide-slate-100 px-3">
          {paper.map((row) => {
            const answering = row.key === "EXPLOITABLE" && exploitable;
            return (
              <ChecklistItem key={row.key} row={row} answering={Boolean(answering)}>
                {answering && (
                  <AnswerChips
                    label="Règle 1 : l'échantillon est-il exploitable ?"
                    control={exploitable}
                    yes="Exploitable"
                    no="Non exploitable"
                  />
                )}
              </ChecklistItem>
            );
          })}
        </ol>
      </section>
      {coded.length > 0 && (
        <section aria-label="Contrôles complémentaires (hors bon)" className="border-t border-slate-200">
          <p className="border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">Contrôles complémentaires (hors bon)</span> :{" "}
            {checklistSummary(coded)}
          </p>
          <ul className="divide-y divide-slate-100 px-3">
            {coded.map((row) => {
              const control = ticks?.[row.key as ComplementaryKey];
              return (
                <ChecklistItem key={row.key} row={row} answering={false}>
                  {control && (
                    <AnswerChips label={`${checklistRowLabel(row)} ?`} control={control} yes="Oui" no="Non" compact />
                  )}
                </ChecklistItem>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * C6, the série's own row (a visit only), listed above its samples: the
 * photo of the signed protocol when the préleveur attached one (« Voir »
 * opens it), otherwise the optional « Protocole papier signé reçu » — Oui /
 * Non, the active answer clicked again clears it. Never a sample's motif.
 */
export function SignedProtocolCheck({
  row,
  photoHref,
  answer,
}: {
  row: SignedProtocolRow;
  /** The photo's link when one is attached; null otherwise. */
  photoHref: string | null;
  /** The tick, when the screen answers it (no photo). */
  answer?: TickControl;
}) {
  return (
    <section aria-label="Contrôle de la série — documents" className="overflow-hidden rounded-xl border border-slate-200">
      <p className="border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-600">
        <span className="font-semibold text-slate-800">Contrôles complémentaires (hors bon)</span> : la série
      </p>
      <ul className="px-3">
        <ChecklistItem row={row} answering={false}>
          {photoHref && (
            <a
              href={photoHref}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-flex min-h-[44px] items-center gap-1 rounded-lg text-sm font-semibold text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Voir la photo du protocole signé
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          )}
          {!photoHref && answer && (
            <AnswerChips label="Protocole papier signé reçu ?" control={answer} yes="Oui, reçu" no="Non" compact />
          )}
        </ChecklistItem>
      </ul>
    </section>
  );
}

/** What a row needs to be listed: the paper's rules, the coded controls, C6. */
type ListedRow = Pick<ChecklistRow, "n" | "text" | "code" | "status" | "detail">;

/** One row: its label, its detail (unless the row is being answered), its pill. */
function ChecklistItem({ row, answering, children }: { row: ListedRow; answering: boolean; children?: React.ReactNode }) {
  const muted = row.status === "SANS_OBJET";
  return (
    <li className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className={`text-sm ${muted ? "text-slate-500" : "text-slate-800"}`}>{checklistRowLabel(row)}</p>
        {row.detail && !answering && (
          <p className={`mt-0.5 text-xs ${muted ? "text-slate-500" : "text-slate-600"}`}>{row.detail}</p>
        )}
        {children}
      </div>
      <ChecklistStatusPill status={row.status} />
    </li>
  );
}

/** The two answers of a row — rule (1) or a ticked control — as 44 px chips. */
function AnswerChips({
  label,
  control,
  yes,
  no,
  compact = false,
}: {
  label: string;
  control: ExploitableControl | TickControl;
  yes: string;
  no: string;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`mt-2 grid grid-cols-2 gap-2 rounded-xl ${compact ? "max-w-[14rem]" : "sm:max-w-sm"} ${
        control.invalid ? "ring-2 ring-rose-300 ring-offset-2" : ""
      }`}
    >
      <ConformityChip
        id={control.id}
        active={control.value === true}
        disabled={false}
        tone="ok"
        label={yes}
        onClick={() => control.onChange(true)}
      />
      <ConformityChip
        active={control.value === false}
        disabled={false}
        tone="warn"
        label={no}
        onClick={() => control.onChange(false)}
      />
    </div>
  );
}

/**
 * « Observation de réception » (A7), under the checklist of every sample:
 * optional, until a row « à vérifier » is accepted conforme — then it is the
 * justification, required (`rowToJustify`), and the hint names the row.
 */
export function ReceptionNoteField({
  id,
  value,
  onChange,
  doubt,
  invalid = false,
  inputClassName = "input-field mt-1.5 resize-y px-3 py-2",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The row whose doubt the observation must justify; null = optional. */
  doubt: Pick<ChecklistRow, "n" | "text" | "code"> | null;
  /** The reception was refused for this missing justification. */
  invalid?: boolean;
  inputClassName?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        Observation de réception{" "}
        {doubt ? (
          <>
            <span className="text-rose-600" aria-hidden="true">*</span>
            <span className="sr-only">(obligatoire)</span>
          </>
        ) : (
          <span className="font-normal text-slate-500">(facultatif)</span>
        )}
      </label>
      <textarea
        id={id}
        value={value}
        rows={2}
        maxLength={RECEPTION_NOTE_MAX}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
        aria-invalid={invalid || undefined}
        placeholder={doubt ? "Pourquoi l'échantillon est accepté malgré ce point" : "Ce que vous avez constaté à la réception"}
        className={`${inputClassName} ${invalid ? "ring-2 ring-rose-300" : ""}`}
      />
      <p id={hintId} className={`mt-1 flex justify-between gap-3 text-xs ${doubt ? "text-amber-800" : "text-slate-500"}`}>
        <span>
          {doubt
            ? `Obligatoire pour l'accepter conforme : justifiez « ${checklistRowLabel(doubt)} » à vérifier.`
            : "Imprimée sur le bon de réception et visible à la programmation."}
        </span>
        <span className="shrink-0 tabular-nums" aria-hidden="true">
          {value.length} / 1 000
        </span>
      </p>
    </div>
  );
}

/**
 * « Conservation » (C2): the class the sample travelled in. The first option
 * is the kind's default (`value` null — stored as such); the four classes
 * follow. On a food, « Ambiant » reads « aliment stable (conserve, sec,
 * UHT…) »: choosing it lifts the temperature of rule (6) (12/10). The parent
 * renders the <label htmlFor={id}>.
 */
export function StorageClassSelect({
  id,
  value,
  defaultLabel,
  lineKind,
  onChange,
  className = "input-field mt-1.5 px-3",
}: {
  id: string;
  value: StorageClass | null;
  /** « Réfrigéré (par défaut) », « Sans objet (par défaut) »… */
  defaultLabel: string;
  /** The sample's kind — words « Ambiant » as a stable food on a food. */
  lineKind: LineKind;
  onChange: (storageClass: StorageClass | null) => void;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value ? (event.target.value as StorageClass) : null)}
      className={className}
    >
      <option value="">{defaultLabel}</option>
      {STORAGE_CLASSES.map((storage) => (
        <option key={storage} value={storage}>
          {storageClassOptionLabel(storage, lineKind)}
        </option>
      ))}
    </select>
  );
}

/**
 * What becomes of a non-conform sample (29/09, A9): « Analyser malgré tout »,
 * « En attente du client » (received, held until released), « Détruire ».
 * `decisions` narrows the choice (the release offers analyse / destroy).
 */
export function DecisionChips({
  legend,
  value,
  onChange,
  decisions = RECEPTION_DECISIONS,
  legendClassName = "text-sm font-medium text-slate-700",
}: {
  legend: string;
  /** Null: nothing chosen yet (the release asks before acting). */
  value: ReceptionDecision | null;
  onChange: (decision: ReceptionDecision) => void;
  decisions?: readonly ReceptionDecision[];
  legendClassName?: string;
}) {
  return (
    <fieldset className="mt-3">
      <legend className={legendClassName}>{legend}</legend>
      <div className={`mt-2 grid grid-cols-1 gap-2 ${decisions.length > 2 ? "sm:grid-cols-3" : "grid-cols-2"}`}>
        {decisions.map((decision) => (
          <ConformityChip
            key={decision}
            active={value === decision}
            disabled={false}
            tone={decision === "ANALYSER" ? "ok" : "warn"}
            label={RECEPTION_DECISION_LABELS[decision]}
            onClick={() => onChange(decision)}
          />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The id of the agreement's date-time in `ConsultationFields` (`idPrefix`):
 * what a validation hands `dateTimePending` before checking the time.
 */
export const consultationAtId = (idPrefix: string) => `${idPrefix}-at`;

/**
 * « Accord du client » (A9, ISO/IEC 17025 §7.4.3) — under « Analyser malgré
 * tout » of a non-conform sample, and at the release of a held one: who was
 * consulted, how, when, a note. Optional unless the laboratory requires it
 * (`LabSettings.consultationRequired`); the date-time left empty is the
 * moment it is recorded.
 */
export function ConsultationFields({
  idPrefix,
  value,
  onChange,
  required,
  invalid = false,
  fieldClassName = "input-field px-3",
}: {
  idPrefix: string;
  value: ConsultationDraft;
  onChange: (value: ConsultationDraft) => void;
  required: boolean;
  /** The last refusal was about this agreement. */
  invalid?: boolean;
  fieldClassName?: string;
}) {
  const set = (patch: Partial<ConsultationDraft>) => onChange({ ...value, ...patch });
  const star = required ? (
    <>
      <span className="text-rose-600" aria-hidden="true">
        {" "}*
      </span>
      <span className="sr-only"> (obligatoire)</span>
    </>
  ) : null;
  return (
    <fieldset
      className={`mt-3 rounded-xl border p-3 ${invalid ? "border-rose-300 ring-2 ring-rose-200" : "border-slate-200"}`}
    >
      <legend className="px-1 text-sm font-medium text-slate-700">
        Accord du client{" "}
        <span className="font-normal text-slate-500">{required ? "(obligatoire)" : "(facultatif)"}</span>
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="block text-sm font-medium text-slate-700">
            Personne consultée{star}
          </label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            autoComplete="off"
            maxLength={CONSULTATION_NAME_MAX}
            value={value.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="Nom et fonction"
            className={`${fieldClassName} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-channel`} className="block text-sm font-medium text-slate-700">
            Canal{star}
          </label>
          <select
            id={`${idPrefix}-channel`}
            value={value.channel}
            onChange={(event) => set({ channel: event.target.value as ConsultationChannel | "" })}
            className={`${fieldClassName} mt-1.5`}
          >
            <option value="">Choisir…</option>
            {CONSULTATION_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CONSULTATION_CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={consultationAtId(idPrefix)} className="block text-sm font-medium text-slate-700">
            Date et heure de l&apos;accord
          </label>
          <LabDateTimeInput
            id={consultationAtId(idPrefix)}
            value={value.at}
            onChange={(at) => set({ at })}
            nowButton
            className="mt-1.5"
            inputClassName={fieldClassName}
          />
          {!value.at && <p className="mt-1 text-xs text-slate-500">Vide : l&apos;heure de l&apos;enregistrement.</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-note`} className="block text-sm font-medium text-slate-700">
            Note <span className="font-normal text-slate-500">(facultatif)</span>
          </label>
          <textarea
            id={`${idPrefix}-note`}
            rows={2}
            maxLength={CONSULTATION_NOTE_MAX}
            value={value.note}
            onChange={(event) => set({ note: event.target.value })}
            placeholder="Ce que le client a demandé"
            className={`${fieldClassName} mt-1.5 resize-y py-2`}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function ConformityChip({
  id,
  active,
  disabled,
  tone,
  label,
  onClick,
}: {
  id?: string;
  active: boolean;
  disabled: boolean;
  tone: "ok" | "warn";
  label: string;
  onClick: () => void;
}) {
  const activeStyle =
    tone === "ok"
      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
      : "border-amber-400 bg-amber-50 text-amber-800";
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? activeStyle : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
