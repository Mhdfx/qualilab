import { toMoney } from "./money";
import { SAMPLE_TYPE_LABELS } from "./labels";
import type { SampleType } from "@/generated/prisma/client";

/**
 * Turning analyses into invoice lines.
 *
 * The client asked that a validated sample's analyses become the lines of the
 * invoice, at catalogue prices — and that they keep control of how those lines
 * are named. So this proposes the lines; the accountant may rename any of them
 * before issuing, and a service missing from the catalogue is surfaced rather
 * than silently priced at zero.
 *
 * Kept pure so the rule can be tested without a database.
 */

export type CatalogueEntry = {
  name: string;
  category: string;
  unitPrice: number;
  active: boolean;
};

export type BillableSample = {
  id: string;
  controlCode: string | null;
  code: string;
  type: SampleType;
  produit: string | null;
  parameters: { name: string }[];
};

export type ProposedLine = {
  sampleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** True when no catalogue entry matched — the price must be set by hand. */
  unpriced: boolean;
};

/**
 * The catalogue is keyed by name and domain: "E. coli" costs one price on food
 * and another on water.
 */
function key(name: string, category: string) {
  return `${category}::${name}`.toLowerCase();
}

export function buildCatalogueIndex(entries: CatalogueEntry[]) {
  const index = new Map<string, CatalogueEntry>();
  for (const entry of entries) {
    if (!entry.active) continue;
    index.set(key(entry.name, entry.category), entry);
  }
  return index;
}

/** How a line reads on the invoice: the analysis, then what it was run on. */
export function lineDescription(
  parameterName: string,
  sample: BillableSample
): string {
  const reference = sample.controlCode ?? sample.code;
  const subject = sample.produit ? ` — ${sample.produit}` : "";
  return `${parameterName} (${SAMPLE_TYPE_LABELS[sample.type]})${subject} · ${reference}`;
}

export function proposeLines(
  samples: BillableSample[],
  catalogue: CatalogueEntry[]
): ProposedLine[] {
  const index = buildCatalogueIndex(catalogue);
  const lines: ProposedLine[] = [];

  for (const sample of samples) {
    for (const parameter of sample.parameters) {
      const entry = index.get(key(parameter.name, sample.type));
      lines.push({
        sampleId: sample.id,
        description: lineDescription(parameter.name, sample),
        quantity: 1,
        unitPrice: entry ? toMoney(entry.unitPrice) : 0,
        // Flagged, never guessed: an unpriced analysis is the accountant's call.
        unpriced: !entry,
      });
    }
  }

  return lines;
}
