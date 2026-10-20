import { describe, expect, it } from "vitest";
import {
  PASSWORD_CHANGE_API_ERROR,
  PASSWORD_CHANGE_NOTICE,
  PASSWORD_STILL_REQUIRED_MESSAGE,
  accountPath,
  landingPath,
  passwordChangeBlocks,
  passwordChangeNext,
} from "./password-change";
import { LAB_ROLES, getDashboardPath } from "./roles";

/**
 * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1): the rule the
 * guards of auth.ts apply to every page and route, and where an account
 * whose password must be changed is sent.
 */

describe("accountPath", () => {
  it("is /compte for every laboratory role, the préleveur's phone included", () => {
    for (const role of LAB_ROLES) expect(accountPath(role), role).toBe("/compte");
  });

  it("is the portal's own page for a client's account", () => {
    expect(accountPath("CLIENT")).toBe("/portail/compte");
  });
});

describe("landingPath", () => {
  it("opens the dashboard of an account whose password is its own", () => {
    for (const role of [...LAB_ROLES, "CLIENT" as const]) {
      expect(landingPath({ role, mustChangePassword: false }), role).toBe(getDashboardPath(role));
    }
    expect(landingPath({ role: "PRELEVEUR", mustChangePassword: false })).toBe("/preleveur");
    expect(landingPath({ role: "CLIENT", mustChangePassword: false })).toBe("/portail");
  });

  it("opens « Mon compte » while the password must be changed", () => {
    expect(landingPath({ role: "TECHNICIEN", mustChangePassword: true })).toBe("/compte");
    expect(landingPath({ role: "PRELEVEUR", mustChangePassword: true })).toBe("/compte");
    expect(landingPath({ role: "ADMIN", mustChangePassword: true })).toBe("/compte");
    expect(landingPath({ role: "CLIENT", mustChangePassword: true })).toBe("/portail/compte");
  });
});

describe("passwordChangeBlocks", () => {
  const EVERY_SCREEN = { allowsPasswordChange: false };
  const PASSWORD_CHANGE_SCREEN = { allowsPasswordChange: true };

  it("stops every page and route while the password must be changed", () => {
    expect(passwordChangeBlocks({ mustChangePassword: true }, EVERY_SCREEN)).toBe(true);
  });

  it("lets « Mon compte » and the password change through", () => {
    expect(passwordChangeBlocks({ mustChangePassword: true }, PASSWORD_CHANGE_SCREEN)).toBe(false);
  });

  it("never stops an account whose password is its own", () => {
    expect(passwordChangeBlocks({ mustChangePassword: false }, EVERY_SCREEN)).toBe(false);
    expect(passwordChangeBlocks({ mustChangePassword: false }, PASSWORD_CHANGE_SCREEN)).toBe(false);
  });
});

describe("passwordChangeNext — what « Mon compte » does with the answer", () => {
  it("opens the account's space once the flag is cleared", () => {
    expect(passwordChangeNext({ redirectTo: "/technicien" })).toEqual({ kind: "OPEN", path: "/technicien" });
    expect(passwordChangeNext({ redirectTo: "/portail" })).toEqual({ kind: "OPEN", path: "/portail" });
  });

  it("asks again, the new password as the current one, when the flag is still set", () => {
    expect(passwordChangeNext({ stillRequired: true })).toEqual({ kind: "STILL_REQUIRED" });
    // Whatever else the answer carries: the page must not leave « Mon compte ».
    expect(passwordChangeNext({ stillRequired: true, redirectTo: "/technicien" })).toEqual({ kind: "STILL_REQUIRED" });
  });

  it("stays for an account whose password was already its own", () => {
    expect(passwordChangeNext({})).toEqual({ kind: "STAY" });
    expect(passwordChangeNext({ stillRequired: "true" })).toEqual({ kind: "STAY" });
  });

  it("never follows a redirection to another host", () => {
    for (const redirectTo of ["//evil.test", "/\\evil.test", "https://evil.test/", "technicien", "", 42, null]) {
      expect(passwordChangeNext({ redirectTo }), String(redirectTo)).toEqual({ kind: "STAY" });
    }
  });
});

describe("wording", () => {
  it("says what to do, in the laboratory's words", () => {
    expect(PASSWORD_CHANGE_NOTICE).toBe("Choisissez votre mot de passe avant de continuer");
    expect(PASSWORD_CHANGE_API_ERROR).toBe("Choisissez d'abord votre mot de passe (Mon compte).");
  });

  it("names the new password as the current one when the flag could not be cleared", () => {
    // The administrator's password no longer works once Better Auth replaced it.
    expect(PASSWORD_STILL_REQUIRED_MESSAGE).toContain("Saisissez ce nouveau mot de passe comme mot de passe actuel");
  });
});
