import { describe, expect, it } from "vitest";
import {
  SIGN_IN_FALLBACK_WAIT_S,
  SIGN_IN_LOCKED_CODE,
  retryAfterFromHeaders,
  signInErrorMessage,
  waitPhrase,
} from "./sign-in-errors";

describe("signInErrorMessage — the sign-in form says why it refused", () => {
  it("a 429 of the shared address: the network, and how long to wait", () => {
    expect(signInErrorMessage({ status: 429 }, 7)).toBe(
      "Trop de tentatives de connexion depuis ce réseau. Réessayez dans 7 secondes."
    );
    expect(signInErrorMessage({ status: 429 }, 1)).toBe(
      "Trop de tentatives de connexion depuis ce réseau. Réessayez dans 1 seconde."
    );
  });

  it("a 429 without a readable wait falls back to Better Auth's 10 s window", () => {
    expect(SIGN_IN_FALLBACK_WAIT_S).toBe(10);
    expect(signInErrorMessage({ status: 429 })).toBe(
      "Trop de tentatives de connexion depuis ce réseau. Réessayez dans 10 secondes."
    );
  });

  it("a 429 of the per-account limit: the account, in minutes", () => {
    expect(signInErrorMessage({ status: 429, code: SIGN_IN_LOCKED_CODE }, 840)).toBe(
      "Trop de mots de passe erronés pour ce compte. Réessayez dans 14 minutes."
    );
  });

  it("« Identifiants incorrects. » only for a wrong username or password", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_USERNAME_OR_PASSWORD" })).toBe("Identifiants incorrects.");
    expect(signInErrorMessage({ status: 401 })).toBe("Identifiants incorrects.");
    // A username the endpoint rejects outright is a wrong username too.
    expect(signInErrorMessage({ status: 422, code: "USERNAME_TOO_SHORT" })).toBe("Identifiants incorrects.");
    expect(signInErrorMessage({ status: 422, code: "INVALID_USERNAME" })).toBe("Identifiants incorrects.");
  });

  it("a disabled account says so", () => {
    expect(signInErrorMessage({ status: 403, code: "BANNED_USER" })).toBe(
      "Ce compte est désactivé. Contactez l'administrateur."
    );
  });

  it("anything else — server error, network failure — is not blamed on the password", () => {
    expect(signInErrorMessage({ status: 500 })).toBe("Connexion impossible pour le moment. Réessayez.");
    expect(signInErrorMessage({ status: 403, code: "INVALID_ORIGIN" })).toBe(
      "Connexion impossible pour le moment. Réessayez."
    );
    expect(signInErrorMessage({})).toBe("Connexion impossible pour le moment. Réessayez.");
  });
});

describe("retryAfterFromHeaders", () => {
  it("reads Better Auth's X-Retry-After, then Retry-After", () => {
    expect(retryAfterFromHeaders(new Headers({ "X-Retry-After": "6" }))).toBe(6);
    expect(retryAfterFromHeaders(new Headers({ "Retry-After": "120" }))).toBe(120);
    expect(retryAfterFromHeaders(new Headers({ "X-Retry-After": "3", "Retry-After": "9" }))).toBe(3);
  });

  it("falls back to 10 s when there is no usable value", () => {
    expect(retryAfterFromHeaders(null)).toBe(10);
    expect(retryAfterFromHeaders(new Headers())).toBe(10);
    expect(retryAfterFromHeaders(new Headers({ "X-Retry-After": "0" }))).toBe(10);
    expect(retryAfterFromHeaders(new Headers({ "X-Retry-After": "-2" }))).toBe(10);
    expect(retryAfterFromHeaders(new Headers({ "X-Retry-After": "bientôt" }))).toBe(10);
  });
});

describe("waitPhrase", () => {
  it("seconds under a minute, minutes (rounded up) from one minute", () => {
    expect(waitPhrase(0)).toBe("1 seconde");
    expect(waitPhrase(2)).toBe("2 secondes");
    expect(waitPhrase(59)).toBe("59 secondes");
    expect(waitPhrase(60)).toBe("1 minute");
    expect(waitPhrase(61)).toBe("2 minutes");
  });
});
