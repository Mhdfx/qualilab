import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ONSSA_COLUMNS } from "./onssa-canevas";
import {
  CANEVAS_SHEETS,
  NOTHING,
  buildOnssaCanevasWorkbook,
  canevasReportOptions,
  onssaCanevasFileName,
  type OnssaCanevasMeta,
} from "./onssa-canevas-workbook";
import { ONSSA_CHEMISTRY_GROUP, buildOnssaReport, type OnssaGroupRef, type OnssaSampleInput } from "./onssa-report";
import { EMPTY_ONSSA_SECTIONS, type OnssaSections } from "./onssa-sections";

/**
 * Lot 6C, N5 — the complete canevas of 2026: its seven sheets (names with
 * their trailing spaces, order), the cells that carry the figures, the
 * formulas (cached results, and what they compute once Excel recomputes
 * them), the chemistry's own row, section III filled or « RàS », and never a
 * client's name in II-2. Synthetic data only; read back through ExcelJS.
 */

const VEG: OnssaGroupRef = { id: "g-veg", name: "Groupe végétal test", domain: "ALIMENTAIRE", sortOrder: 0, active: true };
const ANI: OnssaGroupRef = { id: "g-ani", name: "Groupe animal test", domain: "ALIMENTAIRE", sortOrder: 1, active: true };
const EAUX: OnssaGroupRef = { id: "g-eaux", name: "Groupe eaux test", domain: "EAU", sortOrder: 2, active: true };

const CLIENT = "Client Fictif Zeta";
const base: Omit<OnssaSampleInput, "id" | "results"> = {
  reference: "1/26",
  clientName: CLIENT,
  siteName: null,
  natureLabel: "Aliments",
  familyName: "Famille test",
  groupId: VEG.id,
  controleOfficiel: false,
  organismePreleveur: null,
  etablissement: null,
  origine: null,
};
const ok = { normCode: null, value: "Absence", interpretation: "SATISFAISANT" as const, informalInterpretation: null, conform: true };
const bad = { ...ok, interpretation: "NON_SATISFAISANT" as const };

const samples: OnssaSampleInput[] = [
  {
    ...base,
    id: "s1",
    controleOfficiel: true,
    organismePreleveur: "Service test A",
    etablissement: "Établissement test 1",
    results: [
      { ...ok, parameterName: "Salmonella", parameterColumn: "SALMONELLA" },
      { ...bad, parameterName: "E. coli", parameterColumn: "ESCHERICHIA_COLI_44" },
      { ...bad, parameterName: "Histamine", parameterColumn: "CHIMIE_ALIMENTAIRE", value: "500" },
    ],
  },
  {
    ...base,
    id: "s2",
    controleOfficiel: true,
    organismePreleveur: "Service test A",
    etablissement: "Établissement test 2",
    results: [{ ...ok, parameterName: "Listeria", parameterColumn: "LISTERIA_MONOCYTOGENES" }],
  },
  { ...base, id: "s3", origine: "Élevage", results: [{ ...ok, parameterName: "FMAT", parameterColumn: "MICRO_ORGANISMES_30" }] },
  { ...base, id: "s4", groupId: ANI.id, results: [{ ...ok, parameterName: "Histamine", parameterColumn: "CHIMIE_ALIMENTAIRE", value: "5" }] },
  {
    ...base,
    id: "s5",
    groupId: EAUX.id,
    natureLabel: "Eaux",
    results: [
      { ...ok, parameterName: "MOR 22", parameterColumn: "MOR_22" },
      { ...bad, parameterName: "Pseudomonas", parameterColumn: "PSEUDOMONAS" },
    ],
  },
  { ...base, id: "s6", groupId: null, natureLabel: "Surfaces", familyName: null, results: [{ ...ok, parameterName: "Flore", parameterColumn: "MICRO_ORGANISMES_30" }] },
];

const meta: OnssaCanevasMeta = {
  monthLabel: "Octobre 2026",
  labName: "Laboratoire Test",
  generatedAt: "01/11/2026 à 09:30",
  countBasis: "date de réception",
  pendingSamples: 1,
};

const sections: OnssaSections = {
  eil: [
    { parameter: "Salmonella — eau", method: "EIL test 2026", validation: "", organizer: "Organisateur test", date: "12/01/2026", result: "Satisfaisant" },
  ],
  strains: [{ day: "14/10/2026", germ: "Salmonella", product: "Famille test", region: "Ville test" }],
  regulations: [{ label: "Texte réglementaire test", samples: 3 }],
  reception: [{ label: "Rupture de la chaîne du froid", samples: 2 }],
  nonAccredited: ["Paramètre non accrédité test"],
};

async function roundTrip(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(buffer as ArrayBuffer);
  return read;
}

const report = buildOnssaReport(samples, [VEG, ANI, EAUX], canevasReportOptions());

function cellsOf(sheet: ExcelJS.Worksheet) {
  const all: { address: string; row: number; value: ExcelJS.CellValue }[] = [];
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      // A merged range reads its master's value in every cell: count it once.
      if (cell.isMerged && cell.master.address !== cell.address) return;
      all.push({ address: cell.address, row: Number(row.number), value: cell.value });
    })
  );
  return all;
}
/** A formula's cached result — ExcelJS writes no cached zero (Excel recomputes on opening). */
const result = (value: ExcelJS.CellValue) => ((value as ExcelJS.CellFormulaValue).result as number | undefined) ?? 0;
const formula = (value: ExcelJS.CellValue) => (value as ExcelJS.CellFormulaValue).formula;
/** The row of II-AT whose column A reads `name` (II-2's block, below its header). */
function rowOf(sheet: ExcelJS.Worksheet, name: string, after: number): number {
  for (let r = after; r <= sheet.rowCount; r += 1) if (sheet.getCell(`A${r}`).value === name) return r;
  throw new Error(`no row ${name}`);
}
/** Evaluates « 'II-AT  '!AA12+('II-AT  '!AA14-'II-AT  '!Z14) » on the cached values of II-AT. */
function evaluate(expression: string, at: ExcelJS.Worksheet): number {
  const replaced = expression.replace(/'II-AT  '!([A-Z]+\d+)/g, (_, address: string) => {
    const value = at.getCell(address).value;
    return String(typeof value === "number" ? value : result(value));
  });
  if (!/^[\d+\-() ]+$/.test(replaced)) throw new Error(`not arithmetic: ${replaced}`);
  return Function(`return (${replaced});`)() as number;
}

describe("the canevas of 2026 — sheets and fixed texts", () => {
  it("has the canevas' seven sheets, names and order as received, then « Notes Qualilab »", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "P,Garde",
      "Plan",
      "TUTORIEL",
      "I-AGL",
      "II-AT  ",
      "III-AD ",
      "IV-Autres informations ",
      "Notes Qualilab",
    ]);
    expect(Object.values(CANEVAS_SHEETS)).toEqual(workbook.worksheets.map((sheet) => sheet.name));
    expect(onssaCanevasFileName("2026-10")).toBe("rapport-activite-onssa-2026-10.xlsx");
  });

  it("names the laboratory and the month on the cover, and keeps the plan and tutorial", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const garde = workbook.getWorksheet("P,Garde")!;
    expect(garde.getCell("A10").value).toBe("RAPPORT D'ACTIVITE MENSUEL/ANNUEL ");
    expect(garde.getCell("A20").value).toBe("LABORATOIRE: Laboratoire Test");
    expect(garde.getCell("B27").value).toBe("MOIS/ANNEE: Octobre 2026");
    const plan = workbook.getWorksheet("Plan")!;
    expect(plan.getCell("A1").value).toBe("PLAN");
    expect(plan.getCell("B16").value).toBe("III-5-Réseau de surveillance sanitaire : liste des souches isolées.");
    const tutorial = workbook.getWorksheet("TUTORIEL")!;
    expect(String(tutorial.getCell("A11").value)).toMatch(/identique à celui déclaré dans le tableau I-Activités globales/);
    expect(String(tutorial.getCell("A36").value)).toMatch(/^IV-INFORMATIONS SUR LES AUTRES CAPACITES/);
  });

  it("prints II-AT in landscape, the others in portrait, each with its print area", async () => {
    const workbook = buildOnssaCanevasWorkbook(report, sections, meta);
    expect(workbook.getWorksheet("II-AT  ")!.pageSetup.orientation).toBe("landscape");
    expect(workbook.getWorksheet("I-AGL")!.pageSetup.orientation).toBe("portrait");
    expect(workbook.getWorksheet("P,Garde")!.pageSetup.printArea).toBe("A1:G49");
    expect(workbook.getWorksheet("Plan")!.pageSetup.printArea).toBe("A1:H19");
    expect(workbook.calcProperties.fullCalcOnLoad).toBe(true);
  });
});

describe("the canevas of 2026 — II-AT", () => {
  it("writes II-2's headers and norms from ONSSA_COLUMNS, C → Z, then « Total »", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const at = workbook.getWorksheet("II-AT  ")!;
    const header = rowOf(at, "Types de produits", 7);
    expect(at.getCell(`B${header}`).value).toBe("Nombres d'analyses");
    expect(at.getCell(`C${header}`).value).toBe("Bacillus cereus");
    expect(at.getCell(`C${header + 1}`).value).toBe("NM ISO 7932 2021");
    expect(at.getCell(`Y${header}`).value).toBe("Clostridia");
    expect(at.getCell(`Z${header}`).value).toBe("chimie alimentaires");
    expect(at.getCell(`AA${header}`).value).toBe("Total");
    const headers = ONSSA_COLUMNS.map((_, i) => at.getCell(header, 3 + i).value);
    expect(headers).toEqual(ONSSA_COLUMNS.map((column) => column.header));
    // II-1's header at the canevas' cells.
    expect(at.getCell("A4").value).toBe("Groupe de produits");
    expect(at.getCell("B6").value).toBe("DR ONSSA/Organisme préleveur agréé");
    expect(at.getCell("C6").value).toBe("Nom  de l'établissement");
    expect(at.getCell("E5").value).toBe("Autocontrôle ");
  });

  it("puts the chemistry on its own row, the groups' rows micro only, rows « Réalisées » / « NC »", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const at = workbook.getWorksheet("II-AT  ")!;
    const header = rowOf(at, "Types de produits", 7);
    const veg = rowOf(at, VEG.name, header);
    const chem = rowOf(at, ONSSA_CHEMISTRY_GROUP.name, header);
    expect([at.getCell(`B${veg}`).value, at.getCell(`B${veg + 1}`).value]).toEqual(["Réalisées", "NC"]);
    expect(at.getCell(`Z${veg}`).value).toBe(0);
    expect(at.getCell(`S${veg}`).value).toBe(1); // Salmonella
    expect(at.getCell(`J${veg + 1}`).value).toBe(1); // E. coli NC
    expect(at.getCell(`Z${chem}`).value).toBe(2);
    expect(at.getCell(`Z${chem + 1}`).value).toBe(1);
    expect(formula(at.getCell(`AA${veg}`).value)).toBe(`SUM(C${veg}:Z${veg})`);
    expect(result(at.getCell(`AA${veg}`).value)).toBe(4);
    // Every row total equals the sum of its cells.
    for (let r = header + 2; r <= at.rowCount; r += 1) {
      const total = at.getCell(`AA${r}`).value;
      if (!total || typeof total !== "object") continue;
      let sum = 0;
      for (let c = 3; c <= 26; c += 1) {
        const v = at.getCell(r, c).value;
        sum += typeof v === "number" ? v : result(v);
      }
      expect(result(total), `row ${r}`).toBe(sum);
    }
  });

  it("lays II-1 out side by side, « RàS » when empty, the group's total a formula to II-2", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const at = workbook.getWorksheet("II-AT  ")!;
    expect(at.getCell("A7").value).toBe(VEG.name);
    // Two official lines (same organisme, merged) and one autocontrôle line (« Élevage »).
    expect([at.getCell("B7").value, at.getCell("C7").value, at.getCell("D7").value]).toEqual([
      "Service test A",
      "Établissement test 1",
      "Agro-alimentaire",
    ]);
    expect(at.getCell("C8").value).toBe("Établissement test 2");
    expect(at.getCell("E7").value).toBe("Élevage");
    expect(at.getCell("B8").isMerged).toBe(true);
    const veg2 = rowOf(at, VEG.name, 10);
    expect(formula(at.getCell("F7").value)).toBe(`AA${veg2}`);
    expect(result(at.getCell("F7").value)).toBe(4);
    // The animal group has only an autocontrôle sample of chemistry: its micro line reads « RàS ».
    const ani = rowOf(at, ANI.name, 7);
    expect([at.getCell(`B${ani}`).value, at.getCell(`E${ani}`).value]).toEqual([NOTHING, NOTHING]);
    expect(result(at.getCell(`F${ani}`).value)).toBe(0);
    // The chemistry's II-1 line: the official and the autocontrôle samples that carried chemistry.
    const chem = rowOf(at, ONSSA_CHEMISTRY_GROUP.name, 7);
    expect(at.getCell(`B${chem}`).value).toBe("Service test A");
    expect(at.getCell(`E${chem}`).value).toBe("Agro-alimentaire");
  });

  it("never names a client in II-2", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const at = workbook.getWorksheet("II-AT  ")!;
    const title = cellsOf(at).find((cell) => String(cell.value).startsWith("II-2-"))!.row;
    const texts = cellsOf(at).filter((cell) => cell.row >= title).map((cell) => JSON.stringify(cell.value));
    expect(texts.some((value) => value.includes(CLIENT))).toBe(false);
    expect(texts.some((value) => value.includes("Établissement test"))).toBe(false);
  });
});

describe("the canevas of 2026 — totals agree (I-AGL = II-1 = II-2)", () => {
  it("I-AGL's analyses and NC are formulas over II-AT that give the report's figures", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const agl = workbook.getWorksheet("I-AGL")!;
    const at = workbook.getWorksheet("II-AT  ")!;
    const { ALIMENTAIRE, EAU, CHIMIE } = report.synthesis;
    expect([ALIMENTAIRE.analyses, EAU.analyses, CHIMIE.analyses]).toEqual([4, 2, 2]);
    expect([ALIMENTAIRE.nonConformes, EAU.nonConformes, CHIMIE.nonConformes]).toEqual([1, 1, 1]);
    expect([agl.getCell("B6").value, agl.getCell("C6").value, agl.getCell("D6").value]).toEqual([3, 1, 2]);

    const expected: [string, number][] = [
      ["B7", 4],
      ["C7", 2],
      ["D7", 2],
      ["B12", 1],
      ["C12", 1],
      ["D12", 1],
    ];
    for (const [address, value] of expected) {
      const cell = agl.getCell(address).value;
      expect(formula(cell), address).toMatch(/'II-AT  '!/);
      expect(result(cell), address).toBe(value);
      expect(evaluate(formula(cell), at), address).toBe(value);
    }
    expect(formula(agl.getCell("B11").value)).toBe("B7-B12");
    expect(result(agl.getCell("D11").value)).toBe(1); // the chemistry's conformes take its NC off
    expect(result(agl.getCell("E7").value)).toBe(report.total.realisees);
    expect(result(agl.getCell("E12").value)).toBe(report.total.nonConformes);
    expect(result(agl.getCell("E13").value)).toBe(report.total.realisees);

    // II-1's total, II-2's total: the same figure.
    const ii1Total = rowOf(at, "Total", 7);
    expect(result(at.getCell(`F${ii1Total}`).value)).toBe(report.total.realisees);
    const ii2Total = rowOf(at, "Total ", ii1Total + 1);
    expect(result(at.getCell(`AA${ii2Total}`).value)).toBe(report.total.realisees);
    expect(result(at.getCell(`AA${ii2Total + 1}`).value)).toBe(report.total.nonConformes);
    expect(result(at.getCell(`Z${ii2Total}`).value)).toBe(2);
    // II-1's group totals add up to II-2's.
    let ii1 = 0;
    for (let r = 7; r < ii1Total; r += 1) {
      const value = at.getCell(`F${r}`).value;
      if (value && typeof value === "object" && !at.getCell(`F${r}`).isMerged) ii1 += result(value);
      else if (value && typeof value === "object" && at.getCell(`F${r}`).master.address === `F${r}`) ii1 += result(value);
    }
    expect(ii1).toBe(report.total.realisees);
  });

  it("keeps the chemistry in its groups when the report is built without the own row (I-AGL takes Z off)", async () => {
    const plain = buildOnssaReport(samples, [VEG, ANI, EAUX]);
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(plain, sections, meta));
    const agl = workbook.getWorksheet("I-AGL")!;
    const at = workbook.getWorksheet("II-AT  ")!;
    expect(cellsOf(at).some((cell) => cell.value === ONSSA_CHEMISTRY_GROUP.name)).toBe(false);
    expect(formula(agl.getCell("B7").value)).toMatch(/-'II-AT  '!Z/);
    for (const [address, value] of [["B7", 4], ["C7", 2], ["D7", 2], ["B12", 1], ["D12", 1]] as const) {
      expect(evaluate(formula(agl.getCell(address).value), at), address).toBe(value);
    }
  });
});

describe("the canevas of 2026 — III-AD, IV and the notes", () => {
  it("fills III-1, III-5, III-6-1 and III-6-3 from the application", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const ad = workbook.getWorksheet("III-AD ")!;
    const values = cellsOf(ad).map((cell) => cell.value);
    expect(values).toContain("Salmonella — eau");
    expect(values).toContain("Organisateur test");
    expect(values).toContain("Ville test");
    expect(values).toContain("Texte réglementaire test");
    expect(values).toContain("Rupture de la chaîne du froid : 2 échantillons");
    expect(values).toContain("Parametres");
    expect(values).toContain("Région d’origine du produit");
    expect(values).not.toContain(NOTHING);
  });

  it("writes « RàS » where the application has nothing for the month", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, EMPTY_ONSSA_SECTIONS, meta));
    const ad = workbook.getWorksheet("III-AD ")!;
    const nothing = cellsOf(ad).filter((cell) => cell.value === NOTHING);
    // III-1 (1), III-5 (4 columns), III-6-1 (1), III-6-3 (1).
    expect(nothing).toHaveLength(7);
  });

  it("leaves IV to fill (ONSSA_IV_NON_ACCREDITED off)", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const iv = workbook.getWorksheet("IV-Autres informations ")!;
    expect(iv.getCell("B5").value).toBe("Paramettre");
    expect(iv.getCell("F6").value).toBe("accrédité oui/non");
    expect(iv.getCell("B8").value).toBeNull();
  });

  it("gives II-1 line by line, what was left out, and the corrected formulas in « Notes Qualilab »", async () => {
    const workbook = await roundTrip(buildOnssaCanevasWorkbook(report, sections, meta));
    const notes = workbook.getWorksheet("Notes Qualilab")!;
    const values = cellsOf(notes).map((cell) => String(cell.value));
    expect(values).toContain("Établissement test 2");
    expect(values).toContain("Surfaces");
    expect(values.some((value) => value.includes("C:Z"))).toBe(true);
    expect(values).toContain("Échantillons du mois pas encore validés (non comptés)");
  });
});
