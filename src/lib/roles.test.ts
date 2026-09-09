import { describe, it, expect } from "vitest";
import { ASSIGNABLE_ROLES, ROLES, ROLE_HOME, getDashboardPath } from "./roles";

describe("assignable roles", () => {
  it("never offers a role whose landing page does not exist yet", () => {
    // CLIENT waits for the portal (Phase 8): handing it out would strand the
    // account on a 404 after every login.
    expect(ASSIGNABLE_ROLES).not.toContain("CLIENT");
    expect(ASSIGNABLE_ROLES.length).toBe(ROLES.length - 1);
  });

  it("sends every assignable role to a real dashboard", () => {
    const built = new Set([
      "/preleveur",
      "/reception",
      "/technicien",
      "/validation",
      "/commercial",
      "/comptabilite",
      "/admin",
      "/magasin",
    ]);
    for (const role of ASSIGNABLE_ROLES) {
      expect(built.has(ROLE_HOME[role]), role).toBe(true);
      expect(getDashboardPath(role)).toBe(ROLE_HOME[role]);
    }
  });

  it("falls back to the login page for anything that is not a role", () => {
    expect(getDashboardPath("SOMETHING")).toBe("/login");
    expect(getDashboardPath(null)).toBe("/login");
  });
});
