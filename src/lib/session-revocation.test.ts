import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { IDLE_LOGIN_MOTIF, loginNoticeFor } from "./idle-policy";
import { SESSION_COOKIE_PREFIX, carriesSessionCookie } from "./session-idle";
import {
  REVOCATION_LOGIN_MOTIFS,
  REVOCATION_MARKER_PREFIX,
  REVOCATION_NOTICES,
  isRevocationCause,
  liveRevocationCause,
  revocationCauseOf,
  revocationMarkerValue,
  revocationNoticeFor,
  revokedLoginHref,
  sessionTokenOfCookie,
} from "./session-revocation";
import {
  revocationMarkerIdentifier,
  revocationMarkers,
  revokedSessionCause,
  revokedTokenCause,
  verifiedSessionToken,
} from "./session-revocation-server";

/**
 * Why the sign-in page says a session ended when the administrator ended it
 * — or the person's own password change, on their other devices (23/10): the
 * cause an account change gives, the notice for each, the marker's
 * identifier, value and lifetime, and the reading of a cookie — its
 * signature checked before any read.
 */

const NOW = Date.parse("2026-10-23T10:00:00Z");
const COOKIE = `${SESSION_COOKIE_PREFIX}.session_token`;
const SECRET = "secret-de-test-qui-ne-sert-qu-ici-0123456789";

/** The cookie Better Auth sets: `<token>.<base64 HMAC-SHA256 of the token>`, URL-encoded. */
function signedCookie(token: string, secret = SECRET, name = COOKIE): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${name}=${encodeURIComponent(`${token}.${signature}`)}`;
}

describe("revocationCauseOf — the cause of an administrator's closing", () => {
  it("none when the change closes no session", () => {
    expect(revocationCauseOf({ closesSessions: false, disabled: false, passwordReset: false })).toBeNull();
    // A re-enabling or a lab role change closes nothing (accountChangeClosesSessions).
    expect(revocationCauseOf({ closesSessions: false, disabled: false, passwordReset: true })).toBeNull();
  });

  it("the reset, the disabling (first, even with a reset), else the portal's access", () => {
    expect(revocationCauseOf({ closesSessions: true, disabled: false, passwordReset: true })).toBe("PASSWORD_RESET");
    expect(revocationCauseOf({ closesSessions: true, disabled: true, passwordReset: false })).toBe("DISABLED");
    expect(revocationCauseOf({ closesSessions: true, disabled: true, passwordReset: true })).toBe("DISABLED");
    expect(revocationCauseOf({ closesSessions: true, disabled: false, passwordReset: false })).toBe("ACCESS_CHANGED");
  });
});

describe("the sign-in page's notices", () => {
  it("one motif per cause, distinct from the idle one", () => {
    expect(revokedLoginHref("PASSWORD_RESET")).toBe("/login?motif=reinitialisation");
    expect(revokedLoginHref("DISABLED")).toBe("/login?motif=desactivation");
    expect(revokedLoginHref("ACCESS_CHANGED")).toBe("/login?motif=acces");
    expect(revokedLoginHref("PASSWORD_CHANGED")).toBe("/login?motif=changement");
    const motifs = Object.values(REVOCATION_LOGIN_MOTIFS);
    expect(new Set(motifs).size).toBe(4);
    expect(motifs).not.toContain(IDLE_LOGIN_MOTIF);
  });

  it("the reset says so, never « inactivité »", () => {
    expect(revocationNoticeFor("reinitialisation")).toBe(
      "Votre mot de passe a été réinitialisé par l'administrateur : connectez-vous avec le nouveau mot de passe."
    );
    expect(revocationNoticeFor("desactivation")).toBe("Votre compte a été désactivé par l'administrateur.");
    expect(revocationNoticeFor("acces")).toBe("Vos accès ont été modifiés par l'administrateur : connectez-vous de nouveau.");
    // The person's own change, read on their other devices: not the administrator's words.
    expect(revocationNoticeFor("changement")).toBe(
      "Votre mot de passe a été changé : connectez-vous avec le nouveau mot de passe."
    );
    for (const notice of Object.values(REVOCATION_NOTICES)) expect(notice).not.toMatch(/inactivit/i);
  });

  it("the idle motif keeps its own notice; an unknown one, an array or nothing says nothing", () => {
    expect(revocationNoticeFor(IDLE_LOGIN_MOTIF)).toBeNull();
    expect(loginNoticeFor(IDLE_LOGIN_MOTIF)).toBe("Session fermée après inactivité.");
    for (const motif of [undefined, null, "", "autre", ["reinitialisation"], "PASSWORD_RESET"]) {
      expect(revocationNoticeFor(motif), String(motif)).toBeNull();
    }
  });
});

describe("sessionTokenOfCookie — the token of Better Auth's signed cookie", () => {
  it("the part before the last dot, URL-decoded, plain or __Secure-", () => {
    expect(sessionTokenOfCookie(`${COOKIE}=tok-1.c2lnbmF0dXJl%3D`)).toBe("tok-1");
    expect(sessionTokenOfCookie(`theme=clair; __Secure-${COOKIE}=AbC123.sig%2Bnature%3D; autre=1`)).toBe("AbC123");
  });

  it("nothing without the cookie, without a value or without a signature", () => {
    for (const header of [null, undefined, "", "theme=clair", `${COOKIE}=`, `${COOKIE}=sans-signature`, `${COOKIE}=.sig`, `${COOKIE}=%E0%A4%A`]) {
      expect(sessionTokenOfCookie(header), String(header)).toBeNull();
    }
    // Another cookie named alike is not the session's.
    expect(sessionTokenOfCookie(`x${COOKIE}=tok.sig`)).toBeNull();
  });

  it("the same cookie names as carriesSessionCookie (session-idle.ts), the first one only, as Better Auth reads it", () => {
    for (const header of [signedCookie("tok-1"), `theme=clair; ${signedCookie("tok-1", SECRET, `__Secure-${COOKIE}`)}`]) {
      expect(carriesSessionCookie(header), header).toBe(true);
      expect(sessionTokenOfCookie(header), header).toBe("tok-1");
    }
    expect(sessionTokenOfCookie(`${signedCookie("tok-1")}; ${signedCookie("tok-2")}`)).toBe("tok-1");
  });
});

describe("verifiedSessionToken — the token, only under a right signature", () => {
  it("the token of a cookie signed with the auth secret, plain or __Secure-", () => {
    expect(verifiedSessionToken(signedCookie("tok-1"), SECRET)).toBe("tok-1");
    expect(verifiedSessionToken(`theme=clair; ${signedCookie("AbC123", SECRET, `__Secure-${COOKIE}`)}`, SECRET)).toBe("AbC123");
  });

  it("nothing for an unsigned, forged or otherwise signed cookie", () => {
    const forged = signedCookie("tok-1").replace("tok-1", "tok-2");
    for (const header of [
      `${COOKIE}=tok-1.sig%3D`,
      `${COOKIE}=tok-1`,
      forged,
      signedCookie("tok-1", "un-autre-secret-0123456789abcdef"),
      `${COOKIE}=${encodeURIComponent(`tok-1.${createHmac("sha256", SECRET).update("tok-1").digest("hex")}`)}`,
      "theme=clair",
      null,
    ]) {
      expect(verifiedSessionToken(header, SECRET), String(header)).toBeNull();
    }
  });
});

describe("the markers", () => {
  it("are keyed by the SHA-256 of the token, never the token itself", () => {
    const identifier = revocationMarkerIdentifier("tok-1");
    expect(identifier).toBe(`${REVOCATION_MARKER_PREFIX}${createHash("sha256").update("tok-1").digest("hex")}`);
    expect(identifier).not.toContain("tok-1");
    // Within Verification.identifier (VARCHAR 191).
    expect(identifier.length).toBeLessThanOrEqual(191);
  });

  it("one per session still valid, expiring with it, its value the cause and the account", () => {
    const later = new Date(NOW + 3 * 24 * 3600e3);
    const rows = revocationMarkers(
      [
        { token: "tok-1", expiresAt: later },
        { token: "tok-old", expiresAt: new Date(NOW - 1000) },
      ],
      "PASSWORD_RESET",
      "u-x",
      new Date(NOW)
    );
    expect(rows).toEqual([{ identifier: revocationMarkerIdentifier("tok-1"), value: "PASSWORD_RESET:u-x", expiresAt: later }]);
    // What a re-enabling looks for (PATCH /api/admin/users/[id]).
    expect(revocationMarkerValue("DISABLED", "u-x")).toBe("DISABLED:u-x");
  });

  it("liveRevocationCause: a known cause before its expiry, nothing after or otherwise", () => {
    const future = new Date(NOW + 60e3);
    expect(liveRevocationCause({ value: "DISABLED:u-x", expiresAt: future }, NOW)).toBe("DISABLED");
    expect(liveRevocationCause({ value: "PASSWORD_CHANGED:u-x", expiresAt: future.toISOString() }, NOW)).toBe("PASSWORD_CHANGED");
    // A bare cause reads the same.
    expect(liveRevocationCause({ value: "DISABLED", expiresAt: future }, NOW)).toBe("DISABLED");
    expect(liveRevocationCause({ value: "DISABLED:u-x", expiresAt: new Date(NOW) }, NOW)).toBeNull();
    expect(liveRevocationCause({ value: "autre:u-x", expiresAt: future }, NOW)).toBeNull();
    expect(liveRevocationCause({ value: "autre", expiresAt: future }, NOW)).toBeNull();
    expect(liveRevocationCause({ value: 42, expiresAt: future }, NOW)).toBeNull();
    expect(liveRevocationCause({ value: "DISABLED:u-x", expiresAt: "pas une date" }, NOW)).toBeNull();
    expect(liveRevocationCause(null, NOW)).toBeNull();
    expect(isRevocationCause("ACCESS_CHANGED")).toBe(true);
    expect(isRevocationCause("PASSWORD_CHANGED")).toBe(true);
    expect(isRevocationCause("acces")).toBe(false);
  });
});

describe("revokedSessionCause — what a page guard reads", () => {
  const cookie = signedCookie("tok-1");

  it("looks the cookie's token up by its marker's identifier", async () => {
    const find = vi.fn(async () => ({ value: "PASSWORD_RESET:u-x", expiresAt: new Date(NOW + 60e3) }));
    expect(await revokedSessionCause(cookie, find, SECRET, NOW)).toBe("PASSWORD_RESET");
    expect(find).toHaveBeenCalledWith(revocationMarkerIdentifier("tok-1"));
  });

  it("nothing — so the idle notice — without a marker, with an expired one, or when the read fails", async () => {
    expect(await revokedSessionCause(cookie, async () => null, SECRET, NOW)).toBeNull();
    expect(
      await revokedSessionCause(cookie, async () => ({ value: "PASSWORD_RESET:u-x", expiresAt: new Date(NOW - 1) }), SECRET, NOW)
    ).toBeNull();
    expect(
      await revokedSessionCause(
        cookie,
        async () => {
          throw new Error("base indisponible");
        },
        SECRET,
        NOW
      )
    ).toBeNull();
  });

  it("no session cookie, or one not signed with the secret: no read at all", async () => {
    const find = vi.fn(async () => ({ value: "DISABLED:u-x", expiresAt: new Date(NOW + 60e3) }));
    for (const header of ["theme=clair", `${COOKIE}=tok-1.sig%3D`, signedCookie("tok-1", "un-autre-secret-0123456789abcdef")]) {
      expect(await revokedSessionCause(header, find, SECRET, NOW), header).toBeNull();
    }
    expect(find).not.toHaveBeenCalled();
  });
});

describe("revokedTokenCause — what IdleLogout's touch reads (the token of a verified cookie)", () => {
  it("the marker of that token, or nothing — a failed read included", async () => {
    const find = vi.fn(async () => ({ value: "PASSWORD_CHANGED", expiresAt: new Date(NOW + 60e3) }));
    expect(await revokedTokenCause("tok-2", find, NOW)).toBe("PASSWORD_CHANGED");
    expect(find).toHaveBeenCalledWith(revocationMarkerIdentifier("tok-2"));
    expect(await revokedTokenCause("tok-2", async () => null, NOW)).toBeNull();
    expect(
      await revokedTokenCause(
        "tok-2",
        async () => {
          throw new Error("base indisponible");
        },
        NOW
      )
    ).toBeNull();
  });
});
