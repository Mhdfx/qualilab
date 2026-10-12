import { describe, expect, it } from "vitest";
import { CONSULTATION_MESSAGES } from "./client-consultation";
import { RELEASE_MESSAGES, canRelease, parseReleaseBody, releaseRefusal, waitingSince } from "./release-rules";

const now = new Date("2026-10-10T14:30:00.000Z");
const awaiting = { status: "RECU" as const, analysisBlocked: true, awaitingClientSince: new Date("2026-10-08T10:00:00.000Z") };
/** A hold that is not « en attente du client » — a destroyed sample reactivated, the retired policy. */
const adminHold = { status: "RECU" as const, analysisBlocked: true, awaitingClientSince: null };

describe("releaseRefusal — who releases which hold (A9)", () => {
  it("lets the admin release any hold", () => {
    expect(releaseRefusal("ADMIN", awaiting)).toBeNull();
    expect(releaseRefusal("ADMIN", adminHold)).toBeNull();
  });

  it("lets the reception release a sample waiting for the client, never another hold", () => {
    expect(releaseRefusal("RECEPTIONNISTE", awaiting)).toBeNull();
    expect(releaseRefusal("RECEPTIONNISTE", adminHold)).toEqual({ status: 403, error: RELEASE_MESSAGES.adminOnly });
    expect(canRelease("RECEPTIONNISTE", { ...awaiting, awaitingClientSince: "2026-10-08T10:00:00.000Z" })).toBe(true);
  });

  it("refuses every other role", () => {
    for (const role of ["PRELEVEUR", "PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "GESTIONNAIRE", "COMPTABLE"] as const) {
      expect(releaseRefusal(role, awaiting)?.status).toBe(403);
    }
  });

  it("answers 409 for a sample not held (anymore) or no longer received", () => {
    expect(releaseRefusal("ADMIN", { ...awaiting, analysisBlocked: false })).toEqual({ status: 409, error: RELEASE_MESSAGES.notBlocked });
    expect(releaseRefusal("ADMIN", { ...awaiting, status: "ANNULE" })?.status).toBe(409);
    expect(releaseRefusal("RECEPTIONNISTE", { ...awaiting, status: "PROGRAMME" })?.status).toBe(409);
  });
});

describe("parseReleaseBody — analyse or destroy, never a technician", () => {
  it("reads the decision, the agreement (analysis only) and the reason", () => {
    const analyse = parseReleaseBody(
      { decision: "ANALYSER", consultation: { name: "M. Exemple", channel: "TELEPHONE" }, reason: " Le client confirme " },
      now
    );
    expect(analyse).toEqual({
      ok: true,
      value: {
        decision: "ANALYSER",
        consultation: { name: "M. Exemple", channel: "TELEPHONE", at: now, note: null },
        reason: "Le client confirme",
        legacy: false,
      },
    });
    const destroy = parseReleaseBody({ decision: "DETRUIRE", consultation: { name: "ignoré" } }, now);
    expect(destroy).toEqual({ ok: true, value: { decision: "DETRUIRE", consultation: null, reason: null, legacy: false } });
  });

  it("reads the old body { technicianId } as an analysis and drops the technician", () => {
    const legacy = parseReleaseBody({ technicianId: "t1" }, now);
    expect(legacy).toEqual({ ok: true, value: { decision: "ANALYSER", consultation: null, reason: null, legacy: true } });
    expect(legacy.ok && legacy.value).not.toHaveProperty("technicianId");
  });

  it("refuses no decision, an unknown one, a half agreement and a reason too long", () => {
    expect(parseReleaseBody({}, now)).toEqual({ ok: false, error: RELEASE_MESSAGES.decision });
    expect(parseReleaseBody(null, now)).toEqual({ ok: false, error: RELEASE_MESSAGES.decision });
    expect(parseReleaseBody({ decision: "EN_ATTENTE_CLIENT" }, now)).toEqual({ ok: false, error: RELEASE_MESSAGES.decision });
    expect(parseReleaseBody({ decision: "ANALYSER", consultation: { name: "M. Exemple" } }, now)).toEqual({
      ok: false,
      error: CONSULTATION_MESSAGES.incomplete,
    });
    expect(parseReleaseBody({ decision: "DETRUIRE", reason: "x".repeat(2001) }, now)).toEqual({
      ok: false,
      error: RELEASE_MESSAGES.reasonTooLong,
    });
  });
});

describe("waitingSince — « en attente du client depuis 2 j »", () => {
  it("reads minutes, hours, then days", () => {
    expect(waitingSince(new Date("2026-10-10T14:29:40.000Z"), now)).toBe("depuis moins d'une minute");
    expect(waitingSince(new Date("2026-10-10T14:10:00.000Z"), now)).toBe("depuis 20 min");
    expect(waitingSince(new Date("2026-10-10T09:00:00.000Z"), now)).toBe("depuis 5 h");
    expect(waitingSince(awaiting.awaitingClientSince, now)).toBe("depuis 2 j");
    expect(waitingSince("2026-10-10T15:00:00.000Z", now)).toBe("depuis moins d'une minute");
  });
});
