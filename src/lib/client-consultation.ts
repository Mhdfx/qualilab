import type { ConsultationChannel } from "@/generated/prisma/enums";
import {
  CONSULTATION_CHANNEL_LABELS,
  CONSULTATION_CHANNEL_SHORT,
  RECEPTION_DECISION_LABELS,
  formatDayTime,
  futureMessage,
} from "./labels";

/**
 * « Accord du client » and « En attente du client » (ISO/IEC 17025 §7.4.3:
 * a non-conform item is analysed only after consulting the customer, and the
 * consultation is recorded). Pure, shared by the reception of a visit, the
 * deposit at the counter, the release of a held sample and their screens.
 *
 * A non-conform sample is, case by case: analysed anyway (« Analyser malgré
 * tout » — the client's agreement may be recorded, and must be when the
 * laboratory says so: `LabSettings.consultationRequired`), held « en attente
 * du client » (received, numbered, blocked until the reception or the admin
 * releases it), or destroyed. Nobody using the new options keeps the 29/09
 * behaviour: analyse or destroy, nothing recorded.
 */

export type ReceptionDecision = keyof typeof RECEPTION_DECISION_LABELS;

/** The decisions both APIs accept — derived from their labels, never listed twice. */
export const RECEPTION_DECISIONS = Object.keys(RECEPTION_DECISION_LABELS) as ReceptionDecision[];
export const CONSULTATION_CHANNELS = Object.keys(CONSULTATION_CHANNEL_LABELS) as ConsultationChannel[];

export const CONSULTATION_NAME_MAX = 191;
export const CONSULTATION_NOTE_MAX = 2000;

/** The client's agreement as stored on the sample (`clientConsulted*`). */
export type ClientConsultation = {
  name: string;
  channel: ConsultationChannel;
  at: Date;
  note: string | null;
};

/** The words of every refusal — the reception prefixes « Échantillon 2 : », the deposit « Échantillon 2 — ». */
export const CONSULTATION_MESSAGES = {
  incomplete: "Pour l'accord du client, indiquez le nom de la personne consultée et le canal.",
  required:
    "L'accord du client est obligatoire pour analyser un échantillon non conforme : indiquez le nom de la personne consultée et le canal.",
  channel: "Canal de l'accord du client inconnu.",
  date: "La date de l'accord du client n'est pas valide.",
  nameTooLong: "Le nom de la personne consultée est trop long (191 caractères maximum).",
  noteTooLong: "La note de l'accord du client est trop longue (2 000 caractères maximum).",
  decision: "Décision inconnue.",
  awaitConform: "Seul un échantillon non conforme peut attendre l'avis du client.",
} as const;

/** The future check of the agreement's date-time (5 min of tolerance, as every field). */
export const CONSULTATION_TIME_LABEL = "L'heure de l'accord du client";

/** A decision as a request sends it: absent → « analyser » (the 29/09 default); unknown → null. */
export function parseDecision(value: unknown): ReceptionDecision | null {
  if (value === undefined || value === null) return "ANALYSER";
  return typeof value === "string" && (RECEPTION_DECISIONS as readonly string[]).includes(value)
    ? (value as ReceptionDecision)
    : null;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export type ConsultationParse = { ok: true; value: ClientConsultation | null } | { ok: false; error: string };

/**
 * The agreement as a request sends it, `{ name, channel, at, note }`:
 * absent, null or every field empty → null (nothing recorded); otherwise the
 * name and the channel are required together (an agreement nobody can trace
 * is not one), the date-time defaults to `now` and is never in the future.
 */
export function parseConsultation(raw: unknown, now: Date): ConsultationParse {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: CONSULTATION_MESSAGES.incomplete };
  const input = raw as Record<string, unknown>;
  const name = text(input.name);
  const channel = text(input.channel);
  const at = text(input.at);
  const note = text(input.note);
  if (!name && !channel && !at && !note) return { ok: true, value: null };
  if (!name || !channel) return { ok: false, error: CONSULTATION_MESSAGES.incomplete };
  if (name.length > CONSULTATION_NAME_MAX) return { ok: false, error: CONSULTATION_MESSAGES.nameTooLong };
  if (note.length > CONSULTATION_NOTE_MAX) return { ok: false, error: CONSULTATION_MESSAGES.noteTooLong };
  if (!(CONSULTATION_CHANNELS as readonly string[]).includes(channel)) return { ok: false, error: CONSULTATION_MESSAGES.channel };
  let when = now;
  if (at) {
    const parsed = new Date(at);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: CONSULTATION_MESSAGES.date };
    if (parsed.getTime() > now.getTime() + 5 * 60 * 1000) return { ok: false, error: futureMessage(CONSULTATION_TIME_LABEL) };
    when = parsed;
  }
  return { ok: true, value: { name, channel: channel as ConsultationChannel, at: when, note: note || null } };
}

/** `LabSettings.consultationRequired`: analysing a non-conform sample needs the recorded agreement. */
export function consultationMissing(
  required: boolean,
  decision: ReceptionDecision,
  conformity: boolean | null,
  consultation: ClientConsultation | null
): boolean {
  return required && decision === "ANALYSER" && conformity === false && consultation === null;
}

/** The agreement being typed on a screen: strings, the channel unset as "". */
export type ConsultationDraft = {
  name: string;
  channel: ConsultationChannel | "";
  /** LEGAL wall time « AAAA-MM-JJTHH:mm » (LabDateTimeInput); "" = the moment it is recorded. */
  at: string;
  note: string;
};

export const EMPTY_CONSULTATION: ConsultationDraft = { name: "", channel: "", at: "", note: "" };

/** Nothing typed: no agreement sent. */
export function isEmptyConsultation(draft: ConsultationDraft): boolean {
  return !draft.name.trim() && !draft.channel && !draft.at && !draft.note.trim();
}

/**
 * The screens' own check before sending, the API's words: null when the
 * draft may be sent (empty and not required, or name and channel given).
 */
export function consultationDraftError(draft: ConsultationDraft, required: boolean): string | null {
  if (isEmptyConsultation(draft)) return required ? CONSULTATION_MESSAGES.required : null;
  if (!draft.name.trim() || !draft.channel) return required ? CONSULTATION_MESSAGES.required : CONSULTATION_MESSAGES.incomplete;
  if (draft.name.trim().length > CONSULTATION_NAME_MAX) return CONSULTATION_MESSAGES.nameTooLong;
  if (draft.note.trim().length > CONSULTATION_NOTE_MAX) return CONSULTATION_MESSAGES.noteTooLong;
  return null;
}

/**
 * The draft as both APIs read it — `at` turned from the screen's LEGAL wall
 * time into an instant by `toInstant` (`fromLocalInput`) — or undefined when
 * nothing was typed.
 */
export function consultationPayload(
  draft: ConsultationDraft,
  toInstant: (legalWall: string) => string | null
): { name: string; channel: string; at: string | null; note: string } | undefined {
  if (isEmptyConsultation(draft)) return undefined;
  return { name: draft.name.trim(), channel: draft.channel, at: toInstant(draft.at), note: draft.note.trim() };
}

/** Who agreed, how and when — what a screen or the bon prints of a recorded agreement. */
export type StoredConsultation = { name: string; channel: ConsultationChannel; at: Date | string };

/**
 * The agreement recorded on a sample (`clientConsulted*`), or null when none
 * was. The three columns are written together (reception, deposit, release);
 * a row missing one of them is read as « no agreement », never half-printed.
 */
export function storedConsultation(row: {
  clientConsultedName: string | null;
  clientConsultationChannel: ConsultationChannel | null;
  clientConsultedAt: Date | string | null;
}): StoredConsultation | null {
  return row.clientConsultedName && row.clientConsultationChannel && row.clientConsultedAt
    ? { name: row.clientConsultedName, channel: row.clientConsultationChannel, at: row.clientConsultedAt }
    : null;
}

/**
 * « accord de M. Exemple (tél., 10/10 14:05) » — what the bon de réception
 * appends to a non-conform line analysed with the client's agreement.
 */
export function consultationText(consultation: StoredConsultation): string {
  return `accord de ${consultation.name} (${CONSULTATION_CHANNEL_SHORT[consultation.channel]}, ${formatDayTime(consultation.at)})`;
}
