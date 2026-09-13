import Link from "next/link";
import { ArrowRight, Inbox, MapPin, Thermometer, User } from "lucide-react";
import type { SamplerKind, SerieKind } from "@/generated/prisma/enums";
import { SAMPLER_KIND_LABELS, SERIE_KIND_LABELS, formatDateTime, formatDecimal } from "@/lib/labels";
import { Card } from "@/components/ui/Card";

export type QueueSerie = {
  id: string;
  serialNumber: string;
  kind: SerieKind;
  startedAt: Date;
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  samplerKind: SamplerKind;
  samplerName: string | null;
  client: { name: string };
  site: { name: string } | null;
  samplerUser: { name: string } | null;
  samples: { id: string; status: string; nature: { label: string } }[];
};

function samplerOf(serie: QueueSerie) {
  if (serie.samplerKind === "QUALILAB") return serie.samplerUser?.name ?? "Qualilab";
  return serie.samplerName ?? SAMPLER_KIND_LABELS[serie.samplerKind];
}

/**
 * The séries waiting at reception — one row per visit or deposit, not per
 * sample: the cooler arrives as a whole and is received as a whole.
 */
export function SerieQueue({ series }: { series: QueueSerie[] }) {
  if (series.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Inbox className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">Aucune série en attente</p>
        <p className="mt-1 text-sm text-slate-500">
          Les visites enregistrées sur le terrain apparaîtront ici dès leur arrivée au laboratoire.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {series.map((serie) => {
        const pending = serie.samples.filter((s) => s.status === "PRELEVE").length;
        const natures = [...new Set(serie.samples.map((s) => s.nature.label))];
        return (
          <li key={serie.id}>
            <Link
              href={`/reception/series/${serie.id}`}
              className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold text-brand">{serie.serialNumber}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      {SERIE_KIND_LABELS[serie.kind]}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      {pending} ligne{pending > 1 ? "s" : ""} à réceptionner
                      {pending !== serie.samples.length ? ` / ${serie.samples.length}` : ""}
                    </span>
                  </div>

                  <p className="mt-1.5 truncate font-semibold text-slate-800">
                    {serie.client.name}
                    {serie.site ? ` · ${serie.site.name}` : ""}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                      {samplerOf(serie)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {natures.join(", ")}
                    </span>
                    {serie.arrivedAt ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                        arrivée {formatDateTime(serie.arrivedAt)}
                        {serie.coolerTemperature !== null ? ` · ${formatDecimal(serie.coolerTemperature)} °C` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                        arrivée à renseigner
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-400">Prélevé le {formatDateTime(serie.startedAt)}</p>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  Réceptionner
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
