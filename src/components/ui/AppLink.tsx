"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps, type FocusEvent, type MouseEvent, type TouchEvent } from "react";

/**
 * The application's only `next/link` (eslint `no-restricted-imports`;
 * app-link.test.ts). Next prefetches every `<Link>` the moment it scrolls
 * into view, again after every `router.refresh()` and every navigation: 25
 * to 59 requests per page, which queued the real ones — the session touch,
 * the navigation itself — for seconds behind them on HTTP/1.1
 * (.ui-tests/perf/plan.md P1-1).
 *
 * Here a link prefetches only when it is about to be followed: a pointer
 * resting on it (`HOVER_PREFETCH_MS`), the keyboard's focus, a finger
 * touching it — one `router.prefetch` in Next's default ("auto") strategy,
 * never the full page. A caller that passes `prefetch` itself keeps Next's
 * own behaviour. Anchors (`#…`), the API (files, exports) and other sites
 * are never prefetched. A click on a link not prefetched yet marks it
 * (`data-pending`, globals.css) until the next page answers.
 */

/** How long the pointer rests on a link before it is prefetched. */
const HOVER_PREFETCH_MS = 80;

type AppLinkProps = ComponentProps<typeof Link>;

/** The in-app path a link leads to, or null when nothing is to prefetch. */
export function prefetchTarget(href: AppLinkProps["href"], target?: string): string | null {
  if (typeof href !== "string") return null;
  if (target && target !== "_self") return null;
  const path = href.split("#")[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api/")) return null;
  return path;
}

/** Marks its link while the navigation it started is pending. */
function PendingMarker() {
  const { pending } = useLinkStatus();
  return <span hidden aria-hidden="true" data-pending={pending ? "true" : "false"} />;
}

export default function AppLink({
  prefetch,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onTouchStart,
  children,
  ...props
}: AppLinkProps) {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  const path = prefetch === undefined ? prefetchTarget(props.href, props.target) : null;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    },
    []
  );

  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function prefetchNow() {
    cancel();
    if (path) router.prefetch(path);
  }

  return (
    <Link
      {...props}
      prefetch={prefetch ?? false}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        if (!path) return;
        cancel();
        timer.current = window.setTimeout(prefetchNow, HOVER_PREFETCH_MS);
      }}
      onMouseLeave={(event: MouseEvent<HTMLAnchorElement>) => {
        onMouseLeave?.(event);
        cancel();
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(event);
        prefetchNow();
      }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
        onTouchStart?.(event);
        prefetchNow();
      }}
    >
      {children}
      <PendingMarker />
    </Link>
  );
}
