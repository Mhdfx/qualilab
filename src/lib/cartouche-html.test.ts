import { afterEach, describe, expect, it, vi } from "vitest";
import { CARTOUCHE_INK, cartoucheMargin, cartoucheTemplate, pageCss } from "./cartouche-html";
import { emptyReference, type DocumentRef } from "./document-types";

const BON: DocumentRef = {
  docType: "BON_RECEPTION",
  reference: "PG05/EN04",
  version: "G",
  createdOn: new Date(Date.UTC(2006, 0, 5)),
  updatedOn: new Date(Date.UTC(2024, 9, 1)),
};
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** The visible text of the template, tags dropped, as pdftotext reads the printed cartouche. */
function textOf(html: string) {
  return html
    .replace(/<br>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("cartoucheTemplate — the paper's grid (PG05/EN04 version G)", () => {
  const html = cartoucheTemplate({ title: "Bon de réception", reference: BON, logoDataUri: LOGO });

  it("prints the paper's labels, in its order and its case", () => {
    expect(textOf(html)).toBe(
      "Bon de réception Version G Page sur Réf : PG05/EN04 Date de création 05/01/2006 Dernière mise à jour 01/10/2024"
    );
    expect(html).not.toContain("text-transform");
    expect(html).not.toContain("—");
  });

  it("numbers the pages « Page n sur N » through Chromium's own fields", () => {
    expect(html).toContain('Page <span class="pageNumber"></span> sur <span class="totalPages"></span>');
  });

  it("lays out one grid: the logo over two rows, the version over the two dates", () => {
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html.match(/<col /g)).toHaveLength(4);
    expect(html.match(/<tr>/g)).toHaveLength(2);
    expect(html).toMatch(/<td rowspan="2"[^>]*><img src="data:image\/png;base64,/);
    expect(html).toMatch(/<td colspan="2"[^>]*>Version G<br>Page /);
    expect(html).toMatch(/>Date de création<br>05\/01\/2006<\/td>/);
    expect(html).toMatch(/>Dernière mise à jour<br>01\/10\/2024<\/td>/);
  });

  it("styles everything inline, in the paper's navy, with colours kept in print", () => {
    // A header template inherits nothing from the page.
    expect(html).not.toContain("<style");
    expect(html.match(/class="/g)).toHaveLength(2); // pageNumber and totalPages only
    expect(html).toContain(`border:1px solid ${CARTOUCHE_INK}`);
    expect(html).toContain("-webkit-print-color-adjust:exact");
  });

  it("is inset by the page's own side margins", () => {
    const margin = cartoucheMargin();
    expect(html).toContain(`padding:2mm ${margin.left} 0`);
    expect(margin.left).toBe(margin.right);
  });
});

describe("cartoucheTemplate — values", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves a missing value blank, never « — »", () => {
    const html = cartoucheTemplate({ title: "Rapport d'analyse", reference: emptyReference("RAPPORT"), logoDataUri: null });
    expect(textOf(html)).toBe("Rapport d'analyse Version Page sur Réf : Date de création Dernière mise à jour");
    expect(html).not.toContain("—");
    expect(html).not.toContain("<img");
  });

  it("prints the dates « JJ/MM/AAAA » from their calendar day, whatever the zone", () => {
    // A zone behind UTC sees the UTC midnight of 01/10 as the evening of 30/09.
    vi.stubEnv("TZ", "America/New_York");
    expect(new Date(Date.UTC(2024, 9, 1)).getDate()).toBe(30);
    const html = cartoucheTemplate({ title: "Bon de réception", reference: BON, logoDataUri: null });
    expect(html).toContain("05/01/2006");
    expect(html).toContain("01/10/2024");
  });

  it("escapes every text it prints", () => {
    const html = cartoucheTemplate({
      title: "Bon <b>&</b>",
      reference: { ...BON, reference: '<img src=x onerror="alert(1)">', version: "<i>" },
      logoDataUri: null,
    });
    expect(html).toContain("Bon &lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).toContain("Réf : &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Version &lt;i&gt;");
    expect(html).not.toContain("<img");
  });

  it("takes an image data URI only for the logo", () => {
    for (const logo of ['data:image/png;base64,AAAA" onload="alert(1)', "https://example.com/logo.png", "javascript:alert(1)"]) {
      expect(cartoucheTemplate({ title: "Bon de réception", reference: BON, logoDataUri: logo })).not.toContain("<img");
    }
  });
});

describe("the page box under the cartouche", () => {
  it("declares in @page the same margins the PDF is printed with", () => {
    expect(pageCss(cartoucheMargin())).toBe("@page { size: A4; margin: 34mm 12mm 12mm 12mm; }");
    expect(pageCss(cartoucheMargin({ footer: true }))).toBe("@page { size: A4; margin: 34mm 12mm 16mm 12mm; }");
  });
});
