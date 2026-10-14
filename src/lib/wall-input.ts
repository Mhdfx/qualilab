/**
 * What is typed in the laboratory's date-time field (`LabDateTimeInput`),
 * read without the device's language (retour du laboratoire du 14/10 :
 * « Remarque globale sur la date AM/PM par 24h »).
 *
 * The native `datetime-local` was drawn in the browser's or the system's
 * language, not the page's: on a PC or a phone set to English it showed
 * « mm/dd/yyyy, hh:mm AM/PM ». The field is now two masked texts, the day
 * « JJ/MM/AAAA » and the hour « HH:MM » on 24 h, and everything they need
 * lives here, pure: the masks applied while typing, the reading of each
 * part, and the joining into the wall time "YYYY-MM-DDTHH:mm" that the
 * forms, `device-time.ts` and the server speak.
 *
 * Each part reads as empty, partial (the start of a value: wait for the
 * rest), invalid (no further keystroke can save it: say so at once) or
 * valid. Nothing is reinterpreted behind the user's back: « 24:00 » is
 * refused, never turned into 02:40; « 31/04 » is refused, never moved to
 * 01/05; « 2:30 PM » is refused, never read as 02:30.
 *
 * A valid reading reaches the form while the user types only once both
 * texts are written out in full (`wallToSend`); a shorter one (« 9:5 »,
 * « 1/2/2026 ») is written out and sent when the part is left.
 */

export const DAY_PLACEHOLDER = "JJ/MM/AAAA";
export const TIME_PLACEHOLDER = "HH:MM";

/**
 * The years a typed day may carry. Every date of the field is a sampling,
 * an arrival, an agreement or a promised delay of today's laboratory: a
 * slip of the finger (« 1026 », « 2206 ») is refused rather than stored.
 */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2099;

export const DAY_INVALID = "Date invalide (JJ/MM/AAAA)";
export const TIME_INVALID = "Heure invalide (00:00 à 23:59)";
export const DAY_MISSING = "Date manquante (JJ/MM/AAAA)";
export const TIME_MISSING = "Heure manquante (HH:MM)";
/** An hour typed with « AM » / « PM » (a habit of the old English field): refused, never converted. */
export const TIME_TWELVE_HOUR = "Heure sur 24 h, sans AM/PM (ex. 14:30)";

/**
 * One part of the field: the day ("YYYY-MM-DD" when valid) or the hour
 * ("HH:MM"). `twelveHour`: an hour refused for its « AM » / « PM ».
 */
export type PartReading =
  | { state: "empty" }
  | { state: "partial" }
  | { state: "invalid"; twelveHour?: true }
  | { state: "valid"; value: string };

/** Both parts together: nothing typed, a full wall time, or something in between. */
export type WallReading = { day: PartReading; time: PartReading } & (
  | { state: "empty" }
  | { state: "complete"; wall: string }
  | { state: "incomplete" }
);

const EMPTY: PartReading = { state: "empty" };
const PARTIAL: PartReading = { state: "partial" };
const INVALID: PartReading = { state: "invalid" };
const TWELVE_HOUR: PartReading = { state: "invalid", twelveHour: true };

/** An « a » or a « p » in an hour: the start of « AM » / « PM ». */
const hasMeridiem = (text: string) => /[ap]/i.test(text);

const pad2 = (n: number) => String(n).padStart(2, "0");
const isDigit = (ch: string) => ch >= "0" && ch <= "9";

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Days in a month of the Gregorian calendar (February: 29 on a leap year). */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

const isRealDay = (year: number, month: number, day: number) =>
  month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

/** Separators a user may type between day, month and year; shown as « / ». */
const DAY_SEPARATORS = "/-. ";
/** Separators a user may type between hours and minutes (« 9h30 », « 9.30 »); shown as « : ». */
const TIME_SEPARATORS = ":hH.";

/**
 * Whether a field of the day is complete, so that the next digit starts
 * the following one. Two digits always; one digit when no two-digit
 * sequel exists: a day starting with 4–9, a month starting with 2–9.
 */
function dayFieldFull(text: string, index: number): boolean {
  if (index === 2) return text.length === 4;
  if (text.length === 2) return true;
  return text.length === 1 && text >= (index === 0 ? "4" : "2");
}

/**
 * The day part as the field shows it while typing: digits only, « / »
 * inserted when a field is complete and the next digit arrives (never on
 * the last digit of a field, so that Backspace is not caught by a slash
 * that comes back). Typed separators close a field early (« 1/2/2026 »).
 * A pasted ISO day (« 2026-10-14 ») is turned around; extra digits are
 * dropped.
 *   « 14102026 » → « 14/10/2026 » · « 141 » → « 14/1 » · « 4102026 » → « 4/10/2026 »
 */
export function maskDayText(raw: string): string {
  const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const fields = [""];
  for (const ch of raw) {
    const last = fields.length - 1;
    if (isDigit(ch)) {
      if (!dayFieldFull(fields[last], last)) fields[last] += ch;
      else if (last < 2) fields.push(ch);
    } else if (DAY_SEPARATORS.includes(ch) && last < 2 && fields[last] !== "") {
      fields.push("");
    }
  }
  return fields.join("/");
}

/**
 * The hour part as the field shows it while typing, on 24 h: « : »
 * inserted when the minutes start — after two digits of hours, or after
 * one when it is 3–9 (no hour 30–99). « h » and « . » typed by habit
 * become « : »; other letters and extra digits are dropped — except an
 * « a » or a « p » (« 2:30 PM »): the text is then kept as typed, for
 * parseTimeText to refuse, since dropping the « PM » would read 14:30 as
 * 02:30.
 *   « 905 » → « 9:05 » · « 1230 » → « 12:30 » · « 2400 » → « 24:00 » (refused by parseTimeText)
 */
export function maskTimeText(raw: string): string {
  if (hasMeridiem(raw)) return raw;
  let hours = "";
  let minutes = "";
  let split = false;
  for (const ch of raw) {
    if (isDigit(ch)) {
      if (!split && (hours.length === 2 || (hours.length === 1 && hours >= "3"))) split = true;
      if (!split) hours += ch;
      else if (minutes.length < 2) minutes += ch;
    } else if (TIME_SEPARATORS.includes(ch) && !split && hours !== "") {
      split = true;
    }
  }
  return split ? `${hours}:${minutes}` : hours;
}

/**
 * The values a field of the day may still take. `prefix` undefined: the
 * field is not reached yet (anything). `closed`: a separator follows it,
 * so it is exactly what is written. Otherwise what is written, or any
 * value it begins (« 3 » → 3, 30, 31 for a day).
 */
function candidates(prefix: string | undefined, closed: boolean, width: number, low: number, high: number): number[] {
  const values: number[] = [];
  for (let n = low; n <= high; n += 1) {
    if (prefix === undefined || prefix === "") values.push(n);
    else if (closed || prefix.length === width) {
      if (Number(prefix) === n) values.push(n);
    } else if (String(n) === prefix || String(n).padStart(width, "0").startsWith(prefix)) {
      values.push(n);
    }
  }
  return values;
}

/** Whether an unfinished day can still become a real one between MIN_YEAR and MAX_YEAR. */
function dayCanComplete(day: string, month: string | undefined, year: string | undefined): boolean {
  const days = candidates(day, month !== undefined, 2, 1, 31);
  const months = candidates(month, year !== undefined, 2, 1, 12);
  const years = candidates(year, false, 4, MIN_YEAR, MAX_YEAR);
  if (days.length === 0) return false;
  const smallestDay = Math.min(...days);
  return months.some((m) => years.some((y) => daysInMonth(y, m) >= smallestDay));
}

/**
 * Reads the day part, as the field shows it (`maskDayText` first, so a
 * pasted « 14102026 » or « 2026-10-14 » reads too). Valid: a real calendar
 * day between MIN_YEAR and MAX_YEAR, value "YYYY-MM-DD"; « 1/2/2026 » is
 * the 1st of February. 29/02 only on a leap year.
 */
export function parseDayText(text: string): PartReading {
  const masked = maskDayText(text);
  if (masked === "") return EMPTY;
  const [day, month, year] = masked.split("/");
  if (year !== undefined && year.length === 4) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    return y >= MIN_YEAR && y <= MAX_YEAR && isRealDay(y, m, d)
      ? { state: "valid", value: `${year}-${pad2(m)}-${pad2(d)}` }
      : INVALID;
  }
  return dayCanComplete(day, month, year) ? PARTIAL : INVALID;
}

/**
 * Reads the hour part, as the field shows it (`maskTimeText` first).
 * Valid: 00:00 to 23:59, value "HH:MM"; one digit of hours or of minutes
 * is completed with a zero (« 9:5 » and « 905 » → 09:05). Hours alone
 * (« 9 », « 12 ») wait for the minutes; hours above 23 can never be right,
 * nor can an hour with « AM » / « PM » (`twelveHour`).
 */
export function parseTimeText(text: string): PartReading {
  const masked = maskTimeText(text);
  if (hasMeridiem(masked)) return TWELVE_HOUR;
  if (masked === "") return EMPTY;
  const [hours, minutes] = masked.split(":");
  if (Number(hours) > 23) return INVALID;
  if (minutes === undefined || minutes === "") return PARTIAL;
  if (Number(minutes) > 59) return INVALID;
  return { state: "valid", value: `${pad2(Number(hours))}:${pad2(Number(minutes))}` };
}

/** « 14/10/2026 » from "2026-10-14"; "" for anything that is not a real day. */
export function formatDay(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return "";
  const [, year, month, day] = match;
  return isRealDay(Number(year), Number(month), Number(day)) ? `${day}/${month}/${year}` : "";
}

/** « 09:05 » from "09:05"; "" for anything that is not an hour of the day on 24 h. */
export function formatTime(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return match && Number(match[1]) <= 23 && Number(match[2]) <= 59 ? hhmm : "";
}

/**
 * The two texts the field shows for a wall time "YYYY-MM-DDTHH:mm"
 * (seconds, if any, are not shown). Both empty for "" or an unreadable
 * value — as the native field showed nothing for one.
 */
export function splitWall(wall: string): { day: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(wall);
  const day = match ? formatDay(match[1]) : "";
  const time = match ? formatTime(match[2]) : "";
  return day && time ? { day, time } : { day: "", time: "" };
}

/** The wall time "YYYY-MM-DDTHH:mm" of a valid day and hour; "" when either is not. */
export function combineWall(isoDay: string, hhmm: string): string {
  return formatDay(isoDay) && formatTime(hhmm) ? `${isoDay}T${hhmm}` : "";
}

/**
 * Both texts of the field read together. Only `complete` carries a wall
 * time; `empty` (both parts cleared) means "no value"; anything else is
 * `incomplete` and must not reach the form.
 */
export function readWallParts(dayText: string, timeText: string): WallReading {
  const day = parseDayText(dayText);
  const time = parseTimeText(timeText);
  if (day.state === "empty" && time.state === "empty") return { state: "empty", day, time };
  if (day.state === "valid" && time.state === "valid") {
    return { state: "complete", wall: combineWall(day.value, time.value), day, time };
  }
  return { state: "incomplete", day, time };
}

/** The day as written out once its part is left: « 1/2/2026 » → « 01/02/2026 »; anything else unchanged. */
export function settleDayText(text: string): string {
  const day = parseDayText(text);
  return day.state === "valid" ? formatDay(day.value) : text;
}

/** The hour as written out once its part is left: « 9:5 » → « 09:05 »; anything else unchanged. */
export function settleTimeText(text: string): string {
  const time = parseTimeText(text);
  return time.state === "valid" ? time.value : text;
}

/**
 * Whether both texts are valid and written out in full, as the field shows
 * a value it holds: « 14/10/2026 » and « 09:05 », not « 14/1/2026 » or
 * « 14:7 ». A shorter text is valid but may be the start of another
 * entry — « 14:7 » on the way to « 14:75 », « 14/1/2026 » to
 * « 14/13/2026 », « 09:3 » left by Backspace on the way to « 09: » —, so
 * it is not sent while the user types. A text in full cannot grow (the
 * masks drop extra digits): the next keystroke can only shorten it.
 */
export function writtenInFull(dayText: string, timeText: string): boolean {
  const day = parseDayText(dayText);
  const time = parseTimeText(timeText);
  return day.state === "valid" && time.state === "valid" && dayText === formatDay(day.value) && timeText === time.value;
}

/**
 * What the field sends to the form for its two texts: the wall time once
 * both are written out in full, "" once both are cleared, null otherwise
 * — the form then keeps the value it had (`keptValueNotice`), never a
 * time read halfway through an edit. A short form (« 9:5 », « 1/2/2026 »)
 * is sent once its part is left: `settleDayText` / `settleTimeText` first.
 */
export function wallToSend(dayText: string, timeText: string): string | null {
  const reading = readWallParts(dayText, timeText);
  if (reading.state === "empty") return "";
  return reading.state === "complete" && writtenInFull(dayText, timeText) ? reading.wall : null;
}

/**
 * The message under one part of the field, or null. Shown when it helps,
 * never while the user is still typing it:
 * - invalid (« 31/04/2026 », « 24 », « 2:30 PM »): at once — no keystroke can save it;
 * - partial (« 14/10/20 », « 9: »): once the user has left that part;
 * - empty while the other part is filled: once the user has left the field.
 * `focus.part`: this part has the focus; `focus.group`: anything of the field has.
 */
export function partMessage(
  part: "day" | "time",
  reading: PartReading,
  other: PartReading,
  focus: { part: boolean; group: boolean }
): string | null {
  const invalid = part === "day" ? DAY_INVALID : TIME_INVALID;
  if (reading.state === "invalid") return reading.twelveHour ? TIME_TWELVE_HOUR : invalid;
  if (reading.state === "partial") return focus.part ? null : invalid;
  if (reading.state === "empty" && other.state !== "empty" && !focus.group) {
    return part === "day" ? DAY_MISSING : TIME_MISSING;
  }
  return null;
}

/** Every message, whatever has the focus: what a form's own validation must refuse. */
export const UNFOCUSED = { part: false, group: false } as const;

/**
 * Under an unfinished entry, what the form still holds (the device-clock
 * wall time the field showed last): an incomplete entry is never sent, so
 * the user knows what « Enregistrer » would save.
 */
export function keptValueNotice(shownWall: string): string {
  const { day, time } = splitWall(shownWall);
  return day ? `Saisie non retenue : le champ garde le ${day} à ${time}.` : "Saisie non retenue : le champ reste vide.";
}

/**
 * Where the caret goes once a mask has rewritten the text: after as many
 * digits as stood before it in what was typed — and after a separator the
 * user has just typed (« 9h » → « 9:| »).
 */
export function caretAfterMask(raw: string, caret: number, masked: string): number {
  const before = raw.slice(0, caret);
  const digits = before.replace(/\D/g, "").length;
  if (digits === 0) return 0;
  let seen = 0;
  for (let index = 0; index < masked.length; index += 1) {
    if (!isDigit(masked[index])) continue;
    seen += 1;
    if (seen < digits) continue;
    const typedSeparator = before.length > 0 && !isDigit(before[before.length - 1]);
    const next = masked[index + 1];
    return typedSeparator && next !== undefined && !isDigit(next) ? index + 2 : index + 1;
  }
  return masked.length;
}
