/**
 * The focus trap of `ReportDialog` (aria-modal: Tab and Shift+Tab never
 * leave the dialog for the page behind it). Pure, so the wrap-around is
 * tested without a browser; the component hands it the dialog's rendered
 * focusable elements, in document order.
 */

/** What Tab may reach inside the dialog. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab (or Shift+Tab, `backwards`) must send the focus to stay in the
 * dialog, or null to let the browser move it (it stays inside on its own).
 * `active` is the focused element, `inside` whether it is in the dialog —
 * the panel itself (focused on open, not in the list) counts as inside but
 * wraps like the edges: Shift+Tab from it would otherwise leave the dialog.
 */
export function focusTrapTarget<T>(focusables: readonly T[], active: T | null, inside: boolean, backwards: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const index = active === null ? -1 : focusables.indexOf(active);
  if (!inside || index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === focusables.length - 1) return first;
  return null;
}
