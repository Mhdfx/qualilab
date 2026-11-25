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
