import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { SERIE_LAB_SELECT, serializeSerie } from "@/lib/serie-select";
import { serieStatus } from "@/lib/series";
import { receivedChecklists } from "@/lib/reception-audit";
import { heldInvoices } from "@/lib/billing-hold";
import {
  SerieReceptionForm,
  type ReceptionSerieData,
} from "@/components/reception/SerieReceptionForm";
import { invoiceReadIds, withVerbFacts } from "@/components/reception/reception-verbs";

export const metadata = { title: "Réception de la série" };

/**
 * The lab's série, plus what « Annuler » says stays of each sample (D1): the
 * contamination alert already sent, and whether a report was issued (no
 * « Annuler » then) — in the série's one query; `withVerbFacts` keeps the
 * alert's date on the server for whoever cannot cancel the sample.
 */
const SERIE_RECEPTION_SELECT = {
  ...SERIE_LAB_SELECT,
  samples: {
    ...SERIE_LAB_SELECT.samples,
    select: { ...SERIE_LAB_SELECT.samples.select, alertsSentAt: true, report: { select: { id: true } } },
  },
} as const;

export default async function SerieReceptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("RECEPTIONNISTE", "ADMIN");
  const { id } = await params;

  // No technician list: nobody assigns one (RETOUR-LABO-06-10.md §9.3) —
  // once programmed, a technician takes the sample from « À prendre »
  // (prise en charge libre, PROGRAMME.md §10); the summary of a received
  // série shows who took each one. The signed protocol's photo (C6) is
  // counted, never read: « Voir » opens it.
  const [serie, settings, photos] = await Promise.all([
    prisma.serie.findUnique({ where: { id }, select: SERIE_RECEPTION_SELECT }),
    getLabSettings(),
    prisma.serie.count({ where: { id, signedProtocolData: { not: null } } }),
  ]);

  if (!serie) notFound();

  // The checklist as decided at reception (A8): each received sample's
  // SAMPLE_RECEIVED entry — reception of a visit and deposit alike write it
  // on « Sample » / the sample's id. One bounded read on the journal's
  // [entity, entityId] index; newest first, the latest entry wins.
  const receivedIds = serie.samples.filter((s) => s.status !== "PRELEVE").map((s) => s.id);
  const [entries, held] = await Promise.all([
    receivedIds.length === 0
      ? []
      : prisma.auditLog.findMany({
          where: { entity: "Sample", entityId: { in: receivedIds }, action: "SAMPLE_RECEIVED" },
          select: { entityId: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: receivedIds.length * 3,
        }),
    // The invoice holding each billable sample this person may cancel or
    // correct, as /validation/[id] and /programmation/[id] read it for
    // theirs: one query for the whole série, none before the programme.
    heldInvoices(invoiceReadIds(serie.samples, session.role)),
  ]);
  const decided = receivedChecklists(receivedIds, entries);

  const lines = { ...serie, samples: withVerbFacts(serie.samples, held, session.role) };
  const data = JSON.parse(
    JSON.stringify({ ...serializeSerie(lines, serieStatus(serie.samples)), hasSignedProtocol: photos > 0 })
  ) as ReceptionSerieData;

  return (
    <div>
      <Link
        href="/reception"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        File de réception
      </Link>
      <SerieReceptionForm
        serie={data}
        thresholds={settings}
        role={session.role}
        decided={decided}
        consultationRequired={settings.consultationRequired}
      />
    </div>
  );
}
