import { formatDateOnly } from "./date-only";
import type { DocumentRef } from "./document-types";
import { escapeHtml } from "./html-text";

/**
 * The quality cartouche of the laboratory's forms, exactly as the paper
 * prints it (PG05/EN04 version G, scan received on 08/10 — RETOUR-LABO-06-10.md
 * §10): one bordered grid across the width of the page, in navy ink.
 *
 *   ┌──────────┬──────────────────┬───────────────────────────────────────┐
 *   │          │ Bon de réception │               Version G               │
 *   │   logo   │                  │              Page 1 sur 1             │
 *   │          ├──────────────────┼──────────────────┬────────────────────┤
 *   │          │ Réf : PG05/EN04  │ Date de création │Dernière mise à jour│
 *   │          │                  │    05/01/2006    │     01/10/2024     │
 *   └──────────┴──────────────────┴──────────────────┴────────────────────┘
 *
 * It is Chromium's header template, repeated on every page with its own
 * « Page n sur N ». A header template inherits nothing from the page — no
 * stylesheet, no web font, a tiny default size — so every style is inline.
 * The faces are Times New Roman and Arial, whose metrics the container's
 * Liberation fonts share: a cartouche laid out on a workstation is the one
 * the server prints. The paper wraps « Date de création » and « Dernière
 * mise à jour » in narrow cells; here each label holds on one line, so the
 * text of the PDF reads (and is searched) as the paper's labels.
 *
 * A missing value prints blank, never « — »: a cartouche the laboratory has
 * not filled reads as a field to fill in, not as a statement.
 */

/** The navy ink of the paper forms — the cartouche and the form drawn under it. */
export const CARTOUCHE_INK = "#1e3a8a";

/** A page box, in the units Chromium's `page.pdf()` and CSS `@page` both read. */
export type PageMargin = { top: string; right: string; bottom: string; left: string };

/** The page's side margins — the cartouche is inset by the same amount. */
const PAGE_SIDE = "12mm";

/**
 * The margins of a form printed under the cartouche. The top margin holds
 * the header template — Chromium places it ≈ 5 mm under the top edge, then
 * 2 mm of padding and the 22 mm grid end at ≈ 29 mm, as on the paper — with
 * a clear gap before the body so nothing ever runs under the grid. A form
 * with a footer line (the protocol's coordinates) keeps room for it.
 */
export function cartoucheMargin({ footer = false }: { footer?: boolean } = {}): PageMargin {
  return { top: "34mm", right: PAGE_SIDE, bottom: footer ? "16mm" : "12mm", left: PAGE_SIDE };
}

/**
 * The `@page` rule of a form printed under the cartouche. A document's own
 * `@page` margin wins over the margin handed to `page.pdf()`, so the HTML
 * and the PDF call must both come from the same `PageMargin`.
 */
export function pageCss(margin: PageMargin): string {
  return `@page { size: A4; margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left}; }`;
}

/** The logo cell takes an image data URI only — the same whole-string check as the upload. */
const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|svg\+xml|webp);base64,[A-Za-z0-9+/]+=*$/;

const SERIF = "font-family:'Times New Roman','Liberation Serif',Times,serif;";
const SANS = "font-family:Arial,'Liberation Sans',Helvetica,sans-serif;";
const CELL = `border:1px solid ${CARTOUCHE_INK};padding:0 1.5mm;text-align:center;vertical-align:middle;color:${CARTOUCHE_INK};font-weight:700;`;
/** Each of the two rows, as on the paper (≈ 11 mm). */
const ROW = "height:11mm;";
/** The two date cells: label above, date below, each on one line. */
const DATE = `${SANS}font-size:7.5pt;line-height:1.25;padding:0 0.8mm;white-space:nowrap;`;

export type CartoucheInput = {
  /** The form's title in the paper's mixed case: « Bon de réception ». */
  title: string;
  reference: DocumentRef;
  /** The laboratory's logo (`documentLogo()`); null leaves the cell blank. */
  logoDataUri: string | null;
};

/** Chromium's header template: the cartouche, with « Page n sur N » filled per page. */
export function cartoucheTemplate({ title, reference, logoDataUri }: CartoucheInput): string {
  const text = (value: string) => escapeHtml(value.trim());
  const date = (value: Date | null) => (value ? formatDateOnly(value) : "");
  const logo =
    logoDataUri && IMAGE_DATA_URI.test(logoDataUri)
      ? `<img src="${logoDataUri}" alt="" style="display:block;margin:0 auto;max-width:100%;max-height:17mm;">`
      : "";

  return `<div style="width:100%;box-sizing:border-box;padding:2mm ${PAGE_SIDE} 0;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
<colgroup><col style="width:30%"><col style="width:40%"><col style="width:15%"><col style="width:15%"></colgroup>
<tr>
<td rowspan="2" style="${CELL}padding:1mm 2mm;">${logo}</td>
<td style="${CELL}${ROW}${SERIF}font-size:13pt;">${text(title)}</td>
<td colspan="2" style="${CELL}${SERIF}font-size:11.5pt;line-height:1.2;">Version ${text(reference.version)}<br>Page <span class="pageNumber"></span> sur <span class="totalPages"></span></td>
</tr>
<tr>
<td style="${CELL}${ROW}${SERIF}font-size:12.5pt;letter-spacing:.04em;">Réf : ${text(reference.reference)}</td>
<td style="${CELL}${DATE}">Date de création<br>${date(reference.createdOn)}</td>
<td style="${CELL}${DATE}">Dernière mise à jour<br>${date(reference.updatedOn)}</td>
</tr>
</table>
</div>`;
}
