import { describe, it, expect } from "vitest";
import { addMonths, calibrationDue, isOutOfRange } from "./quality";
import {
  validateEquipment,
  validateCalibration,
  validateReading,
  validateEil,
} from "./quality-validation";

/**
 * Phase 7 arithmetic. A missed calibration or an unnoticed fridge excursion
 * is exactly what a quality audit looks for — the judges must be exact.
 */

describe("addMonths", () => {
  // Compare calendar days, not instants: Morocco changes UTC offset around
  // Ramadan, which shifts exact-time equality across months.
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

  it("adds calendar months, clamping the day at month end", () => {
    expect(ymd(addMonths(new Date(2026, 0, 15), 6))).toEqual([2026, 7, 15]);
    // Jan 31 + 1 month is the end of February, not March 3rd.
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toEqual([2026, 2, 28]);
  });
});

describe("calibrationDue", () => {
  const now = new Date("2026-08-27T10:00:00");

  it("an equipment without frequency has no schedule", () => {
    expect(calibrationDue(null, null, now)).toEqual({ state: "OK", dueDate: null });
  });

  it("a scheduled equipment never calibrated is flagged JAMAIS", () => {
    expect(calibrationDue(null, 12, now).state).toBe("JAMAIS");
  });

  it("flags overdue, due-soon (≤30 j) and comfortable schedules", () => {
    expect(calibrationDue(new Date("2025-07-01"), 12, now).state).toBe("RETARD");
    expect(calibrationDue(new Date("2025-09-10"), 12, now).state).toBe("BIENTOT");
    expect(calibrationDue(new Date("2026-08-01"), 12, now).state).toBe("OK");
  });

  it("returns the due date the register prints", () => {
    const { dueDate } = calibrationDue(new Date("2025-09-10"), 12, now);
    expect(dueDate).toEqual(addMonths(new Date("2025-09-10"), 12));
  });
});

describe("isOutOfRange", () => {
  it("judges against both bounds", () => {
    expect(isOutOfRange(5, 2, 8)).toBe(false);
    expect(isOutOfRange(1.9, 2, 8)).toBe(true);
    expect(isOutOfRange(8.1, 2, 8)).toBe(true);
  });

  it("handles open-sided bounds (freezer: only a max)", () => {
    expect(isOutOfRange(-25, null, -18)).toBe(false);
    expect(isOutOfRange(-15, null, -18)).toBe(true);
    expect(isOutOfRange(40, 37, null)).toBe(false);
    expect(isOutOfRange(36, 37, null)).toBe(true);
  });

  it("an unmonitored equipment can never be out of range", () => {
    expect(isOutOfRange(999, null, null)).toBe(false);
  });
});

describe("validateEquipment", () => {
  it("accepts a monitored, calibrated incubator", () => {
    const result = validateEquipment({
      name: "Étuve 37 °C",
      code: "E-001",
      calibrationFrequencyMonths: "12",
      tempMin: "35",
      tempMax: "39",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.calibrationFrequencyMonths).toBe(12);
      expect(result.value.tempMin).toBe(35);
    }
  });

  it("refuses inverted bounds and absurd frequencies", () => {
    expect(validateEquipment({ name: "X", tempMin: "10", tempMax: "5" }).ok).toBe(false);
    expect(validateEquipment({ name: "X", calibrationFrequencyMonths: "0" }).ok).toBe(false);
    expect(validateEquipment({ name: "X", calibrationFrequencyMonths: "1.5" }).ok).toBe(false);
  });

  it("empty frequency and bounds mean: not calibrated, not monitored", () => {
    const result = validateEquipment({ name: "Pipette P1000" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.calibrationFrequencyMonths).toBeNull();
      expect(result.value.tempMin).toBeNull();
    }
  });
});

describe("validateCalibration", () => {
  it("refuses future-dated calibrations", () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    expect(validateCalibration({ performedAt: future }).ok).toBe(false);
  });

  it("defaults the result to CONFORME", () => {
    const result = validateCalibration({ performedAt: "2026-08-01" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.result).toBe("CONFORME");
  });
});

describe("validateReading", () => {
  it("accepts a decimal-comma reading rounded to 0.1 °C", () => {
    const result = validateReading({ value: "4,26" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.value).toBe(4.3);
  });

  it("refuses implausible temperatures", () => {
    expect(validateReading({ value: "-200" }).ok).toBe(false);
    expect(validateReading({ value: "abc" }).ok).toBe(false);
    expect(validateReading({ value: "" }).ok).toBe(false);
  });

  it("refuses a remark beyond its column, in agreed French", () => {
    expect(validateReading({ value: "4", note: "r".repeat(192) })).toEqual({
      ok: false,
      error: "La remarque est trop longue (191 caractères max).",
    });
  });
});

describe("validateEil", () => {
  it("requires a name and defaults the status to PREVUE", () => {
    const result = validateEil({ name: "BIPEA microbiologie S2" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("PREVUE");
    expect(validateEil({ name: "" }).ok).toBe(false);
  });
});

/**
 * What the columns cannot hold (VARCHAR(191)) crashed the insert with a
 * server error; a day that does not exist (30/02) was stored on another day.
 */
describe("Système Qualité — what the columns cannot hold", () => {
  const long = "x".repeat(192);

  it("refuses an equipment code or location longer than its column", () => {
    expect(validateEquipment({ name: "Étuve", code: long }).ok).toBe(false);
    expect(validateEquipment({ name: "Étuve", location: long }).ok).toBe(false);
    expect(validateEquipment({ name: "Étuve", location: "x".repeat(191) }).ok).toBe(true);
  });

  it("refuses a calibration provider or certificate longer than its column, and a day that does not exist", () => {
    expect(validateCalibration({ performedAt: "2026-08-01", provider: long }).ok).toBe(false);
    expect(validateCalibration({ performedAt: "2026-08-01", certificate: long }).ok).toBe(false);
    expect(validateCalibration({ performedAt: "2026-02-30" }).ok).toBe(false);
    const ok = validateCalibration({ performedAt: "2026-02-28" });
    expect(ok.ok && ok.value.performedAt.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("refuses a reading note longer than its column", () => {
    expect(validateReading({ value: "4", note: long }).ok).toBe(false);
  });

  it("refuses an EIL text beyond its column, an impossible day, and results before the start", () => {
    expect(validateEil({ name: long }).ok).toBe(false);
    expect(validateEil({ name: "BIPEA", organizer: long }).ok).toBe(false);
    expect(validateEil({ name: "BIPEA", scope: long }).ok).toBe(false);
    expect(validateEil({ name: "BIPEA", outcome: long }).ok).toBe(false);
    expect(validateEil({ name: "BIPEA", startDate: "2026-13-01" }).ok).toBe(false);
    expect(validateEil({ name: "BIPEA", startDate: "2026-10-01", resultDate: "2026-09-01" }).ok).toBe(false);
    const ok = validateEil({ name: "BIPEA", startDate: "2026-09-01", resultDate: "2026-09-01" });
    expect(ok.ok && ok.value.startDate?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("free observations stay within their TEXT column (full-db 12/10: a 500)", () => {
  it("refuses a calibration or an EIL note over 5 000 characters", () => {
    const long = "n".repeat(5001);
    expect(validateCalibration({ performedAt: "2026-10-01", notes: long }).ok).toBe(false);
    expect(validateCalibration({ performedAt: "2026-10-01", notes: "n".repeat(5000) }).ok).toBe(true);
    expect(validateEil({ name: "BIPEA", notes: long }).ok).toBe(false);
  });
});

describe("a blank or non-numeric reading is never logged as 0 °C (full-db 12/10)", () => {
  it("refuses blanks and non-numbers, keeps real zeros", () => {
    expect(validateReading({ value: "   " }).ok).toBe(false);
    expect(validateReading({ value: [] }).ok).toBe(false);
    expect(validateReading({ value: true }).ok).toBe(false);
    expect(validateReading({ value: "0" }).ok).toBe(true);
    expect(validateReading({ value: 0 }).ok).toBe(true);
    expect(validateReading({ value: "-18,5" }).ok).toBe(true);
  });
});

describe("validateEquipment — plausible bounds", () => {
  // A bound of 1e308 °C was accepted: never reachable, and it printed
  // hundreds of digits across /qualite/metrologie on a phone.
  it("refuses a temperature bound outside -80 … 300 °C", () => {
    expect(validateEquipment({ name: "Étuve", tempMin: "2", tempMax: "1e308" }).ok).toBe(false);
    expect(validateEquipment({ name: "Étuve", tempMin: "-81" }).ok).toBe(false);
    expect(validateEquipment({ name: "Étuve", tempMax: "301" }).ok).toBe(false);
    expect(validateEquipment({ name: "Congélateur", tempMin: "-80", tempMax: "-18" }).ok).toBe(true);
    expect(validateEquipment({ name: "Four", tempMin: "250", tempMax: "300" }).ok).toBe(true);
  });
});
