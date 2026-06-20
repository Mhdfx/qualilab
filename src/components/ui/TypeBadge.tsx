import type { SampleType } from "@/generated/prisma/client";
import { SAMPLE_TYPE_LABELS } from "@/lib/labels";

const TYPE_STYLES: Record<SampleType, string> = {
  ALIMENTAIRE: "bg-orange-50 text-orange-700 ring-orange-200/50",
  EAU: "bg-cyan-50 text-cyan-700 ring-cyan-200/50",
  AMBIANCE: "bg-teal-50 text-teal-700 ring-teal-200/50",
};

export function TypeBadge({ type }: { type: SampleType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${TYPE_STYLES[type]}`}
    >
      {SAMPLE_TYPE_LABELS[type]}
    </span>
  );
}
