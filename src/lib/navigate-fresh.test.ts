import { describe, expect, it } from "vitest";
import { goFresh } from "./navigate-fresh";

function recorder() {
  const calls: string[] = [];
  return {
    calls,
    router: {
      push: (href: string) => calls.push(`push ${href}`),
      refresh: () => calls.push("refresh"),
    },
  };
}

describe("goFresh — one render of the page a save leads to", () => {
  it("refreshes the page already shown, without pushing it again", () => {
    const { calls, router } = recorder();
    goFresh(router, "/validation/s1", "/validation/s1");
    expect(calls).toEqual(["refresh"]);
  });

  it("pushes another page, without a refresh that would render it twice", () => {
    const { calls, router } = recorder();
    goFresh(router, "/recherche", "/validation/s1");
    expect(calls).toEqual(["push /validation/s1"]);
  });

  it("pushes when the current path is unknown", () => {
    const { calls, router } = recorder();
    goFresh(router, null, "/admin/factures/i1");
    expect(calls).toEqual(["push /admin/factures/i1"]);
  });
});
