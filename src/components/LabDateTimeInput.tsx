"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { deviceDriftMinutes, fieldDisplayWall, fieldLegalWall, legalClock } from "@/lib/device-time";
import { toLabWallTime } from "@/lib/lab-time";

/**
 * The one date-time field of the application (RETOUR-LABO-06-10.md §8.1,
 * retour du 08/10).
 *
 * `value` and `onChange` speak the LEGAL wall time ("2026-10-08T18:06", or
 * ""), like the rest of the form and the server. On a device that missed
 * Morocco's return to GMT (20/09/2026) the field shows and reads the
 * DEVICE's hour — the one its user reads on the screen and types — and
 * converts it: « = 18:06 heure légale ». On an up-to-date device nothing is
 * converted and the hint gives the legal time.
 *
 * The drift is read with `useSyncExternalStore`: 0 on the server and during
 * hydration, the device's real drift right after, so the markup never
 * disagrees. The parent renders the <label htmlFor={id}>.
 */

const TICK_MS = 30_000;

function subscribeClock(onChange: () => void) {
  const handle = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(handle);
}

const driftSnapshot = () => deviceDriftMinutes(new Date());
const clockSnapshot = () => legalClock(new Date());
const serverDrift = () => 0;
const serverClock = () => "";

/**
 * The device's drift (minutes ahead of the legal clock, 0 on an up-to-date
 * device or on the server) and the legal "HH:MM" ("" on the server).
 */
export function useDeviceClock(): { drift: number; legalNow: string } {
  const drift = useSyncExternalStore(subscribeClock, driftSnapshot, serverDrift);
  const legalNow = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  return { drift, legalNow };
}

/** « d'1 h », « de 2 h », « de 30 min ». */
export function driftAmount(drift: number): string {
  const minutes = Math.abs(drift);
  if (minutes % 60 !== 0) return `de ${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? "d'1 h" : `de ${hours} h`;
}

/** "08/10 23:30" from "2026-10-08T23:30". */
function dayTime(wall: string) {
  return `${wall.slice(8, 10)}/${wall.slice(5, 7)} ${wall.slice(11, 16)}`;
}

export type LabDateTimeInputProps = {
  id: string;
  /** The LEGAL wall time, "YYYY-MM-DDTHH:mm", or "". */
  value: string;
  /** Called with the LEGAL wall time ("" when the field is cleared). */
  onChange: (legalWall: string) => void;
  required?: boolean;
  /** A « Maintenant » button (true) or the same button with another label. */
  nowButton?: boolean | string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  /** The line under the field (legal time, or the device's drift). Default true. */
  hint?: boolean;
  /** The id of the error shown under the field by the parent, when there is
   *  one: the input is then marked invalid and described by it. */
  errorId?: string;
};

export function LabDateTimeInput({
  id,
  value,
  onChange,
  required,
  nowButton,
  className = "",
  inputClassName = "input-field px-4",
  disabled,
  hint = true,
  errorId,
}: LabDateTimeInputProps) {
  const { drift, legalNow } = useDeviceClock();
  // The drift of the value's own date: a September date was right on the device.
  const shown = fieldDisplayWall(value, drift);
  const change = (deviceWall: string) => onChange(fieldLegalWall(deviceWall, drift));

  const hintId = `${id}-hint`;
  const showHint = hint && legalNow !== "";
  const nowLabel = typeof nowButton === "string" ? nowButton : "Maintenant";
  const describedBy = [errorId, showHint ? hintId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <div className={nowButton ? "flex gap-2" : undefined}>
        <input
          id={id}
          type="datetime-local"
          value={shown}
          onChange={(e) => change(e.target.value)}
          required={required}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={errorId ? true : undefined}
          className={inputClassName}
        />
        {nowButton && (
          <button
            type="button"
            onClick={() => onChange(toLabWallTime(new Date()))}
            disabled={disabled}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {nowLabel}
          </button>
        )}
      </div>
      {showHint &&
        (drift === 0 ? (
          <p id={hintId} className="mt-1 text-xs text-slate-500">
            Heure légale (GMT) : <b className="font-semibold">{legalNow}</b>
          </p>
        ) : (
          <p id={hintId} className="mt-1 flex items-start gap-1.5 text-xs text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Cet appareil {drift > 0 ? "avance" : "retarde"} {driftAmount(drift)} sur l&apos;heure légale du Maroc
              (GMT depuis le 20/09/2026) : tapez l&apos;heure qu&apos;il affiche, elle est convertie
              {value ? (
                <>
                  {" "}(
                  <b className="font-semibold">
                    = {shown.slice(0, 10) === value.slice(0, 10) ? value.slice(11, 16) : dayTime(value)} heure légale
                  </b>
                  ).
                </>
              ) : (
                "."
              )}
            </span>
          </p>
        ))}
    </div>
  );
}
