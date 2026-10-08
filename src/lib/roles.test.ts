import { describe, it, expect } from "vitest";
import {
  ASSIGNABLE_ROLES,
  LAB_FUNCTION_ROLES,
  LAB_ROLES,
  PORTAL_ROLE,
  ROLES,
  ROLE_FUNCTIONS,
  ROLE_HOME,
  ROLE_LABELS,
  getDashboardPath,
  isPortalRole,
  roleAllowed,
  roleFunction,
} from "./roles";

describe("assignable roles", () => {
  it("offers the portal role now that /portail exists (PORTAIL.md §1)", () => {
    expect(ASSIGNABLE_ROLES).toContain("CLIENT");
    expect(ASSIGNABLE_ROLES.length).toBe(ROLES.length);
    expect(ROLE_LABELS.CLIENT).toBe("Client (portail)");
  });

  it("keeps the portal role out of the laboratory's roles", () => {
    expect(PORTAL_ROLE).toBe("CLIENT");
    expect(LAB_ROLES).not.toContain("CLIENT");
    expect(LAB_ROLES.length).toBe(ROLES.length - 1);
    expect(isPortalRole("CLIENT")).toBe(true);
    expect(isPortalRole("ADMIN")).toBe(false);
    expect(isPortalRole(undefined)).toBe(false);
  });

  it("sends every assignable role to a real dashboard", () => {
    const built = new Set([
      "/preleveur",
      "/reception",
      // PROGRAMME.md: the responsable des paramètres' space (screens in P2).
      "/programmation",
      "/technicien",
      "/validation",
      "/commercial",
      "/comptabilite",
      "/admin",
      "/magasin",
      // PORTAIL.md §2: the client portal.
      "/portail",
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

describe("role wording — the laboratory's list of 08/10", () => {
  it("gives every laboratory role a non-empty label, each one distinct", () => {
    for (const role of LAB_ROLES) expect(ROLE_LABELS[role].trim(), role).not.toBe("");
    const labels = ROLES.map((role) => ROLE_LABELS[role]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("names the step-1 signer « Validateur technique »", () => {
    expect(ROLE_LABELS.VALIDATEUR).toBe("Validateur technique");
  });

  it("maps the six functions to the six circuit roles, in the lab's order", () => {
    expect(LAB_FUNCTION_ROLES).toEqual(["PRELEVEUR", "RECEPTIONNISTE", "PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "ADMIN"]);
    expect(LAB_FUNCTION_ROLES.map((role) => ROLE_FUNCTIONS[role])).toEqual([
      "Prélèvement des échantillons",
      "Réception des échantillons",
      "Enregistrement des paramètres",
      "Saisie des résultats",
      "Validation technique des résultats",
      "Validation administrative et administration du système",
    ]);
    for (const role of LAB_FUNCTION_ROLES) {
      expect(ROLES, role).toContain(role);
      expect(ROLE_FUNCTIONS[role].trim(), role).not.toBe("");
      expect(roleFunction(role)).toBe(ROLE_FUNCTIONS[role]);
    }
  });

  it("gives no function to the roles outside the circuit, nor to a non-role", () => {
    for (const role of ["GESTIONNAIRE", "COMPTABLE", "MAGASINIER", "CLIENT"] as const) {
      expect(roleFunction(role), role).toBeNull();
    }
    expect(roleFunction("SOMETHING")).toBeNull();
    expect(roleFunction(null)).toBeNull();
    expect(roleFunction(undefined)).toBeNull();
  });
});

describe("roleAllowed — the decision of every guard", () => {
  it("admits only the roles listed", () => {
    expect(roleAllowed("ADMIN", ["ADMIN"])).toBe(true);
    expect(roleAllowed("TECHNICIEN", ["ADMIN"])).toBe(false);
    expect(roleAllowed("CLIENT", ["CLIENT"])).toBe(true);
    expect(roleAllowed("CLIENT", ["VALIDATEUR", "GESTIONNAIRE", "COMPTABLE", "ADMIN"])).toBe(false);
  });

  it("reads an empty list as « any laboratory account », never the portal (PORTAIL.md §3)", () => {
    for (const role of LAB_ROLES) expect(roleAllowed(role, []), role).toBe(true);
    expect(roleAllowed("CLIENT", [])).toBe(false);
  });

  it("refuses CLIENT for every list of laboratory roles", () => {
    expect(roleAllowed("CLIENT", LAB_ROLES)).toBe(false);
  });
});
