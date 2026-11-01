import "server-only";
import { readFile } from "node:fs/promises";
import { parseBackupJournal, type BackupRun } from "./backup-journal";

/**
 * Where the backups' journal is mounted (docker-compose.yml, read-only):
 * `BACKUP_JOURNAL_PATH`. Unset (a workstation, a VPS not updated yet): no
 * journal — the page says so instead of failing.
 */
export function backupJournalPath(): string | null {
  return process.env.BACKUP_JOURNAL_PATH?.trim() || null;
}

/** The journal's text, or null when it is not configured or not readable. */
export async function readBackupJournalText(): Promise<string | null> {
  const path = backupJournalPath();
  if (!path) return null;
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") console.error("[backups] journal unreadable", { path, error });
    return null;
  }
}

/** The runs, newest first; null when the journal is not reachable. */
export async function readBackupRuns(): Promise<{ runs: BackupRun[]; skipped: number } | null> {
  const text = await readBackupJournalText();
  return text === null ? null : parseBackupJournal(text);
}
