import { describe, expect, it } from "vitest";
import {
  adjustmentKeyOf,
  detectStockFormat,
  expiryOf,
  packageOf,
  parseStockWorkbook,
  planStockWorkbook,
  reconcile,
  rowChanges,
  workbookKeys,
  MAX_IGNORED,
  type ExistingArticle,
  type ImportedMovement,
  type ImportSheetInput,
} from "./stock-workbook-import";
import type { SheetRow } from "./stock-import";

/**
 * Lot 6A (RETOUR-LABO-25-11.md §1, §5 M10–M12) — the stock file, one tab per
 * article. Synthetic sheets only: the shapes of the laboratory's file
 * (headers in A or B at varying heights, two tables in a tab, prices in
 * either order or typed as text, quantities in pieces, mixed expiries),
 * none of its values.
 */

const TODAY = "2026-11-25";
const PRICE_SUB = (unitFirst: boolean, offset: number, width = offset + 9): SheetRow => {
  const row: SheetRow = Array(width).fill(null);
  row[offset + 7] = unitFirst ? "prix unitaire" : "prix total";
  row[offset + 8] = unitFirst ? "prix total" : "prix unitaire";
  return row;
};
const header = (entry: string, offset = 0, extra: string[] = []): SheetRow => [
  ...Array(offset).fill(null),
  "Date",
  "Libellé",
  "Lot",
  "Expiration",
  entry,
  "Sortie",
  "Stock",
  "Prix (dh/ht)",
  null,
  ...extra,
];
const row = (offset: number, cells: (string | number | null)[]): SheetRow => [...Array(offset).fill(null), ...cells];
const sheet = (name: string, rows: SheetRow[], monthCells: string[] = []): ImportSheetInput => ({ name, rows, monthCells: new Set(monthCells) });
const parse = (...sheets: ImportSheetInput[]) => parseStockWorkbook(sheets, { today: TODAY });

describe("packageOf — the unit read from « Entrée/… »", () => {
  it.each([
    ["Entrée/B50", "boîte de 50", 50],
    ["Entrée/C500", "carton de 500", 500],
    ["Entrée/500", "lot de 500", 500],
    ["Entrée/48/carton", "carton de 48", 48],
    ["Entrée 5U", "lot de 5", 5],
    ["Entrée", "unité", null],
  ])("%s → %s", (title, unit, size) => {
    expect(packageOf(title)).toMatchObject({ unit, size, variant: null });
  });

  it("reads a volume and a variant written before « Entrée »", () => {
    expect(packageOf("Entrée/1l")).toEqual({ unit: "flacon de 1 L", size: null, volumeMl: 1000, variant: null });
    expect(packageOf("Réactif 2 Entrée/B100")).toMatchObject({ unit: "boîte de 100", size: 100, variant: "Réactif 2" });
  });
});

describe("expiryOf", () => {
  it("reads a day, and a month as its last day", () => {
    expect(expiryOf("2027-05-14", false)).toBe("2027-05-14");
    expect(expiryOf("14/05/27", false)).toBe("2027-05-14");
    expect(expiryOf("02-2028", false)).toBe("2028-02-29");
    expect(expiryOf("11/2027", false)).toBe("2027-11-30");
    // A date shown « mois-année » in Excel (stored on the 1st).
    expect(expiryOf("2028-07-01", true)).toBe("2028-07-31");
  });

  it("tells an empty cell (undefined) from an unreadable one (null)", () => {
    expect(expiryOf(null, false)).toBeUndefined();
    expect(expiryOf("  ", false)).toBeUndefined();
    expect(expiryOf("bientôt", false)).toBeNull();
    expect(expiryOf("13-2027", false)).toBeNull();
  });
});

describe("reconcile — quantities against prices", () => {
  it("keeps a row whose total is quantity × unit", () => {
    expect(reconcile(3, 100, 42, 126)).toEqual({ quantity: 3, unitPriceHT: 42, check: "ok" });
  });

  it("swaps sub-columns whose titles are inverted", () => {
    expect(reconcile(6, 100, 90, 15)).toEqual({ quantity: 6, unitPriceHT: 15, check: "inverse" });
  });

  it("brings a piece's unit price back to the package's", () => {
    expect(reconcile(4, 200, 0.5, 400)).toEqual({ quantity: 4, unitPriceHT: 100, check: "prix-piece" });
  });

  it("brings a quantity counted in pieces back to packages", () => {
    expect(reconcile(4000, 250, 80, 1280)).toEqual({ quantity: 16, unitPriceHT: 80, check: "quantite-pieces" });
    // Titles inverted as well.
    expect(reconcile(4000, 250, 1280, 80)).toEqual({ quantity: 16, unitPriceHT: 80, check: "quantite-pieces" });
  });

  it("never reads a quantity smaller than one package as pieces", () => {
    expect(reconcile(5, 100, 2100, 100)).toMatchObject({ check: "non-departage", quantity: 5 });
  });

  it("imports as written what the arithmetic does not settle", () => {
    expect(reconcile(7, 100, 33, 50)).toEqual({ quantity: 7, unitPriceHT: 33, check: "non-departage" });
  });

  it("reads one price or none", () => {
    expect(reconcile(4, null, 25, null)).toEqual({ quantity: 4, unitPriceHT: 25, check: "un-prix" });
    expect(reconcile(4, null, null, 100)).toEqual({ quantity: 4, unitPriceHT: 25, check: "un-prix" });
    expect(reconcile(4, null, null, null)).toEqual({ quantity: 4, unitPriceHT: null, check: "sans-prix" });
  });
});

describe("parseStockWorkbook — tables", () => {
  it("reads one article per tab, its header in column A, the price sub-columns unit first", () => {
    const parsed = parse(
      sheet("Gants nitrile", [
        [],
        header("Entrée/B100"),
        PRICE_SUB(true, 0),
        row(0, ["2026-03-02", "64/26", "L-001", "2027-05-14", 3, null, 3, 42, 126]),
        row(0, ["2026-05-11", "BC 69/26", "L-002", null, 2, null, 5, 41, 82]),
      ])
    );
    expect(parsed).toMatchObject({ sheets: 1, tables: 1, dataRows: 2, refused: [], warnings: [], ignored: [], emptySheets: [] });
    const [article] = parsed.articles;
    expect(article).toMatchObject({ name: "Gants nitrile", unit: "boîte de 100", packSize: 100, line: 2, lastStock: 5, lastStockLine: 5 });
    expect(article.movements).toEqual([
      expect.objectContaining({ line: 4, type: "ENTREE", opening: false, day: "2026-03-02", orderReference: "64/26", lot: "L-001", expiryDay: "2027-05-14", quantity: 3, unitPriceHT: 42, check: "ok" }),
      expect.objectContaining({ line: 5, day: "2026-05-11", orderReference: "BC 69/26", lot: "L-002", expiryDay: null, quantity: 2, unitPriceHT: 41 }),
    ]);
    expect(article.movements[0].importKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("finds a header in column B further down, total first, prices typed as text, numbers as lots", () => {
    const parsed = parse(
      sheet("Boîtes de Petri", [
        [],
        [],
        [],
        header("Entrée/250", 1),
        PRICE_SUB(false, 1),
        row(1, ["2026-04-20", "12/26", 902211, null, "=16*250 → 4000", null, null, "1280", "80"]),
      ])
    );
    // A quantity cell that is not a number is refused, never guessed.
    expect(parsed.refused).toEqual([{ sheet: "Boîtes de Petri", line: 6, message: expect.stringContaining("« Entrée » illisible") }]);

    const good = parse(
      sheet("Boîtes de Petri", [[], [], [], header("Entrée/250", 1), PRICE_SUB(false, 1), row(1, ["2026-04-20", "12/26", 902211, null, 4000, null, 4000, "1280", "80"])])
    );
    expect(good.articles[0].movements[0]).toMatchObject({ lot: "902211", quantity: 16, unitPriceHT: 80, check: "quantite-pieces" });
    // The « Stock » written in pieces follows the quantity back to packages.
    expect(good.articles[0].lastStock).toBe(16);
    expect(good.warnings).toEqual([{ sheet: "Boîtes de Petri", line: 6, message: "Quantité comptée en pièces — ramenée en conditionnements." }]);
  });

  it("reads two tables in a tab as two articles — variant before « Entrée »", () => {
    const parsed = parse(
      sheet("Réactif chlore", [
        [],
        header("Pastille 1 Entrée/B50"),
        PRICE_SUB(true, 0),
        row(0, ["2026-02-02", "3/26", null, null, 1, null, 1, 10, 10]),
        [],
        [],
        header("Pastille 3 Entrée/B50"),
        PRICE_SUB(true, 0),
        row(0, ["2026-02-02", "3/26", null, null, 2, null, 2, 12, 24]),
      ])
    );
    expect(parsed.articles.map((article) => [article.name, article.movements.length, article.lastStock])).toEqual([
      ["Réactif chlore — Pastille 1", 1, 1],
      ["Réactif chlore — Pastille 3", 1, 2],
    ]);
    // Same day, same bon de commande, same lot: two articles, two fingerprints.
    expect(parsed.articles[0].movements[0].importKey).not.toBe(parsed.articles[1].movements[0].importKey);
  });

  it("reads the variant in the column left of the table, and lists the stray texts", () => {
    const parsed = parse(
      sheet("Indicateurs", [
        row(10, ["XYZ"]),
        header("Entrée/100", 1),
        PRICE_SUB(false, 1),
        ["type A", "2021-03-16", "15/21", "L-731", "10/2024", 4, null, 4, 1320, 330],
        [111111],
        [],
        [],
        header("Entrée/100", 1),
        PRICE_SUB(false, 1),
        ["type B", "2021-03-16", "15/21", "L-732", "06/2025", 4, null, 4, 360, 90],
        [222222],
      ])
    );
    expect(parsed.articles.map((article) => article.name)).toEqual(["Indicateurs — type A", "Indicateurs — type B"]);
    expect(parsed.articles[0].movements[0]).toMatchObject({ expiryDay: "2024-10-31", unitPriceHT: 330, check: "ok" });
    expect(parsed.ignored).toEqual([
      { sheet: "Indicateurs", cell: "K1", text: "XYZ" },
      { sheet: "Indicateurs", cell: "A5", text: "111111" },
      { sheet: "Indicateurs", cell: "A11", text: "222222" },
    ]);
  });

  it("reads the variant on a line alone above the header, not as a row of the table before", () => {
    const parsed = parse(
      sheet("Indicateur de passage", [
        ["clair"],
        header("Entrée"),
        PRICE_SUB(false, 0),
        row(0, ["2022-09-12", "52/22", null, null, 1, null, 1, "215", "215"]),
        [],
        ["foncé"],
        header("Entrée"),
        PRICE_SUB(false, 0),
        row(0, ["2022-09-12", "52/22", null, null, 1, null, 1, "315", "315"]),
      ])
    );
    expect(parsed.articles.map((article) => [article.name, article.unit, article.movements[0].unitPriceHT])).toEqual([
      ["Indicateur de passage — clair", "unité", 215],
      ["Indicateur de passage — foncé", "unité", 315],
    ]);
    expect(parsed.dataRows).toBe(2);
    expect(parsed.ignored).toEqual([]);
  });

  it("a tab with one table keeps the tab's name: a text above it is not a variant", () => {
    const parsed = parse(sheet("Papier", [[null, null, null, "Fournisseur X"], [], header("Entrée"), PRICE_SUB(false, 0)]));
    expect(parsed.articles).toEqual([expect.objectContaining({ name: "Papier", movements: [], lastStock: null })]);
    expect(parsed.ignored).toEqual([{ sheet: "Papier", cell: "D1", text: "Fournisseur X" }]);
  });

  it("a row with a « Stock » only is the article's stock at that day (« stock de départ »), titles inverted fixed", () => {
    const parsed = parse(sheet("Filtres", [[], header("Entrée/100", 1), PRICE_SUB(false, 1), row(1, ["2023-05-09", "17/23", "F-9", null, null, null, 10, 32, 320])]));
    expect(parsed.articles[0].movements).toEqual([expect.objectContaining({ type: "ENTREE", opening: true, quantity: 10, unitPriceHT: 32, check: "inverse" })]);
    expect(parsed.articles[0].lastStock).toBe(10);
  });

  it("brings a « Stock/ml » back to bottles of « Entrée/1l »", () => {
    const parsed = parse(
      sheet("Huile", [
        [],
        [null, "Date", "Libellé", "Lot", "EXPIRATION", "Entrée/1l", "Sortie", "Stock/ml", "Prix (dh/ht)", null, "Lieu de stockage"],
        PRICE_SUB(false, 1),
        row(1, ["2021-02-08", "11/21", null, null, null, null, 4000, 340, 85, "Armoire 2"]),
      ])
    );
    expect(parsed.articles[0]).toMatchObject({ unit: "flacon de 1 L", location: "Armoire 2", lastStock: 4 });
    expect(parsed.articles[0].movements[0]).toMatchObject({ opening: true, quantity: 4, unitPriceHT: 85, check: "ok" });
  });

  it("brings a « Stock » written in pieces back to packages when the entry is in packages", () => {
    const parsed = parse(sheet("Pots", [[], header("Entrée/250"), PRICE_SUB(false, 0), row(0, ["2026-06-15", "41/26", null, "03-2031", 6, null, 1500, "2280", "380"])]));
    expect(parsed.articles[0]).toMatchObject({ lastStock: 6 });
    expect(parsed.articles[0].movements[0]).toMatchObject({ quantity: 6, unitPriceHT: 380, expiryDay: "2031-03-31" });
    expect(parsed.warnings.map((warning) => warning.message)).toEqual(["« Stock » écrit en pièces — ramené en conditionnements."]);
  });

  it("refuses rows without a quantity, without a date, in the future; flags doubts", () => {
    const parsed = parse(
      sheet("Membranes", [
        [],
        header("Entrée"),
        PRICE_SUB(false, 0),
        row(0, ["2023-05-09", "17/23", "N1", null, null, null, null, 2700, "675"]),
        row(0, [null, "8/23", null, null, 3, null, 3, null, null]),
        row(0, ["2026-12-01", "69/26", null, null, 3, null, 3, null, null]),
        row(0, ["2026-06-12", "2026-01-27", null, "2023-03-31", 2, null, 2, 3, 1.5]),
      ])
    );
    expect(parsed.refused.map((note) => [note.line, note.message])).toEqual([
      [4, "Ligne sans quantité (ni entrée, ni sortie, ni stock) — ignorée."],
      [5, "Ligne sans date — ignorée."],
      [6, "Date dans le futur (2026-12-01) — ligne ignorée."],
    ]);
    expect(parsed.articles[0].movements).toHaveLength(1);
    expect(parsed.warnings.map((note) => note.message)).toEqual([
      expect.stringContaining("« Libellé » lu comme une date (2026-01-27)"),
      "Expiration (2023-03-31) antérieure à la date d'entrée (2026-06-12) — saisie à vérifier.",
    ]);
  });

  it("flags an unreadable expiry and keeps the row; reads an exit", () => {
    const parsed = parse(
      sheet("Écouvillons", [
        [],
        header("Entrée/C500"),
        PRICE_SUB(true, 0),
        row(0, ["2026-01-13", "93/24", null, "fin d'année", 10, null, 10, 1.1, 5500]),
        row(0, ["2026-02-03", null, null, null, null, 4, 6, null, null]),
      ])
    );
    expect(parsed.articles[0].movements.map((movement) => [movement.type, movement.quantity, movement.unitPriceHT, movement.expiryDay])).toEqual([
      ["ENTREE", 10, 550, null],
      ["SORTIE", 4, null, null],
    ]);
    expect(parsed.warnings.map((note) => note.message)).toEqual([
      "Expiration illisible (« fin d'année ») — importée sans expiration.",
      "Prix unitaire d'une pièce — ramené au conditionnement.",
    ]);
  });

  it("lists a tab without a table, a formula without a result, and refuses an article read twice", () => {
    const parsed = parse(
      { name: "Notes", rows: [["Liste à jour"]], blankFormulas: [] },
      { name: "Tubes", rows: [header("Entrée/B50"), PRICE_SUB(true, 0)], blankFormulas: ["I3"] },
      sheet("tubes ", [header("Entrée/B50"), PRICE_SUB(true, 0)])
    );
    expect(parsed.emptySheets).toEqual(["Notes"]);
    expect(parsed.ignored).toEqual([{ sheet: "Notes", cell: "A1", text: "Liste à jour" }]);
    expect(parsed.warnings).toEqual([{ sheet: "Tubes", line: 3, message: expect.stringContaining("Formule sans résultat enregistré en I3") }]);
    expect(parsed.articles.map((article) => article.name)).toEqual(["Tubes"]);
    expect(parsed.refused).toEqual([{ sheet: "tubes", line: 1, message: expect.stringContaining("en double dans le classeur") }]);
  });

  it("gives two identical rows of a table two fingerprints, and the same file the same ones", () => {
    const rows = [header("Entrée"), PRICE_SUB(true, 0), row(0, ["2026-01-02", "61/26", null, null, 1, null, null, 5, 5]), row(0, ["2026-01-02", "61/26", null, null, 1, null, null, 5, 5])];
    const first = parse(sheet("Gants", rows));
    const second = parse(sheet("Gants", rows));
    const keys = first.articles[0].movements.map((movement) => movement.importKey);
    expect(new Set(keys).size).toBe(2);
    expect(second.articles[0].movements.map((movement) => movement.importKey)).toEqual(keys);
    expect(first.warnings.map((note) => note.message)).toEqual(["Ligne identique à une ligne précédente du même tableau — importée elle aussi."]);
  });
});

describe("detectStockFormat (M11)", () => {
  const register = sheet("Registre", [
    ["Date", "Libellé", "Lot", "Entrée", "Stock"],
    ["2026-01-02", "Gélose PCA", "L1", 3, 3],
    ["2026-01-03", "Bouillon", "L2", 2, 2],
  ]);
  it("one sheet with articles under « Libellé » is the single register", () => {
    expect(detectStockFormat([register])).toBe("registre");
  });
  it("several filled sheets, or bons de commande under « Libellé », is one tab per article", () => {
    expect(detectStockFormat([register, sheet("Autre", [["x"]])])).toBe("par-article");
    expect(detectStockFormat([register, sheet("Vide", [])])).toBe("registre");
    expect(
      detectStockFormat([
        sheet("Tubes", [header("Entrée/B50"), PRICE_SUB(true, 0), row(0, ["2026-01-02", "BC 64/26", null, null, 1, null, 1, null, null]), row(0, ["2026-01-09", "7/26", null, null, 1, null, 2, null, null])]),
      ])
    ).toBe("par-article");
    expect(detectStockFormat([sheet("Tubes", [header("Entrée/B50"), PRICE_SUB(true, 0)])])).toBe("par-article");
  });
});

describe("planStockWorkbook (M12)", () => {
  const workbook = () =>
    parse(
      sheet("Gants", [
        header("Entrée/B100"),
        PRICE_SUB(true, 0),
        row(0, ["2026-05-11", "69/26", null, null, 2, null, 2, 41, 82]),
        row(0, ["2026-03-02", "64/26", null, null, 3, null, 3, 42, 126]),
      ]),
      sheet("Tubes", [header("Entrée/B50"), PRICE_SUB(true, 0), row(0, ["2026-04-24", "61/26", null, null, 1, null, 1, 130, 130])])
    );
  const none = new Map<string, ExistingArticle>();

  it("creates each article and writes its rows in date order, then levels to the file's last « Stock »", () => {
    const plan = planStockWorkbook(workbook(), none, new Set(), TODAY);
    const [gants, tubes] = plan.articles;
    expect(gants).toMatchObject({ status: "a-creer", levelNow: 0, levelAfter: 2 });
    expect(gants.movements.map((movement) => [movement.day, movement.levelBefore, movement.levelAfter])).toEqual([
      ["2026-03-02", 0, 3],
      ["2026-05-11", 3, 5],
    ]);
    // The last « Stock » written (2) is not entries − exits (5): one adjustment, dated today.
    expect(gants.adjustment).toEqual({ from: 5, to: 2, day: TODAY, importKey: adjustmentKeyOf(gants.article) });
    expect(tubes).toMatchObject({ status: "a-creer", levelAfter: 1, adjustment: null });
    expect(plan.totals).toEqual({ toCreate: 2, resumed: 0, untouched: 0, movements: 3, adjustments: 1, skipped: 0, changed: 0, refused: 0 });
  });

  it("writes nothing the second time (every fingerprint known)", () => {
    const parsed = workbook();
    const existing = new Map<string, ExistingArticle>([
      ["gants", { id: "g", name: "Gants", quantity: 2, archived: false, handMovements: 0, lastDay: TODAY }],
      ["tubes", { id: "t", name: "Tubes", quantity: 1, archived: false, handMovements: 0, lastDay: "2026-04-24" }],
    ]);
    const plan = planStockWorkbook(parsed, existing, new Set(workbookKeys(parsed)), TODAY);
    expect(plan.articles.map((article) => [article.status, article.movements.length, article.adjustment, article.skipped])).toEqual([
      ["reprise", 0, null, 2],
      ["reprise", 0, null, 1],
    ]);
    expect(plan.totals).toMatchObject({ toCreate: 0, resumed: 0, movements: 0, adjustments: 0, skipped: 3 });
  });

  it("resumes an imported article with its new rows only; refuses a new row dated before its latest movement", () => {
    const parsed = parse(
      sheet("Tubes", [
        header("Entrée/B50"),
        PRICE_SUB(true, 0),
        row(0, ["2026-04-24", "61/26", null, null, 1, null, null, 135, 135]),
        row(0, ["2026-03-01", "0/26", null, null, 4, null, null, 135, 540]),
        row(0, ["2026-06-30", "2/26", null, null, 2, null, null, 135, 270]),
      ])
    );
    const known = new Set([parsed.articles[0].movements[0].importKey]);
    const existing = new Map<string, ExistingArticle>([["tubes", { id: "t", name: "Tubes", quantity: 1, archived: false, handMovements: 0, lastDay: "2026-04-24" }]]);
    const [plan] = planStockWorkbook(parsed, existing, known, TODAY).articles;
    expect(plan).toMatchObject({ status: "reprise", existingId: "t", skipped: 1, levelNow: 1, levelAfter: 3 });
    expect(plan.movements.map((movement) => [movement.orderReference, movement.levelBefore, movement.levelAfter])).toEqual([["2/26", 1, 3]]);
    expect(plan.refused).toEqual([{ sheet: "Tubes", line: 4, message: "Datée du 2026-03-01, avant le dernier mouvement de l'article (2026-04-24) — à saisir à la main." }]);
  });

  it("leaves alone an article followed by hand, and an archived one", () => {
    const parsed = workbook();
    const existing = new Map<string, ExistingArticle>([
      ["gants", { id: "g", name: "GANTS", quantity: 7, archived: false, handMovements: 1, lastDay: "2026-10-01" }],
      ["tubes", { id: "t", name: "Tubes", quantity: 0, archived: true, handMovements: 0, lastDay: null }],
    ]);
    const plan = planStockWorkbook(parsed, existing, new Set(), TODAY);
    expect(plan.articles.map((article) => [article.status, article.movements.length, article.levelAfter])).toEqual([
      ["suivi-a-la-main", 0, 7],
      ["archive", 0, 0],
    ]);
    expect(plan.totals).toMatchObject({ toCreate: 0, untouched: 2, movements: 0 });
  });

  it("refuses an exit beyond the level and goes on", () => {
    const parsed = parse(
      sheet("Gants", [
        header("Entrée"),
        PRICE_SUB(true, 0),
        row(0, ["2026-01-02", "61/26", null, null, 2, null, null, null, null]),
        row(0, ["2026-01-03", null, null, null, null, 5, null, null, null]),
        row(0, ["2026-01-04", null, null, null, null, 1, null, null, null]),
      ])
    );
    const [plan] = planStockWorkbook(parsed, none, new Set(), TODAY).articles;
    expect(plan.movements.map((movement) => [movement.type, movement.levelAfter])).toEqual([
      ["ENTREE", 2],
      ["SORTIE", 1],
    ]);
    expect(plan.refused).toEqual([{ sheet: "Gants", line: 4, message: expect.stringContaining("Stock insuffisant") }]);
  });
});

/**
 * Relecture du lot 6, constats 4 et 5 — a row whose prices settle nothing in
 * a table counted in packages, the « Stock »-only rows, the exits of a table
 * counted in pieces, and the fingerprint that survives an edited row.
 */
describe("parseStockWorkbook — rows whose prices settle nothing (constat 4)", () => {
  it("reads in pieces a row of a table whose other entries are in pieces, its price left out", () => {
    const parsed = parse(
      sheet("Écouvillons", [
        header("Entrée/C500"),
        PRICE_SUB(true, 0),
        // 1 000 pieces = 2 cartons × 80 = 160: counted in pieces.
        row(0, ["2026-01-05", "41/26", null, null, 1_000, null, 2, 80, 160]),
        // 1 500 × 33 ≠ 50, nothing settles it: 1 500 pieces like the row above.
        row(0, ["2026-02-09", "44/26", null, null, 1_500, null, 5, 33, 50]),
      ])
    );
    expect(parsed.articles[0].movements.map((movement) => [movement.quantity, movement.unitPriceHT, movement.check])).toEqual([
      [2, 80, "quantite-pieces"],
      [3, null, "pieces-deduites"],
    ]);
    expect(parsed.refused).toEqual([]);
    expect(parsed.warnings.map((note) => [note.line, note.message])).toContainEqual([4, expect.stringContaining("Prix non concordants")]);
  });

  it("refuses such a row when nothing says the table is in pieces, its « Stock » still read", () => {
    const parsed = parse(
      sheet("Écouvillons", [
        header("Entrée/C500"),
        PRICE_SUB(true, 0),
        row(0, ["2026-01-05", "41/26", null, null, 2, null, 2, 80, 160]),
        row(0, ["2026-02-09", "44/26", null, null, 1_500, null, 4, 33, 50]),
      ])
    );
    expect(parsed.articles[0].movements.map((movement) => movement.quantity)).toEqual([2]);
    expect(parsed.refused).toEqual([{ sheet: "Écouvillons", line: 4, message: expect.stringContaining("ligne non importée : quantité en pièces ou en conditionnements ?") }]);
    expect(parsed.articles[0]).toMatchObject({ lastStock: 4, lastStockLine: 4 });
  });

  it("keeps such a row as written where the article has no package size", () => {
    const parsed = parse(sheet("Gants", [header("Entrée"), PRICE_SUB(true, 0), row(0, ["2026-01-05", "41/26", null, null, 7, null, 7, 33, 50])]));
    expect(parsed.articles[0].movements).toEqual([expect.objectContaining({ quantity: 7, unitPriceHT: 33, check: "non-departage" })]);
  });

  it("refuses an exit of a table counted in pieces (pieces or packages: nothing tells)", () => {
    const parsed = parse(
      sheet("Écouvillons", [
        header("Entrée/C500"),
        PRICE_SUB(true, 0),
        row(0, ["2026-01-05", "41/26", null, null, 1_000, null, 2, 80, 160]),
        row(0, ["2026-01-20", null, null, null, null, 24, null, null, null]),
      ])
    );
    expect(parsed.articles[0].movements.map((movement) => movement.type)).toEqual(["ENTREE"]);
    expect(parsed.refused).toEqual([{ sheet: "Écouvillons", line: 4, message: expect.stringContaining("Sortie d'un tableau dont des entrées sont comptées en pièces") }]);
  });

  it("reads a « Stock »-only row as the opening stock only when it is the table's first, else as a level check", () => {
    const parsed = parse(
      sheet("Gants", [
        header("Entrée"),
        PRICE_SUB(true, 0),
        row(0, ["2026-03-01", "41/26", null, null, 2, null, 6, null, null]),
        // Written above, dated first: the opening stock.
        row(0, ["2026-01-02", null, null, null, null, null, 4, null, null]),
        // Further down: a level check, no entry.
        row(0, ["2026-04-01", null, null, null, null, null, 5, null, null]),
      ])
    );
    const [article] = parsed.articles;
    expect(article.movements.map((movement) => [movement.day, movement.opening, movement.quantity])).toEqual([
      ["2026-03-01", false, 2],
      ["2026-01-02", true, 4],
    ]);
    expect(article).toMatchObject({ lastStock: 5, lastStockLine: 5 });
    expect(parsed.warnings).toEqual([{ sheet: "Gants", line: 5, message: expect.stringContaining("contrôle du niveau") }]);
  });

  it("lists at most MAX_IGNORED texts outside the tables, and counts them all", () => {
    const notes = Array.from({ length: MAX_IGNORED + 5 }, (_, index): SheetRow => [`note ${index}`]);
    const parsed = parse(sheet("Notes", notes));
    expect(parsed.ignored).toHaveLength(MAX_IGNORED);
    expect(parsed.ignoredCount).toBe(MAX_IGNORED + 5);
  });
});

describe("importKey — an edited row keeps its fingerprint (constat 5)", () => {
  const tubes = (price: number | null, lot: string | null) =>
    parse(
      sheet("Tubes", [
        header("Entrée/B50"),
        PRICE_SUB(true, 0),
        row(0, ["2026-04-24", "41/26", lot, null, 2, null, 2, price, price === null ? null : price * 2]),
        row(0, ["2026-04-24", "41/26", null, null, 1, null, 3, null, null]),
      ])
    );

  it("does not change with a price added or a lot fixed; does with the day, the bon or the rank", () => {
    const before = tubes(null, null).articles[0].movements.map((movement) => movement.importKey);
    const after = tubes(130, "L-7").articles[0].movements.map((movement) => movement.importKey);
    expect(after).toEqual(before);
    expect(new Set(before).size).toBe(2);
  });

  it("reports the edited row « modifiée — à vérifier », never re-imports it", () => {
    const first = tubes(null, null);
    const imported = new Map<string, ImportedMovement>(
      first.articles[0].movements.map((movement) => [
        movement.importKey,
        { type: movement.type, quantity: movement.quantity, lot: movement.lot, expiryDay: movement.expiryDay, unitPriceHT: movement.unitPriceHT },
      ])
    );
    const existing = new Map<string, ExistingArticle>([["tubes", { id: "t", name: "Tubes", quantity: 3, archived: false, handMovements: 0, lastDay: "2026-04-24" }]]);
    const plan = planStockWorkbook(tubes(130, "L-7"), existing, imported, TODAY);
    expect(plan.articles[0]).toMatchObject({ skipped: 2, movements: [], adjustment: null });
    expect(plan.articles[0].changed).toEqual([
      { sheet: "Tubes", line: 3, message: expect.stringContaining("Ligne modifiée depuis l'import précédent (lot vide → L-7, prix unitaire HT vide → 130)") },
    ]);
    expect(plan.totals).toMatchObject({ movements: 0, skipped: 2, changed: 1 });
  });

  it("rowChanges lists nothing for the row as imported", () => {
    const [movement] = tubes(130, "L-7").articles[0].movements;
    expect(rowChanges({ type: "ENTREE", quantity: 2, lot: "L-7", expiryDay: null, unitPriceHT: 130 }, movement)).toEqual([]);
    expect(rowChanges({ type: "ENTREE", quantity: 3, lot: "L-7", expiryDay: null, unitPriceHT: 130 }, movement)).toEqual(["quantité 3 → 2"]);
  });
});
