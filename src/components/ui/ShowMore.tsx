import Link from "@/components/ui/AppLink";
import { ChevronDown } from "lucide-react";
import { showMoreLabel } from "@/lib/render-cap";

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/**
 * Under a list drawn in steps (`lib/render-cap.ts`): how many rows are shown
 * out of the whole list, and « Afficher les N suivants ». A server list gives
 * the address of the next step (`href`), a client list its handler
 * (`onMore`). Render it only while rows are left out. Server- and client-safe.
 */
export function ShowMore({
  shown,
  total,
  href,
  onMore,
}: {
  shown: number;
  total: number;
  href?: string;
  onMore?: () => void;
}) {
  const hidden = total - shown;
  if (hidden <= 0) return null;
  const label = showMoreLabel(hidden);
  return (
    <div className="mt-4 flex flex-col items-center gap-2 text-sm text-slate-500 sm:flex-row sm:justify-center sm:gap-4">
      <span role="status">
        Affichés : {shown} sur {total}.
      </span>
      {href ? (
        <Link href={href} scroll={false} className={BUTTON}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          {label}
        </Link>
      ) : (
        <button type="button" onClick={onMore} className={BUTTON}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      )}
    </div>
  );
}
