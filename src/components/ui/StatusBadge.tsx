import type { SampleStatus } from "@/generated/prisma/client";
import { SAMPLE_STATUS_LABELS } from "@/lib/labels";

const STATUS_STYLES: Record<SampleStatus, string> = {
  PRELEVE: "bg-sky-50 text-sky-700 ring-sky-200/60",
  RECU: "bg-amber-50 text-amber-700 ring-amber-200/60",
  EN_ANALYSE: "bg-violet-50 text-violet-700 ring-violet-200/60",
  RESULTATS_SAISIS: "bg-orange-50 text-orange-700 ring-orange-200/60",
  VALIDE: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  RAPPORT_ENVOYE: "bg-slate-100 text-slate-700 ring-slate-200/60",
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 sm:px-3 sm:text-xs ${STATUS_STYLES[status]}`}
    >
      {SAMPLE_STATUS_LABELS[status]}
    </span>
  );
}
