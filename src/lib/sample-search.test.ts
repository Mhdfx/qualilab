import { describe, expect, it } from "vitest";
import { SIEGE, parseSampleSearch, sampleConclusion, sampleSearchWhere, searchQueryString } from "./sample-search";

const parse = (query: string) => parseSampleSearch(new URLSearchParams(query));

describe("parseSampleSearch", () => {
  it("reads client, nature, state, date field and the period", () => {
    const s = parse("q=%20thon%20&client=c1&nature=n1&etat=terminees&date=prelevement&du=2026-09-01&au=2026-09-30");
    expect(s).toMatchObject({ q: "thon", clientId: "c1", natureId: "n1", state: "terminees", dateField: "prelevement" });
    expect(s.from?.getDate()).toBe(1);
    expect(s.to?.getHours()).toBe(23);
  });

  it("ignores what it cannot read and turns a backwards period around", () => {
    const s = parse("etat=peut-etre&du=hier&au=2026-13-45");
    expect(s).toMatchObject({ state: null, from: null, to: null, dateField: "reception" });
    const back = parse("du=2026-09-30&au=2026-09-01");
    expect(back.from!.getDate()).toBe(1);
    expect(back.to!.getDate()).toBe(30);
  });

  it("round-trips through the query string", () => {
    const s = parse("client=c1&site=s1&etat=en_cours&du=2026-09-01&au=2026-09-30");
    expect(parse(searchQueryString(s))).toEqual(s);
    expect(searchQueryString(s, { page: "2" })).toContain("page=2");
  });

  it("reads the site only once a client is chosen", () => {
    expect(parse("client=c1&site=s1")).toMatchObject({ clientId: "c1", siteId: "s1" });
    expect(parse("client=c1&site=siege").siteId).toBe(SIEGE);
    expect(parse("site=s1").siteId).toBeNull();
    expect(parse("client=c1&site=").siteId).toBeNull();
  });
});

describe("sampleSearchWhere", () => {
  it("filters by state, period on the chosen date, client and nature", () => {
    const where = sampleSearchWhere(parse("client=c1&nature=n1&etat=en_cours&du=2026-09-01"));
    expect(where).toMatchObject({ clientId: "c1", natureId: "n1", status: { in: ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] } });
    expect(where).toHaveProperty("receivedAt.gte");
    expect(sampleSearchWhere(parse("date=prelevement&au=2026-09-30"))).toHaveProperty("sampledAt.lte");
    expect(sampleSearchWhere(parse("etat=annulees"))).toMatchObject({ status: "ANNULE" });
  });

  it("narrows a client to one site, or to its séries without a site", () => {
    expect(sampleSearchWhere(parse("client=c1&site=s1"))).toMatchObject({ clientId: "c1", serie: { siteId: "s1" } });
    expect(sampleSearchWhere(parse("client=c1&site=siege"))).toMatchObject({ clientId: "c1", serie: { siteId: null } });
    expect(sampleSearchWhere(parse("client=c1"))).not.toHaveProperty("serie");
  });

  it("finds a sample by the name of its site", () => {
    expect(JSON.stringify(sampleSearchWhere(parse("q=Essai")))).toContain('"site":{"name":{"contains":"Essai"}}');
  });

  it("never searches the N° de contrôle for the préleveur", () => {
    const lab = JSON.stringify(sampleSearchWhere(parse("q=00012"), {}));
    const blind = JSON.stringify(sampleSearchWhere(parse("q=00012"), { blind: true }));
    expect(lab).toContain("controlCode");
    expect(blind).not.toContain("controlCode");
  });
});

describe("sampleConclusion", () => {
  const done = { status: "RAPPORT_ENVOYE" as const, report: null };
  it("prints the official verdict, the indicative one, or the old reading", () => {
    expect(sampleConclusion({ ...done, report: { interpretation: "ACCEPTABLE" }, results: [] })).toEqual({ label: "Acceptable", tone: "mid" });
    expect(
      sampleConclusion({ ...done, results: [{ interpretation: null, conform: null, informalInterpretation: "NON_SATISFAISANT" }] })
    ).toEqual({ label: "Non satisfaisant (indicatif)", tone: "no" });
    expect(sampleConclusion({ ...done, results: [{ interpretation: null, conform: false }] }).label).toBe("Non satisfaisant");
    expect(sampleConclusion({ ...done, results: [{ interpretation: null, conform: true }] })).toEqual({ label: "Conforme", tone: "ok" });
    expect(sampleConclusion({ ...done, results: [{ interpretation: null, conform: null }] }).label).toBe("Sans interprétation");
  });

  it("says « En cours » before validation and « Annulé » for a cancelled line", () => {
    expect(sampleConclusion({ status: "EN_ANALYSE", report: null, results: [] }).label).toBe("En cours");
    expect(sampleConclusion({ status: "ANNULE", report: null, results: [] }).label).toBe("Annulé");
  });
});
