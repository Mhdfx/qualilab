"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Check } from "@/lib/reception-rules";

/** The acceptance checklist of one line, as the rules engine computed it. */
export function Checklist({ checks }: { checks: Check[] }) {
  if (checks.length === 0) {
    return (
      <p className="mt-3 text-xs text-slate-400">Aucune règle de quantité ou de température pour ce type de ligne.</p>
    );
  }
  return (
    <ul className="mt-3 space-y-1">
      {checks.map((check) => {
        const tone =
          check.level === "BLOQUANT"
            ? "text-rose-700"
            : check.level === "AVERTISSEMENT"
              ? "text-amber-700"
              : "text-emerald-700";
        const Icon = check.level === "BLOQUANT" ? XCircle : check.level === "AVERTISSEMENT" ? AlertTriangle : CheckCircle2;
        return (
          <li key={check.rule} className={`flex items-start gap-2 text-sm ${tone}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{check.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ConformityChip({
  active,
  disabled,
  tone,
  label,
  onClick,
}: {
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? activeStyle : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
