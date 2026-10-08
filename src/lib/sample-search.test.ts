import { describe, expect, it } from "vitest";
import {
  EMPTY_SAMPLE_SEARCH,
  SIEGE,
  parseSampleSearch,
  rechercheHref,
  sampleConclusion,
  sampleSearchWhere,
  searchQueryString,
} from "./sample-search";
import { formatIsoDay } from "./labels";

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

describe("étape, domaine et rapport — the dashboards' links (« comme un tri »)", () => {
  it("reads one exact step, the domain and « avec rapport »", () => {
    expect(parse("statut=RECU&type=EAU&rapport=1")).toMatchObject({ status: "RECU", type: "EAU", withReport: true });
    expect(parse("statut=ANNULE").status).toBe("ANNULE");
  });

  it("ignores an unknown step or domain, and any other « rapport » value", () => {
    expect(parse("statut=recu&type=eau&rapport=oui")).toMatchObject({ status: null, type: null, withReport: false });
    expect(parse("statut=toString&type=constructor")).toMatchObject({ status: null, type: null });
    expect(parse("").withReport).toBe(false);
  });

  it("lets the exact step take precedence over the group of steps", () => {
    const s = parse("etat=terminees&statut=EN_ANALYSE");
    expect(s).toMatchObject({ state: null, status: "EN_ANALYSE" });
    expect(sampleSearchWhere(s)).toMatchObject({ status: "EN_ANALYSE" });
    expect(searchQueryString(s)).toBe("statut=EN_ANALYSE");
    // An unreadable step leaves the state alone.
    expect(parse("etat=terminees&statut=x").state).toBe("terminees");
  });

  it("filters on the status, the domain and the presence of a report", () => {
    expect(sampleSearchWhere(parse("statut=VALIDE"))).toMatchObject({ status: "VALIDE" });
    expect(sampleSearchWhere(parse("type=AMBIANCE"))).toMatchObject({ type: "AMBIANCE" });
    expect(sampleSearchWhere(parse("client=c1&rapport=1"))).toMatchObject({ clientId: "c1", report: { isNot: null } });
    const none = sampleSearchWhere(parse(""));
    expect(none).not.toHaveProperty("status");
    expect(none).not.toHaveProperty("type");
    expect(none).not.toHaveProperty("report");
  });

  it("writes them back, so pagination and the export keep them", () => {
    const s = parse("statut=RAPPORT_ENVOYE&type=ALIMENTAIRE&rapport=1&client=c1");
    expect(parse(searchQueryString(s))).toEqual(s);
    expect(searchQueryString(s)).toContain("statut=RAPPORT_ENVOYE");
    expect(searchQueryString(s)).toContain("type=ALIMENTAIRE");
    expect(searchQueryString(s)).toContain("rapport=1");
  });

  it("is the empty search when nothing is asked", () => {
    expect(parse("")).toEqual(EMPTY_SAMPLE_SEARCH);
    expect(searchQueryString(EMPTY_SAMPLE_SEARCH)).toBe("");
  });
});

describe("rechercheHref", () => {
  it("is the bare search screen without a filter", () => {
    expect(rechercheHref()).toBe("/recherche");
    expect(rechercheHref({})).toBe("/recherche");
  });

  it("opens one step, one domain, one client's reports", () => {
    expect(rechercheHref({ status: "RECU" })).toBe("/recherche?statut=RECU");
    expect(rechercheHref({ state: "en_cours" })).toBe("/recherche?etat=en_cours");
    expect(rechercheHref({ type: "EAU" })).toBe("/recherche?type=EAU");
    expect(rechercheHref({ clientId: "c1", withReport: true })).toBe("/recherche?client=c1&rapport=1");
  });

  it("writes the step only when both a step and a state are given", () => {
    expect(rechercheHref({ state: "terminees", status: "VALIDE" })).toBe("/recherche?statut=VALIDE");
  });

  it("drops a site given without its client", () => {
    expect(rechercheHref({ siteId: "s1" })).toBe("/recherche");
    expect(rechercheHref({ clientId: "c1", siteId: SIEGE })).toBe("/recherche?client=c1&site=siege");
  });

  it("writes the days on the laboratory's clock, on the chosen date", () => {
    const today = new Date();
    expect(rechercheHref({ from: today, to: today })).toBe(`/recherche?du=${formatIsoDay(today)}&au=${formatIsoDay(today)}`);
    expect(rechercheHref({ type: "EAU", dateField: "prelevement", from: "2026-10-01" })).toBe(
      "/recherche?type=EAU&date=prelevement&du=2026-10-01"
    );
    expect(rechercheHref({ dateField: "reception", from: "2026-10-01" })).toBe("/recherche?du=2026-10-01");
  });

  it("is read back by the search screen as the same filters", () => {
    const href = rechercheHref({ status: "EN_ANALYSE", type: "AMBIANCE", dateField: "prelevement", from: "2026-10-01", to: "2026-10-31" });
    const s = parseSampleSearch(new URL(href, "http://localhost").searchParams);
    expect(s).toMatchObject({ status: "EN_ANALYSE", type: "AMBIANCE", dateField: "prelevement" });
    expect(s.from?.getDate()).toBe(1);
    expect(s.to?.getDate()).toBe(31);
    expect(sampleSearchWhere(s)).toHaveProperty("sampledAt.gte");
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
