import { describe, expect, it } from "vitest";
import { IMAGE_MAX_CHARS, readImageField } from "./image-upload";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("readImageField (K4: the accreditation logo and the stamp)", () => {
  it("leaves an absent field unchanged and reads null or empty as removed", () => {
    expect(readImageField({}, "stampData", "Cachet")).toEqual({ ok: true, value: undefined });
    expect(readImageField({ stampData: undefined }, "stampData", "Cachet")).toEqual({ ok: true, value: undefined });
    expect(readImageField({ stampData: null }, "stampData", "Cachet")).toEqual({ ok: true, value: null });
    expect(readImageField({ stampData: "" }, "stampData", "Cachet")).toEqual({ ok: true, value: null });
  });

  it("accepts a PNG, JPEG, SVG or WebP data URI", () => {
    expect(readImageField({ stampData: PNG }, "stampData", "Cachet")).toEqual({ ok: true, value: PNG });
    for (const type of ["jpeg", "jpg", "svg+xml", "webp"]) {
      const value = `data:image/${type};base64,QUJD`;
      expect(readImageField({ logo: value }, "logo", "Logo")).toEqual({ ok: true, value });
    }
  });

  it("refuses anything that could close the <img src> of a PDF template, or another type", () => {
    for (const value of [
      'data:image/png;base64,QUJD" onerror="alert(1)',
      "data:image/png;base64,QU JD",
      "data:image/gif;base64,QUJD",
      "data:text/html;base64,QUJD",
      "https://example.test/logo.png",
      42,
    ]) {
      const read = readImageField({ stampData: value }, "stampData", "Cachet");
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.error).toBe("Cachet invalide — PNG, JPEG, SVG ou WebP attendu.");
    }
  });

  it("refuses a file over 300 KB", () => {
    const heavy = `data:image/png;base64,${"A".repeat(IMAGE_MAX_CHARS)}`;
    expect(readImageField({ stampData: heavy }, "stampData", "Cachet")).toEqual({ ok: false, error: "Cachet trop lourd — 300 Ko maximum." });
  });
});
