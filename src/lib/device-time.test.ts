import { describe, expect, it } from "vitest";
import {
  deviceDriftMinutes,
  deviceToLegalWall,
  driftForWall,
  fieldDisplayWall,
  fieldLegalWall,
  futureFieldError,
  legalClock,
  legalToDeviceWall,
} from "./device-time";

/**
 * RETOUR-LABO-06-10.md §8.1 — a device that missed Morocco's return to GMT
 * (20/09/2026) shows one hour more; the field reads its hour and stores the
 * legal one. Every clock is pinned: the tests never depend on the machine's zone.
 */

/** 08/10/2026 18:06 legal = 18:06 UTC (GMT since 20/09/2026). */
const NOW = new Date(Date.UTC(2026, 9, 8, 18, 6));
/** 10/09/2026 12:00 UTC — before the switch, legal time was UTC+1. */
const BEFORE_SWITCH = new Date(Date.UTC(2026, 8, 10, 12, 0));

describe("deviceDriftMinutes", () => {
  it("is +60 on a device still on UTC+1", () => {
    expect(deviceDriftMinutes(NOW, 60)).toBe(60);
  });

  it("is 0 on an up-to-date device", () => {
    expect(deviceDriftMinutes(NOW, 0)).toBe(0);
  });

  it("is −60 on a device one hour behind", () => {
    expect(deviceDriftMinutes(NOW, -60)).toBe(-60);
  });

  it("ignores a difference under 30 minutes", () => {
    expect(deviceDriftMinutes(NOW, 15)).toBe(0);
    expect(deviceDriftMinutes(NOW, -29)).toBe(0);
    expect(deviceDriftMinutes(NOW, 30)).toBe(30);
    expect(deviceDriftMinutes(NOW, -30)).toBe(-30);
  });

  it("compares with the legal offset of the instant (UTC+1 before the switch)", () => {
    expect(deviceDriftMinutes(BEFORE_SWITCH, 60)).toBe(0);
    expect(deviceDriftMinutes(BEFORE_SWITCH, 0)).toBe(-60);
  });

  it("reads the device's own offset by default", () => {
    const expected = -NOW.getTimezoneOffset();
    expect(deviceDriftMinutes(NOW)).toBe(Math.abs(expected) < 30 ? 0 : expected);
  });
});

describe("legalToDeviceWall / deviceToLegalWall", () => {
  it("shows the device's hour and stores the legal one (+60)", () => {
    expect(legalToDeviceWall("2026-10-08T18:06", 60)).toBe("2026-10-08T19:06");
    expect(deviceToLegalWall("2026-10-08T19:06", 60)).toBe("2026-10-08T18:06");
  });

  it("changes nothing on an up-to-date device", () => {
    expect(legalToDeviceWall("2026-10-08T18:06", 0)).toBe("2026-10-08T18:06");
    expect(deviceToLegalWall("2026-10-08T18:06", 0)).toBe("2026-10-08T18:06");
  });

  it("goes the other way on a device behind (−60)", () => {
    expect(legalToDeviceWall("2026-10-08T18:06", -60)).toBe("2026-10-08T17:06");
    expect(deviceToLegalWall("2026-10-08T17:06", -60)).toBe("2026-10-08T18:06");
  });

  it("changes the date across midnight, the month and the year", () => {
    expect(legalToDeviceWall("2026-10-08T23:30", 60)).toBe("2026-10-09T00:30");
    expect(deviceToLegalWall("2026-10-09T00:30", 60)).toBe("2026-10-08T23:30");
    expect(legalToDeviceWall("2026-10-09T00:20", -60)).toBe("2026-10-08T23:20");
    expect(deviceToLegalWall("2026-10-08T23:20", -60)).toBe("2026-10-09T00:20");
    expect(legalToDeviceWall("2026-10-31T23:45", 60)).toBe("2026-11-01T00:45");
    expect(legalToDeviceWall("2026-12-31T23:45", 60)).toBe("2027-01-01T00:45");
    expect(deviceToLegalWall("2027-01-01T00:15", 60)).toBe("2026-12-31T23:15");
  });

  it("round-trips", () => {
    for (const drift of [-60, 0, 30, 60, 120]) {
      for (const wall of ["2026-10-08T00:00", "2026-10-08T12:34", "2026-10-08T23:59", "2027-02-28T23:30"]) {
        expect(deviceToLegalWall(legalToDeviceWall(wall, drift), drift)).toBe(wall);
        expect(legalToDeviceWall(deviceToLegalWall(wall, drift), drift)).toBe(wall);
      }
    }
  });

  it("drops the seconds a browser may add", () => {
    expect(deviceToLegalWall("2026-10-08T19:06:30", 60)).toBe("2026-10-08T18:06");
  });

  it("keeps an empty or unreadable value as it is", () => {
    expect(legalToDeviceWall("", 60)).toBe("");
    expect(deviceToLegalWall("", 60)).toBe("");
    expect(legalToDeviceWall("2026-10-08", 60)).toBe("2026-10-08");
    expect(deviceToLegalWall("pas une date", -60)).toBe("pas une date");
  });
});

describe("driftForWall", () => {
  /** A device stuck on UTC+1 for every date. */
  const stuck = () => 60;

  it("applies the current drift to a date after the switch", () => {
    expect(driftForWall("2026-10-08T18:06", 60, stuck)).toBe(60);
  });

  it("applies none to a date before the switch, when the device was right", () => {
    expect(driftForWall("2026-09-10T13:00", 60, stuck)).toBe(0);
  });

  it("keeps the current drift for an empty or unreadable value, and 0 stays 0", () => {
    expect(driftForWall("", 60, stuck)).toBe(60);
    expect(driftForWall("pas une date", 60, stuck)).toBe(60);
    expect(driftForWall("2026-10-08T18:06", 0, stuck)).toBe(0);
  });
});

describe("fieldDisplayWall / fieldLegalWall — what LabDateTimeInput shows and stores", () => {
  const stuck = () => 60;
  const behind = () => -60;

  it("a device one hour AHEAD: 19:06 read and typed → 18:06 legal, not « dans le futur »", () => {
    const stored = fieldLegalWall("2026-10-08T19:06", 60, stuck);
    expect(stored).toBe("2026-10-08T18:06");
    expect(futureFieldError("L'heure de fin", stored, NOW)).toBeNull();
    // Shown back as typed: one conversion each way, never two.
    expect(fieldDisplayWall(stored, 60, stuck)).toBe("2026-10-08T19:06");
  });

  it("a device one hour BEHIND: 17:06 typed → 18:06 legal", () => {
    expect(fieldLegalWall("2026-10-08T17:06", -60, behind)).toBe("2026-10-08T18:06");
    expect(fieldDisplayWall("2026-10-08T18:06", -60, behind)).toBe("2026-10-08T17:06");
  });

  it("crosses midnight both ways", () => {
    expect(fieldLegalWall("2026-10-09T00:30", 60, stuck)).toBe("2026-10-08T23:30");
    expect(fieldDisplayWall("2026-10-08T23:30", 60, stuck)).toBe("2026-10-09T00:30");
  });

  it("leaves a date before the switch alone (the device was right then)", () => {
    expect(fieldLegalWall("2026-09-10T13:00", 60, stuck)).toBe("2026-09-10T13:00");
    expect(fieldDisplayWall("2026-09-10T13:00", 60, stuck)).toBe("2026-09-10T13:00");
  });

  it("an up-to-date device and an empty field change nothing", () => {
    expect(fieldLegalWall("2026-10-08T18:06", 0)).toBe("2026-10-08T18:06");
    expect(fieldDisplayWall("2026-10-08T18:06", 0)).toBe("2026-10-08T18:06");
    expect(fieldLegalWall("", 60, stuck)).toBe("");
    expect(fieldDisplayWall("", 60, stuck)).toBe("");
  });
});

describe("legalClock", () => {
  it("gives HH:MM of the legal clock", () => {
    expect(legalClock(NOW)).toBe("18:06");
    expect(legalClock(BEFORE_SWITCH)).toBe("13:00");
  });
});

describe("futureFieldError", () => {
  it("refuses an hour more than 5 minutes ahead, in the form's words", () => {
    expect(futureFieldError("L'heure de fin", "2026-10-08T18:12", NOW)).toBe(
      "L'heure de fin est dans le futur : il est 18:06 (heure légale du Maroc). Vérifiez l'heure saisie."
    );
    // The typical mistake: the device's hour typed as is.
    expect(futureFieldError("L'heure d'arrivée", "2026-10-08T19:06", NOW)).toMatch(/^L'heure d'arrivée est dans le futur/);
    expect(futureFieldError("L'heure de fin", "2026-10-09T00:00", NOW)).not.toBeNull();
  });

  it("accepts the tolerance, the present and the past", () => {
    expect(futureFieldError("L'heure de fin", "2026-10-08T18:11", NOW)).toBeNull();
    expect(futureFieldError("L'heure de fin", "2026-10-08T18:06", NOW)).toBeNull();
    expect(futureFieldError("L'heure de fin", "2026-10-08T17:06", NOW)).toBeNull();
    expect(futureFieldError("L'heure de fin", "2026-09-10T13:00", NOW)).toBeNull();
  });

  it("takes another tolerance", () => {
    expect(futureFieldError("L'heure de fin", "2026-10-08T18:07", NOW, 0)).not.toBeNull();
    expect(futureFieldError("L'heure de fin", "2026-10-08T18:30", NOW, 30)).toBeNull();
  });

  it("says nothing on an empty or unreadable value", () => {
    expect(futureFieldError("L'heure de fin", "", NOW)).toBeNull();
    expect(futureFieldError("L'heure de fin", "pas une date", NOW)).toBeNull();
  });
});
