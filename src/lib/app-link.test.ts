import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Navigation without the prefetch storm (.ui-tests/perf/plan.md P1-1).
 * Every link goes through AppLink.tsx, which prefetches on intent only (a
 * pointer resting, the focus, a touch) instead of on sight. These read the
 * sources.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const APP_LINK = join(SRC, "components", "ui", "AppLink.tsx");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const sources = walk(SRC).map((path) => ({
  path,
  name: relative(SRC, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

describe("every link goes through AppLink (intent prefetch only)", () => {
  it("no file but AppLink.tsx imports next/link", () => {
    const offenders = sources
      .filter((file) => file.path !== APP_LINK && /from\s+["']next\/link["']/.test(file.text))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it("the links that exist are AppLinks", () => {
    const users = sources.filter((file) => /import Link from "@\/components\/ui\/AppLink";/.test(file.text));
    expect(users.length).toBeGreaterThanOrEqual(50);
  });

  const source = readFileSync(APP_LINK, "utf8");

  it("defaults Next's prefetch to off, never the full page", () => {
    expect(source).toContain("prefetch={prefetch ?? false}");
    expect(source).not.toMatch(/prefetch=\{true\}/);
    expect(source).not.toMatch(/\bFULL\b/);
    expect(source).not.toMatch(/kind\s*:/);
  });

  it("prefetches on a resting pointer, the focus and a touch — the caller's handler first", () => {
    expect(source).toMatch(/onMouseEnter\?\.\(event\);[\s\S]{0,200}window\.setTimeout\(prefetchNow, HOVER_PREFETCH_MS\)/);
    expect(source).toMatch(/onMouseLeave\?\.\(event\);\s*cancel\(\);/);
    expect(source).toMatch(/onFocus\?\.\(event\);\s*prefetchNow\(\);/);
    expect(source).toMatch(/onTouchStart\?\.\(event\);\s*prefetchNow\(\);/);
    expect(source).toMatch(/router\.prefetch\(path\)/);
  });

  it("never prefetches an anchor, the API or another site, and clears its timer when it goes", () => {
    expect(source).toMatch(/split\("#"\)\[0\]/);
    expect(source).toMatch(/path\.startsWith\("\/api\/"\)/);
    expect(source).toMatch(/!path\.startsWith\("\/"\)/);
    expect(source).toMatch(/useEffect\(\s*\(\) => \(\) => \{[\s\S]{0,120}clearTimeout/);
  });
});

/**
 * A save refreshes the router before it moves on — pinned on purpose.
 *
 * Perf 1 (P1-5) once dropped `router.refresh()` from these post-save
 * navigations to spare a second render. But the refresh also empties Next's
 * client router cache: without it, browser Back after a save showed the page
 * as it was before the save. Reproduced on production 24/11 (ClientForm:
 * save, then Back to /commercial/<id>/modifier showed the old values, and
 * saving that stale form again silently reverted the edit — report e-mail
 * recipients included). Data integrity first: each of these keeps its
 * refresh, exactly as before the lot (« router.refresh(); router.push(x) »
 * or « router.push(x); router.refresh() »).
 */
const REFRESH_THEN_PUSH = /router\.refresh\(\);\s*(?:if \(openAfter\) )?router\.push\(/g;
const PUSH_THEN_REFRESH = /router\.push\([^;]*\);\s*router\.refresh\(\);/g;

const SAVES_THAT_REFRESH: { file: string; pattern: RegExp; count: number; what: string }[] = [
  { file: "components/clients/ClientForm.tsx", pattern: REFRESH_THEN_PUSH, count: 2, what: "client saved, archived / restored" },
  { file: "components/reception/SerieReceptionForm.tsx", pattern: REFRESH_THEN_PUSH, count: 1, what: "« Retour » after a reception" },
  { file: "components/technicien/ResultEntryForm.tsx", pattern: REFRESH_THEN_PUSH, count: 1, what: "results submitted" },
  { file: "components/technicien/BenchTakeActions.tsx", pattern: REFRESH_THEN_PUSH, count: 2, what: "take, release" },
  { file: "components/NouvelleFactureForm.tsx", pattern: PUSH_THEN_REFRESH, count: 2, what: "invoice created, draft saved" },
  { file: "components/invoices/InvoiceManagement.tsx", pattern: PUSH_THEN_REFRESH, count: 2, what: "draft deleted, credit note" },
  { file: "components/commercial/ClientMergeActions.tsx", pattern: PUSH_THEN_REFRESH, count: 1, what: "clients merged" },
  { file: "components/validation/ReportActions.tsx", pattern: PUSH_THEN_REFRESH, count: 2, what: "correction, amendment" },
];

describe("a save refreshes the router cache before Back can show it", () => {
  for (const { file, pattern, count, what } of SAVES_THAT_REFRESH) {
    it(`${file} calls router.refresh() in its post-save navigation (${what})`, () => {
      const text = sources.find((source) => source.name === file)?.text;
      expect(text, file).toBeDefined();
      expect(text!.match(pattern)?.length ?? 0).toBe(count);
    });
  }

  it("no post-save helper skips the refresh any more (goFresh is gone)", () => {
    const offenders = sources.filter((file) => /\bgoFresh\b|navigate-fresh/.test(file.text)).map((file) => file.name);
    expect(offenders).toEqual([]);
  });
});
