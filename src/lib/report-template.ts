import type { SamplerKind, TemperatureSource } from "@/generated/prisma/enums";
import type { CompanyInfo } from "./company";
import { formatDecimal, SAMPLER_KIND_LABELS } from "./labels";
import { labDayOf, toLabWallTime } from "./lab-time";
import { userDocumentName } from "./document-name";

/**
 * The laboratory's report template, « Rapport d'essai » PG06/EN03 version M
 * (créé le 05/01/2006, mis à jour le 18/12/2023 — received 12/10,
 * RETOUR-LABO-06-10.md): its fixed wording, and the small derivations that
 * fill its fields from a sample. Pure, so the report builder and the tests
 * read the same rules; the layout itself is `report-html.ts`.
 *
 * The fixed wording is the template's, word for word (the apostrophes are
 * the app's straight ones, so a search for « Date d'analyse » finds it).
 * When the laboratory issues a new version of the template, this file and
 * the RAPPORT row of /admin/documents change together.
 */

/** « Lieu d'exécution » — where the analyses are run. One place for the whole report. */
export const REPORT_EXECUTION_PLACE = "Laboratoire permanent Casablanca";

/** « Référence prélèvement » — the laboratory's sampling procedures. */
export const SAMPLING_PROCEDURES = "PG04/EN01 & PG04/IT03";

/** « Prélèvement de l'air » — the air sampling instruction, printed for an air sample only. */
export const AIR_SAMPLING_PROCEDURE = "PG06/IT55";

/** The legend under the tables, in the template's three lines. */
export const REPORT_LEGEND: readonly string[] = [
  "* Paramètres non accrédité ; UFC Unité formant colonie ; N/A Non applicable ; SA Paramètre sous-traité accrédité ; SN Paramètre sous-traité non accrédité ;",
  "DPC Paramètres demandés par le client ; LQ Limite de quantification ; LD Limite de détection ; Ne Nombre estimé ;",
  "VC Version Corrigée ; présence= (1 UFC,2 UFC) pour eau ; IC : Information fournies par le client",
];

/**
 * The « N.B » block, line by line as the template prints it: `lead` in bold
 * before the text, `bold` for a line printed in bold, and `boldFrom` for the
 * last line, whose bold starts after « Le ».
 */
export type NbLine = { text: string; lead?: string; bold?: boolean; boldFrom?: number };

export const REPORT_NB: readonly NbLine[] = [
  { lead: "N.B", text: " : les résultats ne se rapportent qu'aux objets soumis à l'essai et tel qu'ils ont été reçu." },
  { text: "La déclaration de la conformité sans tenir compte l'incertitude" },
  { text: "La déclaration de la conformité ne concerne que les paramètres analysés selon les critères ci-dessus" },
  { text: "Le rapport d'analyse ne doit pas être reproduit, en partie ou en totalité, sans accord écrit du laboratoire" },
  { text: "Les résultats ne tiennent pas compte des incertitudes. Elles sont disponibles sur demande.", bold: true },
  {
    text: "Le laboratoire est exonéré de toute responsabilité au sujet des informations fournies par le client (IC) pouvant affecter la validité des résultats.",
    boldFrom: 3,
  },
];

/**
 * The legal footer of every page: the company's name, then « Adresse : … »,
 * « Tel : … Fax : … E-mail : … www… » and « IF : … - RC : … - Patente : … -
 * CNSS : … », built from /admin/entreprise. A field left empty is left out
 * (never a placeholder), and a line with nothing left is dropped.
 */
export type LegalFooter = {
  name: string;
  /** « Adresse : rue…, ville », null when both are empty. */
  address: string | null;
  /** « Tel : … », « Fax : … », « E-mail : … », the website — printed side by side. */
  contact: string[];
  /** « IF : … », « RC : … », « Patente : … », « CNSS : … » — printed joined by « - ». */
  legal: string[];
};

/** The separator of the identifiers' line, as the template prints it. */
export const LEGAL_SEPARATOR = " - ";

export function reportLegalFooter(company: CompanyInfo): LegalFooter {
  const value = (text: string | null | undefined) => text?.trim() || null;
  const labelled = (label: string, text: string | null | undefined) => {
    const v = value(text);
    return v ? `${label} : ${v}` : null;
  };
  const present = (parts: (string | null)[]) => parts.filter((part): part is string => part !== null);

  const address = present([value(company.address), value(company.city)]).join(", ");
  return {
    name: value(company.name) ?? "",
    address: address ? `Adresse : ${address}` : null,
    contact: present([
      labelled("Tel", company.phone),
      labelled("Fax", company.fax),
      labelled("E-mail", company.email),
      value(company.website),
    ]),
    legal: present([
      labelled("IF", company.fiscalId),
      labelled("RC", company.rc),
      labelled("Patente", company.patente),
      labelled("CNSS", company.cnss),
    ]),
  };
}

/** Characters a footer line holds at its size before it wraps (Arial 6 pt over 186 mm, kept low). */
const FOOTER_LINE_CHARS = 150;
/** …and the company's name, larger, bold and spaced. */
const FOOTER_NAME_CHARS = 100;

/**
 * The lines the legal footer takes beyond one per line of the template —
 * the page's bottom margin grows by as many, so that a long address or name
 * typed in /admin/entreprise never runs the footer into the body. An
 * estimate on the safe side: a line that would just fit counts as wrapped.
 */
export function legalFooterExtraLines(company: CompanyInfo): number {
  const footer = reportLegalFooter(company);
  const extra = (text: string, perLine: number) => (text ? Math.max(0, Math.ceil(text.length / perLine) - 1) : 0);
  return (
    extra(footer.name, FOOTER_NAME_CHARS) +
    extra(footer.address ?? "", FOOTER_LINE_CHARS) +
    extra(footer.contact.join("   "), FOOTER_LINE_CHARS) +
    extra(footer.legal.join(LEGAL_SEPARATOR), FOOTER_LINE_CHARS)
  );
}

/* -------------------------------- the fields -------------------------------- */

/** « 12/10/2026 à 09h30 », on the laboratory's clock — the 13/10 layout. */
export function reportDateTime(date: Date | null | undefined): string | null {
  if (!date) return null;
  const wall = toLabWallTime(date); // « 2026-10-12T09:30 »
  return `${wall.slice(8, 10)}/${wall.slice(5, 7)}/${wall.slice(0, 4)} à ${wall.slice(11, 13)}h${wall.slice(14, 16)}`;
}

/**
 * « 12/10/2026 09:30 », on the laboratory's clock — the form of the
 * laboratory's own report (excerpt of 15/10, RETOUR-LABO-14-10.md §8),
 * printed by a report issued with the aligned layout (lot 1b).
 */
export function reportDateTimeAligned(date: Date | null | undefined): string | null {
  if (!date) return null;
  const wall = toLabWallTime(date); // « 2026-10-12T09:30 »
  return `${wall.slice(8, 10)}/${wall.slice(5, 7)}/${wall.slice(0, 4)} ${wall.slice(11, 16)}`;
}

/** « 12/10/2026 », the laboratory's calendar day of an instant. */
export function reportDay(date: Date | null | undefined): string | null {
  if (!date) return null;
  const day = labDayOf(date); // « 2026-10-12 »
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/**
 * « Date d'analyse » of the 13/10 layout: from the start of the analyses
 * (the programme confirmed, else the reception) to the last result entered
 * — one day when both fall on the same day of the laboratory, « du … au … »
 * otherwise. The aligned layout prints one date, `analysisStart`.
 */
export function analysisPeriodText(from: Date | null | undefined, to: Date | null | undefined): string | null {
  const start = reportDay(from);
  const end = reportDay(to);
  if (!start || !end) return start ?? end;
  // A last entry dated before the start (a result re-entered from an older
  // programme) cannot open a period that ends before it begins.
  if (start === end || (to as Date).getTime() < (from as Date).getTime()) return start;
  return `du ${start} au ${end}`;
}

/**
 * The single « Date d'analyse » of the aligned layout (lot 1b): the start of
 * the analyses — the bench's « Prendre en charge » (`Sample.assignedAt`,
 * the real start since the free take-over of 13/10), else the programme
 * confirmed, else the reception. Never a period: the laboratory's report
 * prints one date (excerpt of 15/10).
 */
export function analysisStart(input: {
  assignedAt?: Date | null;
  programmedAt?: Date | null;
  receivedAt?: Date | null;
}): Date | null {
  return input.assignedAt ?? input.programmedAt ?? input.receivedAt ?? null;
}

/**
 * « Date et heure de réception » of the aligned layout (lot 1b): the arrival
 * at the laboratory typed on the série (`Serie.arrivedAt` — « Arrivé le » at
 * the counter, « Arrivée au laboratoire » at a visit's reception), else the
 * reception screen's instant. The 13/10 layout prints the latter.
 */
export function receptionInstant(input: { arrivedAt?: Date | null; receivedAt: Date | null }): Date | null {
  return input.arrivedAt ?? input.receivedAt;
}

/**
 * Who sampled, as « Préleveur » prints it: the Qualilab technician who went,
 * « Le client » for a deposit sampled by the client, else the third party
 * named on the série.
 *
 * With `denomination` (a report issued with the aligned layout, lot 1b) a
 * Qualilab technician prints as the documents name them — their own
 * « Dénomination sur les documents », else « Technicien de QUALILAB
 * 'I.NOM' » (`userDocumentName`); a name typed on the série stays as typed.
 * Without it, the full name, as the reports of 13/10 printed it.
 */
export function reportSampler(input: {
  samplerKind: SamplerKind;
  samplerUserName: string | null | undefined;
  samplerName: string | null | undefined;
  /** The account that recorded the sample — the préleveur of an older visit. */
  recordedBy: string | null | undefined;
  /** The aligned layout: the denominations below instead of the full names. */
  denomination?: boolean;
  /** `User.documentName` of the série's préleveur, and of the recording account. */
  samplerUserDocumentName?: string | null;
  recordedByDocumentName?: string | null;
}): string {
  const named = (value: string | null | undefined) => value?.trim() || null;
  switch (input.samplerKind) {
    case "QUALILAB": {
      if (!input.denomination) {
        return named(input.samplerUserName) ?? named(input.samplerName) ?? named(input.recordedBy) ?? "Qualilab";
      }
      const user = named(input.samplerUserName);
      if (user) return userDocumentName({ name: user, documentName: input.samplerUserDocumentName });
      const typed = named(input.samplerName);
      if (typed) return typed;
      const recorder = named(input.recordedBy);
      return recorder ? userDocumentName({ name: recorder, documentName: input.recordedByDocumentName }) : "Qualilab";
    }
    case "CLIENT":
      return "Le client";
    default: {
      const name = named(input.samplerName);
      if (input.samplerKind === "AUTRE") return name ?? SAMPLER_KIND_LABELS.AUTRE;
      return name ? `${SAMPLER_KIND_LABELS[input.samplerKind]} — ${name}` : SAMPLER_KIND_LABELS[input.samplerKind];
    }
  }
}

/** « 4,5 °C », or null. */
export function temperatureText(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${formatDecimal(value)} °C` : null;
}

/**
 * The three temperatures of « Information sur l'échantillon »: the product
 * at sampling, the product at reception (read on the sample or on a witness
 * bottle — a reading taken on the cooler is the cooler's), and the cooler
 * at reception (the série's, else the sample's reading taken on it).
 */
export function reportTemperatures(input: {
  productTemperature?: number | null;
  receptionTemperature?: number | null;
  receptionTemperatureSource?: TemperatureSource | null;
  coolerTemperature?: number | null;
}): { atSampling: string | null; atReception: string | null; cooler: string | null } {
  const onCooler = input.receptionTemperatureSource === "GLACIERE";
  const reading = temperatureText(input.receptionTemperature);
  return {
    atSampling: temperatureText(input.productTemperature),
    atReception: onCooler || !reading
      ? null
      : input.receptionTemperatureSource === "FLACON_TEMOIN"
        ? `${reading} (flacon témoin)`
        : reading,
    cooler: temperatureText(input.coolerTemperature) ?? (onCooler ? reading : null),
  };
}
