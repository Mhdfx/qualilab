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
 * releases it), destroyed, or rejected — given back to the client (« Rejeter
 * (rendu au client) », I9, 04/11). Nobody using the new options keeps the 29/09
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
  /** I9: « Rejeter (rendu au client) » is a non-conformity's decision, as « Détruire ». */
  rejectConform: "Seul un échantillon non conforme peut être rejeté (rendu au client).",
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

/** Who agreed, how and when — what a screen shows of a recorded agreement (the bon no longer prints it, Q75). */
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
 * « accord de M. Exemple (tél., 10/10 14:05) » — who agreed to analyse a
 * non-conform line, shown under « Non conforme à réception » on the bench,
 * programming and validation screens (`ReceptionNonConformity`). The bon de
 * réception no longer prints it (Q75, 16/10).
 */
export function consultationText(consultation: StoredConsultation): string {
  return `accord de ${consultation.name} (${CONSULTATION_CHANNEL_SHORT[consultation.channel]}, ${formatDayTime(consultation.at)})`;
}

// ─── I6 (Q75) — the agreement added or corrected after the reception ──────────

/** Who may add or correct it: the reception and the administrator. */
export const CONSULTATION_EDIT_ROLES = ["RECEPTIONNISTE", "ADMIN"] as const;

/** Received, not yet validated: from the reception to the technical validation. */
export const CONSULTATION_EDITABLE_STATUSES = ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as const;

export const CONSULTATION_EDIT_MESSAGES = {
  role: "Seuls la réception et l'administrateur ajoutent ou corrigent l'accord du client.",
  conform: "Seul un échantillon non conforme à réception porte l'accord du client.",
  held: "Cet échantillon attend l'avis du client : l'accord s'enregistre en le libérant (« Analyser »).",
  status: "L'accord du client ne se modifie plus après la validation (ni sur un échantillon annulé).",
  validated: "La validation technique est signée : l'accord du client ne se modifie plus.",
  empty: "Indiquez le nom de la personne consultée et le canal : un accord enregistré ne s'efface pas, il se corrige.",
  unchanged: "Rien n'a changé dans l'accord du client.",
  stale: "Cet échantillon vient de changer (validé, libéré ou corrigé par quelqu'un d'autre) : rechargez la page.",
} as const;

export type ConsultationEditSample = {
  status: string;
  conformity: boolean | null;
  analysisBlocked: boolean;
  validatedById: string | null;
};

/**
 * Why the agreement of this sample may not be added or corrected now by this
 * role — null when it may: a non-conform sample received and not held,
 * before its technical validation (the validator reads it on their page).
 */
export function consultationEditRefusal(role: string, sample: ConsultationEditSample): { status: number; error: string } | null {
  if (!(CONSULTATION_EDIT_ROLES as readonly string[]).includes(role)) return { status: 403, error: CONSULTATION_EDIT_MESSAGES.role };
  if (sample.conformity !== false) return { status: 409, error: CONSULTATION_EDIT_MESSAGES.conform };
  if (!(CONSULTATION_EDITABLE_STATUSES as readonly string[]).includes(sample.status)) return { status: 409, error: CONSULTATION_EDIT_MESSAGES.status };
  if (sample.analysisBlocked) return { status: 409, error: CONSULTATION_EDIT_MESSAGES.held };
  if (sample.validatedById) return { status: 409, error: CONSULTATION_EDIT_MESSAGES.validated };
  return null;
}

/** Whether a screen offers « Accord du client » on this sample (the same rule, the role aside). */
export function consultationEditable(sample: ConsultationEditSample): boolean {
  return consultationEditRefusal("ADMIN", sample) === null;
}

/** The agreement as the journal keeps it, before and after (`CLIENT_CONSULTATION_UPDATED`). */
export type ConsultationRecord = { name: string | null; channel: ConsultationChannel | null; at: string | null; note: string | null };

export function consultationRecord(row: {
  clientConsultedName: string | null;
  clientConsultationChannel: ConsultationChannel | null;
  clientConsultedAt: Date | string | null;
  clientConsultationNote: string | null;
}): ConsultationRecord {
  const at = row.clientConsultedAt;
  return {
    name: row.clientConsultedName,
    channel: row.clientConsultationChannel,
    at: at === null ? null : typeof at === "string" ? at : at.toISOString(),
    note: row.clientConsultationNote,
  };
}

/**
 * Two instants of the agreement at the minute the editor shows (its field is
 * « AAAA-MM-JJTHH:mm »): the stored one carries seconds, the corrected one
 * never does — the same minute is the same moment.
 */
export function sameConsultationMinute(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const [x, y] = [new Date(a).getTime(), new Date(b).getTime()];
  if (Number.isNaN(x) || Number.isNaN(y)) return a === b;
  return Math.floor(x / 60_000) === Math.floor(y / 60_000);
}

/**
 * The instant to store on a correction: the one already stored when the
 * minute did not change (its seconds kept, the date never moved), else the
 * one typed.
 */
export function correctedConsultationAt(stored: Date | null, typed: Date): Date {
  return stored && sameConsultationMinute(stored.toISOString(), typed.toISOString()) ? stored : typed;
}

/** The fields that changed, by name; empty when the correction changes nothing (« at » to the minute). */
export function consultationChanges(before: ConsultationRecord, after: ConsultationRecord): (keyof ConsultationRecord)[] {
  return (Object.keys(after) as (keyof ConsultationRecord)[]).filter((key) =>
    key === "at" ? !sameConsultationMinute(before.at, after.at) : before[key] !== after[key]
  );
}
