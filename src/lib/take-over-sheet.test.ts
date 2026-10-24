import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SHEET_SAVED_BY_COLLEAGUE,
  followServer,
  overlapNotice,
  savedByOthersSince,
  sheetLoadedAt,
  type SheetLine,
} from "./take-over-sheet";

/**
 * A bench sheet opened before a colleague saved on it (re-ask 2.13, C3 — the
 * review of 23/10): A's tab left open, B takes over and saves, A takes it
 * back elsewhere; the old tab's « Enregistrer » must never write its stale
 * lines over B's reading.
 */

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

type Line = SheetLine & { name: string };

const line = (parameterId: string, value: string, over: Partial<Line> = {}): Line => ({
  parameterId,
  name: parameterId === "coli" ? "Coliformes totaux" : "E. coli",
  editable: true,
  perUnit: false,
  value,
  note: "",
  workStatus: value ? "TERMINE" : "EN_COURS",
  manualConform: null,
  units: [],
  ...over,
});

describe("sheetLoadedAt — when the sheet was rendered", () => {
  it("reads the ISO instant the page sent", () => {
    expect(sheetLoadedAt("2026-10-23T09:00:00.000Z")).toEqual(new Date("2026-10-23T09:00:00.000Z"));
  });

  it("checks nothing for a save without it (a script, an older tab), refuses an unreadable one", () => {
    expect(sheetLoadedAt(undefined)).toBeNull();
    expect(sheetLoadedAt(null)).toBeNull();
    expect(sheetLoadedAt("hier")).toBe("invalid");
    expect(sheetLoadedAt(1729674000000)).toBe("invalid");
  });
});

describe("savedByOthersSince — a reading the sheet never showed", () => {
  it("a line someone else wrote after the rendering, never the viewer's own", () => {
    const at = new Date("2026-10-23T09:00:00.000Z");
    expect(savedByOthersSince("s1", at, "tech1")).toEqual({
      sampleId: "s1",
      enteredAt: { gt: at },
      NOT: { enteredById: "tech1" },
    });
  });
});

describe("followServer — the refreshed sheet keeps the typing, not the stale lines", () => {
  // A's sheet, laid out with both lines empty.
  const base = [line("coli", ""), line("ecoli", "")];

  it("shows the colleague's reading on a line the viewer left alone, keeps what they typed", () => {
    const typed = [line("coli", ""), line("ecoli", "12")];
    const fresh = [line("coli", "30"), line("ecoli", "")];
    const { lines, overlap } = followServer(fresh, typed, base);
    expect(lines.map((l) => l.value)).toEqual(["30", "12"]);
    expect(lines[1].workStatus).toBe("TERMINE");
    expect(overlap).toEqual([]);
  });

  it("keeps the typing on a line both changed, and names it", () => {
    const typed = [line("coli", "25"), line("ecoli", "")];
    const fresh = [line("coli", "30"), line("ecoli", "")];
    const { lines, overlap } = followServer(fresh, typed, base);
    expect(lines[0].value).toBe("25");
    expect(overlap.map((l) => l.name)).toEqual(["Coliformes totaux"]);
  });

  it("does not call the viewer's own save an overlap", () => {
    // Typed 25, saved: the server now holds 25 too.
    const typed = [line("coli", "25"), line("ecoli", "")];
    const fresh = [line("coli", "25"), line("ecoli", "")];
    const { lines, overlap } = followServer(fresh, typed, base);
    expect(lines.map((l) => l.value)).toEqual(["25", ""]);
    expect(overlap).toEqual([]);
  });

  it("follows the server on a line no longer the viewer's, or read the other way", () => {
    const typed = [line("coli", "25"), line("ecoli", "12")];
    const fresh = [
      line("coli", "30", { editable: false }),
      line("ecoli", "", { perUnit: true, units: ["", ""] }),
    ];
    const { lines } = followServer(fresh, typed, base);
    expect(lines[0].value).toBe("30");
    expect(lines[1]).toEqual(fresh[1]);
  });

  it("carries the readings R1 … Rn by position, as many as the server's grid", () => {
    const grid = (units: string[]) => line("coli", "", { perUnit: true, units });
    const { lines, overlap } = followServer([grid(["", "", ""])], [grid(["5", "7"])], [grid(["", ""])]);
    expect(lines[0].units).toEqual(["5", "7", ""]);
    // A grid grown by an empty unit is no colleague's reading.
    expect(overlap).toEqual([]);
  });

  it("keeps a line the viewer typed though it was not on the sheet laid out (no stale origin to compare)", () => {
    const { lines } = followServer([line("coli", "")], [line("coli", "8")], []);
    expect(lines[0].value).toBe("8");
  });

  it("leaves a sheet nobody typed on exactly as the server rendered it", () => {
    const fresh = [line("coli", "30"), line("ecoli", "40")];
    expect(followServer(fresh, base, base).lines).toEqual(fresh);
  });
});

describe("the words", () => {
  it("says nothing was saved and the sheet now shows the colleague's readings", () => {
    expect(SHEET_SAVED_BY_COLLEAGUE).toContain("rien n'a été enregistré");
    expect(SHEET_SAVED_BY_COLLEAGUE).toContain("garde votre saisie");
  });

  it("names the lines both changed, in the singular and the plural", () => {
    expect(overlapNotice([])).toBeNull();
    expect(overlapNotice(["Coliformes totaux"])).toBe(
      "Votre saisie est gardée sur Coliformes totaux, que ce collègue a aussi modifié : vérifiez-la, elle remplacera son résultat à l'enregistrement."
    );
    expect(overlapNotice(["Coliformes totaux", "E. coli"])).toContain("sur Coliformes totaux, E. coli, que ce collègue a aussi modifiés");
  });
});

describe("the route and the sheet read these rules", () => {
  it("PUT …/results: reads `loadedAt`, refuses a save made over a colleague's reading, after the holder check", () => {
    const route = read("../app/api/samples/[id]/results/route.ts");
    expect(route).toContain("const loadedAt = sheetLoadedAt(rawLoadedAt);");
    expect(route).toContain('if (loadedAt === "invalid") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });');
    const check = route.indexOf("savedByOthersSince(sample.id, loadedAt, session.id)");
    expect(check).toBeGreaterThan(route.indexOf("const locked = await lockTakeState(tx, sample.id);"));
    expect(check).toBeGreaterThan(route.indexOf('return { kind: "held", holderName: locked.holderName };'));
    // Before anything is written.
    expect(check).toBeLessThan(route.indexOf("await tx.result.upsert("));
    expect(check).toBeLessThan(route.indexOf("const taken = await tx.sample.updateMany("));
    expect(route).toContain("return NextResponse.json({ error: SHEET_SAVED_BY_COLLEAGUE }, { status: 409 });");
  });

  it("the sheet: rendered with its time, sends it, follows the server on every rendering", () => {
    const page = read("../app/technicien/[id]/page.tsx");
    expect(page.indexOf("const loadedAt = new Date().toISOString();")).toBeLessThan(page.indexOf("prisma.sample.findUnique({\n    where: { id },"));
    expect(page.split("loadedAt={loadedAt}").length - 1).toBe(3);
    const form = read("../components/technicien/ResultEntryForm.tsx");
    expect(form).toContain("body: JSON.stringify({ results: payload(), loadedAt: laid.loadedAt }),");
    expect(form).toContain("const followed = followServer(initialLines, lines, laid.lines);");
    expect(form).toContain("if (message === SHEET_SAVED_BY_COLLEAGUE) setColleagueSaved(true);");
    // The old carry-over kept every line's typing, stale ones included.
    expect(form).not.toContain("function withTyping(");
  });
});
