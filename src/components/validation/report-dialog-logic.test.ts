import { describe, expect, it } from "vitest";
import { focusTrapTarget } from "./report-dialog-logic";

// The dialog's focusables in document order: the cross, then the actions.
const close = "Fermer";
const cancel = "Annuler";
const send = "Renvoyer le rapport";
const focusables = [close, cancel, send];

describe("focusTrapTarget — Tab stays inside the report dialog", () => {
  it("wraps Tab from the last control to the first", () => {
    expect(focusTrapTarget(focusables, send, true, false)).toBe(close);
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    expect(focusTrapTarget(focusables, close, true, true)).toBe(send);
  });

  it("lets the browser move between controls in the middle", () => {
    expect(focusTrapTarget(focusables, close, true, false)).toBeNull();
    expect(focusTrapTarget(focusables, cancel, true, false)).toBeNull();
    expect(focusTrapTarget(focusables, send, true, true)).toBeNull();
  });

  it("from the panel focused on open, Tab goes to the first control and Shift+Tab to the last", () => {
    const panel = "panel";
    expect(focusTrapTarget(focusables, panel, true, false)).toBe(close);
    expect(focusTrapTarget(focusables, panel, true, true)).toBe(send);
  });

  it("brings back a focus that escaped the dialog", () => {
    expect(focusTrapTarget(focusables, "page link", false, false)).toBe(close);
    expect(focusTrapTarget(focusables, null, false, true)).toBe(send);
  });

  it("keeps a dialog with one control on it", () => {
    expect(focusTrapTarget([close], close, true, false)).toBe(close);
    expect(focusTrapTarget([close], close, true, true)).toBe(close);
  });

  it("does nothing when the dialog has no control at all", () => {
    expect(focusTrapTarget([], null, false, false)).toBeNull();
  });
});
