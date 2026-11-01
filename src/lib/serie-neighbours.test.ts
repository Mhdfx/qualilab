import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNSAVED_CHANGES_MESSAGE, serieNeighbours } from "./serie-neighbours";
import { sheetDirty, type SheetLine } from "./take-over-sheet";

/** G4 (18/10 re-ask 2.20 (j), « Oui » on 28/10). */
const s = (id: string, lineNumber: number, code: string) => ({ id, lineNumber, code });

describe("serieNeighbours — the série's order, line number then code", () => {
  const siblings = [s("c", 2, "2"), s("a", 1, "1M"), s("e", 10, "10"), s("b", 1, "1P"), s("d", 3, "3")];

  it("orders by line, then the twins « 1M » before « 1P », numbers as numbers", () => {
    expect(serieNeighbours(siblings, "b")).toMatchObject({ previous: { id: "a" }, next: { id: "c" }, position: 2, total: 5 });
    expect(serieNeighbours(siblings, "d")).toMatchObject({ previous: { id: "c" }, next: { id: "e" }, position: 4 });
  });

  it("the first has no previous, the last no next", () => {
    expect(serieNeighbours(siblings, "a")).toMatchObject({ previous: null, next: { id: "b" }, position: 1 });
    expect(serieNeighbours(siblings, "e")).toMatchObject({ previous: { id: "d" }, next: null, position: 5 });
  });

  it("a sample alone, or one the list does not hold, has no neighbour", () => {
    expect(serieNeighbours([s("a", 1, "1")], "a")).toEqual({ previous: null, next: null, position: 1, total: 1 });
    expect(serieNeighbours(siblings, "zz")).toEqual({ previous: null, next: null, position: 0, total: 5 });
  });

  it("never reorders the caller's list", () => {
    const copy = [...siblings];
    serieNeighbours(siblings, "a");
    expect(siblings).toEqual(copy);
  });
});

describe("sheetDirty — typing not saved asks before leaving", () => {
  const line = (parameterId: string, over: Partial<SheetLine> = {}): SheetLine => ({
    parameterId,
    editable: true,
    perUnit: false,
    value: "",
    note: "",
    workStatus: "EN_COURS",
    manualConform: null,
    units: [],
    dilution: "1",
    ...over,
  });

  it("clean as laid out; dirty once a value, a note, a step, a unit or a dilution changes", () => {
    const laid = [line("a"), line("b", { perUnit: true, units: ["", ""] })];
    expect(sheetDirty(laid, laid)).toBe(false);
    expect(sheetDirty([line("a", { value: "10" }), laid[1]], laid)).toBe(true);
    expect(sheetDirty([line("a", { note: "x" }), laid[1]], laid)).toBe(true);
    expect(sheetDirty([line("a", { workStatus: "TERMINE" }), laid[1]], laid)).toBe(true);
    expect(sheetDirty([laid[0], line("b", { perUnit: true, units: ["", "3"] })], laid)).toBe(true);
    expect(sheetDirty([line("a", { dilution: "1/10" }), laid[1]], laid)).toBe(true);
  });

  it("a grid grown by empty units, or a colleague's line, is no typing of the viewer's", () => {
    const laid = [line("b", { perUnit: true, units: ["5"] })];
    expect(sheetDirty([line("b", { perUnit: true, units: ["5", ""] })], laid)).toBe(false);
    expect(sheetDirty([line("b", { editable: false, value: "9" })], [line("b", { editable: false })])).toBe(false);
  });

  it("says why in French", () => {
    expect(UNSAVED_CHANGES_MESSAGE).toMatch(/ne sont pas enregistrées/);
  });
});

describe("both sheets carry the links and the guard", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("the bench sheet: the série's samples the viewer may open there", () => {
    const page = read("../app/technicien/[id]/page.tsx");
    expect(page).toContain("<SerieNeighbourLinks");
    expect(page).toContain("canReadAtBench(sibling, session.id)");
    expect(read("../components/technicien/ResultEntryForm.tsx")).toContain("useUnsavedChanges(canEdit && sheetDirty(lines, laid.lines));");
  });

  it("the programme sheet: the série's received samples", () => {
    const page = read("../app/programmation/[id]/page.tsx");
    expect(page).toContain("<SerieNeighbourLinks");
    expect(page).toContain('status: { notIn: ["PRELEVE", "ANNULE"] }');
    expect(read("../components/programmation/ProgrammeSheet.tsx")).toContain("useUnsavedChanges(!readOnly && JSON.stringify(draft) !== savedDraft);");
  });

  it("a link leaves only after the question when the sheet holds typing not saved", () => {
    const links = read("../components/ui/SerieNeighbourLinks.tsx");
    expect(links).toContain("if (hasUnsavedChanges() && !window.confirm(UNSAVED_CHANGES_MESSAGE)) event.preventDefault();");
  });
});
