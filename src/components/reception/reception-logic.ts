import type {
  AirMethod,
  Family,
  HandsState,
  LineKind,
  QuantityUnit,
  SurfaceState,
} from "@/generated/prisma/enums";
import { AIR_METHOD_LABELS, HANDS_STATE_LABELS, LINE_KIND_LABELS, withSurfaceState } from "@/lib/labels";
import { LINE_FAMILIES, type LineFamily } from "@/lib/nature-family";
import {
  parameterSpellings,
  proposedConformity,
  receptionChecklist,
  type ChecklistRow,
  type ChecklistStatus,
  type ReceptionThresholds,
} from "@/lib/reception-rules";
import { sampleRef } from "@/lib/reception-input";
import { twinFor } from "@/lib/sample-code";

/**
 * The reception screens' own rules — pure, no Prisma client, no
 * "use client": the queue (a server component), the reception of a visit
 * and the deposit form all read them.
 *
 * RETOUR-LABO-06-10.md §5: the screens speak of « Échantillon N » (V2); a
 * line whose two families are ticked becomes two samples « NM » and « NP »
 * (V3), each with its own N° de contrôle and its own acceptance rules
 * (100 g in microbiology, 300 g in physico-chemistry); a surface carries its
 * state and an air sample its method (V2, V4).
 */

// ---- wording -------------------------------------------------------------------

/** « 1 échantillon », « 3 échantillons » — `plural` when the plural is not « +s ». */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** The families as a short heading, before a check that concerns one of them. */
export const FAMILY_TITLES: Record<LineFamily, string> = {
  MICRO: "Microbiologie",
  CHIMIE: "Physico-chimie",
};

/** « Analyses microbiologiques », « Analyses microbiologiques et physico-chimiques ». */
export function familiesSummary(families: readonly Family[]): string {
  const micro = families.includes("MICRO");
  const chimie = families.includes("CHIMIE");
  if (micro && chimie) return "Analyses microbiologiques et physico-chimiques";
  if (micro) return "Analyses microbiologiques";
  if (chimie) return "Analyses physico-chimiques";
  return "Aucune famille d'analyses cochée";
}

/** The refs of the samples a line becomes: « 2 », or « 2M » and « 2P ». */
export function lineSampleRefs(lineNumber: number, families: readonly LineFamily[]): string[] {
  if (families.length < 2) return [String(lineNumber)];
  return LINE_FAMILIES.filter((family) => families.includes(family)).map(
    (family) => `${lineNumber}${twinFor(family)}`
  );
}

/** How many samples (and N° de contrôle) the lines become — two for a two-family line. */
export function sampleCount(lines: readonly { analysesMicro: boolean; analysesChimie: boolean }[]): number {
  return lines.reduce((n, line) => n + Math.max(1, Number(line.analysesMicro) + Number(line.analysesChimie)), 0);
}

/**
 * The sample's designation as the reception reads it: « Planche verte —
 * surface nettoyée · 100 cm² », « Prénom Nom — Chef · mains lavées », « Salle —
 * Boîte exposée 30 min ». A sample entered before the state and the method
 * existed prints as before.
 */
export function receptionDesignation(sample: {
  lineKind: LineKind;
  produit: string | null;
  surfaceLabel: string | null;
  surfaceAreaCm2?: number | null;
  surfaceState?: SurfaceState | null;
  personName: string | null;
  personRole?: string | null;
  handsState?: HandsState | null;
  airMethod?: AirMethod | null;
}): string {
  switch (sample.lineKind) {
    case "SURFACE":
      return `${withSurfaceState(sample.surfaceLabel || sample.produit || "Surface", sample.surfaceState ?? null)}${
        sample.surfaceAreaCm2 ? ` · ${sample.surfaceAreaCm2} cm²` : ""
      }`;
    case "MAINS":
      return `${sample.personName || sample.produit || "Mains"}${sample.personRole ? ` — ${sample.personRole}` : ""}${
        sample.handsState ? ` · ${HANDS_STATE_LABELS[sample.handsState].toLowerCase()}` : ""
      }`;
    case "AIR":
      return sample.airMethod
        ? `${sample.produit || LINE_KIND_LABELS.AIR} — ${AIR_METHOD_LABELS[sample.airMethod]}`
        : (sample.produit ?? "—");
    default:
      return sample.produit ?? "—";
  }
}

/** « Échantillon 2M · Microbiologie des aliments » — the head of a sample's card. */
export function sampleHeading(sample: { lineNumber: number; code?: string | null }, natureLabel?: string | null) {
  const ref = sampleRef(sample.lineNumber, sample.code);
  return `Échantillon ${ref}${natureLabel ? ` · ${natureLabel}` : ""}`;
}

/**
 * Whether an API error is about this sample. The reception API names the
 * sample in its message (« Échantillon 2P : … ») and returns the line number
 * aside: of the two samples of a line, only the one the message names is
 * flagged; a message without a letter flags the whole line.
 */
export function errorConcernsSample(
  error: { message: string; lineNumber: number | null; ref?: string | null } | null,
  sample: { lineNumber: number; code?: string | null }
): boolean {
  if (!error || error.lineNumber !== sample.lineNumber) return false;
  // The API names the sample (« 2P ») since 07/10; the message is read only
  // for an answer that does not.
  if (error.ref) return sampleRef(sample.lineNumber, sample.code) === error.ref;
  const named = /Échantillon (\d+)([MP])?(?!\d)/.exec(error.message);
  if (!named || !named[2] || Number(named[1]) !== sample.lineNumber) return true;
  return sampleRef(sample.lineNumber, sample.code) === `${named[1]}${named[2]}`;
}

/**
 * The boxes of the protocol that no sample still to analyse answers. Since
 * 07/10 the série's boxes are computed from its samples, so this only
 * happens on a série entered before (boxes ticked by hand) or once the
 * samples of a family are cancelled.
 */
export function missingFamilies(serie: {
  analysesMicro: boolean;
  analysesChimie: boolean;
  samples: { status: string; nature: { family: Family } }[];
}): string[] {
  const families = new Set(serie.samples.filter((s) => s.status !== "ANNULE").map((s) => s.nature.family));
  const missing: string[] = [];
  if (serie.analysesMicro && !families.has("MICRO")) missing.push("analyses microbiologiques");
  if (serie.analysesChimie && !families.has("CHIMIE")) missing.push("analyses physico-chimiques");
  return missing;
}

// ---- the acceptance rules of a deposit line -------------------------------------

/** The checklist of one sample a line becomes. */
export type FamilyRows = { family: LineFamily | null; rows: ChecklistRow[] };

/** Which of two different rows the line shows — the one that weighs most. */
const STATUS_WEIGHT: Record<ChecklistStatus, number> = {
  SANS_OBJET: 0,
  CONFORME: 1,
  A_VERIFIER: 2,
  A_CONFIRMER: 3,
  NON_CONFORME: 4,
};

/** « Quantité 150 g… » → « quantité 150 g… » after a family's title. */
function lowerFirst(text: string) {
  const [first, second] = [...text];
  if (!first || second === undefined || second !== second.toLocaleLowerCase("fr")) return text;
  return first.toLocaleLowerCase("fr") + text.slice(first.length);
}

/**
 * One checklist for the card of a two-family line — still the seven rules of
 * the paper, in its order. A row both samples share (rule 1, the
 * temperature, a quantity rule that concerns neither) is shown once; a row
 * that differs keeps what concerns each sample, headed by its family
 * (« Physico-chimie : quantité 150 g < 300 g requis »), and takes the
 * weightiest status. `familyBlocking`: one sample is non conform and the
 * other is not — the other could be received conform on its own.
 */
export function mergeFamilyRows(perSample: readonly FamilyRows[]): { rows: ChecklistRow[]; familyBlocking: boolean } {
  if (perSample.length < 2) return { rows: perSample[0]?.rows ?? [], familyBlocking: false };
  const failing = (s: FamilyRows) => s.rows.some((row) => row.status === "NON_CONFORME");
  const familyBlocking = perSample.some(failing) && !perSample.every(failing);

  const rows = perSample[0].rows.map((first, index): ChecklistRow => {
    const variants = perSample.map((s) => ({ family: s.family, row: s.rows[index] }));
    if (variants.every(({ row }) => row.status === first.status && row.detail === first.detail)) {
      return { ...first, rules: [...new Set(variants.flatMap(({ row }) => row.rules))] };
    }
    const applicable = variants.filter(({ row }) => row.status !== "SANS_OBJET");
    const shown = applicable.length > 0 ? applicable : variants;
    const weightiest = shown.reduce((a, b) => (STATUS_WEIGHT[b.row.status] > STATUS_WEIGHT[a.row.status] ? b : a));
    const headed = (family: LineFamily | null, detail: string | undefined) =>
      detail && family ? `${FAMILY_TITLES[family]} : ${lowerFirst(detail)}` : detail;
    const details = [...new Set(shown.map(({ family, row }) => headed(family, row.detail)).filter(Boolean))];
    return {
      n: first.n,
      key: first.key,
      text: first.text,
      status: weightiest.row.status,
      ...(details.length > 0 ? { detail: details.join(" · ") } : {}),
      ...(weightiest.row.reason ? { reason: weightiest.row.reason } : {}),
      rules: shown.flatMap(({ family, row }) => row.rules.map((rule) => (family ? `${family}:${rule}` : rule))),
    };
  });
  return { rows, familyBlocking };
}

/** What the counter measured on a deposit line, as the rules read it. */
export type DepositLineInput = {
  lineKind: LineKind;
  /** The ticked families that have a nature (`lineNatures`), micro first. */
  families: readonly LineFamily[];
  /** The ticked analyses, with their family and their aliases. */
  parameters: readonly { name: string; aliases?: string | null; family: Family }[];
  quantity: number | null;
  quantityUnit: QuantityUnit;
  receptionTemperature: number | null;
  unitCount: number;
  /** Rule (1), one answer for the line — both samples share it. */
  exploitable: boolean | null;
};

/**
 * The checklist of a deposit line, computed for each sample it becomes — as
 * `POST /api/series` computes it before writing — merged into one list, and
 * the proposal that follows: a NON_CONFORME row on either sample makes the
 * line non-conform (the counter's answer, temperature, conformity and
 * decision apply to both samples).
 */
export function depositLineChecklist(line: DepositLineInput, thresholds: ReceptionThresholds) {
  const families: (LineFamily | null)[] = line.families.length > 0 ? [...line.families] : [null];
  const perSample: FamilyRows[] = families.map((family) => ({
    family,
    rows: receptionChecklist(
      {
        lineKind: line.lineKind,
        family: family ?? "AUTRE",
        parameterNames: line.parameters
          .filter((p) => family === null || p.family === family)
          .flatMap((p) => parameterSpellings(p)),
        quantity: line.quantity,
        quantityUnit: line.quantity === null ? null : line.quantityUnit,
        receptionTemperature: line.receptionTemperature,
        unitCount: line.unitCount,
      },
      thresholds,
      { exploitable: line.exploitable }
    ),
  }));
  const { rows, familyBlocking } = mergeFamilyRows(perSample);
  return { rows, familyBlocking, proposal: proposedConformity(rows) };
}
