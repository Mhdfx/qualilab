import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseReceivedAge,
  receivedAgeHref,
  receivedAgeLabel,
  receivedAgeText,
  receivedBefore,
  receivedDaysAgo,
} from "./received-age";

/**
 * G5 (18/10 re-ask 2.20 (k), « Oui » on 28/10): « Reçus depuis plus de N
 * jours » and « reçu il y a N j » — calendar days on the laboratory's clock
 * (UTC+0 in Morocco since 20/09/2026, `lab-time.ts`).
 */
const NOW = new Date("2026-11-01T09:00:00Z");

describe("receivedDaysAgo — calendar days, the laboratory's clock", () => {
  it("counts days, not hours", () => {
    expect(receivedDaysAgo(new Date("2026-11-01T00:05:00Z"), NOW)).toBe(0);
    expect(receivedDaysAgo(new Date("2026-10-31T23:50:00Z"), NOW)).toBe(1);
    expect(receivedDaysAgo(new Date("2026-10-31T00:10:00Z"), NOW)).toBe(1);
    expect(receivedDaysAgo(new Date("2026-10-28T12:00:00Z"), NOW)).toBe(4);
  });

  it("crosses a month and a year", () => {
    expect(receivedDaysAgo(new Date("2026-12-31T10:00:00Z"), new Date("2027-01-02T08:00:00Z"))).toBe(2);
  });

  it("never reads a future reception as negative", () => {
    expect(receivedDaysAgo(new Date("2026-11-02T10:00:00Z"), NOW)).toBe(0);
  });
});

describe("receivedBefore — the bound of « Reçus depuis plus de N jours »", () => {
  it("is midnight opening the day N days before today", () => {
    expect(receivedBefore(3, NOW).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(receivedBefore(0, NOW).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("agrees with receivedDaysAgo: before the bound ⇔ more than N days", () => {
    const bound = receivedBefore(3, NOW);
    for (const iso of ["2026-10-28T23:59:00Z", "2026-10-29T00:00:00Z", "2026-10-29T12:00:00Z", "2026-10-25T08:00:00Z"]) {
      const at = new Date(iso);
      expect(at < bound, iso).toBe(receivedDaysAgo(at, NOW) > 3);
    }
  });
});

describe("the address and the words", () => {
  it("reads N from 1 to 365, nothing else", () => {
    expect(parseReceivedAge("3")).toBe(3);
    expect(parseReceivedAge(" 10 ")).toBe(10);
    expect(parseReceivedAge(["7", "2"])).toBe(7);
    for (const raw of ["0", "", "-1", "2.5", "abc", "366", "1000", undefined, null]) {
      expect(parseReceivedAge(raw), String(raw)).toBeNull();
    }
  });

  it("says « reçu il y a N j » and the filter's label in French", () => {
    expect(receivedAgeText(0)).toBe("reçu aujourd'hui");
    expect(receivedAgeText(1)).toBe("reçu il y a 1 j");
    expect(receivedAgeText(12)).toBe("reçu il y a 12 j");
    expect(receivedAgeLabel(1)).toBe("Reçus depuis plus de 1 jour");
    expect(receivedAgeLabel(3)).toBe("Reçus depuis plus de 3 jours");
  });

  it("keeps the tile's view and the anchor", () => {
    expect(receivedAgeHref("/technicien", "en_analyse", 3, "analyses")).toBe("/technicien?vue=en_analyse&recus=3#analyses");
    expect(receivedAgeHref("/technicien", null, 3)).toBe("/technicien?recus=3");
    expect(receivedAgeHref("/technicien", "soumis", null, "#analyses")).toBe("/technicien?vue=soumis#analyses");
  });

  it("the bench page filters every list with the bound, and each row says its age", () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const page = read("../app/technicien/page.tsx");
    expect(page).toContain("parseReceivedAge(params[RECEIVED_AGE_PARAM])");
    expect(page).toContain("receivedAt: { lt: receivedBefore(age, now) }");
    expect(read("../components/technicien/WorkQueue.tsx")).toContain("receivedAgeText(receivedDaysAgo(item.receivedAt, now))");
  });
});
