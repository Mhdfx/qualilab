import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Navigation without the prefetch storm (.ui-tests/perf/plan.md P1-1, P1-5).
 * Every link goes through AppLink.tsx, which prefetches on intent only (a
 * pointer resting, the focus, a touch) instead of on sight; and a save does
 * not render a page twice by pairing `router.refresh()` with a
 * `router.push()`. These read the sources.
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
 * Signing in and « Déconnexion » change the session itself: the push leaves
 * the page, the refresh drops what the router kept of the previous person.
 */
const AUTH_FLOWS = new Set(["components/LoginForm.tsx", "components/layout/DashboardShell.tsx"]);

describe("a save renders the next page once", () => {
  it("no refresh() right before a push(), nor a push() right before a refresh()", () => {
    const offenders = sources
      .filter((file) => !AUTH_FLOWS.has(file.name))
      .filter((file) => /router\.refresh\(\);\s*router\.push\(|router\.push\([^;]*\);\s*router\.refresh\(\);/.test(file.text))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });
});
