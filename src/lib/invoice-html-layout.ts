import { SAMPLE_TYPE_LABELS } from "./labels";

/**
 * The print layouts of one invoice — or credit note (Q30, RETOUR-LABO-19-10
 * H4).
 *
 * The invoice is written one line per analysis and per sample (`proposeLines`).
 * The laboratory asked on 19/10 for « par paramètres » too: the same invoice
 * printed one line per parameter, the quantity being the number of analyses —
 * like the « par paramètres groupés » model of the former software. It is a
 * presentation only: the lines stored, the totals, the VAT, the number and
 * the credit notes do not change, and the per-line layout stays the default.
 *
 * An invoice line holds no link to its parameter — only to its sample — so
 * the parameter is read back from the line's wording, which `lineDescription`
 * writes « Analyse (Domaine) — produit · référence ». A line the accountant
 * typed (« Déplacement », « Supplément »), or reworded beyond that shape,
 * prints as it is.
 *
 * Kept pure so the grouping can be tested without a database.
 */

/** « ligne »: one line per analysis and per sample (the default); « parametre »: one line per parameter. */
export type InvoiceLayout = "ligne" | "parametre";

/** The query parameter choosing the layout on the PDF route: `?modele=parametre`. */
export const INVOICE_LAYOUT_PARAM = "modele";

/** Where the PDF of an invoice is, in a layout: the per-line one needs no parameter. */
export function invoicePdfPath(invoiceId: string, layout: InvoiceLayout = "ligne"): string {
  const path = `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
  return layout === "ligne" ? path : `${path}?${INVOICE_LAYOUT_PARAM}=${layout}`;
}

/**
 * The layout asked for in the query: absent → the per-line layout, as before;
 * a value that names no layout → null (the route refuses it rather than
 * printing a layout nobody asked for).
 */
export function invoiceLayoutOf(value: string | null): InvoiceLayout | null {
  if (value === null || value === "" || value === "ligne") return "ligne";
  if (value === "parametre") return "parametre";
  return null;
}

/** A line as the document prints it. */
export type LayoutSourceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /**
   * The line bills an analysis of a sample: it carries its sample, or — a
   * credit-note line — takes back an invoice line that does. Only such a
   * line joins a parameter's line; a free line never does, whatever it says.
   */
  fromSample?: boolean;
};

/**
 * A stored invoice line as the layouts read it. A credit-note line stores no
 * sample (`credit-notes/route.ts`): it bills one through the invoice line it
 * takes back (`creditedItem`). `creditedItem` is required, so a query that
 * forgets to load it does not compile — without it every credit note would
 * print ungrouped. A free credit line, one taking back a free invoice line,
 * or one of a credit note older than the link (`creditedItem` null), is a
 * free line.
 */
export function layoutSourceLine(item: {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sampleId: string | null;
  creditedItem: { sampleId: string | null } | null;
}): LayoutSourceLine {
  return {
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    fromSample: item.sampleId !== null || (item.creditedItem?.sampleId ?? null) !== null,
  };
}

export type LayoutLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** A parameter's line: the references of its samples, in order, once each. Empty: a line printed as it is. */
  references: string[];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `lineDescription`, read backwards: « Analyse (Domaine) », an optional « — produit », « · référence ». */
const ANALYSIS_LINE = new RegExp(
  `^(.+?) \\((${Object.values(SAMPLE_TYPE_LABELS).map(escapeRegExp).join("|")})\\)(?: — .+)? · ([^·]+)$`
);

/**
 * The analysis an invoice line bills and the sample it was run on, read from
 * the line's wording: « E. coli (Alimentaire) — Fromage · 480/26-2 » →
 * « E. coli (Alimentaire) » on 480/26-2. The domain stays in the name: the
 * catalogue prices a parameter per domain (`catalogueKey`). Null when the
 * wording is not that of an analysis.
 */
export function billedAnalysis(description: string): { analysis: string; reference: string } | null {
  const match = ANALYSIS_LINE.exec(description.trim());
  if (!match) return null;
  const name = match[1].trim();
  const reference = match[3].trim();
  if (!name || !reference) return null;
  return { analysis: `${name} (${match[2]})`, reference };
}

/** Amounts are added in centimes: a sum of lines never drifts from the invoice by a float's hair. */
const cents = (amount: number) => Math.round(amount * 100);

/**
 * The lines of the « par paramètre » layout: the analysis lines billing the
 * same parameter at the same unit price become one line — the parameter, the
 * number of analyses, the unit price, the sum of their amounts — placed where
 * the first of them was; every other line is printed as it is, in its place.
 *
 * A line keeps its own place when its quantity is not a whole number: a
 * fractional quantity was typed on purpose, and quantity × price would no
 * longer give the sum of the amounts it was billed with. The amounts are the
 * stored ones, added — never recomputed —, so the lines always add up to the
 * same total HT as the per-line layout.
 */
export function groupLinesByParameter(items: readonly LayoutSourceLine[]): LayoutLine[] {
  type Group = { line: LayoutLine; quantity: number; totalCents: number };
  const out: (LayoutLine | Group)[] = [];
  const groups = new Map<string, Group>();

  for (const item of items) {
    const billed =
      item.fromSample && Number.isInteger(item.quantity) && item.quantity > 0
        ? billedAnalysis(item.description)
        : null;
    if (!billed) {
      out.push({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        references: [],
      });
      continue;
    }

    const key = `${billed.analysis}\u0000${cents(item.unitPrice)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        line: { description: billed.analysis, quantity: 0, unitPrice: item.unitPrice, lineTotal: 0, references: [] },
        quantity: 0,
        totalCents: 0,
      };
      groups.set(key, group);
      out.push(group);
    }
    group.quantity += item.quantity;
    group.totalCents += cents(item.lineTotal);
    if (!group.line.references.includes(billed.reference)) group.line.references.push(billed.reference);
  }

  return out.map((entry) =>
    "totalCents" in entry
      ? { ...entry.line, quantity: entry.quantity, lineTotal: entry.totalCents / 100 }
      : entry
  );
}
