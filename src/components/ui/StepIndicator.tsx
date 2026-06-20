const STEPS = ["Informations", "Confirmation"] as const;

type StepIndicatorProps = {
  current: 1 | 2;
};

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3">
        {STEPS.map((label, index) => {
          const stepNum = index + 1;
          const isActive = current === stepNum;
          const isDone = current > stepNum;

          return (
            <div key={label} className="flex flex-1 items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    isDone
                      ? "bg-brand text-white shadow-sm"
                      : isActive
                        ? "bg-brand text-white shadow-md ring-4 ring-brand/15"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isDone ? "✓" : stepNum}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isActive || isDone ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 rounded-full transition-colors ${
                    isDone ? "bg-brand" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
