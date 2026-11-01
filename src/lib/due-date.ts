import type { Family } from "@/generated/prisma/enums";
import { fromLabWallTime, toLabWallTime } from "./lab-time";

/**
 * « À rendre le » proposée (RETOUR-LABO-28-10.md K5, Q8 : « avec vos délais,
 * la date à rendre le se remplit seule et reste modifiable »). Pure, shared
 * by /admin/reglages, its route and the programme sheet.
 *
 * One delay per domain of the sample's type d'analyse (Microbiologie,
 * Physico-chimie, Autre), and optionally one of the type d'analyse itself
 * (air, aliments, effet aseptisant…) that wins over its domain's — R-18 asks
 * the days « par type d'analyse », the answer may come either way. Counted
 * from the arrival at the laboratory, in working days (Monday to Friday) or
 * calendar days. The days themselves are an assumption — 5 working days in
 * microbiology, 7 in physico-chimistry, no type of its own — until the
 * laboratory gives its own (relance R-18): /admin/reglages changes them
 * without code, and an empty delay proposes nothing (the field stays empty,
 * as before). The proposal only fills an empty field of a programme
 * not yet confirmed; whoever programmes may change it or clear it.
 *
 * Public holidays are not counted (none is known to the software): a promise
 * falling on one is corrected by hand.
 */

export type DueDelays = {
  dueDaysMicro: number | null;
  dueDaysChimie: number | null;
  dueDaysAutre: number | null;
  /** True: calendar days; false or null: working days. */
  dueCalendarDays: boolean | null;
};

/** The assumption of 01/11 (R-18), the migration's defaults. */
export const DUE_DELAYS_DEFAULTS: DueDelays = { dueDaysMicro: 5, dueDaysChimie: 7, dueDaysAutre: null, dueCalendarDays: null };

export const DUE_DAYS_MAX = 120;

/** The setting of each domain, in the screens' order. */
export const DUE_DELAY_FIELDS: { key: "dueDaysMicro" | "dueDaysChimie" | "dueDaysAutre"; family: Family; label: string }[] = [
  { key: "dueDaysMicro", family: "MICRO", label: "Microbiologie" },
  { key: "dueDaysChimie", family: "CHIMIE", label: "Physico-chimie" },
  { key: "dueDaysAutre", family: "AUTRE", label: "Autres analyses" },
];

const validDays = (days: unknown): days is number => typeof days === "number" && Number.isInteger(days) && days > 0;

/**
 * The delay of a sample: its type d'analyse's own (`natureDays`) when set,
 * else its domain's, or null when none is set.
 */
export function dueDaysFor(family: Family, delays: DueDelays, natureDays?: number | null): number | null {
  if (validDays(natureDays)) return natureDays;
  const field = DUE_DELAY_FIELDS.find((f) => f.family === family);
  const days = field ? delays[field.key] : null;
  return validDays(days) ? days : null;
}

/** Saturday or Sunday of a wall-clock day « AAAA-MM-JJ ». */
function weekend(day: Date): boolean {
  const weekday = day.getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * `days` days after `from`, on the laboratory's clock, at the same wall time:
 * calendar days, or working days — Saturdays and Sundays are skipped and the
 * arrival day itself is never counted (an arrival on Friday with 1 working
 * day is due on Monday; on Saturday, also on Monday).
 */
export function addDueDays(from: Date, days: number, calendar: boolean): Date {
  const wall = toLabWallTime(from); // « AAAA-MM-JJTHH:mm »
  const [y, m, d] = wall.slice(0, 10).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (calendar) {
    day.setUTCDate(day.getUTCDate() + days);
  } else {
    let left = days;
    while (left > 0) {
      day.setUTCDate(day.getUTCDate() + 1);
      if (!weekend(day)) left -= 1;
    }
  }
  const iso = day.toISOString().slice(0, 10);
  return fromLabWallTime(`${iso}T${wall.slice(11, 16)}`) ?? new Date(from.getTime() + days * 86_400_000);
}

export type DueProposal = {
  /** The promised instant proposed, or null when nothing is proposed. */
  dueAt: Date | null;
  /** The delay applied, for the hint under the field. */
  days: number | null;
  calendar: boolean;
  /** Why nothing is proposed although a delay is set: the date is already past. */
  past: boolean;
};

/**
 * The proposal for one sample: its type d'analyse's delay, else its
 * domain's, from the arrival (else the reception). Nothing when no delay is set, when the sample has not
 * arrived, or when the date is already past (« jamais dans le passé », the
 * sheet's own rule — a late programme is promised by hand).
 */
export function proposeDueAt(
  input: { family: Family; arrivedAt: Date | null; receivedAt: Date | null; natureDueDays?: number | null },
  delays: DueDelays,
  now: Date
): DueProposal {
  const calendar = delays.dueCalendarDays === true;
  const days = dueDaysFor(input.family, delays, input.natureDueDays);
  const from = input.arrivedAt ?? input.receivedAt;
  if (days === null || !from) return { dueAt: null, days, calendar, past: false };
  const dueAt = addDueDays(from, days, calendar);
  if (dueAt.getTime() < now.getTime()) return { dueAt: null, days, calendar, past: true };
  return { dueAt, days, calendar, past: false };
}

/** « 5 jours ouvrés après l'arrivée » — the hint under the proposed date. */
export function dueHint(proposal: DueProposal): string | null {
  if (proposal.days === null) return null;
  const unit = proposal.calendar
    ? `${proposal.days} jour${proposal.days > 1 ? "s" : ""}`
    : `${proposal.days} jour${proposal.days > 1 ? "s" : ""} ouvré${proposal.days > 1 ? "s" : ""}`;
  return proposal.past
    ? `Le délai du laboratoire (${unit} après l'arrivée) est déjà dépassé : indiquez la date promise.`
    : `Proposée d'après le délai du laboratoire : ${unit} après l'arrivée — modifiable.`;
}

export type DueDelaysRead = { ok: true; value: Partial<DueDelays> } | { ok: false; error: string };

/**
 * The delays as /admin/reglages sends them: each field optional (absent =
 * unchanged), empty or null = no proposal for that domain, otherwise a whole
 * number of days from 1 to `DUE_DAYS_MAX`.
 */
export function parseDueDelays(input: Record<string, unknown>): DueDelaysRead {
  const value: Partial<DueDelays> = {};
  for (const field of DUE_DELAY_FIELDS) {
    if (!(field.key in input) || input[field.key] === undefined) continue;
    const raw = input[field.key];
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      value[field.key] = null;
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 1 || n > DUE_DAYS_MAX) {
      return { ok: false, error: `« ${field.label} » : un nombre entier de jours entre 1 et ${DUE_DAYS_MAX}, ou vide.` };
    }
    value[field.key] = n;
  }
  if ("dueCalendarDays" in input && input.dueCalendarDays !== undefined) {
    if (typeof input.dueCalendarDays !== "boolean") return { ok: false, error: "Le type de jours doit être « ouvrés » ou « calendaires »." };
    value.dueCalendarDays = input.dueCalendarDays;
  }
  return { ok: true, value };
}

export type NatureDueDaysRead = { ok: true; value: { id: string; dueDays: number | null }[] } | { ok: false; error: string };

/**
 * The delays of the types d'analyse as /admin/reglages sends them
 * (`natures: { [natureId]: days | "" | null }`): empty or null = the
 * domain's delay, otherwise a whole number of days from 1 to
 * `DUE_DAYS_MAX`. Absent = nothing changed.
 */
export function parseNatureDueDays(input: unknown): NatureDueDaysRead {
  if (input === undefined) return { ok: true, value: [] };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Requête invalide." };
  const value: { id: string; dueDays: number | null }[] = [];
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!id) return { ok: false, error: "Requête invalide." };
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      value.push({ id, dueDays: null });
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 1 || n > DUE_DAYS_MAX) {
      return { ok: false, error: `Délai d'un type d'analyse : un nombre entier de jours entre 1 et ${DUE_DAYS_MAX}, ou vide.` };
    }
    value.push({ id, dueDays: n });
  }
  return { ok: true, value };
}
