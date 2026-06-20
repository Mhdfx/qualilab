import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: ReactNode;
};

export function PageHeader({ title, subtitle, badge, action }: PageHeaderProps) {
  return (
    <div className="page-header mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {badge && (
            <span className="mb-2 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
              {badge}
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 max-w-xl text-sm text-white/75 sm:text-base">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
