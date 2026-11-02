import { AlertTriangle, CheckCircle2, Clock, DatabaseBackup, Download, Info, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatDecimal } from "@/lib/labels";
import { BACKUP_RUNS_SHOWN, BACKUP_STALE_HOURS, OFFSITE_LABELS, backupHealth } from "@/lib/backup-journal";
import { readBackupRuns } from "@/lib/backup-journal-server";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Sauvegardes" };
// The journal changes every night: always read it again.
export const dynamic = "force-dynamic";

/** « 6,1 Ko », « 12,4 Mo ». */
function size(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${formatDecimal(bytes / 1024, 1)} Ko`;
  return `${formatDecimal(bytes / (1024 * 1024), 1)} Mo`;
}

const TONE = {
  ok: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  failed: { box: "border-rose-200 bg-rose-50 text-rose-800", icon: XCircle },
  stale: { box: "border-amber-200 bg-amber-50 text-amber-800", icon: Clock },
  empty: { box: "border-slate-200 bg-slate-50 text-slate-700", icon: Info },
  absent: { box: "border-slate-200 bg-slate-50 text-slate-700", icon: Info },
} as const;

/**
 * « Sauvegardes » (RETOUR-LABO-28-10.md L2 — Q97 « Est-ce qu'on peut
 * récupérer un fichier de suivi de la sauvegarde ? »): the last runs of the
 * nightly database backup as `scripts/backup-db.sh` journals them — date,
 * file, size, fingerprint (sha256), off-site copy — with a warning when the
 * last run failed or is older than 26 h, and the whole journal to download.
 */
export default async function SauvegardesPage() {
  await requireRole("ADMIN");
  const journal = await readBackupRuns();
  const health = backupHealth(journal?.runs ?? null, new Date());
  const tone = TONE[health.state];
  const Icon = tone.icon;
  const runs = journal?.runs.slice(0, BACKUP_RUNS_SHOWN) ?? [];

  return (
    <div>
      <PageHeader
        badge="Système"
        title="Sauvegardes"
        subtitle={`La sauvegarde de la base, chaque nuit : les ${BACKUP_RUNS_SHOWN} derniers passages, et le suivi complet à télécharger.`}
      />
      <div className="max-w-5xl space-y-5">
        <div role={health.state === "failed" || health.state === "stale" ? "alert" : "status"} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tone.box}`}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{health.message}</p>
            {"last" in health && (
              <p className="mt-0.5">
                Dernier passage : {formatDateTime(health.last.at)}
                {health.state === "stale" && health.lastSuccess && health.lastSuccess !== health.last
                  ? ` · dernière réussite : ${formatDateTime(health.lastSuccess.at)}`
                  : ""}
              </p>
            )}
            {health.state === "absent" && (
              <p className="mt-0.5">
                {"Ce journal est écrit sur le serveur par la sauvegarde automatique, puis lu ici. S'il reste absent, demandez à l'administrateur du serveur de vérifier que la sauvegarde automatique est bien installée."}
              </p>
            )}
          </div>
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <DatabaseBackup className="h-4 w-4 text-brand" aria-hidden="true" />
              Derniers passages
            </h2>
            {journal && (
              <a
                href="/api/admin/backups/journal"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Télécharger le suivi
              </a>
            )}
          </div>
          {runs.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Aucun passage à afficher.</p>
          ) : (
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Résultat</th>
                    <th className="pb-2 pr-3 font-medium">Fichier</th>
                    <th className="pb-2 pr-3 font-medium">Taille</th>
                    <th className="pb-2 pr-3 font-medium">Copie hors site</th>
                    <th className="pb-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={`${run.at.toISOString()}-${run.file ?? ""}`} className="border-b border-slate-100 align-top">
                      <td className="whitespace-nowrap py-2.5 pr-3 text-slate-700">{formatDateTime(run.at)}</td>
                      <td className="py-2.5 pr-3">
                        {run.status === "ok" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Réussie
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Échouée
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-mono text-xs text-slate-800">{run.file ?? "—"}</span>
                        {run.sha256 && (
                          <span className="block font-mono text-[11px] text-slate-500" title={`sha256 ${run.sha256}`}>
                            sha256 {run.sha256.slice(0, 16)}…
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-slate-700">{size(run.bytes)}</td>
                      <td className={`py-2.5 pr-3 ${run.offsite === "echec" ? "font-semibold text-rose-700" : "text-slate-700"}`}>{OFFSITE_LABELS[run.offsite]}</td>
                      <td className="py-2.5 text-slate-600">{run.message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {journal && journal.skipped > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {journal.skipped} ligne{journal.skipped > 1 ? "s" : ""} illisible{journal.skipped > 1 ? "s" : ""} ignorée{journal.skipped > 1 ? "s" : ""} (le fichier téléchargé les contient).
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Un avertissement s&apos;affiche quand le dernier passage a échoué ou date de plus de {BACKUP_STALE_HOURS} h.
          </p>
        </Card>
      </div>
    </div>
  );
}
