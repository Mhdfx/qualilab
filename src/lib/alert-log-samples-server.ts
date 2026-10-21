import "server-only";
import type { EmailType } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { labReference } from "./sample-select";
import {
  ALERT_JOURNAL_ACTION,
  pairAlertSends,
  sampleAlertLookup,
  type AlertJournalStore,
  type AlertSend,
  type TimeWindow,
} from "./alert-log-samples";

/** The sample an alert was about, as /admin/envois links it. */
export type AlertSample = { id: string; reference: string };

/** One alert sent before its sample's report existed, as the « Envois » card lists it. */
export type EarlyAlertSend = {
  id: string;
  createdAt: Date;
  type: EmailType;
  to: string;
  status: string;
  error: string | null;
};

const within = (window: TimeWindow) => ({ createdAt: { gte: new Date(window.from), lte: new Date(window.to) } });

/**
 * The pairing's reads: the alerts by `[type, createdAt]`, their journal rows
 * by `[action, createdAt]` — one range per burst of alerts (`timeWindows`).
 */
const journalStore: AlertJournalStore = {
  alertSends: (windows) =>
    prisma.emailLog.findMany({
      where: { type: "ALERTE_CONTAMINATION", OR: windows.map(within) },
      select: { id: true, createdAt: true, to: true, status: true, subject: true },
    }),
  journalRows: (windows) =>
    prisma.auditLog.findMany({
      where: { action: ALERT_JOURNAL_ACTION, entity: "Sample", OR: windows.map(within) },
      select: { entityId: true, createdAt: true, metadata: true },
    }),
};

/**
 * The sample of each contamination alert sent before its report existed
 * (`EmailLog.reportId` null) among `sends` — one page of /admin/envois, so
 * at most 50. Three reads: the alerts that compete for the same journal
 * rows, their rows (`pairAlertSends`), then the samples they name. A send
 * whose sample is not found (no row, a sample purged since) is left out:
 * the page keeps « non rattaché ».
 */
export async function alertSamplesOf(sends: readonly AlertSend[]): Promise<Map<string, AlertSample>> {
  const paired = await pairAlertSends(sends, journalStore);
  if (paired.size === 0) return new Map();

  const samples = await prisma.sample.findMany({
    where: { id: { in: [...new Set(paired.values())] } },
    select: { id: true, code: true, controlCode: true },
  });
  const byId = new Map(samples.map((sample) => [sample.id, { id: sample.id, reference: labReference(sample) }]));
  const found = new Map<string, AlertSample>();
  for (const [sendId, sampleId] of paired) {
    const sample = byId.get(sampleId);
    if (sample) found.set(sendId, sample);
  }
  return found;
}

/**
 * The alerts of one sample sent before its report existed — at the technical
 * validation — for the validation page's « Envois » card, which otherwise
 * lists the report's sends only (`EmailLog.reportId`). Read from the
 * sample's own alert journal rows (`[entity, entityId]`): the sends they name
 * since 21/10, and for the older ones the alerts without a report just
 * before them, kept when the pairing gives them to this sample. Nothing to
 * read for a sample never alerted.
 */
export async function earlyAlertSendsOf(sampleId: string): Promise<EarlyAlertSend[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: "Sample", entityId: sampleId, action: ALERT_JOURNAL_ACTION },
    select: { createdAt: true, metadata: true },
  });
  if (rows.length === 0) return [];
  const { named, windows } = sampleAlertLookup(rows);
  const candidates = await prisma.emailLog.findMany({
    where: {
      type: "ALERTE_CONTAMINATION",
      reportId: null,
      OR: [...(named.length > 0 ? [{ id: { in: named } }] : []), ...windows.map(within)],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, type: true, to: true, subject: true, status: true, error: true },
  });
  const exact = new Set(named);
  const guessed = await pairAlertSends(candidates.filter((send) => !exact.has(send.id)), journalStore);
  return candidates.filter((send) => exact.has(send.id) || guessed.get(send.id) === sampleId);
}
