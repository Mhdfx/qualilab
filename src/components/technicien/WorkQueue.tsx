import Link from "next/link";
import { ArrowRight, FlaskConical, AlertTriangle } from "lucide-react";
import type { SampleStatus, SampleType } from "@/generated/prisma/client";
import { formatDate } from "@/lib/labels";
import { labReference } from "@/lib/sample-select";
import { groupBySerie } from "@/lib/serie-groups";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";

export type WorkItem = {
  id: string;
  code: string;
  controlCode: string | null;
  type: SampleType;
  status: SampleStatus;
  receivedAt: Date | null;
  conformity: boolean | null;
  client: { name: string };
  serie: { serialNumber: string };
  parameters: { parameter: { id: string } }[];
  results: { value: string | null; workStatus: string; interpretation: string | null }[];
};

/** The samples on this technician's bench, grouped by série, oldest first. */
export function WorkQueue({ items }: { items: WorkItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <FlaskConical className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">
          Aucune analyse en attente
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Les échantillons qui vous sont attribués à la réception apparaîtront
          ici.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {groupBySerie(items).map((group) => (
        <section key={group.serialNumber} aria-label={`Série ${group.serialNumber}`}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-sm font-bold text-brand">Série {group.serialNumber}</span>
            <span className="text-sm font-medium text-slate-700">{group.clientName}</span>
            <span className="text-xs text-slate-500">
              {group.items.length} échantillon{group.items.length > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="space-y-3">
            {group.items.map((item) => {
              const total = item.parameters.length;
              // A germ read per unit only counts once every unit is read.
              const done = item.results.filter(
                (r) => r.value && r.workStatus !== "EN_COURS" && r.interpretation !== "INCOMPLET"
              ).length;

              return (
                <li key={item.id}>
                  <Link
                    href={`/technicien/${item.id}`}
                    className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {labReference(item)}
                          </span>
                          <TypeBadge type={item.type} />
                          <StatusBadge status={item.status} />
                          {item.conformity === false && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              Non conforme
                            </span>
                          )}
                        </div>

                        <p className="mt-1.5 truncate font-semibold text-slate-800">
                          {item.client.name}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {done} / {total} paramètre{total > 1 ? "s" : ""} saisi
                          {done > 1 ? "s" : ""} · reçu le{" "}
                          {item.receivedAt ? formatDate(item.receivedAt) : "—"}
                        </p>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                        {item.status === "RECU" ? "Commencer" : "Continuer"}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
