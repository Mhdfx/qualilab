import Link from "next/link";
import { ArrowRight, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import type { SampleType } from "@/generated/prisma/client";
import { formatDate } from "@/lib/labels";
import { approvalState, APPROVAL_LABELS } from "@/lib/sample-status";
import { Card } from "@/components/ui/Card";
import { TypeBadge } from "@/components/ui/TypeBadge";

export type ValidationItem = {
  id: string;
  serialNumber: string | null;
  controlCode: string | null;
  type: SampleType;
  validatedById: string | null;
  approvedById: string | null;
  client: { name: string };
  technician: { name: string } | null;
  results: { conform: boolean | null; workStatus: string }[];
  updatedAt?: Date;
  receivedAt: Date | null;
};

/** Samples whose results are submitted and awaiting one of the two approvals. */
export function ValidationQueue({ items }: { items: ValidationItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <ShieldCheck className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">
          Aucun échantillon à valider
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Les résultats soumis par les techniciens apparaîtront ici.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const state = approvalState(item);
        const nonConformes = item.results.filter((r) => r.conform === false).length;
        const anomalies = item.results.filter((r) => r.workStatus === "ANOMALIE").length;

        return (
          <li key={item.id}>
            <Link
              href={`/validation/${item.id}`}
              className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {item.serialNumber ?? "—"}
                    </span>
                    <TypeBadge type={item.type} />
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                        state === "AWAITING_ADMIN"
                          ? "bg-violet-50 text-violet-700 ring-violet-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {state === "AWAITING_ADMIN"
                        ? "Validé — attente admin"
                        : "À valider"}
                    </span>
                  </div>

                  <p className="mt-1.5 truncate font-semibold text-slate-800">
                    {item.client.name}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {item.results.length} résultat
                    {item.results.length > 1 ? "s" : ""}
                    {item.technician && ` · ${item.technician.name}`}
                    {item.receivedAt && ` · reçu le ${formatDate(item.receivedAt)}`}
                  </p>

                  {(nonConformes > 0 || anomalies > 0) && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {nonConformes > 0 && `${nonConformes} non conforme${nonConformes > 1 ? "s" : ""}`}
                      {nonConformes > 0 && anomalies > 0 && " · "}
                      {anomalies > 0 && `${anomalies} anomalie${anomalies > 1 ? "s" : ""}`}
                    </p>
                  )}
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  Contrôler
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>

              <span className="sr-only">{APPROVAL_LABELS[state]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
