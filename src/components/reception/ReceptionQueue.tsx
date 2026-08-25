import Link from "next/link";
import { ArrowRight, Inbox, MapPin, User } from "lucide-react";
import type { SampleType } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/labels";
import { Card } from "@/components/ui/Card";
import { TypeBadge } from "@/components/ui/TypeBadge";

export type QueueSample = {
  id: string;
  code: string;
  lieu: string;
  type: SampleType;
  sampledAt: Date;
  client: { name: string };
  user: { name: string };
  parameters: { parameter: { name: string } }[];
};

/**
 * The samples waiting to be received.
 *
 * Each row is a link rather than a selectable item: receiving a sample is a
 * task with its own screen, not a detail to preview.
 */
export function ReceptionQueue({ samples }: { samples: QueueSample[] }) {
  if (samples.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Inbox className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">
          Aucun échantillon en attente
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Les prélèvements enregistrés sur le terrain apparaîtront ici dès leur
          arrivée au laboratoire.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {samples.map((sample) => (
        <li key={sample.id}>
          <Link
            href={`/reception/${sample.id}`}
            className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {sample.code}
                  </span>
                  <TypeBadge type={sample.type} />
                </div>

                <p className="mt-1.5 truncate font-semibold text-slate-800">
                  {sample.client.name}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {sample.lieu}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    {sample.user.name}
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-400">
                  Prélevé le {formatDateTime(sample.sampledAt)} ·{" "}
                  {sample.parameters.length} paramètre
                  {sample.parameters.length > 1 ? "s" : ""}
                </p>
              </div>

              <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                Réceptionner
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
