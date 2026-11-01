import { describe, expect, it } from "vitest";
import { DUE_DELAYS_DEFAULTS, addDueDays, dueDaysFor, dueHint, parseDueDelays, parseNatureDueDays, proposeDueAt } from "./due-date";

// After 20/09/2026 the laboratory's clock is UTC: wall time = ISO time.
const at = (iso: string) => new Date(`${iso}Z`);

describe("addDueDays", () => {
  it("adds working days, skipping the weekend, at the arrival's wall time", () => {
    // Wednesday 28/10 at 10:15 + 5 working days → Wednesday 04/11 at 10:15.
    expect(addDueDays(at("2026-10-28T10:15:00"), 5, false).toISOString()).toBe("2026-11-04T10:15:00.000Z");
    // Friday + 1 working day → Monday; Saturday + 1 → Monday too.
    expect(addDueDays(at("2026-10-30T09:00:00"), 1, false).toISOString()).toBe("2026-11-02T09:00:00.000Z");
    expect(addDueDays(at("2026-10-31T09:00:00"), 1, false).toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });

  it("adds calendar days when asked", () => {
    expect(addDueDays(at("2026-10-30T09:00:00"), 3, true).toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });

  it("keeps the laboratory's wall time before the switch to UTC (UTC+1)", () => {
    // 15/09/2026 10:00 legal time = 09:00Z; + 1 calendar day → 16/09 10:00 legal = 09:00Z.
    expect(addDueDays(new Date("2026-09-15T09:00:00Z"), 1, true).toISOString()).toBe("2026-09-16T09:00:00.000Z");
    // Across the switch (20/09): the wall time is kept, the offset changes.
    expect(addDueDays(new Date("2026-09-18T09:00:00Z"), 3, true).toISOString()).toBe("2026-09-21T10:00:00.000Z");
  });
});

describe("dueDaysFor", () => {
  it("reads the delay of the sample's domain; empty or invalid proposes nothing", () => {
    expect(dueDaysFor("MICRO", DUE_DELAYS_DEFAULTS)).toBe(5);
    expect(dueDaysFor("CHIMIE", DUE_DELAYS_DEFAULTS)).toBe(7);
    expect(dueDaysFor("AUTRE", DUE_DELAYS_DEFAULTS)).toBeNull();
    expect(dueDaysFor("MICRO", { ...DUE_DELAYS_DEFAULTS, dueDaysMicro: 0 })).toBeNull();
  });

  it("lets a type d'analyse's own delay win over its domain's (R-18 « par type d'analyse »)", () => {
    expect(dueDaysFor("MICRO", DUE_DELAYS_DEFAULTS, 3)).toBe(3);
    expect(dueDaysFor("AUTRE", DUE_DELAYS_DEFAULTS, 4)).toBe(4);
    expect(dueDaysFor("CHIMIE", DUE_DELAYS_DEFAULTS, null)).toBe(7);
    expect(dueDaysFor("CHIMIE", DUE_DELAYS_DEFAULTS, 0)).toBe(7);
    const proposal = proposeDueAt(
      { family: "MICRO", natureDueDays: 3, arrivedAt: at("2026-10-28T10:15:00"), receivedAt: null },
      DUE_DELAYS_DEFAULTS,
      at("2026-10-29T08:00:00")
    );
    expect(proposal).toEqual({ dueAt: at("2026-11-02T10:15:00"), days: 3, calendar: false, past: false });
  });

  it("keeps the assumption of 01/11 (5 and 7 working days, the migration's defaults — they apply at the deploy)", () => {
    expect(DUE_DELAYS_DEFAULTS).toEqual({ dueDaysMicro: 5, dueDaysChimie: 7, dueDaysAutre: null, dueCalendarDays: null });
  });
});

describe("parseNatureDueDays", () => {
  it("reads whole days per type, empty as the domain's delay, absent as nothing", () => {
    expect(parseNatureDueDays(undefined)).toEqual({ ok: true, value: [] });
    expect(parseNatureDueDays({ air: 3, aliments: "5", aseptisant: "", eaux: null })).toEqual({
      ok: true,
      value: [
        { id: "air", dueDays: 3 },
        { id: "aliments", dueDays: 5 },
        { id: "aseptisant", dueDays: null },
        { id: "eaux", dueDays: null },
      ],
    });
  });

  it("refuses a fraction, zero, too many days or a malformed body", () => {
    expect(parseNatureDueDays({ air: 2.5 }).ok).toBe(false);
    expect(parseNatureDueDays({ air: 0 }).ok).toBe(false);
    expect(parseNatureDueDays({ air: 121 }).ok).toBe(false);
    expect(parseNatureDueDays([3]).ok).toBe(false);
    expect(parseNatureDueDays("3").ok).toBe(false);
  });
});

describe("proposeDueAt", () => {
  const now = at("2026-10-29T08:00:00");

  it("proposes from the arrival, else the reception", () => {
    const fromArrival = proposeDueAt({ family: "MICRO", arrivedAt: at("2026-10-28T10:15:00"), receivedAt: at("2026-10-28T11:00:00") }, DUE_DELAYS_DEFAULTS, now);
    expect(fromArrival).toEqual({ dueAt: at("2026-11-04T10:15:00"), days: 5, calendar: false, past: false });
    const fromReception = proposeDueAt({ family: "CHIMIE", arrivedAt: null, receivedAt: at("2026-10-28T11:00:00") }, DUE_DELAYS_DEFAULTS, now);
    expect(fromReception.dueAt?.toISOString()).toBe("2026-11-06T11:00:00.000Z");
  });

  it("proposes nothing without a delay, without an arrival, or when the date is past", () => {
    expect(proposeDueAt({ family: "AUTRE", arrivedAt: at("2026-10-28T10:00:00"), receivedAt: null }, DUE_DELAYS_DEFAULTS, now).dueAt).toBeNull();
    expect(proposeDueAt({ family: "MICRO", arrivedAt: null, receivedAt: null }, DUE_DELAYS_DEFAULTS, now).dueAt).toBeNull();
    const late = proposeDueAt({ family: "MICRO", arrivedAt: at("2026-10-01T10:00:00"), receivedAt: null }, DUE_DELAYS_DEFAULTS, now);
    expect(late).toMatchObject({ dueAt: null, past: true, days: 5 });
  });

  it("says where the proposal comes from", () => {
    expect(dueHint({ dueAt: now, days: 5, calendar: false, past: false })).toBe(
      "Proposée d'après le délai du laboratoire : 5 jours ouvrés après l'arrivée — modifiable."
    );
    expect(dueHint({ dueAt: now, days: 1, calendar: true, past: false })).toContain("1 jour après l'arrivée");
    expect(dueHint({ dueAt: null, days: 5, calendar: false, past: true })).toContain("déjà dépassé");
    expect(dueHint({ dueAt: null, days: null, calendar: false, past: false })).toBeNull();
  });
});

describe("parseDueDelays", () => {
  it("reads whole days, empty as no proposal, absent as unchanged", () => {
    expect(parseDueDelays({ dueDaysMicro: "3", dueDaysChimie: "", dueCalendarDays: true })).toEqual({
      ok: true,
      value: { dueDaysMicro: 3, dueDaysChimie: null, dueCalendarDays: true },
    });
    expect(parseDueDelays({})).toEqual({ ok: true, value: {} });
  });

  it("refuses a fraction, zero, too many days or a wrong kind of days", () => {
    expect(parseDueDelays({ dueDaysMicro: 2.5 }).ok).toBe(false);
    expect(parseDueDelays({ dueDaysMicro: 0 }).ok).toBe(false);
    expect(parseDueDelays({ dueDaysAutre: 500 })).toEqual({ ok: false, error: "« Autres analyses » : un nombre entier de jours entre 1 et 120, ou vide." });
    expect(parseDueDelays({ dueCalendarDays: "oui" }).ok).toBe(false);
  });
});
