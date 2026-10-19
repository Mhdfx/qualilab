import type { ReactNode } from "react";
import { FlaskConical, ClipboardCheck, AlertTriangle, CheckCircle2, Inbox, type LucideIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView, viewHref } from "@/lib/dashboard-view";
import { BENCH_VIEWS, benchViewWhere, type BenchView } from "@/lib/circuit-views";
import { UNCLAIMED_WHERE, benchQueueWhereFor, takenByOthersWhere } from "@/lib/bench-access";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, type StatAccent } from "@/components/ui/StatCard";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { WorkQueue } from "@/components/technicien/WorkQueue";

export const metadata = { title: "Saisie des résultats" };

/** A ceiling, not a page: « Anomalies » reaches the archive, the bench never should. */
const LIST_LIMIT = 500;

const PATH = "/technicien";
/** Where the menu's « Mes analyses » and every tile land. */
const ANCHOR = "analyses";

/**
 * The tiles, in screen order; each one is a view of the list below (`?vue=`).
 * « À prendre » is the shared list (prise en charge libre, PROGRAMME.md
 * §10): the whole first row on a tablet, one tile among five on a wide screen.
 */
const TILES: { view: BenchView; icon: LucideIcon; accent: StatAccent; wide?: boolean }[] = [
  { view: "a_prendre", icon: Inbox, accent: "brand", wide: true },
  { view: "a_commencer", icon: ClipboardCheck, accent: "amber" },
  { view: "en_analyse", icon: FlaskConical, accent: "blue" },
  { view: "anomalies", icon: AlertTriangle, accent: "violet" },
  { view: "soumis", icon: CheckCircle2, accent: "emerald" },
];

/** What an empty list says, per view. */
const EMPTY: Record<BenchView, { title: string; text: string }> = {
  a_prendre: {
    title: "Rien à prendre",
    text: "Les échantillons dont le programme d'analyse est confirmé apparaissent ici, les urgents d'abord puis les plus anciens, jusqu'à ce qu'un technicien les prenne en charge.",
  },
  a_commencer: {
    title: "Aucune analyse à commencer",
    text: "Les échantillons que vous avez pris en charge et pas encore commencés apparaîtront ici.",
  },
  en_analyse: {
    title: "Aucune analyse en cours",
    text: "Les analyses commencées et pas encore soumises apparaîtront ici.",
  },
  anomalies: {
    title: "Aucun échantillon en anomalie",
    text: "Les échantillons dont un paramètre est signalé en anomalie apparaîtront ici, quelle que soit leur étape.",
  },
  soumis: {
    title: "Aucun résultat en attente de validation",
    text: "Les échantillons soumis à la validation technique apparaîtront ici jusqu'à leur validation.",
  },
};

/** The admin never takes a sample: where the technician reads « vous », they read « un technicien ». */
const ADMIN_EMPTY: Partial<Record<BenchView, { title: string; text: string }>> = {
  a_commencer: {
    title: "Aucune analyse à commencer",
    text: "Les échantillons qu'un technicien a pris en charge et pas encore commencés apparaîtront ici.",
  },
};

/** The default page's two other lists, when they are empty. */
const TAKEN_EMPTY = {
  title: "Aucun échantillon pris en charge",
  text: "Les échantillons que les techniciens prennent en charge apparaîtront ici, chacun avec son titulaire.",
};
const COLLEAGUES_EMPTY = {
  title: "Aucun échantillon pris par un collègue",
  text: "Les échantillons que vos collègues ont pris en charge apparaîtront ici, en lecture seule.",
};

/** One row of every bench list (`WorkItem`): holder, time taken and legacy parameter technicians included. */
const WORK_ITEM_SELECT = {
  id: true,
  code: true,
  controlCode: true,
  type: true,
  status: true,
  // What is analysed: « Planche verte — surface nettoyée » (RETOUR-LABO-06-10.md §5).
  lineNumber: true,
  lineKind: true,
  produit: true,
  surfaceLabel: true,
  surfaceState: true,
  personName: true,
  airMethod: true,
  airExposureMin: true,
  // The nature of analysis — « Microbiologie des aliments »… (14/10).
  nature: { select: { label: true } },
  receivedAt: true,
  conformity: true,
  // « Renvoyé » on a sample a validator sent back to the bench.
  rejectedAt: true,
  priority: true,
  dueAt: true,
  // Who took it and when: « Pris par X · 13 oct. 2026, 09:12 ».
  technicianId: true,
  assignedAt: true,
  technician: { select: { name: true } },
  client: { select: { name: true } },
  serie: { select: { serialNumber: true } },
  parameters: { select: { parameterId: true, technicianId: true, technician: { select: { name: true } } } },
  results: { select: { parameterId: true, value: true, workStatus: true, interpretation: true } },
} as const satisfies Prisma.SampleSelect;

/** The bench order: the urgent samples first, then the oldest receptions. */
const BENCH_ORDER: Prisma.SampleOrderByWithRelationInput[] = [{ priority: "desc" }, { receivedAt: "asc" }];
/** « Anomalies » reaches the archive: the most recent first. */
const ARCHIVE_ORDER: Prisma.SampleOrderByWithRelationInput[] = [{ receivedAt: "desc" }, { id: "asc" }];

export default async function TechnicienPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("TECHNICIEN", "ADMIN");
  const isTechnician = session.role === "TECHNICIEN";
  // A tile is a sort (« comme un tri »): `?vue=` narrows the page to exactly
  // the list that tile counts — one definition each, `circuit-views.ts`.
  const view = parseView((await searchParams)[VIEW_PARAM], BENCH_VIEWS);

  // Prise en charge libre (PROGRAMME.md §10): nobody assigns a technician.
  // A confirmed programme puts the sample in « À prendre », shared by every
  // technician and the admin; the technician who takes it becomes its
  // holder. A technician's own bench is what they hold (« Mes analyses »);
  // their colleagues' samples are listed read-only. The admin never takes:
  // they oversee « À prendre » and every taken sample, holder named.
  const count = (tile: BenchView) => prisma.sample.count({ where: benchViewWhere(tile, session) });
  const list = (where: Prisma.SampleWhereInput, orderBy = BENCH_ORDER) =>
    prisma.sample.findMany({ where, select: WORK_ITEM_SELECT, orderBy, take: LIST_LIMIT });
  const none = Promise.resolve([]);

  // Every list and every count in one round of parallel queries. With a
  // view, the page is that one list; without, the three lists of the bench.
  const [viewItems, free, held, colleagues, toTake, waiting, inProgress, anomalies, submitted] = await Promise.all([
    view ? list(benchViewWhere(view, session), view === "anomalies" ? ARCHIVE_ORDER : BENCH_ORDER) : none,
    view ? none : list(UNCLAIMED_WHERE),
    view ? none : list(isTechnician ? benchQueueWhereFor(session) : takenByOthersWhere(session)),
    view || !isTechnician ? none : list(takenByOthersWhere(session)),
    // Counted with each view's own filter: « Anomalies » counts samples (not
    // readings) and « Résultats soumis » samples already off the bench.
    count("a_prendre"),
    count("a_commencer"),
    count("en_analyse"),
    count("anomalies"),
    count("soumis"),
  ]);

  const values: Record<BenchView, number> = {
    a_prendre: toTake,
    a_commencer: waiting,
    en_analyse: inProgress,
    anomalies,
    soumis: submitted,
  };
  const viewerId = isTechnician ? session.id : null;

  return (
    <div>
      <PageHeader
        badge="Espace technicien"
        title="Saisie des résultats"
        subtitle="Prenez en charge un échantillon « À prendre », saisissez ses résultats paramètre par paramètre, puis soumettez-les à la validation technique."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TILES.map((tile) => (
            <div key={tile.view} className={tile.wide ? "sm:col-span-2 lg:col-span-1" : undefined}>
              <StatCard
                label={BENCH_VIEWS[tile.view]}
                value={values[tile.view]}
                icon={tile.icon}
                accent={tile.accent}
                href={viewHref(PATH, tile.view, ANCHOR)}
                active={view === tile.view}
              />
            </div>
          ))}
        </div>
      </section>

      {view ? (
        <BenchList
          id={ANCHOR}
          title={BENCH_VIEWS[view]}
          count={viewItems.length}
          notice={<ViewFilterNotice label={BENCH_VIEWS[view]} resetHref={viewHref(PATH, null, ANCHOR)} className="mb-3" />}
          truncated={
            viewItems.length === LIST_LIMIT
              ? view === "anomalies"
                ? `Seuls les ${LIST_LIMIT} échantillons les plus récents sont affichés.`
                : `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.`
              : null
          }
        >
          <WorkQueue
            items={viewItems}
            viewerId={viewerId}
            empty={(!isTechnician && ADMIN_EMPTY[view]) || EMPTY[view]}
          />
        </BenchList>
      ) : (
        <div className="space-y-10">
          <BenchList
            id="a-prendre"
            title={BENCH_VIEWS.a_prendre}
            count={free.length}
            description="Programme confirmé, personne ne les a pris : les urgents d'abord, puis les plus anciens."
            truncated={free.length === LIST_LIMIT ? `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.` : null}
          >
            <WorkQueue items={free} viewerId={viewerId} empty={EMPTY.a_prendre} />
          </BenchList>

          <BenchList
            id={ANCHOR}
            title={isTechnician ? "Mes analyses" : "Pris en charge"}
            count={held.length}
            description={
              isTechnician
                ? "Les échantillons que vous avez pris en charge, à commencer ou en cours."
                : "Les échantillons à la paillasse qu'un technicien a pris en charge, avec son nom."
            }
            truncated={held.length === LIST_LIMIT ? `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.` : null}
          >
            <WorkQueue items={held} viewerId={viewerId} empty={isTechnician ? undefined : TAKEN_EMPTY} />
          </BenchList>

          {isTechnician && (
            <BenchList
              id="collegues"
              title="Pris par un collègue"
              count={colleagues.length}
              description="En lecture seule : seul le technicien qui a pris un échantillon en saisit les résultats."
              truncated={
                colleagues.length === LIST_LIMIT ? `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.` : null
              }
            >
              <WorkQueue items={colleagues} viewerId={viewerId} empty={COLLEAGUES_EMPTY} />
            </BenchList>
          )}
        </div>
      )}
    </div>
  );
}

/** One list of the bench under its heading: title, count, what it holds, and its ceiling when reached. */
function BenchList({
  id,
  title,
  count,
  description,
  notice,
  truncated,
  children,
}: {
  id: string;
  title: string;
  count: number;
  description?: string;
  notice?: ReactNode;
  truncated: string | null;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-24">
      <div className="mb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <span className="text-sm text-slate-500">
            {count} échantillon{count > 1 ? "s" : ""}
          </span>
        </div>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {notice}
      {truncated && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          {truncated}
        </p>
      )}
      {children}
    </section>
  );
}
