import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardList, Clock, Lock, User, Zap } from "lucide-react";
import type { AirMethod, Family, LineKind, ProgrammePriority, SampleStatus, SerieKind, SurfaceState } from "@/generated/prisma/enums";
import { LINE_KIND_LABELS, SERIE_KIND_LABELS, formatDateTime, formatDayTime } from "@/lib/labels";
import { labReference } from "@/lib/sample-select";
import { groupQueue } from "@/lib/programmation-queue";
import { sampleRef } from "@/lib/reception-input";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

/** One sample of the responsable des paramètres' queue, as the dashboard selects it. */
export type QueueLine = {
  id: string;
  code: string;
  controlCode: string | null;
  lineNumber: number;
  lineKind: LineKind;
  produit: string | null;
  surfaceLabel: string | null;
  personName: string | null;
  /** « Planche verte — surface nettoyée », « Salle — Boîte exposée 30 min » (RETOUR-LABO-06-10.md §5); null on older samples. */
  surfaceState?: SurfaceState | null;
  airMethod?: AirMethod | null;
  lieu: string;
  status: SampleStatus;
  unitCount: number;
  priority: ProgrammePriority;
  dueAt: Date | null;
  programmedAt: Date | null;
  programmedBy: { id: string; name: string } | null;
  receivedAt: Date | null;
  analysisBlocked: boolean;
  nature: { id: string; label: string; family: Family };
  productType: { id: string; name: string } | null;
  technician: { id: string; name: string } | null;
  client: { id: string; name: string };
  serie: { id: string; serialNumber: string; kind: SerieKind; receivedAt: Date | null };
  parameterCount: number;
};

/**
 * The samples to programme and the programmed ones, grouped by série
 * (PROGRAMME.md §5): the received ones first, the oldest receptions at the
 * head. Each sample — « Échantillon N » of its série, « NM » / « NP » for
 * the two samples of a two-family line — opens its programme sheet.
 */
export function ProgrammationQueue({ lines, now }: { lines: QueueLine[]; now: Date }) {
  if (lines.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <ClipboardList className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">Aucun échantillon à programmer</p>
        <p className="mt-1 text-sm text-slate-500">
          Les échantillons réceptionnés apparaîtront ici dès leur numérotation.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {groupQueue(lines).map((group) => {
        const waiting = group.lines.filter((line) => line.status === "RECU").length;
        return (
          <section key={group.serieId} aria-label={`Série ${group.serialNumber}`}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm font-bold text-brand">Série {group.serialNumber}</span>
              <span className="text-sm font-medium text-slate-700">{group.client.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {SERIE_KIND_LABELS[group.kind]}
              </span>
              <span className="text-xs text-slate-500">
                {group.lines.length} échantillon{group.lines.length > 1 ? "s" : ""}
                {waiting > 0 && waiting < group.lines.length ? ` · ${waiting} à programmer` : ""}
                {group.receivedAt ? ` · reçue le ${formatDateTime(group.receivedAt)}` : ""}
              </span>
            </div>
            <ul className="space-y-3">
              {group.lines.map((line) => {
                const late = line.dueAt !== null && line.dueAt.getTime() < now.getTime();
                const toProgramme = line.status === "RECU";
                return (
                  <li key={line.id}>
                    <Link
                      href={`/programmation/${line.id}`}
                      className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-slate-900">{labReference(line)}</span>
                            <span className="text-xs font-medium text-slate-500">Échantillon {sampleRef(line.lineNumber, line.code)}</span>
                            <StatusBadge status={line.status} />
                            {line.priority === "URGENTE" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                                <Zap className="h-3 w-3" aria-hidden="true" />
                                Urgente
                              </span>
                            )}
                            {late && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                En retard
                              </span>
                            )}
                            {line.analysisBlocked && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                Bloqué en réception
                              </span>
                            )}
                          </div>

                          <p className="mt-1.5 truncate font-semibold text-slate-800">
                            {lineDesignation(line)}
                            <span className="ml-1.5 font-normal text-slate-500">· {line.lieu}</span>
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {line.nature.label} · {LINE_KIND_LABELS[line.lineKind]} · {line.unitCount} unité{line.unitCount > 1 ? "s" : ""}
                            {" · "}
                            {line.parameterCount} analyse{line.parameterCount > 1 ? "s" : ""}
                            {line.productType ? ` · ${line.productType.name}` : ""}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                            {line.technician && (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3.5 w-3.5" aria-hidden="true" />
                                {line.technician.name}
                              </span>
                            )}
                            {line.dueAt && (
                              <span className={`inline-flex items-center gap-1 ${late ? "text-rose-600" : ""}`}>
                                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                rendu promis le {formatDayTime(line.dueAt)}
                              </span>
                            )}
                            {line.programmedAt ? (
                              <span>
                                programmé le {formatDayTime(line.programmedAt)}
                                {line.programmedBy ? ` par ${line.programmedBy.name}` : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                reçu le {line.receivedAt ? formatDayTime(line.receivedAt) : "—"}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                          {toProgramme ? "Programmer" : "Modifier"}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
