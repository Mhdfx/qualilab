import { describe, expect, it } from "vitest";
import { lineReference, serieProgress, serieStatus, unitLetter } from "./series";

const s = (...statuses: string[]) =>
  statuses.map((status) => ({ status: status as never }));

describe("série status — derived from its samples, never stored", () => {
  it("waits at reception while one line is still PRELEVE", () => {
    expect(serieStatus(s("PRELEVE", "RECU", "VALIDE"))).toBe("A_RECEPTIONNER");
  });

  it("is in progress once every line is received and one is still open", () => {
    expect(serieStatus(s("RECU", "EN_ANALYSE"))).toBe("EN_COURS");
    expect(serieStatus(s("RESULTATS_SAISIS", "VALIDE"))).toBe("EN_COURS");
  });

  it("is finished when every remaining line is validated or sent", () => {
    expect(serieStatus(s("VALIDE", "RAPPORT_ENVOYE"))).toBe("TERMINEE");
    expect(serieStatus(s("VALIDE", "ANNULE"))).toBe("TERMINEE");
  });

  it("is cancelled only when every line is", () => {
    expect(serieStatus(s("ANNULE", "ANNULE"))).toBe("ANNULEE");
    expect(serieStatus(s("ANNULE", "PRELEVE"))).toBe("A_RECEPTIONNER");
  });

  it("counts the progress the dashboard shows", () => {
    expect(serieProgress(s("PRELEVE", "RECU", "EN_ANALYSE", "VALIDE", "ANNULE"))).toEqual({
      total: 5,
      annules: 1,
      aReceptionner: 1,
      enCours: 2,
      termines: 1,
    });
  });
});

describe("unit letters and line references", () => {
  it("names units A, B, C… like the bench sheet", () => {
    expect([1, 2, 5, 9].map(unitLetter)).toEqual(["A", "B", "E", "I"]);
  });

  it("refuses an impossible unit index", () => {
    expect(() => unitLetter(0)).toThrow();
    expect(() => unitLetter(27)).toThrow();
  });

  it("writes the line reference the préleveur sees", () => {
    expect(lineReference("2780/26", 3)).toBe("2780/26 · ligne 3");
  });
});
