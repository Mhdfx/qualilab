import type { CancelReason, EilStatus, NonConformityReason } from "@/generated/prisma/enums";
import { CANCEL_REASON_LABELS, NON_CONFORMITY_REASON_LABELS } from "./labels";
import { labDayStart } from "./lab-day-range";
import { labDayOf } from "./lab-time";
import type { OnssaGroupRef, OnssaMonth, OnssaSampleInput } from "./onssa-report";
import { formatDay } from "./wall-input";

/**
 * Lot 6C, N4 (RETOUR-LABO-25-11.md §3.1, §7) — what the application knows of
 * section III of the canevas of 2026, read for the month (pure: the server
 * reads, `onssa-report-server.ts`; this shapes):
 *
 * - III-1 « Essais inter labo » — the EIL of the year up to the month's end,
 *   and those still open whatever their date;
 * - III-5 « Réseau de surveillance sanitaire : liste des souches isolées » —
 *   the sensitive germs (`AnalysisParameter.alertOnExceed`) read as detected
 *   (`Result.detected`) in the month's declared samples: day of reception,
 *   germ, family / type d'analyse, city of the site (« Non précisée »);
 * - III-6-1 « références utilisées pour l'interprétation » — the regulations
 *   chosen on the month's declared samples;
 * - III-6-3 « retour d'information sur la qualité des prélèvements reçus » —
 *   the non-conformities declared at reception of the month, by motif, and the
 *   samples rejected or destroyed at reception;
 * - IV (option `ONSSA_IV_NON_ACCREDITED`) — the parameters marked « non
 *   accrédité ».
 *
 * III-2 (accréditation), III-3 (formations), III-4 (participations), III-6-2
 * and III-6-4 have no model in the application: left for the laboratory.
 * Nothing here names a client.
 */

export type OnssaEilInput = {
  name: string;
  organizer: string | null;
  scope: string | null;
  startDate: Date | null;
  resultDate: Date | null;
  status: EilStatus;
  outcome: string | null;
  satisfactory: boolean | null;
};

/** III-1's six columns, as the canevas titles them. */
export type OnssaEilRow = {
  /** « Parametres »: the scope, else the campaign's name. */
  parameter: string;
  /** « Méthode utilisée »: the campaign's name when the scope fills « Parametres ». */
  method: string;
  /** « Validation de la méthode »: not held by the application. */
  validation: string;
  organizer: string;
  /** « Date de réalisation de l'EIL »: the start day, else the status. */
  date: string;
  /** « Résultats »: the outcome, else satisfactory or not, else the status. */
  result: string;
};

export type OnssaStrainRow = { day: string; germ: string; product: string; region: string };

export type OnssaCountRow = { label: string; samples: number };

export type OnssaSections = {
  eil: OnssaEilRow[];
  strains: OnssaStrainRow[];
  regulations: OnssaCountRow[];
  reception: OnssaCountRow[];
  /** IV — names of the parameters marked « non accrédité » (option). */
  nonAccredited: string[];
};

export const EMPTY_ONSSA_SECTIONS: OnssaSections = {
  eil: [],
  strains: [],
  regulations: [],
  reception: [],
  nonAccredited: [],
};

export const EIL_STATUS_WORDS: Record<EilStatus, string> = {
  PREVUE: "Prévu",
  EN_COURS: "En cours",
  RESULTATS_RECUS: "Résultats reçus",
  CLOTUREE: "Clôturé",
};

export const NO_REGION = "Non précisée";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

const dayText = (date: Date | null) => (date ? formatDay(labDayOf(date)) : "");

/** The midnight opening the month's year: the EIL of the year are those started since. */
export function onssaYearStart(month: Pick<OnssaMonth, "month" | "from">): Date {
  return labDayStart(`${month.month.slice(0, 4)}-01-01`) ?? month.from;
}

/**
 * An EIL in III-1: started in the year up to the month's end, or not
 * started / still open (not « Clôturé ») and planned before the month's end.
 */
export function isEilOfMonth(campaign: Pick<OnssaEilInput, "startDate" | "status">, yearStart: Date, until: Date): boolean {
  const start = campaign.startDate;
  if (start && start >= until) return false;
  if (start && start >= yearStart) return true;
  return campaign.status !== "CLOTUREE";
}

export function eilRows(campaigns: OnssaEilInput[]): OnssaEilRow[] {
  return [...campaigns]
    .sort(
      (a, b) =>
        (a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        collator.compare(a.name, b.name)
    )
    .map((campaign) => {
      const scope = campaign.scope?.trim();
      const status = EIL_STATUS_WORDS[campaign.status];
      const verdict =
        campaign.satisfactory === true ? "Satisfaisant" : campaign.satisfactory === false ? "Non satisfaisant" : "";
      const outcome = campaign.outcome?.trim();
      return {
        parameter: scope || campaign.name.trim(),
        method: scope ? campaign.name.trim() : "",
        validation: "",
        organizer: campaign.organizer?.trim() ?? "",
        date: dayText(campaign.startDate) || status,
        result: [outcome, verdict].filter(Boolean).join(" — ") || status,
      };
    });
}

/** The samples of the report: those of a known group (the others are not declared). */
function declaredSamples(samples: OnssaSampleInput[], groups: OnssaGroupRef[]): OnssaSampleInput[] {
  const known = new Set(groups.map((group) => group.id));
  return samples.filter((sample) => sample.groupId !== null && known.has(sample.groupId));
}

/** III-5: one line per sensitive germ read as detected in a declared sample. */
export function strainRows(samples: OnssaSampleInput[], groups: OnssaGroupRef[]): OnssaStrainRow[] {
  const rows: (OnssaStrainRow & { sortDay: string })[] = [];
  for (const sample of declaredSamples(samples, groups)) {
    for (const result of sample.results) {
      if (result.sensitive !== true || result.detected !== true) continue;
      rows.push({
        sortDay: sample.receivedDay ?? "",
        day: sample.receivedDay ? formatDay(sample.receivedDay) : "",
        germ: result.parameterName,
        product: sample.familyName ?? sample.natureLabel,
        region: sample.city?.trim() || NO_REGION,
      });
    }
  }
  return rows
    .sort((a, b) => a.sortDay.localeCompare(b.sortDay) || collator.compare(a.germ, b.germ) || collator.compare(a.product, b.product))
    .map((row) => ({ day: row.day, germ: row.germ, product: row.product, region: row.region }));
}

/** III-6-1: the regulations chosen on the declared samples, the most used first. */
export function regulationRows(samples: OnssaSampleInput[], groups: OnssaGroupRef[]): OnssaCountRow[] {
  const counts = new Map<string, OnssaCountRow>();
  for (const sample of declaredSamples(samples, groups)) {
    const title = sample.regulationTitle?.trim();
    if (!title) continue;
    const row = counts.get(title) ?? { label: title, samples: 0 };
    row.samples += 1;
    counts.set(title, row);
  }
  return [...counts.values()].sort((a, b) => b.samples - a.samples || collator.compare(a.label, b.label));
}

export const UNCODED_RECEPTION_NC = "Non-conformité à la réception (motif non codé)";

/**
 * III-6-3: the samples received non conformes in the month, by motif, then
 * those rejected (given back) or destroyed at reception.
 */
export function receptionRows(
  nonConform: { reason: NonConformityReason | null }[],
  refused: { reason: CancelReason }[]
): OnssaCountRow[] {
  const tally = (labels: string[]) => {
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return [...counts.entries()]
      .map(([label, samples]) => ({ label, samples }))
      .sort((a, b) => b.samples - a.samples || collator.compare(a.label, b.label));
  };
  return [
    ...tally(nonConform.map((row) => (row.reason ? NON_CONFORMITY_REASON_LABELS[row.reason] : UNCODED_RECEPTION_NC))),
    ...tally(refused.map((row) => CANCEL_REASON_LABELS[row.reason])),
  ];
}

/** « Rupture de la chaîne du froid : 2 échantillons ». */
export function countLine(row: OnssaCountRow): string {
  return `${row.label} : ${row.samples} échantillon${row.samples > 1 ? "s" : ""}`;
}
