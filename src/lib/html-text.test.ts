import { describe, expect, it } from "vitest";
import { escapeHtml, show, withSuperscripts } from "./html-text";

describe("printed text", () => {
  it("escapes what a user typed", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("renders a superscript the container's font cannot draw", () => {
    // Liberation Sans has no ⁴: without this, the limit printed as "1.10 UFC/g".
    expect(show("1.10⁴ UFC/g")).toBe("1.10<sup>4</sup> UFC/g");
  });

  it("renders the superscripts the font does have, for one consistent look", () => {
    expect(show("1.10² UFC/g")).toBe("1.10<sup>2</sup> UFC/g");
    expect(show("2,0.10³ UFC/g")).toBe("2,0.10<sup>3</sup> UFC/g");
  });

  it("groups a run of superscript characters into a single tag", () => {
    expect(withSuperscripts("10⁻¹²")).toBe("10<sup>-12</sup>");
  });

  it("leaves ordinary text alone", () => {
    expect(show("Absence /25 g")).toBe("Absence /25 g");
  });

  it("never lets user markup through the superscript pass", () => {
    expect(show("<b>10⁴</b>")).toBe("&lt;b&gt;10<sup>4</sup>&lt;/b&gt;");
  });

  it("renders an em dash for a missing value", () => {
    expect(show(null)).toBe("—");
    expect(show("")).toBe("—");
  });
});
