import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, AlertTriangle, Inbox, Undo2, UserCheck, Zap } from "lucide-react";
import type { AirMethod, LineKind, ProgrammePriority, SampleStatus, SampleType, SurfaceState } from "@/generated/prisma/client";
import { formatDate, formatDateTime } from "@/lib/labels";
import { labReference } from "@/lib/sample-select";
import { groupBySerie } from "@/lib/serie-groups";
import { BENCH_STATUSES, isOnBenchOf, isUnclaimed, splitParameters } from "@/lib/bench-access";
import { reportTechnicianNames } from "@/lib/report-programme";
import { sampleRef } from "@/lib/reception-input";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { TakeButton } from "@/components/technicien/BenchTakeActions";

export type WorkItem = {
  id: string;
  code: string;
  controlCode: string | null;
  type: SampleType;
  status: SampleStatus;
  /** What is analysed — designation, surface state, air method (RETOUR-LABO-06-10.md §5). */
  lineNumber: number;
  lineKind: LineKind;
  produit: string | null;
  surfaceLabel: string | null;
  surfaceState: SurfaceState | null;
  personName: string | null;
  airMethod: AirMethod | null;
  /** The exposed plate's duration (16/10): « Boîte exposée 45 min ». */
  airExposureMin?: number | null;
  /** The nature of analysis — « Microbiologie des aliments »… (the old bench header's « Nature échantillon », 14/10). */
  nature: { label: string };
  receivedAt: Date | null;
  conformity: boolean | null;
  /** The validator's last « Renvoyer au technicien » (never cleared). */
  rejectedAt: Date | null;
  /**
   * That send-back is the current one: not submitted again since
   * (`isCurrentSendBack`, B2) — the « Renvoyé » chip.
   */
  sentBack: boolean;
  /** The programme d'analyse (PROGRAMME.md §3): priority and promised date. */
  priority: ProgrammePriority;
  dueAt: Date | null;
  /** The holder — the technician who took the sample — and when (PROGRAMME.md §10). */
  technicianId: string | null;
  assignedAt: Date | null;
  technician: { name: string } | null;
  client: { name: string };
  serie: { serialNumber: string };
  /** Each parameter with its own technician: set only on lines programmed before 13/10. */
  parameters: { parameterId: string; technicianId: string | null; technician: { name: string } | null }[];
  results: { parameterId: string; value: string | null; workStatus: string; interpretation: string | null }[];
};

const DEFAULT_EMPTY = {
  title: "Aucune analyse en attente",
  text: "Les échantillons que vous prenez en charge apparaîtront ici.",
};

/** The sheet's verb: start a programmed sample, continue one under analysis, read any other step. */
function actionOf(status: SampleStatus) {
  if (status === "PROGRAMME") return "Commencer";
  if (status === "EN_ANALYSE") return "Continuer";
  return "Consulter";
}

/** The chips of a row: « Urgente », « Renvoyé », « Non conforme », the holder. */
const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1";

/** A row's card, whichever element carries the link. */
const ROW =
  "group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:border-brand/30 hover:shadow-md motion-safe:hover:-translate-y-0.5";

/** The sample's reference at the head of its row. */
const REFERENCE = "font-mono text-sm font-semibold text-slate-900";

/**
 * Who holds a line, as the row says it (prise en charge libre,
 * PROGRAMME.md §10): « À prendre » while nobody does, else « Pris par X »
 * with the time it was taken — a line programmed before 13/10 may name
 * its parameter technicians and carry no time.
 */
function HolderChip({ item, free }: { item: WorkItem; free: boolean }) {
  // Free and off the bench (the admin's « Anomalies », « Résultats soumis »):
  // nobody holds it, but there is nothing « à prendre » either.
  if (free && !BENCH_STATUSES.includes(item.status)) return null;
  if (free) {
    return (
      <span className={`${CHIP} bg-brand-light text-brand ring-brand/20`}>
        <Inbox className="h-3 w-3" aria-hidden="true" />À prendre
      </span>
    );
  }
  const holder = reportTechnicianNames(item) ?? "un collègue";
  return (
    <span className={`${CHIP} bg-slate-100 text-slate-700 ring-slate-200`}>
      <UserCheck className="h-3 w-3" aria-hidden="true" />
      {item.assignedAt ? `Pris par ${holder} · ${formatDateTime(item.assignedAt)}` : `Pris par ${holder}`}
    </span>
  );
}

/**
 * What a row says of its sample: reference and badges, what is analysed,
 * for whom, and how far the reading went. `mine` is how many of its
 * parameters are the viewer's — fewer than all only on a line programmed
 * before 13/10.
 */
function RowDetails({
  item,
  reference,
  holder,
  done,
  mine,
}: {
  item: WorkItem;
  reference: ReactNode;
  holder: ReactNode;
  done: number;
  mine: number;
}) {
  const total = item.parameters.length;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {reference}
        <TypeBadge type={item.type} />
        <StatusBadge status={item.status} />
        {item.priority === "URGENTE" && (
          <span className={`${CHIP} bg-rose-50 text-rose-700 ring-rose-200`}>
            <Zap className="h-3 w-3" aria-hidden="true" />
            Urgente
          </span>
        )}
        {item.sentBack && item.rejectedAt && (
          <span
            className={`${CHIP} bg-amber-50 text-amber-800 ring-amber-300`}
            title={`Renvoyé par la validation le ${formatDateTime(item.rejectedAt)}`}
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            Renvoyé
          </span>
        )}
        {item.conformity === false && (
          <span className={`${CHIP} bg-amber-50 text-amber-700 ring-amber-200`}>
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Non conforme
          </span>
        )}
        {holder}
      </div>

      <p className="mt-1.5 truncate font-semibold text-slate-800">
        {lineDesignation(item)}
        <span className="ml-1.5 font-normal text-slate-500">
          · {item.client.name} · échantillon {sampleRef(item.lineNumber, item.code)}
        </span>
      </p>
      <p className="mt-0.5 text-sm text-slate-500">
        {/* The nature of analysis first: which bench reads it (14/10). */}
        <span className="font-medium text-slate-600">{item.nature.label}</span>
        {" · "}
        {done} / {total} paramètre{total > 1 ? "s" : ""} saisi{total > 1 ? "s" : ""}
        {mine < total ? ` · ${mine} pour vous` : ""} · reçu le{" "}
        {item.receivedAt ? formatDate(item.receivedAt) : "—"}
        {item.dueAt ? ` · à rendre le ${formatDate(item.dueAt)}` : ""}
      </p>
    </div>
  );
}

/**
 * A bench list, grouped by série. The list's own order places each group:
 * a série sits at its first sample — the most urgent, then the oldest
 * (`groupBySerie`, WORKFLOW.md §3.4).
 *
 * `viewerId` is the technician looking at the list. Each row then reads
 * as one of three (PROGRAMME.md §10.4): free — « À prendre » and its
 * « Prendre en charge » button; a colleague's — « Pris par X », opened
 * read-only (« Consulter »); mine — the sheet's verb, and on a line
 * programmed before 13/10 how many of its parameters are mine. Null for
 * the admin, who stands in on every sample and never takes one: the row
 * says who holds it, without a button.
 *
 * A dashboard view (`?vue=`, « Anomalies », « Résultats soumis ») may bring
 * samples already off the bench: their sheet opens read-only
 * (« Consulter »), and `empty` says what an empty view means.
 *
 * Every part of a row opens its sheet. A row with nothing to press is one
 * link; a free row's link is its reference, stretched over the card, with
 * « Prendre en charge » above it — never inside it (a button inside an
 * anchor is invalid and would navigate).
 */
export function WorkQueue({
  items,
  viewerId = null,
  empty = DEFAULT_EMPTY,
}: {
  items: WorkItem[];
  viewerId?: string | null;
  empty?: { title: string; text: string };
}) {
  if (items.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <FlaskConical className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">{empty.title}</p>
        <p className="mt-1 text-sm text-slate-500">{empty.text}</p>
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
              const free = isUnclaimed(item);
              const mine = viewerId !== null && isOnBenchOf(item, viewerId);
              // Only a technician takes, and only a sample still on the bench.
              const takeable = viewerId !== null && free && BENCH_STATUSES.includes(item.status);
              const details = (reference: ReactNode) => (
                <RowDetails
                  item={item}
                  reference={reference}
                  // My own rows need no holder: they are « Mes analyses ».
                  holder={mine ? null : <HolderChip item={item} free={free} />}
                  done={done}
                  // On a line programmed before 13/10, how many of its parameters are mine.
                  mine={mine ? splitParameters(item, viewerId).mine.length : total}
                />
              );

              if (takeable) {
                // The reference is the link, stretched over the card; the
                // button sits above it. A phone stacks the button under the
                // row, full width.
                return (
                  <li key={item.id} className={`${ROW} relative has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand has-[a:focus-visible]:ring-offset-2`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      {details(
                        <Link
                          href={`/technicien/${item.id}`}
                          className={`${REFERENCE} after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus:outline-none`}
                        >
                          <span className="sr-only">Ouvrir la fiche — </span>
                          {labReference(item)}
                        </Link>
                      )}
                      <TakeButton sampleId={item.id} openAfter className="relative z-10 shrink-0 sm:max-w-xs sm:text-right" />
                    </div>
                  </li>
                );
              }

              // Nothing to press: the whole card is the link, its verb included.
              const verb = viewerId !== null && !free && !mine ? "Consulter" : actionOf(item.status);
              return (
                <li key={item.id}>
                  <Link
                    href={`/technicien/${item.id}`}
                    className={`${ROW} block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {details(<span className={REFERENCE}>{labReference(item)}</span>)}
                      <span className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                        {verb}
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
