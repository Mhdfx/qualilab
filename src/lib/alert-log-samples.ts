/**
 * The sample of a contamination alert in the send journal (/admin/envois,
 * the « Envois » card of the validation page).
 *
 * An alert sent at the technical validation (`LabSettings`
 * `alertAfterTechnicalValidation`, on by default) leaves before the report
 * exists: its `EmailLog.reportId` is null, and the row read « non
 * rattaché ». The approval and « Envoyer au client » only alert once the
 * report is issued, so every alert without a report comes from the
 * technical validation. `EmailLog` has no sample column; the alert's own
 * journal row (`CONTAMINATION_ALERT_SENT`, entity Sample) names the sample.
 * The pairing is read, never written: neither row is touched — the send
 * journal stays the record of what left, and the report's issue is not
 * slowed or put at risk by a link to write.
 *
 * Two ways to pair a send with its journal row:
 * 1. exact — since 21/10 the journal row carries the send's id
 *    (`emailLogId`, written by `sendContaminationAlerts`), at any distance;
 * 2. for the alerts sent before — the journal row is written right after the
 *    send by the same request (14–60 ms apart on the local copy): the first
 *    row not yet paired in the next `ALERT_JOURNAL_WINDOW_MS`, for the same
 *    germ (the subject), with the same status and the same recipients (the
 *    send's `to` adds the laboratory in copy and is cut at 191 characters).
 *    Sends are paired oldest first, one row each: two germs of one sample,
 *    or two samples alerted at the same moment, each get their own. A send
 *    with no such row stays unpaired.
 *
 * The fallback competes every alert that may claim the same rows — with a
 * report or without, on the page or not (`pairAlertSends`): which sample a
 * send shows never depends on the page or the filter it is read through.
 * It stays a best guess for the alerts sent before 21/10: two requests
 * writing their journal rows in the reverse order of their sends, for the
 * same germ, status and recipients, swap their samples.
 *
 * Pure: the reads go through an `AlertJournalStore` — Prisma in
 * `alert-log-samples-server.ts`, a stub in the tests.
 */

/** The journal action written for each alert sent (`sendContaminationAlerts`). */
export const ALERT_JOURNAL_ACTION = "CONTAMINATION_ALERT_SENT";

/** How long after its send an alert's journal row may be written (same request). */
export const ALERT_JOURNAL_WINDOW_MS = 10_000;

/**
 * How long after its send a journal row naming it (`emailLogId`) is still
 * read: the exact link holds at any distance — the window above only bounds
 * the guess — and the request may wait on the connection pool (HANDOFF §9).
 */
export const ALERT_JOURNAL_EXACT_MS = 5 * 60_000;

/** `EmailLog.to` holds 191 characters (`sendEmail`). */
const RECORDED_TO_MAX = 191;

/**
 * The subject an alert about `germe` leaves with (`alertEmail`,
 * emails/templates.ts — unchanged since the first alert, 0305d33).
 */
export function alertSubject(germe: string): string {
  return `Alerte de contamination par ${germe}`;
}

/** One contamination alert of the send journal. */
export type AlertSend = { id: string; createdAt: Date; to: string; status: string; subject: string };

/** One `CONTAMINATION_ALERT_SENT` journal row. */
export type AlertJournalRow = { entityId: string | null; createdAt: Date; metadata: string | null };

/** A span of time to read, in milliseconds since the epoch, both ends included. */
export type TimeWindow = { from: number; to: number };

/** What the pairing reads: Prisma in `alert-log-samples-server.ts`, a stub in the tests. */
export type AlertJournalStore = {
  /** Every contamination alert sent within these spans — with a report or without. */
  alertSends(windows: TimeWindow[]): Promise<AlertSend[]>;
  /** Every alert journal row (`ALERT_JOURNAL_ACTION`, entity Sample) written within these spans. */
  journalRows(windows: TimeWindow[]): Promise<AlertJournalRow[]>;
};

type Entry = {
  sampleId: string;
  at: number;
  emailLogId: string | null;
  germe: string | null;
  to: string[];
  status: string | null;
};

function metadataOf(metadata: string | null): Record<string, unknown> {
  try {
    const value = JSON.parse(metadata ?? "null") as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // A row that is not JSON names no send: paired by nothing.
  }
  return {};
}

/** The send a journal row names (`emailLogId`, since 21/10), or null. */
export function namedSendId(metadata: string | null): string | null {
  const id = metadataOf(metadata).emailLogId;
  return typeof id === "string" ? id : null;
}

function entryOf(row: AlertJournalRow): Entry | null {
  if (!row.entityId) return null;
  const meta = metadataOf(row.metadata);
  return {
    sampleId: row.entityId,
    at: row.createdAt.getTime(),
    emailLogId: typeof meta.emailLogId === "string" ? meta.emailLogId : null,
    germe: typeof meta.germe === "string" ? meta.germe : null,
    to: Array.isArray(meta.to) ? meta.to.filter((entry): entry is string => typeof entry === "string") : [],
    status: typeof meta.status === "string" ? meta.status : null,
  };
}

/**
 * Whether a send's recorded `to` is exactly these recipients — alone, or
 * followed by the one copy (« , » then the laboratory) — once cut at 191
 * characters. A recipient is never matched by a prefix of its address, and
 * a longer list (another recipient before the copy) is another alert.
 */
export function sameRecipients(recorded: string, to: readonly string[]): boolean {
  if (to.length === 0) return false;
  const list = to.join(", ");
  if (recorded === list.slice(0, RECORDED_TO_MAX)) return true;
  const withCopy = `${list}, `;
  // The copy has always been the laboratory alone (`[company.email]`).
  if (recorded.startsWith(withCopy)) return !recorded.slice(withCopy.length).includes(", ");
  return recorded.length === RECORDED_TO_MAX && withCopy.startsWith(recorded);
}

/**
 * The spans [t − before, t + after] around each time, overlapping ones
 * merged — one range to read per burst of alerts.
 */
export function timeWindows(times: readonly number[], before: number, after: number): TimeWindow[] {
  const windows: TimeWindow[] = [];
  for (const time of [...times].sort((a, b) => a - b)) {
    const last = windows[windows.length - 1];
    if (last && time - before <= last.to) last.to = Math.max(last.to, time + after);
    else windows.push({ from: time - before, to: time + after });
  }
  return windows;
}

/**
 * The sample id of each send that a journal row names (send id → sample
 * id), among `sends` alone: the caller passes every send that may compete
 * (`pairAlertSends`).
 */
export function alertLogSamples(sends: readonly AlertSend[], rows: readonly AlertJournalRow[]): Map<string, string> {
  const entries = rows.map(entryOf).filter((entry): entry is Entry => entry !== null);
  const paired = new Map<string, string>();
  const used = new Set<Entry>();
  const sendIds = new Set(sends.map((send) => send.id));

  // 1. Exact: the row names its send.
  for (const entry of entries) {
    if (entry.emailLogId && sendIds.has(entry.emailLogId) && !paired.has(entry.emailLogId)) {
      paired.set(entry.emailLogId, entry.sampleId);
      used.add(entry);
    }
  }

  // 2. Before the exact link: the next row of the same send, oldest send
  // first. A row that names a send never stands for another one.
  const unnamed = entries.filter((entry) => entry.emailLogId === null).sort((a, b) => a.at - b.at);
  const pending = sends
    .filter((send) => !paired.has(send.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const send of pending) {
    const sentAt = send.createdAt.getTime();
    const entry = unnamed.find(
      (candidate) =>
        !used.has(candidate) &&
        candidate.at >= sentAt &&
        candidate.at - sentAt <= ALERT_JOURNAL_WINDOW_MS &&
        candidate.germe !== null &&
        send.subject === alertSubject(candidate.germe) &&
        candidate.status === send.status &&
        sameRecipients(send.to, candidate.to)
    );
    if (entry) {
      paired.set(send.id, entry.sampleId);
      used.add(entry);
    }
  }
  return paired;
}

/**
 * The sample id of each of `sends` that a journal row names. The pairing
 * runs against every alert that may claim the same rows: any alert sent in
 * the `ALERT_JOURNAL_WINDOW_MS` before one of `sends` — with a report (the
 * approval's), on another page, outside the filter — goes first when it is
 * older (a later one never changes an older one's row). The rows are read up
 * to `ALERT_JOURNAL_EXACT_MS` after each send, for the exact link.
 */
export async function pairAlertSends(sends: readonly AlertSend[], store: AlertJournalStore): Promise<Map<string, string>> {
  if (sends.length === 0) return new Map();
  const competitors = new Map<string, AlertSend>();
  const around = await store.alertSends(timeWindows(sends.map((send) => send.createdAt.getTime()), ALERT_JOURNAL_WINDOW_MS, 0));
  for (const send of [...around, ...sends]) competitors.set(send.id, send);
  const all = [...competitors.values()];
  const rows = await store.journalRows(timeWindows(all.map((send) => send.createdAt.getTime()), 0, ALERT_JOURNAL_EXACT_MS));

  const paired = alertLogSamples(all, rows);
  const found = new Map<string, string>();
  for (const send of sends) {
    const sampleId = paired.get(send.id);
    if (sampleId) found.set(send.id, sampleId);
  }
  return found;
}

/**
 * What to read for the alerts one sample's journal rows record (the
 * « Envois » card): the sends the rows name, and the spans before the
 * others — the send leaves at most `ALERT_JOURNAL_WINDOW_MS` before its row.
 */
export function sampleAlertLookup(rows: readonly Pick<AlertJournalRow, "createdAt" | "metadata">[]): {
  named: string[];
  windows: TimeWindow[];
} {
  const named = new Set<string>();
  const unnamedAt: number[] = [];
  for (const row of rows) {
    const id = namedSendId(row.metadata);
    if (id) named.add(id);
    else unnamedAt.push(row.createdAt.getTime());
  }
  return { named: [...named], windows: timeWindows(unnamedAt, ALERT_JOURNAL_WINDOW_MS, 0) };
}

/**
 * The report's sends and the alerts sent before it existed, as one list,
 * newest first — null when there is neither (no report yet, no alert): the
 * card stays hidden.
 */
export function withEarlyAlerts<T extends { id: string; createdAt: Date }>(
  reportSends: readonly T[] | null,
  earlyAlerts: readonly T[]
): T[] | null {
  if (reportSends === null && earlyAlerts.length === 0) return null;
  const byId = new Map<string, T>();
  for (const send of [...(reportSends ?? []), ...earlyAlerts]) byId.set(send.id, send);
  return [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}
