import type { Prisma } from "@/generated/prisma/client";

/**
 * A bench sheet opened before a colleague saved on it (re-ask 2.13, C3 —
 * the review of 23/10).
 *
 * `PUT …/results` takes the whole sheet on every « Enregistrer »: the grid on
 * screen is the truth. With « Reprendre », a sample may go from A to B and
 * back to A; a tab A left open before (another bench PC) is still editable,
 * and its « Enregistrer » would write its stale lines — B's reading shown
 * empty there — over what B saved, under A's name. So:
 *
 * - the sheet says when it was rendered (`loadedAt`, the server's time) and
 *   the save is refused (409 `SHEET_SAVED_BY_COLLEAGUE`) when someone else
 *   saved a line of the sample since (`savedByOthersSince`) — the viewer's
 *   own saves never count;
 * - the refusal re-renders the page, and the sheet follows the server on
 *   every line the viewer did not change since it was laid out
 *   (`followServer`) — the colleague's reading appears with « Saisi par » —
 *   while what the viewer typed is kept, never lost. A line both changed
 *   keeps the viewer's typing and is named (`overlapNotice`): their next
 *   « Enregistrer » replaces the colleague's reading knowingly, the
 *   journal keeping who had typed it (RESULTS_SAVED.replaced).
 *
 * Pure, so the route, the sheet and the tests read the same rule.
 */

export const SHEET_SAVED_BY_COLLEAGUE =
  "Un collègue a enregistré des résultats sur cette fiche depuis que vous l'avez ouverte : rien n'a été enregistré. La fiche affiche maintenant ses résultats et garde votre saisie ; vérifiez-la, puis enregistrez de nouveau.";

/**
 * The `loadedAt` a save carries: the instant its sheet was rendered. Null
 * when absent (a save from a script or an older tab: no check, as before);
 * "invalid" when it cannot be read — the route answers 400.
 */
export function sheetLoadedAt(raw: unknown): Date | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return "invalid";
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? "invalid" : at;
}

/**
 * The lines someone else saved on the sample after the sheet was rendered:
 * a line keeps its author and time unless its typing changed (D-09), so a
 * line written since is a reading the sheet never showed.
 */
export function savedByOthersSince(sampleId: string, loadedAt: Date, userId: string): Prisma.ResultWhereInput {
  return { sampleId, enteredAt: { gt: loadedAt }, NOT: { enteredById: userId } };
}

/** A line of the sheet as far as following the server goes: what the viewer types on it. */
export type SheetLine = {
  parameterId: string;
  /** May the viewer type it — a line they may not always follows the server. */
  editable: boolean;
  perUnit: boolean;
  value: string;
  note: string;
  workStatus: string;
  manualConform: boolean | null;
  units: string[];
};

/** What is typed on a line, compared as text: a grid grown by empty units holds the same readings. */
function typedOf(line: SheetLine): string {
  const units = line.units.map((unit) => unit.trim());
  while (units.length > 0 && units[units.length - 1] === "") units.pop();
  return JSON.stringify([line.value.trim(), line.note.trim(), line.workStatus, line.manualConform, units]);
}

/**
 * The sheet the server just rendered (`fresh`), with the viewer's typing
 * (`typed`) carried over on each line they changed since the sheet was last
 * laid out (`base`, the server's previous rendering) — and still theirs,
 * read the same way (one value or R1 … Rn). Every other line follows the
 * server: a colleague's reading saved meanwhile appears instead of the
 * stale one. `overlap`: the lines whose typing was kept though the server's
 * reading changed too, and differs from it.
 */
export function followServer<L extends SheetLine>(
  fresh: readonly L[],
  typed: readonly L[],
  base: readonly SheetLine[]
): { lines: L[]; overlap: L[] } {
  const before = new Map(typed.map((line) => [line.parameterId, line]));
  const laid = new Map(base.map((line) => [line.parameterId, line]));
  const overlap: L[] = [];
  const lines = fresh.map((line) => {
    const previous = before.get(line.parameterId);
    const origin = laid.get(line.parameterId);
    if (!previous || !line.editable || previous.perUnit !== line.perUnit) return line;
    // Left as laid out: nothing of the viewer's to keep.
    if (origin && typedOf(previous) === typedOf(origin)) return line;
    const kept = {
      ...line,
      value: previous.value,
      note: previous.note,
      workStatus: previous.workStatus,
      manualConform: previous.manualConform,
      units: line.units.map((unit, index) => previous.units[index] ?? unit),
    };
    if (origin && typedOf(line) !== typedOf(origin) && typedOf(line) !== typedOf(kept)) overlap.push(line);
    return kept;
  });
  return { lines, overlap };
}

/** What the sheet adds to the refusal when the viewer's typing was kept on a line the colleague changed too. */
export function overlapNotice(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const list = names.join(", ");
  return names.length > 1
    ? `Votre saisie est gardée sur ${list}, que ce collègue a aussi modifiés : vérifiez-la, elle remplacera ses résultats à l'enregistrement.`
    : `Votre saisie est gardée sur ${list}, que ce collègue a aussi modifié : vérifiez-la, elle remplacera son résultat à l'enregistrement.`;
}
