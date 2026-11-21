import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BENCH_ORDER,
  DEFAULT_TAKE_SORT,
  TAKE_SORTS,
  TAKE_SORT_PARAM,
  compareTakeOrder,
  parseTakeSort,
  takeListDescription,
  takeListOrder,
  takeListRows,
  takeOrderBy,
  takeSortQuery,
  truncatedTakeNotice,
  type TakeOrderKeys,
} from "./bench-order";
import { TAKE_LIST_BY_NUMBER, TAKE_LIST_URGENT_FIRST } from "./lab-proposals";
import { receivedAgeHref } from "./received-age";

/**
 * Lot 5A, J8 — « À prendre » by N° de série, or by N° de contrôle (Q106 of
 * 20/11: « par n° de série ou code d'échantillon »).
 */

const at = (minute: number) => new Date(Date.UTC(2026, 10, 21, 8, minute));

/**
 * Samples as the counters draw their numbers: a série number at the série's
 * creation (one after the other), a control number at the reception. The
 * strings are what an alphabetical sort would get wrong.
 */
const sample = (
  serie: string,
  serieCreatedMinute: number,
  lineNumber: number,
  controlCode: string,
  receivedMinute: number,
  year = 2026
): TakeOrderKeys & { serie: { serialNumber: string; year: number; createdAt: Date }; controlCode: string } => ({
  id: `${serie}-${lineNumber}`,
  code: String(lineNumber),
  lineNumber,
  receivedAt: at(receivedMinute),
  controlCode,
  serie: { serialNumber: serie, year, createdAt: at(serieCreatedMinute) },
});

describe("parseTakeSort — the order asked for in the address", () => {
  it("is the N° de série by default, the N° de contrôle on « ?tri=controle »", () => {
    expect(TAKE_SORT_PARAM).toBe("tri");
    expect(DEFAULT_TAKE_SORT).toBe("serie");
    expect(parseTakeSort(undefined)).toBe("serie");
    expect(parseTakeSort("controle")).toBe("controle");
    expect(parseTakeSort(["controle", "serie"])).toBe("controle");
    expect(parseTakeSort("CONTROLE")).toBe("serie");
    expect(parseTakeSort("priorite")).toBe("serie");
    expect(TAKE_SORTS).toEqual({ serie: "N° de série", controle: "N° de contrôle" });
  });

  it("keeps only a choice other than the default in the links", () => {
    expect(takeSortQuery("serie")).toEqual({});
    expect(takeSortQuery("controle")).toEqual({ tri: "controle" });
    expect(receivedAgeHref("/technicien", "a_prendre", 3, "analyses", takeSortQuery("controle"))).toBe(
      "/technicien?vue=a_prendre&recus=3&tri=controle#analyses"
    );
    expect(receivedAgeHref("/technicien", null, null, "a-prendre", takeSortQuery("serie"))).toBe("/technicien#a-prendre");
  });
});

describe("takeOrderBy — the numeric order of the counters, never the alphabetical one", () => {
  // Drawn in this order: 9/26, 10/26, 99/26, 100/26, 1000/26; then, the
  // counter jumped (Q19), 5001/26. Their control numbers in reception order.
  const drawn = [
    sample("9/26", 1, 1, "9/26", 10),
    sample("10/26", 2, 1, "10/26", 11),
    sample("10/26", 2, 2, "11/26", 11),
    sample("99/26", 3, 1, "99/26", 12),
    sample("100/26", 4, 1, "100/26", 13),
    sample("1000/26", 5, 1, "1000/26", 14),
    sample("5001/26", 6, 1, "40001/26", 15),
  ];
  const shuffled = [drawn[5], drawn[3], drawn[0], drawn[6], drawn[2], drawn[4], drawn[1]];

  it("by N° de série: 9/26, 10/26 (its two samples in line order), 99/26, 100/26, 1000/26, then after the jump 5001/26", () => {
    const sorted = [...shuffled].sort((a, b) => compareTakeOrder("serie", a, b));
    expect(sorted.map((row) => `${row.serie.serialNumber}#${row.lineNumber}`)).toEqual([
      "9/26#1",
      "10/26#1",
      "10/26#2",
      "99/26#1",
      "100/26#1",
      "1000/26#1",
      "5001/26#1",
    ]);
    // What a string sort would have done: « 10/26 » before « 9/26 ».
    expect([...shuffled].map((row) => row.serie.serialNumber).sort()[0]).toBe("10/26");
  });

  it("by N° de contrôle: the order of the receptions (the counter CONTROLE draws at the reception)", () => {
    const sorted = [...shuffled].sort((a, b) => compareTakeOrder("controle", a, b));
    expect(sorted.map((row) => row.controlCode)).toEqual(["9/26", "10/26", "11/26", "99/26", "100/26", "1000/26", "40001/26"]);
  });

  it("the year first: a série of 2027 after every one of 2026", () => {
    const late = sample("1/27", 0, 1, "1/27", 0, 2027);
    const sorted = [late, ...drawn].sort((a, b) => compareTakeOrder("serie", a, b));
    expect(sorted.at(-1)?.serie.serialNumber).toBe("1/27");
  });

  it("two receptions that overlap: stamped 08:10 / 08:11 but drawn 102/26 then 101/26 — listed 101/26 first (review of lot 5A)", () => {
    const stampedFirst = sample("700/26", 1, 1, "102/26", 10);
    const stampedSecond = sample("701/26", 2, 1, "101/26", 11);
    expect(takeListRows("controle", [stampedFirst, stampedSecond]).map((row) => row.controlCode)).toEqual(["101/26", "102/26"]);
    // The same for two séries created at once (a deposit and a visit): by the série number drawn.
    const createdFirst = sample("651/26", 1, 1, "1/26", 1);
    const createdSecond = sample("650/26", 2, 1, "2/26", 2);
    expect(takeListRows("serie", [createdFirst, createdSecond]).map((row) => row.serie.serialNumber)).toEqual(["650/26", "651/26"]);
    // Switch off: the rows as the database gave them.
    expect(takeListRows("controle", [stampedFirst, stampedSecond], false).map((row) => row.controlCode)).toEqual(["102/26", "101/26"]);
  });

  it("a number that cannot be read comes after the others, by reception", () => {
    const odd = { ...sample("X-1", 0, 1, "A12", 5), controlCode: "A12" };
    const none = { ...sample("X-2", 0, 1, "", 1), controlCode: null };
    const sorted = takeListRows("controle", [odd, drawn[1], none, drawn[0]]);
    expect(sorted.map((row) => row.controlCode)).toEqual(["9/26", "10/26", null, "A12"]);
  });

  it("asks the database for the same keys", () => {
    expect(takeOrderBy("serie")).toEqual([
      { serie: { year: "asc" } },
      { serie: { createdAt: "asc" } },
      { lineNumber: "asc" },
      { code: "asc" },
      { id: "asc" },
    ]);
    expect(takeOrderBy("controle")).toEqual([{ receivedAt: "asc" }, { lineNumber: "asc" }, { code: "asc" }, { id: "asc" }]);
  });
});

describe("TAKE_LIST_BY_NUMBER — the urgent no longer lead « À prendre » (hypothèse D-2)", () => {
  it("is on; off, « À prendre » follows the bench order again", () => {
    expect(TAKE_LIST_BY_NUMBER).toBe(true);
    expect(takeListOrder("serie")).toEqual(takeOrderBy("serie"));
    expect(takeListOrder("controle")).toEqual(takeOrderBy("controle"));
    expect(takeListOrder("controle", false)).toEqual(BENCH_ORDER);
    expect(BENCH_ORDER).toEqual([{ priority: "desc" }, { receivedAt: "asc" }]);
  });

  it("cut at the limit, « À prendre » counts the urgent samples left out (review of lot 5A)", () => {
    expect(truncatedTakeNotice(120, 500, 3, 3)).toBeNull();
    expect(truncatedTakeNotice(500, 500, 3, 3)).toBe("La liste est limitée aux 500 premiers échantillons.");
    expect(truncatedTakeNotice(500, 500, 3, 4)).toBe(
      "La liste est limitée aux 500 premiers échantillons. Attention : 1 échantillon urgent à prendre n'y figure pas."
    );
    expect(truncatedTakeNotice(500, 500, 0, 7)).toBe(
      "La liste est limitée aux 500 premiers échantillons. Attention : 7 échantillons urgents à prendre n'y figurent pas."
    );
  });

  it("says the order in force under the list's title", () => {
    expect(takeListDescription("serie")).toContain("par N° de série");
    expect(takeListDescription("controle")).toContain("par N° de contrôle");
    expect(takeListDescription("serie", false)).toContain("les urgents d'abord");
  });

  it("/technicien orders « À prendre » (its list and its view) by it; « Mes analyses » keeps the bench order", () => {
    const page = readFileSync(fileURLToPath(new URL("../app/technicien/page.tsx", import.meta.url)), "utf8");
    expect(page).toContain("const takeOrder = takeListOrder(sort);");
    expect(page).toContain("view ? none : list(UNCLAIMED_WHERE, takeOrder),");
    expect(page).toContain('view === "anomalies" ? ARCHIVE_ORDER : view === "a_prendre" ? takeOrder : BENCH_ORDER');
    expect(page).toContain("view ? none : list(isTechnician ? benchQueueWhereFor(session) : takenByOthersWhere(session)),");
    // Sorted again by the numbers, and the urgent left out counted.
    expect(page).toContain('const viewItems = view === "a_prendre" ? takeListRows(sort, loadedView) : loadedView;');
    expect(page).toContain("const free = takeListRows(sort, loadedFree);");
    expect(page).toContain('await prisma.sample.count({ where: aged({ AND: [UNCLAIMED_WHERE, { priority: "URGENTE" }] }) })');
    expect(page).toContain("truncated={takeTruncated}");
  });
});

describe("TAKE_LIST_URGENT_FIRST — the urgent samples, a switch of their own (hypothèse D-2, review of 21/11)", () => {
  const rows = [
    { ...sample("100/26", 3, 1, "40003/26", 30), priority: "NORMALE" },
    { ...sample("9/26", 1, 1, "40001/26", 10), priority: "NORMALE" },
    { ...sample("99/26", 2, 1, "40002/26", 20), priority: "URGENTE" },
  ];

  it("is off: the number order alone, the urgent only flagged", () => {
    expect(TAKE_LIST_URGENT_FIRST).toBe(false);
    expect(takeOrderBy("serie")).toEqual(takeOrderBy("serie", false));
    expect(takeOrderBy("serie", false)[0]).toEqual({ serie: { year: "asc" } });
    expect(takeListRows("serie", rows).map((row) => row.serie.serialNumber)).toEqual(["9/26", "99/26", "100/26"]);
    expect(takeListDescription("serie")).toContain("Les urgents sont signalés.");
  });

  it("on: « URGENTE » leads, then the number order chosen — the confirmed order of Q106 kept", () => {
    expect(takeOrderBy("serie", true)[0]).toEqual({ priority: "desc" });
    expect(takeOrderBy("serie", true).slice(1)).toEqual(takeOrderBy("serie", false));
    expect(takeOrderBy("controle", true)).toEqual([{ priority: "desc" }, ...takeOrderBy("controle", false)]);
    expect(takeListRows("serie", rows, true, true).map((row) => row.serie.serialNumber)).toEqual(["99/26", "9/26", "100/26"]);
    expect(takeListRows("controle", rows, true, true).map((row) => row.controlCode)).toEqual(["40002/26", "40001/26", "40003/26"]);
    expect(takeListDescription("serie", true, true)).toBe(
      "Programme confirmé, personne ne les a pris : les urgents d'abord, puis par N° de série, puis par échantillon."
    );
    expect(takeListDescription("controle", true, true)).toBe(
      "Programme confirmé, personne ne les a pris : les urgents d'abord, puis par N° de contrôle."
    );
  });

  it("TAKE_LIST_BY_NUMBER off still gives the bench order, whatever this switch says", () => {
    expect(takeListOrder("serie", false)).toEqual(BENCH_ORDER);
    expect(takeListRows("serie", rows, false, true)).toEqual(rows);
  });
});
