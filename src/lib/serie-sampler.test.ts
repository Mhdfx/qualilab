import { describe, expect, it } from "vitest";
import { qualilabSampler, SAMPLER_MESSAGES } from "./serie-sampler";

const preleveur = { id: "pre-1", role: "PRELEVEUR" as const };

describe("qualilabSampler — « Prélèvement effectué par » un préleveur Qualilab", () => {
  it("names the préleveur himself, with or without the form naming him", () => {
    expect(qualilabSampler(null, preleveur)).toEqual({ ok: true, samplerUserId: "pre-1", checkAccount: false });
    expect(qualilabSampler("pre-1", preleveur)).toEqual({ ok: true, samplerUserId: "pre-1", checkAccount: false });
  });

  it("refuses a préleveur entering a colleague's samples (29/09, point 13)", () => {
    expect(qualilabSampler("pre-2", preleveur)).toEqual({ ok: false, error: SAMPLER_MESSAGES.ownAccount });
  });

  it("never falls back to the receptionist or the admin keying in a protocol (D-05, 16/10)", () => {
    for (const role of ["RECEPTIONNISTE", "ADMIN"] as const) {
      expect(qualilabSampler(null, { id: "author-1", role })).toEqual({ ok: false, error: SAMPLER_MESSAGES.missing });
    }
  });

  it("takes the préleveur the réception names, his account still to be checked", () => {
    expect(qualilabSampler("pre-2", { id: "recep-1", role: "RECEPTIONNISTE" })).toEqual({
      ok: true,
      samplerUserId: "pre-2",
      checkAccount: true,
    });
  });

  it("checks the author's own account when he names himself — a receptionist is not a sampler", () => {
    expect(qualilabSampler("admin-1", { id: "admin-1", role: "ADMIN" })).toEqual({
      ok: true,
      samplerUserId: "admin-1",
      checkAccount: true,
    });
  });
});
