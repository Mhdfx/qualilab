import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Interpretation } from "@/generated/prisma/enums";
import { INTERPRETATION_LABELS } from "@/lib/interpretation";

const STYLES: Record<Interpretation, { className: string; Icon: typeof CheckCircle2 }> = {
  SATISFAISANT: { className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  ACCEPTABLE: { className: "bg-amber-50 text-amber-700 ring-amber-200", Icon: AlertTriangle },
  NON_SATISFAISANT: { className: "bg-rose-50 text-rose-700 ring-rose-200", Icon: XCircle },
  INCOMPLET: { className: "bg-slate-100 text-slate-600 ring-slate-200", Icon: CircleDashed },
};

/** The verdict of a criterion (CRITERES.md §4), the same pill everywhere. */
export function VerdictBadge({ verdict, size = "sm" }: { verdict: Interpretation; size?: "sm" | "md" }) {
  const { className, Icon } = STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${className} ${
        size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs"
      }`}
    >
      <Icon className={size === "md" ? "h-4 w-4" : "h-3 w-3"} aria-hidden="true" />
      {INTERPRETATION_LABELS[verdict]}
    </span>
  );
}
