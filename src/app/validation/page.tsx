import { requireRole } from "@/lib/auth";
import { ShieldCheck, ClipboardList, FileCheck2, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView, viewHref } from "@/lib/dashboard-view";
import { VALIDATION_VIEWS, inValidationView, type ValidationView } from "@/lib/circuit-views";
import { rechercheHref } from "@/lib/sample-search";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { ValidationQueue } from "@/components/validation/ValidationQueue";

export const metadata = { title: "Validation des résultats" };

const PATH = "/validation";
const ANCHOR = "file";

/** What an empty list says, per view. */
const EMPTY: Record<ValidationView, { title: string; text: string }> = {
  a_valider: {
    title: "Aucun échantillon à valider",
    text: "Les résultats soumis par les techniciens attendent ici leur validation technique.",
  },
  attente_admin: {
    title: "Aucun échantillon en attente de validation administrative",
    text: "Les échantillons validés techniquement attendent ici leur validation administrative.",
  },
};

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("VALIDATEUR", "ADMIN");
  // A tile is a sort (« comme un tri »): `?vue=` narrows the queue below to
  // exactly what that tile counts (`inValidationView`, one rule for both).
  const view = parseView((await searchParams)[VIEW_PARAM], VALIDATION_VIEWS);
  const [items, valides, rapports, envoyes] = await Promise.all([
    prisma.sample.findMany({
      where: { status: "RESULTATS_SAISIS" },
      select: {
        id: true,
        code: true,
        controlCode: true,
        type: true,
        // What was analysed: « Planche verte — surface nettoyée » (RETOUR-LABO-06-10.md §5).
        lineNumber: true,
        lineKind: true,
        produit: true,
        surfaceLabel: true,
        surfaceState: true,
        personName: true,
        airMethod: true,
        validatedById: true,
        approvedById: true,
        receivedAt: true,
        client: { select: { name: true } },
        serie: { select: { serialNumber: true } },
        technician: { select: { name: true } },
        results: { select: { conform: true, workStatus: true } },
        // AMENDEMENT.md §2: a reopened report shows the badge « Amendement ».
        report: { select: { amendmentPending: true } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.sample.count({ where: { status: "VALIDE" } }),
    prisma.report.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
  ]);

  // The whole queue is loaded (it is the current work, never the history):
  // the tiles count it, the view only narrows what is shown.
  const toValidate = items.filter((item) => inValidationView("a_valider", item)).length;
  const awaitingAdmin = items.filter((item) => inValidationView("attente_admin", item)).length;
  const shown = view ? items.filter((item) => inValidationView(view, item)) : items;

  return (
    <div>
      <PageHeader
        badge="Espace validation"
        title="Validation des résultats"
        subtitle="Contrôlez les résultats face aux seuils. Chaque échantillon requiert la validation technique puis la validation administrative."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* The queue's two steps filter it in place; the steps after it open /recherche. */}
          <StatCard
            label={VALIDATION_VIEWS.a_valider}
            value={toValidate}
            icon={ClipboardList}
            accent="amber"
            href={viewHref(PATH, "a_valider", ANCHOR)}
            active={view === "a_valider"}
          />
          <StatCard
            label={VALIDATION_VIEWS.attente_admin}
            value={awaitingAdmin}
            icon={ShieldCheck}
            accent="violet"
            href={viewHref(PATH, "attente_admin", ANCHOR)}
            active={view === "attente_admin"}
          />
          <StatCard label="Validés" value={valides} icon={FileCheck2} accent="emerald" href={rechercheHref({ status: "VALIDE" })} />
          <StatCard
            label="Rapports envoyés"
            value={envoyes}
            icon={Send}
            accent="brand"
            href={rechercheHref({ status: "RAPPORT_ENVOYE" })}
          />
        </div>
      </section>

      <section id={ANCHOR} aria-labelledby="file-title" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="file-title" className="text-lg font-semibold text-slate-900">
            {view ? VALIDATION_VIEWS[view] : "En attente de validation"}
          </h2>
          <span className="text-sm text-slate-500">
            {shown.length} échantillon{shown.length > 1 ? "s" : ""}
            {!view && rapports > 0 && ` · ${rapports} rapport${rapports > 1 ? "s" : ""}`}
          </span>
        </div>
        {view && (
          <ViewFilterNotice label={VALIDATION_VIEWS[view]} resetHref={viewHref(PATH, null, ANCHOR)} className="mb-3" />
        )}
        <ValidationQueue items={shown} empty={view ? EMPTY[view] : undefined} />
      </section>
    </div>
  );
}
