import type { LucideIcon } from "lucide-react";

const ACCENTS = {
  blue: {
    icon: "bg-sky-50 text-sky-600 ring-sky-100",
    bar: "bg-sky-500",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    bar: "bg-emerald-500",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 ring-violet-100",
    bar: "bg-violet-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 ring-amber-100",
    bar: "bg-amber-500",
  },
  brand: {
    icon: "bg-brand-light text-brand ring-brand/10",
    bar: "bg-brand",
  },
} as const;

type StatCardProps = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
};

export function StatCard({ label, value, icon: Icon, accent = "brand" }: StatCardProps) {
  const colors = ACCENTS[accent];

  return (
    <div className="stat-card group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className={`absolute left-0 top-0 h-full w-1 ${colors.bar} opacity-80`} />
      <div className="flex items-center justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
            {value}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105 ${colors.icon}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
