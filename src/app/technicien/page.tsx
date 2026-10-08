import { FlaskConical, ClipboardCheck, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView, viewHref } from "@/lib/dashboard-view";
import { BENCH_VIEWS, benchViewWhere, type BenchView } from "@/lib/circuit-views";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, type StatAccent } from "@/components/ui/StatCard";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { WorkQueue } from "@/components/technicien/WorkQueue";

export const metadata = { title: "Saisie des résultats" };

/** A ceiling, not a page: « Anomalies » reaches the archive, the bench never should. */
const LIST_LIMIT = 500;

const PATH = "/technicien";
const ANCHOR = "analyses";

/** The tiles, in screen order; each one is a view of the list below (`?vue=`). */
const TILES: { view: BenchView; icon: LucideIcon; accent: StatAccent }[] = [
  { view: "a_commencer", icon: ClipboardCheck, accent: "amber" },
  { view: "en_analyse", icon: FlaskConical, accent: "blue" },
  { view: "anomalies", icon: AlertTriangle, accent: "violet" },
  { view: "soumis", icon: CheckCircle2, accent: "emerald" },
];

/** What an empty list says, per view. */
const EMPTY: Record<BenchView, { title: string; text: string }> = {
  a_commencer: {
    title: "Aucune analyse à commencer",
    text: "Les échantillons que le responsable des paramètres vous attribue au programme d'analyse apparaîtront ici.",
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

export default async function TechnicienPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("TECHNICIEN", "ADMIN");
  // A tile is a sort (« comme un tri »): `?vue=` narrows the list below to
  // exactly what that tile counts — one definition each, `circuit-views.ts`.
  const view = parseView((await searchParams)[VIEW_PARAM], BENCH_VIEWS);

  // A technician's bench is the samples they hold or share a parameter of
  // (PROGRAMME.md §6); ADMIN oversees everything. Only a programmed sample
  // reaches the bench: a received one waits for its programme. Every view
  // stays inside that bench (`benchViewWhere`).
  const count = (tile: BenchView) => prisma.sample.count({ where: benchViewWhere(tile, session) });

  const [items, waiting, inProgress, anomalies, submitted] = await Promise.all([
    prisma.sample.findMany({
      where: benchViewWhere(view, session),
      select: {
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
        receivedAt: true,
        conformity: true,
        priority: true,
        dueAt: true,
        technicianId: true,
        client: { select: { name: true } },
        serie: { select: { serialNumber: true } },
        parameters: { select: { parameterId: true, technicianId: true } },
        results: { select: { parameterId: true, value: true, workStatus: true, interpretation: true } },
      },
      // The urgent samples first, then the oldest receptions — except
      // « Anomalies », which reaches the archive: the most recent first.
      orderBy:
        view === "anomalies"
          ? [{ receivedAt: "desc" }, { id: "asc" }]
          : [{ priority: "desc" }, { receivedAt: "asc" }],
      take: LIST_LIMIT,
    }),
    // Counted with each view's own filter: « Anomalies » counts samples (not
    // readings) and « Résultats soumis » samples already off the bench.
    count("a_commencer"),
    count("en_analyse"),
    count("anomalies"),
    count("soumis"),
  ]);

  const values: Record<BenchView, number> = {
    a_commencer: waiting,
    en_analyse: inProgress,
    anomalies,
    soumis: submitted,
  };
  const truncated = items.length === LIST_LIMIT;

  return (
    <div>
      <PageHeader
        badge="Espace technicien"
        title="Saisie des résultats"
        subtitle="Saisissez les résultats paramètre par paramètre, puis soumettez-les à la validation technique."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((tile) => (
            <StatCard
              key={tile.view}
              label={BENCH_VIEWS[tile.view]}
              value={values[tile.view]}
              icon={tile.icon}
              accent={tile.accent}
              href={viewHref(PATH, tile.view, ANCHOR)}
              active={view === tile.view}
            />
          ))}
        </div>
      </section>

      <section id={ANCHOR} aria-labelledby="analyses-title" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="analyses-title" className="text-lg font-semibold text-slate-900">
            {view ? BENCH_VIEWS[view] : "Mes analyses"}
          </h2>
          <span className="text-sm text-slate-500">
            {items.length} échantillon{items.length > 1 ? "s" : ""}
          </span>
        </div>
        {view && (
          <ViewFilterNotice label={BENCH_VIEWS[view]} resetHref={viewHref(PATH, null, ANCHOR)} className="mb-3" />
        )}
        {truncated && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            {view === "anomalies"
              ? `Seuls les ${LIST_LIMIT} échantillons les plus récents sont affichés.`
              : `La liste est limitée aux ${LIST_LIMIT} premiers échantillons.`}
          </p>
        )}
        <WorkQueue
          items={items}
          viewerId={session.role === "TECHNICIEN" ? session.id : null}
          empty={view ? EMPTY[view] : undefined}
        />
      </section>
    </div>
  );
}
