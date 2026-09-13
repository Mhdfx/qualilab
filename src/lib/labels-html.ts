import * as bwipjs from "bwip-js/node";
import { COMPANY, type CompanyInfo } from "./company";
import { escapeHtml } from "./html-text";
import { formatDayShort } from "./labels";
import { unitLetter } from "./series";

/**
 * Sample labels — one per unit, printed right after the reception of a
 * série on an A4 sheet of 3 × 8 labels (70 × 37 mm, no margins — the common
 * self-adhesive format). Each label carries the N° de contrôle and the unit
 * letter, both as text and as a Code128 barcode, so the tube is identified
 * at the bench without retyping anything.
 */

export type LabelLine = {
  controlCode: string;
  unitCount: number;
  natureLabel: string;
  designation: string;
  clientName: string;
  siteName: string | null;
  receivedAt: Date | null;
};

const PER_PAGE = 24;

function barcodeSvg(text: string) {
  return bwipjs.toSVG({
    bcid: "code128",
    text,
    scale: 2,
    height: 8,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
}

/** Expands the lines into one label per unit, in bench order. */
export function labelUnits(lines: LabelLine[]) {
  return lines.flatMap((line) =>
    Array.from({ length: Math.max(1, line.unitCount) }, (_, index) => {
      const letter = line.unitCount > 1 ? unitLetter(index + 1) : null;
      return {
        ...line,
        letter,
        barcodeText: letter ? `${line.controlCode}-${letter}` : line.controlCode,
      };
    })
  );
}

export function buildLabelsHtml(
  serialNumber: string,
  lines: LabelLine[],
  company: CompanyInfo = COMPANY
): string {
  const units = labelUnits(lines);
  const pages: string[] = [];

  for (let start = 0; start < units.length; start += PER_PAGE) {
    const cells = units
      .slice(start, start + PER_PAGE)
      .map(
        (unit) => `
      <div class="label">
        <div class="top">
          <span class="nature">${escapeHtml(unit.natureLabel)}</span>
          <span class="date">${unit.receivedAt ? formatDayShort(unit.receivedAt) : ""}</span>
        </div>
        <div class="code">
          <span class="number">${escapeHtml(unit.controlCode)}</span>
          ${unit.letter ? `<span class="letter">${unit.letter}</span>` : ""}
        </div>
        <div class="barcode">${barcodeSvg(unit.barcodeText)}</div>
        <div class="designation">${escapeHtml(unit.designation)}</div>
        <div class="client">${escapeHtml(unit.clientName)}${unit.siteName ? ` · ${escapeHtml(unit.siteName)}` : ""}<span class="serie">série ${escapeHtml(serialNumber)}</span></div>
      </div>`
      )
      .join("");
    pages.push(`<section class="sheet">${cells}</section>`);
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Étiquettes — série ${escapeHtml(serialNumber)} — ${escapeHtml(company.name)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37mm;
    width: 210mm; height: 296mm; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .label { padding: 2.5mm 3.5mm 2mm; overflow: hidden; display: flex; flex-direction: column;
    border: 0.2mm dashed #e3eaee; }
  .top { display: flex; justify-content: space-between; font-size: 7pt; color: #55707d;
    text-transform: uppercase; letter-spacing: .3px; }
  .code { display: flex; align-items: baseline; gap: 2mm; margin-top: 0.5mm; }
  .number { font-family: Consolas, "DejaVu Sans Mono", monospace; font-size: 15pt; font-weight: 700;
    color: #1f3a4d; letter-spacing: .2px; }
  .letter { font-size: 11pt; font-weight: 700; color: #fff; background: #1f3a4d; border-radius: 1mm;
    padding: 0 1.6mm; line-height: 5mm; }
  .barcode { margin-top: 0.8mm; height: 9mm; }
  .barcode svg { height: 9mm; width: auto; max-width: 100%; display: block; }
  .designation { margin-top: 0.8mm; font-size: 8.4pt; font-weight: 600; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .client { font-size: 7pt; color: #55707d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .serie { float: right; margin-left: 2mm; }
</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}
