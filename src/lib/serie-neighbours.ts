/**
 * « Échantillon précédent / suivant » in the same série (lot 3B, G4 — the
 * re-ask of 18/10, 2.20 (j), answered « Oui » on 28/10): the programme sheet
 * and the bench sheet step through a série's samples without going back to
 * the list. Pure.
 *
 * The order is the série's own — its line number, then the code (the two
 * samples of an échantillon, « 1M » before « 1P ») — the order of the bon,
 * the labels and the reception. The caller passes only the samples the
 * viewer may open on that screen.
 */
export type SerieSibling = { id: string; lineNumber: number; code: string };

export type SerieNeighbours<T extends SerieSibling> = {
  previous: T | null;
  next: T | null;
  /** 1-based place of the current sample among the siblings; 0 when it is not one of them. */
  position: number;
  total: number;
};

export function serieOrder(a: SerieSibling, b: SerieSibling): number {
  return a.lineNumber - b.lineNumber || a.code.localeCompare(b.code, "fr", { numeric: true });
}

export function serieNeighbours<T extends SerieSibling>(siblings: readonly T[], currentId: string): SerieNeighbours<T> {
  const ordered = [...siblings].sort(serieOrder);
  const at = ordered.findIndex((sibling) => sibling.id === currentId);
  if (at === -1) return { previous: null, next: null, position: 0, total: ordered.length };
  return {
    previous: at > 0 ? ordered[at - 1] : null,
    next: at < ordered.length - 1 ? ordered[at + 1] : null,
    position: at + 1,
    total: ordered.length,
  };
}

/** What the screen asks before leaving a sheet with typing not saved. */
export const UNSAVED_CHANGES_MESSAGE =
  "Des modifications de cette fiche ne sont pas enregistrées. Quitter la fiche sans les enregistrer ?";
