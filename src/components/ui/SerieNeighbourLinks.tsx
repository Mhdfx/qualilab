"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UNSAVED_CHANGES_MESSAGE } from "@/lib/serie-neighbours";
import { hasUnsavedChanges } from "@/components/ui/unsaved-changes";

type Target = { href: string; reference: string };

/**
 * « Échantillon précédent / suivant » in the série (lot 3B, G4, 2.20 (j)),
 * on the programme sheet and the bench sheet. Leaving a sheet with typing not
 * saved asks first (`useUnsavedChanges`): « Annuler » stays on the sheet.
 */
export function SerieNeighbourLinks({
  serialNumber,
  position,
  total,
  previous,
  next,
}: {
  serialNumber: string;
  position: number;
  total: number;
  previous: Target | null;
  next: Target | null;
}) {
  if (total < 2 || position === 0) return null;

  function guard(event: MouseEvent<HTMLAnchorElement>) {
    if (hasUnsavedChanges() && !window.confirm(UNSAVED_CHANGES_MESSAGE)) event.preventDefault();
  }

  const link =
    "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand/40 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";
  const absent = "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-400";

  return (
    <nav aria-label={`Échantillons de la série ${serialNumber}`} className="mb-5 flex flex-wrap items-center justify-between gap-2">
      {previous ? (
        <Link href={previous.href} onClick={guard} className={link} rel="prev">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Échantillon précédent
          <span className="font-mono text-xs text-slate-500">{previous.reference}</span>
        </Link>
      ) : (
        <span className={absent} aria-disabled="true">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Premier de la série
        </span>
      )}
      <span className="text-xs text-slate-500">
        Série <span className="font-mono">{serialNumber}</span> · {position} sur {total}
      </span>
      {next ? (
        <Link href={next.href} onClick={guard} className={link} rel="next">
          <span className="font-mono text-xs text-slate-500">{next.reference}</span>
          Échantillon suivant
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={absent} aria-disabled="true">
          Dernier de la série
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
