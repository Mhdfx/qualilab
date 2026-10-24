import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatDecimal } from "./labels";
import { CONCLUSION_MAX_LENGTH, readConclusionEdit } from "./report-actions";

/**
 * Every figure of the interface reads « 1 800 » with the same no-break space
 * (U+00A0, `withPrintableSpaces` in labels.ts). `toLocaleString("fr-FR")` and
 * a raw `Intl.NumberFormat("fr-FR")` write U+202F, which some font weights
 * draw as nothing — « 1800 » (found 21/10 on money; the last screen figures
 * moved 23/10: the bench's value and limit, the conclusion's character
 * count, two error messages). Numbers go through `formatDecimal` /
 * `formatCurrency`; dates through the formatters of labels.ts (the lab's
 * time zone).
 */

const NBSP = " ";
const NARROW_NBSP = " ";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** The application's own sources: no tests, no generated client. */
function sources(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("screen figures — one formatter, one space", () => {
  it("no source formats a number with toLocaleString or its own Intl.NumberFormat (labels.ts only)", () => {
    const offenders = sources()
      .map((path) => ({ file: relative(SRC, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }))
      .filter(({ file }) => file !== "lib/labels.ts")
      .flatMap(({ file, text }) =>
        text
          .split("\n")
          .map((line, index) => ({ line: line.trim(), at: `${file}:${index + 1}` }))
          .filter(({ line }) => /\.toLocaleString\(|new Intl\.NumberFormat\(/.test(line) && !line.startsWith("//") && !line.startsWith("*"))
          .map(({ at }) => at)
      );
    expect(offenders).toEqual([]);
  });

  it("the bench reads « 1 800 » and keeps up to three decimals, as toLocaleString did", () => {
    expect(formatDecimal(1800, 3)).toBe(`1${NBSP}800`);
    expect(formatDecimal(150000, 3)).toBe(`150${NBSP}000`);
    expect(formatDecimal(0.125, 3)).toBe("0,125");
    expect(formatDecimal(2.5, 3)).toBe("2,5");
    expect(formatDecimal(1800, 3)).not.toContain(NARROW_NBSP);
  });

  it("the conclusion's count and its refusal: « 2 000 caractères »", () => {
    expect(formatDecimal(CONCLUSION_MAX_LENGTH, 0)).toBe(`2${NBSP}000`);
    const over = readConclusionEdit({ conclusion: "a".repeat(CONCLUSION_MAX_LENGTH + 1) }, false);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error).toBe(`La conclusion ne peut pas dépasser 2${NBSP}000 caractères (2${NBSP}001 saisis).`);
      expect(over.error).not.toContain(NARROW_NBSP);
    }
  });

  it("the accounting export's refusal names its cap the same way", () => {
    const route = readFileSync(new URL("../app/api/invoices/export/route.ts", import.meta.url), "utf8");
    expect(route).toContain("(${formatDecimal(MAX_EXPORT_ROWS, 0)} maximum par feuille)");
    expect(formatDecimal(20_000, 0)).toBe(`20${NBSP}000`);
  });
});
