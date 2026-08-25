import { describe, it, expect } from "vitest";
import {
  validateClient,
  validateClientEmails,
  isEmail,
  isIce,
} from "./client-validation";

describe("isEmail", () => {
  it("accepts the addresses a laboratory actually writes to", () => {
    expect(isEmail("contact@lepalmier.ma")).toBe(true);
    expect(isEmail("qualite.labo@agro-maroc.co.ma")).toBe(true);
  });

  it("refuses what would never deliver", () => {
    for (const bad of ["contact", "contact@", "@lepalmier.ma", "a@b", "a b@c.ma", ""]) {
      expect(isEmail(bad), bad).toBe(false);
    }
  });
});

describe("isIce", () => {
  it("accepts the 15 digits of a Moroccan ICE, spaced or not", () => {
    expect(isIce("001234567000045")).toBe(true);
    expect(isIce("001234567 000045")).toBe(true);
  });

  it("refuses anything that is not 15 digits", () => {
    expect(isIce("12345")).toBe(false);
    expect(isIce("0012345670000456")).toBe(false);
    expect(isIce("00123456700004X")).toBe(false);
  });
});

describe("validateClient", () => {
  it("requires a raison sociale", () => {
    const result = validateClient({ name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("raison sociale");
  });

  it("trims and keeps the optional fields as null rather than empty strings", () => {
    const result = validateClient({ name: "  Restaurant Le Palmier  ", contact: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Restaurant Le Palmier");
      // null, not "", so the interface can say "non renseigné".
      expect(result.value.contact).toBeNull();
      expect(result.value.ice).toBeNull();
    }
  });

  it("refuses an email that would never deliver a report", () => {
    const result = validateClient({ name: "Client", email: "pas-une-adresse" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("email");
  });

  it("refuses a malformed ICE, since it is printed on the invoice", () => {
    const result = validateClient({ name: "Client", ice: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("15 chiffres");
  });

  it("normalises the ICE by removing the spaces", () => {
    const result = validateClient({ name: "Client", ice: "001234567 000045" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ice).toBe("001234567000045");
  });
});

describe("validateClientEmails", () => {
  it("keeps a list and lowercases the addresses", () => {
    const result = validateClientEmails([
      { email: "Contact@Lepalmier.ma", label: "Qualité" },
      { email: "direction@lepalmier.ma", forReports: false },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].email).toBe("contact@lepalmier.ma");
      expect(result.value[0].forReports).toBe(true);
      // Explicitly excluded from reports, still receives alerts.
      expect(result.value[1].forReports).toBe(false);
      expect(result.value[1].forAlerts).toBe(true);
    }
  });

  it("refuses a duplicate, which would mail the client twice", () => {
    const result = validateClientEmails([
      { email: "contact@lepalmier.ma" },
      { email: "CONTACT@lepalmier.ma" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("double");
  });

  it("refuses an invalid address rather than dropping it silently", () => {
    const result = validateClientEmails([{ email: "cassé@" }]);
    expect(result.ok).toBe(false);
  });

  it("ignores empty rows left by the form", () => {
    const result = validateClientEmails([{ email: "" }, { email: "  " }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("treats a missing list as no list", () => {
    expect(validateClientEmails(undefined)).toEqual({ ok: true, value: [] });
  });
});
