import { AlertTriangle } from "lucide-react";
import type { ConsultationChannel, NonConformityReason } from "@/generated/prisma/enums";
import { NON_CONFORMITY_REASON_LABELS, formatDayTime } from "@/lib/labels";
import { consultationText, storedConsultation } from "@/lib/client-consultation";

/** The reception decision as stored on the sample — every page selects these columns. */
export type ReceptionNonConformityData = {
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  clientConsultedName: string | null;
  clientConsultationChannel: ConsultationChannel | null;
  clientConsultedAt: Date | string | null;
  awaitingClientSince: Date | string | null;
};

/** The columns behind `ReceptionNonConformityData`, for a Prisma `select`. */
export const RECEPTION_NON_CONFORMITY_SELECT = {
  conformity: true,
  conformityReason: true,
  conformityNote: true,
  clientConsultedName: true,
  clientConsultationChannel: true,
  clientConsultedAt: true,
  awaitingClientSince: true,
} as const;

/**
 * « Non conforme à réception — <motif>. <précision> », plus what was decided
 * with the client (A9): « Analysé avec l'accord de X (tél., 10/10 14:05). »
 * or « En attente de l'avis du client depuis le 10/10 14:05. ». One paragraph
 * for the programme sheet, the bench and the validation page, so the three
 * never word the reception's decision differently. Renders nothing for a
 * sample received conforme. `blind` (a technician's bench, re-ask 2.15):
 * the agreement is said without the client's person who gave it.
 */
export function ReceptionNonConformity({
  sample,
  blind = false,
}: {
  sample: ReceptionNonConformityData;
  blind?: boolean;
}) {
  if (sample.conformity !== false) return null;
  const agreement = storedConsultation(sample);
  return (
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        <b>Non conforme à réception</b>
        {sample.conformityReason ? ` — ${NON_CONFORMITY_REASON_LABELS[sample.conformityReason]}` : ""}.
        {sample.conformityNote && ` ${sample.conformityNote}`}
        {agreement ? (
          <span className="mt-0.5 block">
            {blind ? "Analysé avec l'accord du client." : <>Analysé avec l&apos;{consultationText(agreement)}.</>}
          </span>
        ) : sample.awaitingClientSince ? (
          <span className="mt-0.5 block">
            En attente de l&apos;avis du client depuis le {formatDayTime(sample.awaitingClientSince)}.
          </span>
        ) : null}
      </span>
    </p>
  );
}
