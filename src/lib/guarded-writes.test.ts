import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Optimistic guards must be written with `updateMany` and a row count.
 *
 * With Prisma 7 on MySQL, `update({ where: { id, status: "X" } })` first
 * SELECTs the row with the guard, then UPDATEs it, and answers with the row
 * whatever the UPDATE changed. Two requests racing both pass the SELECT: the
 * second UPDATE changes nothing, yet the call "succeeds" — the full-db
 * recette of 12/10 saw three approvals of one sample answered 200 with three
 * report e-mails, and an approval racing a send-back issue a report on a
 * sample back at the bench. `updateMany` puts the guard in the UPDATE itself
 * and returns the rows it changed: `count === 0` is the 409.
 *
 * This test reads the routes and the server libraries and fails as soon as
 * an `update` is guarded by anything but its id.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "generated" || name === "node_modules") return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC)
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({ rel: relative(SRC, path).split(sep).join("/"), source: readFileSync(path, "utf8") }));

/** `.update({ where: { id…, otherField` — comments between the brace and `where` allowed. */
const GUARDED_UPDATE = /\.update\(\{\s*(?:\/\/[^\n]*\s*)*where:\s*\{\s*id(?:\s*:\s*[\w.]+)?\s*,\s*\w+/g;

describe("guarded writes use updateMany (full-db recette, 12/10)", () => {
  it("finds the routes", () => {
    expect(files.some((file) => file.rel === "app/api/samples/[id]/validation/route.ts")).toBe(true);
  });

  it("never guards a Prisma update by a field other than its id", () => {
    const offenders = files.flatMap((file) =>
      [...file.source.matchAll(GUARDED_UPDATE)].map((match) => {
        const line = file.source.slice(0, match.index).split("\n").length;
        return `${file.rel}:${line}`;
      })
    );
    expect(offenders).toEqual([]);
  });

  it("would catch the pattern it forbids", () => {
    const sample = `await prisma.sample.update({\n  // guard\n  where: { id: sample.id, status: "RESULTATS_SAISIS" },\n  data: {} });`;
    expect([...sample.matchAll(GUARDED_UPDATE)]).toHaveLength(1);
    expect([..."prisma.sample.update({ where: { id }, data: {} })".matchAll(GUARDED_UPDATE)]).toHaveLength(0);
  });
});
