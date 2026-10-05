import { describe, expect, it } from "vitest";
import { MAX_UNITS, lineReference, repetitionLabel, repetitionRange, serieProgress, serieStatus } from "./series";

const s = (...statuses: string[]) =>
  statuses.map((status) => ({ status: status as never }));

describe("série status — derived from its samples, never stored", () => {
  it("waits at reception while one line is still PRELEVE", () => {
    expect(serieStatus(s("PRELEVE", "RECU", "VALIDE"))).toBe("A_RECEPTIONNER");
  });

  it("is in progress once every line is received and one is still open", () => {
    expect(serieStatus(s("RECU", "EN_ANALYSE"))).toBe("EN_COURS");
    expect(serieStatus(s("RESULTATS_SAISIS", "VALIDE"))).toBe("EN_COURS");
    // A programmed line (PROGRAMME.md) is open work, not a série waiting at reception.
    expect(serieStatus(s("PROGRAMME", "PROGRAMME"))).toBe("EN_COURS");
    expect(serieProgress(s("PROGRAMME", "VALIDE")).enCours).toBe(1);
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
  it("names units R1 … Rn everywhere, with no limit (Q36)", () => {
    expect([1, 2, 9, 60, 999].map(repetitionLabel)).toEqual(["R1", "R2", "R9", "R60", "R999"]);
    expect(repetitionRange(5)).toBe("R1–R5");
    expect(repetitionRange(1)).toBe("R1");
    expect(MAX_UNITS).toBe(999);
  });

  it("refuses an impossible unit index", () => {
    expect(() => repetitionLabel(0)).toThrow();
    expect(() => repetitionLabel(1.5)).toThrow();
  });

  it("writes the line reference the préleveur sees", () => {
    expect(lineReference("2780/26", 3)).toBe("2780/26 · ligne 3");
  });
});
