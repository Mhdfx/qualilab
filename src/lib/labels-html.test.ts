import { describe, expect, it } from "vitest";
import { buildLabelsHtml, labelUnits, type LabelLine } from "./labels-html";

const hands: LabelLine = {
  controlCode: "28/26",
  unitCount: 2,
  natureLabel: "Microbiologie des surfaces",
  designation: "Youssef",
  receivedAt: new Date("2026-10-08T10:00:00Z"),
};

const water: LabelLine = {
  controlCode: "29/26",
  unitCount: 1,
  natureLabel: "Eau de consommation",
  designation: "Robinet cuisine",
  receivedAt: new Date("2026-10-08T10:00:00Z"),
};

describe("labelUnits — one label per unit, in bench order", () => {
  it("numbers the units R1 … Rn and puts the repetition in the barcode", () => {
    const units = labelUnits([hands, water]);
    expect(units.map((u) => [u.repetition, u.barcodeText])).toEqual([
      ["R1", "28/26-R1"],
      ["R2", "28/26-R2"],
      [null, "29/26"],
    ]);
  });
});

describe("buildLabelsHtml — what the bench reads", () => {
  const html = buildLabelsHtml("21/26", [hands, water]);

  it("keeps the nature, the date, the N° de contrôle, the unit, the barcode, the designation and the série", () => {
    expect(html).toContain("Microbiologie des surfaces");
    expect(html).toContain("08/10/2026");
    expect(html).toContain(`<span class="number">28/26</span>`);
    expect(html).toContain(`<span class="rep">R2</span>`);
    expect(html.match(/<svg/g)).toHaveLength(3);
    expect(html).toContain(`<div class="designation">Youssef</div>`);
    expect(html.match(/série 21\/26<\/div>/g)).toHaveLength(3);
  });

  it("never names the client nor the site of the prélèvement (blind numbering)", () => {
    // Whatever the caller hands over, the label does not print who the sample belongs to.
    const withOwner = { ...hands, clientName: "Boulangerie des Tests", siteName: "Atelier Fictif" };
    const blind = buildLabelsHtml("21/26", [withOwner, water]);
    expect(blind).not.toContain("Boulangerie des Tests");
    expect(blind).not.toContain("Atelier Fictif");
    expect(blind).not.toContain(`class="client"`);
    expect(blind).not.toContain(" · ");
  });

  it("escapes what comes from the database", () => {
    const tricky = buildLabelsHtml("21/26", [{ ...water, designation: "Bac <B> & co" }]);
    expect(tricky).toContain("Bac &lt;B&gt; &amp; co");
  });

  it("fills A4 sheets of 24 labels", () => {
    const many = buildLabelsHtml("21/26", [{ ...hands, unitCount: 25 }]);
    expect(many.match(/<section class="sheet">/g)).toHaveLength(2);
    expect(many.match(/<div class="label">/g)).toHaveLength(25);
  });
});
