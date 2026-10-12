import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The compiled JSX drops the leading space of a text that follows an
 * expression on the same line when that text holds an HTML entity
 * (`&apos;`, `&nbsp;`…): `le rapport {number} reste … jusqu&apos;à`
 * printed « RAP-2026-00024reste » (recette du 12/10, also « 80 UFC/mL— »
 * at the bench). Such a space is written `{" "}` explicitly — the way
 * `LabDateTimeInput` and the reception form already do. This test reads
 * every component and page and fails on the pattern.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** `}` + spaces + a JSX text (up to the next `{` or `<`) holding an entity. */
function droppedSpaces(source: string): string[] {
  const found: string[] = [];
  const pattern = /\}([ \t]+)([^{}<>]*?)(?=[{<])/g;
  for (const match of source.matchAll(pattern)) {
    const text = match[2];
    if (!/&[a-z]+;/.test(text)) continue;
    // Code, not JSX text: an operator or a string on the first line.
    if (/[=;()`"]/.test(text.replace(/&[a-z]+;/g, "").split("\n")[0])) continue;
    const line = source.slice(0, match.index).split("\n").length;
    found.push(`${line}: }${match[1]}${text.split("\n")[0].slice(0, 60)}`);
  }
  return found;
}

describe("JSX text after an expression", () => {
  const files = walk(SRC)
    .filter((path) => path.endsWith(".tsx"))
    .map((path) => ({ rel: relative(SRC, path).split(sep).join("/"), source: readFileSync(path, "utf8") }));

  it("reads some components", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never starts with a bare space when it holds an HTML entity", () => {
    const offenders = files.flatMap(({ rel, source }) => droppedSpaces(source).map((hit) => `${rel}:${hit}`));
    expect(offenders).toEqual([]);
  });

  it("catches the pattern and lets the explicit space through", () => {
    expect(droppedSpaces("<p>Le rapport {number} reste jusqu&apos;à demain.</p>")).toHaveLength(1);
    expect(droppedSpaces('<p>Le rapport {number}{" "}reste jusqu&apos;à demain.</p>')).toEqual([]);
    expect(droppedSpaces("<p>Le rapport {number} reste jusqu'à demain.</p>")).toEqual([]);
  });
});
