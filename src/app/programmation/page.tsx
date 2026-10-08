import { ClipboardList, CheckCircle2, Clock, FlaskConical, type LucideIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView, viewHref } from "@/lib/dashboard-view";
import { PROGRAMMATION_VIEWS, programmationWhere, type ProgrammationView } from "@/lib/circuit-views";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, type StatAccent } from "@/components/ui/StatCard";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { ProgrammationQueue, type QueueLine } from "@/components/programmation/ProgrammationQueue";

export const metadata = { title: "Programmation des analyses" };

/** A ceiling, not a page: the queue is the current work, never the history (same as the API). */
const QUEUE_LIMIT = 1000;

const PATH = "/programmation";
const ANCHOR = "file";

/** The tiles, in screen order; each one is a view of the list below (`?vue=`). */
const TILES: { view: ProgrammationView; icon: LucideIcon; accent: StatAccent }[] = [
  { view: "a_programmer", icon: ClipboardList, accent: "amber" },
  { view: "aujourdhui", icon: CheckCircle2, accent: "emerald" },
  { view: "retard", icon: Clock, accent: "violet" },
  { view: "programmes", icon: FlaskConical, accent: "brand" },
];

/** What an empty list says, per view. */
const EMPTY: Record<ProgrammationView, { title: string; text: string }> = {
  a_programmer: {
    title: "Aucun échantillon à programmer",
    text: "Les échantillons réceptionnés apparaîtront ici dès leur numérotation.",
  },
  aujourdhui: {
    title: "Aucun échantillon programmé aujourd'hui",
    text: "Les programmes confirmés depuis minuit apparaîtront ici, quelle que soit leur étape.",
  },
  retard: {
    title: "Aucun échantillon en retard",
    text: "Aucune date de rendu promise n'est dépassée sur un échantillon en cours.",
  },
  programmes: {
    title: "Aucun échantillon en attente de paillasse",
    text: "Les échantillons programmés apparaîtront ici jusqu'au début de l'analyse.",
  },
};

export default async function ProgrammationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const clock = { now, startOfDay };
  // A tile is a sort (« comme un tri »): `?vue=` narrows the list below to
  // exactly what that tile counts — one definition each, `circuit-views.ts`.
  const view = parseView((await searchParams)[VIEW_PARAM], PROGRAMMATION_VIEWS);
  const count = (tile: ProgrammationView) => prisma.sample.count({ where: programmationWhere(tile, clock) });

  const [, rows, aProgrammer, programmeesAujourdhui, enRetard, enAttente] = await Promise.all([
    // Belt and braces with the layout guard: a page must be safe on its own.
    requireRole("PROGRAMMATEUR", "ADMIN"),
    // The queue of PROGRAMME.md §5: received and programmed samples, grouped
    // by série by the component; a cancelled sample has left the circuit.
    // A view is its own query: « Programmés aujourd'hui » and « En retard »
    // reach samples already past the queue.
    prisma.sample.findMany({
      where: programmationWhere(view, clock),
      select: {
        id: true,
        code: true,
        controlCode: true,
        lineNumber: true,
        lineKind: true,
        produit: true,
        surfaceLabel: true,
        personName: true,
        // « Planche verte — surface nettoyée » / « Air — Biocollecteur ».
        surfaceState: true,
        airMethod: true,
        lieu: true,
        status: true,
        unitCount: true,
        priority: true,
        dueAt: true,
        programmedAt: true,
        programmedBy: { select: { id: true, name: true } },
        receivedAt: true,
        analysisBlocked: true,
        nature: { select: { id: true, label: true, family: true } },
        productType: { select: { id: true, name: true } },
        technician: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        serie: { select: { id: true, serialNumber: true, kind: true, receivedAt: true } },
        parameters: { select: { parameterId: true } },
      },
      // First in, first out (RETOUR-LABO-06-10.md §9.3), as `orderQueue` shows
      // it: RECU before PROGRAMME (MySQL sorts an ENUM by its declared order),
      // then the oldest reception — so a truncated queue keeps the oldest
      // samples still to programme. « …M » before « …P » on a two-family line.
      orderBy: [{ status: "asc" }, { receivedAt: "asc" }, { serieId: "asc" }, { lineNumber: "asc" }, { code: "asc" }],
      take: QUEUE_LIMIT,
    }),
    // Counted with each view's own filter, not read off the capped list.
    count("a_programmer"),
    count("aujourdhui"),
    // A promised delivery date already passed on a sample not yet validated.
    count("retard"),
    count("programmes"),
  ]);

  const lines: QueueLine[] = rows.map(({ parameters, ...row }) => ({
    ...row,
    parameterCount: parameters.length,
  }));
  const values: Record<ProgrammationView, number> = {
    a_programmer: aProgrammer,
    aujourdhui: programmeesAujourdhui,
    retard: enRetard,
    programmes: enAttente,
  };
  const programmeesInList = lines.filter((line) => line.status === "PROGRAMME").length;
  const truncated = rows.length === QUEUE_LIMIT;

  return (
    <div>
      <PageHeader
        badge="Espace programmation"
        title="Programme d'analyse"
        subtitle="Pour chaque échantillon réceptionné, décidez de la nature, du type de produit, des analyses, des nombres, des méthodes et de l'organisation avant la paillasse. La facturation se prépare dès la confirmation."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((tile) => (
            <StatCard
              key={tile.view}
              label={PROGRAMMATION_VIEWS[tile.view]}
              value={values[tile.view]}
              icon={tile.icon}
              accent={tile.accent}
              href={viewHref(PATH, tile.view, ANCHOR)}
              active={view === tile.view}
            />
          ))}
        </div>
      </section>

      <section id={ANCHOR} aria-labelledby="file-title" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="file-title" className="text-lg font-semibold text-slate-900">
            {view ? PROGRAMMATION_VIEWS[view] : "File de programmation"}
          </h2>
          <span className="text-sm text-slate-500">
            {lines.length} échantillon{lines.length > 1 ? "s" : ""}
            {!view && programmeesInList > 0
              ? ` · ${programmeesInList} programmé${programmeesInList > 1 ? "s" : ""}`
              : ""}
          </span>
        </div>
        {view && (
          <ViewFilterNotice
            label={PROGRAMMATION_VIEWS[view]}
            resetHref={viewHref(PATH, null, ANCHOR)}
            className="mb-3"
          />
        )}
        {truncated && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            {view
              ? `La liste est limitée aux ${QUEUE_LIMIT} échantillons les plus anciens.`
              : `La file est tronquée aux ${QUEUE_LIMIT} échantillons les plus anciens : programmez-les pour voir les suivants.`}
          </p>
        )}
        <ProgrammationQueue lines={lines} now={now} empty={EMPTY[view ?? "a_programmer"]} />
      </section>
    </div>
  );
}
