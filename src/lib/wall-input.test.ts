import { describe, expect, it } from "vitest";
import { fieldDisplayWall, fieldLegalWall } from "./device-time";
import {
  DAY_INVALID,
  DAY_MISSING,
  MAX_YEAR,
  MIN_YEAR,
  TIME_INVALID,
  TIME_MISSING,
  TIME_TWELVE_HOUR,
  UNFOCUSED,
  caretAfterMask,
  combineWall,
  daysInMonth,
  formatDay,
  formatTime,
  keptValueNotice,
  maskDayText,
  maskTimeText,
  parseDayText,
  parseTimeText,
  partMessage,
  readWallParts,
  settleDayText,
  settleTimeText,
  splitWall,
  wallToSend,
  writtenInFull,
  type PartReading,
} from "./wall-input";

/**
 * Retour du laboratoire du 14/10 (« Remarque globale sur la date AM/PM par
 * 24h ») — the date-time field no longer depends on the device's language:
 * the day is typed « JJ/MM/AAAA », the hour « HH:MM » on 24 h, and only a
 * complete, real wall time ever reaches the form.
 */

/** Feeds `raw` one character at a time through `mask`, as a keyboard would. */
function typeInto(mask: (raw: string) => string, raw: string): string[] {
  const shown: string[] = [];
  let text = "";
  for (const ch of raw) {
    text = mask(text + ch);
    shown.push(text);
  }
  return shown;
}

const valid = (value: string): PartReading => ({ state: "valid", value });
const PARTIAL: PartReading = { state: "partial" };
const INVALID: PartReading = { state: "invalid" };
const TWELVE_HOUR: PartReading = { state: "invalid", twelveHour: true };
const EMPTY: PartReading = { state: "empty" };

/**
 * What the form holds after each pair of texts, as `LabDateTimeInput`
 * sends them: `wallToSend` when it gives a value, the value kept otherwise.
 */
function formValues(initial: string, texts: [day: string, time: string][]): string[] {
  let kept = initial;
  return texts.map(([day, time]) => {
    const sent = wallToSend(day, time);
    if (sent !== null) kept = sent;
    return kept;
  });
}

describe("maskDayText — the day as it is typed", () => {
  it("inserts the slashes by itself, on the digit that starts the next field", () => {
    expect(typeInto(maskDayText, "14102026")).toEqual([
      "1",
      "14",
      "14/1",
      "14/10",
      "14/10/2",
      "14/10/20",
      "14/10/202",
      "14/10/2026",
    ]);
  });

  it("drops the digits beyond the year", () => {
    expect(maskDayText("141020269")).toBe("14/10/2026");
  });

  it("lets Backspace through: a trailing slash is kept, then removed", () => {
    expect(maskDayText("14/")).toBe("14/");
    expect(maskDayText("14")).toBe("14");
    expect(maskDayText("14/10/")).toBe("14/10/");
  });

  it("closes a field early on a typed separator (« / », « - », « . », space)", () => {
    expect(maskDayText("1/2/2026")).toBe("1/2/2026");
    expect(maskDayText("1-2-2026")).toBe("1/2/2026");
    expect(maskDayText("1.2.2026")).toBe("1/2/2026");
    expect(maskDayText("14 10 2026")).toBe("14/10/2026");
  });

  it("ignores a separator with nothing before it, twice in a row, or in the year", () => {
    expect(maskDayText("/14")).toBe("14");
    expect(maskDayText("14//10")).toBe("14/10");
    expect(maskDayText("14/10/20/26")).toBe("14/10/2026");
  });

  it("closes a one-digit day 4–9 and a one-digit month 2–9 on the next digit", () => {
    expect(maskDayText("4102026")).toBe("4/10/2026");
    expect(maskDayText("1422026")).toBe("14/2/2026");
    expect(maskDayText("3")).toBe("3");
    expect(maskDayText("31")).toBe("31");
    expect(maskDayText("141")).toBe("14/1");
    expect(maskDayText("1410")).toBe("14/10");
  });

  it("drops letters and other characters", () => {
    expect(maskDayText("a1b4c")).toBe("14");
    expect(maskDayText("oct.")).toBe("");
  });

  it("turns a pasted ISO day around", () => {
    expect(maskDayText("2026-10-14")).toBe("14/10/2026");
    expect(maskDayText(" 2026-1-5 ")).toBe("5/1/2026");
  });
});

describe("maskTimeText — the hour as it is typed, on 24 h", () => {
  it("inserts « : » when the minutes start", () => {
    expect(typeInto(maskTimeText, "1230")).toEqual(["1", "12", "12:3", "12:30"]);
    expect(typeInto(maskTimeText, "0905")).toEqual(["0", "09", "09:0", "09:05"]);
  });

  it("starts the minutes after one digit when the hour is 3–9 (« 905 » → « 9:05 »)", () => {
    expect(typeInto(maskTimeText, "905")).toEqual(["9", "9:0", "9:05"]);
    expect(maskTimeText("345")).toBe("3:45");
  });

  it("keeps an hour 24 or more as typed, for parseTimeText to refuse — never 02:40", () => {
    expect(maskTimeText("2400")).toBe("24:00");
    expect(maskTimeText("25")).toBe("25");
  });

  it("drops the digits beyond the minutes", () => {
    expect(maskTimeText("12345")).toBe("12:34");
    expect(maskTimeText("12:345")).toBe("12:34");
  });

  it("reads « h » and « . » typed by habit as « : »", () => {
    expect(maskTimeText("9h30")).toBe("9:30");
    expect(maskTimeText("9H30")).toBe("9:30");
    expect(maskTimeText("9.30")).toBe("9:30");
    expect(maskTimeText("9:5")).toBe("9:5");
  });

  it("lets Backspace through the colon", () => {
    expect(maskTimeText("12:")).toBe("12:");
    expect(maskTimeText("12")).toBe("12");
    expect(maskTimeText("9:")).toBe("9:");
  });

  it("drops other letters and a second separator", () => {
    expect(maskTimeText("12::30")).toBe("12:30");
    expect(maskTimeText("1x2:3z0")).toBe("12:30");
  });

  it("keeps an « AM » / « PM » as typed, for parseTimeText to refuse — never 02:30 for 2:30 PM", () => {
    expect(maskTimeText("2:30 PM")).toBe("2:30 PM");
    expect(maskTimeText("2:30pm")).toBe("2:30pm");
    expect(maskTimeText("0230P")).toBe("0230P");
    expect(maskTimeText("9 am")).toBe("9 am");
    // typed key by key from the old English field's habit: « 0230 » then « P »
    expect(typeInto(maskTimeText, "0230PM")).toEqual(["0", "02", "02:3", "02:30", "02:30P", "02:30PM"]);
  });
});

describe("parseDayText — a real calendar day", () => {
  it("reads « JJ/MM/AAAA » as an ISO day", () => {
    expect(parseDayText("14/10/2026")).toEqual(valid("2026-10-14"));
    expect(parseDayText("01/01/2027")).toEqual(valid("2027-01-01"));
  });

  it("completes a one-digit day or month with a zero", () => {
    expect(parseDayText("1/2/2026")).toEqual(valid("2026-02-01"));
    expect(parseDayText("4/10/2026")).toEqual(valid("2026-10-04"));
  });

  it("reads what the mask would show (digits only, a pasted ISO day)", () => {
    expect(parseDayText("14102026")).toEqual(valid("2026-10-14"));
    expect(parseDayText("2026-10-14")).toEqual(valid("2026-10-14"));
    expect(parseDayText(" 14/10/2026 ")).toEqual(valid("2026-10-14"));
  });

  it("accepts the 29th of February on a leap year only", () => {
    expect(parseDayText("29/02/2028")).toEqual(valid("2028-02-29"));
    expect(parseDayText("29/02/2024")).toEqual(valid("2024-02-29"));
    expect(parseDayText("29/02/2000")).toEqual(valid("2000-02-29"));
    expect(parseDayText("29/02/2026")).toEqual(INVALID);
    expect(parseDayText("29/02/2027")).toEqual(INVALID);
  });

  it("refuses a day the month does not have", () => {
    expect(parseDayText("31/04/2026")).toEqual(INVALID);
    expect(parseDayText("31/06/2026")).toEqual(INVALID);
    expect(parseDayText("31/09/2026")).toEqual(INVALID);
    expect(parseDayText("31/11/2026")).toEqual(INVALID);
    expect(parseDayText("30/02/2028")).toEqual(INVALID);
    expect(parseDayText("31/02/2026")).toEqual(INVALID);
    expect(parseDayText("31/12/2026")).toEqual(valid("2026-12-31"));
    expect(parseDayText("30/04/2026")).toEqual(valid("2026-04-30"));
  });

  it("refuses a day or a month 0, a month 13", () => {
    expect(parseDayText("00/10/2026")).toEqual(INVALID);
    expect(parseDayText("14/00/2026")).toEqual(INVALID);
    expect(parseDayText("14/13/2026")).toEqual(INVALID);
    expect(parseDayText("32/10/2026")).toEqual(INVALID);
  });

  it(`keeps the year between ${MIN_YEAR} and ${MAX_YEAR}`, () => {
    expect(parseDayText("01/01/2000")).toEqual(valid("2000-01-01"));
    expect(parseDayText("31/12/2099")).toEqual(valid("2099-12-31"));
    expect(parseDayText("31/12/1999")).toEqual(INVALID);
    expect(parseDayText("14/10/1026")).toEqual(INVALID);
    expect(parseDayText("14/10/2206")).toEqual(INVALID);
    expect(parseDayText("01/01/2100")).toEqual(INVALID);
  });

  it("waits while the day can still become a real one", () => {
    for (const text of ["1", "3", "14", "14/", "14/1", "14/10", "14/10/", "14/10/2", "14/10/20", "14/10/202", "31/0", "31/1", "29/02", "29/02/202", "29/02/203"]) {
      expect(parseDayText(text), text).toEqual(PARTIAL);
    }
  });

  it("says at once when no keystroke can save it", () => {
    for (const text of ["32", "00", "0/", "14/13", "14/0/", "31/04", "30/02", "14/10/1", "14/10/21", "29/02/210", "31/04/20"]) {
      expect(parseDayText(text), text).toEqual(INVALID);
    }
  });

  it("is empty with nothing typed", () => {
    expect(parseDayText("")).toEqual(EMPTY);
    expect(parseDayText("   ")).toEqual(EMPTY);
    expect(parseDayText("//")).toEqual(EMPTY);
  });
});

describe("parseTimeText — 00:00 to 23:59", () => {
  it("reads « HH:MM »", () => {
    expect(parseTimeText("09:05")).toEqual(valid("09:05"));
    expect(parseTimeText("14:05")).toEqual(valid("14:05"));
  });

  it("accepts the whole day, midnight to 23:59", () => {
    expect(parseTimeText("00:00")).toEqual(valid("00:00"));
    expect(parseTimeText("12:00")).toEqual(valid("12:00"));
    expect(parseTimeText("23:59")).toEqual(valid("23:59"));
  });

  it("normalises « 9:5 » and « 905 » to 09:05", () => {
    expect(parseTimeText("9:5")).toEqual(valid("09:05"));
    expect(parseTimeText("905")).toEqual(valid("09:05"));
    expect(parseTimeText("9:05")).toEqual(valid("09:05"));
    expect(parseTimeText("0905")).toEqual(valid("09:05"));
    expect(parseTimeText("12:3")).toEqual(valid("12:03"));
    expect(parseTimeText("9h30")).toEqual(valid("09:30"));
  });

  it("refuses 24:00, minute 60 and every hour above 23", () => {
    expect(parseTimeText("24:00")).toEqual(INVALID);
    expect(parseTimeText("2400")).toEqual(INVALID);
    expect(parseTimeText("23:60")).toEqual(INVALID);
    expect(parseTimeText("12:75")).toEqual(INVALID);
    expect(parseTimeText("24")).toEqual(INVALID);
    expect(parseTimeText("99:00")).toEqual(INVALID);
  });

  it("waits for the minutes after the hours alone", () => {
    for (const text of ["0", "1", "2", "9", "12", "23", "12:", "9:"]) {
      expect(parseTimeText(text), text).toEqual(PARTIAL);
    }
  });

  it("refuses an hour with « AM » / « PM », never reinterpreted on 24 h", () => {
    for (const text of ["2:30 PM", "2:30 pm", "2:30 AM", "0230P", "02:30P", "14:30 PM", "9 am", "12a"]) {
      expect(parseTimeText(text), text).toEqual(TWELVE_HOUR);
    }
    expect(readWallParts("14/10/2026", "2:30 PM")).toMatchObject({ state: "incomplete", time: TWELVE_HOUR });
    expect(wallToSend("14/10/2026", "2:30 PM")).toBeNull();
  });

  it("still reads « h » typed by habit as the separator", () => {
    expect(parseTimeText("14h30")).toEqual(valid("14:30"));
    expect(parseTimeText("14H30")).toEqual(valid("14:30"));
  });

  it("is empty with nothing typed", () => {
    expect(parseTimeText("")).toEqual(EMPTY);
    expect(parseTimeText(" ")).toEqual(EMPTY);
  });
});

describe("daysInMonth", () => {
  it("follows the Gregorian calendar", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("formatDay / formatTime / splitWall / combineWall", () => {
  it("formats an ISO day as « JJ/MM/AAAA »", () => {
    expect(formatDay("2026-10-14")).toBe("14/10/2026");
    expect(formatDay("2028-02-29")).toBe("29/02/2028");
  });

  it("formats nothing that is not a real day", () => {
    expect(formatDay("")).toBe("");
    expect(formatDay("2026-02-29")).toBe("");
    expect(formatDay("2026-04-31")).toBe("");
    expect(formatDay("14/10/2026")).toBe("");
  });

  it("formats an hour on 24 h, nothing else", () => {
    expect(formatTime("09:05")).toBe("09:05");
    expect(formatTime("23:59")).toBe("23:59");
    expect(formatTime("24:00")).toBe("");
    expect(formatTime("9:05")).toBe("");
    expect(formatTime("")).toBe("");
  });

  it("splits a wall time into the two texts of the field", () => {
    expect(splitWall("2026-10-14T09:05")).toEqual({ day: "14/10/2026", time: "09:05" });
    expect(splitWall("2026-10-14T21:30:15")).toEqual({ day: "14/10/2026", time: "21:30" });
  });

  it("shows nothing for an empty or unreadable value, like the native field", () => {
    expect(splitWall("")).toEqual({ day: "", time: "" });
    expect(splitWall("2026-02-30T10:00")).toEqual({ day: "", time: "" });
    expect(splitWall("2026-10-14T24:00")).toEqual({ day: "", time: "" });
    expect(splitWall("14/10/2026 09:05")).toEqual({ day: "", time: "" });
  });

  it("joins a valid day and hour, nothing else", () => {
    expect(combineWall("2026-10-14", "09:05")).toBe("2026-10-14T09:05");
    expect(combineWall("2026-02-30", "09:05")).toBe("");
    expect(combineWall("2026-10-14", "24:00")).toBe("");
    expect(combineWall("", "")).toBe("");
  });

  it("reads back what it shows, for every hour of a day", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [0, 1, 30, 59]) {
        const wall = `2026-10-14T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        const { day, time } = splitWall(wall);
        expect(readWallParts(day, time)).toMatchObject({ state: "complete", wall });
      }
    }
  });
});

describe("readWallParts — only a complete wall time reaches the form", () => {
  it("is complete with a valid day and a valid hour", () => {
    expect(readWallParts("14/10/2026", "9:5")).toEqual({
      state: "complete",
      wall: "2026-10-14T09:05",
      day: valid("2026-10-14"),
      time: valid("09:05"),
    });
  });

  it("is empty only when both parts are", () => {
    expect(readWallParts("", "")).toEqual({ state: "empty", day: EMPTY, time: EMPTY });
  });

  it("is incomplete otherwise — never a wall time", () => {
    expect(readWallParts("14/10/2026", "")).toEqual({ state: "incomplete", day: valid("2026-10-14"), time: EMPTY });
    expect(readWallParts("", "09:05")).toEqual({ state: "incomplete", day: EMPTY, time: valid("09:05") });
    expect(readWallParts("14/10/20", "09:05")).toMatchObject({ state: "incomplete", day: PARTIAL });
    expect(readWallParts("31/04/2026", "09:05")).toMatchObject({ state: "incomplete", day: INVALID });
    expect(readWallParts("14/10/2026", "24:00")).toMatchObject({ state: "incomplete", time: INVALID });
  });
});

describe("writtenInFull / wallToSend — nothing read halfway through an edit reaches the form", () => {
  it("is in full only for « JJ/MM/AAAA » and « HH:MM », both valid", () => {
    expect(writtenInFull("14/10/2026", "09:05")).toBe(true);
    expect(writtenInFull("01/02/2026", "00:00")).toBe(true);
    for (const [day, time] of [
      ["1/2/2026", "09:05"],
      ["14/1/2026", "09:05"],
      ["14102026", "09:05"],
      ["2026-10-14", "09:05"],
      ["14/10/2026", "9:05"],
      ["14/10/2026", "9:5"],
      ["14/10/2026", "14:7"],
      ["14/10/2026", "0905"],
      ["14/10/2026", "9h05"],
      ["14/10/2026", "14:75"],
      ["14/13/2026", "09:05"],
      ["14/10/2026", ""],
      ["", ""],
    ]) {
      expect(writtenInFull(day, time), `${day} ${time}`).toBe(false);
    }
  });

  it("sends the wall time once both texts are in full, \"\" once both are cleared, nothing otherwise", () => {
    expect(wallToSend("14/10/2026", "09:05")).toBe("2026-10-14T09:05");
    expect(wallToSend("", "")).toBe("");
    expect(wallToSend("14/10/2026", "9:5")).toBeNull();
    expect(wallToSend("1/2/2026", "09:05")).toBeNull();
    expect(wallToSend("14/10/2026", "")).toBeNull();
    expect(wallToSend("14/10/20", "09:05")).toBeNull();
  });

  it("keeps the value from before when « 1475 » is typed (meant 14:57): never 14:07", () => {
    const texts = typeInto(maskTimeText, "1475").map((time): [string, string] => ["14/10/2026", time]);
    expect(texts.map(([, time]) => time)).toEqual(["1", "14", "14:7", "14:75"]);
    expect(formValues("2026-10-14T09:30", texts)).toEqual(Array(4).fill("2026-10-14T09:30"));
    expect(formValues("", texts)).toEqual(["", "", "", ""]);
  });

  it("keeps the month from before when « 14/10/2026 » is edited to « 14/1/2026 » then « 14/13/2026 »", () => {
    expect(formValues("2026-10-14T09:30", [["14/1/2026", "09:30"], ["14/13/2026", "09:30"]])).toEqual([
      "2026-10-14T09:30",
      "2026-10-14T09:30",
    ]);
  });

  it("keeps 09:30 when Backspace takes « 09:30 » to « 09:3 » then « 09: »: never 09:03", () => {
    expect(formValues("2026-10-14T09:30", [["14/10/2026", "09:3"], ["14/10/2026", "09:"]])).toEqual([
      "2026-10-14T09:30",
      "2026-10-14T09:30",
    ]);
  });

  it("sends a time typed in full at its last keystroke", () => {
    const texts = typeInto(maskTimeText, "1457").map((time): [string, string] => ["14/10/2026", time]);
    expect(formValues("", texts)).toEqual(["", "", "", "2026-10-14T14:57"]);
  });

  it("writes a short form out when its part is left, and sends it then", () => {
    expect(settleTimeText("9:5")).toBe("09:05");
    expect(settleTimeText("905")).toBe("09:05");
    expect(settleTimeText("14:7")).toBe("14:07");
    expect(settleDayText("1/2/2026")).toBe("01/02/2026");
    expect(settleDayText("14102026")).toBe("14/10/2026");
    expect(wallToSend("14/10/2026", settleTimeText("9:5"))).toBe("2026-10-14T09:05");
    expect(wallToSend(settleDayText("1/2/2026"), "09:05")).toBe("2026-02-01T09:05");
  });

  it("leaves an unfinished or refused text as typed when its part is left", () => {
    for (const time of ["9", "9:", "14:75", "24:00", "2:30 PM", ""]) expect(settleTimeText(time), time).toBe(time);
    for (const day of ["14/10/20", "31/04/2026", "14/13/2026", ""]) expect(settleDayText(day), day).toBe(day);
  });

  it("reads back in full every value it shows", () => {
    for (const wall of ["2026-10-14T09:05", "2026-01-01T00:00", "2028-02-29T23:59"]) {
      const { day, time } = splitWall(wall);
      expect(writtenInFull(day, time), wall).toBe(true);
      expect(wallToSend(day, time)).toBe(wall);
    }
  });
});

describe("partMessage — the message under each part", () => {
  const typing = { part: true, group: true };
  const inOtherPart = { part: false, group: true };

  it("says at once that a part can never be right, even while typing it", () => {
    expect(partMessage("day", INVALID, EMPTY, typing)).toBe(DAY_INVALID);
    expect(partMessage("time", INVALID, EMPTY, typing)).toBe(TIME_INVALID);
    expect(partMessage("day", parseDayText("31/04"), EMPTY, typing)).toBe(DAY_INVALID);
    expect(partMessage("time", parseTimeText("24"), EMPTY, typing)).toBe(TIME_INVALID);
  });

  it("lets an unfinished part be typed, and flags it once left", () => {
    const day = parseDayText("14/10/20");
    const time = parseTimeText("09:05");
    expect(partMessage("day", day, time, typing)).toBeNull();
    expect(partMessage("day", day, time, inOtherPart)).toBe(DAY_INVALID);
    expect(partMessage("day", day, time, UNFOCUSED)).toBe(DAY_INVALID);
    expect(partMessage("time", parseTimeText("9:"), parseDayText("14/10/2026"), inOtherPart)).toBe(TIME_INVALID);
  });

  it("flags an empty part beside a filled one once the whole field is left", () => {
    const day = parseDayText("14/10/2026");
    const time = parseTimeText("");
    expect(partMessage("time", time, day, inOtherPart)).toBeNull();
    expect(partMessage("time", time, day, UNFOCUSED)).toBe(TIME_MISSING);
    expect(partMessage("day", parseDayText(""), parseTimeText("09:05"), UNFOCUSED)).toBe(DAY_MISSING);
  });

  it("says nothing of a valid part or of an empty field", () => {
    const day = parseDayText("14/10/2026");
    const time = parseTimeText("09:05");
    expect(partMessage("day", day, time, UNFOCUSED)).toBeNull();
    expect(partMessage("time", time, day, UNFOCUSED)).toBeNull();
    expect(partMessage("day", parseDayText(""), parseTimeText(""), UNFOCUSED)).toBeNull();
    expect(partMessage("time", parseTimeText(""), parseDayText(""), UNFOCUSED)).toBeNull();
  });

  it("says at once that the hour is on 24 h when « AM » / « PM » is typed, even while typing it", () => {
    const day = parseDayText("14/10/2026");
    expect(partMessage("time", parseTimeText("2:30 PM"), day, typing)).toBe(TIME_TWELVE_HOUR);
    expect(partMessage("time", parseTimeText("02:30P"), day, UNFOCUSED)).toBe(TIME_TWELVE_HOUR);
    expect(partMessage("time", parseTimeText("24:00"), day, UNFOCUSED)).toBe(TIME_INVALID);
  });

  it("uses the laboratory's wording", () => {
    expect(DAY_INVALID).toBe("Date invalide (JJ/MM/AAAA)");
    expect(TIME_INVALID).toBe("Heure invalide (00:00 à 23:59)");
    expect(TIME_TWELVE_HOUR).toBe("Heure sur 24 h, sans AM/PM (ex. 14:30)");
  });
});

describe("keptValueNotice — what the form still holds under an unfinished entry", () => {
  it("names the value kept", () => {
    expect(keptValueNotice("2026-10-14T09:30")).toBe("Saisie non retenue : le champ garde le 14/10/2026 à 09:30.");
  });

  it("says the field stays empty when it was", () => {
    expect(keptValueNotice("")).toBe("Saisie non retenue : le champ reste vide.");
  });
});

describe("caretAfterMask — the caret stays where the user types", () => {
  it("follows the digits across an inserted slash or colon", () => {
    expect(caretAfterMask("141", 3, "14/1")).toBe(4);
    expect(caretAfterMask("123", 3, "12:3")).toBe(4);
    expect(caretAfterMask("905", 3, "9:05")).toBe(4);
  });

  it("goes after a separator the user has just typed", () => {
    expect(caretAfterMask("9h", 2, "9:")).toBe(2);
    expect(caretAfterMask("1-", 2, "1/")).toBe(2);
  });

  it("stays before a separator the mask puts back (Backspace on « / »)", () => {
    expect(caretAfterMask("1410", 2, "14/10")).toBe(2);
  });

  it("stays before a colon the mask puts back (Delete on « : »)", () => {
    expect(caretAfterMask("1230", 2, maskTimeText("1230"))).toBe(2);
  });

  it("goes to the start with no digit before it, to the end past the last kept digit", () => {
    expect(caretAfterMask("/1", 1, "1")).toBe(0);
    expect(caretAfterMask("14/10/20267", 11, "14/10/2026")).toBe(10);
  });
});

describe("with the device's drift (device-time.ts)", () => {
  /** A device still on UTC+1 after Morocco's return to GMT (20/09/2026). */
  const aheadOneHour = () => 60;

  it("shows the device's hour, and stores the legal one from the two texts", () => {
    const { day, time } = splitWall(fieldDisplayWall("2026-10-14T18:06", 60, aheadOneHour));
    expect({ day, time }).toEqual({ day: "14/10/2026", time: "19:06" });
    const reading = readWallParts(day, time);
    expect(reading.state).toBe("complete");
    if (reading.state === "complete") expect(fieldLegalWall(reading.wall, 60, aheadOneHour)).toBe("2026-10-14T18:06");
  });

  it("moves the day across midnight with the hour", () => {
    expect(splitWall(fieldDisplayWall("2026-10-14T23:30", 60, aheadOneHour))).toEqual({ day: "15/10/2026", time: "00:30" });
    const reading = readWallParts("15/10/2026", "00:30");
    if (reading.state !== "complete") throw new Error("expected a complete reading");
    expect(fieldLegalWall(reading.wall, 60, aheadOneHour)).toBe("2026-10-14T23:30");
  });

  it("converts nothing on an up-to-date device", () => {
    expect(splitWall(fieldDisplayWall("2026-10-14T18:06", 0))).toEqual({ day: "14/10/2026", time: "18:06" });
    expect(fieldLegalWall("2026-10-14T18:06", 0)).toBe("2026-10-14T18:06");
  });
});
