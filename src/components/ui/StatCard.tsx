import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const ACCENTS = {
  blue: {
    icon: "bg-sky-50 text-sky-600 ring-sky-100",
    bar: "bg-sky-500",
    active: "border-sky-400 bg-sky-50/60 ring-1 ring-sky-400",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    bar: "bg-emerald-500",
    active: "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-400",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 ring-violet-100",
    bar: "bg-violet-500",
    active: "border-violet-400 bg-violet-50/60 ring-1 ring-violet-400",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 ring-amber-100",
    bar: "bg-amber-500",
    active: "border-amber-400 bg-amber-50/60 ring-1 ring-amber-400",
  },
  brand: {
    icon: "bg-brand-light text-brand ring-brand/10",
    bar: "bg-brand",
    active: "border-brand bg-brand-light/60 ring-1 ring-brand",
  },
} as const;

export type StatAccent = keyof typeof ACCENTS;

export type StatCardProps = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: StatAccent;
  /**
   * The list this tile counts. With it the tile is a real link (keyboard,
   * focus ring, hover lift); without it the tile is a plain figure and does
   * not pretend to be clickable. Only give it when the destination shows
   * exactly what the tile counts.
   */
  href?: string;
  /**
   * The tile's view is the one on screen (`?vue=` of the page, or the
   * invoice filter): highlighted in its accent and announced with
   * `aria-current="page"`. Ignored without `href`.
   */
  active?: boolean;
  /** A short precision under the figure (« sur les 100 dernières approbations »). */
  hint?: string;
};

/** The idle look of a tile; an active one swaps it for its accent. */
const IDLE = "border-slate-200/80 bg-white";

/**
 * One headline figure of a dashboard. Server- and client-safe (no hooks).
 *
 * A linked tile is announced « label : value » (then the hint), the visible
 * text in reading order, so a screen reader never runs the two together; the
 * icon is decorative.
 */
export function StatCard({ label, value, icon: Icon, accent = "brand", href, active = false, hint }: StatCardProps) {
  const colors = ACCENTS[accent];
  const isActive = Boolean(href) && active;

  const body = (
    <>
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 h-full ${isActive ? "w-1.5 opacity-100" : "w-1 opacity-80"} ${colors.bar}`}
      />
      <span className="flex items-center justify-between gap-3 pl-2">
        <span className="block min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
            {label}
          </span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{value}</span>
          {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
        </span>
        <span
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${colors.icon}${
            href ? " transition-transform motion-safe:group-hover:scale-105" : ""
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </span>
    </>
  );

  const frame = "stat-card group relative block overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-5";

  if (!href) {
    return <div className={`${frame} ${IDLE}`}>{body}</div>;
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      aria-label={`${label} : ${value}${hint ? ` (${hint})` : ""}`}
      className={`${frame} ${
        isActive ? colors.active : `${IDLE} hover:border-slate-300`
      } cursor-pointer transition-[translate,scale,box-shadow,border-color] duration-150 hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`}
    >
      {body}
    </Link>
  );
}
