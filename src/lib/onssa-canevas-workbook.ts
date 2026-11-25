import ExcelJS from "exceljs";
import { ONSSA_CHEMISTRY_OWN_ROW, ONSSA_EMPTY_ORIGIN_AGRO, ONSSA_IV_NON_ACCREDITED, ONSSA_SECTIONS_FROM_APP } from "./lab-proposals";
import { ONSSA_COLUMNS } from "./onssa-canevas";
import {
  NO_ORIGIN,
  ONSSA_CHEMISTRY_GROUP,
  type OnssaGroupBlock,
  type OnssaReport,
  type OnssaReportOptions,
} from "./onssa-report";
import { EMPTY_ONSSA_SECTIONS, countLine, type OnssaSections } from "./onssa-sections";
import { columnLetter } from "./onssa-workbook";

/**
 * Lot 6C, N5 (RETOUR-LABO-25-11.md §3, §7) — the ONSSA monthly activity
 * report in the complete canevas the laboratory sent on 25/11 (« NV CANEVAS
 * RA LABO.xlsx »): its seven sheets, same names (trailing spaces included)
 * and order, same headers, merges, widths, orientation and print areas, its
 * fixed texts (cover, plan, tutorial, titles of III and IV) — plus a last
 * sheet « Notes Qualilab », outside the canevas.
 *
 * - « P,Garde »: the laboratory and « Mois Année ».
 * - « I-AGL »: samples as values; analyses, conformes, non conformes as
 *   formulas over « II-AT », their result cached.
 * - « II-AT » — II-1: per group, the official-control lines (organisme,
 *   établissement, origine) and the autocontrôle lines (origine) side by
 *   side, « RàS » when empty, the group's total merged = a formula to II-2;
 *   II-2: groups × the 24 columns of `ONSSA_COLUMNS` (headers and norms),
 *   rows « Réalisées » / « NC », the chemistry on its own row
 *   (`ONSSA_CHEMISTRY_OWN_ROW`), totals over every column. Never a client's
 *   name in II-2 (the canevas: « L'identité du client n'est pas demandée »).
 * - « III-AD »: III-1, III-5, III-6-1, III-6-3 from the application
 *   (`ONSSA_SECTIONS_FROM_APP`), the other tables left to fill.
 * - « IV-Autres informations »: empty, or the parameters « non accrédité »
 *   (`ONSSA_IV_NON_ACCREDITED`).
 *
 * The canevas' own formulas are inconsistent (row totals over C:V, C:T or
 * C:Y, « =Z52:Z53 », a second « Réalisées » where « NC » is meant, the chemistry
 * left out of I-AGL's conformes): the workbook writes consistent ones — every
 * column C:Z, the non-conformes taken off everywhere — and says so in the notes.
 */

export const CANEVAS_SHEETS = {
  garde: "P,Garde",
  plan: "Plan",
  tutoriel: "TUTORIEL",
  agl: "I-AGL",
  at: "II-AT  ",
  ad: "III-AD ",
  iv: "IV-Autres informations ",
  notes: "Notes Qualilab",
} as const;

export type OnssaCanevasMeta = {
  /** « Octobre 2026 ». */
  monthLabel: string;
  labName: string;
  /** « 01/11/2026 à 09:30 ». */
  generatedAt: string;
  /** « date de réception » / « date de validation administrative ». */
  countBasis: string;
  /** Samples received in the month not yet validated; null on the validation basis. */
  pendingSamples: number | null;
};

/** The canevas' reading of the month (`buildOnssaReport`'s options), from the switches. */
export function canevasReportOptions(): OnssaReportOptions {
  return {
    chemistryOwnRow: ONSSA_CHEMISTRY_OWN_ROW,
    emptyOrigin: ONSSA_EMPTY_ORIGIN_AGRO ? AGRO_ORIGIN : NO_ORIGIN,
  };
}

/** « Agro-alimentaire » — what the month the laboratory filled writes in every « Origine ». */
export const AGRO_ORIGIN = "Agro-alimentaire";

/** What the laboratory writes in an empty table (« Rien à signaler »). */
export const NOTHING = "RàS";

/** « 'II-AT  '!AA42 ». */
export const atRef = (address: string) => `'${CANEVAS_SHEETS.at}'!${address}`;

// ---- Styles ------------------------------------------------------------------

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };
const LEFT: Partial<ExcelJS.Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
const HEADER_FILL = solid("FFDDEBF7");
const SELF_FILL = solid("FFE2EFDA");
const TOTAL_FILL = solid("FFF2F2F2");

type BoxOptions = { bold?: boolean; size?: number; fill?: ExcelJS.Fill; align?: Partial<ExcelJS.Alignment> };

function box(cell: ExcelJS.Cell, options: BoxOptions = {}) {
  cell.border = THIN;
  cell.font = { name: "Calibri", size: options.size ?? 11, bold: options.bold ?? false };
  if (options.fill) cell.fill = options.fill;
  cell.alignment = options.align ?? CENTER;
}

function text(sheet: ExcelJS.Worksheet, address: string, value: string, options: { bold?: boolean; size?: number; wrap?: boolean } = {}) {
  const cell = sheet.getCell(address);
  cell.value = value;
  cell.font = { name: "Calibri", size: options.size ?? 11, bold: options.bold ?? false };
  if (options.wrap) cell.alignment = { vertical: "top", wrapText: true };
}

function widths(sheet: ExcelJS.Worksheet, values: Record<string, number>) {
  for (const [letter, width] of Object.entries(values)) sheet.getColumn(letter).width = width;
}

function heights(sheet: ExcelJS.Worksheet, values: Record<number, number>) {
  for (const [row, height] of Object.entries(values)) sheet.getRow(Number(row)).height = height;
}

function page(
  sheet: ExcelJS.Worksheet,
  printArea: string,
  options: { landscape?: boolean; scale?: number } = {}
) {
  sheet.pageSetup.printArea = printArea;
  sheet.pageSetup.orientation = options.landscape ? "landscape" : "portrait";
  sheet.pageSetup.paperSize = 9; // A4
  if (options.scale) sheet.pageSetup.scale = options.scale;
}

type Formula = { formula: string; result: number };
const sumOf = (terms: string[], result: number): Formula | number =>
  terms.length === 0 ? 0 : { formula: terms.join("+"), result };

// ---- P,Garde, Plan, TUTORIEL (fixed texts of the canevas) ----------------------

const NBSP = " ";

const PLAN_III = [
  "III-1-Essais inter labo, nouvelles méthodes, autres actualités.",
  "III-2-Situation de l’accréditation et audit de surveillance.",
  "III-3-Formations",
  "III-4-Participations du labo à des activités scientifiques ou à des animations.",
  `III-5-Réseau de surveillance sanitaire${NBSP}: liste des souches isolées.`,
  "III-6-Commentaires et remarques en relation avec les réalisations y compris le retour d’information sur la qualité des prélèvements reçus et les éventuelles réclamations.",
];

function coverSheet(sheet: ExcelJS.Worksheet, meta: OnssaCanevasMeta) {
  sheet.mergeCells("A10:G10");
  sheet.mergeCells("A11:G11");
  sheet.mergeCells("A20:G20");
  sheet.mergeCells("B27:E27");
  const lines: [string, string, number][] = [
    ["A10", "RAPPORT D'ACTIVITE MENSUEL/ANNUEL ", 14],
    ["A11", "DES LABORATOIRES AGREES ET/OU RECONNUS PAR L'ONSSA", 14],
    ["A20", `LABORATOIRE: ${meta.labName}`, 16],
    ["B27", `MOIS/ANNEE: ${meta.monthLabel}`, 12],
  ];
  for (const [address, value, size] of lines) {
    text(sheet, address, value, { bold: true, size });
    sheet.getCell(address).alignment = { horizontal: "center", vertical: "middle" };
  }
  heights(sheet, { 10: 15, 11: 18.75, 18: 18.75, 19: 18.75, 20: 21, 27: 15.75, 49: 15.75 });
  page(sheet, "A1:G49");
}

function planSheet(sheet: ExcelJS.Worksheet) {
  for (const range of ["A1:G1", "A3:G3", "A5:G5", "A10:H10", "A19:O19", "B12:H12", "B13:H13", "B14:H14", "B15:H15", "B16:H16", "B17:O17"]) {
    sheet.mergeCells(range);
  }
  text(sheet, "A1", "PLAN", { bold: true, size: 24 });
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  text(sheet, "A3", "I-ACTIVITES GLOBALES DU LABORATOIRE", { bold: true, size: 14 });
  text(sheet, "A5", "II-ACTIVITES PAR THEMATIQUE", { bold: true, size: 14 });
  text(sheet, "B7", "II-1-Cadre de l’analyse et origine.", { size: 12 });
  text(sheet, "B8", "II-2-Analyses réalisées par produits et par paramètre recherché.", { size: 12 });
  text(sheet, "A10", "III-ACTIVITES DIVERS EN RELATION AVEC LES ANALYSES DE LA PORTEE  ACCORDEE", { bold: true, size: 14, wrap: true });
  PLAN_III.forEach((line, i) => text(sheet, `B${12 + i}`, line, { size: 12, wrap: i === 5 }));
  text(sheet, "A19", "IV-INFORMATIONS SUR D'AUTRES ANALYSES EN DEVELOPPEMENT", { bold: true, size: 14, wrap: true });
  widths(sheet, { A: 5.29, H: 14.71 });
  heights(sheet, { 1: 31.5, 3: 53.25, 4: 38.25, 5: 18.75, 6: 21, 9: 45, 10: 37.5, 11: 18.75, 17: 18, 18: 45, 19: 42.6 });
  page(sheet, "A1:H19");
}

/** The tutorial of the canevas, as written there (its spelling kept). */
const TUTORIAL: { address: string; value: string; bold: boolean; size: number; merge?: string }[] = [
  { address: "A1", value: "I-ACTIVITES GLOBALES DU LABORATOIRE", bold: true, size: 14 },
  {
    address: "A2",
    merge: "A2:Q2",
    value:
      '- Remplir le tableau en précisant dans les colonnes "Thématique 1,2,3 …" uniquement les domaines figurant dans la portée d\'agrément/reconnaissance de votre laboratoire.',
    bold: true,
    size: 12,
  },
  { address: "A3", merge: "A3:Q3", value: "- Préciser: qu'est une téhamtique: exemple: microbiologie alimentaire…", bold: true, size: 12 },
  {
    address: "A4",
    merge: "A4:Q4",
    value: "- Le nombre des analyses doit etre supérieur ou égal au nombre des échantillons,",
    bold: true,
    size: 12,
  },
  { address: "A6", value: "II-ACTIVITES PAR THEMATIQUE", bold: true, size: 14 },
  { address: "B8", merge: "B8:D8", value: "II-1-Cadre de l’analyse et origine.", bold: true, size: 12 },
  {
    address: "A9",
    merge: "A9:Q9",
    value:
      "- Identifier le groupe de produit analysé: Produits végétaux et d'origine végétale, produits animaix et d'origine animale, produits de peche, eaux d'élevage ou d'agro-industrie, …..",
    bold: true,
    size: 12,
  },
  {
    address: "A10",
    merge: "A10:Q10",
    value:
      "- Préciser, pour chaque groupe de produit analysé, le cadre de l'analyse (Contrôle officiel ou autocontrole) et le total des analyses réalisées.",
    bold: true,
    size: 12,
  },
  {
    address: "A11",
    merge: "A11:Q11",
    value:
      "- Le total des analyses réalisées déclaré dans ce tableau doit etre identique à celui déclaré dans le tableau I-Activités globales du laboratoire.",
    bold: true,
    size: 12,
  },
  {
    address: "A12",
    merge: "A12:Q12",
    value:
      "- Pour le contrôle officiel il faut préciser:  - le nom de la Direction Régionale de l'ONSSA donneur d'ordre et le nom de l'organisme préleveur agréé effectuant l'analyse (selon le cas)",
    bold: true,
    size: 12,
  },
  {
    address: "A13",
    merge: "A13:Q13",
    value: "                                                                    - le nom de l'établissement objet du contrôle officiel",
    bold: true,
    size: 12,
  },
  {
    address: "A14",
    merge: "A14:Q14",
    value:
      "                                                                    - l'origine de l'établissement (=Domaine d'activité): Agro-alimentaire, Exploitation, Elevage, …",
    bold: true,
    size: 12,
  },
  {
    address: "A15",
    merge: "A15:Q15",
    value:
      "- Pour l'autocontrole) il faut préciser: l'origine de l'établissement (=Domaine d'activité): Agro-alimentaire, Exploitation, Elevage, …",
    bold: true,
    size: 12,
  },
  { address: "B17", merge: "B17:F17", value: "II-2-Analyses réalisées par produit et par paramètre .", bold: true, size: 12 },
  {
    address: "A19",
    merge: "A19:Q19",
    value:
      "- Identifier le groupe de produit analysé: Produits végétaux et d'origine végétale, produits animaix et d'origine animale, produits de peche, eaux d'élevage ou d'agro-industrie, …..",
    bold: true,
    size: 12,
  },
  {
    address: "A20",
    merge: "A20:Q20",
    value: "- Pour chaque groupe de produit analysé, il faut préciser : - Le nom du paramètre recherché et la référence normative adoptée ",
    bold: true,
    size: 12,
  },
  {
    address: "A21",
    merge: "A21:Q21",
    value:
      "                                                                                                   - Le nombre des analyses réalisées par paramètre recherché. ",
    bold: true,
    size: 12,
  },
  {
    address: "A22",
    merge: "A22:Q22",
    value:
      "                                                                                                  - Le nombre des non-conformités détéctées par paramètre recherché. ",
    bold: true,
    size: 12,
  },
  {
    address: "A23",
    merge: "A23:R23",
    value:
      "- Le total des analyses réalisées déclaré dans ce tableau doit etre identique à celui déclaré dans le Tableau I-Activités globales du laboratoire et celui déclaré dans le Tableau  II-1 Cadre de l'analyse et origine.",
    bold: true,
    size: 12,
  },
  {
    address: "A24",
    merge: "A24:R24",
    value:
      "- Le total des non-conformités déclaré dans ce tableau doit etre identique à celui déclaré dans le Tableau I-Activités globales du laboratoire.",
    bold: true,
    size: 12,
  },
  {
    address: "A25",
    merge: "A25:R25",
    value:
      "- Préciser pour les non-conformités des résidus de pesticides: il faut identifier le noms et le nombre de molécule détéctée non conforme (Dépasse Les LMR, molécule non homologuée ou autorisée dans un autre usage). ",
    bold: true,
    size: 12,
  },
  {
    address: "A27",
    merge: "A27:H27",
    value: "III-ACTIVITES DIVERS EN RELATION AVEC LES ANALYSES DE LA PORTEE  ACCORDEE",
    bold: true,
    size: 14,
  },
  ...PLAN_III.map((value, i) => ({
    address: `B${29 + i}`,
    merge: i === 5 ? "B34:O34" : `B${29 + i}:H${29 + i}`,
    value,
    bold: false,
    size: 12,
  })),
  {
    address: "A36",
    merge: "A36:O36",
    value: "IV-INFORMATIONS SUR LES AUTRES CAPACITES ANALYTIQUES D’INTERET QUE LE LABORATOIRE PEUT REALISER HORS PORTEE DE L'ONSSA",
    bold: true,
    size: 14,
  },
];

function tutorialSheet(sheet: ExcelJS.Worksheet) {
  for (const line of TUTORIAL) {
    if (line.merge) sheet.mergeCells(line.merge);
    text(sheet, line.address, line.value, { bold: line.bold, size: line.size, wrap: true });
  }
  widths(sheet, { A: 5.29, H: 14.86, R: 15.71 });
  heights(sheet, {
    1: 30, 2: 30, 3: 30, 4: 30, 5: 30, 6: 18.75, 7: 21, 9: 30, 10: 30, 11: 30, 12: 30, 13: 30, 14: 30, 15: 33.6,
    19: 30, 20: 31.15, 21: 28.15, 22: 28.15, 23: 28.15, 24: 28.15, 25: 28.15, 27: 37.5, 28: 18.75, 35: 45, 36: 39.6,
  });
  // As received: portrait, no print area.
  sheet.pageSetup.orientation = "portrait";
  sheet.pageSetup.paperSize = 9;
}

// ---- II-AT -------------------------------------------------------------------

/** II-2's columns: C … Y the microbiology, Z the chemistry, AA the row total. */
const FIRST_DATA_COLUMN = 3;
const TOTAL_COLUMN = FIRST_DATA_COLUMN + ONSSA_COLUMNS.length;
const FIRST = columnLetter(FIRST_DATA_COLUMN);
const CHEM = columnLetter(TOTAL_COLUMN - 1);
const TOTAL = columnLetter(TOTAL_COLUMN);

/** Where II-2 wrote each block, and its totals (I-AGL's formulas point there). */
type AtLayout = {
  rows: Map<OnssaGroupBlock, { realisees: number; nc: number }>;
  totalRealisees: number;
  totalNc: number;
  ii1Total: number;
  ii1Lines: number;
  lastRow: number;
};

const isChemistry = (block: OnssaGroupBlock) => block.group.id === ONSSA_CHEMISTRY_GROUP.id;

/** II-1 lines of a group: the official-control and autocontrôle lines side by side. */
function ii1Lines(block: OnssaGroupBlock) {
  const count = Math.max(block.official.length, block.self.length, 1);
  return Array.from({ length: count }, (_, i) => ({
    official: block.official[i] ?? null,
    self: block.self[i] ?? null,
    nothingOfficial: i === 0 && block.official.length === 0,
    nothingSelf: i === 0 && block.self.length === 0,
  }));
}

function atSheet(sheet: ExcelJS.Worksheet, report: OnssaReport): AtLayout {
  sheet.mergeCells("B1:G1");
  text(sheet, "B1", "II-ACTIVITES PAR THEMATIQUE", { bold: true, size: 16 });
  sheet.getCell("B1").alignment = { horizontal: "center", vertical: "middle" };
  text(sheet, "A3", `II-1-Cadre de l’analyse et origine${NBSP}:`, { bold: true, size: 14 });

  // II-1 header (rows 4–6, as the canevas).
  for (const range of ["A4:A6", "B4:E4", "F4:F6", "B5:D5"]) sheet.mergeCells(range);
  const headers: [string, string][] = [
    ["A4", "Groupe de produits"],
    ["B4", "Nombre d'analyse"],
    ["F4", "total "],
    ["B5", "Contrôle Officiel"],
    ["E5", "Autocontrôle "],
    ["B6", "DR ONSSA/Organisme préleveur agréé"],
    ["C6", "Nom  de l'établissement"],
    ["D6", "Origine "],
    ["E6", "Origine "],
  ];
  for (const [address, value] of headers) sheet.getCell(address).value = value;
  for (const row of [4, 5, 6]) {
    for (const column of ["A", "B", "C", "D", "E", "F"]) {
      box(sheet.getCell(`${column}${row}`), { bold: true, size: 12, fill: column === "E" ? SELF_FILL : column === "F" ? HEADER_FILL : undefined });
    }
  }

  // II-2 goes after II-1: lay II-1 out first to know where II-2 starts.
  const ii1Start = 7;
  const lineCount = report.groups.reduce((sum, block) => sum + ii1Lines(block).length, 0);
  const ii1Total = ii1Start + lineCount;
  const ii2Title = ii1Total + 2;
  const ii2Header = ii2Title + 2;
  const firstBlockRow = ii2Header + 2;

  const rows = new Map<OnssaGroupBlock, { realisees: number; nc: number }>();
  report.groups.forEach((block, i) => rows.set(block, { realisees: firstBlockRow + 2 * i, nc: firstBlockRow + 2 * i + 1 }));
  const totalRealisees = firstBlockRow + 2 * report.groups.length;
  const totalNc = totalRealisees + 1;

  // II-1 lines.
  let row = ii1Start;
  for (const block of report.groups) {
    const start = row;
    const lines = ii1Lines(block);
    for (const line of lines) {
      const official = line.official;
      sheet.getCell(`B${row}`).value = official ? official.organisme : line.nothingOfficial ? NOTHING : null;
      sheet.getCell(`C${row}`).value = official ? official.etablissement : line.nothingOfficial ? NOTHING : null;
      sheet.getCell(`D${row}`).value = official ? official.origine : line.nothingOfficial ? NOTHING : null;
      sheet.getCell(`E${row}`).value = line.self ? line.self.origine : line.nothingSelf ? NOTHING : null;
      for (const column of ["A", "B", "C", "D", "E", "F"]) {
        box(sheet.getCell(`${column}${row}`), { align: column === "A" ? LEFT : CENTER, fill: column === "E" ? SELF_FILL : undefined });
      }
      row += 1;
    }
    const end = row - 1;
    sheet.getCell(`A${start}`).value = block.group.name;
    sheet.getCell(`F${start}`).value = { formula: `${TOTAL}${rows.get(block)!.realisees}`, result: block.total.realisees };
    if (end > start) {
      sheet.mergeCells(`A${start}:A${end}`);
      sheet.mergeCells(`F${start}:F${end}`);
      // One organisme over consecutive lines: one merged cell, as the laboratory writes it.
      let runStart = start;
      for (let r = start + 1; r <= end + 1; r += 1) {
        const same = r <= end && lines[r - start].official && sheet.getCell(`B${r}`).value === sheet.getCell(`B${runStart}`).value;
        if (!same) {
          if (r - 1 > runStart && lines[runStart - start].official) sheet.mergeCells(`B${runStart}:B${r - 1}`);
          runStart = r;
        }
      }
    }
  }
  sheet.mergeCells(`A${ii1Total}:E${ii1Total}`);
  sheet.getCell(`A${ii1Total}`).value = "Total";
  box(sheet.getCell(`A${ii1Total}`), { bold: true, fill: TOTAL_FILL, align: { horizontal: "right", vertical: "middle" } });
  sheet.getCell(`F${ii1Total}`).value =
    lineCount > 0 ? { formula: `SUM(F${ii1Start}:F${ii1Total - 1})`, result: report.total.realisees } : 0;
  box(sheet.getCell(`F${ii1Total}`), { bold: true, fill: HEADER_FILL });

  // II-2.
  text(
    sheet,
    `A${ii2Title}`,
    `II-2-Analyses réalisées par produits et par paramètre recherché${NBSP}: L’identité du client n’est pas demandée dans ce tableau.`,
    { bold: true, size: 14 }
  );
  for (const column of ["A", "B", CHEM, TOTAL]) sheet.mergeCells(`${column}${ii2Header}:${column}${ii2Header + 1}`);
  sheet.getCell(`A${ii2Header}`).value = "Types de produits";
  sheet.getCell(`B${ii2Header}`).value = "Nombres d'analyses";
  ONSSA_COLUMNS.forEach((column, i) => {
    const letter = columnLetter(FIRST_DATA_COLUMN + i);
    sheet.getCell(`${letter}${ii2Header}`).value = column.header;
    if (column.kind === "MICRO") sheet.getCell(`${letter}${ii2Header + 1}`).value = column.method;
  });
  sheet.getCell(`${TOTAL}${ii2Header}`).value = "Total";
  for (let i = 1; i <= TOTAL_COLUMN; i += 1) {
    for (const r of [ii2Header, ii2Header + 1]) box(sheet.getCell(`${columnLetter(i)}${r}`), { size: 9, fill: HEADER_FILL });
  }

  for (const block of report.groups) {
    const at = rows.get(block)!;
    sheet.mergeCells(`A${at.realisees}:A${at.nc}`);
    sheet.getCell(`A${at.realisees}`).value = block.group.name;
    box(sheet.getCell(`A${at.realisees}`), { size: 9, align: LEFT });
    ([
      ["Réalisées", "realisees", at.realisees],
      ["NC", "nonConformes", at.nc],
    ] as const).forEach(([label, field, r]) => {
      sheet.getCell(`B${r}`).value = label;
      box(sheet.getCell(`B${r}`), { size: 9, align: LEFT });
      ONSSA_COLUMNS.forEach((column, i) => {
        const cell = sheet.getCell(`${columnLetter(FIRST_DATA_COLUMN + i)}${r}`);
        cell.value = block.columns[column.key][field];
        box(cell, { size: 9 });
      });
      const total = sheet.getCell(`${TOTAL}${r}`);
      total.value = { formula: `SUM(${FIRST}${r}:${CHEM}${r})`, result: block.total[field] };
      box(total, { size: 9, bold: true });
    });
  }

  sheet.mergeCells(`A${totalRealisees}:A${totalNc}`);
  sheet.getCell(`A${totalRealisees}`).value = "Total ";
  box(sheet.getCell(`A${totalRealisees}`), { size: 9, bold: true, fill: TOTAL_FILL, align: LEFT });
  const blockFirst = firstBlockRow;
  const blockLast = totalRealisees - 1;
  ([
    ["Réalisées", "realisees", totalRealisees],
    ["NC", "nonConformes", totalNc],
  ] as const).forEach(([label, field, r]) => {
    sheet.getCell(`B${r}`).value = label;
    box(sheet.getCell(`B${r}`), { size: 9, fill: TOTAL_FILL, align: LEFT });
    for (let i = FIRST_DATA_COLUMN; i <= TOTAL_COLUMN; i += 1) {
      const letter = columnLetter(i);
      const result = i === TOTAL_COLUMN ? report.total[field] : report.columnTotals[ONSSA_COLUMNS[i - FIRST_DATA_COLUMN].key][field];
      const cell = sheet.getCell(`${letter}${r}`);
      cell.value =
        i === TOTAL_COLUMN
          ? { formula: `SUM(${FIRST}${r}:${CHEM}${r})`, result }
          : blockLast >= blockFirst
            ? { formula: `SUMIF($B$${blockFirst}:$B$${blockLast},"${label}",${letter}${blockFirst}:${letter}${blockLast})`, result }
            : result;
      box(cell, { size: 9, bold: true, fill: TOTAL_FILL });
    }
  });

  widths(sheet, {
    A: 24.86, B: 36.14, C: 23, D: 23.43, E: 21.43, F: 18.14, G: 14.86, H: 14, I: 9.71, J: 8.14, K: 7.43, N: 13.14, O: 20.29,
    P: 10.57, Q: 10.71, R: 11, S: 9.29, T: 11.14, U: 11.14, X: 12.29, Y: 11.14,
  });
  heights(sheet, { 1: 28.5, 3: 32.25, 4: 18.6, 5: 19.5, 6: 38.25, [ii2Header]: 31.5, [ii2Header + 1]: 31.5 });
  page(sheet, `A1:${TOTAL}${totalNc}`, { landscape: true, scale: 50 });
  return { rows, totalRealisees, totalNc, ii1Total, ii1Lines: lineCount, lastRow: totalNc };
}

// ---- I-AGL -------------------------------------------------------------------

function aglSheet(sheet: ExcelJS.Worksheet, report: OnssaReport, at: AtLayout) {
  for (const range of ["A2:E2", "A4:A5", "B4:B5", "C4:C5", "D4:D5", "E4:E5", "A8:E8", "A9:E9", "A10:E10"]) sheet.mergeCells(range);
  text(sheet, "A2", "I-ACTIVITES GLOBALES DU LABORATOIRE", { bold: true, size: 16 });
  sheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
  const heads: [string, string][] = [
    ["B4", "Microbiologie alimentaire"],
    ["C4", "Microbilogie des eaux"],
    ["D4", "Chimie alimentaire "],
    ["E4", "Totaux"],
  ];
  for (const [address, value] of heads) sheet.getCell(address).value = value;
  for (const column of ["A", "B", "C", "D", "E"]) {
    for (const r of [4, 5]) box(sheet.getCell(`${column}${r}`), { bold: true, size: 12, fill: column === "E" ? HEADER_FILL : undefined });
  }

  const { ALIMENTAIRE, EAU, CHIMIE } = report.synthesis;
  const ownRow = report.groups.find(isChemistry);
  // With the chemistry in its groups' rows (switch off), a group's micro is its total minus Z.
  const term = (r: number) => (ownRow ? atRef(`${TOTAL}${r}`) : `(${atRef(`${TOTAL}${r}`)}-${atRef(`${CHEM}${r}`)})`);
  const rowsOf = (domain: "ALIMENTAIRE" | "EAU", field: "realisees" | "nc") =>
    report.groups.filter((block) => !isChemistry(block) && block.group.domain === domain).map((block) => term(at.rows.get(block)![field]));
  const chemistry = (field: "realisees" | "nc") =>
    atRef(`${CHEM}${ownRow ? at.rows.get(ownRow)![field] : field === "realisees" ? at.totalRealisees : at.totalNc}`);

  const label = (r: number, value: string) => {
    sheet.getCell(`A${r}`).value = value;
    box(sheet.getCell(`A${r}`), { bold: true, size: 12, align: LEFT });
  };
  const put = (address: string, value: Formula | number, bold = true) => {
    sheet.getCell(address).value = value;
    box(sheet.getCell(address), { bold, size: 12 });
  };

  label(6, "Nombre d’échantillons");
  put("B6", ALIMENTAIRE.samples, false);
  put("C6", EAU.samples, false);
  put("D6", CHIMIE.samples, false);
  put("E6", { formula: "SUM(B6:D6)", result: ALIMENTAIRE.samples + EAU.samples + CHIMIE.samples });

  label(7, "Nombre d’analyses effectuées");
  put("B7", sumOf(rowsOf("ALIMENTAIRE", "realisees"), ALIMENTAIRE.analyses));
  put("C7", sumOf(rowsOf("EAU", "realisees"), EAU.analyses));
  put("D7", { formula: chemistry("realisees"), result: CHIMIE.analyses });
  put("E7", { formula: "SUM(B7:D7)", result: report.total.realisees });

  sheet.getCell("A9").value = "RESULTATS";
  box(sheet.getCell("A9"), { bold: true, size: 12 });
  for (const r of [8, 10]) box(sheet.getCell(`A${r}`), { fill: SELF_FILL });

  label(11, "Conformes *");
  label(12, "Non conformes *");
  label(13, "Totaux");
  const columns: ["B" | "C" | "D", { analyses: number; nonConformes: number }][] = [
    ["B", ALIMENTAIRE],
    ["C", EAU],
    ["D", CHIMIE],
  ];
  put("B12", sumOf(rowsOf("ALIMENTAIRE", "nc"), ALIMENTAIRE.nonConformes));
  put("C12", sumOf(rowsOf("EAU", "nc"), EAU.nonConformes));
  put("D12", { formula: chemistry("nc"), result: CHIMIE.nonConformes });
  for (const [column, figures] of columns) {
    put(`${column}11`, { formula: `${column}7-${column}12`, result: figures.analyses - figures.nonConformes });
    put(`${column}13`, { formula: `${column}11+${column}12`, result: figures.analyses });
  }
  put("E11", { formula: "B11+C11+D11", result: report.total.realisees - report.total.nonConformes });
  put("E12", { formula: "B12+C12+D12", result: report.total.nonConformes });
  put("E13", { formula: "SUM(E11:E12)", result: report.total.realisees });

  text(sheet, "A15", "*selon la régelemenation en vigueur");
  text(sheet, "A17", "**Exemples de domaines : Microbiologie alimentaire, chimie alimentaire, microbiologie des Eaux.etc");
  widths(sheet, { A: 19.86, B: 19.43, C: 16.43, I: 15.57 });
  heights(sheet, { 2: 76.5, 3: 41.25, 4: 15.75, 5: 32.25, 6: 32.25, 7: 48, 8: 15.75, 9: 15.75, 10: 16.5, 11: 27, 12: 33, 13: 27 });
  page(sheet, "A1:E14", { scale: 98 });
}

// ---- III-AD ------------------------------------------------------------------

function adSheet(sheet: ExcelJS.Worksheet, sections: OnssaSections, fromApp: boolean) {
  text(sheet, "A2", "III-ACTIVITES DIVERS EN RELATION AVEC LES ANALYSES DE LA PORTEE ACCORDEE", { bold: true, size: 14 });
  sheet.mergeCells("A3:H4");
  text(
    sheet,
    "A3",
    `Prévoir dans le rapport toutes les rubriques ci-dessous. En cas d’absence d’informations pour une rubrique, veuillez préciser les mentions${NBSP}: Sans objet ou non prévus.`,
    { bold: true, wrap: true }
  );

  let row = 6;
  const title = (value: string) => {
    text(sheet, `A${row}`, value, { bold: true, size: 12 });
    row += 2;
  };
  const header = (cells: [string, string, string?][]) => {
    for (const [range, value] of cells) {
      if (range.includes(":")) sheet.mergeCells(range);
      const address = range.split(":")[0];
      sheet.getCell(address).value = value;
    }
  };
  const boxRow = (r: number, columns: string[], bold = false) => {
    for (const column of columns) box(sheet.getCell(`${column}${r}`), { bold, align: column === "A" ? LEFT : CENTER });
  };
  /** An activity table the application cannot fill (III-2, III-3, III-4): its header and three lines. */
  const activityTable = () => {
    sheet.mergeCells(`A${row}:D${row}`);
    sheet.getCell(`A${row}`).value = "Activité (s)";
    sheet.getCell(`E${row}`).value = "Date";
    boxRow(row, ["A", "B", "C", "D", "E"], true);
    row += 1;
    for (let i = 0; i < 3; i += 1) {
      sheet.mergeCells(`A${row}:D${row}`);
      boxRow(row, ["A", "B", "C", "D", "E"]);
      row += 1;
    }
    row += 2;
  };

  // III-1 — the EIL.
  title(`III-1-Essais inter labo, nouvelles méthodes, autres actualités${NBSP}:`);
  const eilColumns = ["A", "B", "C", "D", "E", "F"];
  header([
    [`A${row}`, "Parametres"],
    [`B${row}`, "Méthode utilisée"],
    [`C${row}`, "Validation de la méthode "],
    [`D${row}`, "Organisateur d'EIL "],
    [`E${row}`, "Date de réalisation de l'EIL"],
    [`F${row}`, "Résultats"],
  ]);
  boxRow(row, eilColumns, true);
  row += 1;
  if (fromApp && sections.eil.length > 0) {
    for (const eil of sections.eil) {
      [eil.parameter, eil.method, eil.validation, eil.organizer, eil.date, eil.result].forEach(
        (value, i) => (sheet.getCell(`${eilColumns[i]}${row}`).value = value || null)
      );
      boxRow(row, eilColumns);
      row += 1;
    }
  } else {
    const lines = fromApp ? 1 : 3;
    for (let i = 0; i < lines; i += 1) {
      if (fromApp) sheet.getCell(`A${row}`).value = NOTHING;
      boxRow(row, eilColumns);
      row += 1;
    }
  }
  row += 2;

  // III-2, III-3, III-4 — nothing in the application.
  title(" III-2-Situation de l’accréditation et audit de surveillance");
  activityTable();
  title(`III-3-Formations${NBSP}:`);
  activityTable();
  title(`III-4-Participations du labo à des activités scientifiques ou à des animations${NBSP}:`);
  activityTable();

  // III-5 — the strains.
  title(`III-5-Réseau de surveillance sanitaire${NBSP}: liste des souches isolées${NBSP}:`);
  sheet.mergeCells(`A${row}:B${row + 1}`);
  sheet.mergeCells(`C${row}:D${row + 1}`);
  sheet.mergeCells(`F${row}:F${row + 1}`);
  sheet.getCell(`A${row}`).value = "Date";
  sheet.getCell(`C${row}`).value = "Souche";
  sheet.getCell(`E${row}`).value = "Origine ";
  sheet.getCell(`E${row + 1}`).value = "(Type d’aliment/ produit)";
  sheet.getCell(`F${row}`).value = "Région d’origine du produit";
  boxRow(row, ["A", "B", "C", "D", "E", "F"], true);
  boxRow(row + 1, ["A", "B", "C", "D", "E", "F"], true);
  row += 2;
  const strains = fromApp ? sections.strains : [];
  const strainLines = strains.length > 0 ? strains : Array.from({ length: fromApp ? 1 : 3 }, () => null);
  for (const strain of strainLines) {
    sheet.mergeCells(`A${row}:B${row}`);
    sheet.mergeCells(`C${row}:D${row}`);
    const values = strain ? [strain.day, strain.germ, strain.product, strain.region] : fromApp ? [NOTHING, NOTHING, NOTHING, NOTHING] : [null, null, null, null];
    (["A", "C", "E", "F"] as const).forEach((column, i) => (sheet.getCell(`${column}${row}`).value = values[i]));
    boxRow(row, ["A", "B", "C", "D", "E", "F"]);
    row += 1;
  }
  row += 1;

  // III-6 — the comments.
  title(
    `III-6-Commentaires et remarques en relation avec les réalisations y compris${NBSP}le retour d’information sur la qualité des prélèvements reçus et les éventuelles réclamations.:`
  );
  const paragraph = (heading: string, lines: string[] | null) => {
    text(sheet, `A${row}`, heading, { bold: true });
    row += 1;
    const body = lines === null ? [""] : lines.length > 0 ? lines : [NOTHING];
    for (const line of body) {
      sheet.mergeCells(`A${row}:L${row}`);
      sheet.getCell(`A${row}`).value = line || null;
      sheet.getCell(`A${row}`).alignment = { vertical: "top", wrapText: true };
      row += 1;
    }
    row += 1;
  };
  paragraph(
    `III-6-1-les références utilisées pour l’interprétation des résultats et notamment en cas de non conformités${NBSP}:`,
    fromApp ? sections.regulations.map((regulation) => regulation.label) : null
  );
  paragraph(
    `III-6-2-les critères d’acceptation des prélèvements (remarques au sujet de la fiche de prélèvement, du scellé…)${NBSP}:`,
    null
  );
  paragraph(
    "III-6-3-le retour d’information sur la qualité des prélèvements reçus.",
    fromApp ? sections.reception.map(countLine) : null
  );
  paragraph("III-6-4-les éventuelles réclamations émises par le labo ou reçues par des tiers.", null);

  widths(sheet, { A: 33.57, B: 13.14, C: 13.29, D: 13, E: 34.86, F: 28.57, L: 14.14 });
  page(sheet, `A1:L${row}`, { scale: 55 });
}

// ---- IV ----------------------------------------------------------------------

function ivSheet(sheet: ExcelJS.Worksheet, parameters: string[]) {
  sheet.mergeCells("A2:H2");
  text(sheet, "A2", "IV-INFORMATIONS SUR D'AUTRES ANALYSES EN DEVELOPPEMENT.", { bold: true, size: 16 });
  sheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (const range of ["B5:B7", "C5:C7", "D5:D7", "E5:F5", "E6:E7", "F6:F7"]) sheet.mergeCells(range);
  const heads: [string, string][] = [
    ["B5", "Paramettre"],
    ["C5", "Norme"],
    ["D5", "Méthode"],
    ["E5", "Méthode"],
    ["E6", "validé oui/non"],
    ["F6", "accrédité oui/non"],
  ];
  for (const [address, value] of heads) sheet.getCell(address).value = value;
  for (const r of [5, 6, 7]) for (const column of ["B", "C", "D", "E", "F"]) box(sheet.getCell(`${column}${r}`), { bold: true });
  let row = 8;
  const lines = parameters.length > 0 ? parameters : [null, null, null];
  for (const name of lines) {
    sheet.getCell(`B${row}`).value = name;
    if (name) sheet.getCell(`F${row}`).value = "non";
    for (const column of ["B", "C", "D", "E", "F"]) box(sheet.getCell(`${column}${row}`), { align: column === "B" ? LEFT : CENTER });
    row += 1;
  }
  widths(sheet, { A: 5.71, B: 19.43, E: 14, F: 16.86, H: 23.57, O: 14.14 });
  heights(sheet, { 2: 42.75 });
  page(sheet, `A1:H${Math.max(9, row - 1)}`, { scale: 85 });
}

// ---- Notes Qualilab ------------------------------------------------------------

function notesSheet(
  sheet: ExcelJS.Worksheet,
  report: OnssaReport,
  meta: OnssaCanevasMeta,
  options: { ownRow: boolean; emptyOrigin: string; fromApp: boolean; iv: boolean }
) {
  widths(sheet, { A: 34, B: 26, C: 34, D: 34, E: 20, F: 14, G: 12 });
  text(sheet, "A1", `Notes Qualilab — rapport d'activité ONSSA, ${meta.monthLabel}`, { bold: true, size: 13 });
  text(sheet, "A2", `${meta.labName} — généré le ${meta.generatedAt}. Feuille hors canevas : à ne pas envoyer.`);
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF475569" } };

  let row = 4;
  const line = (value: string, bold = false) => {
    sheet.mergeCells(`A${row}:G${row}`);
    text(sheet, `A${row}`, value, { bold, wrap: true });
    row += 1;
  };
  line("Règles de comptage", true);
  line(`• Échantillons du mois par ${meta.countBasis}, validation administrative signée ; un échantillon annulé ne compte jamais.`);
  line("• Une analyse = un paramètre d'un échantillon avec un résultat (les n unités d'un plan comptent une fois).");
  line(
    "• NC = verdict « Non satisfaisant » ; sans verdict officiel, résultat « non conforme » ou verdict indicatif « Non satisfaisant », comme l'alerte de contamination ; « Acceptable » compte comme conforme."
  );
  line("• Groupe = celui de la famille de produits, sinon celui du type d'analyse ; colonne = celle du paramètre (la méthode départage levures et moisissures).");
  line("• Surfaces, mains et air ne sont pas déclarés (sans groupe de produits).");
  line(
    options.ownRow
      ? "• Chimie : toutes les analyses de chimie sur la ligne « Chimie alimentaire » de II-1 et II-2 (colonne Z) ; les lignes des groupes ne portent que la microbiologie."
      : "• Chimie : comptée dans la ligne du groupe de l'échantillon (colonne Z) ; I-AGL la retire des lignes des groupes."
  );
  line(`• « Origine » vide : « ${options.emptyOrigin} ».`);
  line(
    "• I-AGL « Nombre d'échantillons » : un échantillon de microbiologie et de chimie compte dans les deux colonnes — le total E6 du canevas peut donc dépasser le nombre d'échantillons déclarés."
  );
  row += 1;
  line("Formules du canevas corrigées", true);
  line("• Totaux de ligne de II-2 : toujours sur toutes les colonnes C:Z (le canevas reçu somme C:V, C:T ou C:Y selon le groupe).");
  line("• Lignes « NC » titrées « NC » (le canevas reçu en titre deux « Réalisées ») ; total de la chimie = sa cellule Z (le canevas écrit « =Z52:Z53 »).");
  line("• Ligne « Total » de II-2 : toutes les colonnes, chimie comprise ; I-AGL « Conformes » = analyses − non conformes, chimie comprise.");
  line("• II-1 : une ligne « Total » ajoutée sous le tableau (le canevas reçu met la somme hors du tableau).");
  row += 1;

  line("Le mois en chiffres", true);
  const figure = (label: string, value: number) => {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`B${row}`).value = value;
    row += 1;
  };
  figure("Échantillons déclarés", report.declaredSamples);
  figure("Analyses réalisées", report.total.realisees);
  figure("Analyses non conformes", report.total.nonConformes);
  if (meta.pendingSamples !== null) figure("Échantillons du mois pas encore validés (non comptés)", meta.pendingSamples);
  row += 1;

  line("II-1 ligne par ligne (le canevas n'a qu'un total par groupe)", true);
  const heads = ["Groupe", "Cadre", "Organisme préleveur", "Établissement", "Origine", "Échantillons", "Analyses"];
  heads.forEach((value, i) => {
    const cell = sheet.getCell(`${columnLetter(i + 1)}${row}`);
    cell.value = value;
    box(cell, { bold: true, fill: HEADER_FILL });
  });
  row += 1;
  for (const block of report.groups) {
    const lines = [
      ...block.official.map((r) => [block.group.name, "Contrôle officiel", r.organisme, r.etablissement, r.origine, r.samples, r.analyses]),
      ...block.self.map((r) => [block.group.name, "Autocontrôle", "", "", r.origine, r.samples, r.analyses]),
    ];
    for (const values of lines) {
      values.forEach((value, i) => {
        const cell = sheet.getCell(`${columnLetter(i + 1)}${row}`);
        cell.value = value === "" ? null : value;
        box(cell, { align: i >= 5 ? CENTER : LEFT });
      });
      row += 1;
    }
  }
  row += 1;

  if (report.unmapped.samples.length > 0) {
    line("Échantillons sans groupe de produits (non déclarés)", true);
    for (const entry of report.unmapped.samples) {
      sheet.getCell(`A${row}`).value = entry.label;
      sheet.getCell(`B${row}`).value = `${entry.samples} échantillon(s), ${entry.analyses} analyse(s)`;
      row += 1;
    }
    row += 1;
  }
  if (report.unmapped.parameters.length > 0) {
    line("Paramètres sans colonne du canevas (non déclarés)", true);
    for (const entry of report.unmapped.parameters) {
      sheet.getCell(`A${row}`).value = entry.name;
      sheet.getCell(`B${row}`).value = `${entry.analyses} analyse(s)`;
      row += 1;
    }
    row += 1;
  }

  line("Sections III et IV", true);
  line(
    options.fromApp
      ? "• Remplis par l'application : III-1 (EIL de l'année et EIL ouverts), III-5 (germes sensibles détectés), III-6-1 (textes réglementaires choisis), III-6-3 (non-conformités, refus et destructions à la réception) — « RàS » quand le mois n'en a pas."
      : "• Aucune rubrique de III n'est remplie par l'application : à compléter."
  );
  line("• À compléter par le laboratoire : III-2 (accréditation, audits), III-3 (formations), III-4 (participations), III-6-2 (critères d'acceptation), III-6-4 (réclamations).");
  line(options.iv ? "• IV : les paramètres marqués « non accrédité » du catalogue, à relire." : "• IV : à compléter par le laboratoire.");
}

// ---- The workbook --------------------------------------------------------------

/**
 * The month in the canevas of 2026. `report` is built with
 * `canevasReportOptions()` (the chemistry's own row, the empty origin);
 * `sections` is what section III / IV shows (`loadOnssaMonth(…, { sections })`).
 */
export function buildOnssaCanevasWorkbook(
  report: OnssaReport,
  sections: OnssaSections | null,
  meta: OnssaCanevasMeta
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Qualilab";
  // Excel recomputes every formula on opening.
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = (name: string) => workbook.addWorksheet(name, { properties: { defaultRowHeight: 15 } });
  const garde = sheet(CANEVAS_SHEETS.garde);
  const plan = sheet(CANEVAS_SHEETS.plan);
  const tutoriel = sheet(CANEVAS_SHEETS.tutoriel);
  const agl = sheet(CANEVAS_SHEETS.agl);
  const at = sheet(CANEVAS_SHEETS.at);
  const ad = sheet(CANEVAS_SHEETS.ad);
  const iv = sheet(CANEVAS_SHEETS.iv);
  const notes = sheet(CANEVAS_SHEETS.notes);

  const content = sections ?? EMPTY_ONSSA_SECTIONS;
  coverSheet(garde, meta);
  planSheet(plan);
  tutorialSheet(tutoriel);
  const layout = atSheet(at, report);
  aglSheet(agl, report, layout);
  adSheet(ad, content, ONSSA_SECTIONS_FROM_APP);
  ivSheet(iv, ONSSA_IV_NON_ACCREDITED ? content.nonAccredited : []);
  notesSheet(notes, report, meta, {
    ownRow: report.groups.some(isChemistry),
    emptyOrigin: canevasReportOptions().emptyOrigin ?? NO_ORIGIN,
    fromApp: ONSSA_SECTIONS_FROM_APP,
    iv: ONSSA_IV_NON_ACCREDITED,
  });
  return workbook;
}

/** « rapport-activite-onssa-2026-10.xlsx ». */
export function onssaCanevasFileName(month: string): string {
  return `rapport-activite-onssa-${month}.xlsx`;
}
