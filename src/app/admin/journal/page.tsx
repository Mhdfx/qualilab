import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import type { Role } from "@/lib/roles";

export const metadata = { title: "Journal d'audit" };

/**
 * The audit journal — the traceability promise made visible.
 *
 * Read-only by construction: nothing in the interface can alter an entry, and
 * the newest are shown first because that is what an investigation looks at.
 */

/** Plain French for each recorded action. */
const ACTION_LABELS: Record<string, string> = {
  SAMPLE_CREATED: "Échantillon créé",
  SAMPLE_RECEIVED: "Échantillon réceptionné",
  SAMPLE_ANALYSIS_STARTED: "Analyse démarrée",
  RESULTS_SAVED: "Résultats enregistrés",
  RESULTS_SUBMITTED: "Résultats soumis à validation",
  SAMPLE_VALIDATED_TECHNICAL: "Validation technique",
  SAMPLE_APPROVED: "Approbation finale",
  SAMPLE_REJECTED: "Échantillon renvoyé au technicien",
  REPORT_SENT: "Rapport envoyé",
  REPORT_DOWNLOADED: "Rapport téléchargé",
  CONTAMINATION_ALERT_SENT: "Alerte de contamination envoyée",
  INVOICE_DOWNLOADED: "Facture téléchargée",
  CLIENT_CREATED: "Client créé",
  CLIENT_UPDATED: "Client modifié",
  CLIENT_ARCHIVED: "Client archivé",
  CLIENT_RESTORED: "Client réactivé",
  PARAMETER_CREATED: "Paramètre créé",
  PARAMETER_UPDATED: "Paramètre modifié",
};

export default async function JournalPage() {
  await requireRole("ADMIN");

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, role: true } } },
  });

  return (
    <div>
      <PageHeader
        badge="Système"
        title="Journal d'audit"
        subtitle="Qui a fait quoi, et quand. Les 200 dernières actions enregistrées."
      />

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Aucune action enregistrée pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const metadata = entry.metadata
                ? (JSON.parse(entry.metadata) as Record<string, unknown>)
                : {};
              const reference =
                (metadata.controlCode as string) ??
                (metadata.code as string) ??
                (metadata.number as string) ??
                (metadata.name as string) ??
                null;

              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {reference && (
                        <span className="ml-2 font-mono text-xs text-slate-500">
                          {reference}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.actor?.name ?? "Système"}
                      {entry.actor?.role && (
                        <> · {ROLE_LABELS[entry.actor.role as Role]}</>
                      )}
                    </p>
                  </div>
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="shrink-0 text-xs tabular-nums text-slate-400"
                  >
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
