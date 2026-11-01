/**
 * The journal of the database backups (RETOUR-LABO-28-10.md L2 — Q97
 * « Est-ce qu'on peut récupérer un fichier de suivi de la sauvegarde ? »).
 * `scripts/backup-db.sh` appends one line per run, failed or not, to
 * `backup-journal.csv`; the app reads it (mounted read-only) for
 * Administration → « Sauvegardes ». Pure: parsing and the warning.
 *
 *   date (UTC, ISO 8601) ; statut ; fichier ; octets ; sha256 ;
 *   copie_hors_site ; message
 */

export type BackupStatus = "ok" | "echec";
export type OffsiteStatus = "ok" | "ignoree" | "echec" | "non-tentee";

export type BackupRun = {
  at: Date;
  status: BackupStatus;
  file: string | null;
  bytes: number | null;
  sha256: string | null;
  offsite: OffsiteStatus;
  message: string | null;
};

export const BACKUP_JOURNAL_HEADER = "date;statut;fichier;octets;sha256;copie_hors_site;message";

/** A daily backup older than this is late (the cron runs every 24 h; 2 h of margin). */
export const BACKUP_STALE_HOURS = 26;

/** The runs shown on the page. */
export const BACKUP_RUNS_SHOWN = 30;

const OFFSITE: readonly OffsiteStatus[] = ["ok", "ignoree", "echec", "non-tentee"];

/** The runs of the journal, newest first; a malformed line is skipped (and counted). */
export function parseBackupJournal(text: string): { runs: BackupRun[]; skipped: number } {
  const runs: BackupRun[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === BACKUP_JOURNAL_HEADER) continue;
    const [date, status, file, bytes, sha, offsite, ...message] = line.split(";");
    const at = new Date(date ?? "");
    if (Number.isNaN(at.getTime()) || (status !== "ok" && status !== "echec")) {
      skipped += 1;
      continue;
    }
    const size = bytes ? Number(bytes) : NaN;
    runs.push({
      at,
      status,
      file: file || null,
      bytes: Number.isFinite(size) ? size : null,
      sha256: sha && /^[0-9a-f]{64}$/i.test(sha) ? sha.toLowerCase() : null,
      offsite: (OFFSITE as readonly string[]).includes(offsite ?? "") ? (offsite as OffsiteStatus) : "non-tentee",
      message: message.join(";").trim() || null,
    });
  }
  runs.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { runs, skipped };
}

export type BackupHealth =
  | { state: "absent"; message: string }
  | { state: "empty"; message: string }
  | { state: "failed"; message: string; last: BackupRun }
  | { state: "stale"; message: string; last: BackupRun; lastSuccess: BackupRun | null }
  | { state: "ok"; message: string; last: BackupRun };

const hoursSince = (date: Date, now: Date) => (now.getTime() - date.getTime()) / 3_600_000;

/**
 * The page's verdict on the journal: the last run failed (red), the last
 * successful one is older than 26 h (amber: the cron did not run), or all
 * is well. `absent`: the journal is not reachable (not mounted yet).
 */
export function backupHealth(runs: readonly BackupRun[] | null, now: Date): BackupHealth {
  if (runs === null) {
    return { state: "absent", message: "Le journal des sauvegardes n'est pas accessible depuis l'application (fichier non monté ou absent)." };
  }
  if (runs.length === 0) return { state: "empty", message: "Aucune sauvegarde n'est encore inscrite au journal." };
  const [last] = runs;
  if (last.status === "echec") {
    const local = last.file ? "la sauvegarde locale est faite, mais " : "";
    return {
      state: "failed",
      last,
      message: `La dernière sauvegarde a échoué : ${local}${last.offsite === "echec" ? "la copie hors site a échoué" : last.message ?? "voir le message"}.`,
    };
  }
  const lastSuccess = runs.find((run) => run.status === "ok") ?? null;
  if (hoursSince(last.at, now) > BACKUP_STALE_HOURS) {
    return { state: "stale", last, lastSuccess, message: `Aucune sauvegarde depuis plus de ${BACKUP_STALE_HOURS} h : la tâche planifiée ne tourne peut-être plus.` };
  }
  return { state: "ok", last, message: "La dernière sauvegarde s'est bien passée." };
}

export const OFFSITE_LABELS: Record<OffsiteStatus, string> = {
  ok: "Copiée hors site",
  ignoree: "Pas de copie hors site (non configurée)",
  echec: "Copie hors site échouée",
  "non-tentee": "Copie hors site non tentée",
};
