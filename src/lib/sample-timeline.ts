import { CANCEL_REASON_LABELS } from "./labels";

/**
 * « Parcours de l'échantillon » (finalversion.md:105, :154): who did what,
 * and when, from the field to the client — on the validation page.
 *
 * Built from what is already recorded, never from what should have
 * happened: the sample's own timestamps (the latest reception, programme,
 * signatures, rejection, cancellation) and the journal's rows on the sample
 * and on its report (the whole history, a rejection then a new validation
 * included). A step the journal holds is shown once, with its author; a
 * timestamp the journal does not cover (a sample older than the journal, an
 * audit write that failed) is shown on its own. Downloads and duplicatas are
 * not steps of the circuit: they stay in /admin/journal. The administrator's
 * silent conclusion edit writes nothing, so it never appears (HANDOFF §8,
 * 18/08).
 *
 * Pure: the loader is `sampleTimelineFor` in `sample-timeline-server.ts`.
 */

export type TimelineActor = { name: string } | null;

export type TimelineTone = "neutral" | "success" | "warning" | "danger";

export type TimelineEvent = {
  /** Stable React key. */
  key: string;
  at: Date;
  label: string;
  /** Who did it; null when nothing records it (never guessed). */
  actor: string | null;
  note: string | null;
  tone: TimelineTone;
};

/** The sample's own timestamps, as the loader selects them. */
export type TimelineSample = {
  sampledAt: Date;
  /**
   * The série's `samplingTimeDeclared`: false on a deposit whose « Prélevé
   * le » was left empty (before 16/10) or ticked « Heure de prélèvement
   * inconnue du client » — `sampledAt` is then the save instant / the
   * arrival, not a sampling, and no « Prélèvement » step is shown. Null or
   * absent (a visit, an older série): `sampledAt` is shown as recorded.
   */
  samplingTimeDeclared?: boolean | null;
  receivedAt: Date | null;
  receivedBy: TimelineActor;
  programmedAt: Date | null;
  programmedBy: TimelineActor;
  assignedAt: Date | null;
  /** The technician assigned at `assignedAt` (the current one). */
  technician: TimelineActor;
  validatedAt: Date | null;
  validatedBy: TimelineActor;
  approvedAt: Date | null;
  approvedBy: TimelineActor;
  rejectedAt: Date | null;
  rejectedBy: TimelineActor;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: TimelineActor;
  cancelReason: string | null;
};

/** One journal row on the sample or on its report. */
export type TimelineAuditRow = {
  id: string;
  action: string;
  createdAt: Date;
  actor: TimelineActor;
  metadata: string | null;
};

type Meta = Record<string, unknown>;

type ActionSpec = {
  label: string | ((meta: Meta) => string);
  tone: TimelineTone | ((meta: Meta) => TimelineTone);
  note?: (meta: Meta) => string | null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const join = (...parts: (string | null | undefined)[]): string | null => {
  const kept = parts.filter((part): part is string => typeof part === "string" && part.length > 0);
  return kept.length > 0 ? kept.join(" — ") : null;
};
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const cancelReason = (value: unknown): string | null => {
  const code = text(value);
  if (!code) return null;
  return (CANCEL_REASON_LABELS as Record<string, string>)[code] ?? null;
};
const sendStatus = (value: unknown): string | null =>
  value === "SIMULE" ? "envoi simulé" : value === "ECHEC" ? "échec de l'envoi" : null;

/**
 * The journal's actions that are steps of the sample's circuit, with their
 * French wording. Anything else on the sample or the report (downloads,
 * duplicatas, intermediate saves of the bench) is left out.
 */
export const TIMELINE_ACTIONS: Record<string, ActionSpec> = {
  SAMPLE_CREATED: { label: "Échantillon enregistré", tone: "neutral" },
  SAMPLE_RECEIVED: {
    label: "Réception",
    tone: (meta) => (meta.conformity === false ? "warning" : "neutral"),
    note: (meta) => join(meta.conformity === false ? "Non conforme à réception" : null, meta.exploitable === false ? "non exploitable" : null),
  },
  SAMPLE_INTAKE_CORRECTED: { label: "Fiche de l'échantillon corrigée", tone: "neutral", note: (meta) => text(meta.reason) },
  SAMPLE_PROGRAMMED: { label: "Programme d'analyse confirmé", tone: "neutral" },
  SAMPLE_PROGRAMME_UPDATED: { label: "Programme d'analyse modifié", tone: "neutral" },
  SAMPLE_RELEASED: {
    label: "Libéré pour l'analyse",
    tone: "neutral",
    note: (meta) => (text(meta.technicianName) ? `Technicien : ${text(meta.technicianName)}` : null),
  },
  // Stream A (accord du client sur un non-conforme): wording of /admin/journal.
  SAMPLE_AWAITING_CLIENT: { label: "En attente de l'avis du client", tone: "warning", note: (meta) => text(meta.note) ?? text(meta.reason) },
  CLIENT_CONSULTED: { label: "Accord du client enregistré", tone: "neutral", note: (meta) => text(meta.note) ?? text(meta.reason) },
  // Prise en charge libre (13/10): the journal row names the technician
  // as its actor; a take by a first typed result says so.
  SAMPLE_TAKEN: {
    label: "Pris en charge",
    tone: "neutral",
    note: (meta) => (meta.implicit === true ? "À la première saisie de résultat" : null),
  },
  SAMPLE_UNTAKEN: {
    label: "Remis dans « À prendre »",
    tone: "neutral",
    note: (meta) => (text(meta.previousTechnicianName) ? `Était pris par ${text(meta.previousTechnicianName)}` : null),
  },
  SAMPLE_ANALYSIS_STARTED: { label: "Analyse démarrée", tone: "neutral" },
  RESULTS_SUBMITTED: {
    label: "Résultats soumis à validation",
    tone: "neutral",
    note: (meta) =>
      join(
        count(meta.nonConformes) > 0 ? plural(count(meta.nonConformes), "résultat non conforme", "résultats non conformes") : null,
        count(meta.anomalies) > 0 ? plural(count(meta.anomalies), "anomalie", "anomalies") : null
      ),
  },
  SAMPLE_REGULATION_SET: {
    label: "Réglementation choisie",
    tone: "neutral",
    note: (meta) => text(meta.after),
  },
  SAMPLE_VALIDATED_TECHNICAL: {
    label: "Validation technique",
    tone: "success",
    note: (meta) => (text(meta.regulation) ? `Réglementation : ${text(meta.regulation)}` : null),
  },
  SAMPLE_REJECTED: { label: "Renvoyé au technicien", tone: "warning", note: (meta) => text(meta.reason) },
  SAMPLE_APPROVED: {
    label: "Validation administrative",
    tone: "success",
    note: (meta) =>
      text(meta.reportNumber) ? `${meta.amendment === true ? "Rapport amendé" : "Rapport"} ${text(meta.reportNumber)}` : null,
  },
  CONTAMINATION_ALERT_SENT: {
    label: (meta) => (meta.status === "ECHEC" ? "Alerte de contamination non envoyée" : "Alerte de contamination envoyée"),
    tone: "danger",
    note: (meta) => join(text(meta.germe), sendStatus(meta.status)),
  },
  REPORT_SENT: {
    label: "Rapport envoyé au client",
    tone: "success",
    note: (meta) =>
      join(
        text(meta.number),
        Array.isArray(meta.to) ? meta.to.filter((entry): entry is string => typeof entry === "string").join(", ") || null : null,
        sendStatus(meta.status)
      ),
  },
  REPORT_REOPENED: {
    label: "Rapport rouvert pour amendement",
    tone: "warning",
    note: (meta) => join(text(meta.number), text(meta.reason)),
  },
  // Named in the plan (B7); the code writes REPORT_REOPENED today.
  SAMPLE_REOPENED: { label: "Rouvert pour amendement", tone: "warning", note: (meta) => text(meta.reason) },
  REPORT_AMENDED: {
    label: "Rapport amendé émis",
    tone: "success",
    note: (meta) => join(text(meta.number), text(meta.note)),
  },
  SAMPLE_CANCELLED: {
    label: "Échantillon annulé",
    tone: "danger",
    note: (meta) => join(cancelReason(meta.reason), text(meta.note)),
  },
  SAMPLE_REACTIVATED: { label: "Échantillon réactivé", tone: "neutral", note: (meta) => text(meta.note) },
  // « Non reçu au laboratoire » told to the client, one e-mail per sample
  // (16/10, Q74). Told only when the e-mail left: a simulated one (no
  // provider configured) never left the laboratory — a warning, as a failure.
  NOT_RECEIVED_NOTIFIED: {
    label: (meta) =>
      meta.status === "ENVOYE"
        ? "Client prévenu : échantillon non reçu"
        : meta.status === "SIMULE"
          ? "Avis de non-réception simulé (non remis)"
          : "Client non prévenu de l'échantillon non reçu",
    tone: (meta) => (meta.status === "ENVOYE" ? "neutral" : "warning"),
    note: (meta) =>
      meta.status === "NON_ENVOYE"
        ? text(meta.error)
        : meta.status === "ECHEC"
          ? sendStatus(meta.status)
          : Array.isArray(meta.to)
            ? meta.to.filter((entry): entry is string => typeof entry === "string").join(", ") || null
            : null,
  },
};

/** The codes the loader asks the journal for. */
export const TIMELINE_ACTION_CODES = Object.keys(TIMELINE_ACTIONS);

/** Kept in /admin/journal, never in the parcours (reads, not steps). */
export const EXCLUDED_ACTIONS = ["REPORT_DOWNLOADED", "REPORT_DUPLICATE", "RESULTS_SAVED"] as const;

/**
 * A timestamp and the journal row written by the same request lie seconds
 * apart: within this window they are one step.
 */
export const SAME_STEP_MS = 5 * 60 * 1000;

/** The order of the circuit, for steps recorded at the same instant. */
const CIRCUIT_ORDER = [
  "SAMPLED",
  "SAMPLE_CREATED",
  "SAMPLE_RECEIVED",
  "RECEIVED",
  "SAMPLE_INTAKE_CORRECTED",
  "SAMPLE_CANCELLED",
  "CANCELLED",
  "NOT_RECEIVED_NOTIFIED",
  "SAMPLE_REACTIVATED",
  "SAMPLE_AWAITING_CLIENT",
  "CLIENT_CONSULTED",
  "SAMPLE_PROGRAMMED",
  "PROGRAMMED",
  "SAMPLE_PROGRAMME_UPDATED",
  "SAMPLE_RELEASED",
  "ASSIGNED",
  // A take by a first result and « Analyse démarrée » share one instant.
  "SAMPLE_TAKEN",
  "SAMPLE_UNTAKEN",
  "SAMPLE_ANALYSIS_STARTED",
  "RESULTS_SUBMITTED",
  "SAMPLE_REGULATION_SET",
  "SAMPLE_VALIDATED_TECHNICAL",
  "VALIDATED",
  "SAMPLE_REJECTED",
  "REJECTED",
  "CONTAMINATION_ALERT_SENT",
  "SAMPLE_APPROVED",
  "APPROVED",
  "REPORT_AMENDED",
  "REPORT_SENT",
  "REPORT_REOPENED",
  "SAMPLE_REOPENED",
];
const rank = (kind: string) => {
  const index = CIRCUIT_ORDER.indexOf(kind);
  return index < 0 ? CIRCUIT_ORDER.length : index;
};

function parseMeta(raw: string | null): Meta {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Meta) : {};
  } catch {
    return {};
  }
}

type Stamp = {
  kind: string;
  at: Date | null;
  label: string;
  actor: TimelineActor;
  note: string | null;
  tone: TimelineTone;
  /** The journal actions that record the same step. */
  sameAs: string[];
};

/**
 * Merges the sample's timestamps and its journal rows into one dated list,
 * oldest first.
 */
export function sampleTimeline(sample: TimelineSample, rows: readonly TimelineAuditRow[]): TimelineEvent[] {
  type Item = TimelineEvent & { kind: string };
  const items: Item[] = [];

  for (const row of rows) {
    const spec = TIMELINE_ACTIONS[row.action];
    if (!spec) continue;
    const meta = parseMeta(row.metadata);
    items.push({
      key: `audit-${row.id}`,
      kind: row.action,
      at: row.createdAt,
      label: typeof spec.label === "function" ? spec.label(meta) : spec.label,
      actor: row.actor?.name ?? null,
      note: spec.note ? spec.note(meta) : null,
      tone: typeof spec.tone === "function" ? spec.tone(meta) : spec.tone,
    });
  }
  const journal = [...items];
  const recordedNear = (at: Date, actions: string[]) =>
    journal.find((item) => actions.includes(item.kind) && Math.abs(item.at.getTime() - at.getTime()) <= SAME_STEP_MS);

  const stamps: Stamp[] = [
    // An undeclared sampling time is the deposit's entry time: never shown
    // as a sampling.
    {
      kind: "SAMPLED",
      at: sample.samplingTimeDeclared === false ? null : sample.sampledAt,
      label: "Prélèvement",
      actor: null,
      note: null,
      tone: "neutral",
      sameAs: [],
    },
    { kind: "RECEIVED", at: sample.receivedAt, label: "Réception", actor: sample.receivedBy, note: null, tone: "neutral", sameAs: ["SAMPLE_RECEIVED"] },
    {
      kind: "PROGRAMMED",
      at: sample.programmedAt,
      label: "Programme d'analyse confirmé",
      actor: sample.programmedBy,
      note: null,
      tone: "neutral",
      sameAs: ["SAMPLE_PROGRAMMED"],
    },
    {
      kind: "VALIDATED",
      at: sample.validatedAt,
      label: "Validation technique",
      actor: sample.validatedBy,
      note: null,
      tone: "success",
      sameAs: ["SAMPLE_VALIDATED_TECHNICAL"],
    },
    {
      kind: "REJECTED",
      at: sample.rejectedAt,
      label: "Renvoyé au technicien",
      actor: sample.rejectedBy,
      note: text(sample.rejectionReason),
      tone: "warning",
      sameAs: ["SAMPLE_REJECTED"],
    },
    {
      kind: "APPROVED",
      at: sample.approvedAt,
      label: "Validation administrative",
      actor: sample.approvedBy,
      note: null,
      tone: "success",
      sameAs: ["SAMPLE_APPROVED"],
    },
    {
      kind: "CANCELLED",
      at: sample.cancelledAt,
      label: "Échantillon annulé",
      actor: sample.cancelledBy,
      note: cancelReason(sample.cancelReason),
      tone: "danger",
      sameAs: ["SAMPLE_CANCELLED"],
    },
  ];

  for (const stamp of stamps) {
    if (!stamp.at) continue;
    const recorded = recordedNear(stamp.at, stamp.sameAs);
    if (recorded) {
      // The journal row may be written once the step's consequences are
      // done — the administrative validation journals itself after issuing
      // and sending the report. The step happened at the sample's own
      // timestamp, which keeps it before what it caused.
      if (stamp.at < recorded.at) recorded.at = stamp.at;
      continue;
    }
    items.push({
      key: `stamp-${stamp.kind}`,
      kind: stamp.kind,
      at: stamp.at,
      label: stamp.label,
      actor: stamp.actor?.name ?? null,
      note: stamp.note,
      tone: stamp.tone,
    });
  }

  // Since 13/10 the holder is set by a take, journalled SAMPLE_TAKEN with
  // the technician as its actor: that row is the step. Before, the
  // assignment was written by the reception (older samples), the programme
  // or the release: it names the technician on that step, or stands alone
  // when no step recorded it.
  const assignedAt = sample.assignedAt;
  const takenRow =
    assignedAt &&
    items.some((item) => item.kind === "SAMPLE_TAKEN" && Math.abs(item.at.getTime() - assignedAt.getTime()) <= SAME_STEP_MS);
  if (assignedAt && !takenRow) {
    const technician = sample.technician?.name ?? null;
    const note = technician ? `Technicien : ${technician}` : null;
    const step = items.find(
      (item) =>
        ["SAMPLE_PROGRAMMED", "SAMPLE_PROGRAMME_UPDATED", "SAMPLE_RELEASED", "SAMPLE_RECEIVED", "PROGRAMMED", "RECEIVED"].includes(item.kind) &&
        Math.abs(item.at.getTime() - assignedAt.getTime()) <= SAME_STEP_MS
    );
    if (step) {
      if (!step.note && note) step.note = note;
    } else {
      items.push({
        key: "stamp-ASSIGNED",
        kind: "ASSIGNED",
        at: assignedAt,
        label: "Attribué à un technicien",
        actor: null,
        note,
        tone: "neutral",
      });
    }
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.at.getTime() - b.item.at.getTime() || rank(a.item.kind) - rank(b.item.kind) || a.index - b.index)
    .map(({ item }) => ({ key: item.key, at: item.at, label: item.label, actor: item.actor, note: item.note, tone: item.tone }));
}
