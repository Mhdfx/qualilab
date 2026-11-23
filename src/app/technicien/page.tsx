import type { ReactNode } from "react";
import Link from "@/components/ui/AppLink";
import { FlaskConical, ClipboardCheck, AlertTriangle, CheckCircle2, Inbox, type LucideIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView } from "@/lib/dashboard-view";
import { BENCH_VIEWS, benchViewWhere, type BenchView } from "@/lib/circuit-views";
import { UNCLAIMED_WHERE, benchHidesClient, benchQueueWhereFor, colleaguesListed, takenByOthersWhere } from "@/lib/bench-access";
import {
  BENCH_ORDER,
  TAKE_SORTS,
  TAKE_SORT_PARAM,
  parseTakeSort,
  takeListDescription,
  takeListOrder,
  takeListRows,
  takeSortQuery,
  truncatedTakeNotice,
  type TakeSort,
} from "@/lib/bench-order";
import { TAKE_LIST_BY_NUMBER, TAKE_OVER_COLLEAGUE } from "@/lib/lab-proposals";
import { isCurrentSendBack, maySendBack, type SendBackState } from "@/lib/send-back";
import { lastSubmissionsOf } from "@/lib/send-back-server";
import { holderTakesOf } from "@/lib/take-over-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, type StatAccent } from "@/components/ui/StatCard";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { WorkQueue, type WorkItem } from "@/components/technicien/WorkQueue";
import { ReceivedAgeFilter } from "@/components/technicien/ReceivedAgeFilter";
import { RECEIVED_AGE_PARAM, parseReceivedAge, receivedAgeHref, receivedBefore } from "@/lib/received-age";
import { SHOWN_PARAM, moreHref, parseShown } from "@/lib/render-cap";

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
    text: TAKE_LIST_BY_NUMBER
      ? "Les échantillons dont le programme d'analyse est confirmé apparaissent ici, par numéro, jusqu'à ce qu'un technicien les prenne en charge."
      : "Les échantillons dont le programme d'analyse est confirmé apparaissent ici, les urgents d'abord puis les plus anciens, jusqu'à ce qu'un technicien les prenne en charge.",
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

/**
 * One row of every bench list (`WorkItem`): holder, time taken and legacy
 * parameter technicians included — without the client: a technician's blind
 * bench (re-ask 2.15, `benchHidesClient`) never loads it.
 */
const BLIND_WORK_ITEM_SELECT = {
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
  // « Renvoyé » on a sample a validator sent back to the bench, while not
  // submitted again since (`isCurrentSendBack`).
  rejectedAt: true,
  priority: true,
  dueAt: true,
  // Who took it and when: « Pris par X · 13 oct. 2026, 09:12 ».
  technicianId: true,
  assignedAt: true,
  technician: { select: { name: true } },
  serie: { select: { serialNumber: true } },
  parameters: { select: { parameterId: true, technicianId: true, technician: { select: { name: true } } } },
  results: { select: { parameterId: true, value: true, workStatus: true, interpretation: true } },
} as const satisfies Prisma.SampleSelect;

/** The same row with its client: the admin's bench, or the technician's when the switch is off. */
const WORK_ITEM_SELECT = {
  ...BLIND_WORK_ITEM_SELECT,
  client: { select: { name: true } },
} as const satisfies Prisma.SampleSelect;

/** « Anomalies » reaches the archive: the most recent first. */
const ARCHIVE_ORDER: Prisma.SampleOrderByWithRelationInput[] = [{ receivedAt: "desc" }, { id: "asc" }];

export default async function TechnicienPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("TECHNICIEN", "ADMIN");
  const isTechnician = session.role === "TECHNICIEN";
  // The technician's bench names no client (re-ask 2.15): not even loaded.
  const blind = benchHidesClient(session.role);
  // A tile is a sort (« comme un tri »): `?vue=` narrows the page to exactly
  // the list that tile counts — one definition each, `circuit-views.ts`.
  const params = await searchParams;
  const view = parseView(params[VIEW_PARAM], BENCH_VIEWS);
  // « Reçus depuis plus de N jours » (G5, 2.20 (k)): narrows every list of
  // the page, calendar days on the laboratory's clock (`received-age.ts`).
  // The tiles keep counting the whole bench.
  const age = parseReceivedAge(params[RECEIVED_AGE_PARAM]);
  // « À prendre » by N° de série, or by N° de contrôle (J8, Q106 of 20/11):
  // kept in every link of the page, as the filter is.
  const sort = parseTakeSort(params[TAKE_SORT_PARAM]);
  const kept = TAKE_LIST_BY_NUMBER ? takeSortQuery(sort) : {};
  const takeOrder = takeListOrder(sort);
  // The rows each list draws (`?afficher=`, lot performance P2-10); each list
  // is still the whole list — its count, its order and its notices. The
  // next step keeps the view, the age filter and the order.
  const shown = parseShown(params[SHOWN_PARAM]);
  const cap = {
    limit: shown,
    moreHref: moreHref(PATH, { [VIEW_PARAM]: view, [RECEIVED_AGE_PARAM]: age === null ? null : String(age), ...kept }, shown),
  };
  // A technician lists their colleagues' samples only while J7 is off (2.14 of 20/11, « pas visible »).
  const listColleagues = colleaguesListed(session.role);
  const now = new Date();
  const aged = (where: Prisma.SampleWhereInput): Prisma.SampleWhereInput =>
    age === null ? where : { AND: [where, { receivedAt: { lt: receivedBefore(age, now) } }] };

  // Prise en charge libre (PROGRAMME.md §10): nobody assigns a technician.
  // A confirmed programme puts the sample in « À prendre », shared by every
  // technician and the admin; the technician who takes it becomes its
  // holder. A technician's own bench is what they hold (« Mes analyses »);
  // their colleagues' samples are listed read-only. The admin never takes:
  // they oversee « À prendre » and every taken sample, holder named.
  const count = (tile: BenchView) => prisma.sample.count({ where: benchViewWhere(tile, session) });
  const list = (where: Prisma.SampleWhereInput, orderBy = BENCH_ORDER): Promise<Omit<WorkItem, "sentBack" | "takenOverAt" | "takenAt">[]> =>
    blind
      ? prisma.sample.findMany({ where: aged(where), select: BLIND_WORK_ITEM_SELECT, orderBy, take: LIST_LIMIT })
      : prisma.sample.findMany({ where: aged(where), select: WORK_ITEM_SELECT, orderBy, take: LIST_LIMIT });
  const none: Promise<Omit<WorkItem, "sentBack" | "takenOverAt" | "takenAt">[]> = Promise.resolve([]);

  // Every list and every count in one round of parallel queries. With a
  // view, the page is that one list; without, the three lists of the bench.
  const [loadedView, loadedFree, held, colleagues, toTake, waiting, inProgress, anomalies, submitted] = await Promise.all([
    view
      ? list(
          benchViewWhere(view, session),
          view === "anomalies" ? ARCHIVE_ORDER : view === "a_prendre" ? takeOrder : BENCH_ORDER
        )
      : none,
    view ? none : list(UNCLAIMED_WHERE, takeOrder),
    view ? none : list(isTechnician ? benchQueueWhereFor(session) : takenByOthersWhere(session)),
    view || !listColleagues ? none : list(takenByOthersWhere(session)),
    // Counted with each view's own filter: « Anomalies » counts samples (not
    // readings) and « Résultats soumis » samples already off the bench.
    count("a_prendre"),
    count("a_commencer"),
    count("en_analyse"),
    count("anomalies"),
    count("soumis"),
  ]);

  // « À prendre » sorted again by the numbers themselves (J8): the database
  // ranks by the instant each was drawn at, which two overlapping
  // receptions may invert (`compareTakeOrder`, review of lot 5A).
  const viewItems = view === "a_prendre" ? takeListRows(sort, loadedView) : loadedView;
  const free = takeListRows(sort, loadedFree);
  // Cut at LIST_LIMIT, « À prendre » no longer has its urgent samples first
  // (hypothèse D-2): the notice counts those left out.
  const takeShown = view === "a_prendre" ? viewItems : view ? null : free;
  const urgentToTake =
    takeShown && takeShown.length === LIST_LIMIT && TAKE_LIST_BY_NUMBER
      ? await prisma.sample.count({ where: aged({ AND: [UNCLAIMED_WHERE, { priority: "URGENTE" }] }) })
      : 0;
  const takeTruncated = takeShown
    ? truncatedTakeNotice(takeShown.length, LIST_LIMIT, takeShown.filter((item) => item.priority === "URGENTE").length, urgentToTake)
    : null;

  // « Renvoyé » only while the send-back is unanswered (B2): one grouped
  // read of the journal, for the few rows that may show it. « Repris par B
  // · <time> » (C3): a take-over never moves `assignedAt` (the start of the
  // analyses), its journal row dates it — and so does a take after an
  // administrator handed the sample over with its readings (J7, review of
  // lot 5A): « Pris par B · <time> » is B's take, never A's.
  const rows = [...viewItems, ...free, ...held, ...colleagues];
  const [submissions, takes] = await Promise.all([
    lastSubmissionsOf(rows.filter(maySendBack).map((item) => item.id)),
    holderTakesOf(rows),
  ]);
  const withSendBack = <T extends SendBackState & { id: string; assignedAt: Date | null }>(items: T[]) =>
    items.map((item) => ({
      ...item,
      sentBack: isCurrentSendBack(item, submissions.get(item.id) ?? null),
      takenOverAt: takes.get(item.id)?.takeOver?.at ?? null,
      takenAt: takes.get(item.id)?.takenAt ?? item.assignedAt,
    }));

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
                href={receivedAgeHref(PATH, tile.view, age, ANCHOR, kept)}
                active={view === tile.view}
              />
            </div>
          ))}
        </div>
      </section>

      <ReceivedAgeFilter path={PATH} view={view} days={age} anchor={ANCHOR} kept={kept} />

      {view ? (
        <BenchList
          id={ANCHOR}
          title={BENCH_VIEWS[view]}
          count={viewItems.length}
          description={view === "a_prendre" ? takeListDescription(sort) : undefined}
          notice={
            <>
              <ViewFilterNotice label={BENCH_VIEWS[view]} resetHref={receivedAgeHref(PATH, null, age, ANCHOR, kept)} className="mb-3" />
              {view === "a_prendre" && TAKE_LIST_BY_NUMBER && (
                <TakeSortChoice sort={sort} hrefOf={(choice) => receivedAgeHref(PATH, view, age, ANCHOR, takeSortQuery(choice))} />
              )}
            </>
          }
          truncated={
            view === "a_prendre"
              ? takeTruncated
              : viewItems.length === LIST_LIMIT
                ? view === "anomalies"
                  ? `Seuls les ${LIST_LIMIT} échantillons les plus récents sont affichés.`
                  : `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.`
                : null
          }
        >
          <WorkQueue
            items={withSendBack(viewItems)}
            viewerId={viewerId}
            now={now}
            empty={(!isTechnician && ADMIN_EMPTY[view]) || EMPTY[view]}
            cap={cap}
          />
        </BenchList>
      ) : (
        <div className="space-y-10">
          <BenchList
            id="a-prendre"
            title={BENCH_VIEWS.a_prendre}
            count={free.length}
            description={takeListDescription(sort)}
            notice={
              TAKE_LIST_BY_NUMBER ? (
                <TakeSortChoice
                  sort={sort}
                  hrefOf={(choice) => receivedAgeHref(PATH, null, age, "a-prendre", takeSortQuery(choice))}
                />
              ) : undefined
            }
            truncated={takeTruncated}
          >
            <WorkQueue items={withSendBack(free)} viewerId={viewerId} now={now} empty={EMPTY.a_prendre} cap={cap} />
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
            <WorkQueue
              items={withSendBack(held)}
              viewerId={viewerId}
              now={now}
              empty={isTechnician ? undefined : TAKEN_EMPTY}
              cap={cap}
            />
          </BenchList>

          {listColleagues && (
            <BenchList
              id="collegues"
              title="Pris par un collègue"
              count={colleagues.length}
              description={
                TAKE_OVER_COLLEAGUE
                  ? "En lecture seule : le technicien qui a pris un échantillon en saisit les résultats. Ouvrez-en un pour le reprendre si son titulaire ne peut pas le terminer."
                  : "En lecture seule : seul le technicien qui a pris un échantillon en saisit les résultats."
              }
              truncated={
                colleagues.length === LIST_LIMIT ? `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.` : null
              }
            >
              <WorkQueue items={withSendBack(colleagues)} viewerId={viewerId} now={now} empty={COLLEAGUES_EMPTY} cap={cap} />
            </BenchList>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * « Trier par : N° de série · N° de contrôle » above « À prendre » (J8): two
 * links, the order in force marked as the current one. Server-rendered.
 */
function TakeSortChoice({ sort, hrefOf }: { sort: TakeSort; hrefOf: (sort: TakeSort) => string }) {
  return (
    <nav aria-label="Ordre de la liste « À prendre »" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">Trier par :</span>
      {(Object.keys(TAKE_SORTS) as TakeSort[]).map((choice) =>
        choice === sort ? (
          <span
            key={choice}
            aria-current="true"
            className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand"
          >
            {TAKE_SORTS[choice]}
          </span>
        ) : (
          <Link
            key={choice}
            href={hrefOf(choice)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {TAKE_SORTS[choice]}
          </Link>
        )
      )}
    </nav>
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
