import type { LimitKind } from "@/generated/prisma/enums";

/**
 * The quick-entry buttons under each reading of the bench (lot 3B, G1 — the
 * re-ask of 18/10, 2.20 (g), answered « Oui » on 28/10 with « Indénombrable »
 * struck out): the notations a technician types all day, one click each.
 * Pure, so the screen and the tests read the same list and the same
 * insertion.
 *
 * - A whole reading (« < 10 », « Absence », « Présence ») replaces what the
 *   field holds: it is the answer, not a part of one.
 * - A piece (« > », « .10² » … « .10⁶ ») goes in at the cursor: « 3 » then
 *   « .10⁵ » gives « 3.10⁵ », « > » then « 3.10⁵ » gives « > 3.10⁵ » — the
 *   notations the bench already reads (`parseLabValue`, `parseUnitReading`).
 * - No « Indénombrable » button (struck out by the laboratory): the word
 *   typed is still accepted.
 */
export type QuickEntry = {
  /** What the button shows and inserts. */
  text: string;
  /** Replaces the whole field (a reading) or goes in at the cursor (a piece). */
  mode: "replace" | "insert";
  /** The button's accessible name. */
  label: string;
};

const BELOW: QuickEntry = { text: "< 10", mode: "replace", label: "Saisir « < 10 »" };
const ABOVE: QuickEntry = { text: "> ", mode: "insert", label: "Insérer « > » (plus de)" };
const POWERS: QuickEntry[] = (["²", "³", "⁴", "⁵", "⁶"] as const).map((sup) => ({
  text: `.10${sup}`,
  mode: "insert",
  label: `Insérer « .10${sup} »`,
}));
const ABSENCE: QuickEntry = { text: "Absence", mode: "replace", label: "Saisir « Absence »" };
const PRESENCE: QuickEntry = { text: "Présence", mode: "replace", label: "Saisir « Présence »" };

/**
 * The buttons of a line, by its plan (« selon le plan »): an absence test
 * (Salmonella, Listeria…) reads « Absence » / « Présence »; a count against
 * a criterion reads « < 10 », « > », the powers of ten; a line without
 * criterion may be either, so it gets both.
 */
export function quickEntries(plan: { mKind: LimitKind } | null | undefined): QuickEntry[] {
  if (plan?.mKind === "ABSENCE") return [ABSENCE, PRESENCE];
  if (plan) return [BELOW, ABOVE, ...POWERS];
  return [BELOW, ABOVE, ...POWERS, ABSENCE, PRESENCE];
}

/**
 * The field once a button is pressed, and where the cursor goes: a whole
 * reading replaces the field; a piece replaces the selection (or goes in at
 * the cursor). « > » never doubles its space nor stacks on another « > ».
 */
export function applyQuickEntry(
  current: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  entry: QuickEntry
): { value: string; caret: number } {
  if (entry.mode === "replace") return { value: entry.text, caret: entry.text.length };
  const length = current.length;
  const start = clamp(selectionStart ?? length, length);
  const end = Math.max(start, clamp(selectionEnd ?? start, length));
  let text = entry.text;
  if (text.trim() === ">") {
    // « > » leads the reading: at its head, once; the cursor stays where it was in the reading.
    const prefix = current.match(/^\s*>\s*/)?.[0].length ?? 0;
    const rest = current.slice(prefix);
    return { value: `> ${rest}`, caret: 2 + Math.max(0, start - prefix) };
  }
  let before = current.slice(0, start);
  let after = current.slice(end);
  // A power of ten follows the mantissa without a space.
  if (text.startsWith(".10")) {
    before = before.replace(/\s+$/, "");
    after = after.replace(/^\s+/, "");
    text = before.endsWith(".") ? text.slice(1) : text;
  }
  return { value: `${before}${text}${after}`, caret: before.length + text.length };
}

function clamp(position: number, length: number): number {
  return Math.min(Math.max(0, position), length);
}
