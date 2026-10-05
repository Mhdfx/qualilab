"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { labOffsetMinutes, toLabWallTime } from "@/lib/lab-time";

/**
 * The legal time next to a date-time field, and a warning when the device's
 * own clock disagrees with it.
 *
 * Morocco returned to GMT on 20 September 2026; a PC or phone that has not
 * received that update shows one hour more. The field is pre-filled with the
 * legal time, so the only way to get it wrong is to retype the hour one
 * reads on such a device — which the server then refuses as « in the
 * future ». Saying so here, before the refusal, saves the retry.
 */
export function LegalTimeHint({ className = "" }: { className?: string }) {
  const [state, setState] = useState<{ legal: string; device: string; driftMinutes: number } | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const legal = toLabWallTime(now).slice(11, 16);
      const device = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      // Device offset (what its zone data says) versus the laboratory's.
      const driftMinutes = -now.getTimezoneOffset() - labOffsetMinutes(now);
      setState({ legal, device, driftMinutes });
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const drifted = Math.abs(state.driftMinutes) >= 30;
  return (
    <p
      className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs ${drifted ? "text-amber-800" : "text-slate-500"} ${className}`}
      role={drifted ? "status" : undefined}
    >
      {drifted && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>
        Heure légale (GMT) : <b className="font-semibold">{state.legal}</b>
        {drifted && (
          <>
            {" "}
            — cet appareil affiche {state.device} : il {state.driftMinutes > 0 ? "avance" : "retarde"} de{" "}
            {Math.round(Math.abs(state.driftMinutes) / 60) || 1} h depuis le passage du Maroc à l&apos;heure GMT
            (20/09/2026). Gardez l&apos;heure proposée ; mettez l&apos;appareil à jour.
          </>
        )}
      </span>
    </p>
  );
}
