"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, CircleMinus, XCircle, type LucideIcon } from "lucide-react";
import {
  CHECKLIST_STATUS_LABELS,
  checklistRowLabel,
  checklistSummary,
  type ChecklistRow,
  type ChecklistStatus,
} from "@/lib/reception-rules";

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

/**
 * The acceptance checklist of one sample: the seven rules of the bon de
 * réception (PG05/EN04), always all of them, in the paper's order and
 * wording, each with its status — the rules that do not concern the sample
 * stay listed, greyed, « sans objet ». Rule (1) is answered here when the
 * screen passes `exploitable` (reception, deposit); elsewhere (programme
 * sheet) the row shows the stored answer.
 */
export function Checklist({ rows, exploitable }: { rows: ChecklistRow[]; exploitable?: ExploitableControl }) {
  return (
    <section aria-label="Recevabilité — règles du bon de réception" className="mt-4 rounded-xl border border-slate-200">
      <p className="border-b border-slate-100 px-3 py-2 text-sm text-slate-600">
        <span className="font-semibold text-slate-800">Recevabilité</span> : {checklistSummary(rows)}
      </p>
      <ol className="divide-y divide-slate-100 px-3">
        {rows.map((row) => {
          const muted = row.status === "SANS_OBJET";
          const answering = row.key === "EXPLOITABLE" && exploitable;
          return (
            <li key={row.key} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className={`text-sm ${muted ? "text-slate-500" : "text-slate-800"}`}>{checklistRowLabel(row)}</p>
                {row.detail && !answering && (
                  <p className={`mt-0.5 text-xs ${muted ? "text-slate-500" : "text-slate-600"}`}>{row.detail}</p>
                )}
                {answering && (
                  <div
                    role="group"
                    aria-label="Règle 1 : l'échantillon est-il exploitable ?"
                    className={`mt-2 grid grid-cols-2 gap-2 rounded-xl sm:max-w-sm ${
                      exploitable.invalid ? "ring-2 ring-rose-300 ring-offset-2" : ""
                    }`}
                  >
                    <ConformityChip
                      id={exploitable.id}
                      active={exploitable.value === true}
                      disabled={false}
                      tone="ok"
                      label="Exploitable"
                      onClick={() => exploitable.onChange(true)}
                    />
                    <ConformityChip
                      active={exploitable.value === false}
                      disabled={false}
                      tone="warn"
                      label="Non exploitable"
                      onClick={() => exploitable.onChange(false)}
                    />
                  </div>
                )}
              </div>
              <ChecklistStatusPill status={row.status} />
            </li>
          );
        })}
      </ol>
    </section>
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
