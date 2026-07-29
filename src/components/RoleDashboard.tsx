import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

type Stat = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: "blue" | "emerald" | "violet" | "amber" | "brand";
};

type NextStep = {
  title: string;
  description: string;
  phase: string;
};

type RoleDashboardProps = {
  badge: string;
  title: string;
  subtitle: string;
  stats: Stat[];
  /** What this role will be able to do once the workflow screens land. */
  mission: string;
  nextSteps: NextStep[];
};

/**
 * Landing page for a role space.
 *
 * Phase 1 delivers the space itself: the user signs in and sees their own
 * indicators plus what their workflow will cover. The action screens are added
 * in the phases named on each card.
 */
export function RoleDashboard({
  badge,
  title,
  subtitle,
  stats,
  mission,
  nextSteps,
}: RoleDashboardProps) {
  return (
    <div>
      <PageHeader badge={badge} title={title} subtitle={subtitle} />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              accent={stat.accent}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Votre mission
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{mission}</p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Prochaines fonctionnalités de votre espace
          </h2>
          <ul className="mt-4 space-y-3">
            {nextSteps.map((step) => (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5"
              >
                <ArrowRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {step.title}
                    <span className="rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-medium text-brand">
                      {step.phase}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
