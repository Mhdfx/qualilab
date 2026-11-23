import Link from "@/components/ui/AppLink";
import { History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatDecimal } from "@/lib/labels";
import { LEGACY_HISTORY_NOTICE, LEGACY_HISTORY_TITLE } from "@/lib/legacy-history";
import type { LegacyHistorySummary } from "@/lib/legacy-history-server";
import { LegacyRowsTable } from "./LegacyHistory";
import { LegacyLinksManager } from "./LegacyLinksManager";

/**
 * The fiche client's card (lot 5B, HA5 — RETOUR-LABO-20-11.md §6): the old
 * software's samples of this client per year, the ten latest, the link to
 * the whole list, and the old software's clients linked to this one — added
 * or withdrawn by the administrator only (the route checks it too).
 */
export function LegacyHistoryCard({
  clientId,
  summary,
  canManageLinks,
}: {
  clientId: string;
  summary: LegacyHistorySummary;
  canManageLinks: boolean;
}) {
  const nf = (value: number) => formatDecimal(value, 0);
  const basePath = `/commercial/${clientId}/historique`;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <History className="h-4 w-4 text-brand" aria-hidden="true" />
          {LEGACY_HISTORY_TITLE}
        </h2>
        {summary.total > 0 && (
          <Link href={basePath} className="text-sm font-medium text-brand underline-offset-2 hover:underline">
            Tout l&apos;historique ({nf(summary.total)})
          </Link>
        )}
      </div>
      {summary.total === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Aucun échantillon repris de l&apos;ancien logiciel pour ce client
          {summary.links.length === 0 ? " — aucune fiche de l'ancien logiciel n'y est rattachée." : "."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500">{LEGACY_HISTORY_NOTICE}</p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Échantillons par année">
            {summary.byYear.map((y) => (
              <li key={y.year} className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                <span className="font-semibold tabular-nums">{y.year}</span> · {nf(y.count)} échantillon{y.count > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
          <div className="mt-4 overflow-x-auto">
            <LegacyRowsTable rows={summary.latest} basePath={basePath} />
          </div>
        </>
      )}
      <LegacyLinksManager
        clientId={clientId}
        canManage={canManageLinks}
        links={summary.links.map((link) => ({ ...link, createdAt: link.createdAt.toISOString() }))}
      />
    </Card>
  );
}
