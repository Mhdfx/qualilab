"use client";

import { useEffect } from "react";

/**
 * The guard of a sheet with typing not saved (lot 3B, G4): a sheet declares
 * its state with `useUnsavedChanges(dirty)`, and a link that leaves it — the
 * « Échantillon précédent / suivant » of the série — asks first
 * (`hasUnsavedChanges`). A reload or a closed tab is asked by the browser
 * (`beforeunload`). One registry for the page: a sheet and its links are
 * siblings under a server page, with no common client parent.
 */
const dirtySheets = new Set<symbol>();

export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const sheet = Symbol("sheet");
    dirtySheets.add(sheet);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      dirtySheets.delete(sheet);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}

/** Whether a sheet of this page holds typing not saved. */
export function hasUnsavedChanges(): boolean {
  return dirtySheets.size > 0;
}
