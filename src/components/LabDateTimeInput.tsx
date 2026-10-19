"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { AlertTriangle, CalendarDays, Clock } from "lucide-react";
import { deviceDriftMinutes, fieldDisplayWall, fieldLegalWall, legalClock } from "@/lib/device-time";
import { toLabWallTime } from "@/lib/lab-time";
import {
  DAY_INVALID,
  DAY_PLACEHOLDER,
  MAX_YEAR,
  MIN_YEAR,
  TIME_INVALID,
  TIME_PLACEHOLDER,
  UNFOCUSED,
  caretAfterMask,
  formatDay,
  keptValueNotice,
  maskDayText,
  maskTimeText,
  partMessage,
  readWallParts,
  settleDayText,
  settleTimeText,
  splitWall,
  wallToSend,
} from "@/lib/wall-input";

/**
 * The one date-time field of the application (RETOUR-LABO-06-10.md §8.1,
 * retours du 08/10 et du 14/10).
 *
 * `value` and `onChange` speak the LEGAL wall time ("2026-10-08T18:06", or
 * ""), like the rest of the form and the server. On a device that missed
 * Morocco's return to GMT (20/09/2026) the field shows and reads the
 * DEVICE's hour — the one its user reads on the screen and types — and
 * converts it: « = 18:06 heure légale ». On an up-to-date device nothing is
 * converted and the hint gives the legal time.
 *
 * Two masked texts, not a native datetime-local: the browser drew that one
 * in the device's language — « mm/dd/yyyy, hh:mm AM/PM » on a PC or a phone
 * set to English (retour du 14/10). The day is typed « JJ/MM/AAAA » (the
 * calendar button opens the browser's own date picker where it has one),
 * the hour « HH:MM » on 24 h, and `wall-input.ts` reads them. Only a
 * complete, real wall time reaches `onChange` — or "" once both parts are
 * cleared —, while typing only once both texts are written out in full
 * (`wallToSend`), else when the part is left; while a part is unfinished
 * the form keeps its value and the field says so under it. No caller is a
 * <form>: its validation asks `dateTimePending(id)` before reading the
 * value, and refuses while the entry is unfinished.
 *
 * The drift is read with `useSyncExternalStore`: 0 on the server and during
 * hydration, the device's real drift right after, so the markup never
 * disagrees. The parent renders the <label htmlFor={id}>: it names the day
 * part, the group of both parts, and the hour part with « Heure, sur 24 h ».
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

/**
 * Whether the browser opens its date picker on demand (`showPicker()`):
 * every current one. Assumed on the server, so the calendar button does
 * not pop in after hydration; checked on the device.
 */
const subscribeNothing = () => () => {};
const pickerSnapshot = () => typeof HTMLInputElement.prototype.showPicker === "function";
const pickerServer = () => true;

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

/** The ids, space-separated, for an aria-describedby; undefined when none. */
function idList(...ids: (string | false | null | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

/** The hour part of the field `id` (the day part is `id` itself). */
const timeInputId = (id: string) => `${id}-time`;

/**
 * The message of an unfinished or invalid entry in the field `id` (« Heure
 * invalide (00:00 à 23:59) », « Date manquante (JJ/MM/AAAA) »…), or null.
 * The form keeps its last value while the entry is unfinished, and no caller
 * is a <form>, so the custom validity alone blocks nothing: every
 * validation asks this first, before reading or checking the value, and
 * refuses with the message. The first part concerned gets the focus.
 * Never the browser's « champ obligatoire »: an empty field is the form's
 * own rule. A disabled field is skipped — it could not be corrected.
 * Client side, at the moment of the check.
 */
export function dateTimePending(id: string): string | null {
  if (typeof document === "undefined") return null;
  for (const [partId, fallback] of [
    [id, DAY_INVALID],
    [timeInputId(id), TIME_INVALID],
  ] as const) {
    const input = document.getElementById(partId);
    if (!(input instanceof HTMLInputElement) || input.disabled || !input.validity.customError) continue;
    input.focus();
    return input.validationMessage || fallback;
  }
  return null;
}

/**
 * The texts on screen (device clock), with the LEGAL value and the drift
 * they were drawn from: when either changes from outside, the texts follow.
 */
type Draft = { day: string; time: string; source: string; drift: number };

function draftOf(value: string, drift: number): Draft {
  return { ...splitWall(fieldDisplayWall(value, drift)), source: value, drift };
}

/** Which part of the field has the focus ("group": its buttons). */
type Focus = "day" | "time" | "group" | null;

/**
 * Runs a mask on what was just typed and writes the result back into the
 * input with the caret where the user expects it. Written before React
 * renders the same text, so React leaves the input — and the caret — alone.
 */
function applyMask(input: HTMLInputElement, mask: (raw: string) => string): string {
  const raw = input.value;
  const text = mask(raw);
  if (text !== raw) {
    const caret = caretAfterMask(raw, input.selectionStart ?? raw.length, text);
    input.value = text;
    input.setSelectionRange(caret, caret);
  }
  return text;
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
  /** The id of a hint the parent prints under the field (never an error):
   *  the field is described by it too. */
  describedBy?: string;
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
  describedBy,
}: LabDateTimeInputProps) {
  const { drift, legalNow } = useDeviceClock();
  const canPick = useSyncExternalStore(subscribeNothing, pickerSnapshot, pickerServer);
  const [stored, setStored] = useState(() => draftOf(value, drift));
  const [focus, setFocus] = useState<Focus>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  /** The hidden « Heure, sur 24 h » that follows the label in the hour part's name. */
  const timeNameId = `${id}-time-name`;

  // A value set from outside (« Maintenant », a form reset, a restored
  // draft) or the device's real drift once hydrated: the texts follow.
  // Adjusted while rendering, not in an effect, so no frame shows stale texts.
  let draft = stored;
  if (stored.source !== value || stored.drift !== drift) {
    draft = draftOf(value, drift);
    setStored(draft);
  }

  // The drift of the value's own date: a September date was right on the device.
  const shown = fieldDisplayWall(value, drift);
  const reading = readWallParts(draft.day, draft.time);
  const inGroup = focus !== null;
  const dayMessage = partMessage("day", reading.day, reading.time, { part: focus === "day", group: inGroup });
  const timeMessage = partMessage("time", reading.time, reading.day, { part: focus === "time", group: inGroup });
  // What the form's validation refuses (`dateTimePending`) — and, in a
  // <form>, what blocks the submission, as the native field's did.
  const dayValidity = partMessage("day", reading.day, reading.time, UNFOCUSED) ?? "";
  const timeValidity = partMessage("time", reading.time, reading.day, UNFOCUSED) ?? "";

  useEffect(() => {
    dayRef.current?.setCustomValidity(dayValidity);
    timeRef.current?.setCustomValidity(timeValidity);
  }, [dayValidity, timeValidity]);

  // The parent's <label htmlFor={id}> also names the group, so a screen
  // reader announces the field before « Heure », and the hour part itself
  // (« Heure de fin Heure, sur 24 h »): a list of the form's fields shows
  // each input by its own name only. The callers' labels carry no id: one
  // is given. After every render: a parent may redraw its label. Without a
  // label the hour keeps its aria-label.
  useEffect(() => {
    const group = groupRef.current;
    const time = timeRef.current;
    if (!group) return;
    const label = dayRef.current?.labels?.[0];
    if (!label) {
      group.removeAttribute("aria-labelledby");
      time?.removeAttribute("aria-labelledby");
      return;
    }
    if (!label.id) label.setAttribute("id", `${id}-label`);
    group.setAttribute("aria-labelledby", label.id);
    time?.setAttribute("aria-labelledby", `${label.id} ${timeNameId}`);
  });

  /**
   * Keeps the texts as typed; sends a wall time (legal) once both texts
   * are written out in full, or "" once both are cleared — never a value
   * read halfway through an edit (« 14:7 » on the way to « 14:75 »).
   */
  const write = (day: string, time: string) => {
    const wall = wallToSend(day, time);
    const source = wall === null ? draft.source : wall && fieldLegalWall(wall, drift);
    setStored({ day, time, source, drift });
    if (wall !== null && source !== value) onChange(source);
  };

  const typeDay = (event: ChangeEvent<HTMLInputElement>) => write(applyMask(event.currentTarget, maskDayText), draft.time);
  const typeTime = (event: ChangeEvent<HTMLInputElement>) => write(draft.day, applyMask(event.currentTarget, maskTimeText));

  // Once a part is left, its text is written out in full and sent: « 1/2/2026 » → « 01/02/2026 »,
  // « 9:5 » → « 09:05 ». Blur comes before the click of « Enregistrer », so the form has it in time.
  const settleDay = () => {
    const text = settleDayText(draft.day);
    if (text !== draft.day) write(text, draft.time);
  };
  const settleTime = () => {
    const text = settleTimeText(draft.time);
    if (text !== draft.time) write(draft.day, text);
  };

  const openPicker = () => {
    try {
      pickerRef.current?.showPicker();
    } catch {
      // No picker in this context (a sandboxed frame, a refused gesture): the day is still typed.
      dayRef.current?.focus();
    }
  };
  // The calendar button is out of the tab order — Tab goes from the day to
  // the hour, as fast typing expects; from the keyboard, Alt+↓ opens it.
  const pickerKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!canPick || !event.altKey || event.key !== "ArrowDown") return;
    event.preventDefault();
    openPicker();
  };
  const pickDay = (event: ChangeEvent<HTMLInputElement>) => {
    const iso = event.currentTarget.value;
    write(iso ? formatDay(iso) : "", draft.time);
  };

  const setNow = () => {
    const legal = toLabWallTime(new Date());
    setStored(draftOf(legal, drift));
    onChange(legal);
  };

  const enter = (event: FocusEvent<HTMLDivElement>) =>
    setFocus(event.target === dayRef.current ? "day" : event.target === timeRef.current ? "time" : "group");
  const leave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocus(null);
  };

  const hintId = `${id}-hint`;
  const dayErrorId = `${id}-day-error`;
  const timeErrorId = `${id}-time-error`;
  const showHint = hint && legalNow !== "";
  const nowLabel = typeof nowButton === "string" ? nowButton : "Maintenant";
  const hintRef = showHint ? hintId : undefined;
  const pickerValue = reading.day.state === "valid" ? reading.day.value : "";
  // whole class names, so Tailwind's scanner sees them
  const partClass = (message: string | null) =>
    [inputClassName, "tabular-nums", message ? "ring-2 ring-rose-300" : ""].filter(Boolean).join(" ");

  return (
    <div
      ref={groupRef}
      role="group"
      aria-describedby={idList(errorId, describedBy, hintRef)}
      onFocus={enter}
      onBlur={leave}
      className={className}
    >
      {/* day and hour share the row; « Maintenant » wraps under them on a narrow column */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[9.5rem] flex-[2_1_9.5rem]">
          <input
            ref={dayRef}
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder={DAY_PLACEHOLDER}
            value={draft.day}
            onChange={typeDay}
            onBlur={settleDay}
            onKeyDown={pickerKey}
            aria-keyshortcuts={canPick ? "Alt+ArrowDown" : undefined}
            required={required}
            disabled={disabled}
            aria-invalid={errorId || dayMessage ? true : undefined}
            aria-describedby={idList(dayMessage && dayErrorId, errorId, describedBy, hintRef)}
            className={partClass(dayMessage)}
            style={canPick ? { paddingRight: "2.75rem" } : undefined}
          />
          {canPick && (
            <>
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                tabIndex={-1}
                aria-label="Choisir la date dans le calendrier"
                title="Choisir la date dans le calendrier (Alt+↓ depuis la date)"
                className="absolute inset-y-0 right-0 inline-flex min-h-[44px] w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </button>
              {/* The browser's date picker, opened by the button: rendered (an
                  input without a box has no picker) but invisible, out of the
                  tab order and of the accessibility tree. */}
              <input
                ref={pickerRef}
                type="date"
                tabIndex={-1}
                aria-hidden="true"
                value={pickerValue}
                min={`${MIN_YEAR}-01-01`}
                max={`${MAX_YEAR}-12-31`}
                onChange={pickDay}
                disabled={disabled}
                className="pointer-events-none absolute bottom-0 left-0 h-px w-full opacity-0"
              />
            </>
          )}
        </div>
        <div className="min-w-[5.5rem] flex-[1_1_5.5rem]">
          {/* Named by the label + this text once the label is found; the aria-label is the fallback. */}
          <span id={timeNameId} hidden>
            Heure, sur 24 h
          </span>
          <input
            ref={timeRef}
            id={timeInputId(id)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder={TIME_PLACEHOLDER}
            aria-label="Heure, sur 24 h"
            value={draft.time}
            onChange={typeTime}
            onBlur={settleTime}
            required={required}
            disabled={disabled}
            aria-invalid={errorId || timeMessage ? true : undefined}
            aria-describedby={idList(timeMessage && timeErrorId, errorId, describedBy, hintRef)}
            className={partClass(timeMessage)}
          />
        </div>
        {nowButton && (
          <button
            type="button"
            onClick={setNow}
            disabled={disabled}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {nowLabel}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {dayMessage && (
          <p id={dayErrorId} className="mt-1 text-xs font-medium text-rose-700">
            {dayMessage}
          </p>
        )}
        {timeMessage && (
          <p id={timeErrorId} className="mt-1 text-xs font-medium text-rose-700">
            {timeMessage}
          </p>
        )}
        {(dayMessage || timeMessage) && <p className="mt-0.5 text-xs text-slate-600">{keptValueNotice(shown)}</p>}
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
              {/* one string: the compiled JSX dropped the space after {driftAmount(drift)} (« d'1 hsur ») */}
              {`Cet appareil ${drift > 0 ? "avance" : "retarde"} ${driftAmount(drift)} sur l'heure légale du Maroc (GMT depuis le 20/09/2026) : tapez l'heure qu'il affiche, elle est convertie`}
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
