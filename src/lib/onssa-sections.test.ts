import { describe, expect, it } from "vitest";
import { labDayStart } from "./lab-day-range";
import { onssaMonth, type OnssaGroupRef, type OnssaSampleInput } from "./onssa-report";
import {
  NO_REGION,
  UNCODED_RECEPTION_NC,
  countLine,
  eilRows,
  isEilOfMonth,
  onssaYearStart,
  RECEPTION_REFUSALS,
  receptionNonConformWhere,
  receptionRows,
  regulationRows,
  strainRows,
  type OnssaEilInput,
} from "./onssa-sections";

/**
 * Lot 6C, N4 — what section III of the canevas of 2026 shows for a month:
 * the EIL in scope, the sensitive germs detected, the regulations chosen, the
 * reception's non-conformities and refusals. Synthetic data only.
 */

const GROUP: OnssaGroupRef = { id: "g", name: "Groupe test", domain: "ALIMENTAIRE", sortOrder: 0, active: true };
const sample = (over: Partial<OnssaSampleInput>): OnssaSampleInput => ({
  id: "s",
  reference: "1/26",
  clientName: "Client Fictif",
  siteName: null,
  natureLabel: "Aliments",
  familyName: "Famille test",
  groupId: GROUP.id,
  controleOfficiel: false,
  organismePreleveur: null,
  etablissement: null,
  origine: null,
  results: [],
  ...over,
});
const result = (over: Partial<OnssaSampleInput["results"][number]>) => ({
  parameterName: "Salmonella",
  parameterColumn: "SALMONELLA",
  normCode: null,
  value: "Présence",
  interpretation: null,
  informalInterpretation: null,
  conform: null,
  ...over,
});

describe("III-1 — the EIL of the month", () => {
  const month = onssaMonth("2026-10")!;
  const yearStart = onssaYearStart(month);

  it("starts the year on the laboratory's 1 January", () => {
    expect(yearStart.getTime()).toBe(labDayStart("2026-01-01")!.getTime());
  });

  it("keeps those of the year up to the month's end, and the open ones", () => {
    const at = (day: string) => labDayStart(day);
    expect(isEilOfMonth({ startDate: at("2026-01-10"), status: "CLOTUREE" }, yearStart, month.until)).toBe(true);
    expect(isEilOfMonth({ startDate: at("2026-10-27"), status: "PREVUE" }, yearStart, month.until)).toBe(true);
    expect(isEilOfMonth({ startDate: at("2026-11-02"), status: "PREVUE" }, yearStart, month.until)).toBe(false);
    expect(isEilOfMonth({ startDate: at("2025-11-03"), status: "EN_COURS" }, yearStart, month.until)).toBe(true);
    expect(isEilOfMonth({ startDate: at("2025-11-03"), status: "CLOTUREE" }, yearStart, month.until)).toBe(false);
    expect(isEilOfMonth({ startDate: null, status: "PREVUE" }, yearStart, month.until)).toBe(true);
    expect(isEilOfMonth({ startDate: null, status: "CLOTUREE" }, yearStart, month.until)).toBe(false);
  });

  it("fills the canevas' columns: scope, name, organiser, day else status, outcome else status", () => {
    const base: OnssaEilInput = {
      name: "EIL test",
      organizer: "Organisateur test",
      scope: null,
      startDate: null,
      resultDate: null,
      status: "EN_COURS",
      outcome: null,
      satisfactory: null,
    };
    const rows = eilRows([
      { ...base, name: "EIL B", scope: "Salmonella — eau", startDate: labDayStart("2026-01-12"), satisfactory: true, outcome: "z = 0,4" },
      { ...base, name: "EIL A" },
    ]);
    expect(rows).toEqual([
      {
        parameter: "Salmonella — eau",
        method: "EIL B",
        validation: "",
        organizer: "Organisateur test",
        date: "12/01/2026",
        result: "z = 0,4 — Satisfaisant",
      },
      { parameter: "EIL A", method: "", validation: "", organizer: "Organisateur test", date: "En cours", result: "En cours" },
    ]);
  });
});

describe("III-5 — the strains", () => {
  it("lists the sensitive germs read as detected in declared samples, by day", () => {
    const rows = strainRows(
      [
        sample({
          id: "a",
          receivedDay: "2026-10-20",
          city: "Ville test",
          results: [
            result({ sensitive: true, detected: true }),
            result({ parameterName: "Listeria", sensitive: true, detected: false }),
            result({ parameterName: "Flore", sensitive: false, detected: true }),
          ],
        }),
        sample({ id: "b", receivedDay: "2026-10-03", familyName: null, results: [result({ parameterName: "E. coli", sensitive: true, detected: true })] }),
        // Not declared (no group): not listed.
        sample({ id: "c", groupId: null, receivedDay: "2026-10-04", results: [result({ sensitive: true, detected: true })] }),
      ],
      [GROUP]
    );
    expect(rows).toEqual([
      { day: "03/10/2026", germ: "E. coli", product: "Aliments", region: NO_REGION },
      { day: "20/10/2026", germ: "Salmonella", product: "Famille test", region: "Ville test" },
    ]);
  });
});

describe("III-6 — regulations and reception", () => {
  it("counts the regulations chosen on declared samples, the most used first", () => {
    const rows = regulationRows(
      [
        sample({ id: "a", regulationTitle: "Texte B" }),
        sample({ id: "b", regulationTitle: "Texte A" }),
        sample({ id: "c", regulationTitle: "Texte A" }),
        sample({ id: "d", regulationTitle: null }),
        sample({ id: "e", groupId: null, regulationTitle: "Texte C" }),
      ],
      [GROUP]
    );
    expect(rows).toEqual([
      { label: "Texte A", samples: 2 },
      { label: "Texte B", samples: 1 },
    ]);
  });

  it("counts the reception's non-conformities by motif, then the rejections and destructions", () => {
    const rows = receptionRows(
      [{ reason: "CHAINE_FROID" }, { reason: "CHAINE_FROID" }, { reason: null }],
      [{ reason: "REJETE_A_RECEPTION" }, { reason: "DETRUIT_A_RECEPTION" }, { reason: "DETRUIT_A_RECEPTION" }]
    );
    expect(rows).toEqual([
      { label: "Rupture de la chaîne du froid", samples: 2 },
      { label: UNCODED_RECEPTION_NC, samples: 1 },
      { label: "Détruit à réception", samples: 2 },
      { label: "Rejeté à réception — rendu au client", samples: 1 },
    ]);
    expect(countLine(rows[0])).toBe("Rupture de la chaîne du froid : 2 échantillons");
    expect(countLine(rows[1])).toBe(`${UNCODED_RECEPTION_NC} : 1 échantillon`);
  });
});

/**
 * Relecture du lot 6, constat 1 — the filter of III-6-3's non-conformities,
 * evaluated as SQL evaluates it (three-valued logic: a comparison with NULL
 * is « unknown », and `NOT unknown` is still unknown — the row is dropped).
 * The filter of 25/11 (`NOT: { cancelReason: { in: […] } }`) dropped every
 * sample not cancelled; this one keeps them.
 */
describe("receptionNonConformWhere — as SQL reads it", () => {
  type Row = { receivedAt: Date; conformity: boolean; cancelReason: string | null };
  type Tri = boolean | null;
  const not = (value: Tri): Tri => (value === null ? null : !value);
  const or = (values: Tri[]): Tri => (values.some((value) => value === true) ? true : values.some((value) => value === null) ? null : false);
  const and = (values: Tri[]): Tri => (values.some((value) => value === false) ? false : values.some((value) => value === null) ? null : true);
  // The subset of Prisma's filter language the reception filters use.
  function field(value: unknown, filter: unknown): Tri {
    if (filter === null) return value === null;
    if (filter instanceof Date || typeof filter !== "object") return value === null ? null : value === filter;
    const ops = filter as Record<string, unknown>;
    return and(
      Object.entries(ops).map(([op, operand]): Tri => {
        if (value === null) return null;
        if (op === "in") return (operand as unknown[]).includes(value);
        if (op === "notIn") return !(operand as unknown[]).includes(value);
        if (op === "gte") return (value as Date).getTime() >= (operand as Date).getTime();
        if (op === "lt") return (value as Date).getTime() < (operand as Date).getTime();
        throw new Error(`opérateur non simulé : ${op}`);
      })
    );
  }
  function where(row: Row, filter: Record<string, unknown>): Tri {
    return and(
      Object.entries(filter).map(([key, value]): Tri => {
        if (key === "OR") return or((value as Record<string, unknown>[]).map((part) => where(row, part)));
        if (key === "NOT") return not(where(row, value as Record<string, unknown>));
        return field(row[key as keyof Row], value);
      })
    );
  }

  const range = { gte: new Date("2026-02-01T00:00:00Z"), lt: new Date("2026-03-01T00:00:00Z") };
  const inMonth = new Date("2026-02-10T09:00:00Z");
  const rows: Row[] = [
    { receivedAt: inMonth, conformity: false, cancelReason: null },
    { receivedAt: inMonth, conformity: false, cancelReason: "AUTRE" },
    { receivedAt: inMonth, conformity: false, cancelReason: "REJETE_A_RECEPTION" },
    { receivedAt: inMonth, conformity: false, cancelReason: "DETRUIT_A_RECEPTION" },
    { receivedAt: inMonth, conformity: true, cancelReason: null },
    { receivedAt: new Date("2026-03-02T09:00:00Z"), conformity: false, cancelReason: null },
  ];
  const kept = (filter: Record<string, unknown>) => rows.filter((row) => where(row, filter) === true).map((row) => rows.indexOf(row));

  it("keeps the non-conformes not cancelled, and those cancelled for another reason", () => {
    expect(kept(receptionNonConformWhere(range))).toEqual([0, 1]);
  });

  it("the filter of 25/11 dropped the samples not cancelled (the regression this guards)", () => {
    const before = { receivedAt: range, conformity: false, NOT: { cancelReason: { in: [...RECEPTION_REFUSALS] } } };
    expect(kept(before)).toEqual([1]);
  });
});
