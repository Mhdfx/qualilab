/**
 * After a save that leads to `target`: one render of it, fresh. Already
 * there — the page is refreshed; elsewhere — the push renders the new page
 * from the server (dynamic pages are never kept by the router), so a refresh
 * after it would only render it a second time (.ui-tests/perf/plan.md P1-5).
 */
export function goFresh(
  router: { push(href: string): void; refresh(): void },
  pathname: string | null,
  target: string
): void {
  if (pathname === target) router.refresh();
  else router.push(target);
}
