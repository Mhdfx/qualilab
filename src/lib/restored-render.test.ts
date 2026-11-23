import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RENDER_IDS_KEPT, newRenderId, watchRender } from "./restored-render";

/**
 * Back / Forward from the router's cache (review of the lot performance,
 * points 3 and 4): a render shown a second time is asked again, once; a new
 * render never is.
 */

const read = (rel: string) => readFileSync(`${process.cwd()}/src/${rel}`, "utf8");

describe("watchRender — a page restored from the router's cache asks the server again", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a first showing asks nothing; the same render shown again (Back) is refreshed once", () => {
    const seen = new Set<string>();
    const refresh = vi.fn();
    watchRender("r1", refresh, seen);
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();
    // Left for the sample's page, then Back: the cached render mounts again.
    watchRender("r1", refresh, seen);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the refreshed render is a new one: it asks nothing more", () => {
    const seen = new Set<string>(["r1"]);
    const refresh = vi.fn();
    watchRender("r1", refresh, seen);
    watchRender("r2", refresh, seen);
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a restored render mounted twice (React's development double mount) is refreshed once", () => {
    const seen = new Set<string>(["r1"]);
    const refresh = vi.fn();
    const cleanup = watchRender("r1", refresh, seen);
    cleanup();
    watchRender("r1", refresh, seen);
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("React's development double mount is not a second showing", () => {
    const seen = new Set<string>();
    const refresh = vi.fn();
    const cleanup = watchRender("r1", refresh, seen);
    cleanup();
    watchRender("r1", refresh, seen);
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();
    expect(seen.has("r1")).toBe(true);
  });

  it("forgets the oldest renders past its size", () => {
    const seen = new Set<string>();
    const refresh = vi.fn();
    for (let i = 0; i <= RENDER_IDS_KEPT; i++) watchRender(`r${i}`, refresh, seen);
    vi.runAllTimers();
    expect(seen.size).toBe(RENDER_IDS_KEPT);
    expect(seen.has("r0")).toBe(false);
    expect(seen.has(`r${RENDER_IDS_KEPT}`)).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("each render gets an id of its own", () => {
    expect(newRenderId()).not.toBe(newRenderId());
  });

  it("the bench, the sheet and the two dashboards whose first rows come with the page are watched", () => {
    for (const rel of ["app/technicien/page.tsx", "app/technicien/[id]/page.tsx", "app/admin/page.tsx", "app/preleveur/page.tsx"]) {
      expect(read(rel), rel).toContain("<RefreshWhenRestored renderId={newRenderId()} />");
    }
    const component = read("components/ui/RefreshWhenRestored.tsx");
    expect(component.startsWith('"use client";')).toBe(true);
    expect(component).toContain("useEffect(() => watchRender(renderId, () => router.refresh()), [renderId, router]);");
  });
});
