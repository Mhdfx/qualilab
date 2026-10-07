import { describe, expect, it } from "vitest";
import {
  accountChangeClosesSessions,
  isBanActive,
  PORTAL_REFUSAL_MESSAGES,
  checkPortalPasswordChange,
  isClientClosed,
  portalAccess,
  portalPasswordErrorMessage,
  portalScopeChanged,
  readClientId,
  userClientRefusal,
} from "./portal-access";

const OPEN = { id: "c-alpha", name: "Boulangerie Alpha", archived: false, mergedIntoId: null };

describe("portalAccess", () => {
  it("opens the portal on the account's own client", () => {
    expect(portalAccess({ role: "CLIENT", clientId: "c-alpha", client: OPEN })).toEqual({
      ok: true,
      clientId: "c-alpha",
      clientName: "Boulangerie Alpha",
    });
  });

  it("refuses a laboratory account, whatever its client", () => {
    for (const role of ["ADMIN", "GESTIONNAIRE", "TECHNICIEN", "SOMETHING"]) {
      expect(portalAccess({ role, clientId: "c-alpha", client: OPEN })).toEqual({ ok: false, reason: "NOT_CLIENT_ROLE" });
    }
  });

  it("refuses a CLIENT account without a client", () => {
    expect(portalAccess({ role: "CLIENT", clientId: null, client: null })).toEqual({ ok: false, reason: "NO_CLIENT" });
    // The client row was removed (onDelete: SetNull leaves the id dangling only in theory).
    expect(portalAccess({ role: "CLIENT", clientId: "c-alpha", client: null })).toEqual({ ok: false, reason: "NO_CLIENT" });
  });

  it("never scopes on a client that does not match the account's clientId", () => {
    const other = { ...OPEN, id: "c-beta", name: "Traiteur Beta" };
    expect(portalAccess({ role: "CLIENT", clientId: "c-alpha", client: other })).toEqual({ ok: false, reason: "NO_CLIENT" });
  });

  it("closes the portal of an archived or merged client", () => {
    expect(portalAccess({ role: "CLIENT", clientId: "c-alpha", client: { ...OPEN, archived: true } })).toEqual({
      ok: false,
      reason: "CLIENT_CLOSED",
    });
    expect(
      portalAccess({ role: "CLIENT", clientId: "c-alpha", client: { ...OPEN, archived: true, mergedIntoId: "c-kept" } })
    ).toEqual({ ok: false, reason: "CLIENT_CLOSED" });
    // A merge always archives the record; closed even if the flag were missing.
    expect(isClientClosed({ archived: false, mergedIntoId: "c-kept" })).toBe(true);
    expect(isClientClosed({ archived: false, mergedIntoId: null })).toBe(false);
  });

  it("explains every refusal in French", () => {
    expect(PORTAL_REFUSAL_MESSAGES.CLIENT_CLOSED).toMatch(/fermé/);
    expect(PORTAL_REFUSAL_MESSAGES.NO_CLIENT).toMatch(/rattaché/);
  });
});

describe("userClientRefusal (administration)", () => {
  it("requires a client for the CLIENT role", () => {
    expect(userClientRefusal("CLIENT", null, null)).toBe("Choisissez le client de ce compte portail.");
    expect(userClientRefusal("CLIENT", "c-missing", null)).toBe("Client introuvable.");
    expect(userClientRefusal("CLIENT", "c-alpha", OPEN)).toBeNull();
  });

  it("forbids a client on every other role", () => {
    expect(userClientRefusal("TECHNICIEN", "c-alpha", OPEN)).toMatch(/Seul un compte « Client \(portail\) »/);
    expect(userClientRefusal("TECHNICIEN", null, null)).toBeNull();
    expect(userClientRefusal("ADMIN", null, null)).toBeNull();
  });

  it("refuses an archived or merged client", () => {
    expect(userClientRefusal("CLIENT", "c-alpha", { archived: true, mergedIntoId: null })).toMatch(/archivé/);
    expect(userClientRefusal("CLIENT", "c-alpha", { archived: true, mergedIntoId: "c-kept" })).toMatch(/fusionné/);
  });
});

describe("readClientId", () => {
  it("keeps a non-empty string, trimmed", () => {
    expect(readClientId(" c-alpha ")).toBe("c-alpha");
  });
  it("reads anything else as no client", () => {
    expect(readClientId("")).toBeNull();
    expect(readClientId("   ")).toBeNull();
    expect(readClientId(null)).toBeNull();
    expect(readClientId(42)).toBeNull();
    expect(readClientId({ id: "c-alpha" })).toBeNull();
    expect(readClientId("x".repeat(192))).toBeNull();
  });
});

describe("portalScopeChanged", () => {
  it("closes the sessions when the account enters or leaves the portal", () => {
    expect(portalScopeChanged({ role: "TECHNICIEN", clientId: null }, { role: "CLIENT", clientId: "c-alpha" })).toBe(true);
    expect(portalScopeChanged({ role: "CLIENT", clientId: "c-alpha" }, { role: "TECHNICIEN", clientId: null })).toBe(true);
  });
  it("closes them when a portal account moves to another client", () => {
    expect(portalScopeChanged({ role: "CLIENT", clientId: "c-alpha" }, { role: "CLIENT", clientId: "c-beta" })).toBe(true);
  });
  it("leaves them alone otherwise", () => {
    expect(portalScopeChanged({ role: "CLIENT", clientId: "c-alpha" }, { role: "CLIENT", clientId: "c-alpha" })).toBe(false);
    expect(portalScopeChanged({ role: "TECHNICIEN", clientId: null }, { role: "VALIDATEUR", clientId: null })).toBe(false);
  });
});

describe("checkPortalPasswordChange", () => {
  it("accepts a valid change", () => {
    expect(
      checkPortalPasswordChange({ currentPassword: "ancien-mdp", newPassword: "nouveau-mdp", confirmPassword: "nouveau-mdp" })
    ).toEqual({ ok: true, currentPassword: "ancien-mdp", newPassword: "nouveau-mdp" });
  });
  it("refuses a missing current password, a short one, a mismatch, the same one", () => {
    expect(checkPortalPasswordChange({ newPassword: "nouveau-mdp" })).toMatchObject({ ok: false });
    expect(checkPortalPasswordChange({ currentPassword: "ancien-mdp", newPassword: "court" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/8 caractères/),
    });
    expect(
      checkPortalPasswordChange({ currentPassword: "ancien-mdp", newPassword: "nouveau-mdp", confirmPassword: "autre-mdp" })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/ne correspondent pas/) });
    expect(checkPortalPasswordChange({ currentPassword: "meme-mdp-1", newPassword: "meme-mdp-1" })).toMatchObject({
      ok: false,
    });
    expect(checkPortalPasswordChange({ currentPassword: "ancien-mdp", newPassword: "x".repeat(129) })).toMatchObject({
      ok: false,
    });
    expect(checkPortalPasswordChange(null)).toMatchObject({ ok: false });
  });
  it("translates Better Auth's codes", () => {
    expect(portalPasswordErrorMessage("INVALID_PASSWORD")).toBe("Le mot de passe actuel est incorrect.");
    expect(portalPasswordErrorMessage(undefined)).toMatch(/Réessayez/);
  });
});

describe("isBanActive — a disabled account stays out", () => {
  const now = new Date(2026, 9, 7, 12, 0);

  it("is out while banned without an end date", () => {
    expect(isBanActive(true, null, now)).toBe(true);
    expect(isBanActive(true, undefined, now)).toBe(true);
  });

  it("is out until the end date, back in after it", () => {
    expect(isBanActive(true, new Date(2026, 9, 8), now)).toBe(true);
    expect(isBanActive(true, new Date(2026, 9, 6), now)).toBe(false);
    expect(isBanActive(true, "2026-10-08T00:00:00.000Z", now)).toBe(true);
  });

  it("treats an unreadable end date as no end date", () => {
    expect(isBanActive(true, "pas une date", now)).toBe(true);
  });

  it("lets an active account in", () => {
    expect(isBanActive(false, null, now)).toBe(false);
    expect(isBanActive(null, null, now)).toBe(false);
    expect(isBanActive(undefined, new Date(2027, 0, 1), now)).toBe(false);
  });
});

describe("accountChangeClosesSessions — PATCH /api/admin/users/[id]", () => {
  const lab = { role: "TECHNICIEN", clientId: null };
  const portal = { role: "CLIENT", clientId: "c-alpha" };

  it("closes them when what a portal account sees changes", () => {
    expect(accountChangeClosesSessions(portal, { role: "CLIENT", clientId: "c-beta" }, { passwordReset: false })).toBe(true);
    expect(accountChangeClosesSessions(portal, lab, { passwordReset: false })).toBe(true);
    expect(accountChangeClosesSessions(lab, portal, { passwordReset: false })).toBe(true);
  });

  it("closes them on a ban or a password reset", () => {
    expect(accountChangeClosesSessions(lab, lab, { banned: true, passwordReset: false })).toBe(true);
    expect(accountChangeClosesSessions(portal, portal, { passwordReset: true })).toBe(true);
  });

  it("keeps them when re-enabling, or between laboratory roles", () => {
    expect(accountChangeClosesSessions(lab, lab, { banned: false, passwordReset: false })).toBe(false);
    expect(accountChangeClosesSessions(lab, { role: "VALIDATEUR", clientId: null }, { passwordReset: false })).toBe(false);
    expect(accountChangeClosesSessions(portal, portal, { passwordReset: false })).toBe(false);
  });
});
