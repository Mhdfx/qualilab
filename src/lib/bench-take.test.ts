import { describe, expect, it } from "vitest";
import {
  BENCH_STATUSES,
  TAKEN_WHERE,
  TAKE_MESSAGES,
  TYPED_RESULT_WHERE,
  UNCLAIMED_WHERE,
  adminReleasesTypedSample,
  benchWhereFor,
  canEditParameter,
  canEnterParameter,
  canReadAtBench,
  colleagueSampleHidden,
  colleaguesListed,
  hasTypedResult,
  isHeldByOther,
  isOnBenchOf,
  isUnclaimed,
  takeRefusal,
  takenByOthersWhere,
  untakeRefusal,
  type TakeState,
} from "./bench-access";
import { COLLEAGUE_SAMPLES_HIDDEN } from "./lab-proposals";

/**
 * Prise en charge libre (PROGRAMME.md §10, the laboratory's decision of
 * 13/10): nobody assigns, a confirmed programme waits in « À prendre », the
 * technician who takes it — the button or a first typed result — becomes
 * its holder, « Libérer » gives it back while nothing is typed.
 */

const ecoli = { parameterId: "p-ecoli", technicianId: null };
const flore = { parameterId: "p-flore", technicianId: null };

const free = { technicianId: null, parameters: [ecoli, flore] };
const takenByTech1 = { technicianId: "tech1", parameters: [ecoli, flore] };
/** A line a legacy programme handed parameter by parameter, no sample holder. */
const legacySplit = { technicianId: null, parameters: [ecoli, { parameterId: "p-salm", technicianId: "tech2" }] };

describe("isUnclaimed — « À prendre »", () => {
  it("is free when neither the sample nor any parameter has a holder", () => {
    expect(isUnclaimed(free)).toBe(true);
    expect(isUnclaimed({ technicianId: null, parameters: [] })).toBe(true);
  });

  it("is taken by a sample holder, or by a legacy parameter technician", () => {
    expect(isUnclaimed(takenByTech1)).toBe(false);
    expect(isUnclaimed(legacySplit)).toBe(false);
  });
});

describe("isHeldByOther — a colleague's sample is read-only", () => {
  it("names a sample a colleague took", () => {
    expect(isHeldByOther(takenByTech1, "tech2")).toBe(true);
    expect(isHeldByOther(takenByTech1, "tech1")).toBe(false);
  });

  it("never calls a free sample a colleague's", () => {
    expect(isHeldByOther(free, "tech1")).toBe(false);
  });

  it("keeps a legacy parameter technician on their own line", () => {
    expect(isHeldByOther(legacySplit, "tech2")).toBe(false);
    expect(isHeldByOther(legacySplit, "tech1")).toBe(true);
  });
});

describe("canEnterParameter — who may type", () => {
  it("opens every parameter of a free sample to any technician: the first typed result takes it", () => {
    for (const parameter of free.parameters) {
      expect(canEnterParameter(free, parameter, "tech1")).toBe(true);
      expect(canEnterParameter(free, parameter, "tech2")).toBe(true);
    }
    // The holder rule itself is unchanged: on a free sample nobody holds a line.
    expect(canEditParameter(free, ecoli, "tech1")).toBe(false);
  });

  it("reserves a taken sample to its holder", () => {
    expect(canEnterParameter(takenByTech1, ecoli, "tech1")).toBe(true);
    expect(canEnterParameter(takenByTech1, ecoli, "tech2")).toBe(false);
  });

  it("keeps a legacy split line parameter by parameter", () => {
    const salmonella = legacySplit.parameters[1];
    expect(canEnterParameter(legacySplit, salmonella, "tech2")).toBe(true);
    expect(canEnterParameter(legacySplit, salmonella, "tech1")).toBe(false);
  });

  it("gives an analysis added to a legacy split line to that line's technicians, never to nobody", () => {
    // ecoli has no technician of its own and the line no sample holder.
    expect(canEnterParameter(legacySplit, ecoli, "tech2")).toBe(true);
    expect(canEnterParameter(legacySplit, ecoli, "tech1")).toBe(false);
    // On a taken sample, an analysis without its own technician is the holder's alone.
    expect(canEnterParameter(takenByTech1, ecoli, "tech2")).toBe(false);
  });
});

describe("canReadAtBench — which sheets a technician may open", () => {
  it("J7 off (before lot 5A): opens the shared bench — free and colleagues' samples — and their own work at any step", () => {
    expect(canReadAtBench({ ...free, status: "PROGRAMME" }, "tech2", false)).toBe(true);
    expect(canReadAtBench({ ...takenByTech1, status: "EN_ANALYSE" }, "tech2", false)).toBe(true);
    expect(canReadAtBench({ ...takenByTech1, status: "RESULTATS_SAISIS" }, "tech1", false)).toBe(true);
    expect(colleaguesListed("TECHNICIEN", false)).toBe(true);
  });

  it("J7 on (lot 5A, 2.14 of 20/11 « pas visible », hypothèse D-1): a colleague's sample is hidden, the 404 of a sample that does not exist", () => {
    expect(COLLEAGUE_SAMPLES_HIDDEN).toBe(true);
    expect(colleagueSampleHidden(takenByTech1, "tech2")).toBe(true);
    expect(canReadAtBench({ ...takenByTech1, status: "EN_ANALYSE" }, "tech2")).toBe(false);
    // « À prendre » and their own work stay open.
    expect(canReadAtBench({ ...free, status: "PROGRAMME" }, "tech2")).toBe(true);
    expect(colleagueSampleHidden(free, "tech2")).toBe(false);
    expect(canReadAtBench({ ...takenByTech1, status: "RESULTATS_SAISIS" }, "tech1")).toBe(true);
    expect(colleagueSampleHidden(takenByTech1, "tech1")).toBe(false);
    // A line shared through a legacy parameter stays visible to each of its holders.
    expect(colleagueSampleHidden(legacySplit, "tech2")).toBe(false);
    const shared = { technicianId: "tech1", parameters: [ecoli, { parameterId: "p-salm", technicianId: "tech2" }] };
    expect(colleagueSampleHidden(shared, "tech2")).toBe(false);
    expect(canReadAtBench({ ...shared, status: "EN_ANALYSE" }, "tech2")).toBe(true);
    expect(colleagueSampleHidden(shared, "tech3")).toBe(true);
    // No « Pris par un collègue » list on the technician's bench; never the admin's to lose.
    expect(colleaguesListed("TECHNICIEN")).toBe(false);
    expect(colleaguesListed("ADMIN", false)).toBe(false);
  });

  it("keeps a colleague's sample closed once it has left the bench", () => {
    expect(canReadAtBench({ ...takenByTech1, status: "RESULTATS_SAISIS" }, "tech2")).toBe(false);
    expect(canReadAtBench({ ...free, status: "RECU" }, "tech2")).toBe(false);
  });
});

describe("the bench filters", () => {
  it("« À prendre » = on the bench, not held at reception, held by nobody", () => {
    expect(UNCLAIMED_WHERE).toEqual({
      status: { in: [...BENCH_STATUSES] },
      analysisBlocked: false,
      technicianId: null,
      parameters: { none: { technicianId: { not: null } } },
    });
  });

  it("« Pris par un collègue » = the taken bench samples that are not mine; all of them for the admin", () => {
    const technician = { id: "tech1", role: "TECHNICIEN" as const };
    expect(takenByOthersWhere(technician)).toEqual({
      status: { in: ["PROGRAMME", "EN_ANALYSE"] },
      AND: [
        TAKEN_WHERE,
        // Never a NOT around the nullable holder: it would drop the legacy
        // lines a colleague holds only through their parameters.
        { OR: [{ technicianId: null }, { technicianId: { not: "tech1" } }] },
        { parameters: { none: { technicianId: "tech1" } } },
      ],
    });
    expect(benchWhereFor(technician)).toEqual({
      OR: [{ technicianId: "tech1" }, { parameters: { some: { technicianId: "tech1" } } }],
    });
    expect(takenByOthersWhere({ id: "adm", role: "ADMIN" })).toEqual({
      status: { in: ["PROGRAMME", "EN_ANALYSE"] },
      AND: [TAKEN_WHERE],
    });
  });

  it("agrees with the pure rules on what is taken", () => {
    expect(TAKEN_WHERE.OR).toHaveLength(2);
    expect(isOnBenchOf(takenByTech1, "tech1")).toBe(true);
    expect(isOnBenchOf(free, "tech1")).toBe(false);
  });
});

describe("hasTypedResult — what an empty « Enregistrer » leaves behind does not count", () => {
  const empty = { value: null, note: null, workStatus: "EN_COURS" as const, unitCount: 0 };

  it("an empty row is not a result", () => {
    expect(hasTypedResult(empty)).toBe(false);
  });

  it("a value, a unit reading, a note or a step is", () => {
    expect(hasTypedResult({ ...empty, value: "< 10" })).toBe(true);
    expect(hasTypedResult({ ...empty, unitCount: 1 })).toBe(true);
    expect(hasTypedResult({ ...empty, note: "boîte cassée" })).toBe(true);
    expect(hasTypedResult({ ...empty, workStatus: "TERMINE" })).toBe(true);
    expect(hasTypedResult({ ...empty, workStatus: "ANOMALIE" })).toBe(true);
  });

  it("is the same rule as the database filter", () => {
    expect(TYPED_RESULT_WHERE.OR).toEqual([
      { value: { not: null } },
      { note: { not: null } },
      { units: { some: {} } },
      { workStatus: { not: "EN_COURS" } },
    ]);
  });
});

const state = (over: Partial<TakeState> = {}): TakeState => ({
  status: "PROGRAMME",
  analysisBlocked: false,
  technicianId: null,
  holderName: null,
  heldByParameter: false,
  ...over,
});

describe("takeRefusal — « Prendre en charge », first one wins", () => {
  it("lets a technician take a free programmed or running sample", () => {
    expect(takeRefusal(state(), "tech1")).toBeNull();
    expect(takeRefusal(state({ status: "EN_ANALYSE" }), "tech1")).toBeNull();
  });

  it("answers a double click as done, not as a refusal", () => {
    expect(takeRefusal(state({ technicianId: "tech1", holderName: "Yassine" }), "tech1")).toBeNull();
  });

  it("refuses the second technician (409) — naming the winner while J7 is off, « un collègue » while it hides them", () => {
    expect(takeRefusal(state({ technicianId: "tech1", holderName: "Yassine Amrani" }), "tech2", false)).toEqual({
      status: 409,
      error: "Déjà pris par Yassine Amrani.",
    });
    // Lot 5A, J7 (review): the API no longer says who holds a sample the sheet answers 404 for.
    expect(COLLEAGUE_SAMPLES_HIDDEN).toBe(true);
    expect(takeRefusal(state({ technicianId: "tech1", holderName: "Yassine Amrani" }), "tech2")).toEqual({
      status: 409,
      error: "Déjà pris par un collègue.",
    });
    expect(takeRefusal(state({ heldByParameter: true, holderName: "Imane" }), "tech1")?.status).toBe(409);
  });

  it("refuses a sample that is not on the bench, held at reception, or missing", () => {
    expect(takeRefusal(state({ status: "RECU" }), "tech1")).toEqual({ status: 409, error: TAKE_MESSAGES.notOnBench });
    expect(takeRefusal(state({ status: "RESULTATS_SAISIS" }), "tech1")?.status).toBe(409);
    expect(takeRefusal(state({ analysisBlocked: true }), "tech1")).toEqual({ status: 409, error: TAKE_MESSAGES.blocked });
    expect(takeRefusal(null, "tech1")?.status).toBe(404);
  });
});

describe("untakeRefusal — « Libérer »", () => {
  const tech1 = { id: "tech1", role: "TECHNICIEN" as const };
  const tech2 = { id: "tech2", role: "TECHNICIEN" as const };
  const admin = { id: "adm", role: "ADMIN" as const };
  const held = state({ technicianId: "tech1", holderName: "Yassine Amrani" });

  it("lets the holder and the admin give a sample back while nothing is typed", () => {
    expect(untakeRefusal(held, 0, tech1)).toBeNull();
    expect(untakeRefusal(held, 0, admin)).toBeNull();
    expect(untakeRefusal({ ...held, status: "EN_ANALYSE" }, 0, tech1)).toBeNull();
  });

  it("refuses a colleague (403) — naming the holder while J7 is off, never while it hides them", () => {
    expect(untakeRefusal(held, 0, tech2, false)).toEqual({
      status: 403,
      error: "Seul Yassine Amrani ou un administrateur peut libérer cet échantillon.",
    });
    expect(untakeRefusal(held, 0, tech2)).toEqual({
      status: 403,
      error: "Seul le technicien qui l'a pris ou un administrateur peut libérer cet échantillon.",
    });
  });

  it("J7 off (before lot 5A): refuses once a result is typed — even the admin", () => {
    expect(untakeRefusal(held, 1, tech1, false)).toEqual({ status: 409, error: TAKE_MESSAGES.typed });
    expect(untakeRefusal(held, 3, admin, false)?.status).toBe(409);
    expect(adminReleasesTypedSample("ADMIN", false)).toBe(false);
  });

  it("J7 on (lot 5A): the admin frees a sample that carries readings — the way to hand it over; its holder still cannot", () => {
    expect(adminReleasesTypedSample("ADMIN")).toBe(true);
    expect(adminReleasesTypedSample("TECHNICIEN")).toBe(false);
    expect(untakeRefusal(held, 3, admin)).toBeNull();
    expect(untakeRefusal({ ...held, status: "EN_ANALYSE" }, 1, admin)).toBeNull();
    expect(untakeRefusal(held, 1, tech1)).toEqual({ status: 409, error: TAKE_MESSAGES.typedAdminOnly });
    // Never a colleague, never off the bench, even for the admin.
    expect(untakeRefusal(held, 1, tech2)?.status).toBe(403);
    expect(untakeRefusal({ ...held, status: "RESULTATS_SAISIS" }, 2, admin)).toEqual({
      status: 409,
      error: TAKE_MESSAGES.offBench,
    });
  });

  it("a free sample that already carries readings is taken like any free one — the new holder submits it", () => {
    // `takeRefusal` reads no readings: the admin freed it with its readings (J7), any technician takes it.
    expect(takeRefusal(state({ status: "EN_ANALYSE" }), "tech2")).toBeNull();
    // Taken, it is theirs: they type and submit (`canEnterParameter`), the previous holder no longer does.
    const retaken = { technicianId: "tech2", parameters: [ecoli, flore] };
    expect(canEnterParameter(retaken, ecoli, "tech2")).toBe(true);
    expect(canEnterParameter(retaken, ecoli, "tech1")).toBe(false);
  });

  it("refuses a free sample, one off the bench, or a missing one", () => {
    expect(untakeRefusal(state(), 0, admin)).toEqual({ status: 409, error: TAKE_MESSAGES.notTaken });
    expect(untakeRefusal({ ...held, status: "RESULTATS_SAISIS" }, 0, tech1)).toEqual({
      status: 409,
      error: TAKE_MESSAGES.offBench,
    });
    expect(untakeRefusal(null, 0, admin)?.status).toBe(404);
  });

  it("leaves a legacy split line to the admin", () => {
    const split = state({ heldByParameter: true, holderName: "Imane" });
    expect(untakeRefusal(split, 0, admin)).toBeNull();
    expect(untakeRefusal(split, 0, tech2)?.status).toBe(403);
  });
});
