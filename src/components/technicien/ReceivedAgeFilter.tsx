import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { MAX_RECEIVED_AGE, RECEIVED_AGE_PARAM, receivedAgeHref, receivedAgeLabel } from "@/lib/received-age";

/**
 * « Reçus depuis plus de N jours » above the bench's lists (lot 3B, G5 —
 * 2.20 (k), answered « Oui » on 28/10). A plain GET form: the filter lives in
 * the address (`?recus=N`), next to the tile's view, so a filtered bench can
 * be reloaded or shared, and works without JavaScript. Server-rendered.
 */
export function ReceivedAgeFilter({
  path,
  view,
  days,
  anchor,
}: {
  path: string;
  /** The tile's view (`?vue=`), kept when the filter changes. */
  view: string | null;
  /** The filter in force; null = every sample. */
  days: number | null;
  anchor: string;
}) {
  return (
    <form
      method="get"
      action={`${path}#${anchor}`}
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm shadow-sm"
    >
      {view && <input type="hidden" name="vue" value={view} />}
      <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <label htmlFor="recus" className="font-medium text-slate-700">
        Reçus depuis plus de
      </label>
      <input
        id="recus"
        name={RECEIVED_AGE_PARAM}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_RECEIVED_AGE}
        step={1}
        required
        defaultValue={days ?? ""}
        placeholder="N"
        className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <span className="text-slate-700">jours</span>
      <button
        type="submit"
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Filtrer
      </button>
      {days !== null && (
        <>
          <span role="status" className="inline-flex items-center rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
            Filtre : {receivedAgeLabel(days)}
          </span>
          <Link
            href={receivedAgeHref(path, view, null, anchor)}
            className="rounded font-medium text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Tout afficher
          </Link>
        </>
      )}
      <span className="basis-full text-xs text-slate-500 sm:basis-auto">Jours calendaires, à l&apos;heure du laboratoire.</span>
    </form>
  );
}
