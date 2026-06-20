import type { SampleStatus } from "@/generated/prisma/client";
import { Check } from "lucide-react";

const WORKFLOW_STEPS = [
  { id: 0, label: "Prélevé", statuses: ["PRELEVE"] as SampleStatus[] },
  { id: 1, label: "Reçu", statuses: ["RECU"] as SampleStatus[] },
  {
    id: 2,
    label: "En analyse",
    statuses: ["EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[],
  },
  { id: 3, label: "Validé", statuses: ["VALIDE"] as SampleStatus[] },
  { id: 4, label: "Rapport envoyé", statuses: ["RAPPORT_ENVOYE"] as SampleStatus[] },
];

function getCurrentStepIndex(status: SampleStatus): number {
  const idx = WORKFLOW_STEPS.findIndex((step) => step.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

type SampleStatusTimelineProps = {
  status: SampleStatus;
  compact?: boolean;
};

export function SampleStatusTimeline({ status, compact = false }: SampleStatusTimelineProps) {
  const currentIndex = getCurrentStepIndex(status);

  return (
    <div className={compact ? "" : "rounded-xl border border-slate-200 bg-slate-50 p-4"}>
      {!compact && (
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Avancement du prélèvement
        </p>
      )}

      {/* Desktop / tablet: horizontal */}
      <div className="hidden sm:block">
        <div className="flex items-start justify-between">
          {WORKFLOW_STEPS.map((step, index) => {
            const isComplete = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === WORKFLOW_STEPS.length - 1;

            return (
              <div key={step.label} className="relative flex flex-1 flex-col items-center">
                {!isLast && (
                  <div
                    className={`absolute left-1/2 top-4 h-0.5 w-full ${
                      index < currentIndex ? "bg-brand" : "bg-slate-200"
                    }`}
                  />
                )}
                <div
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                    isComplete
                      ? "border-brand bg-brand text-white"
                      : isCurrent
                        ? "border-brand bg-white text-brand ring-4 ring-brand/15"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <p
                  className={`mt-2 max-w-[4.5rem] text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs ${
                    isCurrent ? "text-brand" : isComplete ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: vertical */}
      <div className="space-y-0 sm:hidden">
        {WORKFLOW_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === WORKFLOW_STEPS.length - 1;

          return (
            <div key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    isComplete
                      ? "border-brand bg-brand text-white"
                      : isCurrent
                        ? "border-brand bg-white text-brand"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                {!isLast && (
                  <div
                    className={`my-1 w-0.5 flex-1 min-h-[20px] ${
                      index < currentIndex ? "bg-brand" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
              <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                <p
                  className={`text-sm font-medium ${
                    isCurrent ? "text-brand" : isComplete ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="mt-0.5 text-xs text-brand/80">Étape en cours</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
