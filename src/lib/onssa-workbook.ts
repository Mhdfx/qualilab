import ExcelJS from "exceljs";
import { ONSSA_COLUMNS } from "./onssa-canevas";
import type { OnssaReport } from "./onssa-report";

/**
 * Lot 3E, N3 — the ONSSA monthly report as an Excel workbook in the layout
 * of the canevas extract the laboratory sent on 28/10 (RETOUR-LABO-28-10.md
 * §3.2): « Feuil1 » (groupes de produits × contrôle officiel / autocontrôle),
 * « Feuil2 » (product groups × the 23 microbiology columns, « chimie
 * alimentaires », « Total », two rows each: « Réalisées », « NC »),
 * « Feuil3 » (the synthesis, its formulas pointing at Feuil2's figures in
 * place of the canevas' external « II-AT »), plus « Notes »: the counting
 * rules (hypothèses R-22), what was left out and why.
 *
 * The canevas' headers are written as they are there (their spelling
 * kept), at the same cells (rows 5–7 of Feuil1, 6–7 of Feuil2 and Feuil3),
 * so a block can be pasted into the official file. Totals are formulas
 * with their result cached, so the file reads right before Excel computes.
 */

export type OnssaWorkbookMeta = {
  monthLabel: string;
  labName: string;
  /** « 01/11/2026 à 09:30 ». */
  generatedAt: string;
  /** « date de réception » / « date de validation administrative ». */
  countBasis: string;
  /** Samples of the month not yet validated (left out until they are). */
  pendingSamples: number;
};

/** A theme colour with its tint, as the canevas' fills (ExcelJS writes `tint`; its types omit it). */
function themeFill(theme: number, tint: number): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { theme, tint } as Partial<ExcelJS.Color> };
}

const HEADER_FILL = themeFill(3, 0.5999938962981048);
const SELF_FILL = themeFill(4, 0.7999816888943144);
const TOTAL_FILL = themeFill(0, -0.0499893185216834);
const SYNTH_FILL = themeFill(4, 0.3999755851924192);
const THIN: ExcelJS.Borders = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
  diagonal: {},
};
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

function box(cell: ExcelJS.Cell, options: { bold?: boolean; fill?: ExcelJS.Fill; align?: Partial<ExcelJS.Alignment> } = {}) {
  cell.border = THIN;
  if (options.bold) cell.font = { bold: true };
  if (options.fill) cell.fill = options.fill;
  cell.alignment = options.align ?? CENTER;
}

function title(sheet: ExcelJS.Worksheet, meta: OnssaWorkbookMeta, subtitle: string) {
  sheet.getCell("A1").value = `Rapport mensuel d'activité ONSSA — ${meta.monthLabel}`;
  sheet.getCell("A1").font = { bold: true, size: 13 };
  sheet.getCell("A2").value = meta.labName;
  sheet.getCell("A3").value = subtitle;
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF475569" } };
}

/** Column letter of a 1-based index (1 → A, 27 → AA). */
export function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// ---- Feuil1 ------------------------------------------------------------------

function sheet1(workbook: ExcelJS.Workbook, report: OnssaReport, meta: OnssaWorkbookMeta) {
  const sheet = workbook.addWorksheet("Feuil1");
  title(sheet, meta, "Nombre d'analyses par groupe de produits : contrôle officiel et autocontrôle.");
  sheet.getColumn(1).width = 30;
  [26.6, 25.9, 21.3, 19.6, 14].forEach((width, i) => (sheet.getColumn(i + 2).width = width));

  sheet.mergeCells("A5:A7");
  sheet.mergeCells("B5:E5");
  sheet.mergeCells("F5:F7");
  sheet.mergeCells("B6:D6");
  sheet.getCell("A5").value = "Groupe de produits";
  sheet.getCell("B5").value = "Nombre d'analyse";
  sheet.getCell("F5").value = "total";
  sheet.getCell("B6").value = "Contrôle Officiel";
  sheet.getCell("E6").value = "Autocontrôle";
  sheet.getCell("B7").value = "DR ONSSA/Organisme préleveur agréé";
  sheet.getCell("C7").value = "Nom  de l'établissement";
  sheet.getCell("D7").value = "Origine";
  sheet.getCell("E7").value = "Origine";
  for (const address of ["A5", "B5", "C5", "D5", "E5", "B6", "C6", "D6", "A6", "A7", "B7", "C7", "D7"]) {
    box(sheet.getCell(address), { bold: true });
  }
  for (const address of ["E6", "E7"]) box(sheet.getCell(address), { bold: true, fill: SELF_FILL });
  for (const address of ["F5", "F6", "F7"]) box(sheet.getCell(address), { bold: true, fill: HEADER_FILL });
  sheet.getRow(5).height = 19.5;
  sheet.getRow(6).height = 19.5;
  sheet.getRow(7).height = 37.5;

  let row = 8;
  const first = row;
  for (const block of report.groups) {
    const start = row;
    const lines: { b?: string; c?: string; d?: string; e?: string; count: number }[] = [
      ...block.official.map((r) => ({ b: r.organisme, c: r.etablissement, d: r.origine, count: r.analyses })),
      ...block.self.map((r) => ({ e: r.origine, count: r.analyses })),
    ];
    if (lines.length === 0) lines.push({ count: 0 });
    for (const line of lines) {
      sheet.getCell(`B${row}`).value = line.b ?? null;
      sheet.getCell(`C${row}`).value = line.c ?? null;
      sheet.getCell(`D${row}`).value = line.d ?? null;
      sheet.getCell(`E${row}`).value = line.e ?? null;
      sheet.getCell(`F${row}`).value = line.count;
      for (const column of ["A", "B", "C", "D", "E", "F"]) {
        box(sheet.getCell(`${column}${row}`), { align: { vertical: "middle", wrapText: true, horizontal: column === "F" ? "center" : "left" } });
      }
      row += 1;
    }
    sheet.getCell(`A${start}`).value = block.group.name;
    if (row - 1 > start) sheet.mergeCells(`A${start}:A${row - 1}`);
    box(sheet.getCell(`A${start}`), { align: { vertical: "middle", wrapText: true } });
  }
  const last = row - 1;

  const totals: [string, number | { formula: string; result: number }][] = [
    ["dont contrôle officiel", report.officialAnalyses],
    ["dont autocontrôle", report.selfAnalyses],
    [
      "Total",
      last >= first
        ? { formula: `SUM(F${first}:F${last})`, result: report.officialAnalyses + report.selfAnalyses }
        : report.officialAnalyses + report.selfAnalyses,
    ],
  ];
  for (const [label, value] of totals) {
    sheet.getCell(`A${row}`).value = label;
    sheet.mergeCells(`A${row}:E${row}`);
    sheet.getCell(`F${row}`).value = value;
    box(sheet.getCell(`A${row}`), { bold: label === "Total", fill: TOTAL_FILL, align: { horizontal: "right", vertical: "middle" } });
    box(sheet.getCell(`F${row}`), { bold: true, fill: HEADER_FILL });
    row += 1;
  }
  sheet.views = [{ state: "frozen", ySplit: 7 }];
}

// ---- Feuil2 ------------------------------------------------------------------

/** Feuil2's columns: C … Y the microbiology, Z the chemistry, AA the total. */
const FIRST_DATA_COLUMN = 3;
const TOTAL_COLUMN = FIRST_DATA_COLUMN + ONSSA_COLUMNS.length;

function sheet2(workbook: ExcelJS.Workbook, report: OnssaReport, meta: OnssaWorkbookMeta) {
  const sheet = workbook.addWorksheet("Feuil2");
  title(sheet, meta, "Analyses réalisées et non conformes (NC) par groupe de produits et par paramètre.");
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 15.4;
  for (let i = FIRST_DATA_COLUMN; i <= TOTAL_COLUMN; i += 1) sheet.getColumn(i).width = 13;

  const lastLetter = columnLetter(TOTAL_COLUMN);
  const chemLetter = columnLetter(TOTAL_COLUMN - 1);
  sheet.mergeCells("A6:A7");
  sheet.mergeCells("B6:B7");
  sheet.mergeCells(`${chemLetter}6:${chemLetter}7`);
  sheet.mergeCells(`${lastLetter}6:${lastLetter}7`);
  sheet.getCell("A6").value = "Types de produits";
  sheet.getCell("B6").value = "Nombres d'analyses";
  ONSSA_COLUMNS.forEach((column, i) => {
    const letter = columnLetter(FIRST_DATA_COLUMN + i);
    sheet.getCell(`${letter}6`).value = column.header;
    if (column.kind === "MICRO") sheet.getCell(`${letter}7`).value = column.method;
  });
  sheet.getCell(`${lastLetter}6`).value = "Total";
  for (let i = 1; i <= TOTAL_COLUMN; i += 1) {
    for (const r of [6, 7]) box(sheet.getCell(`${columnLetter(i)}${r}`), { fill: HEADER_FILL });
  }
  sheet.getRow(6).height = 42;
  sheet.getRow(7).height = 31.5;

  let row = 8;
  const first = row;
  for (const block of report.groups) {
    sheet.mergeCells(`A${row}:A${row + 1}`);
    sheet.getCell(`A${row}`).value = block.group.name;
    box(sheet.getCell(`A${row}`), { align: { horizontal: "center", vertical: "middle", wrapText: true } });
    ([
      ["Réalisées", "realisees"],
      ["NC", "nonConformes"],
    ] as const).forEach(([label, field], offset) => {
      const r = row + offset;
      sheet.getCell(`B${r}`).value = label;
      box(sheet.getCell(`B${r}`), { align: { horizontal: "left", vertical: "middle" } });
      ONSSA_COLUMNS.forEach((column, i) => {
        const cell = sheet.getCell(`${columnLetter(FIRST_DATA_COLUMN + i)}${r}`);
        cell.value = block.columns[column.key][field];
        box(cell);
      });
      const totalCell = sheet.getCell(`${lastLetter}${r}`);
      totalCell.value = {
        formula: `SUM(${columnLetter(FIRST_DATA_COLUMN)}${r}:${chemLetter}${r})`,
        result: block.total[field],
      };
      box(totalCell, { bold: true });
    });
    row += 2;
  }
  const last = row - 1;

  sheet.mergeCells(`A${row}:A${row + 1}`);
  sheet.getCell(`A${row}`).value = "Total";
  box(sheet.getCell(`A${row}`), { bold: true, fill: TOTAL_FILL, align: { horizontal: "left", vertical: "middle" } });
  ([
    ["Réalisées", "realisees"],
    ["NC", "nonConformes"],
  ] as const).forEach(([label, field], offset) => {
    const r = row + offset;
    sheet.getCell(`B${r}`).value = label;
    box(sheet.getCell(`B${r}`), { fill: TOTAL_FILL, align: { horizontal: "left", vertical: "middle" } });
    for (let i = FIRST_DATA_COLUMN; i <= TOTAL_COLUMN; i += 1) {
      const letter = columnLetter(i);
      const result =
        i === TOTAL_COLUMN ? report.total[field] : report.columnTotals[ONSSA_COLUMNS[i - FIRST_DATA_COLUMN].key][field];
      const cell = sheet.getCell(`${letter}${r}`);
      cell.value =
        last >= first
          ? { formula: `SUMIF($B$${first}:$B$${last},"${label}",${letter}${first}:${letter}${last})`, result }
          : result;
      box(cell, { bold: true, fill: TOTAL_FILL });
    }
  });
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 7 }];
}

// ---- Feuil3 ------------------------------------------------------------------

function sheet3(workbook: ExcelJS.Workbook, report: OnssaReport, meta: OnssaWorkbookMeta) {
  const sheet = workbook.addWorksheet("Feuil3");
  title(sheet, meta, "Synthèse : échantillons, analyses, conformes et non conformes.");
  sheet.getColumn(1).width = 4;
  [25.1, 21, 18.6, 18.7, 22.1].forEach((width, i) => (sheet.getColumn(i + 2).width = width));

  const { ALIMENTAIRE, EAU, CHIMIE } = report.synthesis;
  for (const column of ["B", "C", "D", "E", "F"]) sheet.mergeCells(`${column}6:${column}7`);
  sheet.getCell("C6").value = "Microbiologie alimentaire";
  sheet.getCell("D6").value = "Microbilogie des eaux";
  sheet.getCell("E6").value = "Chimie alimentaire";
  sheet.getCell("F6").value = "Totaux";
  for (const column of ["B", "C", "D", "E"]) box(sheet.getCell(`${column}6`), { bold: true });
  box(sheet.getCell("F6"), { bold: true, fill: SYNTH_FILL });

  const sum = (r: number) => ({ formula: `C${r}+D${r}+E${r}`, result: 0 });
  const values = (r: number, figures: [number, number, number]) => {
    ["C", "D", "E"].forEach((column, i) => {
      sheet.getCell(`${column}${r}`).value = figures[i];
      box(sheet.getCell(`${column}${r}`), { bold: true });
    });
    sheet.getCell(`F${r}`).value = { ...sum(r), result: figures[0] + figures[1] + figures[2] };
    box(sheet.getCell(`F${r}`), { bold: true });
  };
  const label = (r: number, text: string | ExcelJS.CellRichTextValue) => {
    sheet.getCell(`B${r}`).value = text;
    box(sheet.getCell(`B${r}`), { bold: true, align: { vertical: "top", wrapText: true } });
  };

  label(8, "Nombre d’échantillons");
  values(8, [ALIMENTAIRE.samples, EAU.samples, CHIMIE.samples]);
  label(9, "Nombre d’analyses effectuées");
  values(9, [ALIMENTAIRE.analyses, EAU.analyses, CHIMIE.analyses]);
  sheet.getRow(8).height = 48;
  sheet.getRow(9).height = 48;

  for (const r of [10, 12]) {
    for (const column of ["B", "C", "D", "E", "F"]) box(sheet.getCell(`${column}${r}`), { fill: SELF_FILL });
  }
  sheet.mergeCells("B11:F11");
  sheet.getCell("B11").value = "RESULTATS";
  box(sheet.getCell("B11"), { bold: true });

  const star = (text: string): ExcelJS.CellRichTextValue => ({
    richText: [{ text, font: { bold: true } }, { text: "*", font: { bold: true, size: 12, color: { argb: "FF0070C0" } } }],
  });
  const nc: [number, number, number] = [ALIMENTAIRE.nonConformes, EAU.nonConformes, CHIMIE.nonConformes];
  label(13, star("Conformes "));
  ["C", "D", "E"].forEach((column, i) => {
    const analyses = [ALIMENTAIRE.analyses, EAU.analyses, CHIMIE.analyses][i];
    sheet.getCell(`${column}13`).value = { formula: `${column}9-${column}14`, result: analyses - nc[i] };
    box(sheet.getCell(`${column}13`), { bold: true });
  });
  const conformes = ALIMENTAIRE.analyses + EAU.analyses + CHIMIE.analyses - nc[0] - nc[1] - nc[2];
  sheet.getCell("F13").value = { ...sum(13), result: conformes };
  box(sheet.getCell("F13"), { bold: true });
  label(14, star("Non conformes "));
  values(14, nc);
  label(15, "Totaux");
  ["C", "D", "E"].forEach((column, i) => {
    const analyses = [ALIMENTAIRE.analyses, EAU.analyses, CHIMIE.analyses][i];
    sheet.getCell(`${column}15`).value = { formula: `${column}13+${column}14`, result: analyses };
    box(sheet.getCell(`${column}15`), { bold: true });
  });
  sheet.getCell("F15").value = { formula: "SUM(F13:F14)", result: ALIMENTAIRE.analyses + EAU.analyses + CHIMIE.analyses };
  box(sheet.getCell("F15"), { bold: true, fill: HEADER_FILL });
  sheet.getRow(13).height = 32.25;
  sheet.getRow(14).height = 48;

  sheet.getCell("B17").value = "* Comptés par analyse (paramètre d'un échantillon), comme les formules du canevas.";
  sheet.getCell("B17").font = { italic: true, color: { argb: "FF475569" } };
}

// ---- Notes -------------------------------------------------------------------

function notes(workbook: ExcelJS.Workbook, report: OnssaReport, meta: OnssaWorkbookMeta) {
  const sheet = workbook.addWorksheet("Notes");
  sheet.getColumn(1).width = 60;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 16;
  title(sheet, meta, `Généré le ${meta.generatedAt}. Règles de comptage à confirmer par le laboratoire (R-22).`);

  const lines: (string | [string, number | string, (number | string)?])[] = [
    "",
    "Règles appliquées",
    `• Échantillons du mois par ${meta.countBasis}, validation administrative signée ; un échantillon annulé ne compte jamais.`,
    "• Une analyse = un paramètre d'un échantillon avec un résultat (les n unités d'un plan comptent une fois).",
    "• NC = verdict « Non satisfaisant », ou « non conforme » sans plan ; « Acceptable » compte comme conforme.",
    "• Groupe = celui de la famille de produits, sinon celui du type d'analyse ; colonne = celle du paramètre (la méthode départage les levures et les moisissures).",
    "• Contrôle officiel / autocontrôle = la case de la série ; l'établissement vide = le client et son site.",
    "",
    [`Échantillons du mois pas encore validés (non comptés)`, meta.pendingSamples],
    [`Échantillons déclarés`, report.declaredSamples],
    "",
  ];
  if (report.unmapped.samples.length > 0) {
    lines.push(["Échantillons sans groupe de produits (non déclarés)", "Échantillons", "Analyses"]);
    for (const entry of report.unmapped.samples) lines.push([entry.label, entry.samples, entry.analyses]);
    lines.push("");
  }
  if (report.unmapped.parameters.length > 0) {
    lines.push(["Paramètres sans colonne ONSSA (non déclarés)", "Analyses"]);
    for (const entry of report.unmapped.parameters) lines.push([entry.name, entry.analyses]);
  }

  let row = 5;
  for (const line of lines) {
    if (typeof line === "string") {
      sheet.getCell(`A${row}`).value = line || null;
      if (line === "Règles appliquées") sheet.getCell(`A${row}`).font = { bold: true };
      sheet.getCell(`A${row}`).alignment = { wrapText: true, vertical: "top" };
    } else {
      sheet.getCell(`A${row}`).value = line[0];
      sheet.getCell(`B${row}`).value = line[1];
      if (line[2] !== undefined) sheet.getCell(`C${row}`).value = line[2];
      if (typeof line[1] === "string") sheet.getRow(row).font = { bold: true };
    }
    row += 1;
  }
}

/** The workbook of a month's report. */
export function buildOnssaWorkbook(report: OnssaReport, meta: OnssaWorkbookMeta): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Qualilab";
  // Excel recomputes every formula on opening (a cached zero is not written).
  workbook.calcProperties.fullCalcOnLoad = true;
  sheet1(workbook, report, meta);
  sheet2(workbook, report, meta);
  sheet3(workbook, report, meta);
  notes(workbook, report, meta);
  return workbook;
}
