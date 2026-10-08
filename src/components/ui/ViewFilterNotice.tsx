import Link from "next/link";
import { ListFilter } from "lucide-react";

/**
 * Beside a list heading, the view a dashboard tile applied to it
 * (`?vue=`, see `lib/dashboard-view.ts`) and the way back to the whole list.
 * Render it only while a view is active. Server- and client-safe.
 *
 * ```tsx
 * <h2 id="file">{view ? VIEWS[view] : "File d'attente"}</h2>
 * {view && <ViewFilterNotice label={VIEWS[view]} resetHref={viewHref("/programmation", null, "file")} />}
 * ```
 */
export function ViewFilterNotice({
  label,
  resetHref,
  className = "",
}: {
  /** The view's name, as the tile reads (« En retard »). */
  label: string;
  /** The unfiltered list: `viewHref(path, null, anchor)`. */
  resetHref: string;
  className?: string;
}) {
  return (
    <p className={`flex flex-wrap items-center gap-2 text-sm${className ? ` ${className}` : ""}`}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
        <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
        Filtre : {label}
      </span>
      <Link
        href={resetHref}
        className="rounded font-medium text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Tout afficher
      </Link>
    </p>
  );
}
