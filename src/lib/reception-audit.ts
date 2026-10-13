import type { NonConformityReason } from "@/generated/prisma/enums";
import { NON_CONFORMITY_REASON_LABELS } from "./labels";
import { CHECKLIST_STATUS_LABELS, type ChecklistRow, type ChecklistStatus } from "./reception-rules";

/**
 * The checklist of a sample as it was decided at reception, read back from
 * its SAMPLE_RECEIVED journal entry — `POST /api/series/[id]/reception`
 * (`entity` « Sample », `entityId` the sample) and the deposit's
 * `POST /api/series` (same entry, `deposit: true`) write the rules of the
 * bon (`checklist`: seven since 09/10, eight since 12/10) and the contrôles
 * complémentaires (`complementary`, C1 … C7).
 *
 * What was decided, never a recomputation: the thresholds may have changed
 * since. Pure and defensive — the metadata is a journal's free text: a
 * malformed JSON, a missing key or a row of another shape gives null or is
 * dropped, never an exception. A sample received before the checklist has
 * no `checklist` in its entry: null, « Réceptionné avant la checklist ».
 */

export type ReceivedChecklist = {
  /** The paper's rules as decided: (1) … (7) before 12/10, (1) … (8) since. */
  checklist: ChecklistRow[];
  /** The coded rows, C1 … C7, as decided; empty before they existed. */
  complementary: ChecklistRow[];
};

const STATUSES = new Set<string>(Object.keys(CHECKLIST_STATUS_LABELS));
const REASONS = new Set<string>(Object.keys(NON_CONFORMITY_REASON_LABELS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One row as stored; null when it is not a row the checklist can show. */
export function parseChecklistRow(value: unknown): ChecklistRow | null {
  if (!isRecord(value)) return null;
  const { n, key, text, status, code, detail, reason, rules } = value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (typeof key !== "string" || !key || typeof text !== "string") return null;
  if (typeof status !== "string" || !STATUSES.has(status)) return null;
  return {
    n,
    key: key as ChecklistRow["key"],
    text,
    status: status as ChecklistStatus,
    ...(typeof code === "string" && code ? { code } : {}),
    ...(typeof detail === "string" && detail ? { detail } : {}),
    ...(typeof reason === "string" && REASONS.has(reason) ? { reason: reason as NonConformityReason } : {}),
    rules: Array.isArray(rules) ? rules.filter((rule): rule is string => typeof rule === "string") : [],
  };
}

function rowsOf(value: unknown): ChecklistRow[] {
  return Array.isArray(value)
    ? value.map(parseChecklistRow).filter((row): row is ChecklistRow => row !== null)
    : [];
}

/**
 * The checklist a SAMPLE_RECEIVED entry carries; null without one — an
 * older reception, or metadata that cannot be read.
 */
export function parseReceptionAudit(metadata: string | null | undefined): ReceivedChecklist | null {
  if (!metadata) return null;
  let data: unknown;
  try {
    data = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  // The paper's rows carry no code; a coded row is a contrôle complémentaire.
  const checklist = rowsOf(data.checklist).filter((row) => !row.code);
  if (checklist.length === 0) return null;
  const complementary = rowsOf(data.complementary).filter((row) => row.code);
  return { checklist, complementary };
}

/**
 * The latest decided checklist of each sample, from its SAMPLE_RECEIVED
 * entries (newest first, as the page reads them); a sample without one maps
 * to null.
 */
export function receivedChecklists(
  sampleIds: readonly string[],
  entries: readonly { entityId: string | null; metadata: string | null }[]
): Record<string, ReceivedChecklist | null> {
  const result: Record<string, ReceivedChecklist | null> = Object.fromEntries(sampleIds.map((id) => [id, null]));
  for (const entry of entries) {
    if (!entry.entityId || !(entry.entityId in result) || result[entry.entityId]) continue;
    result[entry.entityId] = parseReceptionAudit(entry.metadata);
  }
  return result;
}
