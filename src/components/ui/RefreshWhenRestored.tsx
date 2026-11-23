"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { watchRender } from "@/lib/restored-render";

/**
 * Asks the server again, once, when the page is shown from the router's
 * cache (browser Back / Forward) — `lib/restored-render.ts`. The page passes
 * an id made for each of its renders (`newRenderId`). Draws nothing.
 */
export function RefreshWhenRestored({ renderId }: { renderId: string }) {
  const router = useRouter();
  useEffect(() => watchRender(renderId, () => router.refresh()), [renderId, router]);
  return null;
}
