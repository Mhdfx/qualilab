import { describe, expect, it } from "vitest";
import { validateProfile } from "./profile-input";
import { validateSite } from "./site-input";

describe("validateProfile", () => {
  it("accepts a named panel with its parameters and defaults", () => {
    const result = validateProfile({ name: " Micro aliments standard ", natureId: "nat_micro_aliments", parameterIds: ["p1", "p1", "p2"] });
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Micro aliments standard",
        natureId: "nat_micro_aliments",
        clientId: null,
        unitCount: 1,
        parameterIds: ["p1", "p2"],
        active: true,
        sortOrder: 0,
      },
    });
  });

  it("refuses an empty panel, a nameless profile, an odd unit count", () => {
    expect(validateProfile({ name: "X", natureId: "n", parameterIds: [] })).toMatchObject({ ok: false });
    expect(validateProfile({ natureId: "n", parameterIds: ["p"] })).toMatchObject({ ok: false, error: "Donnez un nom au profil." });
    expect(validateProfile({ name: "X", natureId: "n", parameterIds: ["p"], unitCount: 40 })).toMatchObject({ ok: false });
    expect(validateProfile({ name: "X", natureId: "n", parameterIds: ["p"], unitCount: "9", clientId: "c1", active: false })).toMatchObject({
      ok: true,
      value: { unitCount: 9, clientId: "c1", active: false },
    });
  });
});

describe("validateSite", () => {
  it("keeps the name and trims the optional fields", () => {
    expect(validateSite({ name: " Cuisine centrale ", city: "Casablanca ", phone: "" })).toEqual({
      ok: true,
      value: { name: "Cuisine centrale", code: null, address: null, city: "Casablanca", phone: null, contact: null, active: true },
    });
    expect(validateSite({ name: "" })).toMatchObject({ ok: false, error: "Le nom du site est obligatoire." });
  });
});
