import { describe, expect, it } from "vitest";
import { VIEW_PARAM, parseView, viewHref } from "./dashboard-view";

describe("parseView", () => {
  const VIEWS = { a_programmer: "À programmer", retard: "En retard" } as const;

  it("reads a known view, from a list of keys or a record of labels", () => {
    // Typed as the page's own keys, so `VIEWS[view]` needs no cast.
    const view: keyof typeof VIEWS | null = parseView("retard", VIEWS);
    expect(view).toBe("retard");
    const fromList: "a_valider" | "attente_admin" | null = parseView("attente_admin", ["a_valider", "attente_admin"] as const);
    expect(fromList).toBe("attente_admin");
    expect(parseView("a_valider", ["a_valider", "attente_admin"] as const)).toBe("a_valider");
    expect(parseView("  retard ", VIEWS)).toBe("retard");
  });

  it("is null for no view, an unknown one, or something that is not text", () => {
    expect(parseView(undefined, VIEWS)).toBeNull();
    expect(parseView("", VIEWS)).toBeNull();
    expect(parseView("   ", VIEWS)).toBeNull();
    expect(parseView("tout", VIEWS)).toBeNull();
    expect(parseView(42, VIEWS)).toBeNull();
    expect(parseView(null, ["a"] as const)).toBeNull();
  });

  it("never mistakes an inherited property for a view", () => {
    expect(parseView("toString", VIEWS)).toBeNull();
    expect(parseView("constructor", VIEWS)).toBeNull();
    expect(parseView("__proto__", VIEWS)).toBeNull();
  });

  it("reads the first value of a repeated parameter", () => {
    expect(parseView(["retard", "a_programmer"], VIEWS)).toBe("retard");
    expect(parseView([], VIEWS)).toBeNull();
  });

  it("is case-sensitive: the keys are the ones the page writes", () => {
    expect(parseView("RETARD", VIEWS)).toBeNull();
  });
});

describe("viewHref", () => {
  it("writes the view and the list's anchor", () => {
    expect(viewHref("/programmation", "retard", "file")).toBe(`/programmation?${VIEW_PARAM}=retard#file`);
    expect(viewHref("/technicien", "anomalies", "#analyses")).toBe("/technicien?vue=anomalies#analyses");
  });

  it("drops the view for « Tout afficher » and the anchor when there is none", () => {
    expect(viewHref("/programmation", null, "file")).toBe("/programmation#file");
    expect(viewHref("/validation", "a_valider")).toBe("/validation?vue=a_valider");
    expect(viewHref("/validation", null)).toBe("/validation");
  });

  it("round-trips through parseView", () => {
    const href = viewHref("/preleveur", "aujourdhui", "visites");
    const params = new URL(href, "http://localhost").searchParams;
    expect(parseView(params.get(VIEW_PARAM), ["aujourdhui", "semaine"] as const)).toBe("aujourdhui");
  });
});
