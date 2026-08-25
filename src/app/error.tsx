"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * What the laboratory sees when something goes wrong.
 *
 * Never a stack trace: the message stays calm and in French, and the details
 * are logged for us. A technician mid-analysis needs a way forward, not a
 * diagnosis.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-100">
          <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          Une erreur est survenue
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          L&apos;opération n&apos;a pas pu aboutir. Vos données enregistrées ne
          sont pas affectées — vous pouvez réessayer.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-400">
            Référence : {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </button>
      </div>
    </div>
  );
}
