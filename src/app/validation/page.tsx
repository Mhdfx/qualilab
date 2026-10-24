import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ShieldCheck, ClipboardList, FileCheck2, Send } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView, viewHref } from "@/lib/dashboard-view";
import {
  TO_SEND_PAGE_SIZE,
  TO_SEND_STATUS,
  VALIDATION_VIEWS,
  inValidationView,
  validationViewWhere,
  type ValidationView,
} from "@/lib/circuit-views";
import { rechercheHref } from "@/lib/sample-search";
import { SERIES_VALIDATION } from "@/lib/lab-proposals";
import { serieBatchCounts, serieViewActions } from "@/lib/serie-validation";
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
  a_envoyer: {
    title: "Aucun rapport à envoyer",
    text: "Les échantillons validés dont le rapport n'est pas encore parti attendent ici l'envoi au client.",
  },
};

/** What a line of the queue, or of « Validés — à envoyer », shows. */
const ITEM_SELECT = {
  id: true,
  code: true,
  controlCode: true,
  type: true,
  status: true,
  // What was analysed: « Planche verte — surface nettoyée » (RETOUR-LABO-06-10.md §5).
  lineNumber: true,
  lineKind: true,
  produit: true,
  surfaceLabel: true,
  surfaceState: true,
  personName: true,
  airMethod: true,
  airExposureMin: true,
  validatedById: true,
  approvedById: true,
  // « validé le … » on a line waiting to be sent, and « En retard » past the promised date.
  approvedAt: true,
  dueAt: true,
  receivedAt: true,
  client: { select: { name: true } },
  // `id`: the série's own actions (« toute la série », re-ask 2.16).
  serie: { select: { id: true, serialNumber: true } },
  // « Analysé par »: who took it at the bench, then the technicians a
  // legacy programme handed parameters to (only those rows are read).
  technician: { select: { name: true } },
  parameters: {
    where: { technicianId: { not: null } },
    select: { technician: { select: { name: true } } },
  },
  results: { select: { conform: true, workStatus: true } },
  // AMENDEMENT.md §2: a reopened report shows the badge « Amendement ».
  report: { select: { amendmentPending: true } },
} satisfies Prisma.SampleSelect;

/**
 * A sample of a série shown, as the série buttons count it
 * (`serieBatchCounts`): its report's number, version and sends say whether
 * « Envoyer la série » takes it (`serieSendRefusal`, re-ask 2.16).
 */
const SERIE_COUNT_SELECT = {
  status: true,
  validatedById: true,
  serie: { select: { id: true, serialNumber: true } },
  report: { select: { amendmentPending: true, number: true, version: true, sentAt: true, amendedAt: true } },
} satisfies Prisma.SampleSelect;

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("VALIDATEUR", "DIRECTION", "ADMIN");
  // A tile is a sort (« comme un tri »): `?vue=` narrows the queue below to
  // exactly what that tile counts (`inValidationView`, one rule for both).
  const view = parseView((await searchParams)[VIEW_PARAM], VALIDATION_VIEWS);
  const [items, toSendCount, rapports, envoyes, toSend] = await Promise.all([
    prisma.sample.findMany({
      where: validationViewWhere(null),
      select: ITEM_SELECT,
      orderBy: { receivedAt: "asc" },
    }),
    prisma.sample.count({ where: validationViewWhere("a_envoyer") }),
    prisma.report.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
    // « Validés — à envoyer » (16/10, Q92), read only when shown: the longest
    // waiting first, a page of them (they accumulate now that nothing leaves
    // on its own), grouped by série below; the rest opens in /recherche.
    view === "a_envoyer"
      ? prisma.sample.findMany({
          where: validationViewWhere("a_envoyer"),
          select: ITEM_SELECT,
          orderBy: [{ approvedAt: "asc" }, { id: "asc" }],
          take: TO_SEND_PAGE_SIZE,
        })
      : Promise.resolve(null),
  ]);
  // One clock for the « En retard » of every line (`isSendLate`).
  const now = new Date();

  // The whole queue is loaded (it is the current work, never the history):
  // the tiles count it, the view only narrows what is shown.
  const toValidate = items.filter((item) => inValidationView("a_valider", item)).length;
  const awaitingAdmin = items.filter((item) => inValidationView("attente_admin", item)).length;
  const shown = view === "a_envoyer" ? (toSend ?? []) : view ? items.filter((item) => inValidationView(view, item)) : items;
  // « Toute la série » (re-ask 2.16, `SERIES_VALIDATION`): per série shown,
  // what its buttons would take for this person — counted over the whole
  // série, as the dialog's plan reads it (« à envoyer » shows a page of
  // lines, which may hold part of a série only), with the actions of the
  // view's own step (`serieViewActions`).
  const serieIds = [...new Set(shown.map((item) => item.serie.id))];
  const serieRows =
    SERIES_VALIDATION && serieIds.length > 0
      ? await prisma.sample.findMany({
          where: { serieId: { in: serieIds }, status: { in: ["RESULTATS_SAISIS", TO_SEND_STATUS] } },
          select: SERIE_COUNT_SELECT,
        })
      : [];
  const serieActions = SERIES_VALIDATION ? serieBatchCounts(serieRows, session, serieViewActions(view)) : null;

  return (
    <div>
      <PageHeader
        badge="Espace validation"
        title="Validation des résultats"
        subtitle="Contrôlez les résultats face aux seuils. Chaque échantillon requiert la validation technique puis la validation administrative."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* The queue's two steps and « à envoyer » filter in place; the sent reports open /recherche. */}
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
          {/* Nothing leaves automatically (16/10, Q92): the approved samples
              wait here for « Envoyer au client ». */}
          <StatCard
            label={VALIDATION_VIEWS.a_envoyer}
            value={toSendCount}
            icon={FileCheck2}
            accent="emerald"
            href={viewHref(PATH, "a_envoyer", ANCHOR)}
            active={view === "a_envoyer"}
          />
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
            {view === "a_envoyer" && toSendCount > shown.length
              ? `${shown.length} sur ${toSendCount} échantillons`
              : `${shown.length} échantillon${shown.length > 1 ? "s" : ""}`}
            {!view && rapports > 0 && ` · ${rapports} rapport${rapports > 1 ? "s" : ""}`}
          </span>
        </div>
        {view && (
          <ViewFilterNotice label={VALIDATION_VIEWS[view]} resetHref={viewHref(PATH, null, ANCHOR)} className="mb-3" />
        )}
        <ValidationQueue items={shown} empty={view ? EMPTY[view] : undefined} now={now} serieActions={serieActions} />
        {view === "a_envoyer" && toSendCount > shown.length && (
          <p className="mt-4 text-sm text-slate-600">
            Les {TO_SEND_PAGE_SIZE} qui attendent depuis le plus longtemps sont affichés.{" "}
            <Link
              href={rechercheHref({ status: TO_SEND_STATUS })}
              className="font-medium text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Voir les {toSendCount} dans la recherche
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
