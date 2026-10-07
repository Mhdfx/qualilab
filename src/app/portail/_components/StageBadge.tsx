import { PORTAL_STAGE_LABELS, type PortalStage } from "@/lib/portal-status";

const TONES: Record<PortalStage, string> = {
  RECU: "bg-sky-50 text-sky-700 ring-sky-200",
  EN_ANALYSE: "bg-amber-50 text-amber-700 ring-amber-200",
  RAPPORT_DISPONIBLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ANNULE: "bg-slate-100 text-slate-500 ring-slate-200",
};

/** The four states a client reads (PORTAIL.md §2) — never the laboratory's internal steps. */
export function StageBadge({ stage }: { stage: PortalStage }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONES[stage]}`}>
      {PORTAL_STAGE_LABELS[stage]}
    </span>
  );
}

/** « Amendé » next to a report that replaces an earlier one. */
export function AmendedBadge() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
      Rapport amendé
    </span>
  );
}
